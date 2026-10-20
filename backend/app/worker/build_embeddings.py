"""手动增量生成向量：python -m app.worker.build_embeddings。"""

import asyncio
import logging

from app.config import get_settings
from app.db import SessionLocal
from app.services.embedding_service import build_embeddings as update_embeddings
from app.worker.locks import run_locked
from app.worker.logging_config import setup_logging


async def _build_embeddings() -> int:
    async with SessionLocal() as db:
        return await update_embeddings(db)


async def build_embeddings() -> int | None:
    """与其他重任务共享锁，避免重复调用付费向量接口。"""
    return await run_locked("heavy", _build_embeddings)


def main() -> None:
    setup_logging()
    asyncio.run(build_embeddings())


if __name__ == "__main__":
    main()
