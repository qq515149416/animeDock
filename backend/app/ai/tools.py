"""受服务端 NSFW 策略约束的动画检索工具。"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import and_, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Anime
from app.services import calendar_service, embedding_service, search_service

logger = logging.getLogger(__name__)


class ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchArguments(ToolArguments):
    q: str = Field(default="", max_length=500)
    category: str | None = None
    source: str | None = None
    region: str = "日本"
    genres: list[str] = Field(default_factory=list, max_length=22)
    year: int | None = Field(default=None, ge=1900, le=2200)
    season: Literal["winter", "spring", "summer", "autumn"] | None = None
    min_score: float | None = Field(default=None, ge=0, le=10)
    sort: Literal["relevance", "score", "rank", "collects", "latest"] = "relevance"
    page: int = Field(default=1, ge=1, le=10000)
    page_size: int = Field(default=8, ge=1, le=60)


class SemanticArguments(ToolArguments):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=8, ge=1, le=20)


class DetailArguments(ToolArguments):
    anime_id: int = Field(gt=0)


class CalendarArguments(ToolArguments):
    weekday: int | None = Field(default=None, ge=1, le=7)


class WebArguments(ToolArguments):
    query: str = Field(min_length=1, max_length=500)


ARGUMENT_MODELS: dict[str, type[BaseModel]] = {
    "search_anime": SearchArguments, "semantic_search": SemanticArguments,
    "get_anime_detail": DetailArguments, "get_calendar": CalendarArguments,
    "web_search": WebArguments,
}
TOOL_LABELS = {
    "search_anime": "正在检索站内动画库…", "semantic_search": "正在寻找剧情与氛围相近的动画…",
    "get_anime_detail": "正在读取番剧详情…", "get_calendar": "正在查询每日放送…",
    "web_search": "正在搜索网络资料…",
}
DESCRIPTIONS = {
    "search_anime": "按关键词和分类筛选站内动画。地区默认日本；使用 all 查询全部地区。优先调用。",
    "semantic_search": "根据剧情、主题和氛围语义推荐站内动画。",
    "get_anime_detail": "获取站内动画详情、章节、关联作品与制作信息。",
    "get_calendar": "查询某星期的每日放送；不传 weekday 则查询北京时间今天。",
    "web_search": "联网搜索兜底。必须先查站内，仅在站内为空或用户询问新闻、访谈、最新剧情、续作消息时使用。",
}
TOOL_DEFINITIONS = [
    {"type": "function", "function": {"name": name, "description": DESCRIPTIONS[name], "parameters": model.model_json_schema()}}
    for name, model in ARGUMENT_MODELS.items()
]
EXTERNAL_INFORMATION = re.compile(r"新闻|资讯|消息|访谈|采访|续作|续订|官宣|公告|最新(?:一|第)?[话集]|最新.*剧情|第\s*[零一二三四五六七八九十百\d]+\s*[话集].*剧情|news|interview|announcement|sequel", re.I)
ADULT_CONTENT = re.compile(r"\b(?:nsfw|hentai|porn(?:hub|ography)?|xxx|r[ -]?18|18\+)\b|成人动画|成人向|里番|裏番|色情|成人视频|无码|無修正", re.I)
COMPACT_FIELDS = {
    "id", "name", "name_cn", "summary", "category", "source", "region", "genres",
    "air_date", "year", "season", "air_weekday", "eps", "studio", "director", "score",
    "rank", "collects", "nsfw", "image_url", "latest_ep", "is_new", "is_sequel",
    "episodes", "relations", "related", "characters", "persons", "staff", "sort", "type",
    "anime_id", "related_id", "relation_type", "airdate", "duration", "description",
    "actors", "actor", "cv", "role", "relation", "subject", "character", "person",
}


def compact_payload(value: Any, nsfw: bool, field: str = "") -> Any:
    """删除敏感节点及无关大字段，并截断工具文本。"""
    if isinstance(value, dict):
        if not nsfw and value.get("nsfw"):
            return None
        return {
            key: compact_payload(item, nsfw, key)
            for key, item in value.items() if key in COMPACT_FIELDS
            and not (isinstance(item, dict) and not nsfw and item.get("nsfw"))
        }
    if isinstance(value, list):
        return [clean for item in value[:100] if (clean := compact_payload(item, nsfw, field)) is not None]
    if isinstance(value, str):
        return value[:200] if field in {"summary", "description"} else value
    return value


def result_count(result: dict[str, Any]) -> int:
    """返回工具实际提供的条目数，不把错误视为结果。"""
    if result.get("code") or result.get("error"):
        return 0
    if isinstance(result.get("items"), list):
        return len(result["items"])
    return 1 if result.get("id") else 0


class ToolRunner:
    """固定请求策略，收集已通过过滤的番剧引用与来源。"""

    def __init__(self, db: AsyncSession, nsfw: bool, user_message: str = "") -> None:
        self.db = db
        self.nsfw = nsfw
        self.user_message = user_message
        self.anime_refs: dict[int, dict[str, Any]] = {}
        self.sources: list[dict[str, str]] = []
        self.site_attempted = False
        self.site_success = False
        self.site_has_results = False
        self.nsfw_blocked = False

    def _collect_anime(self, items: list[dict[str, Any]]) -> None:
        for item in items:
            if not isinstance(item, dict) or not item.get("id") or (item.get("nsfw") and not self.nsfw):
                continue
            anime_id = int(item["id"])
            self.anime_refs[anime_id] = {key: item.get(key) for key in ("id", "name_cn", "name", "image_url", "score", "nsfw")}
            self.anime_refs[anime_id]["nsfw"] = bool(item.get("nsfw", False))
            source = {"type": "site", "title": item.get("name_cn") or item.get("name") or str(anime_id),
                      "url": f"/anime/{anime_id}?nsfw={str(self.nsfw).lower()}"}
            if source not in self.sources:
                self.sources.append(source)

    async def execute(self, name: str, arguments: Any) -> dict[str, Any]:
        """验证模型参数并强制透传请求策略，不接受模型覆盖 NSFW。"""
        if name not in ARGUMENT_MODELS:
            return {"code": "UNKNOWN_TOOL", "error": "未知工具。"}
        if not isinstance(arguments, dict):
            return {"code": "INVALID_ARGUMENTS", "error": "工具参数必须为 JSON 对象。"}
        clean_arguments = {key: value for key, value in arguments.items() if key != "nsfw"}
        try:
            params = ARGUMENT_MODELS[name].model_validate(clean_arguments).model_dump(exclude_none=True)
        except ValidationError:
            return {"code": "INVALID_ARGUMENTS", "error": "工具参数不符合要求，请检查参数名称、类型与范围。"}
        try:
            if name == "web_search":
                return await self._web_search(params["query"])
            self.site_attempted = True
            if name == "search_anime":
                response = await search_service.search_anime(self.db, nsfw=self.nsfw, **params)
                items = compact_payload(response.get("items", []), self.nsfw)
                result = {"items": items, "total": response.get("total", len(items)), "page": params.get("page", 1)}
                # 额外过滤发生时不保留上游可能包含敏感条目的统计。
                if len(items) != len(response.get("items", [])):
                    result["total"] = len(items)
            elif name == "semantic_search":
                response = await embedding_service.semantic_search(self.db, nsfw=self.nsfw, **params)
                result = {"items": compact_payload(response, self.nsfw)}
            elif name == "get_calendar":
                weekday = params.get("weekday", datetime.now(ZoneInfo("Asia/Shanghai")).isoweekday())
                groups = await calendar_service.get_calendar(self.db, nsfw=self.nsfw)
                result = {"weekday": weekday, "items": compact_payload(next((group["items"] for group in groups if group["weekday"] == weekday), []), self.nsfw)}
            else:
                response = await search_service.get_anime_detail(self.db, params["anime_id"], nsfw=self.nsfw)
                result = compact_payload(response, self.nsfw)
                if result is None:
                    self.nsfw_blocked = True
                    return {"code": "NSFW_BLOCKED", "error": "该作品属于敏感内容，需开启 NSFW 开关后才能查看相关信息"}
            items = result.get("items", [result] if result.get("id") else [])
            self._collect_anime(items)
            if name == "get_anime_detail":
                self._collect_anime(result.get("related", []) + result.get("relations", []))
            self.site_has_results = self.site_has_results or bool(items)
            self.site_success = True
            return result
        except HTTPException as exc:
            if exc.status_code == 403:
                self.nsfw_blocked = True
                return {"code": "NSFW_BLOCKED", "error": "该作品属于敏感内容，需开启 NSFW 开关后才能查看相关信息"}
            if exc.status_code == 404:
                self.site_success = True
                return {"items": [], "total": 0}
            logger.warning("ai_tool_http_error", extra={"tool": name, "status": exc.status_code})
            return {"code": "TOOL_UNAVAILABLE", "error": "站内数据暂时不可用，请稍后重试。"}
        except Exception:
            logger.exception("ai_tool_failed", extra={"tool": name})
            return {"code": "TOOL_UNAVAILABLE", "error": "查询暂时失败，请稍后重试。"}

    async def _web_search(self, query: str) -> dict[str, Any]:
        """先检查站内优先策略，再调用可选的 Tavily 服务。"""
        if not self.site_attempted:
            return {"code": "SITE_FIRST", "error": "请先调用站内工具查询，再决定是否联网。"}
        if self.nsfw_blocked and not self.nsfw:
            return {"code": "NSFW_BLOCKED", "error": "该作品属于敏感内容，需开启 NSFW 开关后才能查看相关信息"}
        if not self.site_success and not EXTERNAL_INFORMATION.search(self.user_message):
            return {"code": "SITE_UNAVAILABLE", "error": "站内查询暂时不可用，不能把查询失败当成无结果。请稍后重试。"}
        if self.site_has_results and not EXTERNAL_INFORMATION.search(self.user_message):
            return {"code": "SITE_SUFFICIENT", "error": "站内已提供此类信息，无需联网。"}
        if not self.nsfw and ADULT_CONTENT.search(query + " " + self.user_message):
            return {"code": "NSFW_BLOCKED", "error": "该作品属于敏感内容，需开启 NSFW 开关后才能查看相关信息"}
        settings = get_settings()
        if not settings.web_search_enabled or not settings.tavily_api_key:
            return {"code": "WEB_SEARCH_DISABLED", "error": "联网搜索未启用。"}
        if not self.nsfw and await self._contains_hidden_anime(query + " " + self.user_message):
            self.nsfw_blocked = True
            return {"code": "NSFW_BLOCKED", "error": "该作品属于敏感内容，需开启 NSFW 开关后才能查看相关信息"}
        safe_query = query if self.nsfw else query + " -hentai -porn -成人 -里番 -R18"
        async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
            response = await client.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {settings.tavily_api_key}"}, json={
                "query": safe_query, "max_results": 5, "safe_search": not self.nsfw,
                "search_depth": "basic", "topic": "general", "include_answer": False, "include_raw_content": False,
            })
            response.raise_for_status()
            payload = response.json()
        items: list[dict[str, str]] = []
        for raw in payload.get("results", []):
            url = str(raw.get("url", ""))
            title, content = str(raw.get("title", "")), str(raw.get("content", ""))
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
                continue
            if not self.nsfw and (raw.get("nsfw") or ADULT_CONTENT.search(title + " " + content + " " + url)):
                continue
            if not self.nsfw and await self._contains_hidden_anime(title[:200] + " " + content[:200] + " " + url):
                continue
            item = {"title": title[:200], "url": url, "summary": content[:200]}
            items.append(item)
            source = {"type": "web", "title": item["title"], "url": url}
            if source not in self.sources:
                self.sources.append(source)
        return {"items": items}

    async def _contains_hidden_anime(self, text: str) -> bool:
        """按本地敏感作品名称、别名及条目 ID 检查网页输出，失败时不放行。"""
        haystack = func.lower(literal(text))
        aliases = func.jsonb_array_elements_text(Anime.aliases).table_valued("value").alias("hidden_alias")
        alias_match = exists(select(1).select_from(aliases).where(
            func.length(aliases.c.value) >= 2,
            func.strpos(haystack, func.lower(aliases.c.value)) > 0,
        ).correlate(Anime))
        title_match = or_(
            and_(func.length(Anime.name) >= 2, func.strpos(haystack, func.lower(Anime.name)) > 0),
            and_(func.length(Anime.name_cn) >= 2, func.strpos(haystack, func.lower(Anime.name_cn)) > 0),
            alias_match,
        )
        ids = [int(value) for pair in re.findall(r"(?:bgm\.tv|bangumi\.tv|chii\.in)/subject/(\d+)|/anime/(\d+)", text) for value in pair if value]
        statement = select(Anime.id).where(Anime.nsfw.is_(True), or_(title_match, Anime.id.in_(ids))).limit(1)
        return await self.db.scalar(statement) is not None
