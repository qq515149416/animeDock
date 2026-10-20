"""带身份标识、跨调用限速和指数退避的 Bangumi API 客户端。"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from redis.exceptions import RedisError

from app.config import get_settings
from app.deps import get_redis

logger = logging.getLogger(__name__)
_semaphore = asyncio.Semaphore(2)
_interval_lock = asyncio.Lock()
_last_request = 0.0
_REDIS_LIMIT = """
local tm = redis.call('TIME')
local now = tm[1] * 1000 + math.floor(tm[2] / 1000)
local next = tonumber(redis.call('GET', KEYS[1]) or '0')
if next > now then return next - now end
redis.call('SET', KEYS[1], now + 500, 'PX', 1000)
return 0
"""


class BangumiClient:
    """每秒最多两次请求；Redis 将多个 API/worker 进程共享限速。"""

    def __init__(self, *, http_client: httpx.AsyncClient | None = None, redis_client: Any = None) -> None:
        self.settings = get_settings()
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=httpx.Timeout(self.settings.request_timeout), follow_redirects=False)
        self._redis = get_redis() if redis_client is None else redis_client

    async def __aenter__(self) -> "BangumiClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _wait_for_slot(self) -> None:
        global _last_request
        async with _interval_lock:
            delay = 0.5 - (time.monotonic() - _last_request)
            if delay > 0:
                await asyncio.sleep(delay)
            if self._redis is not False:
                while True:
                    try:
                        delay_ms = await self._redis.eval(_REDIS_LIMIT, 1, "bangumi:rate:v1")
                    except RedisError:
                        # Redis 故障时仍维持进程内限速，日历详情查询保持可用。
                        logger.warning("bangumi_distributed_rate_limit_unavailable")
                        break
                    if int(delay_ms) <= 0:
                        break
                    await asyncio.sleep(int(delay_ms) / 1000)
            _last_request = time.monotonic()

    @staticmethod
    def _retry_delay(response: httpx.Response, attempt: int) -> float:
        value = response.headers.get("Retry-After")
        if value is not None:
            try:
                return max(0.0, min(60.0, float(value)))
            except ValueError:
                try:
                    return max(0.0, min(60.0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()))
                except (ValueError, TypeError):
                    pass
        return float(2 ** attempt)

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
        """GET 相对 API 路径，429/5xx/网络错误最多尝试三次。"""
        if not path.startswith("/") or path.startswith("//") or "://" in path:
            raise ValueError("Bangumi API 只接受相对路径")
        headers = {"User-Agent": self.settings.bangumi_user_agent, "Accept": "application/json"}
        if self.settings.bangumi_access_token:
            headers["Authorization"] = f"Bearer {self.settings.bangumi_access_token}"
        for attempt in range(3):
            try:
                async with _semaphore:
                    await self._wait_for_slot()
                    response = await self._client.get(self.settings.bangumi_base_url.rstrip("/") + path, params=params, headers=headers)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < 2:
                        delay = self._retry_delay(response, attempt)
                        logger.warning("bangumi_retry", extra={"path": path, "status": response.status_code, "attempt": attempt + 1, "delay": delay})
                        await asyncio.sleep(delay)
                        continue
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, (dict, list)):
                    raise ValueError("Bangumi API 返回了无效 JSON 结构")
                return payload
            except httpx.TransportError:
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)
        raise RuntimeError("Bangumi 请求重试未完成")
