"""公开 API 契约及错误响应回归。"""
from collections.abc import AsyncIterator

import httpx
import pytest

from app.db import get_db
from app.main import app
from app.models import Anime


@pytest.mark.asyncio
async def test_direct_sensitive_detail_has_top_level_block_code_and_cors(monkeypatch) -> None:
    """浏览器能读取敏感内容错误码，不会因 CORS 隐藏服务端响应。"""
    from app import main

    async def no_limit(*args, **kwargs) -> None:
        return None

    class Database:
        async def get(self, model, anime_id):
            return Anime(id=anime_id, nsfw=True)

    async def database() -> AsyncIterator[Database]:
        yield Database()

    monkeypatch.setattr(main, 'check_rate_limit', no_limit)
    app.dependency_overrides[get_db] = database
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.get('/api/anime/2', headers={'Origin': 'http://localhost:3000'})
            assert response.status_code == 403
            assert response.json() == {'code': 'NSFW_BLOCKED'}
            assert response.headers['access-control-allow-origin'] == 'http://localhost:3000'
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_rejects_oversized_pages_without_querying_database(monkeypatch) -> None:
    """分页限制在请求验证层执行。"""
    from app import main

    async def no_limit(*args, **kwargs) -> None:
        return None

    monkeypatch.setattr(main, 'check_rate_limit', no_limit)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get('/api/anime/search?page_size=61')
        assert response.status_code == 422
        assert response.json()['code'] == 'VALIDATION_ERROR'


@pytest.mark.asyncio
async def test_rate_limit_error_retains_retry_after_and_cors(monkeypatch) -> None:
    """中间件返回限流响应时仍保留跨域头与重试时间。"""
    from app import main
    from fastapi import HTTPException

    async def limited(*args, **kwargs) -> None:
        raise HTTPException(429, detail={'code': 'RATE_LIMITED'}, headers={'Retry-After': '42'})

    monkeypatch.setattr(main, 'check_rate_limit', limited)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get('/api/anime/search', headers={'Origin': 'http://localhost:3000'})
        assert response.status_code == 429
        assert response.headers['retry-after'] == '42'
        assert response.headers['access-control-allow-origin'] == 'http://localhost:3000'
