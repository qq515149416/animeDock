"""External HTTP boundaries and matching mistakes that would show the wrong work."""
from datetime import date
import json

import httpx
import pytest


def entry(**overrides):
    from app.services.catalog_providers import CatalogEntry
    return CatalogEntry(provider='myanimelist', external_id='1', url='https://myanimelist.net/anime/1',
                        titles=['Cowboy Bebop', 'カウボーイビバップ'], category='TV',
                        air_date='1998-04-03', eps=26, nsfw=False, **overrides)


def local(**overrides):
    return {'name': 'カウボーイビバップ', 'name_cn': '星际牛仔', 'aliases': [],
            'category': 'TV', 'air_date': date(1998, 4, 3), 'eps': 26, **overrides}


def test_exact_native_title_plus_metadata_matches_without_equal_numeric_ids():
    from app.services.catalog_matching import match_entry
    found = match_entry(local(), [entry()])
    assert found.external_id == '1'


@pytest.mark.parametrize('changes', [
    {'category': '剧场版'}, {'eps': 12}, {'air_date': date(2023, 4, 3)},
    {'name': 'カウボーイビバップ 2', 'aliases': []},
])
def test_conflicting_season_movie_episode_count_or_remake_is_rejected(changes):
    from app.services.catalog_matching import match_entry
    assert match_entry(local(**changes), [entry()]) is None


def test_ambiguous_same_title_is_not_arbitrarily_chosen():
    from app.services.catalog_matching import match_entry
    other = entry()
    other.external_id = '2'
    assert match_entry(local(), [entry(), other]) is None


def test_no_date_requires_format_and_episode_evidence():
    from app.services.catalog_matching import match_entry
    assert match_entry(local(air_date=None), [entry()]) is not None
    assert match_entry(local(air_date=None, eps=None), [entry()]) is None


def test_credentials_are_masked_and_public_mal_request_never_sends_secret():
    from app.config import Settings
    from app.services.catalog_providers import CatalogClient
    settings = Settings(_env_file=None, myanimelist_client_id='private-client-id', myanimelist_client_secret='private-client-secret')
    assert 'private-client-id' not in repr(settings)
    assert 'private-client-secret' not in repr(settings)


@pytest.mark.asyncio
async def test_mal_public_query_normalizes_native_title_score_and_original_summary():
    from app.config import Settings
    from app.services.catalog_providers import CatalogClient
    seen = []
    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={'data': [{'node': {
            'id': 1, 'title': 'Cowboy Bebop', 'alternative_titles': {'ja': 'カウボーイビバップ'},
            'start_date': '1998-04-03', 'num_episodes': 26, 'media_type': 'tv', 'nsfw': 'white',
            'mean': 8.75, 'rank': 40, 'num_scoring_users': 900, 'synopsis': 'Original English synopsis',
            'studios': [{'id': 1, 'name': 'Sunrise'}], 'main_picture': {'large': 'https://cdn.myanimelist.net/cover.jpg'},
        }}]})
    settings = Settings(_env_file=None, myanimelist_client_id='private-client-id', myanimelist_client_secret='private-client-secret')
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(settings=settings, http_client=http, redis_client=False) as client:
            values = await client.search('myanimelist', 'Cowboy Bebop')
    assert seen[0].headers['X-MAL-CLIENT-ID'] == 'private-client-id'
    assert 'private-client-secret' not in str(seen[0].headers) + str(seen[0].url)
    assert values[0].rating == {'score': 8.75, 'scale': 10, 'rank': 40, 'votes': 900}
    assert values[0].fields['summary'] == 'Original English synopsis'
    assert values[0].fields['studio'] == 'Sunrise'
    assert values[0].titles == ['Cowboy Bebop', 'カウボーイビバップ']
    assert values[0].nsfw is False


@pytest.mark.asyncio
async def test_kitsu_included_mappings_are_attached_to_the_correct_resource():
    from app.services.catalog_providers import CatalogClient
    def respond(request):
        return httpx.Response(200, json={'data': [{'id': '42', 'attributes': {
            'titles': {'en': 'Cowboy Bebop', 'ja_jp': 'カウボーイビバップ'}, 'subtype': 'TV',
            'averageRating': '82.27', 'userCount': 10000, 'ratingRank': 205, 'nsfw': False,
            'episodeCount': 26, 'startDate': '1998-04-03',
        }, 'relationships': {'mappings': {'data': [{'type': 'mappings', 'id': 'm1'}]}}}],
        'included': [{'id': 'm1', 'type': 'mappings', 'attributes': {'externalSite': 'myanimelist/anime', 'externalId': '1'}},
                     {'id': 'unrelated', 'type': 'mappings', 'attributes': {'externalSite': 'anilist/anime', 'externalId': '99'}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            values = await client.search('kitsu', 'Cowboy Bebop')
    assert values[0].mappings == {'myanimelist': '1'}
    assert values[0].rating['scale'] == 100
    assert values[0].rating['votes'] is None  # userCount counts library users, not voters.


@pytest.mark.asyncio
async def test_anilist_errors_are_not_mistaken_for_empty_search_results():
    from app.services.catalog_providers import CatalogClient, CatalogUnavailable
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={'errors': [{'message': 'rate limit'}], 'data': None}))) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            with pytest.raises(CatalogUnavailable):
                await client.search('anilist', 'Cowboy Bebop')


@pytest.mark.asyncio
async def test_rate_limit_is_reported_without_retry_storm():
    from app.services.catalog_providers import CatalogClient, CatalogUnavailable
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(429, headers={'Retry-After': '60'})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            with pytest.raises(CatalogUnavailable):
                await client.search('kitsu', 'Cowboy Bebop')
    assert len(calls) == 1


def test_html_is_plain_text_and_unsafe_image_urls_are_ignored():
    from app.services.catalog_providers import clean_text, safe_image
    assert clean_text('<p>Hello<br>world</p><script>steal()</script>') == 'Hello\nworld'
    assert safe_image('javascript:alert(1)') == ''
    assert safe_image('http://169.254.169.254/latest') == ''
    assert safe_image('https://media.kitsu.app/cover.jpg') == 'https://media.kitsu.app/cover.jpg'


@pytest.mark.parametrize('value', ['2027', '2027-04', '2027-02-30', 'invalid'])
def test_partial_or_invalid_mal_date_cannot_enter_typed_detail(value):
    from app.services.catalog_providers import normalize_mal
    e = normalize_mal({'id': 1, 'title': 'Example', 'start_date': value})
    assert e.air_date is None


def test_partial_known_release_year_still_rejects_a_remake_with_same_title():
    from app.services.catalog_matching import match_entry
    e = entry()
    e.air_date = None
    e.fields['year'] = 2027
    assert match_entry(local(), [e]) is None


@pytest.mark.asyncio
@pytest.mark.parametrize('method', ['search', 'detail', 'episodes'])
async def test_malformed_nested_kitsu_data_is_a_provider_failure(method):
    from app.services.catalog_providers import CatalogClient, CatalogUnavailable
    node = {'id': '1', 'attributes': 'invalid'}
    def respond(request):
        return httpx.Response(200, json={'data': node if method == 'detail' else [node]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            with pytest.raises(CatalogUnavailable):
                if method == 'search': await client.search('kitsu', 'Example')
                elif method == 'detail': await client.detail('kitsu', '1')
                else: await client.episodes('1', anime_id=100)


@pytest.mark.asyncio
async def test_kitsu_episode_fallback_uses_display_only_ids_and_preserves_airdate():
    from app.services.catalog_providers import CatalogClient
    def respond(request):
        return httpx.Response(200, json={'data': [{'id': '88', 'attributes': {'number': 1, 'canonicalTitle': 'Asteroid Blues', 'titles': {'en_jp': 'Asteroid Blues', 'ja_jp': 'アステロイド・ブルース'}, 'airdate': '1998-04-03', 'synopsis': 'Episode synopsis', 'length': 25}}], 'links': {'next': None}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            episodes, partial = await client.episodes('1', anime_id=100)
    assert episodes[0]['id'] == -88
    assert episodes[0]['anime_id'] == 100
    assert episodes[0]['name'] == 'アステロイド・ブルース'
    assert episodes[0]['airdate'] == '1998-04-03'
    assert episodes[0]['source_provider'] == 'kitsu'
    assert partial is False


@pytest.mark.asyncio
@pytest.mark.parametrize('airdate', ['2027-04', 'invalid'])
async def test_invalid_episode_date_is_unknown_instead_of_breaking_response(airdate):
    from app.services.catalog_providers import CatalogClient
    def respond(request):
        return httpx.Response(200, json={'data': [{'id': '88', 'attributes': {'number': 1, 'airdate': airdate}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with CatalogClient(http_client=http, redis_client=False) as client:
            episodes, _ = await client.episodes('1', anime_id=100)
    assert episodes[0]['airdate'] is None
