"""统计参数验证在访问数据库前完成，不允许客户端更改固定统计范围。"""
import httpx
import pytest

from app.main import app


@pytest.mark.asyncio
@pytest.mark.parametrize('path', [
    '/api/stats/trends?dimension=unknown&start_year=2025&start_season=winter&end_year=2026&end_season=summer',
    '/api/stats/trends?start_year=2026&start_season=summer&end_year=2025&end_season=winter',
    '/api/stats/trends?start_year=2025&start_season=wrong&end_year=2026&end_season=summer',
    '/api/stats/season?year=1700&season=winter',
    '/api/stats/season?year=2025&season=wrong',
    '/api/stats/season?year=2025&season=winter&region=中国',
    '/api/stats/season?year=2025&season=winter&nsfw=false',
    '/api/stats/meta?nsfw=false',
])
async def test_invalid_statistics_parameters_return_422_without_database(monkeypatch, path):
    from app import main
    async def no_limit(*args, **kwargs):
        pass
    monkeypatch.setattr(main, 'check_rate_limit', no_limit)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path)
    assert response.status_code == 422
    assert response.json()['code'] == 'VALIDATION_ERROR'
