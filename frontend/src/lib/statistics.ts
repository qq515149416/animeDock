import type {
  Season,
  StatisticsDimension,
  StatisticsMetric,
  StatisticsQuarter,
  StatisticsResponse,
  StatisticsGroup,
} from "../types";

export const STAT_SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];
export const STAT_SOURCES = [
  "原创",
  "漫画改",
  "小说改",
  "游戏改",
  "动画改",
  "其他",
];
export interface StatisticsFilters {
  view: "trend" | "season";
  dimension: StatisticsDimension;
  metric: StatisticsMetric;
  start_year: number;
  start_season: Season;
  end_year: number;
  end_season: Season;
  year: number;
  season: Season;
  groups: string[] | null;
}
export function quarterIndex(year: number, season: Season) {
  return year * 4 + STAT_SEASONS.indexOf(season);
}
export function quarterLabel(year: number, season: Season) {
  return `${year} ${["冬", "春", "夏", "秋"][STAT_SEASONS.indexOf(season)]}季`;
}
export function parseStatisticsFilters(
  input: string,
  current: { year: number; season: Season },
): StatisticsFilters {
  const p = new URLSearchParams(input);
  const year = (key: string, fallback: number) => {
    const value = p.get(key) || "";
    return /^\d{4}$/.test(value) &&
      Number(value) >= 1800 &&
      Number(value) <= 2200
      ? Number(value)
      : fallback;
  };
  const season = (key: string, fallback: Season) =>
    STAT_SEASONS.includes(p.get(key) as Season)
      ? (p.get(key) as Season)
      : fallback;
  return {
    view: p.get("view") === "season" ? "season" : "trend",
    dimension: p.get("dimension") === "source" ? "source" : "genre",
    metric: p.get("metric") === "max" ? "max" : "average",
    start_year: year("start_year", current.year - 4),
    start_season: season("start_season", "winter"),
    end_year: year("end_year", current.year),
    end_season: season("end_season", current.season),
    year: year("year", current.year),
    season: season("season", current.season),
    groups: p.has("group")
      ? [...new Set(p.getAll("group").filter((g) => g && g !== "__none__"))]
      : null,
  };
}
export function updateStatisticsQuery(
  current: string,
  changes: Record<string, string | string[]>,
): URLSearchParams {
  const allowed = new Set([
    "view",
    "dimension",
    "metric",
    "start_year",
    "start_season",
    "end_year",
    "end_season",
    "year",
    "season",
    "group",
  ]);
  const p = new URLSearchParams(current);
  for (const key of [...p.keys()]) if (!allowed.has(key)) p.delete(key);
  if (changes.dimension && changes.dimension !== p.get("dimension"))
    p.delete("group");
  for (const [key, value] of Object.entries(changes)) {
    if (!allowed.has(key)) continue;
    p.delete(key);
    if (Array.isArray(value)) {
      (value.length ? value : ["__none__"]).forEach((v) => p.append(key, v));
    } else if (value) p.set(key, value);
  }
  return p;
}
export function statisticsRequestQuery(f: StatisticsFilters) {
  const p = new URLSearchParams({ dimension: f.dimension });
  const keys =
    f.view === "trend"
      ? (["start_year", "start_season", "end_year", "end_season"] as const)
      : (["year", "season"] as const);
  keys.forEach((key) => p.set(key, String(f[key])));
  return p;
}
export function selectedStatisticsGroups(
  names: string[],
  selected: string[] | null,
) {
  return selected === null
    ? names
    : names.filter((name) => selected.includes(name));
}
export function pieStatistics(quarter: StatisticsQuarter) {
  return quarter.groups
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((g) => ({
      name: g.name,
      value: g.count,
      percent: quarter.distribution_total
        ? (g.count / quarter.distribution_total) * 100
        : 0,
    }));
}
export function trendSeries(
  quarters: StatisticsQuarter[],
  names: string[],
  metric: StatisticsMetric,
) {
  const key = metric === "average" ? "average_score" : "max_score";
  return names.map((name) => ({
    name,
    data: quarters.map(
      (q) => q.groups.find((g) => g.name === name)?.[key] ?? null,
    ),
  }));
}
export function groupColor(name: string) {
  if (name === "未分类" || name === "其他") return "#8993a6";
  const names = [
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
    "战斗",
    "校园",
    "后宫",
    "冒险",
    "推理",
    "历史",
    "偶像",
    "美食",
    "惊悚",
  ];
  const palette = [
    "#e05a88",
    "#cc8b28",
    "#8070e2",
    "#438fca",
    "#bd6fcb",
    "#47a69a",
    "#719940",
    "#d96556",
    "#727abd",
    "#30a6c1",
    "#c17c42",
    "#b56c9d",
    "#6e8d9a",
    "#b95650",
    "#538fab",
    "#ad739a",
    "#299e7e",
    "#9277bb",
    "#9b8752",
    "#d671a7",
    "#aa8331",
    "#8b7479",
  ];
  const known = names.indexOf(name),
    source = STAT_SOURCES.indexOf(name);
  if (known >= 0) return palette[known];
  if (source >= 0) return palette[source];
  const hash = [...name].reduce(
    (n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0,
    0,
  );
  return palette[hash % palette.length];
}

type DemoRecord = {
  region: string;
  year: number | null;
  season: Season | null;
  score: number;
  genres: string[];
  source: string;
  nsfw: boolean;
};
/** Explicit design-preview data only; use the same counting rules as the real SQL. */
export function demoStatistics(
  records: DemoRecord[],
  f: StatisticsFilters,
): StatisticsResponse {
  const start =
    f.view === "trend"
      ? quarterIndex(f.start_year, f.start_season)
      : quarterIndex(f.year, f.season);
  const end =
    f.view === "trend" ? quarterIndex(f.end_year, f.end_season) : start;
  const scoped = records
    .filter(
      (a) =>
        a.region === "日本" &&
        a.year !== null &&
        a.season !== null &&
        quarterIndex(a.year, a.season) >= start &&
        quarterIndex(a.year, a.season) <= end,
    )
    .map((a) => ({
      ...a,
      genres: [...new Set(a.genres.map((g) => g.trim()).filter(Boolean))],
      source: a.source.trim() || "其他",
    }));
  const names =
    f.dimension === "source"
      ? STAT_SOURCES
      : [...new Set(scoped.flatMap((a) => a.genres))].sort().concat("未分类");
  const summarize = (list: DemoRecord[]) => {
    const scores = list.map((a) => a.score).filter((n) => n > 0 && n <= 10);
    return {
      count: list.length,
      rated_count: scores.length,
      average_score: scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null,
      max_score: scores.length ? Math.max(...scores) : null,
      vote_count: 0,
    };
  };
  const quarters: StatisticsQuarter[] = [];
  for (let index = start; index <= end; index++) {
    const year = Math.floor(index / 4),
      season = STAT_SEASONS[index % 4];
    const list = scoped.filter((a) => a.year === year && a.season === season);
    const total = summarize(list);
    const groups: StatisticsGroup[] = names.map((name) => ({
      name,
      ...summarize(
        list.filter((a) =>
          f.dimension === "source"
            ? a.source === name
            : name === "未分类"
              ? !a.genres.length
              : a.genres.includes(name),
        ),
      ),
    }));
    quarters.push({
      year,
      season,
      total_count: total.count,
      rated_count: total.rated_count,
      average_score: total.average_score,
      max_score: total.max_score,
      vote_count: 0,
      classified_count: list.filter((a) => a.genres.length).length,
      known_source_count: list.filter((a) => a.source !== "其他").length,
      distribution_total: groups.reduce((n, g) => n + g.count, 0),
      groups,
    });
  }
  return {
    dimension: f.dimension,
    region: "日本",
    includes_nsfw: true,
    distribution_basis: f.dimension === "genre" ? "genre_occurrences" : "works",
    generated_at: new Date().toISOString(),
    quarters,
  };
}
