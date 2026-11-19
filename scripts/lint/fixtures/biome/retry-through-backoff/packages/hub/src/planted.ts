// Planted: each shape retry-through-backoff refuses, then the ones it leaves alone.
declare const tries: number;
declare const wait: number;

export const doubled = Math.min(1000 * 2 ** tries, 30_000);
export const grown = Math.min(wait * 2, 10_000);
const RETRY_MS = 5000;
export const LINK_BACKOFF_MS = [500, 1000];
export const used = RETRY_MS;

const RECOVERY_BUDGET_MS = 120_000;
const PROVIDER_RETRY_DEADLINE_MS = 30 * 60_000;
export const kept = RECOVERY_BUDGET_MS + PROVIDER_RETRY_DEADLINE_MS;
export const sized = Math.min(wait + 2, 10_000);
export const bytes = 4096 / 2 ** 10;
