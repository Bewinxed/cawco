/**
 * The areas projects sit in (core areas.ts), by id, for the sidebar's
 * groupings: read from the hub as the projects are, and again whenever they
 * change (an area's change is told as the projects' `projects.changed`, hub
 * server.ts `projectAreas`). Each project names its area (`areaId`); the
 * names and their order are the areas'.
 */
import { hubRequest } from "@cawco/core/hub-request";
import { cawco } from "../client.svelte";
import { devDebug } from "../dev-debug";
import { hubFetch } from "../hub-read";
import type { Area } from "../served-board";

/** The areas as last read, and whether this page has read them: until it has, the served board's (first-paint.ts `ServedBoard`). */
const state = $state<{ areas: Area[]; read: boolean }>({
  areas: [],
  read: false,
});
// A bench stands its own areas in (the /motion benches, dev only).
if (import.meta.env.DEV) {
  devDebug({ areas: state });
}
/** The projects list the areas were last read for. */
let readFor: unknown;
let asked = 0;

async function read(): Promise<void> {
  asked += 1;
  const ticket = asked;
  try {
    const response = await hubFetch(hubRequest("GET /api/areas"));
    if (!response.ok) {
      return;
    }
    const { areas } = (await response.json()) as { areas: Area[] };
    // Reads overlap when the projects change fast: the newest answer stands.
    if (ticket === asked) {
      state.areas = areas;
      state.read = true;
    }
  } catch {
    // The next change of the projects reads them again; the last read stands.
  }
}

/** The project's area, read off its row (the hub sends `areaId` on it). */
export const areaIdOf = (project: object | undefined): string | null => {
  const id = (project as { areaId?: unknown } | undefined)?.areaId;
  return typeof id === "string" ? id : null;
};

export const areas = {
  /** Every area, in the person's order; read again as the projects change. */
  get list(): Area[] {
    const { projects } = cawco;
    if (projects !== readFor && cawco.hub === "connected") {
      readFor = projects;
      queueMicrotask(read);
    }
    return state.read ? state.areas : (cawco.servedAreas ?? state.areas);
  },
  /** An area's name, or null for one not (yet) read. */
  nameOf(id: string): string | null {
    return areas.list.find((area) => area.id === id)?.name ?? null;
  },
  /** An area's place in the person's order; past every area for none. */
  placeOf(id: string | null): number {
    const at =
      id === null ? -1 : areas.list.findIndex((area) => area.id === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  },
};
