"""Bangumi 归档、v0 API 和旧版日历之间的标准化与批量写入。"""

import json
from datetime import datetime
from collections import defaultdict
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Anime, AnimeRelation, Episode
from app.services.tag_mapping import map_tags
from app.utils.season import get_season
from app.utils.wiki_parser import extract_metadata, parse_date

BATCH_SIZE = 1000
RELATION_TYPES: dict[int, str] = {1: "改编", 2: "前传", 3: "续集", 4: "总集篇", 5: "全集", 6: "番外篇", 7: "角色出演", 8: "相同世界观", 9: "不同世界观", 10: "不同演绎", 11: "衍生", 12: "主线故事", 14: "联动", 99: "其他"}


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value or default)
    except (ValueError, TypeError):
        return default


def _float(value: Any) -> float:
    try:
        return float(value or 0)
    except (ValueError, TypeError):
        return 0.0


def _count(value: Any) -> int:
    if isinstance(value, dict):
        return sum(max(0, _int(item)) for item in value.values())
    return max(0, _int(value))


def _nsfw(value: Any) -> bool:
    if value is False or (isinstance(value, (int, float)) and value == 0):
        return False
    if isinstance(value, str) and value.strip().lower() in ("false", "0", "no"):
        return False
    # 缺失/未知标记按敏感内容处理，待权威 API 确认后再公开。
    return True


def normalize_subject(raw: dict[str, Any]) -> dict[str, Any]:
    """将官方归档或 API 的动画条目转换成 Anime 字段字典。"""
    metadata = extract_metadata(raw.get("infobox"))
    air_date = parse_date(raw.get("date", raw.get("air_date"))) or metadata["air_date"]
    rating = raw.get("rating") or {}
    images = raw.get("images") or {}
    weekday = raw.get("air_weekday") or (raw.get("weekday") or {}).get("id") or metadata["air_weekday"]
    infobox = raw.get("infobox", "")
    result = {
        "id": int(raw["id"]), "name": str(raw.get("name") or ""), "name_cn": str(raw.get("name_cn") or ""),
        "summary": str(raw.get("summary") or ""), "aliases": metadata["aliases"],
        **map_tags(raw.get("platform"), raw.get("meta_tags"), raw.get("tags")),
        "platform_raw": str(raw.get("platform") or ""), "air_date": air_date,
        "year": air_date.year if air_date else None, "season": get_season(air_date) if air_date else None,
        "air_weekday": _int(weekday) if 1 <= _int(weekday) <= 7 else None,
        "eps": _int(raw.get("total_episodes") or raw.get("eps") or metadata["eps"]) or None,
        "studio": metadata["studio"] or "", "director": metadata["director"] or "",
        "score": _float(raw.get("score", rating.get("score"))),
        "score_details": raw.get("score_details") or rating.get("count") or {},
        "rank": _int(raw.get("rank", rating.get("rank"))) or None,
        "collects": _count(raw.get("favorite", raw.get("collection", raw.get("collects", 0)))),
        "tags": raw.get("tags") or [], "meta_tags": raw.get("meta_tags") or [],
        "nsfw": _nsfw(raw.get("nsfw")),
        "image_url": raw.get("image_url") or images.get("large") or images.get("common") or images.get("medium") or "",
        "infobox_raw": infobox if isinstance(infobox, str) else json.dumps(infobox, ensure_ascii=False),
    }
    return result


def _updated_fields(raw: dict[str, Any]) -> tuple[str, ...]:
    """稀疏日历或旧归档不应覆盖已有的敏感标记、封面与详情。"""
    fields = {key for key in ("name", "name_cn", "summary", "nsfw", "tags", "meta_tags", "score", "score_details", "rank") if key in raw}
    if "infobox" in raw:
        fields.update(("aliases", "eps", "studio", "director", "infobox_raw"))
    if any(key in raw for key in ("date", "air_date", "infobox")):
        fields.update(("air_date", "year", "season"))
    if any(key in raw for key in ("air_weekday", "weekday", "infobox")):
        fields.add("air_weekday")
    if any(key in raw for key in ("platform", "meta_tags", "tags")):
        fields.update(("category", "source", "region", "genres"))
    if "platform" in raw:
        fields.add("platform_raw")
    if any(key in raw for key in ("eps", "total_episodes")):
        fields.add("eps")
    if "rating" in raw:
        fields.update(("score", "score_details", "rank"))
    if any(key in raw for key in ("favorite", "collection", "collects")):
        fields.add("collects")
    if any(key in raw for key in ("images", "image_url")):
        fields.add("image_url")
    return tuple(sorted(fields))


async def upsert_subjects(db: AsyncSession, raw_records: Iterable[dict[str, Any]], *, source_timestamp: datetime | None = None) -> list[int]:
    """每批最多一千条 upsert，只更新源数据确实提供的字段。"""
    records = {int(raw["id"]): raw for raw in raw_records if _int(raw.get("type", 2)) == 2}
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for raw in records.values():
        groups[_updated_fields(raw)].append(normalize_subject(raw))
    for fields, rows in groups.items():
        statement = insert(Anime)
        statement = statement.on_conflict_do_update(index_elements=[Anime.id], set_={**{key: getattr(statement.excluded, key) for key in fields}, "updated_at": func.now()}, where=Anime.updated_at <= source_timestamp if source_timestamp else None)
        for offset in range(0, len(rows), BATCH_SIZE):
            # 参数列表由驱动 executemany 执行，避免 1000 条多字段 SQL 超出绑定数限制。
            await db.execute(statement, rows[offset:offset + BATCH_SIZE])
    return list(records)


def normalize_episode(raw: dict[str, Any]) -> dict[str, Any]:
    """兼容归档章节的 subject_id 与 API 章节字段。"""
    return {"id": int(raw["id"]), "anime_id": int(raw.get("subject_id", raw.get("anime_id"))), "sort": _float(raw.get("sort")), "type": _int(raw.get("type")), "name": str(raw.get("name") or ""), "name_cn": str(raw.get("name_cn") or ""), "airdate": parse_date(raw.get("airdate")), "duration": str(raw.get("duration") or ""), "description": str(raw.get("description", raw.get("desc", "")) or "")}


async def upsert_episodes(db: AsyncSession, records: list[dict[str, Any]]) -> None:
    """批量更新已筛选为动画的章节。"""
    rows = list({int(raw["id"]): normalize_episode(raw) for raw in records}.values())
    statement = insert(Episode)
    statement = statement.on_conflict_do_update(index_elements=[Episode.id], set_={column.name: getattr(statement.excluded, column.name) for column in Episode.__table__.columns if column.name != "id"})
    for offset in range(0, len(rows), BATCH_SIZE):
        await db.execute(statement, rows[offset:offset + BATCH_SIZE])


def normalize_relation(raw: dict[str, Any]) -> dict[str, Any]:
    """官方关联数字常量转为可供界面和续作检测使用的中文关系。"""
    relation = raw.get("relation_type", raw.get("relation", "其他"))
    return {"anime_id": int(raw.get("subject_id", raw.get("anime_id"))), "related_id": int(raw.get("related_subject_id", raw.get("related_id", raw.get("id")))), "relation_type": RELATION_TYPES.get(_int(relation), str(relation))}


async def upsert_relations(db: AsyncSession, records: list[dict[str, Any]]) -> None:
    """批量写入双端均为动画的关联，重复关联保持幂等。"""
    rows = list({(row["anime_id"], row["related_id"], row["relation_type"]): row for row in map(normalize_relation, records)}.values())
    for offset in range(0, len(rows), BATCH_SIZE):
        await db.execute(insert(AnimeRelation).on_conflict_do_nothing(), rows[offset:offset + BATCH_SIZE])
