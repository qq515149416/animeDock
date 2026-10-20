"""真实 PostgreSQL 集成回归；设置 TEST_DATABASE_URL 后运行。

每个测试在独立且会回滚的 schema 中运行，不接触现有业务数据。
仅替代 Meilisearch、Redis 和 Bangumi 的网络边界，执行真实 SQL。
"""
import json
import os
from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db import Base
from app.models import Anime, AnimeRelation, Episode
from app.routers.meta import filters as filter_metadata
from app.services import calendar_service, search_service

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='需要 TEST_DATABASE_URL 的 PostgreSQL/pgvector 集成环境')


class OfflineSearch:
    """离线索引边界使测试固定执行 SQL 回退。"""

    def index(self, name: str):
        return self

    async def search(self, *args, **kwargs):
        raise ConnectionError('测试中的索引离线')


@pytest_asyncio.fixture
async def database(monkeypatch):
    database_url = os.environ['TEST_DATABASE_URL'].replace('postgresql://', 'postgresql+asyncpg://', 1)
    engine = create_async_engine(database_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        schema = 'test_' + uuid4().hex
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(bind=connection, expire_on_commit=False) as session:
            session.add_all([
                Anime(id=1, name='Safe TV', name_cn='安全奇幻', category='TV', source='原创', region='日本', genres=['奇幻', '冒险'], score=8.5, collects=100, year=2026, season='autumn', air_weekday=1, nsfw=False, air_date=date(2026, 10, 1)),
                Anime(id=2, name='Sensitive', name_cn='敏感条目', category='TV', source='原创', region='日本', genres=['奇幻'], score=9, collects=200, year=1999, season='winter', air_weekday=1, nsfw=True),
                Anime(id=3, name='Safe Movie', name_cn='安全电影', category='剧场版', source='漫画改', region='日本', genres=['奇幻', '冒险'], score=8, collects=90, year=2025, season='summer', air_weekday=2, nsfw=False),
                Anime(id=4, name='Chinese WEB', name_cn='中国动画', category='WEB', source='漫画改', region='中国', genres=['奇幻'], score=7, collects=80, year=2026, season='autumn', air_weekday=1, nsfw=False),
                Anime(id=5, name='Romance', name_cn='安全恋爱', category='TV', source='原创', region='日本', genres=['恋爱'], score=7.5, collects=70, year=2026, season='autumn', air_weekday=1, nsfw=False),
            ])
            await session.flush()
            session.add_all([
                AnimeRelation(anime_id=1, related_id=2, relation_type='前传'),
                AnimeRelation(anime_id=1, related_id=3, relation_type='续集'),
                Episode(id=11, anime_id=1, sort=1, type=0, airdate=date(2020, 1, 1)),
                Episode(id=12, anime_id=1, sort=2, type=0, airdate=date(2199, 1, 1)),
            ])
            await session.flush()
            monkeypatch.setattr(search_service, 'get_meili_client', OfflineSearch)
            yield session
        await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_sql_search_and_disjunctive_facets_hide_sensitive_counts(database):
    result = await search_service.search_anime(database, category='TV', genres=['奇幻'], nsfw=False)
    assert result['engine'] == 'postgresql'
    assert [item['id'] for item in result['items']] == [1]
    assert result['total'] == 1
    assert result['facets']['category'] == {'TV': 1, '剧场版': 1}
    assert result['facets']['genres'] == {'奇幻': 1, '冒险': 1, '恋爱': 1}
    assert '1999' not in result['facets']['year']
    result = await search_service.search_anime(database, category='TV', genres=['奇幻'], nsfw=True)
    assert result['total'] == 2


@pytest.mark.asyncio
async def test_detail_hides_sensitive_related_items_and_forbids_direct_access(database, monkeypatch):
    async def people(anime_id):
        return [], [], True
    monkeypatch.setattr(search_service, '_subject_people', people)
    result = await search_service.get_anime_detail(database, 1, nsfw=False)
    assert [item['id'] for item in result['related']] == [3]
    assert len(result['episodes']) == 2
    with pytest.raises(HTTPException) as error:
        await search_service.get_anime_detail(database, 2, nsfw=False)
    assert error.value.status_code == 403
    assert error.value.detail == {'code': 'NSFW_BLOCKED'}
    result = await search_service.get_anime_detail(database, 1, nsfw=True)
    assert {item['id'] for item in result['related']} == {2, 3}


@pytest.mark.asyncio
async def test_calendar_rechecks_database_after_stale_nsfw_cache(database, monkeypatch):
    class Cache:
        async def get(self, key):
            return json.dumps([{'weekday': 1, 'items': [{'id': 1, 'name': '伪造缓存名称', 'nsfw': False}, {'id': 2, 'nsfw': False}, {'id': 999, 'nsfw': False}]}])
    monkeypatch.setattr(calendar_service, 'get_redis', Cache)
    result = await calendar_service.get_calendar(database, nsfw=False)
    assert len(result) == 7
    assert [item['id'] for item in result[0]['items']] == [1]
    assert result[0]['items'][0]['name'] == 'Safe TV'
    assert result[0]['items'][0]['latest_ep'] == 1
    assert result[0]['items'][0]['is_sequel'] is False
    result = await calendar_service.get_calendar(database, nsfw=True)
    assert {item['id'] for item in result[0]['items']} == {1, 2}
    assert next(item for item in result[0]['items'] if item['id'] == 1)['is_sequel'] is True


@pytest.mark.asyncio
async def test_meta_years_omit_sensitive_only_year(database):
    safe = await filter_metadata(database, nsfw=False)
    all_content = await filter_metadata(database, nsfw=True)
    assert safe['years'] == [2026, 2025]
    assert safe['year_range'] == [2025, 2026]
    assert all_content['years'] == [2026, 2025, 1999]
