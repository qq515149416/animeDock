"""设置 TEST_DATABASE_URL 后验证真实会话事务、隐私与网页敏感标题 SQL。"""

from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.ai import agent
from app.ai.tools import ToolRunner
from app.db import Base
from app.models import Anime, ChatMessage
from app.routers import chat as chat_module
from app.services import search_service

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="需要 TEST_DATABASE_URL 的 PostgreSQL/pgvector 集成环境")


@pytest_asyncio.fixture
async def chat_db(monkeypatch: pytest.MonkeyPatch):
    """用专用 schema 隔离数据，同时保留生产中的独立事务连接。"""
    database_url = os.environ["TEST_DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
    admin_engine = create_async_engine(database_url)
    engine = None
    schema = "chat_" + uuid4().hex
    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
            await connection.execution_options(schema_translate_map={None: schema})
            await connection.run_sync(Base.metadata.create_all)
        engine = create_async_engine(database_url, connect_args={"server_settings": {"search_path": f"{schema},public"}})

        def factory() -> AsyncSession:
            return AsyncSession(bind=engine, expire_on_commit=False)

        monkeypatch.setattr(chat_module, "SessionLocal", factory)
        async with factory() as db:
            db.add_all([
                Anime(id=1, name="Safe Anime", name_cn="安全动画", aliases=["Safe Alias"], nsfw=False),
                Anime(id=2, name="Hidden Anime", name_cn="隐藏动画", aliases=["Hidden Alias"], nsfw=True),
            ])
            await db.commit()
            yield db
    finally:
        if engine is not None:
            await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin_engine.dispose()


@pytest.mark.asyncio
async def test_web_sensitive_title_alias_and_subject_id_queries_execute(chat_db: AsyncSession):
    runner = ToolRunner(chat_db, nsfw=False)
    assert await runner._contains_hidden_anime("关于 Hidden Alias 的消息") is True
    assert await runner._contains_hidden_anime("隐藏动画的续作新闻") is True
    assert await runner._contains_hidden_anime("https://bgm.tv/subject/2") is True
    assert await runner._contains_hidden_anime("https://example.org/anime/2?nsfw=true") is True
    assert await runner._contains_hidden_anime("Safe Anime 安全动画 https://bgm.tv/subject/1") is False


@pytest.mark.asyncio
async def test_stream_persists_and_session_routes_recheck_nsfw_and_owner(chat_db: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    class Stream:
        def __init__(self, payload: dict[str, Any]) -> None:
            self.payload = payload

        async def __aiter__(self):
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(**self.payload))])

        async def close(self) -> None:
            return None

    class Completions:
        def __init__(self) -> None:
            self.count = 0

        async def create(self, **kwargs: Any) -> Stream:
            self.count += 1
            if self.count == 1:
                return Stream({"content": None, "tool_calls": [SimpleNamespace(index=0, id="detail_2", function=SimpleNamespace(name="get_anime_detail", arguments='{"anime_id":2}'))]})
            return Stream({"content": "隐藏动画的站内详情。", "tool_calls": None})

    class Client:
        def __init__(self, **kwargs: Any) -> None:
            self.chat = SimpleNamespace(completions=Completions())

        async def close(self) -> None:
            return None

    async def no_limit(*args: Any) -> None:
        return None

    async def people(anime_id: int):
        return [], [], True

    monkeypatch.setattr(chat_module, "check_rate_limit", no_limit)
    monkeypatch.setattr(agent, "AsyncOpenAI", Client)
    monkeypatch.setattr(agent, "get_settings", lambda: SimpleNamespace(llm_api_key="test", llm_base_url="https://example.org", llm_model="test", request_timeout=5))
    monkeypatch.setattr(search_service, "_subject_people", people)
    client_id = uuid4()
    response = await chat_module.chat(chat_module.ChatRequest(client_id=client_id, message="介绍隐藏动画", nsfw=True), chat_db)
    frames = [frame async for frame in response.body_iterator]
    assert any("event: done" in frame for frame in frames)
    sessions = await chat_module.list_sessions(client_id, True, chat_db)
    assert len(sessions) == 1
    session_id = sessions[0]["id"]
    messages = (await chat_db.scalars(select(ChatMessage).order_by(ChatMessage.id))).all()
    assert [message.role for message in messages] == ["user", "assistant"]
    assert messages[1].content == "隐藏动画的站内详情。"
    assert messages[1].anime_refs == [2]
    assert messages[1].sources[0]["url"] == "/anime/2?nsfw=true"
    hidden = await chat_module.get_session(session_id, client_id, False, chat_db)
    assert hidden["title"] == "敏感内容会话" and hidden["anime_refs"] == []
    assert all("隐藏动画" not in message["content"] for message in hidden["messages"])
    with pytest.raises(HTTPException) as error:
        await chat_module.delete_session(session_id, uuid4(), chat_db)
    assert error.value.status_code == 404
    assert await chat_module.delete_session(session_id, client_id, chat_db) == {"deleted": True}
    assert await chat_db.scalar(select(func.count()).select_from(ChatMessage)) == 0
