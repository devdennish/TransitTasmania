// Time helpers anchored to the feed's timezone, so the schedule clock lines up
// regardless of where the viewer is.

import { FEED_TIMEZONE } from "../config.js";

// Current date/time in the feed timezone.
//   dateStr   "YYYYMMDD"
//   weekday   0 = Monday .. 6 = Sunday (matches calendar.json day order)
//   seconds   seconds since midnight
export function nowInFeedTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FEED_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dateStr = `${get("year")}${get("month")}${get("day")}`;
  const hour = Number(get("hour")) % 24;
  const seconds = hour * 3600 + Number(get("minute")) * 60 + Number(get("second"));
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const weekday = map[get("weekday")] ?? 0;
  return { dateStr, weekday, seconds };
}

// Format seconds-since-midnight as "HH:MM" (24h hours wrap for >24h GTFS times).
export function formatClock(sec) {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Human countdown for a number of seconds in the future.
export function formatCountdown(deltaSec) {
  if (deltaSec <= 30) return "due";
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
