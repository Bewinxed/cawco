/**
 * Who decides, the dashboard's side (core decides.ts, hub decides-file.ts):
 * a project's table as the hub reads it, its decides.md written as any
 * folder file is, and the fleet's default. Every refusal throws the hub's
 * sentence (project-tasks.ts `send`).
 */
import {
  DECISION_KINDS,
  type DecidesOwn,
  type DecidesRoute,
  type DecidesTable,
  type DecisionKind,
  decidesFileOf,
  type FleetDecides,
} from "@cawco/core";
import { hubFailure } from "#lib/cawco/hub-read.js";
import { json, send } from "#lib/cawco/project-tasks.js";

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;

/** The project's Who decides as the hub reads it now: decides.md over the fleet's, over the defaults. */
export const readProjectDecides = (
  projectId: string
): Promise<{ decides: DecidesTable; file: string }> =>
  send(`${base(projectId)}/decides`);

/** The fleet's default, which every project shows until it routes a kind itself. */
export const readFleetDecides = (): Promise<FleetDecides> =>
  send("/api/decides");

export const saveFleetDecides = (fleet: FleetDecides): Promise<FleetDecides> =>
  send("/api/decides", json("PUT", fleet));

/** decides.md as the folder holds it now; null with none. */
const decidesNow = async (
  projectId: string,
  file: string
): Promise<string | null> => {
  const response = await fetch(
    `${base(projectId)}/folder/file?${new URLSearchParams({ path: file })}`
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${(await hubFailure(response)).detail}.`);
  }
  return ((await response.json()) as { content: string }).content;
};

/**
 * What the project routes itself, from the table the hub read: each kind
 * whose route came from its file, its paths. Its advisor is the file's own
 * only when it differs from the fleet's.
 */
export const ownOf = (
  table: DecidesTable,
  fleetAdvisor: string
): DecidesOwn => ({
  routes: Object.fromEntries(
    DECISION_KINDS.filter((kind) => table.from[kind] === "project").map(
      (kind) => [kind, table.routes[kind]]
    )
  ) as Partial<Record<DecisionKind, DecidesRoute>>,
  advisor: table.advisor === fleetAdvisor ? null : table.advisor,
  yours: table.yours,
});

/**
 * Writes the project's decides.md with `own` as its block, its notes kept,
 * and answers the table the hub reads from it.
 */
export async function saveProjectDecides(
  projectId: string,
  file: string,
  own: DecidesOwn,
  message: string
): Promise<DecidesTable> {
  const was = await decidesNow(projectId, file);
  await send(
    `${base(projectId)}/folder/file`,
    json("PUT", {
      path: file,
      content: decidesFileOf(own, was),
      message,
    })
  );
  return (await readProjectDecides(projectId)).decides;
}
