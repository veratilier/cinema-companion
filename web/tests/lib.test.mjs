import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, parseSubtitles, subtitlesThrough } from "../lib.js";

test("parses SRT and excludes unfinished dialogue", () => {
  const cues = parseSubtitles(
    "1\n00:00:01,000 --> 00:00:03,000\nFirst\n\n2\n00:00:03,500 --> 00:00:06,000\nSecond",
  );
  assert.equal(cues.length, 2);
  assert.deepEqual(subtitlesThrough(4, cues).map((cue) => cue.text), ["First"]);
});

test("parses WebVTT settings and skips malformed blocks", () => {
  const cues = parseSubtitles(
    "WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<b>Hello</b>\n\ninvalid\n00:02.000 --> 00:01.000\nNo",
  );
  assert.deepEqual(cues, [{ start: 1, end: 2, text: "Hello" }]);
});

test("formats playback time", () => {
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3661), "1:01:01");
});
