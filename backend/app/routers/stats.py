"""只读汇总接口，固定日本并包含 NSFW，不开放作品级引用。"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas import StatisticsMetadata, StatisticsResponse
from app.services.statistics_service import get_statistics, get_statistics_metadata
from app.utils.season import SEASONS

router = APIRouter(prefix='/stats', tags=['数据统计'])
DB = Annotated[AsyncSession, Depends(get_db)]
Season = Literal['winter', 'spring', 'summer', 'autumn']


class MetadataQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')


class RangeQuery(MetadataQuery):
    dimension: Literal['genre', 'source'] = 'genre'
    start_year: int = Field(ge=1800, le=2200)
    start_season: Season
    end_year: int = Field(ge=1800, le=2200)
    end_season: Season

    @model_validator(mode='after')
    def ordered_range(self):
        if self.start_year * 4 + SEASONS.index(self.start_season) > self.end_year * 4 + SEASONS.index(self.end_season):
            raise ValueError('开始季度不能晚于结束季度')
        return self


class SeasonQuery(MetadataQuery):
    dimension: Literal['genre', 'source'] = 'genre'
    year: int = Field(ge=1800, le=2200)
    season: Season


@router.get('/meta', response_model=StatisticsMetadata)
async def metadata(db: DB, query: Annotated[MetadataQuery, Query()]) -> dict:
    return await get_statistics_metadata(db)


@router.get('/trends', response_model=StatisticsResponse)
async def trends(db: DB, query: Annotated[RangeQuery, Query()]) -> dict:
    return await get_statistics(db, **query.model_dump())


@router.get('/season', response_model=StatisticsResponse)
async def season(db: DB, query: Annotated[SeasonQuery, Query()]) -> dict:
    return await get_statistics(db, dimension=query.dimension, start_year=query.year,
        start_season=query.season, end_year=query.year, end_season=query.season)
