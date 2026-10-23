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
    source_provider: str = 'bangumi'
    external_id: str | None = None


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
    episodes_partial: bool = False
    banner_image_url: str = ''
    fallback_image_url: str = ''
    fallback_image_provider: str | None = None
    field_sources: dict[str, str] = Field(default_factory=dict)
    external_ratings: list[dict[str, Any]] = Field(default_factory=list)
    external_sources: list[dict[str, Any]] = Field(default_factory=list)


class AnimeEnrichment(APIModel):
    anime_id: int
    pending: bool = False
    ratings: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    supplement: dict[str, Any] = Field(default_factory=dict)
    field_sources: dict[str, str] = Field(default_factory=dict)
    providers: list[dict[str, Any]] = Field(default_factory=list)


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


class StatisticsMetadata(APIModel):
    region: Literal['日本'] = '日本'
    includes_nsfw: Literal[True] = True
    years: list[int]
    current_season: CurrentSeason
    catalog_count: int
    missing_quarter_count: int


class StatisticsGroup(APIModel):
    name: str
    count: int = 0
    rated_count: int = 0
    average_score: float | None = None
    max_score: float | None = None
    vote_count: int = 0


class StatisticsQuarter(APIModel):
    year: int
    season: Literal['winter', 'spring', 'summer', 'autumn']
    total_count: int = 0
    rated_count: int = 0
    average_score: float | None = None
    max_score: float | None = None
    vote_count: int = 0
    classified_count: int = 0
    known_source_count: int = 0
    distribution_total: int = 0
    groups: list[StatisticsGroup]


class StatisticsResponse(APIModel):
    dimension: Literal['genre', 'source']
    region: Literal['日本'] = '日本'
    includes_nsfw: Literal[True] = True
    distribution_basis: Literal['genre_occurrences', 'works']
    generated_at: datetime
    quarters: list[StatisticsQuarter]
