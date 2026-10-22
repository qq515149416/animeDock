import test from "node:test";
import assert from "node:assert/strict";
import { mergeAnimeEnrichment } from "../src/lib/enrichment";
import { getAnimeCoverUrl } from "../src/lib/images";
import type { AnimeDetail, AnimeEnrichment } from "../src/types";

const base = {
  id: 100, name: "原名", name_cn: "中文名", summary: "", image_url: "",
  studio: "", director: "", aliases: [], genres: [], characters: [], persons: [],
  episodes: [], relations: [], score: 7.4, rank: 100, eps: 0, nsfw: false,
} as unknown as AnimeDetail;
const extra = {
  anime_id: 100, pending: false, sources: [], ratings: [], providers: [],
  supplement: { summary: "English synopsis", studio: "External Studio", eps: 12, score: 9.9 },
  field_sources: { summary: "myanimelist", studio: "myanimelist", eps: "myanimelist" },
} as AnimeEnrichment;

test("missing fields are filled without changing the Bangumi score or mutating input", () => {
  const result = mergeAnimeEnrichment(base, extra);
  assert.equal(result.summary, "English synopsis");
  assert.equal(result.eps, 12);
  assert.equal(result.score, 7.4);
  assert.equal(result.rank, 100);
  assert.equal(base.summary, "");
  assert.equal(result.field_sources?.summary, "myanimelist");
});

test("existing canonical values win when supplemental data arrives later", () => {
  const result = mergeAnimeEnrichment({ ...base, summary: "中文简介", studio: "Bangumi Studio", eps: 24 }, extra);
  assert.equal(result.summary, "中文简介");
  assert.equal(result.studio, "Bangumi Studio");
  assert.equal(result.eps, 24);
  assert.equal(result.field_sources?.summary, undefined);
});

test("expired or disabled response removes previously attributed fallback", () => {
  const old = { ...base, summary: "Old external text", field_sources: { summary: "myanimelist" } } as AnimeDetail;
  const result = mergeAnimeEnrichment(old, { ...extra, supplement: {}, field_sources: {} });
  assert.equal(result.summary, "");
  assert.equal(result.field_sources?.summary, undefined);
});

test("enrichment from a previous route cannot populate a different work", () => {
  assert.equal(mergeAnimeEnrichment({ ...base, id: 101 }, extra).summary, "");
});

test("Bangumi data stays available while supplemental requests are pending", () => {
  assert.equal(mergeAnimeEnrichment(base, undefined), base);
});

test("enrichment never replaces the cover already displayed by the library", () => {
  const coverExtra = {
    ...extra,
    supplement: { ...extra.supplement, image_url: "https://cdn.myanimelist.net/other.jpg", fallback_image_url: "https://cdn.myanimelist.net/other.jpg", fallback_image_provider: "myanimelist" },
    field_sources: { ...extra.field_sources, image_url: "myanimelist" },
  } as AnimeEnrichment;
  const detail = mergeAnimeEnrichment(base, coverExtra);
  assert.equal(getAnimeCoverUrl(detail, false), getAnimeCoverUrl(base, false));
  assert.equal(detail.field_sources?.image_url, undefined);
  assert.equal(detail.fallback_image_url, "https://cdn.myanimelist.net/other.jpg");
});

test("previously attributed external covers are restored to the original cover while loading", () => {
  const old = { ...base, image_url: "https://cdn.myanimelist.net/other.jpg", field_sources: { image_url: "myanimelist" } } as AnimeDetail;
  const detail = mergeAnimeEnrichment(old, undefined);
  assert.equal(getAnimeCoverUrl(detail, false), "https://api.bgm.tv/v0/subjects/100/image?type=large");
  assert.equal(detail.field_sources?.image_url, undefined);
});
