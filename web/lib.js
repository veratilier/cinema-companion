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

export const MIN_WATCH_INTERVAL = 5;
export const MAX_WATCH_INTERVAL = 3600;

export function normalizeWatchInterval(value) {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return 0;
  const number = Number(value);
  return Number.isInteger(number) && number >= MIN_WATCH_INTERVAL && number <= MAX_WATCH_INTERVAL ? number : 0;
}
