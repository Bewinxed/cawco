import { memoryWords } from "@cawco/core/words/memory";

type AgeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

/** How long ago `date` was, in the one unit both wordings below say it in; null under 5s. */
function ageOf(date: Date): { n: number; unit: AgeUnit } | null {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) {
    return null;
  }
  if (seconds < 60) {
    return { n: seconds, unit: "second" };
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return { n: minutes, unit: "minute" };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { n: hours, unit: "hour" };
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return { n: days, unit: "day" };
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return { n: weeks, unit: "week" };
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return { n: months, unit: "month" };
  }
  return { n: Math.floor(days / 365), unit: "year" };
}

const SHORT_UNIT: Record<AgeUnit, string> = {
  second: "s",
  minute: "m",
  hour: "h",
  day: "d",
  week: "w",
  month: "mo",
  year: "y",
};

/**
 * Format a date as a relative time string (e.g., "5m ago"); the app's
 * FleetMemory `ago` says it the same way.
 */
export function formatDistanceToNow(date: Date): string {
  const age = ageOf(date);
  return age
    ? memoryWords.ago(`${age.n}${SHORT_UNIT[age.unit]}`)
    : memoryWords.justNow;
}

const LONG = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/**
 * {@link formatDistanceToNow} in whole words ("1 week ago"), for what a
 * screen reader or a tooltip says of the same age.
 */
export function formatDistanceToNowLong(date: Date): string {
  const age = ageOf(date);
  return age ? LONG.format(-age.n, age.unit) : memoryWords.justNow;
}

/**
 * Format a date as a readable timestamp
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * An age in one or two characters plus a unit, for a column too narrow to
 * spend "minutes ago" on — `now`, `12m`, `3h`, `2d`, `5w`. The sidebar's
 * session rows are the caller: they need to answer "which one was I just in"
 * inside about 30px, beside a name that wants every other pixel.
 */
export function formatAgeShort(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 45) {
    return "now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = Math.round(days / 7);
  if (weeks < 52) {
    return `${weeks}w`;
  }
  return `${Math.round(days / 365)}y`;
}
