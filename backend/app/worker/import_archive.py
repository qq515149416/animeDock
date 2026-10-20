"""下载官方归档并按行导入，最后重建全文索引与增量向量。"""

import argparse
import asyncio
import gzip
import hashlib
import io
import json
import logging
import tempfile
import zipfile
from datetime import datetime
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.db import SessionLocal
from app.services.embedding_service import build_embeddings
from app.services.ingest import BATCH_SIZE, upsert_episodes, upsert_relations, upsert_subjects
from app.worker.locks import run_locked
from app.worker.logging_config import setup_logging

logger = logging.getLogger(__name__)


def archive_url(manifest: dict[str, Any]) -> str:
    """读取官方 latest.json 的 browser_download_url，并兼容早期下载键名。"""
    url = manifest.get("browser_download_url") or manifest.get("download_url")
    if not url:
        for asset in manifest.get("assets", []):
            if str(asset.get("name", "")).endswith(".zip"):
                url = asset.get("browser_download_url")
                break
    if not isinstance(url, str) or urlparse(url).scheme != "https":
        raise ValueError("官方 Archive 清单没有有效的 HTTPS ZIP 下载地址")
    return url


def find_archive_member(archive: zipfile.ZipFile, kind: str) -> str | None:
    """兼容官方 jsonlines 及常用 jsonl/ndjson 扩展名和子目录。"""
    names = {kind.replace("_", "-").lower(), kind.replace("_", "-").lower() + "s"}
    for name in archive.namelist():
        base = Path(name).name.lower().replace("_", "-")
        if base.endswith(".gz"):
            base = base[:-3]
        for extension in (".jsonlines", ".jsonl", ".ndjson", ".json"):
            if base.endswith(extension) and base[:-len(extension)] in names:
                return name
    return None


def iter_archive_records(archive: zipfile.ZipFile, kind: str) -> Iterator[dict[str, Any]]:
    """逐行解压读取，不将整个 ZIP 或数据文件装入内存。"""
    member = find_archive_member(archive, kind)
    if member is None:
        if kind == "subject":
            raise ValueError("Archive ZIP 中缺少 subject 数据文件")
        logger.warning("archive_member_missing", extra={"member": kind})
        return
    with archive.open(member) as binary:
        stream = gzip.GzipFile(fileobj=binary) if member.endswith(".gz") else binary
        with io.TextIOWrapper(stream, encoding="utf-8-sig") as text:
            for number, line in enumerate(text, 1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Archive {member}:{number} 不是有效 JSON") from exc
                if not isinstance(value, dict):
                    raise ValueError(f"Archive {member}:{number} 应为 JSON 对象")
                yield value


async def download_archive(destination: Path) -> datetime | None:
    """流式下载到临时磁盘，并核对清单大小与 SHA-256（如有）。"""
    settings = get_settings()
    headers = {"User-Agent": settings.bangumi_user_agent, "Accept": "application/json"}
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=httpx.Timeout(120, connect=20)) as client:
        for attempt in range(3):
            try:
                response = await client.get(settings.archive_manifest_url)
                response.raise_for_status()
                manifest = response.json()
                url = archive_url(manifest)
                digest = hashlib.sha256()
                size = 0
                async with client.stream("GET", url, headers={"Accept": "application/zip"}) as response:
                    response.raise_for_status()
                    with destination.open("wb") as output:
                        async for chunk in response.aiter_bytes(1024 * 1024):
                            output.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                expected_digest = str(manifest.get("digest") or "")
                if expected_digest.startswith("sha256:") and digest.hexdigest() != expected_digest.removeprefix("sha256:"):
                    raise ValueError("Archive SHA-256 校验失败，下载文件已丢弃")
                if manifest.get("size") and size != int(manifest["size"]):
                    raise ValueError("Archive 文件大小与官方清单不一致")
                logger.info("archive_downloaded", extra={"bytes": size, "sha256": digest.hexdigest()})
                exported = manifest.get("created_at")
                return datetime.fromisoformat(exported.replace("Z", "+00:00")) if exported else None
            except (httpx.TransportError, httpx.HTTPStatusError, ValueError):
                destination.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                logger.warning("archive_download_retry", extra={"attempt": attempt + 1})
                await asyncio.sleep(2 ** attempt)


async def load_archive(path: Path, source_timestamp: datetime | None = None) -> dict[str, int]:
    """仅保留 type=2 的条目及双端动画关联，每千条提交一次。"""
    stats = {"subjects": 0, "episodes": 0, "relations": 0}
    anime_ids: set[int] = set()
    with zipfile.ZipFile(path) as archive:
        async with SessionLocal() as db:
            batch: list[dict[str, Any]] = []
            for raw in iter_archive_records(archive, "subject"):
                if int(raw.get("type", 0)) != 2:
                    continue
                anime_ids.add(int(raw["id"]))
                batch.append(raw)
                if len(batch) == BATCH_SIZE:
                    stats["subjects"] += len(await upsert_subjects(db, batch, **({"source_timestamp": source_timestamp} if source_timestamp else {})))
                    await db.commit()
                    batch.clear()
            if batch:
                stats["subjects"] += len(await upsert_subjects(db, batch, **({"source_timestamp": source_timestamp} if source_timestamp else {})))
                await db.commit()
            for kind, writer in (("episode", upsert_episodes), ("subject-relations", upsert_relations)):
                batch = []
                for raw in iter_archive_records(archive, kind):
                    subject_id = int(raw.get("subject_id", 0))
                    if subject_id not in anime_ids:
                        continue
                    if kind == "subject-relations" and int(raw.get("related_subject_id", raw.get("related_id", 0))) not in anime_ids:
                        continue
                    batch.append(raw)
                    if len(batch) == BATCH_SIZE:
                        await writer(db, batch)
                        await db.commit()
                        stats["episodes" if kind == "episode" else "relations"] += len(batch)
                        batch.clear()
                if batch:
                    await writer(db, batch)
                    await db.commit()
                    stats["episodes" if kind == "episode" else "relations"] += len(batch)
    logger.info("archive_imported", extra=stats)
    return stats


async def _run_import(archive_path: str | None, generate_embeddings: bool) -> dict[str, int]:
    from app.services.search_service import rebuild_index

    if archive_path:
        stats = await load_archive(Path(archive_path))
    else:
        with tempfile.TemporaryDirectory(prefix="fanjuwu-archive-") as directory:
            path = Path(directory) / "archive.zip"
            source_timestamp = await download_archive(path)
            stats = await load_archive(path, source_timestamp)
    async with SessionLocal() as db:
        await rebuild_index(db)
        stats["embeddings"] = await build_embeddings(db) if generate_embeddings else 0
    return stats


async def import_archive(archive_path: str | None = None, generate_embeddings: bool = True) -> dict[str, int] | None:
    """全量导入入口，命令行和定时任务共享同一重任务互斥锁。"""
    return await run_locked("heavy", lambda: _run_import(archive_path, generate_embeddings))


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 Bangumi 官方动画归档")
    parser.add_argument("--archive", help="使用已下载的 ZIP，省去网络下载")
    parser.add_argument("--skip-embeddings", action="store_true", help="本次仅导入数据库和搜索索引")
    args = parser.parse_args()
    setup_logging()
    asyncio.run(import_archive(args.archive, not args.skip_embeddings))


if __name__ == "__main__":
    main()
