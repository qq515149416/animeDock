# External Catalog Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** For the user's private installation, show platform ratings/links and fill missing Bangumi details from MAL, Kitsu and AniList without replacing valid Bangumi data.

**Architecture:** Keep Bangumi IDs and canonical records. Store expiring, normalized per-provider snapshots with verified mappings in a separate table. A separate detail enrichment endpoint loads them asynchronously; a bounded worker refreshes recently viewed entries. No external catalog mirror, account sync or automatic translation.

**Tech Stack:** Existing Python/FastAPI/httpx/SQLAlchemy/PostgreSQL/Redis; Next.js/TypeScript/SWR/Tailwind.

**Spec:** Approved proposal in this chat (2026-10-21), confirmed for personal use on 2026-10-22 with missing-field fallback added.

## Global Constraints
- Existing valid Bangumi values, numeric IDs, scores, list ordering, NSFW filtering, anonymous sessions and user edits remain authoritative.
- Read MYANIMELIST_CLIENT_ID and MYANIMELIST_CLIENT_SECRET only on backend; public reads send Client ID only. No credential logging or client-side configuration.
- Exact title plus corroborating format/date/episodes, or verified external mappings, are required. Ambiguous/conflicting candidates remain unlinked.
- Preserve original score scales and nullable counts; never label external scores Bangumi or compute an average.
- Normalize only necessary public metadata; snapshots expire after 24h, negative results 6h, transient failures 5min. Redis serializes requests and respects provider cooldowns.
- Bangumi summary/name/aliases/image/date/episodes/studio/director/genres and people are filled only when empty; no synthetic external IDs in local relation links.
- Work in the current authorized workspace, preserve pre-existing anime-detail.tsx changes; no branch switch, git commit, or destructive operation.

## Review Focus
- Same title across remakes/seasons/movies must not silently acquire another work's metadata.
- A provider timeout, 429 or malformed response must leave Bangumi details usable and not leak credentials.
- Old provider snapshots, disabled sources and cached NSFW metadata must not bypass expiry/content settings.
- A later Bangumi update must replace the displayed fallback without changing saved canonical data.
- Concurrent detail requests must not stampede providers or leave a failed database transaction.

### Task 1: Provider adapters and conservative matching
**Files:** Create services/catalog_providers.py, services/catalog_matching.py, tests/test_external_catalog.py; modify config.py.
**Interfaces:** CatalogEntry(provider, external_id, url, titles, category, air_date, eps, nsfw, fields, rating, mappings); CatalogClient.search(provider, query, mal_id=None), .detail(provider,id); match_entry(local,candidates,known_ids=None) -> CatalogEntry|None.
- [x] Write/run failing tests for title/format/date/episode conflicts, ambiguous titles, MAL headers, field normalization, rating scales, HTML stripping and secret masking.
- [x] Implement bounded read-only adapters with injected HTTP transport, distributed rate/cooldown and normalized data only.
- [x] Run targeted tests and the backend suite; confirm all pass.

### Task 2: Expiring persistence, detail fallback and bounded refresh
**Files:** Modify models.py/schemas.py/routers/anime.py; create migration 0002, services/catalog_enrichment.py, worker/refresh_external.py, tests/test_catalog_enrichment.py and PostgreSQL integration cases.
**Interfaces:** enrich_anime(db,anime_id,nsfw=False) -> {anime_id,ratings,sources,supplement,field_sources,providers}; cached_supplement(db,detail,nsfw) -> merged detail. Worker refresh_external(limit=20) only revisits recent mappings.
- [x] Write/run failing tests for missing-only merges, preserved canonical ratings, expiry, no-match caching, NSFW rechecks, independent source failure and request lock behavior.
- [x] Implement the source table/migration, endpoint, cache-only fallback in standard detail, people fallback and recent-only refresh; never write fallback over canonical Anime fields.
- [x] Verify real PostgreSQL behavior with isolated test schemas and existing backend suite.

### Task 3: Detail UI, configuration, live verification
**Files:** Modify frontend/types, lib/api.ts, components/anime-detail.tsx; create lib/enrichment.ts, components/external-sources.tsx and frontend tests; update README/.env.example.
**Interfaces:** getAnimeEnrichment(id,nsfw) -> AnimeEnrichment; mergeAnimeEnrichment(base,extra) -> AnimeDetail. Separate SWR key includes NSFW; source cards display scores/scales/links/last update and fallback attribution.
- [x] Write/run failing merge tests (existing Bangumi values always win; zero/null score remains independent).
- [x] Implement responsive cards and missing-field fallback while preserving current viewer and design.
- [x] Run backend/frontend suites, typecheck and build; migrate/rebuild local containers, perform a bounded live sample and desktop/mobile browser checks.
- [x] Run one independent whole-change review, resolve material issues and record final evidence.
