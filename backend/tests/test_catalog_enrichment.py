"""Missing-field overlay must never corrupt canonical Bangumi data."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.catalog_providers import CatalogEntry

NOW = datetime(2026, 10, 22, tzinfo=timezone.utc)


def snapshot(provider='myanimelist', *, expired=False, nsfw=False, **fields):
    entry = CatalogEntry(provider, '1', f'https://myanimelist.net/anime/1', ['Example'], 'TV', '2026-10-01', 12, nsfw,
                         fields={'summary': 'External original synopsis', 'studio': 'External Studio', 'image_url': 'https://cdn.myanimelist.net/cover.jpg', **fields},
                         rating={'score': 8.1, 'scale': 10, 'rank': 10, 'votes': 500})
    return SimpleNamespace(provider=provider, status='matched', payload=entry.payload(), external_id='1', match_method='title_metadata',
                           checked_at=NOW-timedelta(hours=1), expires_at=NOW+timedelta(hours=-1 if expired else 23))


def base(**overrides):
    return {'id': 100, 'name': 'Example', 'summary': '', 'image_url': '', 'studio': '', 'director': '',
            'air_date': None, 'year': None, 'season': None, 'eps': None, 'score': 7.4, 'rank': 100,
            'aliases': [], 'genres': [], 'characters': [], 'persons': [], 'nsfw': False, **overrides}


def test_missing_bangumi_fields_are_filled_with_individual_provenance():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(), [snapshot()], now=NOW)
    assert result['supplement']['summary'] == 'External original synopsis'
    assert result['supplement']['eps'] == 12
    assert result['supplement']['air_date'] == '2026-10-01'
    assert result['field_sources']['summary'] == 'myanimelist'
    assert result['ratings'][0]['score'] == 8.1
    assert 'score' not in result['supplement']
    assert 'rank' not in result['supplement']


def test_later_canonical_update_always_wins_over_previous_fallback():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(summary='中文简介', studio='权威公司', eps=24, image_url='https://lain.bgm.tv/a.jpg'), [snapshot()], now=NOW)
    assert not {'summary', 'studio', 'eps', 'image_url'} & result['supplement'].keys()
    assert 'summary' not in result['field_sources']


def test_empty_archive_image_field_does_not_mean_official_cover_is_missing():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(image_url=''), [snapshot()], now=NOW)
    assert 'image_url' not in result['supplement']
    assert 'image_url' not in result['field_sources']
    assert result['supplement']['fallback_image_url'] == 'https://cdn.myanimelist.net/cover.jpg'
    assert result['supplement']['fallback_image_provider'] == 'myanimelist'


def test_external_cover_is_only_a_backup_even_when_bangumi_has_explicit_image():
    from app.services.catalog_enrichment import build_enrichment
    original = base(image_url='https://lain.bgm.tv/original.jpg')
    result = build_enrichment(original, [snapshot()], now=NOW)
    assert original['image_url'] == 'https://lain.bgm.tv/original.jpg'
    assert 'image_url' not in result['supplement']
    assert 'image_url' not in result['field_sources']
    assert result['supplement']['fallback_image_url'] == 'https://cdn.myanimelist.net/cover.jpg'


def test_expired_disabled_and_adult_snapshots_cannot_supply_safe_detail():
    from app.services.catalog_enrichment import build_enrichment
    for record, enabled in [(snapshot(expired=True), {'myanimelist'}), (snapshot(nsfw=True), {'myanimelist'}), (snapshot(nsfw=None), {'myanimelist'}), (snapshot(), set())]:
        result = build_enrichment(base(), [record], enabled=enabled, now=NOW)
        assert result['supplement'] == {}
        assert result['ratings'] == []
        assert result['sources'] == []


def test_explicit_nsfw_mode_can_use_adult_snapshot_without_clearing_local_flag():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(nsfw=True), [snapshot(nsfw=True)], nsfw=True, now=NOW)
    assert result['supplement']['summary']
    assert 'nsfw' not in result['supplement']


def test_mal_priority_is_independent_of_database_row_order():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(), [snapshot('anilist', director='Ani Director'), snapshot('kitsu'), snapshot()], now=NOW)
    assert result['field_sources']['summary'] == 'myanimelist'
    assert result['field_sources']['director'] == 'anilist'


def test_snapshot_missing_values_never_replace_real_values_or_insert_empty_attributions():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(), [snapshot(summary='', studio='', image_url='')], now=NOW)
    assert 'summary' not in result['supplement']
    assert 'summary' not in result['field_sources']


def test_changed_canonical_release_date_invalidates_verified_cache_identity():
    from app.services.catalog_enrichment import build_enrichment
    result = build_enrichment(base(category='TV', air_date='1990-01-01', eps=12), [snapshot()], now=NOW)
    assert result['sources'] == []
    assert result['supplement'] == {}


def test_external_episodes_fill_only_an_entirely_missing_bangumi_episode_list():
    from app.services.catalog_enrichment import build_enrichment
    external = [{'id': -1, 'sort': 1, 'name': 'External episode'}]
    result = build_enrichment(base(episodes=[]), [snapshot(episodes=external, episodes_partial=True)], now=NOW)
    assert result['supplement']['episodes'] == external
    assert result['supplement']['episodes_partial'] is True
    existing = build_enrichment(base(episodes=[{'id': 500, 'sort': 1, 'name': 'Bangumi episode'}]), [snapshot(episodes=external, episodes_partial=True)], now=NOW)
    assert 'episodes' not in existing['supplement']
    assert 'episodes_partial' not in existing['supplement']


def test_previously_cached_partial_date_is_not_overlaid_on_typed_detail():
    from app.services.catalog_enrichment import build_enrichment
    row = snapshot()
    row.payload['air_date'] = '2027-04'
    result = build_enrichment(base(category='TV',eps=12), [row], now=NOW)
    assert 'air_date' not in result['supplement']


@pytest.mark.asyncio
async def test_sensitive_anime_is_rejected_before_external_calls():
    from fastapi import HTTPException
    from app.services.catalog_enrichment import enrich_anime
    class DB:
        async def get(self, model, ident):
            return SimpleNamespace(nsfw=True)
    with pytest.raises(HTTPException) as exc:
        await enrich_anime(DB(), 100, nsfw=False)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_missing_anime_is_404_without_touching_providers():
    from fastapi import HTTPException
    from app.services.catalog_enrichment import enrich_anime
    class DB:
        async def get(self, model, ident):
            return None
    with pytest.raises(HTTPException) as exc:
        await enrich_anime(DB(), 999)
    assert exc.value.status_code == 404
