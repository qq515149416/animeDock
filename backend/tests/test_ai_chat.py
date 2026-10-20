"""验证聊天工具策略、流式协议和会话隐私边界。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.ai.agent import encode_sse, run_agent
from app.ai.tools import ToolRunner
from app.routers.chat import ChatRequest, message_payload, require_owned_session


def anime(anime_id: int, *, nsfw: bool = False) -> dict:
    return {
        "id": anime_id, "name": f"Anime {anime_id}", "name_cn": f"动画 {anime_id}",
        "summary": "简" * 300, "image_url": "https://example.org/cover.jpg",
        "score": 8.2, "nsfw": nsfw,
    }


@pytest.mark.asyncio
async def test_tools_cannot_override_server_nsfw_and_do_not_emit_hidden_refs(monkeypatch):
    async def search(db, **kwargs):
        assert kwargs["nsfw"] is False
        return {"items": [anime(1), anime(2, nsfw=True)], "total": 2, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    runner = ToolRunner(object(), nsfw=False, user_message="推荐动画")
    result = await runner.execute("search_anime", {"q": "动画", "nsfw": True})
    assert [item["id"] for item in result["items"]] == [1]
    assert len(result["items"][0]["summary"]) == 200
    assert list(runner.anime_refs) == [1]
    assert runner.sources == [{"type": "site", "title": "动画 1", "url": "/anime/1?nsfw=false"}]


@pytest.mark.asyncio
async def test_compaction_preserves_complete_cover_urls(monkeypatch):
    url = "https://example.org/cover.jpg?signature=" + "x" * 240

    async def search(*args, **kwargs):
        return {"items": [{**anime(1), "image_url": url}], "total": 1}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    runner = ToolRunner(object(), nsfw=False)
    result = await runner.execute("search_anime", {})
    assert result["items"][0]["image_url"] == url
    assert runner.anime_refs[1]["image_url"] == url


@pytest.mark.asyncio
async def test_web_requires_site_attempt_even_for_news_and_regular_lookup_needs_empty_result(monkeypatch):
    runner = ToolRunner(object(), nsfw=False, user_message="最新续作消息")
    assert (await runner.execute("web_search", {"query": "续作"}))["code"] == "SITE_FIRST"

    async def search(db, **kwargs):
        return {"items": [anime(1)], "total": 1, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    regular = ToolRunner(object(), nsfw=False, user_message="这部作品的评分")
    await regular.execute("search_anime", {"q": "动画"})
    assert (await regular.execute("web_search", {"query": "评分"}))["code"] == "SITE_SUFFICIENT"


@pytest.mark.asyncio
async def test_hidden_nested_detail_and_injected_tool_arguments_are_filtered(monkeypatch):
    async def detail(db, anime_id, nsfw):
        return {**anime(1), "relations": [anime(2, nsfw=True), anime(3)]}

    monkeypatch.setattr("app.ai.tools.search_service.get_anime_detail", detail)
    runner = ToolRunner(object(), nsfw=False)
    result = await runner.execute("get_anime_detail", {"anime_id": 1})
    assert [item["id"] for item in result["relations"]] == [3]
    assert 2 not in runner.anime_refs
    assert (await runner.execute("search_anime", {"unexpected": "payload"}))["code"] == "INVALID_ARGUMENTS"


@pytest.mark.asyncio
async def test_nsfw_block_cannot_be_bypassed_by_web_fallback(monkeypatch):
    async def detail(*args, **kwargs):
        raise HTTPException(status_code=403, detail={"code": "NSFW_BLOCKED"})

    monkeypatch.setattr("app.ai.tools.search_service.get_anime_detail", detail)
    runner = ToolRunner(object(), nsfw=False, user_message="介绍这部作品")
    await runner.execute("get_anime_detail", {"anime_id": 2})
    result = await runner.execute("web_search", {"query": "这部作品"})
    assert result["code"] == "NSFW_BLOCKED" and runner.sources == []


@pytest.mark.asyncio
async def test_web_filters_known_hidden_titles_adult_results_and_unsafe_urls(monkeypatch):
    from app.ai import tools as tools_module

    class DB:
        async def scalar(self, statement):
            values = statement.compile().params.values()
            return 2 if any("隐藏作品" in str(value) for value in values) else None

    async def search(*args, **kwargs):
        return {"items": [], "total": 0, "facets": {}}

    def handle(request):
        assert json.loads(request.content)["safe_search"] is True
        assert request.headers["Authorization"] == "Bearer test-key"
        return httpx.Response(200, json={"results": [
            {"title": "安全新闻", "url": "https://example.org/news", "content": "官方已发布续作消息。"},
            {"title": "隐藏作品", "url": "https://example.org/hidden", "content": "某部未标记的作品。"},
            {"title": "R18 成人动画", "url": "https://example.org/adult", "content": "内容"},
            {"title": "不安全链接", "url": "javascript:alert(1)", "content": "内容"},
        ]})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(tools_module.search_service, "search_anime", search)
    monkeypatch.setattr(tools_module, "get_settings", lambda: SimpleNamespace(web_search_enabled=True, tavily_api_key="test-key", request_timeout=5))
    monkeypatch.setattr(tools_module.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(handle), **kwargs))
    runner = ToolRunner(DB(), nsfw=False, user_message="续作消息")
    await runner.execute("search_anime", {"q": "新闻"})
    result = await runner.execute("web_search", {"query": "续作消息"})
    assert [item["title"] for item in result["items"]] == ["安全新闻"]
    assert runner.sources == [{"type": "web", "title": "安全新闻", "url": "https://example.org/news"}]


@pytest.mark.asyncio
async def test_semantic_and_calendar_enforce_same_nsfw_policy(monkeypatch):
    async def semantic(db, query, top_k, nsfw):
        assert nsfw is False
        return [anime(1), anime(2, nsfw=True)]

    async def calendar(db, nsfw):
        assert nsfw is False
        return [{"weekday": 3, "items": [anime(3), anime(4, nsfw=True)]}]

    monkeypatch.setattr("app.ai.tools.embedding_service.semantic_search", semantic)
    monkeypatch.setattr("app.ai.tools.calendar_service.get_calendar", calendar)
    runner = ToolRunner(object(), nsfw=False)
    semantic_result = await runner.execute("semantic_search", {"query": "治愈", "nsfw": True})
    calendar_result = await runner.execute("get_calendar", {"weekday": 3, "nsfw": True})
    assert [item["id"] for item in semantic_result["items"]] == [1]
    assert [item["id"] for item in calendar_result["items"]] == [3]
    assert set(runner.anime_refs) == {1, 3}


def test_sse_frame_preserves_multiline_chinese_as_one_json_event():
    frame = encode_sse("token", {"content": "你好\n世界"})
    assert frame.startswith("event: token\ndata: ") and frame.endswith("\n\n")
    assert json.loads(frame.split("data: ", 1)[1]) == {"content": "你好\n世界"}


class FakeStream:
    def __init__(self, chunks):
        self.chunks = chunks
        self.closed = False

    async def __aiter__(self):
        for delta in self.chunks:
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(**delta))])

    async def close(self):
        self.closed = True


class FakeCompletions:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return FakeStream(next(self.responses))


@pytest.mark.asyncio
async def test_agent_reassembles_fragmented_function_calls_and_streams_grounded_refs(monkeypatch):
    async def search(db, **kwargs):
        return {"items": [anime(1)], "total": 1, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    calls = [
        {"content": None, "tool_calls": [SimpleNamespace(index=0, id="call_1", function=SimpleNamespace(name="search_anime", arguments='{"q":'))]},
        {"content": None, "tool_calls": [SimpleNamespace(index=0, id=None, function=SimpleNamespace(name=None, arguments='"治愈"}'))]},
    ]
    completions = FakeCompletions([calls, [{"content": "推荐动画 1", "tool_calls": None}]])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    events = [event async for event in run_agent(object(), "推荐治愈动画", [], False, client=client)]
    assert [event["event"] for event in events] == ["tool_start", "tool_end", "token", "anime_refs", "sources", "done"]
    assert events[2]["data"] == {"content": "推荐动画 1"}
    assert events[3]["data"]["items"][0]["id"] == 1
    assert completions.requests[1]["messages"][-1]["role"] == "tool"
    assert json.loads(completions.requests[1]["messages"][-1]["content"])["items"][0]["id"] == 1


@pytest.mark.asyncio
async def test_agent_requires_site_tools_and_suppresses_unsupported_initial_facts(monkeypatch):
    async def search(*args, **kwargs):
        return {"items": [anime(1)], "total": 1, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    completions = FakeCompletions([
        [{"content": "这部动画的评分为 9.9 分", "tool_calls": None}],
        [{"content": "站内评分为 8.2 分", "tool_calls": None}],
    ])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    events = [event async for event in run_agent(object(), "这部动画的评分", [], False, client=client)]
    tokens = "".join(event["data"]["content"] for event in events if event["event"] == "token")
    assert tokens == "站内评分为 8.2 分"
    assert completions.requests[0]["tool_choice"] == "required"
    assert all(tool["function"]["name"] != "web_search" for tool in completions.requests[0]["tools"])
    assert completions.requests[1]["messages"][-1]["role"] == "tool"


@pytest.mark.asyncio
async def test_agent_stops_tool_rounds_and_honestly_reports_missing_key(monkeypatch):
    monkeypatch.setattr("app.ai.agent.get_settings", lambda: SimpleNamespace(llm_api_key="", llm_model="test", llm_base_url="https://example.org"))
    events = [event async for event in run_agent(object(), "你好", [], False)]
    assert events == [{"event": "error", "data": {"code": "LLM_NOT_CONFIGURED", "message": "AI 服务尚未配置，请设置 LLM_API_KEY。"}}]


@pytest.mark.asyncio
async def test_repeated_tool_calls_are_bounded_and_last_round_forbids_tools(monkeypatch):
    async def search(db, **kwargs):
        return {"items": [], "total": 0, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    call = {"content": None, "tool_calls": [SimpleNamespace(index=0, id="call_1", function=SimpleNamespace(name="search_anime", arguments="{}"))]}
    completions = FakeCompletions([[call]] * 5)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    events = [event async for event in run_agent(object(), "动画", [], False, client=client)]
    assert events[-1]["event"] == "error" and events[-1]["data"]["code"] == "TOOL_LIMIT"
    assert len(completions.requests) == 5 and completions.requests[-1]["tool_choice"] == "none"


@pytest.mark.asyncio
async def test_closing_stream_persists_partial_reply(monkeypatch):
    from app.routers import chat as chat_module

    class DBContext:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *args):
            return None

    async def events(*args, **kwargs):
        yield {"event": "token", "data": {"content": "已生成的部分"}}
        yield {"event": "done", "data": {}}

    saved = []

    async def persist(session_id, content, runner, calls, status):
        saved.append({"content": content, "status": status})

    monkeypatch.setattr(chat_module, "SessionLocal", DBContext)
    monkeypatch.setattr(chat_module, "run_agent", events)
    monkeypatch.setattr(chat_module, "persist_assistant", persist)
    stream = chat_module.chat_stream(uuid4(), "提问", [], False)
    assert "event: session" in await anext(stream)
    assert "已生成的部分" in await anext(stream)
    await stream.aclose()
    assert saved == [{"content": "已生成的部分", "status": "cancelled"}]


@pytest.mark.asyncio
async def test_history_context_is_limited_to_ten_messages(monkeypatch):
    async def search(*args, **kwargs):
        return {"items": [], "total": 0, "facets": {}}

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    completions = FakeCompletions([[{"content": "你好", "tool_calls": None}]] * 2)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    history = [{"role": "user", "content": str(index)} for index in range(20)]
    _ = [event async for event in run_agent(object(), "当前问题", history, False, client=client)]
    contexts = completions.requests[0]["messages"]
    assert len(contexts) == 12 and contexts[1] == {"role": "user", "content": "10"}


@pytest.mark.asyncio
async def test_done_is_sent_after_assistant_transaction_finishes(monkeypatch):
    from app.routers import chat as chat_module

    class DBContext:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *args):
            return None

    async def events(*args, **kwargs):
        yield {"event": "token", "data": {"content": "回答"}}
        yield {"event": "done", "data": {}}

    saved = []

    async def persist(*args):
        saved.append(True)

    monkeypatch.setattr(chat_module, "SessionLocal", DBContext)
    monkeypatch.setattr(chat_module, "run_agent", events)
    monkeypatch.setattr(chat_module, "persist_assistant", persist)
    stream = chat_module.chat_stream(uuid4(), "提问", [], False)
    try:
        await anext(stream)
        await anext(stream)
        assert "event: done" in await anext(stream)
        assert saved == [True]
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_unowned_and_missing_sessions_return_same_not_found():
    class DB:
        async def get(self, model, session_id):
            return SimpleNamespace(client_id=str(uuid4()))

    with pytest.raises(HTTPException) as exc:
        await require_owned_session(DB(), uuid4(), str(uuid4()))
    assert exc.value.status_code == 404


def test_request_rejects_invalid_uuid_and_blank_messages():
    with pytest.raises(ValidationError):
        ChatRequest(client_id="any-string", message="test", nsfw=False)
    with pytest.raises(ValidationError):
        ChatRequest(client_id=str(uuid4()), session_id="bad", message="test", nsfw=False)
    with pytest.raises(ValidationError):
        ChatRequest(client_id=str(uuid4()), message="  ", nsfw=False)


def test_sensitive_history_hides_text_tool_calls_and_external_sources():
    message = SimpleNamespace(
        id=1, role="assistant", content="隐藏作品的剧情", tool_calls={"request_nsfw": True, "calls": []},
        sources=[{"type": "web", "title": "隐藏标题", "url": "https://example.org/adult"}],
        anime_refs=[2], created_at=None,
    )
    payload = message_payload(message, nsfw=False, allowed_ids=set())
    assert payload["content"] == "此消息在开启 NSFW 时生成，开启后可查看。"
    assert payload["anime_refs"] == [] and payload["sources"] == [] and payload["tool_calls"] is None
    assert message_payload(message, nsfw=True, allowed_ids={2})["content"] == "隐藏作品的剧情"


@pytest.mark.asyncio
async def test_legacy_hidden_assistant_also_hides_the_original_user_question():
    from app.routers.chat import get_session

    session_id, client_id = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    messages = [
        SimpleNamespace(id=1, role="user", content="介绍隐藏作品", tool_calls=None, sources=[], anime_refs=[], created_at=now),
        SimpleNamespace(id=2, role="assistant", content="隐藏作品的简介", tool_calls=[], sources=[], anime_refs=[2], created_at=now),
    ]

    class Result:
        def __init__(self, values):
            self.values = values

        def scalars(self):
            return self

        def all(self):
            return self.values

    class DB:
        def __init__(self):
            self.results = iter([Result(messages), Result([])])

        async def get(self, model, key):
            return SimpleNamespace(id=session_id, client_id=str(client_id), title="隐藏作品", created_at=now, updated_at=now)

        async def execute(self, statement):
            return next(self.results)

    result = await get_session(session_id, client_id, False, DB())
    assert result["title"] == "敏感内容会话"
    assert all(item["content"] == "此消息在开启 NSFW 时生成，开启后可查看。" for item in result["messages"])


@pytest.mark.asyncio
async def test_chat_http_routes_require_valid_client_ownership(monkeypatch):
    from fastapi import FastAPI
    from app.routers import chat as chat_module
    from app.db import get_db

    class DB:
        async def get(self, model, session_id):
            return SimpleNamespace(client_id=str(uuid4()))

    async def database():
        yield DB()

    async def no_limit(*args):
        return None

    app = FastAPI()
    app.include_router(chat_module.router, prefix="/api")
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(chat_module, "check_rate_limit", no_limit)
    session_id, client_id = uuid4(), uuid4()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get(f"/api/chat/sessions/{session_id}")).status_code == 422
        assert (await client.get(f"/api/chat/sessions/{session_id}?client_id={client_id}")).status_code == 404
        assert (await client.delete(f"/api/chat/sessions/{session_id}?client_id={client_id}")).status_code == 404
        assert (await client.get(f"/api/chat/sessions/bad?client_id={client_id}")).status_code == 422
        assert (await client.post("/api/chat", json={"session_id": str(session_id), "client_id": str(client_id), "message": "test", "nsfw": False})).status_code == 404


@pytest.mark.asyncio
async def test_site_failure_is_not_reported_as_empty_data_for_web_fallback(monkeypatch):
    async def search(*args, **kwargs):
        raise HTTPException(status_code=503, detail="Unavailable")

    monkeypatch.setattr("app.ai.tools.search_service.search_anime", search)
    runner = ToolRunner(object(), nsfw=False, user_message="这部作品的评分")
    await runner.execute("search_anime", {"q": "动画"})
    assert (await runner.execute("web_search", {"query": "动画评分"}))["code"] == "SITE_UNAVAILABLE"
