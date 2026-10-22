# 番剧坞 implementation ledger

## 封面优先级修复
- [x] 复现：517532原始image_url为空，但列表通过Bangumi官方image端点已有封面；详情误被外站覆盖。
- [x] 回归先失败再修复：主封面独立于备用封面，外站补充不改image_url；仅原封面加载失败时尝试备用。
- [x] 后端131项、前端18项、类型与生产构建通过；本地6容器健康；浏览器验证列表与详情同为原图、屏蔽原图后使用备用、恢复后再次显示原图。

## 2026-10-22 一期已授权实施
- 用户确认个人自用，MAL 凭据已在 .env；授权按一期实施并补全 Bangumi 缺失字段。
- 执行计划：docs/superpowers/plans/2026-10-22-external-catalog.md。
- [x] 适配器、保守跨站匹配与配置。
- [x] 独立快照表、缺失字段合并、详情接口与有界刷新。
- [x] 详情页多平台展示、真实接口样本与全套验证。
- 验收：129项后端（真实PG隔离schema）、15项前端、类型/构建、独立审查及修复；30部样本23部至少匹配一源，MAL18/Kitsu21/AniList22，其余保留不确定性。0002迁移及本地6容器更新并健康。详情热缓存14–34ms；NSFW两接口403；凭据响应检测无泄漏。
- 基线：main 工作区已有 anime-detail.tsx 的4行变更及上轮调研记录，保留；不读取或输出 .env 凭据值。
- 初次 pytest 从根目录运行无法 import app；改为 backend 目录运行，属于调用目录问题。

## 2026-10-21 多平台 API 接入可行性评估（仅分析）
- [x] 检查现有代码、数据模型与同步任务。
- [x] 核对 AniList、MyAnimeList、Kitsu 官方 API 文档及使用限制。
- [x] 形成接入建议、范围、风险和分阶段方案供用户确认；确认前停止实施。
- 用户要求：确认前不写产品代码、不安装依赖、不运行导入或修改服务。
- 发现：Anime.id 固定为 Bangumi subject ID；评分/排序/关联/AI 引用依赖现有模型；已有 worker/Redis/Meili 可扩展。
- 环境：ego lite 在默认沙箱启动失败；使用只读浏览器提权重试；技能目录 planning-with-files 含额外同名层级，已定位。
- 结论：技术可行；建议保留 Bangumi 主库，MAL 优先、Kitsu 补充，AniList 待用途授权确认；各源均需落实允许的展示/缓存范围。先做详情补充，不做全量镜像或账户同步。

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
