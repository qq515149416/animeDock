# 验收记录 · 2026-10-19

## 自动检查

- Python 3.11 全部测试：89 passed，0 skipped；实际 PostgreSQL16 + pgvector。
- 前端测试：7 passed，覆盖北京时间跨日/跨年、连续年份季度与多类型操作、SSE UTF-8/CRLF分片、真实HTTP流代理、请求中止传播、代理IP覆写。
- TypeScript strict：通过。
- Next.js14生产构建和Docker前后端镜像：通过。
- Alembic upgrade head：已对实际PostgreSQL执行。
- OpenAPI：9个路径，全部响应模型可生成。
- Compose生产前后端、PostgreSQL、Redis、Meilisearch：5个容器健康检查通过。
- 生产前端代理`/api/health`：200，database/redis/meilisearch全部true。
- 生产SSE无模型key：200流，明确LLM_NOT_CONFIGURED；会话归属404和删除200，测试会话已清理。
- worker复用后端镜像手动执行向量任务：无key时正常跳过并退出，不产生费用。

## 真实服务边界

- Meilisearch：索引创建、别名与拼写容错、筛选、分面、原子重建和并发增量。
- 过期索引敏感统计：原始total3含隐藏1999年，经权威NSFW过滤后total2且不返回隐藏年份。
- Redis：限流第11次返回429、租约续期、重复任务排除、heartbeat TTL。
- PostgreSQL：真实SQL筛选和分面、章节进度、直接/关联NSFW访问、1001条批量upsert、旧快照保护、微型ZIP导入、独立事务的会话持久化。
- 官方Archive：核对latest.json真实字段，下载ZIP前256KiB验证subject.jsonlines与官方platform常量；完整大包尚未导入。

## 浏览器验收

- 桌面每日放送、网格/时间轴、星期切换；首页截图见screenshots/daily-desktop.png。
- 动画库6列，手机390px两列、底部导航、底部筛选抽屉，无横向溢出。
- 年份和季度连续操作保持AND条件、分面更新、URL同步；全局快捷键搜索和别名“星邮”联想跳转。
- 深浅色主题、收藏计数、NSFW年龄确认、20px封面模糊与单图显示；完成后恢复NSFW关闭。
- 详情简介、制作信息、章节、角色声优、关联与相似作品。
- AI示例对话卡片/来源、剧透点击显示、发送/停止、会话切换与删除入口。
- 修复首次主题图标SSR水合差异、延迟历史响应覆盖新会话/NSFW策略、历史加载时发送导致永久spinner。
- 独立代码审查的全部重要问题已修复并复核。

## 未执行的外部调用

没有用户模型/向量/Tavily密钥，未执行付费LLM、向量化或真实Tavily调用。协议、工具循环、隐私和持久化使用可控SDK边界与真实数据库测试；缺少密钥的生产SSE已实测。未在此次开发验收下载和导入完整Archive；正式启动worker时空库会自动执行，也可按README手动运行。

前端`.env.local`仅用于设计预览；生产Docker默认关闭示例模式。收藏、观看记录和提醒是浏览器本地功能，提醒不发送系统推送。测试资源和独立schema已清理。

最终镜像运行复验：`/icon.svg`、`/api/health`、`/anime`均200。数据库anime与chat_session均0条，验收未污染正式底库；初次启动worker仍会触发空库自动导入。临时验收容器和本机开发服务在完成后停止，镜像与数据卷保留；按README启动即可。
