"""持久化匿名会话及可停止的 SSE 番剧助手。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import aclosing
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agent import encode_sse, run_agent
from app.ai.tools import ToolRunner
from app.db import SessionLocal, get_db
from app.deps import check_rate_limit
from app.models import Anime, ChatMessage, ChatSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["聊天助手"])
HIDDEN_MESSAGE = "此消息在开启 NSFW 时生成，开启后可查看。"
_persistence_tasks: set[asyncio.Task[bool]] = set()


class ChatRequest(BaseModel):
    """前端匿名客户端的单轮提问。"""

    model_config = ConfigDict(extra="forbid")
    session_id: UUID | None = None
    client_id: UUID
    message: str = Field(min_length=1, max_length=8000)
    nsfw: bool = False

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        """拒绝全空白消息，避免建立无意义会话。"""
        value = value.strip()
        if not value:
            raise ValueError("消息不能为空")
        return value


class SourceResponse(BaseModel):
    type: Literal["site", "web"]
    title: str
    url: str


class AnimeReferenceResponse(BaseModel):
    id: int
    name: str = ""
    name_cn: str = ""
    image_url: str | None = None
    score: float | None = None
    nsfw: bool = False


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    tool_calls: list[dict[str, Any]] | dict[str, Any] | None = None
    sources: list[SourceResponse] = Field(default_factory=list)
    anime_refs: list[int] = Field(default_factory=list)
    created_at: datetime | None = None


class SessionResponse(BaseModel):
    id: UUID
    client_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class SessionDetailResponse(SessionResponse):
    messages: list[MessageResponse]
    anime_refs: list[AnimeReferenceResponse] = Field(default_factory=list)


class DeleteSessionResponse(BaseModel):
    deleted: bool


def is_sensitive_message(message: Any, nsfw: bool, allowed_ids: set[int]) -> bool:
    """关闭 NSFW 后隐藏曾开启时的文本，以及含隐藏引用的旧记录。"""
    if nsfw:
        return False
    metadata = message.tool_calls
    return (
        isinstance(metadata, dict) and bool(metadata.get("request_nsfw"))
    ) or bool(set(message.anime_refs or []) - allowed_ids)


def message_payload(message: Any, nsfw: bool, allowed_ids: set[int], *, force_hidden: bool = False) -> dict[str, Any]:
    """构建安全的会话消息，隐藏文本同时隐藏参数、链接和引用。"""
    hidden = force_hidden or is_sensitive_message(message, nsfw, allowed_ids)
    calls = message.tool_calls
    if isinstance(calls, dict):
        calls = calls.get("calls")
    return {
        "id": message.id, "role": message.role,
        "content": HIDDEN_MESSAGE if hidden else message.content,
        "tool_calls": None if hidden else calls,
        "sources": [] if hidden else message.sources or [],
        "anime_refs": [] if hidden else [anime_id for anime_id in message.anime_refs or [] if anime_id in allowed_ids],
        "created_at": message.created_at,
    }


def message_payloads(messages: list[Any], nsfw: bool, allowed_ids: set[int]) -> list[dict[str, Any]]:
    """同时保护旧数据里未保存策略标记的敏感轮次原始提问。"""
    hidden_indices = {index for index, message in enumerate(messages) if is_sensitive_message(message, nsfw, allowed_ids)}
    for index in tuple(hidden_indices):
        if messages[index].role != "assistant":
            continue
        for previous in range(index - 1, -1, -1):
            if messages[previous].role == "user":
                hidden_indices.add(previous)
                break
    return [message_payload(message, nsfw, allowed_ids, force_hidden=index in hidden_indices) for index, message in enumerate(messages)]


async def require_owned_session(db: AsyncSession, session_id: UUID, client_id: str) -> ChatSession:
    """所有读取、继续和删除都必须验证客户端归属，统一返回 404。"""
    session = await db.get(ChatSession, session_id)
    if session is None or session.client_id != client_id:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "会话不存在。"})
    return session


async def allowed_anime(db: AsyncSession, messages: list[Any], nsfw: bool) -> dict[int, Anime]:
    """重新查询引用权限，防止敏感标记变更后历史记录仍泄漏。"""
    ids = {anime_id for message in messages for anime_id in message.anime_refs or []}
    if not ids:
        return {}
    statement = select(Anime).where(Anime.id.in_(ids))
    if not nsfw:
        statement = statement.where(Anime.nsfw.is_(False))
    rows = (await db.execute(statement)).scalars().all()
    return {item.id: item for item in rows}


def session_payload(session: ChatSession, hidden: bool = False) -> dict[str, Any]:
    """会话标题也遵守当前的可见性策略。"""
    return {
        "id": session.id, "client_id": session.client_id,
        "title": "敏感内容会话" if hidden else session.title,
        "created_at": session.created_at, "updated_at": session.updated_at,
    }


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    client_id: UUID = Query(...), nsfw: bool = False, db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """列出当前客户端的最近一百个会话。"""
    sessions = (await db.execute(select(ChatSession).where(ChatSession.client_id == str(client_id)).order_by(ChatSession.updated_at.desc()).limit(100))).scalars().all()
    if not sessions:
        return []
    rows = (await db.execute(select(ChatMessage.session_id, ChatMessage.tool_calls, ChatMessage.anime_refs).where(ChatMessage.session_id.in_([item.id for item in sessions])))).all()
    allowed = await allowed_anime(db, rows, nsfw)
    hidden_ids = {row.session_id for row in rows if is_sensitive_message(row, nsfw, set(allowed))}
    return [session_payload(item, item.id in hidden_ids) for item in sessions]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: UUID, client_id: UUID = Query(...), nsfw: bool = False,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """读取归属校验后的会话，并重新过滤历史消息及卡片。"""
    session = await require_owned_session(db, session_id, str(client_id))
    messages = (await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at, ChatMessage.id))).scalars().all()
    allowed = await allowed_anime(db, messages, nsfw)
    payloads = message_payloads(messages, nsfw, set(allowed))
    visible_refs = {anime_id for message in payloads for anime_id in message["anime_refs"]}
    return {
        **session_payload(session, any(is_sensitive_message(message, nsfw, set(allowed)) for message in messages)),
        "messages": payloads,
        "anime_refs": [{key: getattr(item, key) for key in ("id", "name", "name_cn", "image_url", "score", "nsfw")} for item in allowed.values() if item.id in visible_refs],
    }


@router.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
async def delete_session(
    session_id: UUID, client_id: UUID = Query(...), db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """删除当前客户端的会话及其消息。"""
    session = await require_owned_session(db, session_id, str(client_id))
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    await db.delete(session)
    await db.commit()
    return {"deleted": True}


async def persist_assistant(
    session_id: UUID, content: str, runner: ToolRunner, calls: list[dict[str, Any]], status: str,
) -> bool:
    """独立事务保存完成、失败或被停止的回复，避免响应取消回滚内容。"""
    try:
        async with SessionLocal() as db:
            session = await db.get(ChatSession, session_id)
            if session is None:
                return True
            db.add(ChatMessage(
                session_id=session_id, role="assistant", content=content or ("生成已停止。" if status == "cancelled" else "未生成回复，请稍后重试。"),
                tool_calls={"request_nsfw": runner.nsfw, "status": status, "calls": calls},
                sources=runner.sources, anime_refs=list(runner.anime_refs),
            ))
            session.updated_at = datetime.now(timezone.utc)
            await db.commit()
            return True
    except Exception:
        logger.exception("chat_persistence_failed", extra={"session_id": str(session_id)})
        return False


async def chat_stream(
    session_id: UUID, message: str, history: list[dict[str, str]], nsfw: bool,
) -> AsyncIterator[str]:
    """响应流断开时关闭上游，并在独立任务中保存已有文字。"""
    parts: list[str] = []
    calls: list[dict[str, Any]] = []
    status = "cancelled"
    persisted: bool | None = None
    async with SessionLocal() as db:
        runner = ToolRunner(db, nsfw=nsfw, user_message=message)
        try:
            yield encode_sse("session", {"session_id": str(session_id)})
            async with aclosing(run_agent(db, message, history, nsfw, runner=runner)) as events:
                async for event in events:
                    if event["event"] == "token":
                        parts.append(event["data"]["content"])
                    elif event["event"] == "tool_start":
                        calls.append(event["data"])
                    elif event["event"] == "error":
                        status = "error"
                        if not parts:
                            parts.append(event["data"]["message"])
                    elif event["event"] == "done":
                        status = "completed"
                        continue
                    yield encode_sse(event["event"], event["data"])
        finally:
            task = asyncio.create_task(persist_assistant(session_id, "".join(parts), runner, calls, status))
            _persistence_tasks.add(task)
            task.add_done_callback(_persistence_tasks.discard)
            # Task 保留强引用；即使 ASGI 取消当前生成器，独立事务仍可完成。
            persisted = await asyncio.shield(task)
    if status == "completed":
        if persisted is False:
            yield encode_sse("error", {"code": "CHAT_PERSIST_FAILED", "message": "回复已生成，但保存失败，请稍后重试。"})
        else:
            yield encode_sse("done", {})


@router.post("", response_class=StreamingResponse, responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}, "description": "session、tool_start、tool_end、token、anime_refs、sources、done 或 error 事件流"}})
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    """校验会话、限流并保存提问，然后流式生成真实模型回复。"""
    client_id = str(body.client_id)
    await check_rate_limit("chat:" + client_id, 10)
    if body.session_id:
        session = await require_owned_session(db, body.session_id, client_id)
    else:
        session = ChatSession(id=uuid4(), client_id=client_id, title=body.message[:80])
        db.add(session)
        await db.flush()
    previous = (await db.execute(select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(10))).scalars().all()
    previous.reverse()
    allowed = await allowed_anime(db, previous, body.nsfw)
    history = [{"role": item["role"], "content": item["content"]} for item in message_payloads(previous, body.nsfw, set(allowed))]
    db.add(ChatMessage(
        session_id=session.id, role="user", content=body.message,
        tool_calls={"request_nsfw": body.nsfw}, sources=[], anime_refs=[],
    ))
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return StreamingResponse(
        chat_stream(session.id, body.message, history, body.nsfw), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
