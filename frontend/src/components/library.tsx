"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useId } from "react";
import useSWR from "swr";
import { useApp } from "./providers";
import {
  Icon,
  Chip,
  Segmented,
  Cover,
  Score,
  AnimeCard,
  GridSkeleton,
  ErrorState,
  EmptyState,
  Highlight,
} from "./ui";
import { Sheet, SheetContent } from "./ui/sheet";
import { Switch } from "./ui/switch";
import { searchAnime, suggestAnime, getMeta } from "@/lib/api";
import {
  cn,
  SEASONS,
  currentSeason,
  seasonName,
  animeTitle,
} from "@/lib/utils";
import type { Anime, Filters, SearchResult, MetaFilters } from "@/types";
import { updateFilterQuery, toggleGenreQuery } from "@/lib/filters";
const FALLBACK_META: MetaFilters = {
  categories: ["TV", "剧场版", "OVA", "WEB", "其他"],
  sources: ["原创", "漫画改", "小说改", "游戏改", "动画改", "其他"],
  genres: [
    "恋爱",
    "搞笑",
    "奇幻",
    "科幻",
    "异世界",
    "日常",
    "治愈",
    "热血",
    "悬疑",
    "运动",
    "音乐",
    "百合",
    "机战",
  ],
  regions: ["日本", "中国", "欧美", "韩国", "其他"],
  years: Array.from(
    { length: currentSeason().year - 1959 },
    (_, i) => currentSeason().year - i,
  ),
  current_season: { year: currentSeason().year, season: currentSeason().value },
};
export function Library() {
  const params = useSearchParams() ?? new URLSearchParams(),
    router = useRouter();
  const app = useApp();
  const serialized = params.toString();
  const f: Filters = {
    q: params.get("q") || "",
    category: params.get("category") || "all",
    source: params.get("source") || "all",
    region: params.get("region") || "日本",
    genres: params.getAll("genres"),
    year: params.get("year") || "all",
    season: params.get("season") || "all",
    sort: params.get("sort") || "relevance",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
  const [input, setInput] = useState(f.q),
    [suggest, setSuggest] = useState(false),
    [debounced, setDebounced] = useState(""),
    [idx, setIdx] = useState(-1),
    [collapsed, setCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false);
  const top = useRef<HTMLDivElement>(null),
    box = useRef<HTMLDivElement>(null);
  useEffect(() => setInput(f.q), [f.q]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setSuggest(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const query = new URLSearchParams(serialized);
  if (!query.has("region")) query.set("region", "日本");
  query.set("page_size", "18");
  const { data, error, isLoading, mutate } = useSWR(
    app.ready ? ["library", query.toString(), app.nsfw] : null,
    () => searchAnime(query, app.nsfw),
  );
  const { data: meta = FALLBACK_META } = useSWR(
    app.ready ? ["meta", app.nsfw] : null,
    () => getMeta(app.nsfw),
  );
  const { data: catalog } = useSWR(
    app.ready ? ["catalog-total", app.nsfw] : null,
    () =>
      searchAnime(
        new URLSearchParams({ region: "all", page_size: "1" }),
        app.nsfw,
      ),
  );
  const { data: suggestions = [] } = useSWR(
    suggest && debounced ? ["library-suggest", debounced, app.nsfw] : null,
    () => suggestAnime(debounced, app.nsfw),
  );
  const update = (key: string, value: string | string[]) => {
    const p = updateFilterQuery(window.location.search, key, value);
    window.history.replaceState(null, "", `/anime?${p}`);
  };
  const toggleGenre = (genre: string) => {
    const p = toggleGenreQuery(window.location.search, genre);
    window.history.replaceState(null, "", `/anime?${p}`);
  };
  const reset = () => {
    setInput("");
    window.history.replaceState(null, "", "/anime?region=all");
  };
  const selected: { key: string; label: string; remove: () => void }[] = [];
  if (f.q)
    selected.push({
      key: "q",
      label: `搜索：${f.q}`,
      remove: () => {
        update("q", "");
        setInput("");
      },
    });
  for (const field of ["category", "source", "region"] as const)
    if (f[field] !== "all")
      selected.push({
        key: field,
        label: f[field],
        remove: () => update(field, "all"),
      });
  f.genres.forEach((g) =>
    selected.push({ key: g, label: g, remove: () => toggleGenre(g) }),
  );
  if (f.year !== "all")
    selected.push({
      key: "year",
      label: `${f.year} 年`,
      remove: () => update("year", "all"),
    });
  if (f.season !== "all")
    selected.push({
      key: "season",
      label: `${seasonName(f.season)}季`,
      remove: () => update("season", "all"),
    });
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 18));
  const goto = (p: number) => {
    update("page", String(p));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const panel = (
    <FilterPanel
      f={f}
      data={data}
      meta={meta}
      update={update}
      toggleGenre={toggleGenre}
    />
  );
  const submit = () => {
    update("q", input.trim());
    setSuggest(false);
  };
  return (
    <div className="container-page">
      <section className="relative pb-6 pt-8 md:pt-12">
        <div className="lib-grad pointer-events-none absolute inset-x-0 top-0 h-48" />
        <div className="relative">
          <h1 className="text-[26px] font-semibold md:text-[32px]">动画库</h1>
          <p className="mt-1 text-sm text-mut">
            收录 {catalog?.total.toLocaleString() || "—"} 部作品 ·
            按季度、类型、来源精确检索
          </p>
          <div ref={box} className="relative mt-5 max-w-[760px]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (idx >= 0 && suggestions[idx])
                  router.push(`/anime/${suggestions[idx].id}`);
                else submit();
              }}
              className={cn(
                "flex h-14 items-center gap-3 rounded-2xl border bg-card px-4 shadow-card transition-all",
                suggest && suggestions.length
                  ? "rounded-b-none border-sakura/60"
                  : "border-line focus-within:border-sakura/60",
              )}
            >
              <Icon name="Search" size={20} className="text-mut" />
              <input
                aria-label="动画库搜索"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setSuggest(true);
                  setIdx(-1);
                }}
                onFocus={() => setSuggest(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIdx((i) => Math.min(i + 1, suggestions.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIdx((i) => Math.max(-1, i - 1));
                  }
                  if (e.key === "Escape") setSuggest(false);
                }}
                placeholder="搜索中文名、原名或别名…"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => {
                    setInput("");
                    update("q", "");
                  }}
                  className="icon-btn"
                  aria-label="清除搜索"
                >
                  <Icon name="X" size={16} />
                </button>
              )}
              <button className="hidden h-10 rounded-xl bg-sakura px-5 text-sm font-semibold text-white transition hover:brightness-110 sm:block">
                搜索
              </button>
            </form>
            {suggest && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-40 rounded-b-2xl border border-t-0 border-sakura/60 bg-card p-2 shadow-2xl">
                {suggestions.slice(0, 6).map((a, i) => (
                  <Link
                    key={a.id}
                    href={`/anime/${a.id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2",
                      i === idx ? "bg-elev" : "hover:bg-elev",
                    )}
                  >
                    <div className="w-8 shrink-0">
                      <Cover a={a} titleScale={0.3} className="rounded" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <Highlight text={animeTitle(a)} q={input} />
                      </p>
                      <p className="text-[11px] text-mut">
                        {a.year} · {a.category}
                      </p>
                    </div>
                    <Score value={a.score} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="hidden rounded-2xl border border-line bg-card shadow-card md:block">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-12 w-full items-center justify-between px-5 text-sm font-semibold"
          aria-expanded={!collapsed}
        >
          <span className="flex items-center gap-2">
            <Icon name="SlidersHorizontal" size={16} className="text-sakura" />
            筛选
          </span>
          <span className="flex items-center gap-1 text-xs font-normal text-mut">
            {collapsed ? "展开" : "收起"}
            <Icon
              name="ChevronDown"
              size={14}
              className={cn("transition-transform", !collapsed && "rotate-180")}
            />
          </span>
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300",
            collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
          )}
        >
          <div className="overflow-hidden">{panel}</div>
        </div>
        {collapsed && (
          <div className="border-t border-line px-5 py-3">
            <SeasonPicker
              f={f}
              meta={meta}
              facets={data?.facets.season}
              update={update}
            />
          </div>
        )}
      </section>
      <div className="mb-4 flex items-center justify-between md:hidden">
        <button className="btn-secondary" onClick={() => setDrawer(true)}>
          <Icon name="SlidersHorizontal" size={16} />
          筛选
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-sakura px-1.5 text-[11px] text-white">
              {selected.length}
            </span>
          )}
        </button>
        <span className="text-xs text-mut">
          {f.year === "all" ? "全部年份" : f.year}
          {f.season !== "all" ? ` · ${seasonName(f.season)}季` : ""}
        </span>
      </div>
      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {selected.map((s) => (
            <button
              key={s.key}
              onClick={s.remove}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-sakura/35 bg-sakura/10 px-2.5 text-xs text-sakura"
            >
              {s.label}
              <Icon name="X" size={12} />
            </button>
          ))}
          <button
            onClick={reset}
            className="ml-1 flex items-center gap-1.5 text-xs text-mut hover:text-fg"
          >
            <Icon name="RotateCcw" size={12} />
            清空全部
          </button>
        </div>
      )}
      <div
        ref={top}
        className="mb-5 mt-6 flex scroll-mt-24 flex-wrap items-center gap-3"
      >
        <span className="mr-auto text-sm text-mut">
          共{" "}
          <strong className="mx-0.5 font-semibold text-fg">
            {data?.total || 0}
          </strong>{" "}
          部
        </span>
        <Segmented
          value={f.sort}
          onChange={(v) => update("sort", v)}
          options={[
            { value: "relevance", label: "综合" },
            { value: "score", label: "评分" },
            { value: "collects", label: "热度" },
            { value: "latest", label: "最新" },
          ]}
        />
        <Segmented
          value={app.prefs.libraryView}
          onChange={(v) => app.setPref("libraryView", v)}
          options={[
            { value: "grid", icon: "LayoutGrid", label: "网格" },
            { value: "list", icon: "List", label: "列表" },
          ]}
        />
      </div>
      {error ? (
        <ErrorState
          message="动画库暂时无法加载，请检查后端服务"
          retry={() => mutate()}
        />
      ) : isLoading || !app.ready ? (
        <GridSkeleton />
      ) : !data?.items.length ? (
        <EmptyState reset={reset} />
      ) : app.prefs.libraryView === "grid" ? (
        <div className="anime-grid">
          {data.items.map((a) => (
            <AnimeCard
              key={a.id}
              a={a}
              showEp={false}
              extra={
                <span className="text-[11px] text-mut">
                  {a.year} · {seasonName(a.season)}季
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((a) => (
            <ListRow key={a.id} a={a} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div
          className="mt-9 flex flex-wrap justify-center gap-2"
          aria-label="分页"
        >
          <button
            disabled={f.page <= 1}
            onClick={() => goto(f.page - 1)}
            className="icon-btn border border-line"
            aria-label="上一页"
          >
            <Icon name="ChevronLeft" size={16} />
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - f.page) <= 2)
            .map((p, i, arr) => (
              <div key={p} className="flex items-center gap-2">
                {i > 0 && p - arr[i - 1] > 1 && (
                  <span className="px-1 text-mut">…</span>
                )}
                <button
                  onClick={() => goto(p)}
                  aria-current={p === f.page ? "page" : undefined}
                  className={cn(
                    "h-9 w-9 rounded-lg text-sm",
                    p === f.page
                      ? "bg-sakura text-white"
                      : "border border-line bg-card hover:bg-elev",
                  )}
                >
                  {p}
                </button>
              </div>
            ))}
          <button
            disabled={f.page >= pages}
            onClick={() => goto(f.page + 1)}
            className="icon-btn border border-line"
            aria-label="下一页"
          >
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      )}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent title="筛选番剧">
          <div className="overflow-y-auto">{panel}</div>
          <div className="flex gap-3 border-t border-line p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <button onClick={reset} className="btn-secondary">
              重置
            </button>
            <button
              onClick={() => setDrawer(false)}
              className="btn-primary flex-1"
            >
              查看 {data?.total || 0} 部结果
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
interface PanelProps {
  f: Filters;
  data?: SearchResult;
  meta: MetaFilters;
  update: (key: string, value: string | string[]) => void;
  toggleGenre: (g: string) => void;
}
function FilterPanel({ f, data, meta, update, toggleGenre }: PanelProps) {
  const app = useApp();
  const switchId = useId();
  const [moreGenres, setMoreGenres] = useState(false);
  const counts = data?.facets || {};
  return (
    <div className="flex flex-col gap-4 px-4 pb-5 md:px-5">
      <div className="rounded-xl border border-sakura/25 bg-gradient-to-r from-sakura/8 via-ind/5 to-transparent p-3.5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-sakura">
          <Icon name="CalendarDays" size={14} />
          放送时间
        </div>
        <SeasonPicker
          f={f}
          meta={meta}
          facets={counts.season}
          update={update}
        />
      </div>
      {(
        [
          { key: "category", label: "分类", options: meta.categories },
          { key: "source", label: "来源", options: meta.sources },
          { key: "region", label: "地区", options: meta.regions },
        ] as const
      ).map((group) => (
        <div
          className={cn(
            "flex gap-3",
            group.key === "region"
              ? "order-4"
              : group.key === "source"
                ? "order-2"
                : "order-1",
          )}
          key={group.key}
        >
          <span className="w-10 shrink-0 pt-2 text-[13px] text-mut">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {["all", ...(group.options || [])].map((value) => (
              <Chip
                key={value}
                active={f[group.key] === value}
                count={
                  counts[group.key]?.[value] ??
                  (value === "all"
                    ? Object.entries(counts[group.key] || {})
                        .filter(([k]) => k !== "all")
                        .reduce((sum, [, v]) => sum + v, 0)
                    : 0)
                }
                onClick={() => update(group.key, value)}
              >
                {value === "all" ? "全部" : value}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <div className="order-3 flex gap-3">
        <span className="w-10 shrink-0 pt-2 text-[13px] text-mut">类型</span>
        <div className="flex flex-wrap gap-2">
          {(moreGenres
            ? meta.genres
            : meta.genres.filter((g, i) => i < 13 || f.genres.includes(g))
          ).map((g) => (
            <Chip
              key={g}
              active={f.genres.includes(g)}
              count={counts.genres?.[g] || 0}
              onClick={() => toggleGenre(g)}
            >
              {f.genres.includes(g) && <Icon name="Check" size={12} />} {g}
            </Chip>
          ))}
          {meta.genres.length > 13 && (
            <button
              onClick={() => setMoreGenres(!moreGenres)}
              className="inline-flex h-8 items-center gap-1 px-2 text-xs text-mut hover:text-sakura"
            >
              {moreGenres ? "收起" : "更多类型"}
              <Icon
                name="ChevronDown"
                size={12}
                className={moreGenres ? "rotate-180" : ""}
              />
            </button>
          )}
        </div>
      </div>
      <div className="order-5 flex items-center gap-3 border-t border-line pt-4">
        <span className="w-10 text-[13px] text-mut">分级</span>
        <label
          className="flex cursor-pointer items-center gap-3 text-[13px]"
          htmlFor={switchId}
        >
          <Switch
            id={switchId}
            checked={app.nsfw}
            onCheckedChange={app.requestNsfw}
          />
          显示 NSFW 内容
        </label>
        <span className="hidden text-[11px] text-mut sm:block">
          开启后默认模糊封面
        </span>
      </div>
    </div>
  );
}
function SeasonPicker({
  f,
  meta,
  facets,
  update,
}: {
  f: Filters;
  meta: MetaFilters;
  facets?: Record<string, number>;
  update: PanelProps["update"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-11 items-center rounded-xl border border-line bg-card">
        <button
          className="icon-btn h-10 w-7"
          aria-label="上一年"
          onClick={() =>
            update(
              "year",
              String(
                (f.year === "all" ? currentSeason().year : Number(f.year)) - 1,
              ),
            )
          }
        >
          <Icon name="ChevronLeft" size={14} />
        </button>
        <select
          aria-label="年份"
          value={f.year}
          onChange={(e) => update("year", e.target.value)}
          className="h-full max-w-[120px] bg-transparent px-1 text-sm font-semibold"
        >
          <option value="all">全部年份</option>
          {[
            ...new Set([
              ...meta.years,
              ...Array.from(
                { length: currentSeason().year - 1959 },
                (_, i) => currentSeason().year - i,
              ),
              ...(f.year !== "all" ? [Number(f.year)] : []),
            ]),
          ]
            .sort((a, b) => b - a)
            .map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
        </select>
        <button
          className="icon-btn h-10 w-7"
          aria-label="下一年"
          disabled={
            f.year !== "all" && Number(f.year) >= currentSeason().year + 1
          }
          onClick={() =>
            update(
              "year",
              String(
                (f.year === "all" ? currentSeason().year - 1 : Number(f.year)) +
                  1,
              ),
            )
          }
        >
          <Icon name="ChevronRight" size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip
          active={f.season === "all"}
          onClick={() => update("season", "all")}
        >
          全部
        </Chip>
        {SEASONS.map((s) => (
          <Chip
            key={s.value}
            active={f.season === s.value}
            count={facets?.[s.value] || 0}
            onClick={() => update("season", s.value)}
          >
            <Icon name={s.icon} size={13} />
            {s.label}
            <span className="text-[11px] opacity-70">({s.month}月)</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
export function ListRow({ a }: { a: Anime }) {
  return (
    <Link
      href={`/anime/${a.id}`}
      className="group flex gap-4 rounded-xl border border-line bg-card p-3 transition hover:border-sakura/40 hover:shadow-cardh"
    >
      <div className="w-[78px] shrink-0 md:w-[88px]">
        <Cover a={a} titleScale={0.6} className="rounded-lg" />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold group-hover:text-sakura">
              {animeTitle(a)}
            </h3>
            <p className="mt-1 truncate text-xs text-mut">{a.name}</p>
          </div>
          <div className="text-right">
            <Score value={a.score} className="text-lg" />
            <p className="text-[11px] text-mut">#{a.rank || "—"}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-mut">
          {a.year} 年 {seasonName(a.season)}季{" "}
          <span className="mx-1 text-line">|</span> {a.category}{" "}
          <span className="mx-1 text-line">|</span> {a.source}{" "}
          <span className="mx-1 text-line">|</span> {a.region}
        </p>
        <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
          {a.genres?.map((g) => (
            <span
              key={g}
              className="rounded bg-elev px-1.5 py-0.5 text-[11px] text-mut"
            >
              {g}
            </span>
          ))}
        </div>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-mut">
          {a.summary}
        </p>
      </div>
    </Link>
  );
}
