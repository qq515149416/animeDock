# Findings
- Design archive: ten source/reference files, all fictional anime with procedurally drawn covers. High fidelity required.
- Tokens: dark bg #0F1115, card #181B22, elev #20242D, fg #ECEEF3, mut #888FA0, line #282C36; sakura #FF6B9D and indigo #5B6CFF.
- Container 1440px, 64px sticky nav, 6/4/3/2 columns. Hero and daily sticky tabs, library quarter emphasis, detail two-column, AI history sidebar.
- Backend contract is /api, calendar seven groups, search disjunctive facets, ownership-protected sessions and SSE.

- 2026-10-20: 真实库 31,178 个动画，仅 108 个 image_url 非空；10380/328609/400602 均为空。浏览器没有对应 img 请求，排除网络加载失败。归档没有封面字段，当前仅当季同步补全。官方 `/v0/subjects/10380/image?type=large` 返回 302 指向正常可访问的封面，并缓存一小时。
- 角色 API 同时有 images.large/medium，现有卡片直接裁剪为正方形且无点击处理；大图应使用 large + object-contain。声优 actors 同样有 images 字段。
