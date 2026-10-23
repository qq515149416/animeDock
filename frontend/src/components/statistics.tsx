"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ErrorState, Icon, Segmented } from "./ui";
import { DEMO_MODE, getStatistics, getStatisticsMeta } from "@/lib/api";
import { cn, currentSeason, SEASONS } from "@/lib/utils";
import {
  groupColor,
  parseStatisticsFilters,
  pieStatistics,
  quarterIndex,
  quarterLabel,
  selectedStatisticsGroups,
  statisticsRequestQuery,
  updateStatisticsQuery,
} from "@/lib/statistics";
import type { Season, StatisticsGroup, StatisticsQuarter } from "@/types";

const Chart = dynamic(() => import("./statistics-chart"), {
  ssr: false,
  loading: () => (
    <div className="skel h-[380px] rounded-xl" aria-label="正在加载图表" />
  ),
});
const scoreText = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2);
const countText = (n: number) => n.toLocaleString("zh-CN");
const ratio = (n: number, total: number) =>
  total ? `${((n / total) * 100).toFixed(1)}%` : "—";
const selectClass =
  "h-10 min-w-0 rounded-lg border border-line bg-card px-3 text-sm text-fg transition hover:border-ind";

function QuarterSelect({
  label,
  year,
  season,
  years,
  onChange,
}: {
  label: string;
  year: number;
  season: Season;
  years: number[];
  onChange: (key: "year" | "season", value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs text-mut">{label}</legend>
      <div className="flex gap-2">
        <select
          aria-label={`${label}年份`}
          className={cn(selectClass, "w-[100px] flex-1")}
          value={year}
          onChange={(e) => onChange("year", e.target.value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}季度`}
          className={cn(selectClass, "w-[86px]")}
          value={season}
          onChange={(e) => onChange("season", e.target.value)}
        >
          {SEASONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}季
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-5 mt-1.5 text-xs leading-6 text-mut">{description}</p>
      {children}
    </section>
  );
}
function NoData({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center text-sm text-mut">
      <Icon name="ChartNoAxesCombined" size={32} className="text-mut/60" />
      {children}
    </div>
  );
}
function ScoreCell({
  group,
  metric,
}: {
  group?: StatisticsGroup;
  metric: "average" | "max";
}) {
  return (
    <>
      <span className="font-medium tabular-nums">
        {scoreText(
          group?.[metric === "average" ? "average_score" : "max_score"],
        )}
      </span>
      <span className="mt-1 block whitespace-nowrap text-[11px] text-mut">
        {group?.rated_count ?? 0}/{group?.count ?? 0} 部有评分
      </span>
      <span className="mt-1 block whitespace-nowrap text-[11px] text-mut">
        {countText(group?.vote_count ?? 0)} 评分人次
      </span>
    </>
  );
}

export function Statistics() {
  const params = useSearchParams(),
    serialized = params?.toString() || "";
  const fallback = useMemo(() => {
    const now = currentSeason();
    return { year: now.year, season: now.value };
  }, []);
  const {
    data: meta,
    error: metaError,
    mutate: retryMeta,
  } = useSWR("statistics-meta", getStatisticsMeta);
  const f = parseStatisticsFilters(
    serialized,
    meta?.current_season || fallback,
  );
  const requestQuery = statisticsRequestQuery(f).toString();
  const invalidRange =
    f.view === "trend" &&
    quarterIndex(f.start_year, f.start_season) >
      quarterIndex(f.end_year, f.end_season);
  const { data, error, isLoading, mutate } = useSWR(
    invalidRange ? null : ["statistics", f.view, requestQuery],
    () => getStatistics(f, requestQuery),
  );
  const update = (changes: Record<string, string | string[]>) => {
    const query = updateStatisticsQuery(window.location.search, changes);
    window.history.replaceState(null, "", `/stats?${query}`);
  };
  const maxYear = Math.min(
    2200,
    Math.max(
      fallback.year,
      f.start_year,
      f.end_year,
      f.year,
      ...(meta?.years || []),
    ),
  );
  const minYear = Math.max(
    1800,
    Math.min(
      fallback.year - 4,
      f.start_year,
      f.end_year,
      f.year,
      ...(meta?.years || []),
    ),
  );
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => maxYear - i,
  );
  const quarters = data?.quarters || [];
  const names = quarters[0]?.groups.map((g) => g.name) || [];
  const totals = quarters.reduce(
    (a, q) => ({
      total: a.total + q.total_count,
      rated: a.rated + q.rated_count,
      classified: a.classified + q.classified_count,
      source: a.source + q.known_source_count,
    }),
    { total: 0, rated: 0, classified: 0, source: 0 },
  );
  const groupTotals = new Map(
    names.map((name) => [
      name,
      quarters.reduce(
        (n, q) => n + (q.groups.find((g) => g.name === name)?.count || 0),
        0,
      ),
    ]),
  );
  const commonNames = names
    .filter((name) => name !== "未分类" && (groupTotals.get(name) || 0) > 0)
    .sort((a, b) => (groupTotals.get(b) || 0) - (groupTotals.get(a) || 0))
    .slice(0, 5);
  const selected = selectedStatisticsGroups(
    names,
    f.groups ??
      (f.dimension === "source"
        ? names
        : commonNames.length
          ? commonNames
          : names.filter((name) => name === "未分类")),
  );
  const metricLabel = f.metric === "average" ? "综合评分" : "最高评分";
  const dimensionLabel = f.dimension === "genre" ? "类型" : "来源";
  const quarter = quarters[0];
  const activeGroups = quarter?.groups.filter((g) => g.count > 0) || [];
  const period =
    f.view === "trend"
      ? `${quarterLabel(f.start_year, f.start_season)} — ${quarterLabel(f.end_year, f.end_season)}`
      : quarterLabel(f.year, f.season);
  return (
    <div className="pb-10">
      <div className="lib-grad border-b border-line">
        <div className="container-page py-8 sm:py-10">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-ind">
            <Icon name="ChartNoAxesCombined" size={16} />
            ANIME INSIGHTS
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            从季度里，看见动画的变化
          </h1>
          <p className="mt-3 text-sm leading-7 text-mut">
            比较不同类型与改编来源的评分，探索每个季度的作品分布。
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-mut">
            {[
              "日本动画",
              "包含 NSFW 汇总",
              "Bangumi 评分",
              "按首播季度归类",
            ].map((text) => (
              <span
                key={text}
                className="rounded-md border border-line bg-card/60 px-2.5 py-1.5"
              >
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="container-page space-y-5 pt-6">
        {DEMO_MODE && (
          <p className="rounded-xl border border-ind/20 bg-ind/5 px-4 py-3 text-sm text-ind">
            设计预览 · 当前图表使用虚构示例数据。
          </p>
        )}
        <section
          aria-label="统计筛选"
          className="rounded-2xl border border-line bg-card p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <Segmented
              value={f.view}
              onChange={(view) => update({ view })}
              options={[
                { value: "trend", label: "季度趋势" },
                { value: "season", label: "季度对比" },
              ]}
            />
            <p className="text-xs text-mut">{period}</p>
          </div>
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            {f.view === "trend" ? (
              <>
                <QuarterSelect
                  label="开始"
                  years={years}
                  year={f.start_year}
                  season={f.start_season}
                  onChange={(key, value) => update({ [`start_${key}`]: value })}
                />
                <QuarterSelect
                  label="结束"
                  years={years}
                  year={f.end_year}
                  season={f.end_season}
                  onChange={(key, value) => update({ [`end_${key}`]: value })}
                />
              </>
            ) : (
              <QuarterSelect
                label="统计季度"
                years={years}
                year={f.year}
                season={f.season}
                onChange={(key, value) => update({ [key]: value })}
              />
            )}
            <div>
              <p className="mb-2 text-xs text-mut">分组维度</p>
              <Segmented
                value={f.dimension}
                onChange={(dimension) => update({ dimension })}
                options={[
                  { value: "genre", label: "类型" },
                  { value: "source", label: "来源" },
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-mut">评分指标</p>
              <Segmented
                value={f.metric}
                onChange={(metric) => update({ metric })}
                options={[
                  { value: "average", label: "综合评分" },
                  { value: "max", label: "最高评分" },
                ]}
              />
            </div>
          </div>
          {invalidRange && (
            <p role="alert" className="mt-4 text-sm text-sakura">
              开始季度不能晚于结束季度，请调整起止时间。
            </p>
          )}
        </section>
        {metaError && (
          <ErrorState
            message="可用年份加载失败，可以重试。"
            retry={() => void retryMeta()}
          />
        )}
        {error && (
          <ErrorState
            message={error.message || "统计加载失败，请稍后重试"}
            retry={() => void mutate()}
          />
        )}
        {isLoading && !error && (
          <div role="status" aria-label="正在加载统计" className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="skel h-24 rounded-2xl" />
              ))}
            </div>
            <div className="skel h-[440px] rounded-2xl" />
          </div>
        )}
        {data && !invalidRange && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [
                  "收录作品",
                  countText(totals.total),
                  "当前时间范围 · 去重条目",
                ],
                [
                  "有效评分",
                  countText(totals.rated),
                  `${ratio(totals.rated, totals.total)} 的作品已有评分`,
                ],
                [
                  "类型覆盖",
                  ratio(totals.classified, totals.total),
                  `${countText(totals.classified)} 部具有已识别类型`,
                ],
                [
                  "来源覆盖",
                  ratio(totals.source, totals.total),
                  `${countText(totals.source)} 部具有明确改编来源`,
                ],
              ].map(([label, value, hint]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-line bg-card p-4 sm:p-5"
                >
                  <p className="text-xs text-mut">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                    {value}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-mut">{hint}</p>
                </div>
              ))}
            </div>
            {f.view === "trend" ? (
              <>
                <ChartCard
                  title={`${dimensionLabel}评分 · 季度趋势`}
                  description={`${metricLabel} · ${period}，共 ${quarters.length} 个季度。无有效评分的季度保留空缺。`}
                >
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs text-mut">
                      展示 {selected.length}/{names.length} 组
                    </span>
                    <button
                      className="rounded px-2 py-1.5 text-xs text-ind hover:bg-elev"
                      onClick={() => update({ group: names })}
                    >
                      全选
                    </button>
                    <button
                      className="rounded px-2 py-1.5 text-xs text-mut hover:bg-elev"
                      onClick={() => update({ group: [] })}
                    >
                      清空
                    </button>
                    {f.dimension === "genre" && (
                      <button
                        className="rounded px-2 py-1.5 text-xs text-mut hover:bg-elev"
                        onClick={() => update({ group: commonNames })}
                      >
                        常见 5 类
                      </button>
                    )}
                  </div>
                  <div
                    className="mb-5 flex max-h-36 flex-wrap gap-2 overflow-y-auto"
                    aria-label="选择折线分组"
                  >
                    {names.map((name) => (
                      <button
                        key={name}
                        aria-pressed={selected.includes(name)}
                        onClick={() =>
                          update({
                            group: selected.includes(name)
                              ? selected.filter((n) => n !== name)
                              : [...selected, name],
                          })
                        }
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                          selected.includes(name)
                            ? "border-ind/40 bg-ind/5 text-fg"
                            : "border-line text-mut hover:bg-elev",
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background: groupColor(name),
                            opacity: selected.includes(name) ? 1 : 0.35,
                          }}
                        />
                        {name}
                      </button>
                    ))}
                  </div>
                  {!totals.total ? (
                    <NoData>这个时间范围暂无作品，请调整起止季度。</NoData>
                  ) : !selected.length ? (
                    <NoData>选择上方的类型或来源，即可查看评分趋势。</NoData>
                  ) : (
                    <Chart
                      kind="line"
                      dimension={f.dimension}
                      quarters={quarters}
                      metric={f.metric}
                      names={selected}
                    />
                  )}
                </ChartCard>
                {!!selected.length && (
                  <TrendTable
                    quarters={quarters}
                    names={selected}
                    metric={f.metric}
                  />
                )}
              </>
            ) : (
              <>
                <div className="grid items-start gap-5 xl:grid-cols-2">
                  <ChartCard
                    title={`${dimensionLabel}评分对比`}
                    description={`${period} · ${f.metric === "average" ? "综合评分，每部作品权重相同" : "各组作品当前评分的最高值"}。`}
                  >
                    {!quarter.rated_count ? (
                      <NoData>本季度暂无有效评分，数量分布仍可查看。</NoData>
                    ) : (
                      <Chart
                        kind="bar"
                        dimension={f.dimension}
                        quarters={quarters}
                        metric={f.metric}
                        names={activeGroups.map((g) => g.name)}
                      />
                    )}
                  </ChartCard>
                  <ChartCard
                    title={
                      f.dimension === "genre" ? "类型标签占比" : "来源数量占比"
                    }
                    description={
                      f.dimension === "genre"
                        ? `多类型作品在各类型各计一次；分母为 ${countText(quarter.distribution_total)} 次标签计数，包含未分类。`
                        : `每部作品只计入一个来源；分母为 ${countText(quarter.total_count)} 部作品，包含其他。`
                    }
                  >
                    {!quarter.total_count ? (
                      <NoData>本季度暂无作品，请选择其他季度。</NoData>
                    ) : (
                      <Chart
                        kind="pie"
                        dimension={f.dimension}
                        quarters={quarters}
                        metric={f.metric}
                        names={activeGroups.map((g) => g.name)}
                      />
                    )}
                  </ChartCard>
                </div>
                <SeasonTable
                  quarter={quarter}
                  dimensionLabel={dimensionLabel}
                />
              </>
            )}
            <div className="flex flex-wrap justify-between gap-2 px-1 text-[11px] leading-6 text-mut">
              <p>
                仅统计已记录首播季度的日本作品
                {meta
                  ? `；另有 ${countText(meta.missing_quarter_count)} 部日本作品缺少季度，未纳入统计`
                  : ""}
                。
              </p>
              <p>
                统计于{" "}
                {new Date(data.generated_at).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  hour12: false,
                })}
              </p>
            </div>
          </>
        )}
        <details className="rounded-2xl border border-line bg-card px-5 py-4 text-xs leading-7 text-mut">
          <summary className="cursor-pointer font-medium text-fg">
            统计口径说明
          </summary>
          <div className="mt-3 space-y-1">
            <p>
              综合评分是同组有效作品评分的算术平均值；最高评分是同组作品当前评分的最大值。未评分作品计入数量，不作为零分计入评分。评分人次为组内各作品投票数合计，不代表去重人数。
            </p>
            <p>
              按首播季度归类：冬季 1–3 月、春季 4–6 月、夏季 7–9 月、秋季 10–12
              月。跨季度作品只计入首播季度，续作按独立条目计数。
            </p>
            <p>
              图表比较不同首播季度作品的当前评分，不代表历史上当时的评分。尚未播出或评分样本较少的季度，结果可能继续变化。
            </p>
            <p>
              类型可多选，类型饼图按标签计次；来源为单值，按作品计数。“未分类”和“其他”保留在数据中。类型、来源与地区沿用站内归类，资料缺失可能影响覆盖率。
            </p>
            <p>
              固定统计日本作品并包含
              NSFW，页面只展示汇总数据，不展示具体作品；全站 NSFW
              开关不影响这些统计。
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

function TrendTable({
  quarters,
  names,
  metric,
}: {
  quarters: StatisticsQuarter[];
  names: string[];
  metric: "average" | "max";
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold">季度评分明细</h2>
        <p className="mt-1 text-xs text-mut">
          单元格下方为“有效评分作品数 / 作品数”。横向滚动查看全部分组。
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">各季度所选分组评分与样本数量</caption>
          <thead className="sticky top-0 z-10 bg-elev">
            <tr>
              <th scope="col" className="whitespace-nowrap px-5 py-3">
                季度
              </th>
              {names.map((name) => (
                <th
                  key={name}
                  scope="col"
                  className="whitespace-nowrap px-5 py-3"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr
                key={`${q.year}-${q.season}`}
                className="border-t border-line hover:bg-elev/40"
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-5 py-3 font-medium"
                >
                  {quarterLabel(q.year, q.season)}
                </th>
                {names.map((name) => (
                  <td key={name} className="px-5 py-3">
                    <ScoreCell
                      group={q.groups.find((g) => g.name === name)}
                      metric={metric}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function SeasonTable({
  quarter,
  dimensionLabel,
}: {
  quarter: StatisticsQuarter;
  dimensionLabel: string;
}) {
  const percentages = new Map(
    pieStatistics(quarter).map((g) => [g.name, g.percent]),
  );
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card">
      <h2 className="px-5 py-4 text-sm font-semibold">季度分组明细</h2>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-xs">
          <caption className="sr-only">
            {quarterLabel(quarter.year, quarter.season)}各组评分与数量分布
          </caption>
          <thead className="bg-elev">
            <tr>
              {[
                dimensionLabel,
                "作品数",
                "有效评分",
                "评分人次",
                "综合评分",
                "最高评分",
                "数量占比",
              ].map((name) => (
                <th key={name} scope="col" className="px-5 py-3">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quarter.groups.map((g) => (
              <tr
                key={g.name}
                className="border-t border-line hover:bg-elev/40"
              >
                <th scope="row" className="px-5 py-3 font-medium">
                  {g.name}
                </th>
                <td className="px-5 py-3 tabular-nums">{countText(g.count)}</td>
                <td className="px-5 py-3 tabular-nums">
                  {countText(g.rated_count)}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {countText(g.vote_count)}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {scoreText(g.average_score)}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {scoreText(g.max_score)}
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {(percentages.get(g.name) || 0).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
