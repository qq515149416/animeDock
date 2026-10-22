"""Expiring source cache exercised against real PostgreSQL, isolated by schema."""
from datetime import date, datetime, timedelta, timezone
import os
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db import Base
from app.models import Anime
from app.services.catalog_providers import CatalogEntry

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='需要 TEST_DATABASE_URL')


@pytest_asyncio.fixture
async def database():
    engine = create_async_engine(os.environ['TEST_DATABASE_URL'])
    async with engine.connect() as connection:
        transaction = await connection.begin()
        schema = 'test_' + uuid4().hex
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        await connection.execution_options(schema_translate_map={None: schema})
        await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode='create_savepoint') as session:
            session.add(Anime(id=100, name='Example', category='TV', air_date=date(2026, 10, 1), eps=12, nsfw=False, summary=''))
            await session.flush()
            yield session
        await transaction.rollback()
    await engine.dispose()


def source(provider):
    return CatalogEntry(provider, '1', f'https://myanimelist.net/anime/1', ['Example'], 'TV', '2026-10-01', 12, False,
                        fields={'summary': 'External synopsis'}, rating={'score': 8, 'scale': 10, 'rank': None, 'votes': None})


@pytest.mark.asyncio
async def test_cache_prevents_repeat_requests_and_never_writes_canonical_fields(database, monkeypatch):
    from app.services import catalog_enrichment as service
    from app.models import AnimeExternalSource
    calls = []
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def enabled(self, provider): return provider == 'myanimelist'
        async def search(self, provider, query, mal_id=None):
            calls.append((provider, query))
            return [source(provider)]
    async def lock(name, task, **kwargs): return await task()
    monkeypatch.setattr(service, 'CatalogClient', Client)
    monkeypatch.setattr(service, 'run_locked', lock)
    result = await service.enrich_anime(database, 100)
    again = await service.enrich_anime(database, 100)
    assert result['supplement']['summary'] == again['supplement']['summary'] == 'External synopsis'
    assert len(calls) == 1
    assert (await database.get(Anime, 100)).summary == ''
    assert len((await database.scalars(select(AnimeExternalSource))).all()) == 3


@pytest.mark.asyncio
async def test_one_provider_failure_does_not_erase_another_success(database, monkeypatch):
    from app.services import catalog_enrichment as service
    from app.services.catalog_providers import CatalogUnavailable
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def enabled(self, provider): return provider in ('myanimelist', 'kitsu')
        async def search(self, provider, query, mal_id=None):
            if provider == 'myanimelist': raise CatalogUnavailable(provider)
            return [source(provider)]
        async def episodes(self, external_id, *, anime_id): return [], False
    async def lock(name, task, **kwargs): return await task()
    monkeypatch.setattr(service, 'CatalogClient', Client)
    monkeypatch.setattr(service, 'run_locked', lock)
    result = await service.enrich_anime(database, 100)
    assert result['field_sources']['summary'] == 'kitsu'
    assert next(p for p in result['providers'] if p['provider']=='myanimelist')['status'] == 'unavailable'


@pytest.mark.asyncio
async def test_unmatched_result_is_negative_cached_and_lock_contention_is_pending(database, monkeypatch):
    from app.services import catalog_enrichment as service
    calls = []
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        def enabled(self,p): return p=='myanimelist'
        async def search(self,*args,**kwargs): calls.append(1); return []
    async def lock(name, task, **kwargs): return await task()
    monkeypatch.setattr(service,'CatalogClient',Client)
    monkeypatch.setattr(service,'run_locked',lock)
    first=await service.enrich_anime(database,100)
    second=await service.enrich_anime(database,100)
    assert first['sources']==second['sources']==[]
    assert len(calls)==1
    async def busy(*args,**kwargs): return None
    monkeypatch.setattr(service,'run_locked',busy)
    from app.models import AnimeExternalSource
    rows=(await database.scalars(select(AnimeExternalSource))).all()
    for row in rows: row.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
    await database.flush()
    assert (await service.enrich_anime(database,100))['pending'] is True


@pytest.mark.asyncio
async def test_redis_failure_returns_original_detail_without_expired_orm_access(database, monkeypatch):
    from app.services import catalog_enrichment as service
    from app.models import AnimeExternalSource
    database.add(AnimeExternalSource(anime_id=100,provider='kitsu',status='unmatched',payload={},match_method='',expires_at=datetime.now(timezone.utc)-timedelta(hours=1)))
    await database.flush()
    async def broken(*args,**kwargs): raise ConnectionError('Redis offline')
    monkeypatch.setattr(service,'run_locked',broken)
    result=await service.enrich_anime(database,100)
    assert result['supplement']=={}
    assert result['pending'] is False
    assert next(p for p in result['providers'] if p['provider']=='kitsu')['status']=='unavailable'


@pytest.mark.asyncio
async def test_worker_can_report_and_continue_after_enrichment_rolls_back(database, monkeypatch):
    from contextlib import asynccontextmanager
    from app.worker import refresh_external as worker
    @asynccontextmanager
    async def factory(): yield database
    async def failed(db, anime_id, **kwargs):
        await db.rollback()
        return {'sources': [], 'field_sources': {}, 'providers': []}
    monkeypatch.setattr(worker,'SessionLocal',factory)
    monkeypatch.setattr(worker,'enrich_anime',failed)
    report=await worker._refresh_external(limit=1,sample=True)
    assert report['items'][0]['name']=='Example'
    assert report['items'][0]['category']=='TV'
