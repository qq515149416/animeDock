import test from "node:test";
import assert from "node:assert/strict";
import { updateFilterQuery, toggleGenreQuery } from "../src/lib/filters";
test("rapid year then season selection preserves both and resets pagination", () => {
  let address = "region=日本&page=3";
  address = updateFilterQuery(address, "year", "2026").toString();
  address = updateFilterQuery(address, "season", "autumn").toString();
  const params = new URLSearchParams(address);
  assert.equal(params.get("year"), "2026");
  assert.equal(params.get("season"), "autumn");
  assert.equal(params.get("region"), "日本");
  assert.equal(params.has("page"), false);
});
test("rapid genre toggles retain AND conditions and remove only chosen genre", () => {
  let address = toggleGenreQuery("year=2026", "奇幻").toString();
  address = toggleGenreQuery(address, "治愈").toString();
  assert.deepEqual(new URLSearchParams(address).getAll("genres"), [
    "奇幻",
    "治愈",
  ]);
  address = toggleGenreQuery(address, "奇幻").toString();
  assert.deepEqual(new URLSearchParams(address).getAll("genres"), ["治愈"]);
  assert.equal(new URLSearchParams(address).get("year"), "2026");
});
