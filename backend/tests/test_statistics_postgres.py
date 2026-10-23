"""季度聚合的真实 SQL 回归；在自动回滚的隔离 schema 中运行。"""
import os
from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db import Base
from app.models import Anime

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='需要 PostgreSQL 集成环境')


@pytest_asyncio.fixture
async def database():
    engine = create_async_engine(os.environ['TEST_DATABASE_URL'].replace('postgresql://', 'postgresql+asyncpg://', 1))
    async with engine.connect() as connection:
        transaction = await connection.begin()
        schema = 'test_statistics_' + uuid4().hex
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        await connection.execution_options(schema_translate_map={None: schema})
        await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(bind=connection, expire_on_commit=False) as session:
            # Winter: 3 Japanese works, mean (8+6)/2=7, 4 genre occurrences.
            session.add_all([
                Anime(id=1, name='A', region='日本', year=2025, season='winter', air_date=date(2025, 1, 1), score=8, score_details={'8': 3}, genres=['奇幻', '恋爱', '奇幻'], source='漫画改', nsfw=False),
                Anime(id=2, name='B', region='日本', year=2025, season='winter', air_date=date(2025, 2, 1), score=6, score_details={'6': 1}, genres=['奇幻'], source='漫画改', nsfw=True),
                Anime(id=3, name='Unrated', region='日本', year=2025, season='winter', air_date=date(2025, 3, 1), score=0, genres=[], source='其他', nsfw=False),
                Anime(id=4, name='Excluded country', region='中国', year=2025, season='winter', score=10, genres=['奇幻'], source='原创', nsfw=False),
                Anime(id=5, name='Next year', region='日本', year=2026, season='summer', air_date=date(2026, 7, 1), score=9, genres=['科幻'], source='原创', nsfw=True),
                Anime(id=6, name='No quarter', region='日本', score=7, genres=['科幻'], source='原创', nsfw=False),
                Anime(id=7, name='Outside range', region='日本', year=2024, season='autumn', air_date=date(2024, 10, 1), score=10, genres=['奇幻'], source='原创', nsfw=False),
                Anime(id=8, name='Blank tags', region='日本', year=2025, season='spring', air_date=date(2025, 4, 1), score=0, genres=[' ', ''], source='', nsfw=False),
            ])
            await session.flush()
            yield session
        await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_cross_year_axis_includes_empty_quarters_and_nsfw_but_only_japan(database):
    from app.services.statistics_service import get_statistics
    result = await get_statistics(database, dimension='genre', start_year=2025, start_season='winter', end_year=2026, end_season='summer')
    quarters = result['quarters']
    assert [(q['year'], q['season']) for q in quarters] == [(2025, 'winter'), (2025, 'spring'), (2025, 'summer'), (2025, 'autumn'), (2026, 'winter'), (2026, 'spring'), (2026, 'summer')]
    assert result['region'] == '日本' and result['includes_nsfw'] is True
    winter = quarters[0]
    assert (winter['total_count'], winter['rated_count'], winter['average_score'], winter['max_score'], winter['vote_count']) == (3, 2, 7, 8, 4)
    assert (winter['classified_count'], winter['known_source_count']) == (2, 2)
    groups = {g['name']: g for g in winter['groups']}
    assert (groups['奇幻']['count'], groups['奇幻']['average_score'], groups['奇幻']['max_score']) == (2, 7, 8)
    assert groups['恋爱']['count'] == 1
    assert groups['未分类']['count'] == 1 and groups['未分类']['average_score'] is None
    assert winter['distribution_total'] == 4
    assert quarters[2]['total_count'] == 0 and quarters[2]['average_score'] is None
    assert quarters[2]['max_score'] is None and quarters[2]['distribution_total'] == 0
    assert quarters[-1]['average_score'] == 9
    # Aggregate-only contract: no sensitive or non-sensitive title/ID is returned.
    assert all('id' not in g and 'anime_id' not in g and 'name_cn' not in g for q in quarters for g in q['groups'])


@pytest.mark.asyncio
async def test_source_distribution_counts_each_work_once_and_keeps_unknown(database):
    from app.services.statistics_service import get_statistics
    result = await get_statistics(database, dimension='source', start_year=2025, start_season='winter', end_year=2025, end_season='spring')
    winter, spring = result['quarters']
    groups = {g['name']: g for g in winter['groups']}
    assert result['distribution_basis'] == 'works'
    assert winter['distribution_total'] == winter['total_count'] == 3
    assert groups['漫画改']['count'] == 2 and groups['漫画改']['average_score'] == 7
    assert groups['其他']['count'] == 1
    assert sum(g['count'] for g in winter['groups']) == 3
    assert spring['groups'][-1]['name'] == '其他'
    assert spring['groups'][-1]['count'] == 1
    assert spring['average_score'] is None


@pytest.mark.asyncio
async def test_metadata_and_blank_genres_use_fixed_catalog_scope(database):
    from app.services.statistics_service import get_statistics, get_statistics_metadata
    meta = await get_statistics_metadata(database)
    assert meta['years'] == [2026, 2025, 2024]
    assert meta['catalog_count'] == 7 and meta['missing_quarter_count'] == 1
    result = await get_statistics(database, dimension='genre', start_year=2025, start_season='spring', end_year=2025, end_season='spring')
    quarter = result['quarters'][0]
    assert quarter['classified_count'] == 0 and quarter['known_source_count'] == 0
    assert quarter['distribution_total'] == 1
    assert next(g for g in quarter['groups'] if g['name'] == '未分类')['count'] == 1


@pytest.mark.asyncio
async def test_reverse_range_is_rejected(database):
    from app.services.statistics_service import get_statistics
    with pytest.raises(ValueError, match='开始季度'):
        await get_statistics(database, dimension='genre', start_year=2026, start_season='summer', end_year=2025, end_season='winter')


@pytest.mark.asyncio
async def test_public_api_returns_only_aggregates_with_sensitive_works_included(database, monkeypatch):
    import httpx
    from app import main
    from app.db import get_db
    async def no_limit(*args, **kwargs):
        pass
    async def override_db():
        yield database
    monkeypatch.setattr(main, 'check_rate_limit', no_limit)
    main.app.dependency_overrides[get_db] = override_db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
            response = await client.get('/api/stats/season?dimension=source&year=2025&season=winter')
            assert response.status_code == 200
            result = response.json()
            assert result['quarters'][0]['total_count'] == 3
            assert result['quarters'][0]['average_score'] == 7
            assert 'Sensitive' not in response.text and 'anime_id' not in response.text
            meta = await client.get('/api/stats/meta')
            assert meta.status_code == 200 and meta.json()['catalog_count'] == 7
    finally:
        main.app.dependency_overrides.clear()
