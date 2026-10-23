import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStatisticsFilters,
  updateStatisticsQuery,
  statisticsRequestQuery,
  quarterLabel,
  selectedStatisticsGroups,
  pieStatistics,
  demoStatistics,
  trendSeries,
} from "../src/lib/statistics";

const now = { year: 2026, season: "autumn" as const };

test("cross-year filters preserve independent start/end quarters and exclude global scope parameters", () => {
  const f = parseStatisticsFilters(
    "start_year=2025&start_season=winter&end_year=2026&end_season=summer&nsfw=false&region=中国",
    now,
  );
  assert.deepEqual(
    [f.start_year, f.start_season, f.end_year, f.end_season],
    [2025, "winter", 2026, "summer"],
  );
  assert.equal(
    statisticsRequestQuery(f).toString(),
    "dimension=genre&start_year=2025&start_season=winter&end_year=2026&end_season=summer",
  );
  assert.equal(quarterLabel(2025, "winter"), "2025 冬季");
});

test("rapid filter edits preserve other choices and clear type selection when changing dimension", () => {
  const first = updateStatisticsQuery("view=trend&group=奇幻&group=恋爱", {
    start_year: "2025",
  });
  const second = updateStatisticsQuery(first.toString(), {
    end_season: "summer",
  });
  assert.equal(second.get("start_year"), "2025");
  assert.equal(second.get("end_season"), "summer");
  assert.deepEqual(second.getAll("group"), ["奇幻", "恋爱"]);
  assert.equal(
    updateStatisticsQuery(second.toString(), { dimension: "source" }).has(
      "group",
    ),
    false,
  );
});

test("malformed values normalize safely and single-quarter requests do not contain trend-only parameters", () => {
  const f = parseStatisticsFilters(
    "view=season&year=abc&season=bad&metric=bad&dimension=bad&start_year=0",
    now,
  );
  assert.equal(f.year, 2026);
  assert.equal(f.season, "autumn");
  assert.equal(f.metric, "average");
  assert.equal(f.start_year, 2022);
  assert.equal(
    statisticsRequestQuery(f).toString(),
    "dimension=genre&year=2026&season=autumn",
  );
});

test("demo aggregate matches Japan/all-NSFW rules, deduplicates genres and preserves missing quarters", () => {
  const f = parseStatisticsFilters(
    "start_year=2025&start_season=winter&end_year=2026&end_season=summer",
    now,
  );
  const records = [
    {
      region: "日本",
      year: 2025,
      season: "winter" as const,
      score: 8,
      genres: ["奇幻", "恋爱", "奇幻"],
      source: "漫画改",
      nsfw: false,
    },
    {
      region: "日本",
      year: 2025,
      season: "winter" as const,
      score: 6,
      genres: ["奇幻"],
      source: "漫画改",
      nsfw: true,
    },
    {
      region: "日本",
      year: 2025,
      season: "winter" as const,
      score: 0,
      genres: [],
      source: "其他",
      nsfw: false,
    },
    {
      region: "中国",
      year: 2025,
      season: "winter" as const,
      score: 10,
      genres: ["奇幻"],
      source: "原创",
      nsfw: false,
    },
  ];
  const result = demoStatistics(records, f);
  assert.equal(result.quarters.length, 7);
  assert.equal(result.quarters[0].total_count, 3);
  assert.equal(result.quarters[0].average_score, 7);
  assert.equal(result.quarters[0].distribution_total, 4);
  assert.equal(result.quarters[1].average_score, null);
  assert.equal(result.quarters[6].season, "summer");
  const pie = pieStatistics(result.quarters[0]);
  assert.deepEqual(
    pie.map((p) => [p.name, p.value, p.percent]),
    [
      ["奇幻", 2, 50],
      ["恋爱", 1, 25],
      ["未分类", 1, 25],
    ],
  );
  assert.deepEqual(trendSeries(result.quarters, ["奇幻"], "average"), [
    { name: "奇幻", data: [7, null, null, null, null, null, null] },
  ]);
  assert.deepEqual(trendSeries(result.quarters, ["奇幻"], "max"), [
    { name: "奇幻", data: [8, null, null, null, null, null, null] },
  ]);
});

test("group filtering never changes the pie denominator and empty selection stays empty", () => {
  const names = ["奇幻", "恋爱", "未分类"];
  assert.deepEqual(selectedStatisticsGroups(names, ["恋爱", "unknown"]), [
    "恋爱",
  ]);
  assert.deepEqual(selectedStatisticsGroups(names, []), []);
  assert.deepEqual(selectedStatisticsGroups(names, null), names);
  const q = updateStatisticsQuery("", { group: [] });
  assert.deepEqual(parseStatisticsFilters(q.toString(), now).groups, []);
});
