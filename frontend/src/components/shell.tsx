"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import useSWR from "swr";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useApp } from "./providers";
import {
  Icon,
  SlideTabs,
  Cover,
  Score,
  Highlight,
  Chip,
  ErrorState,
} from "./ui";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { cn, animeTitle, beijingNow } from "@/lib/utils";
import { DEMO_MODE, suggestAnime, searchAnime, getAnime } from "@/lib/api";
import type { Anime } from "@/types";
const NAV = [
  { key: "/", label: "每日放送", icon: "CalendarDays" },
  { key: "/anime", label: "动画库", icon: "LibraryBig" },
  { key: "/stats", label: "数据统计", icon: "ChartNoAxesCombined" },
  { key: "/chat", label: "AI 助手", icon: "Sparkles" },
];
export function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2"
      aria-label="番剧坞首页"
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-sakura to-ind text-white shadow-[0_6px_18px_-6px_rgba(255,107,157,.7)]">
        <Icon name="Tv" size={17} strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-sakura" />
      </span>
      <span className="text-[17px] font-semibold tracking-wide">番剧坞</span>
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/",
    router = useRouter();
  const { theme, setTheme } = useTheme();
  const app = useApp();
  const [collection, setCollection] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,[contenteditable="true"]')
        )
      ) {
        e.preventDefault();
        app.setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app.setSearchOpen]);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[100] rounded bg-card p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        跳到主要内容
      </a>
      <header className="glass sticky top-0 z-50 border-b border-line">
        <div className="container-page flex h-16 items-center gap-3 md:gap-2 lg:gap-4">
          <Logo />
          <nav className="ml-2 hidden md:block lg:ml-6" aria-label="主导航">
            <SlideTabs
              items={NAV.map((n) => ({
                key: n.key,
                label: (
                  <span className="flex items-center gap-1.5">
                    <Icon name={n.icon} size={16} />
                    {n.label}
                  </span>
                ),
              }))}
              value={path}
              onChange={(p) => router.push(p)}
              itemClass="h-16 px-2 text-[13px] font-medium lg:px-4 lg:text-[14px]"
            />
          </nav>
          <div className="flex-1" />
          <button
            onClick={() => app.setSearchOpen(true)}
            aria-label="搜索番剧"
            className="hidden h-9 w-[210px] items-center gap-2 rounded-lg border border-line bg-elev/70 px-3 text-[13px] text-mut transition-colors hover:border-sakura/50 sm:flex md:w-[150px] lg:w-[280px]"
          >
            <Icon name="Search" size={16} />
            <span className="flex-1 truncate text-left">
              搜索番剧、原名、别名
            </span>
            <kbd className="grid h-5 min-w-5 place-items-center rounded border border-line bg-card font-mono text-[11px]">
              /
            </kbd>
          </button>
          <button
            onClick={() => app.setSearchOpen(true)}
            className="icon-btn sm:hidden"
            aria-label="搜索"
          >
            <Icon name="Search" size={19} />
          </button>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="icon-btn"
            aria-label="切换深浅色"
          >
            <Icon
              name={!app.ready || theme === "dark" ? "Sun" : "Moon"}
              size={18}
            />
          </button>
          <Menu.Root open={app.settingsOpen} onOpenChange={app.setSettingsOpen}>
            <Menu.Trigger
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-sakura transition data-[state=open]:ring-2"
              aria-label="打开设置菜单"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#FFB3CB] to-[#8C98FF] text-[13px] font-semibold text-white">
                栞
              </span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content
                align="end"
                sideOffset={12}
                className="z-[70] w-[264px] rounded-xl border border-line bg-card p-1.5 shadow-2xl pop-in"
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#FFB3CB] to-[#8C98FF] font-semibold text-white">
                    栞
                  </span>
                  <div>
                    <div className="text-sm font-semibold">本地访客</div>
                    <div className="text-xs text-mut">
                      追番 {app.favorites.length} 部 · 浏览 {app.history.length}{" "}
                      部
                    </div>
                  </div>
                </div>
                <Menu.Separator className="my-1 h-px bg-line" />
                {[
                  ["Heart", "我的收藏"],
                  ["History", "观看记录"],
                  ["Bell", "更新提醒"],
                ].map(([icon, label]) => (
                  <Menu.Item
                    key={label}
                    onSelect={() => setCollection(label)}
                    className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[13px] outline-none focus:bg-elev"
                  >
                    <Icon name={icon} size={16} className="text-mut" />
                    {label}
                  </Menu.Item>
                ))}
                <Menu.Separator className="my-1 h-px bg-line" />
                {path !== "/stats" && (
                  <div className="flex h-11 items-center gap-2.5 px-3 text-[13px]">
                    <Icon name="ShieldAlert" size={16} className="text-mut" />
                    <label
                      htmlFor="global-nsfw"
                      className="flex-1 cursor-pointer"
                    >
                      显示 NSFW 内容
                    </label>
                    <Switch
                      id="global-nsfw"
                      checked={app.nsfw}
                      onCheckedChange={app.requestNsfw}
                    />
                  </div>
                )}
                {path !== "/stats" && app.nsfw && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-mut">
                    <label htmlFor="unblur" className="flex-1">
                      直接显示 NSFW 封面
                    </label>
                    <Switch
                      id="unblur"
                      checked={app.unblur}
                      onCheckedChange={app.setUnblur}
                    />
                  </div>
                )}
                <div className="flex h-11 items-center gap-2.5 px-3 text-[13px]">
                  <Icon name="Moon" size={16} className="text-mut" />
                  <label htmlFor="dark-theme" className="flex-1 cursor-pointer">
                    深色模式
                  </label>
                  <Switch
                    id="dark-theme"
                    checked={theme === "dark"}
                    onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                  />
                </div>
                <div className="mx-3 mb-2 mt-1 text-[11px] leading-relaxed text-mut">
                  偏好与收藏保存在当前浏览器
                </div>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      <main
        id="main-content"
        className={cn(path === "/chat" ? "" : "min-h-[65vh] pb-12")}
      >
        {children}
      </main>
      {path !== "/chat" && <Footer />}
      <nav
        aria-label="移动导航"
        className="glass fixed inset-x-0 bottom-0 z-50 flex border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.key}
            className={cn(
              "relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px]",
              path === n.key ? "text-sakura" : "text-mut",
            )}
          >
            {path === n.key && (
              <span className="absolute top-0 h-[3px] w-8 rounded-b bg-sakura" />
            )}
            <Icon name={n.icon} size={22} />
            {n.label}
          </Link>
        ))}
      </nav>
      <SearchPalette />
      <CollectionDialog title={collection} close={() => setCollection(null)} />
    </>
  );
}
function SearchPalette() {
  const { searchOpen, setSearchOpen, nsfw } = useApp();
  const router = useRouter();
  const [q, setQ] = useState(""),
    [debounced, setDebounced] = useState(""),
    [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    if (searchOpen) {
      setQ("");
      setIdx(0);
    }
  }, [searchOpen]);
  const { data: results = [], error } = useSWR(
    searchOpen ? ["suggest", debounced, nsfw] : null,
    () => suggestAnime(debounced, nsfw),
  );
  const { data: popular } = useSWR(
    searchOpen && !q ? ["popular", nsfw] : null,
    () =>
      searchAnime(
        new URLSearchParams({
          sort: "collects",
          page_size: "6",
          region: "all",
        }),
        nsfw,
      ),
  );
  const open = (id?: number) => {
    setSearchOpen(false);
    router.push(
      id
        ? `/anime/${id}`
        : `/anime?q=${encodeURIComponent(q.trim())}&region=all`,
    );
  };
  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent
        hideClose
        className="top-[12vh] max-w-[620px] translate-y-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">全局番剧搜索</DialogTitle>
        <div className="flex h-14 items-center gap-3 border-b border-line px-4">
          <Icon name="Search" className="text-sakura" size={20} />
          <input
            aria-label="搜索番剧、原名或别名"
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                open(results[idx]?.id);
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
            placeholder="搜索番剧、原名、别名…"
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-mut"
          >
            ESC
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!q ? (
            <div className="px-3 py-4">
              <p className="mb-3 text-xs text-mut">本季热门</p>
              <div className="flex flex-wrap gap-2">
                {popular?.items.map((a) => (
                  <Chip key={a.id} onClick={() => open(a.id)}>
                    {animeTitle(a)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-mut">搜索服务暂时不可用</p>
          ) : (
            <>
              {results.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => open(a.id)}
                  onMouseEnter={() => setIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                    idx === i ? "bg-elev" : "hover:bg-elev/60",
                  )}
                >
                  <div className="w-9 shrink-0">
                    <Cover a={a} titleScale={0.35} className="rounded" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <Highlight text={animeTitle(a)} q={q} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-mut">
                      <Highlight text={a.name || ""} q={q} /> · {a.year}
                    </p>
                  </div>
                  <Score value={a.score} />
                </button>
              ))}
              <button
                className={cn(
                  "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-[13px] text-sakura",
                  idx === results.length && "bg-elev",
                )}
                onClick={() => open()}
              >
                在动画库中搜索「{q}」<Icon name="ChevronRight" size={15} />
              </button>
            </>
          )}
        </div>
        <div className="flex gap-4 border-t border-line px-5 py-2.5 text-[11px] text-mut">
          <span>↑ ↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function CollectionDialog({
  title,
  close,
}: {
  title: string | null;
  close: () => void;
}) {
  const { favorites, history, reminders, nsfw } = useApp();
  const ids =
    title === "我的收藏"
      ? favorites
      : title === "更新提醒"
        ? reminders
        : history;
  const { data = [], error } = useSWR(
    title ? ["collection", title, ids.join(","), nsfw] : null,
    async () => {
      const results = await Promise.allSettled(
        ids.map((id) => getAnime(id, nsfw)),
      );
      return results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
    },
  );
  return (
    <Dialog open={!!title} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg p-6" aria-describedby={undefined}>
        <DialogTitle className="mb-5 text-lg font-semibold">
          {title}
        </DialogTitle>
        {error ? (
          <ErrorState message="读取失败" />
        ) : data.length ? (
          <div className="space-y-2">
            {data.map((a) => (
              <Link
                href={`/anime/${a.id}`}
                onClick={close}
                key={a.id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-elev"
              >
                <div className="w-10">
                  <Cover a={a} titleScale={0.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {animeTitle(a)}
                  </p>
                  <p className="mt-1 text-xs text-mut">
                    {a.year} · {a.category}
                  </p>
                </div>
                <Score value={a.score} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-mut">
            这里还没有作品，去发现下一部喜欢的番剧吧
          </p>
        )}
        {title === "更新提醒" && (
          <p className="mt-4 text-xs text-mut">
            已标记的作品会保留在这里，方便回到放送表查看更新。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
function Footer() {
  const [legal, setLegal] = useState("");
  return (
    <footer className="mb-16 border-t border-line bg-card/30 md:mb-0">
      <div className="container-page grid gap-8 py-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-mut">
            在这里，遇见下一部心动的番剧。
            <br />
            每日放送、动画检索，还有懂你的 AI 番剧助手。
          </p>
          <a
            href="https://bgm.tv"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-elev px-2.5 py-1.5 text-xs text-mut"
          >
            <Icon name="Database" size={12} />
            数据来源：Bangumi 番组计划
            <Icon name="ExternalLink" size={11} />
          </a>
          {DEMO_MODE && (
            <span className="ml-2 inline-block text-[11px] text-sakura">
              设计预览 · 示例数据
            </span>
          )}
        </div>
        <div>
          <h3 className="mb-3 text-[13px] font-semibold">关于</h3>
          <div className="flex flex-col items-start gap-2.5 text-xs text-mut">
            {["关于我们", "使用条款", "隐私政策", "意见反馈"].map((x) => (
              <button
                key={x}
                onClick={() => setLegal(x)}
                className="hover:text-sakura"
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-[13px] font-semibold">友情链接</h3>
          <div className="flex flex-col items-start gap-2.5 text-xs text-mut">
            {[
              ["Bangumi 番组计划", "https://bgm.tv"],
              ["AniList", "https://anilist.co"],
              ["MyAnimeList", "https://myanimelist.net"],
              ["萌娘百科", "https://zh.moegirl.org.cn"],
            ].map(([n, h]) => (
              <a
                key={n}
                href={h}
                target="_blank"
                rel="noreferrer"
                className="hover:text-sakura"
              >
                {n}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="container-page border-t border-line py-4 text-xs text-mut">
        © {beijingNow().getFullYear()} 番剧坞 · Fanjuwu{" "}
        <span className="ml-2 hidden sm:inline">用热爱，连接每一部好动画</span>
      </div>
      <Dialog open={!!legal} onOpenChange={(v) => !v && setLegal("")}>
        <DialogContent className="max-w-lg p-6">
          <DialogTitle className="text-lg font-semibold">{legal}</DialogTitle>
          <DialogDescription className="mt-4 text-sm leading-7 text-mut">
            {legal === "隐私政策"
              ? "浏览偏好、收藏和匿名客户端标识保存在浏览器。AI 会话存储在本站服务器，调用模型与网络搜索时会发送当前问题和必要上下文；不应输入个人敏感信息。你可以在会话列表删除历史。"
              : legal === "使用条款"
                ? "本站提供动画信息检索和讨论，不提供动画播放。数据来自 Bangumi，版权归各自权利人。AI 回答可能存在误差，请结合所附来源核实。"
                : legal === "意见反馈"
                  ? "遇到问题时，请在项目仓库提交 Issue，并附页面地址、操作步骤和错误提示。项目部署者可在 README 中补充自己的反馈渠道。"
                  : "番剧坞是基于 Bangumi 开放数据的动画资讯项目，帮助你查看每日放送、查找动画、探索作品与创作者。"}
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
