"""放送缓存回源及数据库二次可见性校验。"""
import json
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_redis
from app.models import Anime, AnimeRelation, Episode
from app.schemas import AnimeCard
from app.utils.season import get_current_season

logger = logging.getLogger(__name__)


def filter_calendar_payload(payload: list[dict[str, Any]], nsfw: bool = False) -> list[dict[str, Any]]:
    """只接受明确非敏感的缓存项，输出固定七天且不修改原缓存。"""
    days: dict[int, list[dict[str, Any]]] = {day: [] for day in range(1, 8)}
    for group in payload:
        weekday = group.get('weekday')
        if isinstance(weekday, dict):
            weekday = weekday.get('id')
        if weekday not in days:
            continue
        for item in group.get('items', []):
            if isinstance(item, dict) and (nsfw or item.get('nsfw') is False):
                days[weekday].append(dict(item))
    return [{'weekday': day, 'items': items} for day, items in days.items()]


async def get_calendar(db: AsyncSession, nsfw: bool = False) -> list[dict[str, Any]]:
    """优先缓存，空缓存实时同步，最终由数据库强制校验所有条目。"""
    payload: list[dict[str, Any]] | None = None
    try:
        raw = await get_redis().get('calendar:v1')
        if raw:
            decoded = json.loads(raw)
            if isinstance(decoded, list):
                payload = decoded
    except Exception as exc:
        logger.warning('calendar_cache_read_failed', extra={'error': str(exc)})
    if payload is None:
        try:
            from app.worker.sync_calendar import sync_calendar
            await sync_calendar()
            raw = await get_redis().get('calendar:v1')
            payload = json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning('calendar_refresh_failed', extra={'error': str(exc)})
    current_year, current_season = get_current_season()
    if payload is not None:
        safe_payload = filter_calendar_payload(payload, nsfw)
        day_ids = {group['weekday']: [int(item['id']) for item in group['items'] if str(item.get('id', '')).isdigit()] for group in safe_payload}
        ids = {anime_id for values in day_ids.values() for anime_id in values}
        query = select(Anime).where(Anime.id.in_(ids))
    else:
        day_ids = None
        query = select(Anime).where(Anime.year == current_year, Anime.season == current_season, Anime.air_weekday.between(1, 7))
    if not nsfw:
        query = query.where(Anime.nsfw.is_(False))
    anime_rows = (await db.scalars(query.order_by(Anime.collects.desc(), Anime.id))).all()
    ids = [row.id for row in anime_rows]
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
    latest_rows = await db.execute(select(Episode.anime_id, func.max(Episode.sort)).where(Episode.anime_id.in_(ids), Episode.type == 0, Episode.airdate <= today).group_by(Episode.anime_id))
    latest = dict(latest_rows.all())
    prequel_query = select(AnimeRelation.anime_id).join(Anime, Anime.id == AnimeRelation.related_id).where(AnimeRelation.anime_id.in_(ids), AnimeRelation.relation_type.in_(['前传', '前作', 'prequel', '1']))
    if not nsfw:
        prequel_query = prequel_query.where(Anime.nsfw.is_(False))
    sequels = set((await db.scalars(prequel_query)).all())
    cards: dict[int, dict[str, Any]] = {}
    for row in anime_rows:
        card = AnimeCard.model_validate(row).model_dump(mode='json')
        card.update(latest_ep=latest.get(row.id), is_new=row.year == current_year and row.season == current_season, is_sequel=row.id in sequels)
        cards[row.id] = card
    result = []
    for weekday in range(1, 8):
        selected = [cards[anime_id] for anime_id in day_ids[weekday] if anime_id in cards] if day_ids is not None else [cards[row.id] for row in anime_rows if row.air_weekday == weekday]
        unique = {item['id']: item for item in selected}
        result.append({'weekday': weekday, 'items': sorted(unique.values(), key=lambda item: (-item['collects'], item['id']))})
    return result
