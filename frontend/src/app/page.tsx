"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useApp } from "@/components/providers";
import {
  Icon,
  Cover,
  SlideTabs,
  Segmented,
  AnimeCard,
  GridSkeleton,
  Score,
  ErrorState,
} from "@/components/ui";
import { getCalendar, DEMO_MODE } from "@/lib/api";
import {
  cn,
  beijingNow,
  currentSeason,
  WEEK,
  WEEK_FULL,
  timeKey,
  animeTitle,
} from "@/lib/utils";
import type { Anime } from "@/types";
export default function DailyPage() {
  const { nsfw, ready, prefs, setPref } = useApp();
  const [now, setNow] = useState(beijingNow),
    [day, setDay] = useState(() => beijingNow().getDay() || 7);
  const today = now.getDay() || 7,
    season = currentSeason(now);
  const { data, error, isLoading, mutate } = useSWR(
    ready ? ["calendar", nsfw] : null,
    () => getCalendar(nsfw),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(beijingNow()), 60000);
    return () => clearInterval(timer);
  }, []);
  const airing = useMemo(() => data?.flatMap((x) => x.items) || [], [data]);
  const counts = Object.fromEntries(
    data?.map((x) => [x.weekday, x.items.length]) || [],
  );
  const items = [...(data?.find((x) => x.weekday === day)?.items || [])].sort(
    (a, b) => timeKey(a.air_time || "") - timeKey(b.air_time || ""),
  );
  const featured = airing
    .filter((a) => a.air_weekday === today)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const dateOf = (w: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + w - today);
    return d;
  };
  const loading = !ready || isLoading;
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-grad absolute inset-0" />
        <div className="hero-dots absolute inset-0 opacity-60" />
        <div className="container-page relative grid items-end gap-8 pb-8 pt-10 md:grid-cols-[1fr_auto] md:pb-10 md:pt-14">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sakura/30 bg-sakura/10 px-3 py-1 text-xs font-semibold text-sakura">
              <Icon name={season.icon} size={13} />
              {season.text}
            </span>
            <h1 className="mt-4 text-[30px] font-semibold leading-tight tracking-tight md:text-[44px]">
              {now.getMonth() + 1} 月 {now.getDate()} 日{" "}
              <span className="font-normal text-mut">·</span>{" "}
              {WEEK_FULL[today - 1]}
            </h1>
            <p className="mt-2 text-[15px] text-mut md:text-base">
              今日更新{" "}
              <span className="mx-0.5 text-2xl font-semibold tabular-nums text-sakura">
                {loading ? "—" : counts[today] || 0}
              </span>{" "}
              部 · 本季共 {loading ? "—" : airing.length} 部新番/续作在播
            </p>
          </div>
          <div className="hidden items-end gap-3 lg:flex">
            {featured.map((a, i) => (
              <Link
                href={`/anime/${a.id}`}
                key={a.id}
                aria-label={animeTitle(a)}
                className="w-[104px] rounded-xl shadow-cardh"
                style={{
                  transform: `translateY(${[-10, 0, 10][i]}px) rotate(${[-4, 0, 4][i]}deg)`,
                }}
              >
                <Cover a={a} titleScale={0.75} allowReveal={false} />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <div className="container-page">
        <div className="sticky top-16 z-30 -mx-4 mb-6 flex items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="no-scrollbar -mb-px flex-1 overflow-x-auto">
            <SlideTabs
              value={day}
              onChange={setDay}
              itemClass="h-[60px] min-w-[64px] px-3 md:min-w-[84px]"
              items={[1, 2, 3, 4, 5, 6, 7].map((w) => ({
                key: w,
                label: (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="flex items-center gap-1 text-[14px] font-semibold">
                      {WEEK[w - 1]}
                      {w === today && (
                        <span className="rounded bg-sakura px-1 py-px text-[10px] font-semibold leading-none text-white">
                          今天
                        </span>
                      )}
                    </span>
                    <span className="mt-1 text-[11px] font-normal tabular-nums text-mut">
                      {dateOf(w).getMonth() + 1}/{dateOf(w).getDate()} ·{" "}
                      {counts[w] || 0} 部
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
          <Segmented
            value={prefs.dailyView}
            onChange={(v) => setPref("dailyView", v)}
            options={[
              { value: "grid", icon: "LayoutGrid", label: "网格" },
              { value: "timeline", icon: "Clock3", label: "时间轴" },
            ]}
          />
        </div>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="shrink-0 text-lg font-semibold">
            {WEEK_FULL[day - 1]}放送{" "}
            <span className="ml-1 text-sm font-normal text-mut">
              {items.length} 部
            </span>
          </h2>
          <span className="text-right text-[11px] text-mut sm:text-xs">
            时间为北京时间
            <span className="hidden sm:inline">
              {" "}
              · 深夜档按 24 时制计入当天
            </span>
          </span>
        </div>
        {error ? (
          <ErrorState
            message="放送表暂时无法加载，请确认后端和数据同步服务已就绪"
            retry={() => mutate()}
          />
        ) : loading ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-20 text-center text-sm text-mut">
            <Icon
              name="CalendarDays"
              size={28}
              className="mx-auto mb-3 opacity-50"
            />
            这一天暂时没有番剧更新
          </div>
        ) : prefs.dailyView === "grid" ? (
          <div className="anime-grid">
            {items.map((a) => (
              <AnimeCard
                key={a.id}
                a={a}
                extra={
                  <span className="text-[11px] tabular-nums text-mut">
                    {a.air_time || ""}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <Timeline items={items} isToday={today === day} now={now} />
        )}
      </div>
    </div>
  );
}
function Timeline({
  items,
  isToday,
  now,
}: {
  items: Anime[];
  isToday: boolean;
  now: Date;
}) {
  const nowKey =
    (now.getHours() < 5 ? now.getHours() + 24 : now.getHours()) * 60 +
    now.getMinutes();
  const groups = items.reduce<{ time: string; items: Anime[] }[]>((all, a) => {
    const time = a.air_time || "时间待定";
    const group = all.find((x) => x.time === time);
    if (group) group.items.push(a);
    else all.push({ time, items: [a] });
    return all;
  }, []);
  const next = isToday
    ? groups.findIndex((x) => x.time !== "时间待定" && timeKey(x.time) > nowKey)
    : -1;
  return (
    <div className="relative">
      <div className="absolute bottom-2 left-[68px] top-2 w-px bg-line md:left-[92px]" />
      {groups.map((g, i) => {
        const aired =
          isToday && g.time !== "时间待定" && timeKey(g.time) <= nowKey;
        return (
          <div
            key={g.time}
            className="relative flex gap-5 pb-7 fade-in md:gap-8"
          >
            <div className="w-[52px] shrink-0 pt-1 text-right md:w-[68px]">
              <div
                className={cn(
                  "font-semibold tabular-nums",
                  g.time === "时间待定" ? "text-xs" : "text-lg md:text-xl",
                  i === next ? "text-sakura" : aired ? "text-mut" : "",
                )}
              >
                {g.time}
              </div>
              {g.time.includes(":") && Number(g.time.split(":")[0]) < 5 && (
                <div className="text-[10px] text-mut">
                  ({Number(g.time.split(":")[0]) + 24}:{g.time.split(":")[1]})
                </div>
              )}
            </div>
            <span
              className={cn(
                "absolute left-[63px] top-2.5 h-[11px] w-[11px] rounded-full border-2 md:left-[87px]",
                i === next
                  ? "pulse-dot border-sakura bg-sakura"
                  : aired
                    ? "border-mut/50 bg-card"
                    : "border-ind bg-card",
              )}
            />
            <div className="min-w-0 flex-1 space-y-3">
              {i === next && (
                <div className="text-xs font-semibold text-sakura">
                  即将播出
                </div>
              )}
              {g.items.map((a) => (
                <Link
                  href={`/anime/${a.id}`}
                  key={a.id}
                  className={cn(
                    "group flex gap-3 rounded-xl border border-line bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-sakura/40 hover:shadow-cardh sm:gap-4",
                    aired && "opacity-75",
                  )}
                >
                  <div className="w-[60px] shrink-0 sm:w-[72px] md:w-20">
                    <Cover a={a} titleScale={0.55} className="rounded-lg" />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-center gap-2">
                      {(a.is_new || a.is_sequel) && (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-px text-[10px] font-semibold text-white",
                            a.is_sequel ? "bg-ind" : "bg-sakura",
                          )}
                        >
                          {a.is_sequel ? "续作" : "新番"}
                        </span>
                      )}
                      <h3 className="truncate text-[15px] font-semibold transition-colors group-hover:text-sakura">
                        {animeTitle(a)}
                      </h3>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-mut">{a.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mut">
                      <Score value={a.score} className="text-fg" />
                      {!!a.latest_ep && (
                        <span>
                          第 {a.latest_ep} 话{aired ? " · 已更新" : ""}
                        </span>
                      )}
                      <span className="hidden sm:inline">{a.studio}</span>
                    </div>
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
                  </div>
                  <Icon
                    name="ChevronRight"
                    size={18}
                    className="self-center text-mut"
                  />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
