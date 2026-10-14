import { error } from "@sveltejs/kit";
import type { HubRead } from "#lib/cawco/hub-read.js";
import { dev } from "$app/env";

export const ssr = false;

/** A bench for the dev server only; a built dashboard has no such page. */
export const load = () => {
  if (!dev) {
    error(404, "Not found");
  }
  // PaneTabs reads `page.data.names` (the layout server's names for open
  // tabs) for a session the fleet has not answered for: the bench's four
  // sessions, by their ids in +page.svelte.
  const names: Record<string, HubRead<string>> = {
    "1a2b3c4d-0000-4000-8000-000000000001": {
      ok: true,
      value: "Approve the deploy key",
    },
    "1a2b3c4d-0000-4000-8000-000000000002": {
      ok: true,
      value: "Fix tray chip overflow",
    },
    "1a2b3c4d-0000-4000-8000-000000000003": {
      ok: true,
      value: "Audit the push probe",
    },
    "1a2b3c4d-0000-4000-8000-000000000004": {
      ok: true,
      value: "Rebuild the token sheet",
    },
  };
  return { names };
};
