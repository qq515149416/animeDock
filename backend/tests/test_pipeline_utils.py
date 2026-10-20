from datetime import date

import pytest


@pytest.mark.parametrize("day, season", [(date(2026, 1, 1), "winter"), (date(2026, 3, 31), "winter"), (date(2026, 4, 1), "spring"), (date(2026, 6, 30), "spring"), (date(2026, 7, 1), "summer"), (date(2026, 10, 1), "autumn")])
def test_season_boundaries(day, season):
    from app.utils.season import get_season
    assert get_season(day) == season


def test_autumn_range_rolls_into_next_year():
    from app.utils.season import season_date_range
    assert season_date_range(2026, "autumn") == (date(2026, 10, 1), date(2027, 1, 1))
    with pytest.raises(ValueError):
        season_date_range(2026, "monsoon")


WIKI = """{{Infobox animanga/TVAnime
|中文名= 葬送的芙莉莲
|别名={
[Frieren]
[日文|葬送のフリーレン]
}
|话数= 28
|放送开始= 2023年9月29日
|放送星期= 星期五
|动画制作= MADHOUSE
|导演= 斋藤圭一郎
}}"""


def test_wiki_scalar_and_keyed_array():
    from app.utils.wiki_parser import parse_infobox
    parsed = parse_infobox(WIKI)
    assert parsed["中文名"] == "葬送的芙莉莲"
    assert parsed["别名"] == ["Frieren", {"日文": "葬送のフリーレン"}]
    assert parsed["导演"] == "斋藤圭一郎"


def test_wiki_extracts_dates_alias_values_and_weekday():
    from app.utils.wiki_parser import extract_metadata
    assert extract_metadata(WIKI) == {
        "aliases": ["Frieren", "葬送のフリーレン"], "eps": 28,
        "air_date": date(2023, 9, 29), "air_weekday": 5,
        "studio": "MADHOUSE", "director": "斋藤圭一郎",
    }


def test_api_infobox_and_invalid_dates_are_supported():
    from app.utils.wiki_parser import extract_metadata
    data = [{"key": "别名", "value": [{"k": "英文名", "v": "A &amp; B"}]}, {"key": "放送开始", "value": "2024年2月31日"}, {"key": "放送星期", "value": "周日"}]
    parsed = extract_metadata(data)
    assert parsed["aliases"] == ["A & B"]
    assert parsed["air_date"] is None
    assert parsed["air_weekday"] == 7


def test_tag_mapping_prioritizes_platform_and_meta_tags():
    from app.services.tag_mapping import map_tags
    result = map_tags(platform=3, meta_tags=["轻小说改", "中国台湾", "奇幻"], tags=[{"name": "原创", "count": 400}, {"name": "恋爱", "count": 9}, {"name": "冒险", "count": 10}])
    assert result == {"category": "剧场版", "source": "小说改", "region": "中国", "genres": ["奇幻", "冒险"]}


def test_unknown_tags_do_not_become_structured_categories():
    from app.services.tag_mapping import map_tags
    result = map_tags(platform=None, meta_tags=["TV", "未来神作"], tags=[{"name": "游戏改", "count": 12}, {"name": "欧美", "count": 20}])
    assert result == {"category": "TV", "source": "游戏改", "region": "欧美", "genres": []}
    assert map_tags()["region"] == "日本"


def test_normalize_archive_and_api_ratings_without_losing_nsfw():
    from app.services.ingest import normalize_subject
    archive = normalize_subject({"id": 1, "type": 2, "name": "A", "infobox": WIKI, "platform": 1, "favorite": {"1": 3, "2": 55, "3": 2}, "score": 8.1, "date": "2023-09-29", "nsfw": True})
    assert archive["collects"] == 60
    assert archive["nsfw"] is True
    assert archive["season"] == "summer"
    assert archive["air_weekday"] == 5
    api = normalize_subject({"id": 2, "type": 2, "name": "B", "rating": {"score": 8.4, "rank": 24, "count": {"10": 100}}, "collection": {"collect": 100, "doing": 20}, "images": {"large": "https://example.test/2.jpg"}})
    assert (api["score"], api["rank"], api["collects"]) == (8.4, 24, 120)
    assert api["score_details"] == {"10": 100}
    assert api["image_url"] == "https://example.test/2.jpg"


@pytest.mark.parametrize("value, expected", [(None, True), (False, False), (True, True), ("false", False), (" TRUE ", True), (0, False), (1, True), ("unknown", True)])
def test_unknown_sensitive_flags_remain_hidden(value, expected):
    from app.services.ingest import normalize_subject
    raw = {"id": 5, "type": 2, "name": "标题"}
    if value is not None:
        raw["nsfw"] = value
    assert normalize_subject(raw)["nsfw"] is expected
