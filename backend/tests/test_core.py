"""验证检索过滤、敏感内容和缓存隔离。"""
import json
from datetime import date

import pytest
from sqlalchemy.dialects import postgresql

from app.services.search_service import build_meili_filters, sql_conditions, anime_document
from app.models import Anime
from app.services.calendar_service import filter_calendar_payload


def test_search_filter_escapes_text_and_forces_nsfw() -> None:
    """过滤表达式必须保留服务端 NSFW 条件并安全编码字符串。"""
    filters = build_meili_filters(nsfw=False, category='TV" OR nsfw = true', genres=['奇幻', '冒险'])
    assert 'nsfw = false' in filters
    assert 'category = ' + json.dumps('TV" OR nsfw = true', ensure_ascii=False) in filters
    assert 'genres = "奇幻"' in filters and 'genres = "冒险"' in filters


def test_disjunctive_facet_omits_only_itself() -> None:
    """各 facet 忽略自身筛选，但保留其他筛选及敏感内容限制。"""
    filters = build_meili_filters(nsfw=False, omit='category', category='TV', region='日本', year=2024)
    assert not any(item.startswith('category') for item in filters)
    assert 'region = "日本"' in filters
    assert 'year = 2024' in filters
    assert 'nsfw = false' in filters


def test_sql_fallback_applies_nsfw_and_all_genres() -> None:
    """SQL 回退必须与搜索索引执行相同的过滤。"""
    conditions = sql_conditions(q='星', nsfw=False, genres=['奇幻', '冒险'], region='all')
    sql = ' '.join(str(c.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True})) for c in conditions)
    assert 'anime.nsfw IS false' in sql
    assert '@>' in sql and '奇幻' in sql and '冒险' in sql
    assert 'anime.region' not in sql
    assert '星' in sql


def test_calendar_cache_rejects_unknown_or_sensitive_flags() -> None:
    """旧缓存缺失敏感标志时默认隐藏，防止缓存泄漏。"""
    payload = [{'weekday': 1, 'items': [{'id': 1, 'nsfw': False}, {'id': 2, 'nsfw': True}, {'id': 3}]}]
    safe = filter_calendar_payload(payload, nsfw=False)
    assert len(safe) == 7
    assert [item['id'] for item in safe[0]['items']] == [1]
    assert len(filter_calendar_payload(payload, nsfw=True)[0]['items']) == 3
    assert len(payload[0]['items']) == 3


def test_anime_document_normalizes_date_and_defaults() -> None:
    """索引文档必须可序列化并包含筛选所需的规范字段。"""
    anime = Anime(id=1, name='测试', air_date=date(2024, 1, 1), nsfw=False)
    document = anime_document(anime)
    assert document['air_date'] == '2024-01-01'
    assert document['air_date_ts'] > 0
    assert document['aliases'] == []
    assert document['nsfw'] is False
    json.dumps(document)


def test_repeated_and_comma_separated_genres_are_equivalent() -> None:
    """兼容 URLSearchParams 单值与重复参数，所有类型仍取交集。"""
    expected = build_meili_filters(nsfw=False, genres=['奇幻', '冒险'])
    actual = build_meili_filters(nsfw=False, genres=['奇幻,冒险', '奇幻'])
    assert actual == expected


@pytest.mark.asyncio
async def test_stale_index_cannot_leak_sensitive_counts_outside_current_page(monkeypatch) -> None:
    """即使当前页为空，旧索引中的敏感 ID 也不能进入总数和 facet。"""
    from types import SimpleNamespace
    from app.services import search_service

    calls = []

    class Database:
        async def scalars(self, statement):
            return SimpleNamespace(all=lambda: [2])

    class Index:
        async def search(self, query, **params):
            filters = params['filter']
            calls.append(filters)
            excluded = 'id NOT IN [2]' in filters
            facets = {}
            if params.get('facets') == ['year']:
                facets = {'year': {'2026': 4} if excluded else {'2026': 4, '1999': 1}}
            return SimpleNamespace(hits=[], total_hits=4 if excluded else 5, estimated_total_hits=None, facet_distribution=facets)

    class Client:
        def index(self, name):
            return Index()

    monkeypatch.setattr(search_service, 'get_meili_client', Client)
    result = await search_service.search_anime(Database(), nsfw=False, region='all', page=5, page_size=1)
    assert result['engine'] == 'meilisearch'
    assert result['items'] == []
    assert result['total'] == 4
    assert result['facets']['year'] == {'2026': 4}
    assert len(calls) == 7 and all('id NOT IN [2]' in filters for filters in calls)


@pytest.mark.asyncio
async def test_large_sensitive_id_set_uses_sql_without_oversized_meili_filter(monkeypatch) -> None:
    """敏感 ID 超过阈值时直接使用数据库，避免超长搜索过滤。"""
    from types import SimpleNamespace
    from app.services import search_service

    indexed = []

    class Database:
        async def scalars(self, statement):
            return SimpleNamespace(all=lambda: list(range(1, 5002)))

    def client():
        indexed.append(True)
        raise ConnectionError('不应访问索引')

    async def fallback(*args):
        return {'engine': 'postgresql', 'items': [], 'total': 0}

    monkeypatch.setattr(search_service, 'get_meili_client', client)
    monkeypatch.setattr(search_service, '_search_sql', fallback)
    result = await search_service.search_anime(Database(), nsfw=False)
    assert result['engine'] == 'postgresql'
    assert indexed == []
