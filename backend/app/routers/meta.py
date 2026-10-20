"""筛选枚举和当前数据库的安全年份范围。"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Anime
from app.schemas import FilterMetadata
from app.utils.season import get_current_season

router = APIRouter(prefix='/meta', tags=['筛选配置'])
CATEGORIES = ['TV', '剧场版', 'OVA', 'WEB', '其他']
SOURCES = ['原创', '漫画改', '小说改', '游戏改', '动画改', '其他']
REGIONS = ['日本', '中国', '欧美', '韩国', '其他']
GENRES = ['恋爱', '搞笑', '奇幻', '科幻', '异世界', '日常', '治愈', '热血', '悬疑', '运动', '音乐', '百合', '机战', '战斗', '校园', '后宫', '冒险', '推理', '历史', '偶像', '美食', '惊悚']


@router.get('/filters', response_model=FilterMetadata)
async def filters(db: Annotated[AsyncSession, Depends(get_db)], nsfw: bool = False) -> dict:
    """年份仅从当前可见条目统计，空库不会伪造可用年份。"""
    statement = select(Anime.year).where(Anime.year.is_not(None)).distinct().order_by(Anime.year.desc())
    if not nsfw:
        statement = statement.where(Anime.nsfw.is_(False))
    years = list((await db.scalars(statement)).all())
    current_year, current_season = get_current_season()
    return {'categories': CATEGORIES, 'sources': SOURCES, 'regions': REGIONS, 'genres': GENRES, 'years': years, 'year_range': [min(years), max(years)] if years else None, 'current_season': {'year': current_year, 'season': current_season}}
