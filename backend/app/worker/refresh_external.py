"""Refresh only recently viewed metadata; optional bounded sample for acceptance."""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.models import Anime, AnimeExternalSource
from app.services.catalog_enrichment import configured_providers, enrich_anime
from app.worker.locks import run_locked
from app.worker.logging_config import setup_logging


async def _refresh_external(limit: int = 20, sample: bool = False) -> dict:
    limit = max(1, min(50, limit))
    now = datetime.now(timezone.utc)
    report = {'sample': sample, 'count': 0, 'matched': {}, 'items': []}
    if not configured_providers():
        return report
    async with SessionLocal() as db:
        await db.execute(delete(AnimeExternalSource).where(AnimeExternalSource.last_accessed_at < now - timedelta(days=30)))
        await db.commit()
        if sample:
            # Mix popular TV, films, OVA/WEB and specials, instead of validating TV only.
            eligible = select(Anime).where(Anime.nsfw.is_(False), Anime.air_date.is_not(None), Anime.eps > 0, Anime.name != '').order_by(Anime.collects.desc())
            pool = (await db.scalars(eligible.limit(500))).all()
            selected = []
            for category in ('TV', '剧场版', 'OVA', 'WEB', '其他'):
                selected.extend((await db.scalars(eligible.where(Anime.category == category).limit(max(1, limit // 5)))).all())
            selected_ids = {a.id for a in selected}
            selected.extend(a for a in pool if a.id not in selected_ids)
            ids = [a.id for a in selected[:limit]]
        else:
            ids = list((await db.scalars(select(AnimeExternalSource.anime_id).where(
                AnimeExternalSource.provider.in_(configured_providers()), AnimeExternalSource.expires_at <= now,
                AnimeExternalSource.last_accessed_at >= now - timedelta(days=14),
            ).group_by(AnimeExternalSource.anime_id).order_by(func.min(AnimeExternalSource.expires_at)).limit(limit))).all())
        for anime_id in ids:
            anime = await db.get(Anime, anime_id)
            metadata = {'id': anime_id, 'name': anime.name, 'category': anime.category}
            result = await enrich_anime(db, anime_id, nsfw=anime.nsfw, mark_accessed=sample)
            report['items'].append({**metadata,
                                    'sources': [{'provider': s['provider'], 'external_id': s['external_id'], 'url': s['url']} for s in result['sources']],
                                    'supplemented_fields': result['field_sources'], 'providers': result['providers']})
        report['count'] = len(report['items'])
        report['matched'] = dict(Counter(s['provider'] for item in report['items'] for s in item['sources']))
    return report


async def refresh_external(limit: int = 20, *, sample: bool = False) -> dict | None:
    return await run_locked('external-refresh', lambda: _refresh_external(limit, sample))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=20, help='最近访问条目的最大刷新数量，最多50')
    parser.add_argument('--sample', type=int, help='验证有限的热门作品样本，最多50；不会遍历全库')
    parser.add_argument('--report', type=Path, help='可选 JSON 验证报告路径，不含凭据或简介正文')
    args = parser.parse_args()
    setup_logging()
    report = asyncio.run(refresh_external(args.sample or args.limit, sample=bool(args.sample)))
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in (report or {}).items() if k != 'items'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
