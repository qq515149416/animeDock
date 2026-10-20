"""设置 TEST_DATABASE_URL 后执行真实 PostgreSQL 流式导入与批量写入回归。"""

import json
import os
import zipfile
from datetime import datetime, timedelta, timezone
from importlib import import_module
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db import Base
from app.models import Anime, AnimeRelation, Episode
from app.services.ingest import upsert_subjects

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="需要 TEST_DATABASE_URL 的 PostgreSQL/pgvector 集成环境")


@pytest_asyncio.fixture
async def pipeline_db(monkeypatch):
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1))
    async with engine.connect() as connection:
        transaction = await connection.begin()
        schema = "pipeline_" + uuid4().hex
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        await connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        await connection.run_sync(Base.metadata.create_all)
        factory = lambda: AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
        monkeypatch.setattr(import_module("app.worker.import_archive"), "SessionLocal", factory)
        async with factory() as session:
            yield session
        await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_thousand_row_upsert_respects_asyncpg_bind_limit(pipeline_db):
    rows = [{"id": value, "type": 2, "name": f"动画 {value}", "name_cn": f"中文 {value}", "summary": "简介", "nsfw": False, "score_details": {"8": 100}, "favorite": {"collect": 200}, "platform": 1} for value in range(1, 1002)]
    assert len(await upsert_subjects(pipeline_db, rows)) == 1001
    assert await pipeline_db.scalar(select(func.count()).select_from(Anime)) == 1001
    await upsert_subjects(pipeline_db, [{"id": 1001, "type": 2, "name": "已更新"}])
    row = await pipeline_db.get(Anime, 1001)
    assert row.name == "已更新"
    assert row.summary == "简介"
    assert row.nsfw is False


@pytest.mark.asyncio
async def test_archive_snapshot_cannot_replace_newer_api_sensitive_flag(pipeline_db):
    await upsert_subjects(pipeline_db, [{"id": 1, "type": 2, "name": "Live", "nsfw": True, "score": 8.8}])
    await upsert_subjects(pipeline_db, [{"id": 1, "type": 2, "name": "Stale", "nsfw": False, "score": 7.1}], source_timestamp=datetime.now(timezone.utc) - timedelta(days=1))
    row = await pipeline_db.get(Anime, 1)
    assert (row.name, row.nsfw, row.score) == ("Live", True, 8.8)
    await upsert_subjects(pipeline_db, [{"id": 1, "type": 2, "name": "Fresh", "nsfw": False, "score": 9.0}], source_timestamp=datetime.now(timezone.utc) + timedelta(days=1))
    await pipeline_db.refresh(row)
    assert (row.name, row.nsfw, row.score) == ("Fresh", False, 9.0)


@pytest.mark.asyncio
async def test_tiny_zip_imports_only_animation_records(pipeline_db, tmp_path):
    path = tmp_path / "fixture.zip"
    files = {
        "subject.jsonlines": [{"id": 1, "type": 2, "name": "TV", "platform": 1, "nsfw": False}, {"id": 2, "type": 1, "name": "Comic"}, {"id": 3, "type": 2, "name": "Sequel", "platform": 1, "nsfw": True}],
        "episode.jsonlines": [{"id": 11, "subject_id": 1, "sort": 1, "airdate": "2026-10-01"}, {"id": 12, "subject_id": 2, "sort": 1}],
        "subject-relations.jsonlines": [{"subject_id": 3, "related_subject_id": 1, "relation_type": 2}, {"subject_id": 1, "related_subject_id": 2, "relation_type": 1}],
    }
    with zipfile.ZipFile(path, "w") as archive:
        for name, records in files.items():
            archive.writestr(name, "\n".join(json.dumps(row) for row in records))
    module = import_module("app.worker.import_archive")
    assert await module.load_archive(path) == {"subjects": 2, "episodes": 1, "relations": 1}
    assert (await pipeline_db.scalars(select(Anime.id).order_by(Anime.id))).all() == [1, 3]
    assert (await pipeline_db.scalars(select(Episode.id))).all() == [11]
    relation = (await pipeline_db.scalars(select(AnimeRelation))).one()
    assert (relation.anime_id, relation.related_id, relation.relation_type) == (3, 1, "前传")
