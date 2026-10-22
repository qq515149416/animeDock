"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { useApp } from "./providers";
import {
  Cover,
  CoverImage,
  Icon,
  Score,
  AnimeCard,
  GridSkeleton,
  ErrorState,
} from "./ui";
import { CharacterGallery } from "./character-gallery";
import { ExternalSources } from "./external-sources";
import { CATALOG_LABELS, mergeAnimeEnrichment } from "@/lib/enrichment";
import { getAnime, getAnimeEnrichment, searchAnime, ApiError } from "@/lib/api";
import {
  cn,
  animeTitle,
  formatCount,
  seasonName,
  WEEK_FULL,
  beijingNow,
  beijingDate,
} from "@/lib/utils";
import type { Anime } from "@/types";
export function AnimeDetailPage({ id }: { id: number }) {
  const app = useApp(),
    router = useRouter();
  const [expanded, setExpanded] = useState(false),
    [episodeAll, setEpisodeAll] = useState(false);
  const {
    data: base,
    error,
    isLoading,
    mutate,
  } = useSWR(
    app.ready && Number.isSafeInteger(id) ? ["anime", id, app.nsfw] : null,
    () => getAnime(id, app.nsfw),
  );
  const { data: external, error: externalError, isLoading: externalLoading, mutate: retryExternal } = useSWR(
    base ? ["anime-enrichment", id, app.nsfw] : null,
    () => getAnimeEnrichment(id, app.nsfw),
    { revalidateOnFocus: false, errorRetryCount: 1, refreshInterval: (data) => data?.pending ? 2000 : 0 },
  );
  const a = base ? mergeAnimeEnrichment(base, external) : undefined;
  useEffect(() => {
    if (a) app.recordHistory(a.id);
  }, [a?.id, app.recordHistory]);
  const { data: similar } = useSWR(
    a?.genres?.length ? ["similar", a.id, app.nsfw] : null,
    () =>
      searchAnime(
        new URLSearchParams({
          genres: a!.genres[0],
          region: "all",
          sort: "score",
          page_size: "7",
        }),
        app.nsfw,
      ),
  );
  if (!Number.isSafeInteger(id) || id <= 0)
    return (
      <div className="container-page py-16">
        <ErrorState message="无效的番剧编号" />
      </div>
    );
  if (error instanceof ApiError && error.status === 403)
    return (
      <div className="container-page py-24 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-sakura/10">
          <Icon name="ShieldAlert" size={36} className="text-sakura" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">该作品属于敏感内容</h1>
        <p className="mt-3 text-sm text-mut">
          需开启 NSFW 开关后才能查看相关信息
        </p>
        <button
          onClick={() => app.setSettingsOpen(true)}
          className="btn-primary mt-6"
        >
          前往设置
        </button>
      </div>
    );
  if (error)
    return (
      <div className="container-page py-12">
        <ErrorState
          message={
            error.status === 404
              ? "未找到这部作品，请尝试搜索其他番剧"
              : "作品信息暂时无法加载"
          }
          retry={() => mutate()}
        />
      </div>
    );
  if (!a || isLoading)
    return (
      <div className="container-page py-12">
        <div className="mb-12 flex gap-8">
          <div className="skel aspect-[5/7] w-[180px] rounded-xl" />
          <div className="flex-1 space-y-6 py-5">
            <div className="skel h-9 w-2/3 rounded" />
            <div className="skel h-5 w-1/2 rounded" />
            <div className="skel h-20 rounded-xl" />
          </div>
        </div>
        <GridSkeleton />
      </div>
    );
  const liked = app.favorites.includes(a.id),
    reminder = app.reminders.includes(a.id);
  const title = animeTitle(a);
  const current = a.latest_ep || 0;
  const episodes = episodeAll ? a.episodes : a.episodes?.slice(0, 24);
  const share = async () => {
    try {
      if (navigator.share)
        await navigator.share({
          title: `${title} · 番剧坞`,
          url: location.href,
        });
      else {
        await navigator.clipboard.writeText(location.href);
        app.toast("链接已复制");
      }
    } catch {
      app.toast("分享已取消，可复制浏览器地址");
    }
  };
  const metadata = [
    ["放送日期", a.air_date || "待公布"],
    ["季度", a.year ? `${a.year} 年 ${seasonName(a.season)}季` : "待公布"],
    ["话数", a.eps ? `${a.eps} 话` : "待公布"],
    [
      "放送时间",
      a.air_weekday
        ? `${WEEK_FULL[a.air_weekday - 1]}${a.air_time ? ` ${a.air_time}` : ""}`
        : "待公布",
    ],
    ["分类", a.category],
    ["来源", a.source],
    ["地区", a.region],
    ["制作公司", a.studio || "待公布"],
    ["导演", a.director || "待公布"],
  ];
  return (
    <div className="pb-24 md:pb-12">
      <section className="fade-in relative overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 scale-125 blur-3xl",
            a.nsfw ? "opacity-20" : "opacity-70",
          )}
        >
          <CoverImage a={a.banner_image_url ? { ...a, image_url: a.banner_image_url } : a} decorative />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
        <div className="container-page relative pb-8 pt-6">
          <button
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/anime");
            }}
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-fg/70 hover:text-sakura"
          >
            <Icon name="ArrowLeft" size={15} />
            返回
          </button>
          <div className="flex flex-col gap-6 sm:flex-row md:gap-8">
            <div className="w-[150px] shrink-0 self-start rounded-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] sm:w-[180px] md:w-[240px]">
              <Cover a={a} titleScale={1.3} />
            </div>
            <div className="min-w-0 flex-1 py-1 md:py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-md border border-fg/15 bg-fg/7 px-2 py-1">
                  {a.category}
                </span>
                <span className="rounded-md border border-fg/15 bg-fg/7 px-2 py-1">
                  {a.year} 年 {seasonName(a.season)}季
                </span>
                {!!a.air_weekday && (
                  <span className="flex items-center gap-1.5 rounded-md bg-sakura/10 px-2 py-1 text-sakura">
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-sakura" />
                    连载中
                  </span>
                )}
                {a.nsfw && (
                  <span className="rounded bg-red-500/90 px-2 py-1 font-semibold text-white">
                    R18
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-[26px] font-semibold leading-tight md:text-[38px]">
                {title}
              </h1>
              <p className="mt-2 text-[15px] text-fg/65">{a.name}</p>
              {a.aliases?.length > 0 && (
                <p className="mt-2 text-xs text-mut">
                  别名：{a.aliases.join(" / ")}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-x-7 gap-y-4 rounded-xl bg-fg/7 px-5 py-4 md:gap-x-10">
                <div>
                  <div className="text-[11px] text-mut">Bangumi 评分</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[26px] font-semibold tabular-nums text-sakura">
                    <Icon
                      name="Star"
                      size={20}
                      fill="currentColor"
                      strokeWidth={0}
                    />
                    {a.score.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-mut">排名</div>
                  <div className="mt-2 text-xl font-semibold tabular-nums">
                    #{a.rank || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-mut">收藏人数</div>
                  <div className="mt-2 text-xl font-semibold tabular-nums">
                    {formatCount(a.collects)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-mut">放送进度</div>
                  <div className="mt-2 text-xl font-semibold">
                    {current ? `第 ${current} 话` : `全 ${a.eps || "—"} 话`}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    app.toggleFavorite(a.id);
                    app.toast(liked ? "已取消收藏" : "已加入收藏追番");
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition",
                    liked
                      ? "bg-fg/10 hover:bg-fg/15"
                      : "bg-sakura text-white hover:brightness-110",
                  )}
                >
                  <Icon
                    name="Heart"
                    size={16}
                    fill={liked ? "currentColor" : "none"}
                  />
                  {liked ? "已收藏" : "收藏追番"}
                </button>
                <button
                  onClick={() => {
                    app.toggleReminder(a.id);
                    app.toast(
                      reminder ? "已取消更新标记" : "已加入更新提醒列表",
                    );
                  }}
                  className="btn-secondary border-fg/10 bg-fg/7"
                >
                  <Icon
                    name="Bell"
                    size={16}
                    fill={reminder ? "currentColor" : "none"}
                  />
                  {reminder ? "已设提醒" : "更新提醒"}
                </button>
                <button
                  onClick={share}
                  className="icon-btn h-10 w-10 border border-fg/10 bg-fg/7"
                  aria-label="分享作品"
                >
                  <Icon name="Share2" size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="fade-in container-page grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="min-w-0 space-y-9">
          <ExternalSources anime={a} data={external} loading={externalLoading} failed={!!externalError} retry={() => { void retryExternal(); }} />
          <section>
            <SectionTitle icon="BookOpen" title="剧情简介" />
            <div
              className={cn(
                "mt-4 whitespace-pre-line text-[14px] leading-7 text-fg/80",
                !expanded && "line-clamp-3",
              )}
            >
              {a.summary || (externalLoading ? "暂无简介，正在查询其他平台…" : "暂无简介，等待后续数据更新。")}
            </div>
            {a.field_sources?.summary && <p className="mt-2 text-xs text-mut">简介来源：{CATALOG_LABELS[a.field_sources.summary]} · 保留原文</p>}
            {a.summary?.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-sakura"
              >
                {expanded ? "收起简介" : "展开全部"}
                <Icon
                  name="ChevronDown"
                  size={13}
                  className={expanded ? "rotate-180" : ""}
                />
              </button>
            )}
          </section>
          {a.characters?.length > 0 && (
            <section>
              <CharacterGallery key={a.id} anime={a} />
            </section>
          )}
          <section>
            <SectionTitle
              icon="CalendarDays"
              title="章节列表"
              aside={`${a.episodes?.length || 0} 话${a.episodes_partial ? "（部分收录）" : ""}`}
            />
            {episodes?.length ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {episodes.map((ep) => {
                    const aired = ep.airdate
                      ? ep.airdate <= beijingDate()
                      : ep.sort <= current;
                    return (
                      <div
                        key={ep.id}
                        title={`${ep.name_cn || ep.name}\n${ep.airdate || "播出日期待定"}`}
                        className={cn(
                          "rounded-lg border px-3 py-2.5",
                          aired
                            ? "border-sakura/20 bg-sakura/5"
                            : "border-line bg-card",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 text-[13px] font-semibold">
                          <span>第 {ep.sort} 话</span>
                          {aired && (
                            <Icon
                              name="Check"
                              size={12}
                              className="text-sakura"
                            />
                          )}
                        </div>
                        <p className="mt-1 truncate text-[10px] text-mut">
                          {ep.name_cn || ep.name || "标题待公布"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {a.episodes.length > 24 && (
                  <button
                    className="btn-secondary mt-4 text-xs"
                    onClick={() => setEpisodeAll(!episodeAll)}
                  >
                    {episodeAll
                      ? "收起章节"
                      : `查看全部 ${a.episodes.length} 话`}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-mut">暂无章节数据</p>
            )}
          </section>
          {a.relations?.length > 0 && (
            <section>
              <SectionTitle icon="LibraryBig" title="关联作品" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {a.relations
                  .filter((r) => r.anime)
                  .map((r, i) => (
                    <Link
                      key={i}
                      href={`/anime/${r.anime!.id}`}
                      className="flex gap-3 rounded-xl border border-line bg-card p-3 transition hover:border-sakura/40"
                    >
                      <div className="w-14 shrink-0">
                        <Cover a={r.anime!} titleScale={0.5} />
                      </div>
                      <div className="min-w-0 py-1">
                        <span className="text-[10px] text-sakura">
                          {r.relation_type}
                        </span>
                        <h3 className="mt-1 truncate text-[13px] font-semibold">
                          {animeTitle(r.anime!)}
                        </h3>
                        <Score value={r.anime!.score} className="mt-2" />
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          )}
          {(similar?.items.filter((x) => x.id !== a.id).length || 0) > 0 && (
            <section>
              <SectionTitle icon="Sparkles" title="你可能也会喜欢" />
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {similar?.items
                  .filter((x) => x.id !== a.id)
                  .slice(0, 4)
                  .map((x) => (
                    <AnimeCard key={x.id} a={x} showEp={false} />
                  ))}
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-5 self-start lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="LibraryBig" size={17} className="text-sakura" />
              作品信息
            </h2>
            <dl className="mt-4 space-y-3.5">
              {metadata.map(([label, value]) => (
                <div key={label} className="flex gap-4 text-[13px]">
                  <dt className="w-[68px] shrink-0 text-mut">{label}</dt>
                  <dd className="break-words text-fg/85">{value || "未知"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-[15px] font-semibold">标签</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              {(a.tags?.length
                ? a.tags
                : a.genres.map((name) => ({ name, count: 0 }))
              )
                .slice(0, 25)
                .map((tag, i) => (
                  <Link
                    key={tag.name}
                    href={`/anime?q=${encodeURIComponent(tag.name)}&region=all`}
                    className={cn(
                      "transition hover:opacity-70",
                      i < 3 ? "text-sakura" : "text-mut",
                    )}
                    style={{ fontSize: [15, 14, 13, 12][i % 4] }}
                  >
                    {tag.name}
                    {tag.count > 0 && (
                      <sup className="ml-0.5 text-[9px] opacity-50">
                        {tag.count}
                      </sup>
                    )}
                  </Link>
                ))}
            </div>
          </section>
          {a.persons?.length > 0 && (
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="text-[15px] font-semibold">制作人员</h2>
              <div className="mt-4 space-y-3">
                {a.persons.slice(0, 12).map((p, i) => (
                  <div
                    key={`${p.id}-${i}`}
                    className="flex justify-between gap-4 text-[13px]"
                  >
                    <span className="text-mut">{p.relation || "制作"}</span>
                    <span className="text-right">{p.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
      <Link
        href={`/chat?prompt=${encodeURIComponent(`给我讲讲《${title}》，值得看吗？`)}`}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-sakura to-ind px-5 text-sm font-semibold text-white shadow-[0_8px_26px_-6px_rgba(255,107,157,.6)] transition hover:-translate-y-0.5 md:bottom-4 md:right-8"
      >
        <Icon name="Sparkles" size={18} />
        <span className="hidden sm:inline">问问 AI 关于这部番</span>
        <span className="sm:hidden">问问 AI</span>
      </Link>
    </div>
  );
}
function SectionTitle({
  icon,
  title,
  aside,
}: {
  icon: string;
  title: string;
  aside?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name={icon} size={19} className="text-sakura" />
        {title}
      </h2>
      {aside && <span className="text-xs text-mut">{aside}</span>}
    </div>
  );
}
