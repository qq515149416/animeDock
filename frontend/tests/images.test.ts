import test from "node:test";
import assert from "node:assert/strict";
import { getAnimeCoverUrl, getAnimeCoverCandidates } from "../src/lib/images";

test("archive subjects without cover metadata load the official subject image", () => {
  assert.equal(
    getAnimeCoverUrl({ id: 10380, image_url: "" }, false),
    "https://api.bgm.tv/v0/subjects/10380/image?type=large",
  );
  assert.equal(
    getAnimeCoverUrl({ id: 328609, image_url: null }, false),
    "https://api.bgm.tv/v0/subjects/328609/image?type=large",
  );
});

test("existing covers take priority over the official fallback", () => {
  assert.equal(
    getAnimeCoverUrl(
      { id: 10380, image_url: "https://lain.bgm.tv/cover.jpg" },
      false,
    ),
    "https://lain.bgm.tv/cover.jpg",
  );
});

test("fictional demo subjects and invalid IDs keep their generated placeholders", () => {
  assert.equal(getAnimeCoverUrl({ id: 1, image_url: null }, true), null);
  for (const id of [0, -1, NaN, 1.5]) {
    assert.equal(getAnimeCoverUrl({ id, image_url: "" }, false), null);
  }
});

test("an external backup is tried after the existing official cover", () => {
  assert.deepEqual(getAnimeCoverCandidates({ id: 517532, image_url: "", fallback_image_url: "https://cdn.myanimelist.net/backup.jpg" }, false), [
    "https://api.bgm.tv/v0/subjects/517532/image?type=large",
    "https://cdn.myanimelist.net/backup.jpg",
  ]);
  assert.deepEqual(getAnimeCoverCandidates({ id: 517532, image_url: "https://lain.bgm.tv/cover.jpg", fallback_image_url: "https://lain.bgm.tv/cover.jpg" }, false), ["https://lain.bgm.tv/cover.jpg"]);
});
