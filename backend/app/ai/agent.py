"""OpenAI 兼容的流式工具调用循环。"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import build_system_prompt
from app.ai.tools import TOOL_DEFINITIONS, TOOL_LABELS, ToolRunner, result_count
from app.config import get_settings

logger = logging.getLogger(__name__)
MAX_ROUNDS = 5


def encode_sse(event: str, data: dict[str, Any]) -> str:
    """将事件编码为单条 SSE，JSON 转义可防止换行破坏协议。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=str)}\n\n"


async def run_agent(
    db: AsyncSession,
    message: str,
    history: list[dict[str, str]],
    nsfw: bool,
    *,
    client: Any | None = None,
    runner: ToolRunner | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """流式运行最多五轮，拼接分片函数参数并逐条执行受控工具。"""
    settings = get_settings()
    owned_client = client is None
    if owned_client and not settings.llm_api_key:
        yield {"event": "error", "data": {"code": "LLM_NOT_CONFIGURED", "message": "AI 服务尚未配置，请设置 LLM_API_KEY。"}}
        return
    if client is None:
        client = AsyncOpenAI(
            api_key=settings.llm_api_key, base_url=settings.llm_base_url,
            timeout=settings.request_timeout, max_retries=2,
        )
    tool_runner = runner or ToolRunner(db, nsfw=nsfw, user_message=message)
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(nsfw)}]
    messages.extend({"role": item["role"], "content": item["content"]} for item in history[-10:] if item.get("role") in {"user", "assistant"})
    messages.append({"role": "user", "content": message})
    try:
        for round_index in range(MAX_ROUNDS):
            fragments: dict[int, dict[str, Any]] = {}
            content_parts: list[str] = []
            site_ready = tool_runner.site_attempted
            available_tools = TOOL_DEFINITIONS if site_ready else [tool for tool in TOOL_DEFINITIONS if tool["function"]["name"] != "web_search"]
            stream = await client.chat.completions.create(
                model=settings.llm_model, messages=list(messages), tools=available_tools,
                tool_choice="none" if round_index == MAX_ROUNDS - 1 else ("auto" if site_ready else "required"), stream=True,
            )
            try:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    content = getattr(delta, "content", None)
                    if content:
                        content_parts.append(content)
                        if site_ready:
                            yield {"event": "token", "data": {"content": content}}
                    for part in getattr(delta, "tool_calls", None) or []:
                        if part.index >= 8:
                            raise ValueError("单轮工具数量超过上限")
                        call = fragments.setdefault(part.index, {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                        if part.id:
                            call["id"] = part.id
                        function = part.function
                        if function is not None:
                            if function.name:
                                call["function"]["name"] += function.name
                            if function.arguments:
                                call["function"]["arguments"] += function.arguments
                                if len(call["function"]["arguments"]) > 16000:
                                    raise ValueError("工具参数超过上限")
            finally:
                await asyncio.shield(stream.close())
            if not fragments and not site_ready:
                # 兼容忽略 required 的接口；丢弃无依据的首轮文字，补一次受控站内检索。
                fragments[0] = {"id": f"site_prefetch_{round_index}", "type": "function", "function": {
                    "name": "search_anime", "arguments": json.dumps({"q": message[:500]}, ensure_ascii=False),
                }}
            if not fragments:
                break
            calls = [fragments[index] for index in sorted(fragments)]
            if round_index == MAX_ROUNDS - 1:
                yield {"event": "error", "data": {"code": "TOOL_LIMIT", "message": "查询轮数已达上限，请缩小问题范围后重试。"}}
                return
            messages.append({"role": "assistant", "content": ("".join(content_parts) or None) if site_ready else None, "tool_calls": calls})
            for call in calls:
                if not call["id"]:
                    raise ValueError("工具调用缺少标识")
                name = call["function"]["name"]
                try:
                    arguments = json.loads(call["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = None
                # 发送的参数同样不允许伪装成已开启 NSFW。
                display_args = {key: value for key, value in arguments.items() if key != "nsfw"} if isinstance(arguments, dict) else {}
                yield {"event": "tool_start", "data": {"tool": name, "args": display_args, "label": TOOL_LABELS.get(name, "正在处理查询…")}}
                result = await tool_runner.execute(name, arguments)
                yield {"event": "tool_end", "data": {"tool": name, "result_count": result_count(result)}}
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False, separators=(',', ':'), default=str)})
        yield {"event": "anime_refs", "data": {"items": list(tool_runner.anime_refs.values())}}
        yield {"event": "sources", "data": {"items": tool_runner.sources}}
        yield {"event": "done", "data": {}}
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("ai_generation_failed")
        yield {"event": "error", "data": {"code": "AI_UNAVAILABLE", "message": "AI 服务暂时不可用，请检查服务配置后重试。"}}
    finally:
        if owned_client:
            await asyncio.shield(client.close())
