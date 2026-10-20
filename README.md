# 番剧坞 · Fanjuwu

按 `design_handoff_fanjuwu.zip` 的高保真设计实现的动画资讯站：每日放送、动画库、作品详情和 AI 番剧助手。界面使用 Next.js 14 App Router / TypeScript / Tailwind / shadcn 风格 Radix 组件 / lucide / SWR；服务端使用 Python 3.11 / FastAPI / SQLAlchemy async / PostgreSQL 16 + pgvector。

```text
浏览器 ── Next.js :3000 ── /api 代理 ── FastAPI :8000
                                         ├── PostgreSQL + pgvector（权威条目、章节、会话、向量）
                                         ├── Meilisearch（全文搜索、AND 筛选、分面计数）
                                         ├── Redis（放送/角色缓存、限流、任务锁）
                                         └── OpenAI兼容模型 ── 受控工具 ── Tavily（可选）
APScheduler worker ── Bangumi Archive / API ── 批量 upsert / 索引 / 增量向量
```

## 一键启动

需要 Docker Engine / Docker Compose v2。执行目录为本项目根目录（即 `animeDock`；目录名可自行改成 `fanjuwu`）。

```bash
cp .env.example .env
# 编辑 .env：填写可识别的 BANGUMI_USER_AGENT，按需填写模型与向量服务 key。
docker compose up -d --build
docker compose logs -f worker
```

访问 [站点](http://localhost:3000)、[API 文档](http://localhost:8000/docs)、[健康检查](http://localhost:8000/api/health)。数据库、Redis 和 Meilisearch 不映射公网端口，API 仅绑定宿主机 `127.0.0.1:8000`。前端端口可通过 `FRONTEND_PORT` 修改。

首次空库会由 worker 自动下载官方最新 Archive 并导入；此时页面会逐步可用。可通过以下命令主动执行导入，已有任务会通过 Redis 租约锁去重，不会重复执行：

```bash
docker compose exec worker python -m app.worker.import_archive
```

导入完成后，worker 会刷新当季/上季详情与日历。Archive 本身没有图片字段，实时 API 刷新的条目会补上真实封面，其余条目显示与设计稿一致的渐变封面。没有提供模型 key 时，动画检索和每日放送仍可用，AI 会明确提示尚未配置；没有向量 key 时跳过生成，不产生调用费用。

## 手动数据任务

```bash
# 全量导入、原子重建搜索索引、按内容 hash 增量生成向量
docker compose exec worker python -m app.worker.import_archive
# 只导入，不生成向量
docker compose exec worker python -m app.worker.import_archive --skip-embeddings
# 从容器内已存在的本地 ZIP 导入；本地包无可验证的导出时间戳
docker compose exec worker python -m app.worker.import_archive --archive /tmp/archive.zip --skip-embeddings
# 更新每日放送、权威 NSFW 标志和章节，并缓存 2 小时
docker compose exec worker python -m app.worker.sync_calendar
# 更新当季与上季的评分、收藏、话数、封面和详情
docker compose exec worker python -m app.worker.refresh_current_season
# 生成新增/简介或元信息变更条目的向量（每批 64）
docker compose exec worker python -m app.worker.build_embeddings
```

计划任务按 `TZ=Asia/Shanghai`：每周一 04:00 全量导入；整点同步日历；每天 05:00 刷新当季与上季。worker 是独立进程，API 多实例不会重复注册任务；长任务使用可续期 Redis 租约。`worker:heartbeat` 每 30 秒更新，Compose 用其检查 worker 存活。

## 本地开发与设计预览

前端需要 Node.js 20+，后端需要 Python 3.11。

```bash
cd frontend
npm ci
# 无需后台服务即可查看设计稿中的虚构示例；该模式会明确标注“设计预览”。
printf 'NEXT_PUBLIC_DEMO_MODE=true\nAPI_INTERNAL_URL=http://127.0.0.1:8000\n' > .env.local
npm run dev
```

当前工作区已配置上述本地预览。生产 Compose 默认 `NEXT_PUBLIC_DEMO_MODE=false`，Docker 构建会排除 `.env.local`；不会把示例检索或示例对话当作真实服务输出。此变量在构建时写入前端，变更后需重建前端镜像。

本地后端需要可连接的 PostgreSQL/Redis/Meilisearch；将地址指向自己的本机实例：

```bash
cd backend
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='postgresql+asyncpg://fanjuwu:fanjuwu@127.0.0.1:5432/fanjuwu'
export REDIS_URL='redis://127.0.0.1:6379/0'
export MEILI_URL='http://127.0.0.1:7700'
export MEILI_MASTER_KEY='与自己的 Meilisearch 配置一致'
alembic upgrade head
uvicorn app.main:app --reload
# 另一终端使用相同环境变量
python -m app.worker.scheduler
```

连接真实 API 时，把 `frontend/.env.local` 的 `NEXT_PUBLIC_DEMO_MODE` 改为 `false`，重启前端。`NEXT_PUBLIC_API_BASE=/api` 使用同源转发；`API_INTERNAL_URL` 由 Node.js 流式代理在运行时读取，Docker 默认 `http://backend:8000`。

## 页面与行为

- `/`：北京时间日期与季度、七天放送、网格和时间轴；视图偏好保存到浏览器。
- `/anime`：关键词联想、分类/来源/地区、类型 AND 筛选、年份和季度、分面计数、排序、列表/网格、每页 18 条与 URL 同步。
- `/anime/[id]`：简介、评分、制作信息、章节、角色声优、关联作品、相似推荐；收藏、浏览记录与提醒标记保存在当前浏览器。提醒用于本地列表管理，不发送系统推送。
- `/chat`：匿名客户端会话、Markdown、剧透遮罩、SSE 工具状态和文本、来源与动画卡片、停止生成、复制、重试及删除历史。反馈按钮在当前会话记录界面标记。
- `/` 快捷键打开全局搜索，Esc 关闭，↑↓ 与 Enter 选择；手机为底部三栏导航和筛选抽屉。
- NSFW 默认关闭，服务端过滤条目和统计；首次开启需年龄确认。默认模糊封面，支持单张解除或设置直接显示。关闭时清空解除记录、清除当前聊天显示；服务端会遮盖曾开启 NSFW 时生成的历史内容。

## API

全部数据接口前缀 `/api`，Pydantic 模型与完整参数说明见 `/docs`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/calendar?nsfw=false` | 七天分组，Redis 未命中时回源并写缓存 |
| GET | `/api/anime/search` | `q/category/source/region/genres/year/season/min_score/sort/page/page_size/nsfw` |
| GET | `/api/anime/suggest?q=...` | 前八条联想 |
| GET | `/api/anime/{id}` | 详情，NSFW 被拦截为 403 `NSFW_BLOCKED` |
| GET | `/api/meta/filters` | 枚举、可见作品年份、当前季度 |
| POST | `/api/chat` | `{client_id,session_id?,message,nsfw}`，SSE |
| GET | `/api/chat/sessions?client_id=...` | 客户端会话列表 |
| GET/DELETE | `/api/chat/sessions/{id}?client_id=...` | 必须提供所属客户端 UUID |
| GET | `/api/health` | 数据库/Redis/Meili 连通性；降级状态为 503 |

搜索 `region` 默认日本，`all` 表示不限；类型参数可重复 `genres=奇幻&genres=治愈`。季度是 `winter/spring/summer/autumn`，年份/季度不限时省略。API 默认每页 24、最大 60；前端按设计稿每页请求 18。每组 facet 应用除本组外的其余筛选。

SSE 事件为 `session / tool_start / tool_end / token / anime_refs / sources / done / error`。客户端使用 `fetch` 与 `ReadableStream`，能解析 UTF-8 与跨分片 CRLF。服务端最多五轮工具调用，优先强制站内查询，加载最近十条上下文；请求的 NSFW 状态固定传入工具，模型无法覆盖。Tavily 只有站内无结果或问题需要外部新闻/访谈时才可用，未配置明确返回未启用。

普通 API 按客户端 IP 每分钟 120 次，聊天按 client UUID 每分钟 10 次，Redis 不可用时限流返回 503。Next.js 流式代理会覆盖专用客户端 IP 标头，后端仅从 `TRUSTED_PROXY_CIDRS` 指定的内部网段信任该标头。外层再加反向代理时应在边缘补充按真实访问者 IP 的限流，并限制代理网段。健康接口不参与限流。

## 配置与常见问题

**首次导入需要多久？** Archive 是完整数据集，网络、磁盘和索引重建可能耗时较长。JSONL 逐行读取，数据库每批最多 1000 条 upsert；ZIP 下载到临时文件并验证官方 SHA256，不整包读入内存。通过 `docker compose logs -f worker` 查看进度。Archive 不包含封面，API 刷新阶段会继续补全。Bangumi API 全局每秒最多两次，日历含详情与章节补全，因此冷缓存首次请求可能较慢。

**向量化费用如何控制？** 不填 `EMBEDDING_API_KEY` 即跳过；默认只为评分人数 ≥50 的条目生成，文本按 hash 增量更新，每批 64，长简介截断控制输入。首次全量向量化可能产生显著费用，可先用 `--skip-embeddings`，再调高 `EMBED_MIN_COLLECTS` 后手动运行。向量缺失时助手会获得明确的不可用说明，仍可使用关键词查询。

**如何换模型？** 修改 `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL`；兼容 OpenAI chat completions、streaming 和 function calling 的服务可直接使用。向量服务通过独立 `EMBEDDING_*` 配置。修改后 `docker compose up -d --force-recreate backend worker`。`EMBEDDING_DIM` 范围 1–2000（pgvector vector HNSW 限制），默认1536；若更改已有库的维度，需自行执行数据迁移后重新生成向量，不可只改变量。

**搜索引擎不可用？** 搜索自动回退 PostgreSQL，NSFW 过滤和分面计数仍在服务端执行。健康检查会反映降级。索引重建使用临时索引原子交换，并与增量索引写入共享锁，避免交换时丢失刚同步的更新。

**匿名客户端标识？** 首访使用 `crypto.randomUUID()`，存入 localStorage。会话的读取、继续、删除都验证客户端归属；它是轻量匿名会话方案，不是账户登录系统。清理浏览器站点数据后无法恢复原客户端历史。生产使用 HTTPS。

**数据与内容？** Bangumi 用户标签经白名单映射（用户标签 count≥10），meta_tags 优先，地区缺失默认日本。未知 NSFW 标志保守隐藏；角色和人员缓存24小时。旧归档按官方导出时间保护已实时更新的条目。条目与动画版权属于相应权利人，本站不提供播放服务。

## 测试与验证

```bash
cd backend
.venv/bin/python -m pytest -q
# 使用隔离、自动回滚的临时 schema 验证真实 PostgreSQL/pgvector
TEST_DATABASE_URL='postgresql+asyncpg://user:password@localhost:5432/fanjuwu' .venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q app alembic
cd ../frontend
npm test
npm run typecheck
npm run build
cd ..
docker compose config --quiet
```

测试覆盖季度边界、wiki 单值/数组、标签优先级、NSFW 服务端过滤、SQL 分面、旧缓存复核、1001条批量写入、微型 ZIP 动画过滤、快照新旧保护、索引交换并发、工具调用策略、会话权限/敏感历史遮盖、SSE 分片与停止持久化。未配置模型服务时，测试使用可控 SDK 边界验证流式协议；不自动执行付费模型请求或完整 Archive 导入。
