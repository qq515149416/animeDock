"""动画库检索、联想和详情接口。"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas import AnimeDetail, AnimeEnrichment, SearchResponse, Suggestion
from app.services.search_service import get_anime_detail, search_anime

router = APIRouter(prefix='/anime', tags=['动画库'])
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get('/search', response_model=SearchResponse)
async def search(
    db: DB,
    q: str = Query('', max_length=200),
    category: str | None = None,
    source: str | None = None,
    region: str = '日本',
    genres: list[str] = Query(default=[]),
    year: int | None = Query(None, ge=1800, le=2200),
    season: Literal['winter', 'spring', 'summer', 'autumn'] | None = None,
    min_score: float | None = Query(None, ge=0, le=10),
    sort: Literal['relevance', 'score', 'rank', 'collects', 'latest'] = 'relevance',
    page: int = Query(1, ge=1, le=100_000),
    page_size: int = Query(24, ge=1, le=60),
    nsfw: bool = False,
) -> dict:
    """按结构化条件检索动画，类型条件取交集。"""
    return await search_anime(db, q=q, nsfw=nsfw, category=category, source=source, region=region, genres=genres, year=year, season=season, min_score=min_score, sort=sort, page=page, page_size=page_size)


@router.get('/suggest', response_model=list[Suggestion])
async def suggest(db: DB, q: str = Query('', max_length=200), nsfw: bool = False) -> list[dict]:
    """返回最多八条安全的跨地区名称联想。"""
    if not q.strip():
        return []
    result = await search_anime(db, q=q, nsfw=nsfw, region='all', page_size=8)
    return result['items']


@router.get('/{anime_id}', response_model=AnimeDetail)
async def detail(db: DB, anime_id: int, nsfw: bool = False) -> dict:
    """敏感条目关闭开关时返回 NSFW_BLOCKED。"""
    return await get_anime_detail(db, anime_id, nsfw=nsfw)


@router.get('/{anime_id}/enrichment', response_model=AnimeEnrichment)
async def enrichment(db: DB, anime_id: int, nsfw: bool = False) -> dict:
    """异步加载多平台评分、来源链接和缺失字段，不阻塞主详情接口。"""
    from app.services.catalog_enrichment import enrich_anime
    return await enrich_anime(db, anime_id, nsfw=nsfw)
