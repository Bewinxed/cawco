/**
 * The notifications ask a browser shows as the dashboard loads, put away
 * in that browser with Not now: kept in its localStorage under `key` as
 * `value` (dashboard person.svelte.ts). The key is the one the Needs you
 * row it replaced kept, so a browser that answered that row once is not
 * asked again.
 */
export const PRESENCE_ONBOARDING_SKIPPED = {
  key: "cawco-presence-onboarding",
  value: "skipped",
} as const;
