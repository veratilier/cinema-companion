export function parseSubtitleTime(value) {
  const token = String(value).trim().split(/\s+/)[0].replace(",", ".");
  const parts = token.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  let seconds = 0;
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isFinite(number) || number < 0) return null;
    seconds = seconds * 60 + number;
  }
  return seconds;
}

export function parseSubtitles(input) {
  const normalized = String(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!normalized) return [];

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return null;
      const times = lines[timingIndex].split("-->");
      if (times.length !== 2) return null;
      const start = parseSubtitleTime(times[0]);
      const end = parseSubtitleTime(times[1]);
      if (start === null || end === null || end <= start) return null;
      const text = lines
        .slice(timingIndex + 1)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return text ? { start, end, text } : null;
    })
    .filter(Boolean);
}

export function subtitlesThrough(position, cues, lookback = 15) {
  const safePosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  const safeLookback = Number.isFinite(lookback) ? Math.max(0, lookback) : 15;
  const earliest = Math.max(0, safePosition - safeLookback);
  return cues.filter((cue) => cue.end <= safePosition && cue.end >= earliest);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}
