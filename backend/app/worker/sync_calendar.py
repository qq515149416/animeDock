"""每日放送同步：回源日历、核实敏感标记、更新章节与两小时缓存。"""

import asyncio
import json
import logging
from typing import Any

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.deps import get_redis
from app.models import Anime
from app.services.bangumi_client import BangumiClient
from app.services.ingest import upsert_episodes, upsert_subjects
from app.worker.locks import run_locked
from app.worker.logging_config import setup_logging

logger = logging.getLogger(__name__)


async def fetch_episodes(client: BangumiClient, subject_id: int) -> list[dict[str, Any]]:
    """按官方分页接口获取一个动画的全部章节。"""
    episodes: list[dict[str, Any]] = []
    offset = 0
    while True:
        payload = await client.get("/v0/episodes", {"subject_id": subject_id, "limit": 100, "offset": offset})
        data = payload.get("data", []) if isinstance(payload, dict) else payload
        if not data:
            break
        episodes.extend({**episode, "subject_id": subject_id} for episode in data)
        offset += len(data)
        if len(data) < 100 or (isinstance(payload, dict) and offset >= int(payload.get("total", offset + 1))):
            break
    return episodes


async def _sync_calendar() -> int:
    from app.services.search_service import anime_document, upsert_documents

    async with BangumiClient() as client:
        payload = await client.get("/calendar")
        if not isinstance(payload, list):
            raise ValueError("Bangumi 日历返回格式错误")
        grouped_ids: dict[int, list[int]] = {weekday: [] for weekday in range(1, 8)}
        records: dict[int, dict[str, Any]] = {}
        episode_records: list[dict[str, Any]] = []
        async with SessionLocal() as db:
            for group in payload:
                weekday = int((group.get("weekday") or {}).get("id", 0))
                if weekday not in grouped_ids:
                    continue
                for item in group.get("items", []):
                    if item.get("type", 2) != 2:
                        continue
                    subject_id = int(item["id"])
                    try:
                        detail = await client.get(f"/v0/subjects/{subject_id}")
                        if not isinstance(detail, dict) or detail.get("type", 2) != 2 or "nsfw" not in detail:
                            raise ValueError("条目详情缺少类型或 NSFW 权威标记")
                        records[subject_id] = {**item, **detail, "air_weekday": weekday}
                    except (httpx.HTTPError, ValueError):
                        logger.warning("calendar_detail_unavailable", extra={"subject_id": subject_id}, exc_info=True)
                        # 新条目未确认敏感标记前不入库，已存在的条目仍可使用最后一次权威信息。
                        if await db.get(Anime, subject_id) is None:
                            continue
                    grouped_ids[weekday].append(subject_id)
                    try:
                        episode_records.extend(await fetch_episodes(client, subject_id))
                    except (httpx.HTTPError, ValueError):
                        logger.warning("calendar_episodes_unavailable", extra={"subject_id": subject_id}, exc_info=True)
            await upsert_subjects(db, records.values())
            await upsert_episodes(db, episode_records)
            await db.commit()
            ids = list(dict.fromkeys(subject_id for values in grouped_ids.values() for subject_id in values))
            rows = (await db.scalars(select(Anime).where(Anime.id.in_(ids)))).all() if ids else []
            by_id = {row.id: row for row in rows}
            groups = [{"weekday": weekday, "items": [{key: getattr(by_id[subject_id], key) for key in ("id", "name", "name_cn", "image_url", "score", "collects", "air_weekday", "nsfw")} for subject_id in grouped_ids[weekday] if subject_id in by_id]} for weekday in range(1, 8)]
            await get_redis().set("calendar:v1", json.dumps(groups, ensure_ascii=False), ex=7200)
            await upsert_documents([anime_document(row) for row in rows])
    logger.info("calendar_synced", extra={"subjects": len(rows)})
    return len(rows)


async def sync_calendar() -> int | None:
    """供每小时任务及 API 缓存未命中时调用，共享跨进程锁。"""
    return await run_locked("calendar", _sync_calendar)


def main() -> None:
    setup_logging()
    asyncio.run(sync_calendar())


if __name__ == "__main__":
    main()
