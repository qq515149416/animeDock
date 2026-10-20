# 番剧坞 implementation ledger

Design authority: design_handoff/README.md and its JSX prototypes. Functional authority: docs/requirements.txt. User requested one continuous full implementation, no intermediate approval or phase handoff.

## Tasks
- [x] Inspect requirements, handoff, runtime, existing repository (empty; no Git or AGENTS.md).
- [x] Backend core: PostgreSQL models/migration, schemas, search/calendar/detail/filter routes, Redis limits and health.
- [x] Data pipeline: Archive streaming import, normalization, Bangumi throttling, calendar/current-season sync, embeddings and scheduler.
- [x] AI: function-calling streaming agent, enforced NSFW and client ownership, Tavily, chat persistence.
- [x] Frontend: faithful handoff reconstruction in Next.js, daily/library/detail/chat, shared preferences and search.
- [x] Deployment and documentation: Compose, Dockerfiles, environment, local preview and run commands.
- [x] Verify: Python unit/integration tests, TypeScript production build, browser desktop/mobile flows and source review.

## Decisions
- Work directly in the empty requested directory. No Git worktree exists or is necessary.
- Use disjoint implementation tasks with the subagent-driven-development skill; owner controls frontend and integration.
- Design-specific requirements override auxiliary prose (18-item library pages, gradient fallback covers, layout).
- No keys supplied: AI and embeddings activate with environment configuration; UI reports unconfigured service honestly.
- Include explicitly labelled demo mode using the supplied fictional design dataset for zero-service preview, while production uses real APIs.
- No cloud publish: user requests this local project plus Docker Compose deployment.

## Errors / constraints
- System Node is v16; use bundled modern runtime.
- Git status: directory is not a Git repository.

## 2026-10-20 图片修复与查看器
- [x] 复现并核对真实 API、数据库和官方封面跳转接口。
- [x] 为空封面补上官方图片地址，统一列表与详情封面行为。
- [x] 角色图片支持轻微悬停缩放和原图弹窗（切换、缩放、键盘、移动端）。
- [x] 运行前端测试、类型检查、生产构建，更新本地容器并浏览器验收。

## Next Step
本次图片修复与查看器已完成，本地 localhost:3000 已更新。

## Verification result
89 backend + 7 frontend tests pass; strict TypeScript, real PG/Meili/Redis, Docker production builds and 5-container health confirmed. Independent review closed. Full external Archive import and paid API calls remain deployment-time operations, not missing code; see docs/verification.md.

## Resolved verification issues
- Old npm/mirror environment: official registry + npm10 regenerated reproducible lock; Docker npm ci passes.
- Mixed App/Pages routing requires nullable navigation hooks; fixed strict types.
- Default Next rewrite30s timeout / shared-IP limits replaced by runtime streaming proxy + trustedCIDR dedicated header.
- NSFW stale index aggregate, delayed chat history, loading spinner and initial theme hydration regressions fixed and reviewed.
- Rapid URL updates now use current address + Next-integrated native history; Beijing date and request-time rendering prevent stale build dates.
- Duplicate app/public icon route removed; production icon200 verified.
