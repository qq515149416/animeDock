# 番剧坞 design and integration specification

Implement docs/requirements.txt as an application in this directory, using design_handoff/README.md and JSX as the visual authority. User explicitly authorizes continuous complete implementation. The data handoff is fictional; it is only used in a labelled demo mode.

Next.js App Router renders /, /anime, /anime/[id], /chat. Shared context persists NSFW/age confirmation/revealed covers and preferences. Tailwind tokens reproduce the handoff. Real API requests include NSFW; default theme is dark. Search/filter state lives in URL and uses SWR. AI reads SSE tokens and tool events, supports abort and persisted client session history.

FastAPI /api provides async SQLAlchemy PostgreSQL and pgvector models, Alembic, Meilisearch with SQL fallback, Redis calendar and character/person cache, rate limits, health. Independent worker performs streaming Archive upserts, calendar hourly sync, current/previous-season daily refresh and incremental vector generation. Embedding and model configuration is external. Tool executions enforce NSFW regardless of model arguments and chat sessions require client ownership.

Docker Compose runs PostgreSQL16+pgvector, Redis, Meilisearch, backend, worker, frontend with health/dependency/volume configuration. Default frontend can demonstrate exact design using a clearly identified demo mode; production defaults to real data and reports loading/error states. No fabricated AI responses in live mode.
