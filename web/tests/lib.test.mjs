import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, normalizeWatchInterval } from "../lib.js";

test("formats playback time", () => {
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3661), "1:01:01");
});

test("accepts whole-second custom intervals from 5 seconds to one hour", () => {
  assert.equal(normalizeWatchInterval("10"), 10);
  assert.equal(normalizeWatchInterval(30), 30);
  assert.equal(normalizeWatchInterval("60"), 60);
  assert.equal(normalizeWatchInterval("15"), 15);
  assert.equal(normalizeWatchInterval("3600"), 3600);
  assert.equal(normalizeWatchInterval("4"), 0);
  assert.equal(normalizeWatchInterval("3601"), 0);
  assert.equal(normalizeWatchInterval("5.5"), 0);
  assert.equal(normalizeWatchInterval(""), 0);
  assert.equal(normalizeWatchInterval(null), 0);
  assert.equal(normalizeWatchInterval("manual"), 0);
});
