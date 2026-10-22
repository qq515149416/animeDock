"""Missing-only detail overlay and bounded, independently cached source reads."""
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Anime, AnimeExternalSource, Episode
from app.schemas import AnimeDetail, EpisodeResponse
from app.services.catalog_matching import match_entry, normalized_title
from app.services.catalog_providers import CatalogClient, CatalogEntry, CatalogUnavailable, LABELS, PROVIDERS, valid_date
from app.utils.season import get_season
from app.worker.locks import run_locked

logger = logging.getLogger(__name__)
FALLBACK_FIELDS = ('name', 'name_cn', 'aliases', 'summary', 'banner_image_url', 'category', 'source', 'air_date', 'year', 'season', 'air_weekday', 'eps', 'studio', 'director', 'genres', 'characters', 'persons', 'episodes')


def missing_value(field: str, value: Any) -> bool:
    if isinstance(value, str):
        return not value.strip() or (field in ('category', 'source', 'region') and value in ('其他', '未知'))
    return value is None or value == [] or (field in ('eps', 'year', 'air_weekday') and value == 0)


def configured_providers() -> set[str]:
    s = get_settings()
    return {p for p in PROVIDERS if s.external_catalog_enabled and getattr(s, f'{p}_enabled') and (p != 'myanimelist' or s.myanimelist_client_id.get_secret_value())}


def build_enrichment(detail: dict, snapshots: list[Any], *, nsfw: bool = False, enabled: set[str] | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    enabled = set(PROVIDERS) if enabled is None else enabled
    result: dict[str, Any] = {'anime_id': detail['id'], 'pending': False, 'ratings': [], 'sources': [], 'supplement': {}, 'field_sources': {}, 'providers': []}
    records = {row.provider: row for row in snapshots}
    known: dict[str, str] = {}
    for provider in PROVIDERS:
        row = records.get(provider)
        status = row.status if row else 'pending'
        if provider not in enabled:
            status = 'disabled'
        elif row and row.expires_at <= now:
            status = 'expired'
        payload = row.payload if row and status == 'matched' else {}
        if payload and not nsfw and payload.get('nsfw') is not False:
            status, payload = 'blocked', {}
        result['providers'].append({'provider': provider, 'label': LABELS[provider], 'status': status})
        if not payload:
            continue
        # Re-check identity against current Bangumi metadata even while the snapshot is fresh.
        try:
            entry = CatalogEntry(**payload)
            if match_entry(detail, [entry], known, verified=True) is None:
                continue
        except (TypeError, ValueError):
            continue
        source = {'provider': provider, 'label': LABELS[provider], 'external_id': row.external_id, 'url': entry.url,
                  'updated_at': row.checked_at.isoformat(), 'match_method': row.match_method}
        result['sources'].append(source)
        known[provider] = entry.external_id
        known.update(entry.mappings)
        if entry.rating:
            result['ratings'].append({**source, **entry.rating})
        # Archive image_url may be empty while Bangumi's image endpoint has a cover.
        # Keep external artwork separate; the shared image renderer only tries it
        # after the original image actually fails, never when metadata arrives.
        if entry.fields.get('image_url') and 'fallback_image_url' not in result['supplement']:
            result['supplement']['fallback_image_url'] = entry.fields['image_url']
            result['supplement']['fallback_image_provider'] = provider
        fields = {**entry.fields, 'category': entry.category, 'air_date': valid_date(entry.air_date), 'eps': entry.eps}
        try:
            start = date.fromisoformat(str(entry.air_date))
            fields.update(year=start.year, season=get_season(start))
        except (TypeError, ValueError):
            pass
        for name in FALLBACK_FIELDS:
            value = fields.get(name)
            if name not in result['supplement'] and missing_value(name, detail.get(name)) and not missing_value(name, value):
                result['supplement'][name] = value
                result['field_sources'][name] = provider
                if name == 'episodes':
                    result['supplement']['episodes_partial'] = bool(entry.fields.get('episodes_partial'))
    return result


async def cached_supplement(db: AsyncSession, detail: dict, nsfw: bool = False) -> dict:
    """No network requests: every response still prefers current canonical fields."""
    enabled = configured_providers()
    if not enabled:
        return detail
    rows = (await db.scalars(select(AnimeExternalSource).where(AnimeExternalSource.anime_id == detail['id']))).all()
    extra = build_enrichment(detail, list(rows), nsfw=nsfw, enabled=enabled)
    return {**detail, **extra['supplement'], 'field_sources': extra['field_sources'], 'external_ratings': extra['ratings'], 'external_sources': extra['sources']}


async def _save(db, anime_id, provider, *, status, entry=None, candidates=None, accessed_at, now, ttl):
    values = {'anime_id': anime_id, 'provider': provider, 'external_id': entry.external_id if entry else None,
              'status': status, 'match_method': 'title_metadata' if entry else '',
              'payload': entry.payload() if entry else {'candidates': [{'id': c.external_id, 'titles': c.titles[:3], 'category': c.category, 'date': c.air_date, 'eps': c.eps} for c in (candidates or [])[:5]]},
              'checked_at': now, 'expires_at': now + timedelta(seconds=ttl), 'last_accessed_at': accessed_at}
    statement = insert(AnimeExternalSource).values(**values)
    await db.execute(statement.on_conflict_do_update(index_elements=[AnimeExternalSource.anime_id, AnimeExternalSource.provider], set_={key: getattr(statement.excluded, key) for key in values if key not in ('anime_id', 'provider')}))


async def enrich_anime(db: AsyncSession, anime_id: int, nsfw: bool = False, *, mark_accessed: bool = True) -> dict:
    anime = await db.get(Anime, anime_id)
    if anime is None:
        raise HTTPException(404, detail={'code': 'ANIME_NOT_FOUND'})
    if anime.nsfw and not nsfw:
        raise HTTPException(403, detail={'code': 'NSFW_BLOCKED'})
    detail = AnimeDetail.model_validate(anime).model_dump(mode='json')
    episodes = (await db.scalars(select(Episode).where(Episode.anime_id == anime_id).order_by(Episode.type, Episode.sort))).all()
    detail['episodes'] = [EpisodeResponse.model_validate(e).model_dump(mode='json') for e in episodes]
    now = datetime.now(timezone.utc)
    if not get_settings().external_catalog_enabled:
        return build_enrichment(detail, [], nsfw=nsfw, enabled=set(), now=now)
    rows = list((await db.scalars(select(AnimeExternalSource).where(AnimeExternalSource.anime_id == anime_id))).all())
    async with CatalogClient() as client:
        enabled = {p for p in PROVIDERS if client.enabled(p)}
        cached = {r.provider: r for r in rows}
        stale = [p for p in PROVIDERS if p not in cached or cached[p].expires_at <= now or (p in enabled and cached[p].status == 'disabled')]
        if mark_accessed:
            for row in rows:
                row.last_accessed_at = now
            await db.commit()
        if not stale:
            return build_enrichment(detail, rows, nsfw=nsfw, enabled=enabled, now=now)
        fallback_result = build_enrichment(detail, rows, nsfw=nsfw, enabled=enabled, now=now)

        async def refresh():
            # Another request may have completed between our initial read and this lease.
            latest = list((await db.scalars(select(AnimeExternalSource).where(AnimeExternalSource.anime_id == anime_id).execution_options(populate_existing=True))).all())
            current = {r.provider: r for r in latest}
            known: dict[str, str] = {}
            query_titles = [detail.get('name'), *(detail.get('aliases') or []), detail.get('name_cn')]
            for row in latest:
                if row.provider in enabled and row.status == 'matched' and row.expires_at > now:
                    try:
                        e = CatalogEntry(**row.payload)
                        if match_entry(detail, [e]):
                            known[e.provider] = e.external_id
                            known.update(e.mappings)
                            query_titles = [*e.titles, *query_titles]
                    except (ValueError, TypeError):
                        pass
            for provider in PROVIDERS:
                row = current.get(provider)
                if row and row.expires_at > now and not (provider in enabled and row.status == 'disabled'):
                    continue
                accessed_at = now if mark_accessed or row is None else row.last_accessed_at
                if provider not in enabled:
                    await _save(db, anime_id, provider, status='disabled', accessed_at=accessed_at, now=now, ttl=21600)
                    continue
                candidates: list[CatalogEntry] = []
                try:
                    ident = row.external_id if row and row.status == 'matched' else known.get(provider)
                    found = None
                    if ident:
                        candidates = [await client.detail(provider, ident)]
                        found = match_entry(detail, candidates, known)
                    else:
                        seen_queries = set()
                        for title in query_titles:
                            if not title or len(str(title).strip()) < 2 or normalized_title(str(title)) in seen_queries:
                                continue
                            seen_queries.add(normalized_title(str(title)))
                            candidates = await client.search(provider, str(title), mal_id=known.get('myanimelist') if provider == 'anilist' else None)
                            found = match_entry(detail, candidates, known)
                            if found or len(seen_queries) >= 2:
                                break
                    if found:
                        if provider == 'kitsu' and not detail['episodes']:
                            try:
                                chapters, partial = await client.episodes(found.external_id, anime_id=anime_id)
                                found.fields.update(episodes=chapters, episodes_partial=partial)
                            except (CatalogUnavailable, ValueError, TypeError, KeyError):
                                logger.warning('catalog_episode_unavailable', extra={'anime_id': anime_id, 'provider': provider})
                        await _save(db, anime_id, provider, status='matched', entry=found, accessed_at=accessed_at, now=now, ttl=get_settings().external_catalog_ttl)
                        known[provider] = found.external_id
                        known.update(found.mappings)
                        query_titles = [*found.titles, *query_titles]
                    else:
                        await _save(db, anime_id, provider, status='unmatched', candidates=candidates, accessed_at=accessed_at, now=now, ttl=21600)
                except (CatalogUnavailable, ValueError, TypeError, KeyError):
                    logger.warning('catalog_provider_unavailable', extra={'anime_id': anime_id, 'provider': provider})
                    await _save(db, anime_id, provider, status='unavailable', accessed_at=accessed_at, now=now, ttl=300)
            await db.commit()
            values = list((await db.scalars(select(AnimeExternalSource).where(AnimeExternalSource.anime_id == anime_id).execution_options(populate_existing=True))).all())
            return build_enrichment(detail, values, nsfw=nsfw, enabled=enabled)

        try:
            result = await run_locked(f'catalog:{anime_id}', refresh, ttl=120)
        except Exception:
            # No unthrottled network fallback when Redis/leases are unavailable.
            await db.rollback()
            logger.warning('catalog_refresh_unavailable', extra={'anime_id': anime_id})
            result = fallback_result
            for provider in result['providers']:
                if provider['status'] in ('pending', 'expired'):
                    provider['status'] = 'unavailable'
            return result
        if result is None:
            result = fallback_result
            result['pending'] = True
        return result
