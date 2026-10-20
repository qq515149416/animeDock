import raw from "./demo-data.json";
import type { Anime, AnimeDetail, SearchResult, MetaFilters } from "@/types";
import { SEASONS, currentSeason } from "./utils";
const seasonMap: Record<number, Anime["season"]> = {
  1: "winter",
  4: "spring",
  7: "summer",
  10: "autumn",
};
export const DEMO_ANIME: Anime[] = raw.map((a) => ({
  id: a.id,
  name: a.jp,
  name_cn: a.cn,
  aliases: a.alias,
  summary: a.desc,
  category: a.type,
  source: a.source,
  region: a.region,
  genres: a.genres,
  year: a.year,
  season: seasonMap[a.season],
  score: a.score,
  rank: a.rank,
  collects: a.fav,
  eps: a.eps,
  air_weekday: a.weekday || null,
  air_date: new Date(new Date(a.startDate).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10),
  image_url: null,
  studio: a.studio,
  director: a.director,
  nsfw: a.nsfw,
  latest_ep: a.airing ? 3 : a.eps,
  is_new: a.kind === "新番",
  is_sequel: a.kind === "续作",
  air_time: a.time,
  h1: a.h1,
  h2: a.h2,
  tags: a.genres.map((name, i) => ({ name, count: 500 - i * 90 })),
}));
function filter(list: Anime[], p: URLSearchParams, skip = "") {
  return list.filter((a) => {
    const q = p.get("q")?.toLowerCase();
    if (
      q &&
      ![a.name, a.name_cn, ...a.aliases, a.studio, a.director].some((x) =>
        x.toLowerCase().includes(q),
      )
    )
      return false;
    for (const k of [
      "category",
      "source",
      "region",
      "year",
      "season",
    ] as const) {
      const value = p.get(k);
      if (k !== skip && value && value !== "all" && String(a[k]) !== value)
        return false;
    }
    if (
      skip !== "genres" &&
      !p.getAll("genres").every((g) => a.genres.includes(g))
    )
      return false;
    if (p.get("min_score") && a.score < Number(p.get("min_score")))
      return false;
    return true;
  });
}
export function demoSearch(p: URLSearchParams): SearchResult {
  const base = DEMO_ANIME.filter((a) => p.get("nsfw") === "true" || !a.nsfw);
  const result = filter(base, p);
  const sort = p.get("sort");
  result.sort((a, b) =>
    sort === "rank"
      ? (a.rank || 99999) - (b.rank || 99999)
      : sort === "collects"
        ? b.collects - a.collects
        : sort === "latest"
          ? (b.air_date || "").localeCompare(a.air_date || "")
          : sort === "score"
            ? b.score - a.score
            : b.score * 0.6 +
              Math.log10(b.collects) * 0.8 -
              (a.score * 0.6 + Math.log10(a.collects) * 0.8),
  );
  const facets: SearchResult["facets"] = {};
  for (const field of [
    "category",
    "source",
    "genres",
    "region",
    "year",
    "season",
  ] as const) {
    const rows = filter(base, p, field);
    const counts: Record<string, number> = { all: rows.length };
    for (const a of rows) {
      const values = field === "genres" ? a.genres : [a[field]];
      for (const v of values)
        if (v != null) counts[String(v)] = (counts[String(v)] || 0) + 1;
    }
    facets[field] = counts;
  }
  const page = Math.max(1, Number(p.get("page") || 1));
  const size = Number(p.get("page_size") || 18);
  return {
    items: result.slice((page - 1) * size, page * size),
    total: result.length,
    page,
    page_size: size,
    facets,
  };
}
export function demoDetail(id: number, nsfw: boolean): AnimeDetail | undefined {
  const a = DEMO_ANIME.find((a) => a.id === id);
  if (!a || (a.nsfw && !nsfw)) return undefined;
  const original = raw.find((x) => x.id === id)!;
  return {
    ...a,
    episodes: Array.from({ length: a.eps }, (_, i) => ({
      id: id * 1000 + i,
      sort: i + 1,
      type: 0,
      name: `Episode ${i + 1}`,
      name_cn: `第 ${i + 1} 话`,
      airdate: new Date(new Date(a.air_date!).getTime() + i * 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      duration: "24m",
      description: "",
    })),
    characters: original.chars.map((c, i) => ({
      id: id * 100 + i,
      name: c.name,
      cv: c.cv,
      relation: c.role,
    })),
    persons: [
      { id: 1, name: a.director, relation: "导演" },
      { id: 2, name: a.studio, relation: "动画制作" },
    ],
    relations: original.related
      .map((r) => ({
        relation_type: String(r[1]),
        anime: DEMO_ANIME.find((x) => x.id === r[0]),
      }))
      .filter((r) => r.anime && (nsfw || !r.anime.nsfw)),
  };
}
export const DEMO_META: MetaFilters = {
  categories: ["TV", "剧场版", "OVA", "WEB", "其他"],
  sources: ["原创", "漫画改", "小说改", "游戏改", "动画改", "其他"],
  regions: ["日本", "中国", "欧美", "韩国", "其他"],
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
    "战斗",
    "校园",
    "后宫",
    "冒险",
    "推理",
    "历史",
    "偶像",
    "美食",
    "惊悚",
  ],
  years: Array.from(
    { length: currentSeason().year - 1959 },
    (_, i) => currentSeason().year - i,
  ),
  current_season: { year: currentSeason().year, season: currentSeason().value },
  total: DEMO_ANIME.length,
};
