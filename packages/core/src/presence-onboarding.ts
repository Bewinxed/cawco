/**
 * The presence onboarding row ("Know when you're at your desk", Needs you)
 * put away in one browser with Skip: kept in that browser's localStorage
 * under `key` as `value` (dashboard person.svelte.ts). The probe kit's
 * journeys start their pages with it put away, as a person who answered it
 * once, so the row a fresh browser stands in counts nothing in their Needs
 * you; a word changed here is changed for both.
 */
export const PRESENCE_ONBOARDING_SKIPPED = {
  key: "cawco-presence-onboarding",
  value: "skipped",
} as const;
