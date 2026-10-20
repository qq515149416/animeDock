"""OpenAI 兼容向量生成、增量维护与带 NSFW 策略的语义检索。"""

import asyncio
import hashlib
import logging
from typing import Any

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Anime, AnimeEmbedding

logger = logging.getLogger(__name__)


def _bounded_text(text: str) -> str:
    # UTF-8 字节上限比字符数上限更保守，避免长中文简介超出常见 8192 token 模型限制。
    return text.encode("utf-8")[:6000].decode("utf-8", errors="ignore")


def embedding_text(anime: Any) -> str:
    """拼接检索所需文本，标签仅取前十五个并限制整体长度。"""
    tags = [tag.get("name", "") if isinstance(tag, dict) else str(tag) for tag in (anime.tags or [])[:15]]
    return _bounded_text("\n".join(str(value or "") for value in (
        anime.name_cn, anime.name, "、".join(anime.aliases or []), f"{anime.year or ''} {anime.season or ''}",
        anime.category, anime.source, "、".join(anime.genres or []), "、".join(tags), anime.summary,
    )))


def content_hash(text: str) -> str:
    """记录影响向量的全部内容，便于简介变更后的增量更新。"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def embed_texts(texts: list[str], *, client: Any = None) -> list[list[float]]:
    """每批最多六十四条，校验返回顺序、长度和配置的向量维度。"""
    if not texts:
        return []
    settings = get_settings()
    if client is None and not settings.embedding_api_key:
        raise ValueError("尚未配置 EMBEDDING_API_KEY，语义检索未启用")
    owned = client is None
    client = client or AsyncOpenAI(api_key=settings.embedding_api_key, base_url=settings.embedding_base_url, max_retries=0, timeout=60)
    vectors: list[list[float]] = []
    try:
        for offset in range(0, len(texts), 64):
            batch = texts[offset:offset + 64]
            for attempt in range(3):
                try:
                    response = await client.embeddings.create(model=settings.embedding_model, input=batch, dimensions=settings.embedding_dim)
                    values = sorted(response.data, key=lambda item: item.index)
                    if len(values) != len(batch) or [item.index for item in values] != list(range(len(batch))):
                        raise ValueError("Embedding 服务返回的向量数量或序号不匹配")
                    if any(len(item.embedding) != settings.embedding_dim for item in values):
                        raise ValueError(f"Embedding 向量维度与 EMBEDDING_DIM={settings.embedding_dim} 不一致")
                    vectors.extend(item.embedding for item in values)
                    break
                except (APIConnectionError, RateLimitError, APIStatusError) as exc:
                    retryable = isinstance(exc, (APIConnectionError, RateLimitError)) or getattr(exc, "status_code", 0) >= 500
                    if not retryable or attempt == 2:
                        raise
                    logger.warning("embedding_retry", extra={"attempt": attempt + 1, "error": str(exc)})
                    await asyncio.sleep(2 ** attempt)
    finally:
        if owned:
            await client.close()
    return vectors


async def build_embeddings(db: AsyncSession) -> int:
    """以主键游标分批扫描，只为达到评分人数阈值且文本改变的动画生成向量。"""
    settings = get_settings()
    if not settings.embedding_api_key:
        logger.info("embedding_skipped_missing_key")
        return 0
    last_id = 0
    updated = 0
    while True:
        rows = (await db.execute(select(Anime, AnimeEmbedding.content_hash).outerjoin(AnimeEmbedding, AnimeEmbedding.anime_id == Anime.id).where(Anime.id > last_id).order_by(Anime.id).limit(256))).all()
        if not rows:
            break
        last_id = rows[-1][0].id
        pending: list[tuple[int, str, str]] = []
        for anime, stored_hash in rows:
            # score_details 是官方评分分布，收藏数包含未评分用户，不能当作评分人数。
            rating_count = sum(int(count or 0) for count in (anime.score_details or {}).values())
            if rating_count < settings.embed_min_collects:
                continue
            text = embedding_text(anime)
            digest = content_hash(f"{settings.embedding_base_url}\0{settings.embedding_model}\0{settings.embedding_dim}\0{text}")
            if digest != stored_hash:
                pending.append((anime.id, text, digest))
        for offset in range(0, len(pending), 64):
            batch = pending[offset:offset + 64]
            vectors = await embed_texts([row[1] for row in batch])
            statement = insert(AnimeEmbedding)
            await db.execute(statement.on_conflict_do_update(index_elements=[AnimeEmbedding.anime_id], set_={"embedding": statement.excluded.embedding, "content_hash": statement.excluded.content_hash}), [{"anime_id": row[0], "content_hash": row[2], "embedding": vector} for row, vector in zip(batch, vectors)])
            await db.commit()
            updated += len(batch)
        if not pending:
            await db.commit()
    logger.info("embeddings_updated", extra={"count": updated})
    return updated


async def semantic_search(db: AsyncSession, query: str, top_k: int = 8, nsfw: bool = False) -> list[dict[str, Any]]:
    """在 SQL 中执行敏感内容过滤，再按余弦距离返回公开字段。"""
    if not query.strip():
        return []
    vector = (await embed_texts([_bounded_text(query)]))[0]
    distance = AnimeEmbedding.embedding.cosine_distance(vector)
    statement = select(Anime, distance.label("distance")).join(AnimeEmbedding, AnimeEmbedding.anime_id == Anime.id)
    if not nsfw:
        statement = statement.where(Anime.nsfw.is_(False))
    rows = (await db.execute(statement.order_by(distance).limit(max(1, min(top_k, 20))))).all()
    return [{"id": anime.id, "name": anime.name, "name_cn": anime.name_cn, "summary": anime.summary[:200], "image_url": anime.image_url, "score": anime.score, "year": anime.year, "category": anime.category, "genres": anime.genres, "nsfw": anime.nsfw, "similarity": round(1 - float(value), 4)} for anime, value in rows]
