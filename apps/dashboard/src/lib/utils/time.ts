import { memoryWords } from "@cawco/core";

/**
 * Format a date as a relative time string (e.g., "5m ago"); the app's
 * FleetMemory `ago` says it the same way.
 */
export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 5) {
    return memoryWords.justNow;
  }

  if (diffInSeconds < 60) {
    return memoryWords.ago(`${diffInSeconds}s`);
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return memoryWords.ago(`${diffInMinutes}m`);
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return memoryWords.ago(`${diffInHours}h`);
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return memoryWords.ago(`${diffInDays}d`);
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return memoryWords.ago(`${diffInWeeks}w`);
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return memoryWords.ago(`${diffInMonths}mo`);
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return memoryWords.ago(`${diffInYears}y`);
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
