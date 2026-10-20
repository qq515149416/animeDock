"""每日刷新当季与上季动画的权威详情、评分和全文索引。"""

import asyncio
import logging

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Anime
from app.services.bangumi_client import BangumiClient
from app.services.ingest import upsert_subjects
from app.utils.season import SEASONS, get_current_season, season_date_range
from app.worker.locks import run_locked
from app.worker.logging_config import setup_logging

logger = logging.getLogger(__name__)


async def _refresh_current_season() -> int:
    from app.services.search_service import anime_document, upsert_documents

    year, season = get_current_season()
    index = SEASONS.index(season)
    previous = SEASONS[(index - 1) % 4]
    previous_year = year - (index == 0)
    start, _ = season_date_range(previous_year, previous)
    _, end = season_date_range(year, season)
    updated = 0
    last_id = 0
    async with SessionLocal() as db, BangumiClient() as client:
        while True:
            ids = (await db.scalars(select(Anime.id).where(Anime.air_date >= start, Anime.air_date < end, Anime.id > last_id).order_by(Anime.id).limit(100))).all()
            if not ids:
                break
            last_id = ids[-1]
            records = []
            for subject_id in ids:
                try:
                    record = await client.get(f"/v0/subjects/{subject_id}")
                    if isinstance(record, dict) and record.get("type", 2) == 2:
                        records.append(record)
                except (httpx.HTTPError, ValueError):
                    logger.warning("season_subject_refresh_failed", extra={"subject_id": subject_id}, exc_info=True)
            changed_ids = await upsert_subjects(db, records)
            await db.commit()
            if changed_ids:
                rows = (await db.scalars(select(Anime).where(Anime.id.in_(changed_ids)))).all()
                await upsert_documents([anime_document(row) for row in rows])
                updated += len(rows)
    logger.info("current_season_refreshed", extra={"count": updated, "from": start.isoformat(), "to": end.isoformat()})
    return updated


async def refresh_current_season() -> int | None:
    """日常刷新与全量导入互斥，防止旧快照覆盖刚刷新的评分。"""
    return await run_locked("heavy", _refresh_current_season)


def main() -> None:
    setup_logging()
    asyncio.run(refresh_current_season())


if __name__ == "__main__":
    main()
