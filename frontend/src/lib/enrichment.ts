import type { AnimeDetail, AnimeEnrichment, CatalogProvider } from "@/types";

export const CATALOG_LABELS: Record<CatalogProvider, string> = {
  myanimelist: "MyAnimeList", kitsu: "Kitsu", anilist: "AniList",
};
export const FIELD_LABELS: Record<string, string> = {
  name: "原名", name_cn: "中文名", aliases: "别名", summary: "简介",
  image_url: "封面", banner_image_url: "背景图", category: "分类", source: "原作类型",
  air_date: "放送日期", year: "年份", season: "季度", air_weekday: "放送日", eps: "话数",
  studio: "制作公司", director: "导演", genres: "类型", characters: "角色与声优", persons: "制作人员",
  episodes: "章节列表",
};
function isMissing(field: string, value: unknown) {
  if (typeof value === "string") return !value.trim() || (["category", "source", "region"].includes(field) && ["其他", "未知"].includes(value));
  return value == null || (Array.isArray(value) && value.length === 0) || (["eps", "year", "air_weekday"].includes(field) && value === 0);
}
export function mergeAnimeEnrichment(base: AnimeDetail, extra?: AnimeEnrichment): AnimeDetail {
  // Old API/SWR responses may already carry an external cover as the main image.
  // Restore the canonical Bangumi path before either the initial or async render.
  if (base.field_sources?.image_url) {
    const { image_url: provider, ...remainingSources } = base.field_sources;
    base = { ...base, image_url: "", fallback_image_url: base.fallback_image_url || base.image_url || "", fallback_image_provider: base.fallback_image_provider || provider, field_sources: remainingSources };
  }
  if (!extra || extra.anime_id !== base.id) return base;
  const result = { ...base } as AnimeDetail & Record<string, unknown>;
  const fieldSources: Record<string, CatalogProvider> = {};
  for (const field of Object.keys(FIELD_LABELS)) {
    if (field === "image_url") continue;
    // Cached main responses can already contain an attributed overlay. Re-evaluate it
    // against the new response so disabled/expired data cannot stick in the UI.
    if (base.field_sources?.[field]) {
      result[field] = ["aliases", "genres", "characters", "persons", "episodes"].includes(field) ? [] : ["eps", "year", "air_weekday", "air_date", "season"].includes(field) ? null : "";
      if (field === "episodes") result.episodes_partial = false;
    }
    const value = (extra.supplement as Record<string, unknown>)[field];
    if (isMissing(field, result[field]) && !isMissing(field, value) && extra.field_sources[field]) {
      result[field] = value;
      fieldSources[field] = extra.field_sources[field];
      if (field === "episodes") result.episodes_partial = !!extra.supplement.episodes_partial;
    }
  }
  return {
    ...result,
    fallback_image_url: extra.supplement.fallback_image_url || "",
    fallback_image_provider: extra.supplement.fallback_image_provider || null,
    field_sources: fieldSources, external_ratings: extra.ratings, external_sources: extra.sources,
  };
}
