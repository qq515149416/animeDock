"""独立 APScheduler 进程；所有时间以配置时区（默认北京时间）执行。"""

import asyncio
import logging
import signal
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal, engine
from app.deps import get_meili_client, get_redis
from app.models import Anime
from app.worker.import_archive import import_archive
from app.worker.refresh_current_season import refresh_current_season
from app.worker.sync_calendar import sync_calendar
from app.worker.logging_config import setup_logging

logger = logging.getLogger(__name__)


def create_scheduler() -> AsyncIOScheduler:
    """每周一四点导入、每小时放送同步、每天五点刷新评分。"""
    timezone = ZoneInfo(get_settings().tz)
    scheduler = AsyncIOScheduler(timezone=timezone, job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600})
    scheduler.add_job(import_archive, CronTrigger(day_of_week="mon", hour=4, minute=0, timezone=timezone), id="import_archive", replace_existing=True)
    scheduler.add_job(sync_calendar, CronTrigger(minute=0, timezone=timezone), id="sync_calendar", replace_existing=True)
    scheduler.add_job(refresh_current_season, CronTrigger(hour=5, minute=0, timezone=timezone), id="refresh_current_season", replace_existing=True)
    return scheduler


async def worker_heartbeat() -> None:
    """独立协程每三十秒续写健康标记，不受首次全量导入耗时影响。"""
    while True:
        try:
            await get_redis().set("worker:heartbeat", datetime.now(timezone.utc).isoformat(), ex=120)
        except Exception:
            logger.exception("worker_heartbeat_failed")
        await asyncio.sleep(30)


async def main() -> None:
    """启动时自动建立空数据库，退出时正确停止任务和连接池。"""
    settings = get_settings()
    setup_logging()
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stopped.set)
    scheduler = create_scheduler()
    scheduler.start()

    async def bootstrap() -> None:
        try:
            async with SessionLocal() as db:
                empty = await db.scalar(select(Anime.id).limit(1)) is None
            if empty:
                result = await import_archive()
                if result is not None:
                    await refresh_current_season()
            await sync_calendar()
        except Exception:
            logger.exception("worker_bootstrap_failed")
            # 自动恢复由下次计划任务继续执行，进程维持存活以便重试。

    startup = asyncio.create_task(bootstrap())
    heartbeat = asyncio.create_task(worker_heartbeat())
    try:
        await stopped.wait()
    finally:
        scheduler.shutdown(wait=False)
        startup.cancel()
        heartbeat.cancel()
        await asyncio.gather(startup, heartbeat, return_exceptions=True)
        await get_redis().aclose()
        await get_meili_client().aclose()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
