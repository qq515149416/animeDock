"""固定日本、包含 NSFW 的季度汇总；从不返回具体作品信息。"""
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tag_mapping import GENRE_MAP, SOURCE_MAP
from app.utils.season import SEASONS, get_current_season

Dimension = Literal['genre', 'source']
_QUARTER_INDEX = "year * 4 + CASE season WHEN 'winter' THEN 0 WHEN 'spring' THEN 1 WHEN 'summer' THEN 2 WHEN 'autumn' THEN 3 END"
_VALID_SCORE = 'score > 0 AND score <= 10'
_AGGREGATES = f"""count(*) AS total_count,
    count(*) FILTER (WHERE {_VALID_SCORE}) AS rated_count,
    avg(score) FILTER (WHERE {_VALID_SCORE}) AS average_score,
    max(score) FILTER (WHERE {_VALID_SCORE}) AS max_score,
    coalesce(sum(votes), 0) AS vote_count"""


async def get_statistics_metadata(db: AsyncSession) -> dict:
    row = (await db.execute(text(f"""
        SELECT count(*) AS catalog_count,
            count(*) FILTER (WHERE ({_QUARTER_INDEX}) IS NULL) AS missing_quarter_count,
            array_agg(DISTINCT year ORDER BY year DESC)
                FILTER (WHERE ({_QUARTER_INDEX}) IS NOT NULL) AS years
        FROM anime WHERE region = '日本'
    """))).mappings().one()
    year, season = get_current_season()
    return {**dict(row), 'years': row['years'] or [], 'region': '日本', 'includes_nsfw': True,
            'current_season': {'year': year, 'season': season}}


async def get_statistics(
    db: AsyncSession, *, dimension: Dimension, start_year: int, start_season: str,
    end_year: int, end_season: str,
) -> dict:
    if dimension not in ('genre', 'source'):
        raise ValueError('无效统计维度')
    start = start_year * 4 + SEASONS.index(start_season)
    end = end_year * 4 + SEASONS.index(end_season)
    if start > end:
        raise ValueError('开始季度不能晚于结束季度')
    # Only these fixed SQL expressions can vary, never user-supplied SQL.
    labels = "CASE WHEN cardinality(genres) = 0 THEN ARRAY['未分类']::text[] ELSE genres END" if dimension == 'genre' else 'ARRAY[source]'
    statement = text(f"""
        WITH scoped AS MATERIALIZED (
            SELECT year, season, score,
                coalesce(nullif(btrim(source), ''), '其他') AS source,
                ARRAY(SELECT DISTINCT btrim(tag) FROM unnest(genres) AS tag
                      WHERE btrim(tag) <> '') AS genres,
                coalesce((SELECT sum(value::bigint)
                    FROM jsonb_each_text(CASE WHEN jsonb_typeof(score_details) = 'object'
                        THEN score_details ELSE '{{}}'::jsonb END)
                    WHERE key IN ('1','2','3','4','5','6','7','8','9','10')
                        AND value ~ '^[0-9]{{1,12}}$'), 0) AS votes
            FROM anime
            WHERE region = '日本' AND ({_QUARTER_INDEX}) BETWEEN :start AND :end
        )
        SELECT year, season, NULL::text AS name, {_AGGREGATES},
            count(*) FILTER (WHERE cardinality(genres) > 0) AS classified_count,
            count(*) FILTER (WHERE source <> '其他') AS known_source_count
        FROM scoped GROUP BY year, season
        UNION ALL
        SELECT year, season, label.name, {_AGGREGATES}, 0, 0
        FROM scoped CROSS JOIN LATERAL unnest({labels}) AS label(name)
        GROUP BY year, season, label.name
    """)
    # Totals and groups share one MVCC snapshot, even while the worker refreshes.
    rows = (await db.execute(statement, {'start': start, 'end': end})).mappings().all()
    names = list(dict.fromkeys(GENRE_MAP.values())) + ['未分类'] if dimension == 'genre' else list(dict.fromkeys(SOURCE_MAP.values()))
    names += sorted({row['name'] for row in rows if row['name'] is not None} - set(names))
    totals, grouped = {}, {}
    for row in rows:
        key = (row['year'], row['season'])
        values = {name: (None if row[name] is None else round(float(row[name]), 6)) if name in ('average_score', 'max_score') else int(row[name])
                  for name in ('total_count', 'rated_count', 'average_score', 'max_score', 'vote_count')}
        if row['name'] is None:
            totals[key] = {**values, 'classified_count': int(row['classified_count']), 'known_source_count': int(row['known_source_count'])}
        else:
            values['count'] = values.pop('total_count')
            grouped.setdefault(key, {})[row['name']] = {'name': row['name'], **values}
    quarters = []
    for index in range(start, end + 1):
        year, quarter = divmod(index, 4)
        season = SEASONS[quarter]
        key = (year, season)
        groups = [grouped.get(key, {}).get(name, {'name': name, 'count': 0, 'rated_count': 0,
                  'average_score': None, 'max_score': None, 'vote_count': 0}) for name in names]
        quarters.append({'year': year, 'season': season,
            **totals.get(key, {'total_count': 0, 'rated_count': 0, 'average_score': None,
                'max_score': None, 'vote_count': 0, 'classified_count': 0, 'known_source_count': 0}),
            'distribution_total': sum(group['count'] for group in groups), 'groups': groups})
    return {'dimension': dimension, 'region': '日本', 'includes_nsfw': True,
            'distribution_basis': 'genre_occurrences' if dimension == 'genre' else 'works',
            'generated_at': datetime.now(timezone.utc), 'quarters': quarters}
