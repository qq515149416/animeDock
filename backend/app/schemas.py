"""公开 API 的 Pydantic 响应模型。"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    """允许从 ORM 对象构造响应。"""

    model_config = ConfigDict(from_attributes=True)


class AnimeCard(APIModel):
    """列表、放送及助手共同使用的动画概要。"""

    id: int
    name: str = ''
    name_cn: str = ''
    image_url: str = ''
    aliases: list[str] = Field(default_factory=list)
    summary: str = ''
    score: float = 0
    rank: int | None = None
    collects: int = 0
    category: str = '其他'
    source: str = '其他'
    region: str = '日本'
    genres: list[str] = Field(default_factory=list)
    year: int | None = None
    season: str | None = None
    air_date: date | None = None
    air_weekday: int | None = None
    eps: int | None = None
    studio: str = ''
    director: str = ''
    nsfw: bool = False
    latest_ep: float | None = None
    is_new: bool = False
    is_sequel: bool = False


class EpisodeResponse(APIModel):
    """章节列表项。"""

    id: int
    anime_id: int
    sort: float = 0
    type: int = 0
    name: str = ''
    name_cn: str = ''
    airdate: date | None = None
    duration: str = ''
    description: str = ''


class RelatedAnime(AnimeCard):
    relation_type: str


class AnimeDetail(AnimeCard):
    """完整动画详情，人员字段保留上游结构。"""

    aliases: list[str] = Field(default_factory=list)
    summary: str = ''
    platform_raw: str = ''
    score_details: dict[str, Any] = Field(default_factory=dict)
    tags: list[dict[str, Any]] = Field(default_factory=list)
    meta_tags: list[str] = Field(default_factory=list)
    infobox_raw: str = ''
    updated_at: datetime | None = None
    episodes: list[EpisodeResponse] = Field(default_factory=list)
    related: list[RelatedAnime] = Field(default_factory=list)
    characters: list[dict[str, Any]] = Field(default_factory=list)
    persons: list[dict[str, Any]] = Field(default_factory=list)
    enrichment_available: bool = True


class SearchResponse(APIModel):
    items: list[AnimeCard]
    total: int
    page: int
    page_size: int = 24
    facets: dict[str, dict[str, int]] = Field(default_factory=dict)
    engine: Literal['meilisearch', 'postgresql'] = 'meilisearch'


class Suggestion(APIModel):
    id: int
    name_cn: str = ''
    name: str = ''
    image_url: str = ''
    year: int | None = None
    nsfw: bool = False


class CalendarDay(APIModel):
    weekday: int = Field(ge=1, le=7)
    items: list[AnimeCard] = Field(default_factory=list)


class CurrentSeason(APIModel):
    year: int
    season: str


class FilterMetadata(APIModel):
    categories: list[str]
    sources: list[str]
    regions: list[str]
    genres: list[str]
    years: list[int]
    year_range: list[int] | None = None
    seasons: list[str] = ['winter', 'spring', 'summer', 'autumn']
    current_season: CurrentSeason


class HealthResponse(APIModel):
    status: Literal['ok', 'degraded']
    services: dict[str, bool]
