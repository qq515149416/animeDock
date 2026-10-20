import asyncio
import json
import zipfile
from types import SimpleNamespace

import httpx
import pytest


@pytest.mark.asyncio
async def test_bangumi_retries_429_and_supplies_identity():
    from app.services.bangumi_client import BangumiClient
    attempts = []

    def respond(request):
        attempts.append(request)
        return httpx.Response(429, headers={"Retry-After": "0"}) if len(attempts) == 1 else httpx.Response(200, json={"id": 9})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        async with BangumiClient(http_client=transport, redis_client=False) as client:
            assert await client.get("/v0/subjects/9") == {"id": 9}
    assert len(attempts) == 2
    assert attempts[0].headers["User-Agent"]
    assert attempts[0].url.path == "/v0/subjects/9"


@pytest.mark.asyncio
async def test_bangumi_does_not_retry_not_found_or_send_token_to_absolute_url():
    from app.services.bangumi_client import BangumiClient
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(404))) as transport:
        async with BangumiClient(http_client=transport, redis_client=False) as client:
            with pytest.raises(httpx.HTTPStatusError):
                await client.get("/v0/subjects/0")
            with pytest.raises(ValueError):
                await client.get("https://other.test/")


def test_archive_accepts_verified_manifest_and_jsonlines_members(tmp_path):
    from app.worker.import_archive import archive_url, iter_archive_records, find_archive_member
    assert archive_url({"browser_download_url": "https://github.com/a/data.zip"}) == "https://github.com/a/data.zip"
    archive_path = tmp_path / "dump.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("export/subject.jsonlines", json.dumps({"id": 1, "type": 2}) + "\n" + json.dumps({"id": 2, "type": 1}) + "\n")
        archive.writestr("episode.jsonl", json.dumps({"id": 9, "subject_id": 1}))
    with zipfile.ZipFile(archive_path) as archive:
        assert find_archive_member(archive, "subject") == "export/subject.jsonlines"
        assert list(iter_archive_records(archive, "subject")) == [{"id": 1, "type": 2}, {"id": 2, "type": 1}]
        assert list(iter_archive_records(archive, "episode")) == [{"id": 9, "subject_id": 1}]


def test_archive_malformed_lines_fail_with_location(tmp_path):
    from app.worker.import_archive import iter_archive_records
    path = tmp_path / "bad.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("subject.jsonlines", '{"id": 1}\ninvalid\n')
    with zipfile.ZipFile(path) as archive:
        with pytest.raises(ValueError, match="subject.jsonlines:2"):
            list(iter_archive_records(archive, "subject"))


def test_embedding_hash_changes_with_summary_and_uses_tag_names():
    from app.services.embedding_service import embedding_text, content_hash
    anime = SimpleNamespace(name_cn="中文名", name="Original", aliases=["Alias"], year=2026, season="autumn", category="TV", source="原创", genres=["奇幻"], tags=[{"name": "日常", "count": 100}], summary="旅行故事")
    original = embedding_text(anime)
    assert "日常" in original and "count" not in original
    anime.summary = "校园故事"
    assert content_hash(original) != content_hash(embedding_text(anime))


def test_embedding_text_caps_unicode_payload_without_breaking_characters():
    from app.services.embedding_service import embedding_text
    anime = SimpleNamespace(name_cn="中文名", name="Original", aliases=[], year=2026, season="autumn", category="TV", source="原创", genres=[], tags=[], summary="番剧剧情" * 10000)
    value = embedding_text(anime)
    assert len(value.encode("utf-8")) <= 6000
    assert "\ufffd" not in value


@pytest.mark.asyncio
async def test_embedding_rejects_dimension_mismatch():
    from app.services.embedding_service import embed_texts
    from app.config import get_settings

    class Embeddings:
        async def create(self, **kwargs):
            return SimpleNamespace(data=[SimpleNamespace(index=0, embedding=[0.2, 0.3])])

    with pytest.raises(ValueError, match="维度"):
        await embed_texts(["story"], client=SimpleNamespace(embeddings=Embeddings()))


def test_sparse_upserts_preserve_missing_sensitive_and_cover_fields():
    from app.services.ingest import _updated_fields, normalize_relation
    fields = _updated_fields({"id": 7, "name": "节目", "rating": {"score": 8.0}})
    assert "nsfw" not in fields
    assert "image_url" not in fields
    assert "summary" not in fields
    assert "score" in fields
    assert normalize_relation({"subject_id": 1, "related_subject_id": 2, "relation_type": 2}) == {"anime_id": 1, "related_id": 2, "relation_type": "前传"}


@pytest.mark.asyncio
async def test_archive_only_persists_anime_episodes_and_two_anime_relations(tmp_path, monkeypatch):
    from importlib import import_module
    module = import_module("app.worker.import_archive")
    path = tmp_path / "mixed.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("subject.jsonlines", '\n'.join(json.dumps(row) for row in [{"id": 1, "type": 2}, {"id": 2, "type": 1}, {"id": 3, "type": 2}]))
        archive.writestr("episode.jsonlines", '\n'.join(json.dumps(row) for row in [{"id": 11, "subject_id": 1}, {"id": 12, "subject_id": 2}]))
        archive.writestr("subject-relations.jsonlines", '\n'.join(json.dumps(row) for row in [{"subject_id": 1, "related_subject_id": 3, "relation_type": 3}, {"subject_id": 1, "related_subject_id": 2, "relation_type": 1}, {"subject_id": 2, "related_subject_id": 3, "relation_type": 1}]))
    stored = {"subjects": [], "episodes": [], "relations": []}

    class Session:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
        async def commit(self):
            pass

    async def subjects(db, records):
        stored["subjects"].extend(records)
        return [row["id"] for row in records]

    async def episodes(db, records):
        stored["episodes"].extend(records)

    async def relations(db, records):
        stored["relations"].extend(records)

    monkeypatch.setattr(module, "SessionLocal", Session)
    monkeypatch.setattr(module, "upsert_subjects", subjects)
    monkeypatch.setattr(module, "upsert_episodes", episodes)
    monkeypatch.setattr(module, "upsert_relations", relations)
    assert await module.load_archive(path) == {"subjects": 2, "episodes": 1, "relations": 1}
    assert [row["id"] for row in stored["subjects"]] == [1, 3]
    assert [row["id"] for row in stored["episodes"]] == [11]
    assert stored["relations"] == [{"subject_id": 1, "related_subject_id": 3, "relation_type": 3}]


@pytest.mark.asyncio
async def test_distributed_lock_prevents_duplicate_work_and_releases(monkeypatch):
    from app.worker import locks
    tokens = {}

    class Redis:
        async def set(self, key, token, **kwargs):
            if key in tokens:
                return False
            tokens[key] = token
            return True
        async def eval(self, script, key_count, key, token, *args):
            if tokens.get(key) != token:
                return 0
            if "DEL" in script:
                del tokens[key]
            return 1

    monkeypatch.setattr(locks, "get_redis", Redis)
    started, finish = asyncio.Event(), asyncio.Event()
    executions = []

    async def work():
        executions.append("started")
        started.set()
        await finish.wait()
        return 42

    first = asyncio.create_task(locks.run_locked("heavy", work))
    await started.wait()
    assert await locks.run_locked("heavy", work) is None
    finish.set()
    assert await first == 42
    assert executions == ["started"]
    assert tokens == {}


@pytest.mark.asyncio
async def test_embedding_batches_and_reorders_provider_results(monkeypatch):
    from app.services import embedding_service
    monkeypatch.setattr(embedding_service, "get_settings", lambda: SimpleNamespace(embedding_dim=2, embedding_model="test-model"))
    batch_sizes = []

    class Embeddings:
        async def create(self, *, input, model, dimensions):
            batch_sizes.append(len(input))
            return SimpleNamespace(data=[SimpleNamespace(index=index, embedding=[float(text), 1.0]) for index, text in reversed(list(enumerate(input)))])

    vectors = await embedding_service.embed_texts([str(index) for index in range(65)], client=SimpleNamespace(embeddings=Embeddings()))
    assert batch_sizes == [64, 1]
    assert vectors[0] == [0.0, 1.0]
    assert vectors[63] == [63.0, 1.0]
    assert vectors[64] == [64.0, 1.0]


def test_scheduler_weekly_import_uses_shanghai_clock():
    from datetime import datetime, timezone
    from app.worker.scheduler import create_scheduler
    scheduler = create_scheduler()
    previous = datetime(2026, 10, 18, 19, 59, tzinfo=timezone.utc)
    next_time = scheduler.get_job("import_archive").trigger.get_next_fire_time(None, previous)
    assert next_time.astimezone(timezone.utc) == datetime(2026, 10, 18, 20, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_worker_heartbeat_publishes_expiring_health_key(monkeypatch):
    from app.worker import scheduler
    written = asyncio.Event()
    observed = []

    class Redis:
        async def set(self, key, value, **kwargs):
            observed.append((key, value, kwargs))
            written.set()

    monkeypatch.setattr(scheduler, "get_redis", Redis)
    task = asyncio.create_task(scheduler.worker_heartbeat())
    await asyncio.wait_for(written.wait(), timeout=1)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    assert observed[0][0] == "worker:heartbeat"
    assert observed[0][2] == {"ex": 120}
    assert observed[0][1]


@pytest.mark.asyncio
async def test_archive_update_uses_snapshot_freshness_guard():
    from datetime import datetime, timezone
    from sqlalchemy.dialects import postgresql
    from app.services.ingest import upsert_subjects

    class Database:
        async def execute(self, statement, rows):
            self.statement = statement

    db = Database()
    cutoff = datetime(2026, 10, 13, 21, 0, tzinfo=timezone.utc)
    await upsert_subjects(db, [{"id": 1, "type": 2, "name": "Old export", "nsfw": False}], source_timestamp=cutoff)
    compiled = db.statement.compile(dialect=postgresql.dialect())
    assert "WHERE anime.updated_at <=" in str(compiled)
    assert cutoff in compiled.params.values()
