"""共享连接、依赖与跨进程限流。"""
import logging
from functools import lru_cache
from ipaddress import IPv6Address, ip_address, ip_network

from fastapi import HTTPException, Request
from meilisearch_python_sdk import AsyncClient
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings
from app.db import get_db

logger = logging.getLogger(__name__)


@lru_cache
def get_redis() -> Redis:
    """返回异步 Redis 连接池。"""
    return Redis.from_url(get_settings().redis_url, decode_responses=True, socket_connect_timeout=3, socket_timeout=3)


@lru_cache
def get_meili_client() -> AsyncClient:
    """返回异步 Meilisearch SDK 客户端。"""
    settings = get_settings()
    return AsyncClient(settings.meili_url, settings.meili_master_key or None, timeout=8)


def resolve_client_ip(request: Request) -> str:
    """仅信任指定直连代理覆写的单个客户端 IP，忽略原始 X-Forwarded-For。"""
    peer = request.client.host if request.client else 'unknown'
    try:
        peer_address = ip_address(peer)
    except ValueError:
        return peer
    candidates = [peer_address]
    if isinstance(peer_address, IPv6Address) and peer_address.ipv4_mapped:
        candidates.append(peer_address.ipv4_mapped)
    trusted = False
    for cidr in get_settings().trusted_proxy_cidrs:
        try:
            network = ip_network(cidr, strict=False)
        except ValueError:
            continue
        if any(address in network for address in candidates):
            trusted = True
            break
    values = request.headers.getlist('x-fanjuwu-client-ip')
    if not trusted or len(values) != 1:
        return peer
    value = values[0].strip()
    if '%' in value:
        return peer
    try:
        client_address = ip_address(value)
    except ValueError:
        return peer
    if isinstance(client_address, IPv6Address) and client_address.ipv4_mapped:
        return str(client_address.ipv4_mapped)
    return str(client_address)


async def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> None:
    """用原子 Lua 计数实施固定窗口限流，Redis 不可用时拒绝昂贵操作。"""
    script = '''
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return {count, redis.call('TTL', KEYS[1])}
    '''
    try:
        count, ttl = await get_redis().eval(script, 1, f'rate:v1:{key}', window_seconds)
    except RedisError as exc:
        logger.warning('rate_limit_unavailable', extra={'key': key, 'error': str(exc)})
        raise HTTPException(status_code=503, detail={'code': 'RATE_LIMIT_UNAVAILABLE', 'message': '限流服务暂不可用，请稍后重试'}) from exc
    if int(count) > limit:
        raise HTTPException(status_code=429, detail={'code': 'RATE_LIMITED', 'message': '请求过于频繁，请稍后重试'}, headers={'Retry-After': str(max(1, int(ttl)))})
