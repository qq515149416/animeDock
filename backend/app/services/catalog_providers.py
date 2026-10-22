"""Read-only catalog adapters. Keep normalized public metadata, never account data."""
import asyncio
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import math
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.config import Settings, get_settings
from app.deps import get_redis

PROVIDERS = ('myanimelist', 'kitsu', 'anilist')
LABELS = {'myanimelist': 'MyAnimeList', 'kitsu': 'Kitsu', 'anilist': 'AniList'}
CATEGORIES = {'tv': 'TV', 'tv_short': 'TV', 'movie': '剧场版', 'ona': 'WEB', 'ova': 'OVA', 'special': '特别篇', 'tv_special': '特别篇', 'music': '音乐'}
SOURCES = {'original': '原创', 'manga': '漫画改', 'light_novel': '轻小说改', 'novel': '小说改', 'visual_novel': '游戏改', 'video_game': '游戏改', 'game': '游戏改', 'web_manga': '漫画改'}
GENRES = {'Action': '动作', 'Adventure': '冒险', 'Comedy': '搞笑', 'Drama': '剧情', 'Fantasy': '奇幻', 'Horror': '恐怖', 'Mystery': '悬疑', 'Romance': '恋爱', 'Sci-Fi': '科幻', 'Slice of Life': '日常', 'Sports': '运动', 'Supernatural': '超自然', 'Music': '音乐', 'Psychological': '心理', 'Thriller': '惊悚', 'Mecha': '机战'}
MAL_FIELDS = 'alternative_titles,start_date,synopsis,mean,rank,num_scoring_users,nsfw,media_type,num_episodes,studios,source,broadcast,genres'
_SLOT = """
local tm = redis.call('TIME')
local now = tm[1]*1000 + math.floor(tm[2]/1000)
local next = tonumber(redis.call('GET', KEYS[1]) or '0')
if next > now then return next-now end
redis.call('SET', KEYS[1], now+tonumber(ARGV[1]), 'PX', ARGV[1])
return 0
"""
_ANI_FIELDS = '''id idMal siteUrl title { romaji english native } synonyms format
startDate { year month day } episodes isAdult description(asHtml:false)
coverImage { extraLarge large } bannerImage averageScore rankings { rank type allTime }
stats { scoreDistribution { amount } } genres source(version:2)
studios(isMain:true) { nodes { name isAnimationStudio } }
staff(perPage:25) { edges { role node { id name { full native } } } }
characters(perPage:25,sort:[ROLE,RELEVANCE]) { edges { role
node { id name { full native } image { large medium } }
voiceActors(language:JAPANESE) { id name { full native } image { large medium } } } }'''


class CatalogUnavailable(Exception):
    """Deliberately excludes request URLs, headers and credentials."""


class _PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('p', 'br', 'div', 'li') and not self.hidden:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'li') and not self.hidden:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def clean_text(value: Any) -> str:
    parser = _PlainText()
    parser.feed(str(value or '')[:30000])
    return '\n'.join(line.strip() for line in ''.join(parser.parts).splitlines() if line.strip()).strip()


def safe_image(value: Any) -> str:
    value = str(value or '').strip()
    try:
        url = urlsplit(value)
        host = url.hostname or ''
        allowed = ('anilist.co', 'myanimelist.net', 'kitsu.app', 'kitsu.io')
        if url.scheme == 'https' and not url.username and not url.password and url.port in (None, 443) and any(host == item or host.endswith('.' + item) for item in allowed):
            return value[:2048]
    except ValueError:
        pass
    return ''


def _number(value: Any, scale: int | None = None) -> float | None:
    try:
        number = float(value)
        if math.isfinite(number) and number > 0 and (scale is None or number <= scale):
            return number
    except (ValueError, TypeError):
        pass
    return None


def _count(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def valid_date(value: Any) -> str | None:
    """MAL allows year/month-only dates; never invent a day or break typed API dates."""
    if not isinstance(value, str) or len(value) != 10:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def _year(value: Any) -> int | None:
    text = str(value or '')[:4]
    return int(text) if text.isascii() and text.isdigit() and 1800 <= int(text) <= 2200 else None


def _titles(values: list[Any]) -> list[str]:
    return list(dict.fromkeys(text for value in values if (text := clean_text(value))))[:40]


def _id(value: Any) -> str:
    value = str(value or '')
    if not value.isascii() or not value.isdigit() or int(value) <= 0:
        raise ValueError('Invalid catalog id')
    return str(int(value))


@dataclass
class CatalogEntry:
    provider: str
    external_id: str
    url: str
    titles: list[str]
    category: str
    air_date: str | None
    eps: int | None
    nsfw: bool | None
    fields: dict[str, Any] = field(default_factory=dict)
    rating: dict[str, Any] = field(default_factory=dict)
    mappings: dict[str, str] = field(default_factory=dict)

    def payload(self) -> dict[str, Any]:
        return asdict(self)


def normalize_mal(node: dict) -> CatalogEntry:
    ident = _id(node.get('id'))
    alternative = node.get('alternative_titles') or {}
    titles = _titles([node.get('title'), alternative.get('ja'), alternative.get('en'), *(alternative.get('synonyms') or [])])
    fields = {'name': clean_text(alternative.get('ja') or node.get('title')), 'aliases': titles,
              'summary': clean_text(node.get('synopsis')), 'image_url': safe_image((node.get('main_picture') or {}).get('large') or (node.get('main_picture') or {}).get('medium')),
              'studio': ' / '.join(clean_text(s.get('name')) for s in node.get('studios', []) if s.get('name')),
              'source': SOURCES.get(node.get('source'), ''), 'year': _year(node.get('start_date')),
              'genres': [GENRES.get(g.get('name'), clean_text(g.get('name'))) for g in node.get('genres', []) if g.get('name')]}
    weekday = {'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7}.get((node.get('broadcast') or {}).get('day_of_the_week'))
    fields['air_weekday'] = weekday
    fields['air_time'] = clean_text((node.get('broadcast') or {}).get('start_time'))  # MAL broadcast time is JST; do not expose as Beijing time.
    fields.pop('air_time', None)
    return CatalogEntry('myanimelist', ident, f'https://myanimelist.net/anime/{ident}', titles,
                        CATEGORIES.get(str(node.get('media_type', '')).lower(), ''), valid_date(node.get('start_date')), _count(node.get('num_episodes')),
                        False if node.get('nsfw') == 'white' else True if node.get('nsfw') in ('gray', 'black') else None,
                        fields, {'score': _number(node.get('mean'), 10), 'scale': 10, 'rank': _count(node.get('rank')), 'votes': _count(node.get('num_scoring_users'))})


def normalize_kitsu(node: dict, included: list[dict]) -> CatalogEntry:
    ident = _id(node.get('id'))
    a = node.get('attributes') or {}
    relationships = node.get('relationships') or {}
    mapping_ids = {str(x.get('id')) for x in (relationships.get('mappings') or {}).get('data') or []}
    category_ids = {str(x.get('id')) for x in (relationships.get('categories') or {}).get('data') or []}
    mappings: dict[str, str] = {}
    genres = []
    for resource in included:
        attrs = resource.get('attributes') or {}
        if resource.get('type') == 'mappings' and str(resource.get('id')) in mapping_ids:
            provider = {'myanimelist/anime': 'myanimelist', 'anilist/anime': 'anilist'}.get(attrs.get('externalSite'))
            value = attrs.get('externalId')
            if provider and str(value).isdigit():
                mappings[provider] = _id(value)
        if resource.get('type') == 'categories' and str(resource.get('id')) in category_ids:
            title = clean_text(attrs.get('title'))
            if title:
                genres.append(GENRES.get(title, title))
    titles_map = a.get('titles') or {}
    titles = _titles([a.get('canonicalTitle'), *titles_map.values(), *(a.get('abbreviatedTitles') or [])])
    frequencies = a.get('ratingFrequencies') or {}
    votes = sum(int(v) for v in frequencies.values() if str(v).isdigit()) if frequencies else None
    fields = {'name': clean_text(titles_map.get('ja_jp') or a.get('canonicalTitle')), 'name_cn': clean_text(titles_map.get('zh_cn') or titles_map.get('zh')), 'aliases': titles,
              'summary': clean_text(a.get('synopsis') or a.get('description')), 'image_url': safe_image((a.get('posterImage') or {}).get('original') or (a.get('posterImage') or {}).get('large')),
              'banner_image_url': safe_image((a.get('coverImage') or {}).get('original') or (a.get('coverImage') or {}).get('large')), 'genres': genres, 'year': _year(a.get('startDate'))}
    return CatalogEntry('kitsu', ident, f'https://kitsu.app/anime/{ident}', titles, CATEGORIES.get(str(a.get('subtype', '')).lower(), ''), valid_date(a.get('startDate')), _count(a.get('episodeCount')),
                        a.get('nsfw') if isinstance(a.get('nsfw'), bool) else None, fields,
                        {'score': _number(a.get('averageRating'), 100), 'scale': 100, 'rank': _count(a.get('ratingRank')), 'votes': votes}, mappings)


def normalize_anilist(node: dict) -> CatalogEntry:
    ident = _id(node.get('id'))
    title = node.get('title') or {}
    titles = _titles([title.get('romaji'), title.get('native'), title.get('english'), *(node.get('synonyms') or [])])
    start = node.get('startDate') or {}
    air_date = None
    if all(start.get(key) for key in ('year', 'month', 'day')):
        air_date = valid_date(f"{int(start['year']):04}-{int(start['month']):02}-{int(start['day']):02}")
    staff = [{'id': int(e['node']['id']), 'name': clean_text(e['node']['name'].get('native') or e['node']['name'].get('full')), 'relation': clean_text(e.get('role'))} for e in (node.get('staff') or {}).get('edges', []) if e.get('node')]
    directors = [p['name'] for p in staff if p['relation'].lower() in ('director', 'series director', 'chief director')]
    characters = []
    for edge in (node.get('characters') or {}).get('edges', []):
        c = edge.get('node') or {}
        if not c.get('id'):
            continue
        actors = [{'id': int(v['id']), 'name': clean_text((v.get('name') or {}).get('native') or (v.get('name') or {}).get('full')), 'images': {k: safe_image(x) for k, x in (v.get('image') or {}).items()}} for v in edge.get('voiceActors', [])]
        characters.append({'id': int(c['id']), 'name': clean_text((c.get('name') or {}).get('native') or (c.get('name') or {}).get('full')),
                           'relation': {'MAIN': '主角', 'SUPPORTING': '配角', 'BACKGROUND': '客串'}.get(edge.get('role'), ''),
                           'images': {k: safe_image(v) for k, v in (c.get('image') or {}).items()}, 'actors': actors})
    fields = {'name': clean_text(title.get('native') or title.get('romaji')), 'aliases': titles, 'summary': clean_text(node.get('description')),
              'image_url': safe_image((node.get('coverImage') or {}).get('extraLarge') or (node.get('coverImage') or {}).get('large')),
              'banner_image_url': safe_image(node.get('bannerImage')), 'studio': ' / '.join(clean_text(s.get('name')) for s in (node.get('studios') or {}).get('nodes', []) if s.get('isAnimationStudio')),
              'director': ' / '.join(directors), 'persons': staff, 'characters': characters,
              'genres': [GENRES.get(g, clean_text(g)) for g in node.get('genres', [])], 'source': SOURCES.get(str(node.get('source', '')).lower(), ''), 'year': _year(start.get('year'))}
    ranks = [r['rank'] for r in node.get('rankings', []) if r.get('type') == 'RATED' and r.get('allTime')]
    distribution = (node.get('stats') or {}).get('scoreDistribution') or []
    mappings = {'myanimelist': _id(node['idMal'])} if node.get('idMal') else {}
    return CatalogEntry('anilist', ident, f'https://anilist.co/anime/{ident}', titles, CATEGORIES.get(str(node.get('format', '')).lower(), ''), air_date, _count(node.get('episodes')),
                        node.get('isAdult') if isinstance(node.get('isAdult'), bool) else None, fields,
                        {'score': _number(node.get('averageScore'), 100), 'scale': 100, 'rank': min(ranks) if ranks else None, 'votes': sum(int(v.get('amount') or 0) for v in distribution) if distribution else None}, mappings)


class CatalogClient:
    def __init__(self, *, settings: Settings | None = None, http_client: httpx.AsyncClient | None = None, redis_client: Any = None):
        self.settings = settings or get_settings()
        self._owns_client = http_client is None
        self.http = http_client or httpx.AsyncClient(timeout=self.settings.external_catalog_timeout, follow_redirects=False)
        self.redis = get_redis() if redis_client is None else redis_client

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        if self._owns_client:
            await self.http.aclose()

    def enabled(self, provider: str) -> bool:
        return self.settings.external_catalog_enabled and bool(getattr(self.settings, f'{provider}_enabled', False)) and (provider != 'myanimelist' or bool(self.settings.myanimelist_client_id.get_secret_value()))

    async def _slot(self, provider: str):
        if self.redis is False:
            return
        interval = 2100 if provider == 'anilist' else 1050
        try:
            for _ in range(5):
                if await self.redis.exists(f'catalog:cooldown:{provider}'):
                    raise CatalogUnavailable(provider)
                delay = int(await self.redis.eval(_SLOT, 1, f'catalog:rate:{provider}', interval))
                if delay <= 0:
                    return
                await asyncio.sleep(min(delay / 1000, 2.1))
        except CatalogUnavailable:
            raise
        except Exception:
            raise CatalogUnavailable(provider) from None
        raise CatalogUnavailable(provider)

    async def _request(self, provider: str, path: str = '', *, params=None, query=None, variables=None) -> dict:
        await self._slot(provider)
        try:
            if provider == 'anilist':
                response = await self.http.post('https://graphql.anilist.co', json={'query': query, 'variables': variables or {}}, headers={'Accept': 'application/json'})
            else:
                base = 'https://api.myanimelist.net/v2' if provider == 'myanimelist' else 'https://kitsu.io/api/edge'
                headers = {'Accept': 'application/json' if provider == 'myanimelist' else 'application/vnd.api+json'}
                if provider == 'myanimelist':
                    headers['X-MAL-CLIENT-ID'] = self.settings.myanimelist_client_id.get_secret_value()
                response = await self.http.get(base + path, params=params, headers=headers)
            if response.status_code == 429 and self.redis is not False:
                value = response.headers.get('Retry-After', '60')
                try:
                    seconds = float(value)
                except ValueError:
                    try:
                        seconds = (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()
                    except (ValueError, TypeError):
                        seconds = 60
                await self.redis.set(f'catalog:cooldown:{provider}', '1', ex=max(1, min(3600, math.ceil(seconds))))
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or data.get('errors'):
                raise ValueError('Invalid catalog response')
            return data
        except Exception:
            raise CatalogUnavailable(provider) from None

    async def search(self, provider: str, query: str, mal_id: str | None = None) -> list[CatalogEntry]:
        try:
            if provider == 'myanimelist':
                data = await self._request(provider, '/anime', params={'q': query[:150], 'limit': 5, 'fields': MAL_FIELDS, 'nsfw': 'true'})
                return [normalize_mal(item['node']) for item in data.get('data', [])]
            if provider == 'kitsu':
                data = await self._request(provider, '/anime', params={'filter[text]': query[:150], 'page[limit]': 5, 'include': 'mappings,categories'})
                return [normalize_kitsu(item, data.get('included') or []) for item in data.get('data', [])]
            if provider == 'anilist':
                if mal_id:
                    data = await self._request(provider, query='query($id:Int){ Media(idMal:$id,type:ANIME){' + _ANI_FIELDS + '}}', variables={'id': int(_id(mal_id))})
                    return [normalize_anilist(data['data']['Media'])] if (data.get('data') or {}).get('Media') else []
                data = await self._request(provider, query='query($search:String){ Page(perPage:5){media(search:$search,type:ANIME){' + _ANI_FIELDS + '}}}', variables={'search': query[:150]})
                return [normalize_anilist(item) for item in ((data.get('data') or {}).get('Page') or {}).get('media', [])]
            raise ValueError('Unknown provider')
        except CatalogUnavailable:
            raise
        except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
            raise CatalogUnavailable(provider) from None

    async def detail(self, provider: str, external_id: str) -> CatalogEntry:
        try:
            return await self._detail(provider, external_id)
        except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
            raise CatalogUnavailable(provider) from None

    async def _detail(self, provider: str, external_id: str) -> CatalogEntry:
        ident = _id(external_id)
        if provider == 'myanimelist':
            return normalize_mal(await self._request(provider, f'/anime/{ident}', params={'fields': MAL_FIELDS}))
        if provider == 'kitsu':
            data = await self._request(provider, f'/anime/{ident}', params={'include': 'mappings,categories'})
            return normalize_kitsu(data['data'], data.get('included') or [])
        if provider == 'anilist':
            data = await self._request(provider, query='query($id:Int){Media(id:$id,type:ANIME){' + _ANI_FIELDS + '}}', variables={'id': int(ident)})
            return normalize_anilist(data['data']['Media'])
        raise ValueError('Unknown provider')

    async def episodes(self, external_id: str, *, anime_id: int) -> tuple[list[dict], bool]:
        try:
            return await self._episodes(external_id, anime_id=anime_id)
        except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
            raise CatalogUnavailable('kitsu') from None

    async def _episodes(self, external_id: str, *, anime_id: int) -> tuple[list[dict], bool]:
        """At most 100 display-only chapters; never insert their IDs as Bangumi IDs."""
        ident = _id(external_id)
        episodes: dict[float, dict] = {}
        partial = False
        for offset in range(0, 100, 20):
            data = await self._request('kitsu', f'/anime/{ident}/episodes', params={'page[limit]': 20, 'page[offset]': offset, 'sort': 'number'})
            values = data.get('data') or []
            for node in values:
                attrs = node.get('attributes') or {}
                number = _number(attrs.get('number'))
                if number is None:
                    continue
                titles = attrs.get('titles') or {}
                episodes[number] = {'id': -int(_id(node.get('id'))), 'anime_id': anime_id, 'sort': number, 'type': 0,
                                    'name': clean_text(titles.get('ja_jp') or attrs.get('canonicalTitle')), 'name_cn': clean_text(titles.get('zh_cn')),
                                    'airdate': valid_date(attrs.get('airdate')), 'duration': f"{int(attrs['length'])} 分钟" if _count(attrs.get('length')) else '',
                                    'description': clean_text(attrs.get('synopsis')), 'source_provider': 'kitsu', 'external_id': str(node.get('id'))}
            partial = bool((data.get('links') or {}).get('next'))
            if not partial or len(values) < 20:
                break
        return [episodes[n] for n in sorted(episodes)], partial
