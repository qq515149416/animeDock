import test from "node:test";
import assert from "node:assert/strict";
import { beijingDate } from "../src/lib/utils";
test("episode calendar date follows Beijing across UTC midnight and year boundary", () => {
  assert.equal(beijingDate(new Date("2026-10-18T16:01:00Z")), "2026-10-19");
  assert.equal(beijingDate(new Date("2026-12-31T16:01:00Z")), "2027-01-01");
  assert.equal(beijingDate(new Date("2026-12-31T15:59:00Z")), "2026-12-31");
});
