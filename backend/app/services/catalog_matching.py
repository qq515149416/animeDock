"""Conservative identity checks; a plausible search result is not an identity."""
from datetime import date
import unicodedata
from typing import Any

from app.services.catalog_providers import CatalogEntry


def normalized_title(value: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())


def _date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def match_entry(local: dict, candidates: list[CatalogEntry], known_ids: dict[str, str] | None = None, *, verified: bool = False) -> CatalogEntry | None:
    names = {normalized_title(str(t)) for t in [local.get('name'), local.get('name_cn'), *(local.get('aliases') or [])] if t}
    known_ids = known_ids or {}
    matches: dict[str, CatalogEntry] = {}
    local_date = _date(local.get('air_date'))
    for candidate in candidates:
        category = local.get('category')
        if category and category != '其他' and candidate.category and category != candidate.category:
            continue
        remote_date = _date(candidate.air_date)
        if local_date and not remote_date and candidate.fields.get('year') and candidate.fields['year'] != local_date.year:
            continue
        if local_date and remote_date and abs((local_date - remote_date).days) > 45:
            continue
        if local.get('eps') and candidate.eps and int(local['eps']) != candidate.eps:
            continue
        if any(p in known_ids and known_ids[p] != ident for p, ident in candidate.mappings.items()):
            continue
        linked = any(known_ids.get(p) == ident for p, ident in candidate.mappings.items())
        same_title = bool(names & {normalized_title(t) for t in candidate.titles if t})
        evidence = int(bool(local_date and remote_date)) + int(bool(category and category != '其他' and candidate.category)) + int(bool(local.get('eps') and candidate.eps))
        if linked or (same_title and (evidence >= 2 or verified)) or (verified and not names):
            matches[candidate.external_id] = candidate
    return next(iter(matches.values())) if len(matches) == 1 else None
