import type { HubRead } from "#lib/platform/hub-read.js";

export const ssr = false;

export const load = () => {
  // PaneTabs reads `page.data.names` for a session the fleet has not
  // answered for: the frame's three sessions, by their ids in +page.svelte.
  const names: Record<string, HubRead<string>> = {
    "f1d0c0de-0000-4000-8000-000000000001": {
      ok: true,
      value: "Rebuild the token sheet",
    },
    "f1d0c0de-0000-4000-8000-000000000002": {
      ok: true,
      value: "Fix the relay's reconnect after sleep",
    },
    "f1d0c0de-0000-4000-8000-000000000003": {
      ok: true,
      value: "Audit the push probe",
    },
  };
  return { names };
};
