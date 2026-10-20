"""Redis 租约锁，防止多个 worker 或命令行重复执行昂贵任务。"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar
from uuid import uuid4

from app.deps import get_redis

logger = logging.getLogger(__name__)
T = TypeVar("T")
_RENEW = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end"
_RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"


async def run_locked(name: str, task: Callable[[], Awaitable[T]], ttl: int = 120, *, wait: bool = False) -> T | None:
    """通过可续期租约互斥；失去租约立即取消任务，避免并发写入。"""
    redis = get_redis()
    key, token = f"worker:lock:{name}", uuid4().hex
    while not await redis.set(key, token, nx=True, ex=ttl):
        if not wait:
            logger.info("worker_job_already_running", extra={"job": name})
            return None
        await asyncio.sleep(1)

    async def renew() -> None:
        while True:
            await asyncio.sleep(ttl / 3)
            if not await redis.eval(_RENEW, 1, key, token, ttl):
                raise RuntimeError(f"任务 {name} 已失去 Redis 租约")

    work = asyncio.create_task(task())
    heartbeat = asyncio.create_task(renew())
    try:
        done, _ = await asyncio.wait((work, heartbeat), return_when=asyncio.FIRST_COMPLETED)
        if heartbeat in done:
            await heartbeat
        return await work
    finally:
        for running in (work, heartbeat):
            running.cancel()
        await asyncio.gather(work, heartbeat, return_exceptions=True)
        try:
            await redis.eval(_RELEASE, 1, key, token)
        except Exception:
            logger.exception("worker_lock_release_failed", extra={"job": name})
