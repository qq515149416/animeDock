"""索引构建与增量更新不能在交换时丢失写入。"""
import asyncio
from types import SimpleNamespace

import pytest

from app.services import search_service
from app.worker import locks


@pytest.mark.asyncio
async def test_incremental_update_survives_rebuild_swap(monkeypatch) -> None:
    staged = asyncio.Event()
    lease = asyncio.Lock()
    documents = {'anime': {1: {'id': 1, 'summary': 'old'}}}
    task = SimpleNamespace(task_uid=1)

    class Index:
        def __init__(self, uid):
            self.uid = uid
            documents.setdefault(uid, {})

        async def add_documents(self, rows, **kwargs):
            documents[self.uid].update({row['id']: row for row in rows})
            if self.uid != 'anime':
                staged.set()
                await asyncio.sleep(0.05)
            return task

        async def delete(self):
            documents.pop(self.uid, None)
            return task

    class Client:
        async def wait_for_task(self, *args, **kwargs):
            return None

        async def swap_indexes(self, pairs):
            for left, right in pairs:
                documents[left], documents[right] = documents[right], documents[left]
            return task

    class Stream:
        async def partitions(self, size):
            yield [{'id': 1, 'summary': 'snapshot', 'nsfw': False}]

    class Database:
        async def stream_scalars(self, statement):
            return Stream()

    async def configure(uid):
        return Index(uid)

    async def serialized(name, work, **kwargs):
        async with lease:
            return await work()

    monkeypatch.setattr(search_service, '_configure_index', configure)
    monkeypatch.setattr(search_service, 'get_meili_client', Client)
    monkeypatch.setattr(locks, 'run_locked', serialized)
    rebuild = asyncio.create_task(search_service.rebuild_index(Database()))
    await staged.wait()
    update = asyncio.create_task(search_service.upsert_documents([{'id': 1, 'summary': 'latest update', 'nsfw': False}]))
    await asyncio.gather(rebuild, update)
    assert documents['anime'][1]['summary'] == 'latest update'
