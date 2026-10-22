# Findings

## 封面覆盖回归根因
- 用户截图作品517532：数据库image_url为空，但Bangumi官方 `/v0/subjects/517532/image?type=large` 返回302到 `https://lain.bgm.tv/pic/cover/l/d1/c5/517532_1b818.jpg`，实际有封面。旧详情把MAL图片写入响应image_url，列表仍使用官方端点，造成不一致。
- 修复采用主图/备用图分离：补充接口不再改写image_url；fallback_image_url/provider独立返回。共享CoverImage只有在原图onError后才尝试备用，兼容已有带image_url来源标记的旧响应。
- 实际浏览器验收：列表与详情均使用上述官方地址且naturalWidth=1250；屏蔽官方原图请求后才显示MAL备用图（naturalWidth=600）；解除屏蔽后重新加载恢复官方封面。本地6服务健康；后端131项、前端18项及类型/生产构建通过。

## 2026-10-22 实施验收
- 已按用户确认个人自用接入MAL/Kitsu/AniList公开作品数据；MAL Client ID真实查询成功，secret仅保留服务端配置，不发送公开读取请求。
- 30部跨TV/剧场版/OVA/WEB/其他样本：23部至少一源成功，MAL18/Kitsu21/AniList22；严格保留7部未可靠匹配。报告 docs/verification/external-catalog-sample-2026-10-22.json。该报告是当时的快照，并不代表全库覆盖率。
- 生产本地验证：6容器healthy；原始Anime仍31178条；新表0002已迁移。/anime/160209 显示3源独立评分，保留中文Bangumi简介及8.1分；封面/制作公司来自MAL，背景来自Kitsu，页面标注来源。补充热接口14–34ms；8631关闭NSFW时主详情和补充接口均403。实际API响应未包含MAL两项凭据。
- Kitsu实际章节分页返回26话，全部通过EpisodeResponse验证，展示ID均为负数且不入Bangumi章节表。桌面与390px手机无横向溢出；截图 docs/screenshots/external-catalog-desktop.png、external-catalog-mobile.png。

## 2026-10-21 API feasibility (analysis only)
- Existing Anime/Episode primary keys are Bangumi IDs; AnimeCard uses one score/rank/collects; source means original work type, not data provider. Preserve existing IDs/contracts for an enrichment-first design.
- AniList official terms explicitly prohibit mass collection/hoarding, use as backup/storage, and competing non-complementary services including anime list/tracker services. Restriction applies to media and user data. Free commercial use below USD150/month revenue does not waive these restrictions; above that needs commercial licensing. Therefore no proposed full mirror; applicability to this discovery/tracking app needs confirmation from AniList before enabling.
- MAL official help requires application registration and Client ID via web/account settings; user supplied URL is help article, not detailed API specification.
- Hummingbird documentation is Kitsu JSON:API edge. Public GETs generally unauthenticated; documented default page=10, max=20; unauthenticated NSFW is hidden. Old docs contain unfinished app registration and password grant instructions, so defer account sync and verify live behavior.
- Sources: https://docs.anilist.co/guide/terms-of-use ; https://help.myanimelist.net/hc/en-us/articles/900003108823-API ; https://hummingbird-me.github.io/api-docs/
- AniList rate page currently warns temporary degradation to 30 requests/minute despite nominal 90; use live response headers and Retry-After, not hard-coded 90. Source: https://docs.anilist.co/guide/rate-limiting
- MAL v2 official reference confirms X-MAL-CLIENT-ID for public search/detail/ranking/season; OAuth needed for personal mutations. Detail fields include mean/rank/popularity/num_scoring_users/nsfw/pictures/related_anime/recommendations/studios/broadcast. No official numeric request quota found in that reference; no guarantee should be invented. Source: https://myanimelist.net/apiconfig/references/api/v2
- Kitsu terms redirect from kitsu.io to kitsu.app, page explicitly announces the move. Terms distinguish open-source software from proprietary content and restrict separate reuse/commercial use of Kitsu Content; public API documentation is not blanket licensing of its data/images. Need confirm permitted display/cache scope, especially commercial use. Source: https://kitsu.app/terms
- MAL application configuration redirects to login; no account login or app creation performed. Only official docs and public pages read.
- Public single-record probes (2026-10-21, no imports): AniList GraphQL HTTP200, response X-RateLimit-Limit=30, Media.id=1/idMal=1; Kitsu .io edge anime+include=mappings HTTP200, supports MAL and AniList external mappings, actual attributes include averageRating/ratingFrequencies/ratingRank/popularityRank/nsfw/posterImage/coverImage. Current image URLs use media.kitsu.app. MAL query without Client ID HTTP403; authenticated MAL access not tested.
- MAL API agreement successfully read in browser at https://myanimelist.net/static/apiagreement.html (web tool could not fetch it). Restricts altering/translating API content absent written permission, commercial application revenue absent express written authorization, and server-side storage of personal/user-generated data. Application registration/approved scope and allowed cache/display must be checked before activation. Thus do not propose automatic translation, unrestricted permanent mirroring, or personal data storage by default.
- AniList considerations say isAdult filtering not guaranteed equivalent across services; ecchi is not adult there. Preserve conservative local NSFW filtering; do not let a single upstream false loosen existing restrictions.
- Additional read-only errors: web tool could not open MAL agreement/auth or AniList auth (403); browser succeeded on MAL agreement/auth. Kitsu ReDoc fields absent in collapsed body text, verified via public API instead.
- Design archive: ten source/reference files, all fictional anime with procedurally drawn covers. High fidelity required.
- Tokens: dark bg #0F1115, card #181B22, elev #20242D, fg #ECEEF3, mut #888FA0, line #282C36; sakura #FF6B9D and indigo #5B6CFF.
- Container 1440px, 64px sticky nav, 6/4/3/2 columns. Hero and daily sticky tabs, library quarter emphasis, detail two-column, AI history sidebar.
- Backend contract is /api, calendar seven groups, search disjunctive facets, ownership-protected sessions and SSE.

- 2026-10-20: 真实库 31,178 个动画，仅 108 个 image_url 非空；10380/328609/400602 均为空。浏览器没有对应 img 请求，排除网络加载失败。归档没有封面字段，当前仅当季同步补全。官方 `/v0/subjects/10380/image?type=large` 返回 302 指向正常可访问的封面，并缓存一小时。
- 角色 API 同时有 images.large/medium，现有卡片直接裁剪为正方形且无点击处理；大图应使用 large + object-contain。声优 actors 同样有 images 字段。
