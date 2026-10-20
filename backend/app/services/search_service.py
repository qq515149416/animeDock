"""Meilisearch 检索、PostgreSQL 回退与安全详情读取。"""
import asyncio
import json
import logging
from datetime import date, datetime, time, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from meilisearch_python_sdk.errors import MeilisearchApiError
from meilisearch_python_sdk.models.settings import Faceting, MeilisearchSettings, Pagination
from sqlalchemy import Text, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.config import get_settings
from app.deps import get_meili_client, get_redis
from app.models import Anime, AnimeRelation, Episode
from app.schemas import AnimeCard, AnimeDetail, EpisodeResponse

logger = logging.getLogger(__name__)
FACET_FIELDS = ('category', 'source', 'region', 'genres', 'year', 'season')
MAX_INDEX_EXCLUSIONS = 5000
SORT_FIELDS: dict[str, list[str]] = {
    'relevance': [], 'score': ['score:desc', 'collects:desc'],
    'rank': ['rank:asc'], 'collects': ['collects:desc'], 'latest': ['air_date_ts:desc'],
}


def _filter_values(filters: dict[str, Any]) -> dict[str, Any]:
    """归一化内部工具和 HTTP 查询传入的筛选参数。"""
    values = dict(filters)
    values.setdefault('region', '日本')
    genres = values.get('genres') or []
    if isinstance(genres, str):
        genres = [genres]
    normalized = [value.strip() for group in genres for value in str(group).split(',') if value.strip()]
    values['genres'] = list(dict.fromkeys(normalized))
    return values


def build_meili_filters(nsfw: bool = False, omit: str | None = None, excluded_ids: list[int] | None = None, **filters: Any) -> list[str]:
    """安全构造过滤表达式；facet 只忽略自己的条件。"""
    values = _filter_values(filters)
    result: list[str] = [] if nsfw else ['nsfw = false']
    if not nsfw and excluded_ids:
        result.append('id NOT IN [' + ', '.join(str(int(value)) for value in excluded_ids) + ']')
    for field in ('category', 'source', 'region', 'season'):
        value = values.get(field)
        if field != omit and value and value != 'all':
            result.append(f'{field} = {json.dumps(str(value), ensure_ascii=False)}')
    if omit != 'year' and values.get('year') is not None:
        result.append(f'year = {int(values["year"])}')
    if omit != 'genres':
        result.extend(f'genres = {json.dumps(str(genre), ensure_ascii=False)}' for genre in values['genres'])
    if values.get('min_score') is not None:
        result.append(f'score >= {float(values["min_score"])}')
    return result


def sql_conditions(q: str = '', nsfw: bool = False, omit: str | None = None, **filters: Any) -> list[ColumnElement[bool]]:
    """构造与索引一致的 SQL 条件，作为搜索降级及统计来源。"""
    values = _filter_values(filters)
    conditions: list[ColumnElement[bool]] = []
    if not nsfw:
        conditions.append(Anime.nsfw.is_(False))
    if q.strip():
        escaped = q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        pattern = f'%{escaped}%'
        conditions.append(or_(*(column.ilike(pattern, escape='\\') for column in (
            Anime.name_cn, Anime.name, cast(Anime.aliases, Text), Anime.studio, Anime.director, cast(Anime.genres, Text),
        ))))
    for field in ('category', 'source', 'region', 'season', 'year'):
        value = values.get(field)
        if field != omit and value is not None and value != '' and value != 'all':
            conditions.append(getattr(Anime, field) == value)
    if omit != 'genres' and values['genres']:
        conditions.append(Anime.genres.contains(values['genres']))
    if values.get('min_score') is not None:
        conditions.append(Anime.score >= float(values['min_score']))
    return conditions


def anime_document(anime: Anime | dict[str, Any]) -> dict[str, Any]:
    """将动画转成可索引的完整 JSON 文档。"""
    record = dict(anime) if isinstance(anime, dict) else {column.name: getattr(anime, column.name) for column in Anime.__table__.columns}
    result: dict[str, Any] = {}
    for key, value in record.items():
        result[key] = value.isoformat() if isinstance(value, (date, datetime)) else value
    result['aliases'] = result.get('aliases') or []
    result['genres'] = result.get('genres') or []
    result['nsfw'] = bool(record.get('nsfw', True))
    result['score'] = result.get('score') or 0
    result['collects'] = result.get('collects') or 0
    result['rank'] = result.get('rank') or 2_147_483_647
    air_date = record.get('air_date')
    if isinstance(air_date, str):
        try:
            air_date = date.fromisoformat(air_date[:10])
        except ValueError:
            air_date = None
    result['air_date_ts'] = int(datetime.combine(air_date, time.min, tzinfo=timezone.utc).timestamp()) if isinstance(air_date, date) else 0
    return result


async def _configure_index(uid: str) -> Any:
    """创建索引并等待可筛选、可排序配置生效。"""
    client = get_meili_client()
    try:
        index = await client.get_index(uid)
    except MeilisearchApiError as exc:
        if getattr(exc, 'code', '') != 'index_not_found':
            raise
        index = await client.create_index(uid, primary_key='id')
    settings = MeilisearchSettings(
        searchable_attributes=['name_cn', 'name', 'aliases', 'studio', 'director', 'genres'],
        filterable_attributes=['id', *FACET_FIELDS, 'nsfw', 'score'],
        sortable_attributes=['score', 'rank', 'collects', 'year', 'air_date_ts'],
        ranking_rules=['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'collects:desc'],
        faceting=Faceting(max_values_per_facet=1000),
        pagination=Pagination(max_total_hits=1_000_000),
    )
    task = await index.update_settings(settings)
    await client.wait_for_task(task.task_uid, timeout_in_ms=120_000, raise_for_status=True)
    return index


async def _upsert_documents(records: list[dict[str, Any]]) -> None:
    """将增量条目分批提交索引，返回前确认任务成功。"""
    if not records:
        return
    index = await _configure_index(get_settings().meili_index)
    for start in range(0, len(records), 1000):
        task = await index.add_documents([anime_document(row) for row in records[start:start + 1000]], primary_key='id')
        await get_meili_client().wait_for_task(task.task_uid, timeout_in_ms=120_000, raise_for_status=True)


async def _rebuild_index(db: AsyncSession) -> None:
    """流式构建临时索引并原子交换，避免重建期间出现空库。"""
    client = get_meili_client()
    live_uid = get_settings().meili_index
    staging_uid = f'{live_uid}_rebuild_{uuid4().hex[:12]}'
    index = await _configure_index(staging_uid)
    try:
        stream = await db.stream_scalars(select(Anime).execution_options(yield_per=1000))
        async for batch in stream.partitions(1000):
            task = await index.add_documents([anime_document(anime) for anime in batch], primary_key='id')
            await client.wait_for_task(task.task_uid, timeout_in_ms=120_000, raise_for_status=True)
        await _configure_index(live_uid)
        task = await client.swap_indexes([(live_uid, staging_uid)])
        await client.wait_for_task(task.task_uid, timeout_in_ms=120_000, raise_for_status=True)
    finally:
        task = await index.delete()
        await client.wait_for_task(task.task_uid, timeout_in_ms=120_000, raise_for_status=True)


async def upsert_documents(records: list[dict[str, Any]]) -> None:
    """串行化增量写入与重建交换，避免快照覆盖较新的索引文档。"""
    if not records:
        return
    from app.worker.locks import run_locked
    await run_locked('meili-index', lambda: _upsert_documents(records), wait=True)


async def rebuild_index(db: AsyncSession) -> None:
    """持有可续期分布式租约完成全量构建，等待中的增量随后应用。"""
    from app.worker.locks import run_locked
    await run_locked('meili-index', lambda: _rebuild_index(db), wait=True)


async def _sql_facets(db: AsyncSession, q: str, nsfw: bool, filters: dict[str, Any]) -> dict[str, dict[str, int]]:
    """计算忽略自身筛选的各维度计数，敏感内容条件始终保留。"""
    facets: dict[str, dict[str, int]] = {}
    for field in FACET_FIELDS:
        conditions = sql_conditions(q, nsfw, omit=field, **filters)
        column = func.unnest(Anime.genres) if field == 'genres' else getattr(Anime, field)
        values = select(column.label('value')).where(*conditions).subquery()
        rows = await db.execute(select(values.c.value, func.count()).where(values.c.value.is_not(None)).group_by(values.c.value))
        facets[field] = {str(value): int(count) for value, count in rows if value != ''}
    return facets


async def _search_sql(db: AsyncSession, q: str, nsfw: bool, filters: dict[str, Any], page: int, page_size: int, sort: str) -> dict[str, Any]:
    """搜索引擎不可用时仍提供可用且安全的数据库检索。"""
    conditions = sql_conditions(q, nsfw, **filters)
    total = int(await db.scalar(select(func.count()).select_from(Anime).where(*conditions)) or 0)
    ordering: list[Any] = {
        'score': [Anime.score.desc(), Anime.collects.desc()],
        'rank': [func.nullif(Anime.rank, 0).asc().nulls_last()],
        'collects': [Anime.collects.desc()], 'latest': [Anime.air_date.desc().nulls_last()],
        'relevance': [Anime.collects.desc()],
    }[sort]
    if sort == 'relevance' and q.strip():
        ordering = [case((Anime.name_cn == q, 0), (Anime.name == q, 1), else_=2), *ordering]
    rows = (await db.scalars(select(Anime).where(*conditions).order_by(*ordering, Anime.id).offset((page - 1) * page_size).limit(page_size))).all()
    return {'items': [AnimeCard.model_validate(row).model_dump(mode='json') for row in rows], 'total': total, 'page': page, 'page_size': page_size, 'facets': await _sql_facets(db, q, nsfw, filters), 'engine': 'postgresql'}


async def search_anime(db: AsyncSession, q: str = '', nsfw: bool = False, **filters: Any) -> dict[str, Any]:
    """优先索引检索，失败后回退 SQL；结果从数据库重新校验敏感标志。"""
    filters = _filter_values(filters)
    page = max(1, int(filters.pop('page', 1)))
    page_size = max(1, min(60, int(filters.pop('page_size', 24))))
    sort = str(filters.pop('sort', 'relevance'))
    if sort not in SORT_FIELDS:
        raise HTTPException(422, detail={'code': 'INVALID_SORT'})
    # 数据库是敏感标记的权威来源；旧索引中的页外条目也不得进入总数和统计。
    excluded_ids: list[int] = []
    if not nsfw:
        excluded_ids = list((await db.scalars(select(Anime.id).where(Anime.nsfw.is_(True)).order_by(Anime.id).limit(MAX_INDEX_EXCLUSIONS + 1))).all())
        if len(excluded_ids) > MAX_INDEX_EXCLUSIONS:
            return await _search_sql(db, q, nsfw, filters, page, page_size, sort)
    index = get_meili_client().index(get_settings().meili_index)
    try:
        result = await index.search(q.strip(), filter=build_meili_filters(nsfw, excluded_ids=excluded_ids, **filters), sort=SORT_FIELDS[sort] or None, hits_per_page=page_size, page=page)
        facet_results = await asyncio.gather(*(index.search(q.strip(), filter=build_meili_filters(nsfw, omit=field, excluded_ids=excluded_ids, **filters), facets=[field], limit=0) for field in FACET_FIELDS))
        ids = [int(hit['id']) for hit in result.hits]
        conditions: list[Any] = [Anime.id.in_(ids)]
        if not nsfw:
            conditions.append(Anime.nsfw.is_(False))
        rows = (await db.scalars(select(Anime).where(*conditions))).all() if ids else []
        by_id = {row.id: row for row in rows}
        if len(by_id) != len(ids):
            logger.warning('stale_search_index', extra={'index_hits': len(ids), 'database_hits': len(by_id)})
            return await _search_sql(db, q, nsfw, filters, page, page_size, sort)
        facets = {field: {str(value): int(count) for value, count in (data.facet_distribution or {}).get(field, {}).items()} for field, data in zip(FACET_FIELDS, facet_results)}
        return {'items': [AnimeCard.model_validate(by_id[anime_id]).model_dump(mode='json') for anime_id in ids], 'total': int(result.total_hits or result.estimated_total_hits or 0), 'page': page, 'page_size': page_size, 'facets': facets, 'engine': 'meilisearch'}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('search_sql_fallback', extra={'error': str(exc), 'query': q})
        return await _search_sql(db, q, nsfw, filters, page, page_size, sort)


async def _subject_people(anime_id: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    """使用 24 小时缓存读取角色和制作人员，上游失败不阻断本地详情。"""
    cache = get_redis()
    key = f'anime:people:v1:{anime_id}'
    try:
        cached = await cache.get(key)
        if cached:
            payload = json.loads(cached)
            return payload['characters'], payload['persons'], True
    except Exception as exc:
        logger.warning('people_cache_read_failed', extra={'anime_id': anime_id, 'error': str(exc)})
    try:
        from app.services.bangumi_client import BangumiClient
        async with BangumiClient() as client:
            characters = await client.get(f'/v0/subjects/{anime_id}/characters')
            persons = await client.get(f'/v0/subjects/{anime_id}/persons')
        characters = characters if isinstance(characters, list) else []
        persons = persons if isinstance(persons, list) else []
    except Exception as exc:
        logger.warning('people_upstream_failed', extra={'anime_id': anime_id, 'error': str(exc)})
        return [], [], False
    try:
        await cache.set(key, json.dumps({'characters': characters, 'persons': persons}, ensure_ascii=False), ex=86400)
    except Exception as exc:
        logger.warning('people_cache_write_failed', extra={'anime_id': anime_id, 'error': str(exc)})
    return characters, persons, True


async def get_anime_detail(db: AsyncSession, anime_id: int, nsfw: bool = False) -> dict[str, Any]:
    """先校验主体可见性，再读取章节、过滤后的关联与外部人员缓存。"""
    anime = await db.get(Anime, anime_id)
    if anime is None:
        raise HTTPException(404, detail={'code': 'ANIME_NOT_FOUND', 'message': '未找到该动画'})
    if anime.nsfw and not nsfw:
        raise HTTPException(403, detail={'code': 'NSFW_BLOCKED'})
    episodes = (await db.scalars(select(Episode).where(Episode.anime_id == anime_id).order_by(Episode.type, Episode.sort, Episode.id))).all()
    relation_query = select(Anime, AnimeRelation.relation_type).join(AnimeRelation, Anime.id == AnimeRelation.related_id).where(AnimeRelation.anime_id == anime_id)
    if not nsfw:
        relation_query = relation_query.where(Anime.nsfw.is_(False))
    related = (await db.execute(relation_query.order_by(Anime.air_date, Anime.id))).all()
    characters, persons, available = await _subject_people(anime_id)
    result = AnimeDetail.model_validate(anime).model_dump(mode='json')
    result.update(episodes=[EpisodeResponse.model_validate(episode).model_dump(mode='json') for episode in episodes], related=[{**AnimeCard.model_validate(row).model_dump(mode='json'), 'relation_type': relation} for row, relation in related], characters=characters, persons=persons, enrichment_available=available)
    return result
