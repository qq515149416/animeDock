# Handoff: 番剧坞 — 动画资讯网站（每日放送 / 动画库 / 详情 / AI 番剧助手）

## Overview
「番剧坞」是面向动画爱好者的番剧查询网站。核心功能三块：**每日放送**（按星期查看本季新番更新）、**动画库**（多维筛选检索，重点是年份 + 季度）、**AI 番剧助手**（类 ChatGPT 对话，回复内嵌可点击番剧卡片、工具调用状态、剧透遮罩、来源标识）。另有**番剧详情页**，任意卡片可进入。气质：干净、精致、有二次元氛围但不幼稚，封面为主角。

## About the Design Files
本包中的文件是**用 HTML 制作的设计参考**——用于展示预期外观与交互的原型，**不是可直接上线的生产代码**。任务是在目标代码库的现有环境中（React / Next.js / Vue 等）使用其既有模式与组件库**重新实现**这些设计；若尚无代码库，推荐 **Next.js (App Router) + React + Tailwind CSS + shadcn/ui + lucide-react**（与原始需求一致）。

原型以浏览器内 Babel 运行 JSX、Tailwind CDN，组件为手写（未引入 shadcn/ui），图标使用 lucide 图标数据经自定义 `<Icon>` 渲染——生产实现中请换为 `lucide-react`，并用 shadcn/ui 的 `Switch / Dialog / Sheet / DropdownMenu / Tabs / Select / Command` 等替换手写组件。

## Fidelity
**High-fidelity（高保真）**。颜色、字号、间距、圆角、动效、交互均为最终意图，请按像素级还原。封面图为占位（见 Assets）。

---

## Global Layout

### 顶部导航 `TopNav`（吸顶，毛玻璃）
- `position: sticky; top: 0; z-index: 50`，高 **64px**，底部 1px 边框 `--line`
- 背景：`rgb(var(--bg) / .72)` + `backdrop-filter: saturate(160%) blur(18px)`
- 内容容器：`max-width: 1440px`，水平 padding 16 / 24(md) / 32(lg)
- 左：Logo（32×32、圆角 10px、`from-sakura to-ind` 135° 渐变方块 + Tv 图标 17px + 右上 10px 白点带 2px 粉环）+ 文字「番剧坞」17px / 600
- 中（≥768px 显示）：三个导航项 `每日放送 / 动画库 / AI 助手`，每项 64px 高、padding 0 16px、14px / 500，左侧图标 16px（CalendarDays / LibraryBig / Sparkles）。**滑动下划线**：3px 高、圆角、`--sakura`，宽度为当前项宽度的 60% 居中，`transition: all 200ms ease-out`。进入详情页时无选中项
- 右：
  - 搜索触发器（≥640px）：240px（lg 280px）× 36px，圆角 8px，边框 `--line`、背景 `--elev / .7`，占位「搜索番剧、原名、别名」13px `--mut`，右侧 `/` kbd 标识；hover 边框 `sakura / .5`。<640px 为 36×36 图标按钮
  - 深浅色切换：36×36 图标按钮（Sun / Moon 18px）
  - 头像：32px 圆形渐变 `#FFB3CB → #8C98FF`，文字「栞」；外圈 2px ring，打开时 ring 为 sakura

### 用户菜单（下拉，宽 264px，圆角 12px，卡片背景，阴影 2xl）
- 用户信息：40px 头像 + 「雨宫栞」14px/600 + 「追番 47 部 · 看过 312 部」12px mut
- 菜单项（36px 高，13px）：我的收藏 / 观看记录 / 更新提醒
- 开关项（44px 高）：**显示 NSFW 内容**（默认关）、深色模式
- 退出登录

### 18 岁确认弹窗 `AgeGate`
- 首次开启 NSFW 时弹出（任何入口：头像菜单、动画库筛选）。宽 400px，padding 24px，圆角 16px
- 56px 红色调图标块（ShieldAlert 28px，`red-500 / .12` 背景）、标题「年龄确认」18px/600、说明 13px mut
- 按钮两列 44px：「我未满 18 岁」（elev）/「我已满 18 岁」（sakura 实心）
- 确认后 `localStorage['fjw.ageOk']=true`，之后开关不再弹窗；NSFW 状态存 `localStorage['fjw.nsfw']`

### 全局搜索面板 `SearchPalette`（快捷键 `/`）
- 在非输入元素上按 `/` 打开；Esc 关闭。距顶 12vh，宽 620px，圆角 16px
- 输入行 56px；空状态展示「本季热门」Chip（热度前 6）
- 输入后匹配中文名 / 日文名 / 别名，最多 7 条：36px 宽封面缩略、名称（匹配段落高亮为 sakura/600）、副行（别名命中时显示「别名：xxx」）、年份·分类、评分
- ↑↓ 选择、Enter 打开详情；最后一项「在动画库中搜索「q」」→ 跳转 `#/library?q=`

### 移动端底部 Tab Bar（<768px）
- 固定底部 64px，毛玻璃，三等分；图标 22px + 文字 11px；选中为 sakura、顶部 3px×32px 指示条；适配 `safe-area-inset-bottom`

### 页脚
- 三列（md）：品牌简介 + 「数据来源：Bangumi 番组计划」标识（elev 背景 12px）/ 关于（关于我们、使用条款、隐私政策、意见反馈）/ 友情链接（Bangumi 番组计划、AniList、MyAnimeList、萌娘百科）
- 底部版权行 12px mut。AI 页不显示页脚

---

## Screens / Views

### 1. 每日放送（首页）`#/daily`
**Hero**
- 背景：两处径向渐变（左上 sakura .22、右上 indigo .22）+ 18px 点阵（fg .08，向下 mask 渐隐）
- 季度标签 pill：「2026 秋季番」12px/600，sakura 文字、`sakura/.1` 背景、`sakura/.3` 边框，左侧 Leaf 图标
- 标题：「10 月 19 日 · 星期一」30px → 44px(md)，600，tracking-tight
- 副行：「今日更新 **N** 部 · 本季共 M 部新番/续作在播」，N 为 24px/600 sakura
- ≥1024px 右侧叠放今日评分前三封面（104px 宽，-4° / 0 / 4° 旋转，上下错位 ±10px）

**星期 Tab（吸顶在导航下方 top:64px，背景 `bg/.85` + blur）**
- 周一 ~ 周日，每项 min-width 64px（md 84px）、高 60px；主行 14px/600；副行 11px mut「10/19 · 3 部」
- 默认选中今天；今天的项有「今天」徽标（sakura 实心、10px/600、圆角 4px）
- 下划线滑动同导航。**注意**：需在字体加载 / 尺寸变化后重新测量（原型使用 ResizeObserver + `document.fonts.ready`）
- 右侧分段控件：网格 / 时间轴（偏好存 localStorage `fjw.prefs.dailyView`）

**网格视图**：`grid-cols-2 / sm:3 / md:4 / xl:6`，gap-x 16px、gap-y 24px

**时间轴视图**：按播出时间升序分组；左列时间 18–20px/600 tabular-nums，凌晨档额外显示「(25:30)」；竖线 1px `--line`；节点圆点 11px（已播：灰；下一个即将播出：sakura 实心 + 脉冲动画 + 「即将播出」标签；未播：indigo 描边）。每条为横向卡片：封面 72/80px、新番/续作标签、标题 15px/600、原名、评分 + 第 X 话 + 制作公司、类型小标签、右侧箭头；已播条目 opacity .75

### 2. 动画库 `#/library`
**标题区**：「动画库」26/32px，副行「收录 N 部作品 · 按季度、类型、来源精确检索」，顶部淡渐变背景

**大搜索框**：最大宽 760px、高 56px、圆角 16px、卡片背景 + card 阴影；右侧「搜索」按钮 40px sakura（≥640px）、清除按钮。输入时展示建议下拉（最多 6 条，与搜索框相连、sakura/.6 边框），支持键盘选择；Enter 提交为查询条件

**筛选区（桌面，卡片容器圆角 16px，可折叠）**
- 头部：「筛选」+ 收起/展开（ChevronDown 旋转 200ms），折叠用 `grid-template-rows: 0fr ↔ 1fr` 300ms
- **放送时间（重点，置顶醒目块）**：`sakura/.25` 边框，背景 `sakura/.08 → indigo/.05 → transparent` 横向渐变，圆角 12px
  - 年份下拉：44px 高、14px/600、圆角 12px；选项「全部年份」+ 2026 ~ 1960
  - 季度按钮组：`全部 / ❄冬(1月) / 🌸春(4月) / ☀夏(7月) / 🍂秋(10月)`（图标为 lucide Snowflake / Flower2 / Sun / Leaf），每项带数量；选中 sakura 实心 + 粉色投影
  - 折叠后，年份 + 季度仍以快捷条形式显示在筛选卡片底部
- 分类：全部 / TV / 剧场版 / OVA / WEB
- 来源：全部 / 原创 / 漫画改 / 小说改 / 游戏改 / 动画改 / 其他
- 类型（多选，AND 逻辑）：恋爱 / 搞笑 / 奇幻 / 科幻 / 异世界 / 日常 / 治愈 / 热血 / 悬疑 / 运动 / 音乐 / 百合 / 机战；选中带 ✓
- 地区：全部 / 日本（**默认**）/ 中国 / 欧美 / 韩国 / 其他
- 分级：「显示 NSFW 内容」开关（与全局同步）
- **Chip**：32px 高、圆角 full、padding 0 12px、13px；默认 `--elev` 背景，hover `--elev2`；选中 sakura 实心白字 + `0 4px 14px -4px rgba(255,107,157,.6)`；数量 11px（选中 white/.8，未选 mut）；数量为 0 时 opacity .45
- **数量为分面计数**：每组数量 = 应用除本组外所有其它条件后的结果数

**移动端**：筛选为底部抽屉（Sheet，max-height 86vh，顶部拖拽条），底部「重置」+「查看 N 部结果」

**已选条件汇总栏**：已选 pill（28px、`sakura/.1` 背景 + `sakura/.35` 边框、sakura 文字、× 移除）+「清空全部」（RotateCcw 图标）。包含搜索词、各单选项、每个类型、年份、季度

**结果栏**：「共 **N** 部」+ 排序分段（综合 / 评分 / 热度 / 最新）+ 视图分段（网格 / 列表）
- 综合排序 = `score*0.6 + log10(heat)*0.8`
- 每页 18 条，底部数字分页（36px 方块，选中 sakura），换页平滑滚动到结果顶部

**列表视图行**：卡片 padding 12px、圆角 12px；封面 78/88px；标题 15px/600 + 原名；右上评分 18px/600 + 排名「#12」；元信息行「2026 年 秋季 | TV | 漫画改 | 日本」+ 类型标签；简介 13px mut 两行省略

**空状态**：三张叠放的卡片插画（中间 SearchX 图标 sakura、两侧 ±12° 旋转，背后粉蓝模糊光晕、两颗漂浮 Sparkle）、标题「没有找到符合条件的番剧」、说明、按钮「清空筛选」+「试试问 AI 助手」（sakura→indigo 渐变）→ 带预设问题跳转 AI 页

### 3. 番剧详情 `#/detail/:id`
- **Hero**：封面放大 125% + blur-3xl + opacity .7 作背景，覆盖 `bg/.4 → bg/.7 → bg` 纵向渐变
- 「返回」链接；左封面 180px（md 240px），深阴影 `0 24px 60px -20px rgba(0,0,0,.6)`
- 标签行：分类、年季、「连载中」（脉冲点）、R18
- 标题 26/38px 600；原名 15px fg/.65；别名 12px mut
- 数据块（`fg/.07` 背景、圆角 12px）：**Bangumi 评分**（26px sakura + 星标）、排名 #N、收藏人数（≥1 万显示「x.x 万」）、更新至第 X 话
- 操作：「收藏追番」（sakura 实心 → 已收藏态 `fg/.1` 背景 + 实心心形）、「更新提醒」、分享
- **主栏**：剧情简介（3 行截断 + 展开全部）、角色与声优（横向滚动卡片 148px：方形头像、主角/配角标签、角色名、CV）、关联作品（前作/续作，两列横卡）、相似推荐（共享类型最多 → 评分）
- **右侧栏 320px（lg 吸顶 top 96px）**：作品信息表（放送日期、季度、集数、放送时间、分类、来源、地区、制作公司、导演），标签云（字号 15/14/13/12 轮换，前 3 个 sakura 色调）
- **浮动按钮**「问问 AI 关于这部番」：右下（移动端 bottom 96px 避开 Tab Bar），48px 高 pill、sakura→indigo 渐变、粉色投影、hover 上浮 2px → 跳转 AI 页并自动发送「给我讲讲《xxx》，值得看吗？」
- NSFW 作品在 NSFW 关闭时显示拦截提示

### 4. AI 番剧助手 `#/ai`
- 高度 `100dvh - 64px`（移动端再减 64px Tab Bar），背景两处径向渐变（右上 indigo .16、左下 sakura .12）
- **左侧会话栏 272px**（≥1024px 默认展开；<1024px 为覆盖层 + 遮罩）：「新对话」按钮、收起按钮（PanelLeftClose）、「历史会话」列表（选中 `sakura/.12` 背景、hover 显示删除）、底部免责说明
- **顶栏 48px**：展开按钮（侧栏收起时）、会话标题、「BETA」标签（indigo）
- **空状态**：64px 渐变图标块 + 光晕、「今天想看点什么？」24/30px、说明、2×2 推荐卡片：
  - 推荐几部 2025 年评分最高的漫画改番（Trophy）
  - 有没有类似 CLANNAD 那样催泪的番？（Droplets）
  - 今天更新了哪些番？（CalendarCheck）
  - 帮我讲讲这季度最火的新番（Flame）
- **消息**：内容区最大宽 820px，消息间距 32px
  - 用户气泡：右对齐、sakura 背景白字、圆角 16px（右下 6px）、最大宽 85%
  - AI：左侧 32px 渐变头像；内容依次为：
    1. **工具调用状态**：转圈（sakura 描边旋转 0.8s）+ shimmer 文字「正在检索站内动画库…」→ 完成后绿色 ✓ + 结果描述（如「命中 5 部」）；多步串行，每步约 0.9–1.3s
    2. **流式文本**（每 22ms 推进 3 字符，末尾 8×18 粉色闪烁光标）；支持 `**粗体**`、换行、「·」列表
    3. **番剧小卡片**：横向滚动，每张 232px（48px 封面 + 名称 + 年份·分类·来源 + 评分 + 箭头），点击进入详情，逐张 pop-in 60ms 延迟
    4. **剧透块**：虚线 `sakura/.4` 边框、「⚠ 剧透内容」标签，正文 blur(6px)，中央「点击显示剧透」按钮
    5. **来源标识**：「📚 站内数据 | 番剧坞动画库」或「🌐 网络搜索 · 📚 站内数据」+ 编号外链列表（indigo）
    6. 操作：复制 / 重新生成 / 有帮助 / 没帮助
- **输入框**：圆角 16px、卡片背景 .9 + blur；textarea 自增高（最大 180px）；**Enter 发送，Shift+Enter 换行**（输入法组合中不发送）；右侧 40px 按钮：发送（sakura，空输入禁用）/ 生成中切换为「停止」（实心方块）。停止后消息标注「· 已停止生成」
- 自动滚动到底，用户上翻 >80px 时停止跟随
- 初始默认有一段 CLANNAD 演示对话（完整展示上述所有特性）

---

## Interactions & Behavior
- 路由：hash 路由 `#/daily`、`#/library?q=`、`#/detail/:id`、`#/ai`；支持浏览器前进后退；切页 `scrollTo(0)`
- **卡片 hover**：整体 `translateY(-4px)` + 阴影加深，封面 `scale(1.06)`（300ms），标题变 sakura；所有过渡 200ms
- **骨架屏**：切换星期 / 视图 / 筛选 / 排序 / 分页 / 进入详情时显示 300–380ms（生产中替换为真实加载状态）；shimmer 1.3s
- **NSFW**：关闭时完全隐藏 NSFW 作品；开启后卡片带「R18」红色角标（右上、10px/700、`red-500/.9`），封面 `blur-xl scale-110` + 「点击显示」覆盖层，单张点击解除（会话内记忆，关闭 NSFW 时清空）
- 弹窗：Esc 关闭、点击遮罩关闭，进入 `popIn` 200ms（scale .97→1）；抽屉 `slideUp` 260ms `cubic-bezier(.2,.8,.2,1)`
- 进入动画 `fadeIn` 280ms（translateY 4px → 0）
- 深浅色：`html.dark` class 切换，存 `localStorage['fjw.theme']`，默认 dark

## Responsive
| 断点 | 行为 |
|---|---|
| ≥1280px | 卡片 6 列；详情双栏；AI 侧栏常驻 |
| 768–1279px | 卡片 4 列（640–767 3 列）；顶部导航可见 |
| <768px | 底部 Tab Bar；筛选为底部抽屉；卡片 2 列；搜索为图标按钮 |
| ≤430px | 所有点击目标 ≥36px（Tab Bar 项 64px 高） |

## State Management
- 全局（Context / Zustand）：`theme`、`nsfw`、`ageConfirmed`、`revealedNsfwIds:Set`、`searchOpen`、`prefs.dailyView`、`route`
- 每日放送：`selectedWeekday`（默认今天，周一=1…周日=7）、`view`
- 动画库：`query`、`filters {type, source, genres[], region, year, season}`（默认 region=日本）、`sort`、`view`、`page`、`collapsed`、`drawerOpen`；筛选变化时 page 重置为 1；**建议筛选同步到 URL query**
- AI：`sessions[] {id,title,time,msgs[]}`、`currentId`、`busy`、`input`；AI 消息结构 `{tools[], toolStep, blocks[{t:'text'|'cards'|'spoiler', v|ids}], progress, total, done, stopped, source{kind:'local'|'web', links[]}}`
- 数据接口（生产）：放送表、条目检索（含分面计数）、条目详情（角色/声优/关联）、AI 对话（SSE 流式，事件类型：tool_start / tool_end / text_delta / anime_cards / spoiler / source / done）

## Data Model（mock 见 `data.js`）
```
Anime { id, cn, jp, alias[], type: 'TV'|'剧场版'|'OVA'|'WEB', source, genres[], region,
        year, season: 1|4|7|10, score, rank, fav, heat, eps, airing, weekday(1-7), time('HH:mm'),
        kind: '新番'|'续作'|'', nsfw, studio, director, desc, chars[{name,cv,role}],
        related[[id, relLabel]], startDate }
```
- 当前话数 = `min(eps, floor((today - startDate)/7) + 1)`
- 时间 00:00–04:59 视为前一天深夜档（排序键 +24h）

## Design Tokens
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0F1115` | `#F7F8FA` |
| `--card` | `#181B22` | `#FFFFFF` |
| `--elev` | `#20242D` | `#EFF1F5` |
| `--elev2` | `#2C313C` | `#E2E5EC` |
| `--fg` | `#ECEEF3` | `#161921` |
| `--mut` | `#888FA0` | `#707684` |
| `--line` | `#282C36` | `#E4E7ED` |
| `--sakura`（主强调） | `#FF6B9D` | `#FF6B9D` |
| `--ind`（次强调） | `#5B6CFF` | `#5B6CFF` |
| R18 角标 | `#EF4444 / .9` | 同 |
| 成功 ✓ | emerald-400 `#34D399` | 同 |

- **字体**：`"PingFang SC", "Noto Sans SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`；标题 600；数字 `tabular-nums`
- **字号**：11 / 12 / 13 / 14 / 15 / 17 / 18 / 20 / 26 / 30 / 38 / 44 px
- **圆角**：卡片/封面 12px（主规范）；小标签 4–6px；输入/大容器 16px；Chip/头像 full
- **阴影**：
  - card：`0 1px 2px rgb(0 0 0/.06), 0 4px 14px -6px rgb(0 0 0/ .35 dark | .08 light)`
  - card-hover：`0 2px 4px rgb(0 0 0/.08), 0 18px 36px -12px rgb(0 0 0/ .55 dark | .16 light)`
- **间距**：4px 基准；容器 max-width 1440px，padding 16 / 24 / 32
- **动效**：通用 200ms；封面缩放 300ms；骨架 1.3s；脉冲 1.6s

## Assets
- **封面**：原型中为程序生成的海报式占位（按作品 `h1/h2` 色相的 oklch 渐变 + 光球 + 竖排日文名 + 斜纹），比例 **5:7**。生产中替换为真实封面（Bangumi API `images.large`），或开发期使用 `https://picsum.photos/seed/{id}/300/420`
- **角色头像**：渐变方块 + 名字末字占位，生产替换为真实角色图
- **图标**：lucide（`lucide-react`），所用图标：Tv, CalendarDays, LibraryBig, Sparkles, Search, Sun, Moon, Heart, History, Bell, ShieldAlert, LogOut, X, Star, EyeOff, Eye, Leaf, Snowflake, Flower2, LayoutGrid, Clock3, List, ChevronDown/Left/Right, SlidersHorizontal, Check, RotateCcw, CalendarRange, SearchX, Sparkle, Mic, Share2, SquarePen, PanelLeftClose, PanelLeftOpen, MessageSquare, Trash2, ArrowUp, TriangleAlert, Copy, RefreshCw, ThumbsUp, ThumbsDown, ExternalLink, Trophy, Droplets, CalendarCheck, Flame, CornerDownLeft, Database
- 所有作品、角色、声优、制作公司均为**虚构**示例数据

## Files
| 文件 | 内容 |
|---|---|
| `番剧坞.html` | 入口：Tailwind 配置、CSS 变量 / 主题、关键帧动画、App 根组件、hash 路由、全局状态 |
| `data.js` | 45 部 mock 作品、常量（分类 / 来源 / 类型 / 地区）、工具函数（当前话数、季度、时间排序键） |
| `ui.jsx` | 基础组件：Icon、Cover/CoverArt（含 NSFW 模糊）、AnimeCard、CardSkeleton、Chip、Segmented、SlideTabs（滑动下划线）、Switch、Modal、Drawer、Highlight、matchAnime |
| `shell.jsx` | TopNav、UserMenu、AgeGate、SearchPalette、MobileTabBar、Footer |
| `page-daily.jsx` | 每日放送：Hero、星期 Tab、网格 / 时间轴 |
| `page-library.jsx` | 动画库：搜索建议、筛选面板（分面计数）、已选汇总、排序 / 视图、列表行、分页、空状态 |
| `page-detail.jsx` | 番剧详情 |
| `page-ai.jsx` | AI 助手 UI：会话栏、欢迎页、消息渲染（工具状态 / 流式 / 小卡片 / 剧透 / 来源）、输入框 |
| `ai-engine.js` | AI 回复 mock：按提问意图返回结构化 blocks（生产中由后端 LLM + 工具调用替代） |

在浏览器中直接打开 `番剧坞.html` 即可运行原型（需联网加载 CDN）。
