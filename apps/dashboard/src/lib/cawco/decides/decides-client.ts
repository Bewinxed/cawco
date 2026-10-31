/**
 * Who decides, the dashboard's side of the hub's routes (hub decides.ts,
 * build spec §2.1): the fleet's members, kinds and routes with what the page
 * draws setup from, a project's table, and the writes that change either.
 * Every refusal throws the hub's sentence (project-tasks.ts `send`).
 */

import type { DecidesTable, FleetDecides } from "@cawco/core/decides";
import type { DelegateType } from "@cawco/core/delegate-types";
import { json, send } from "#lib/cawco/project-tasks.js";

/** A harness on an online machine, with its models (hub `HarnessOffer`). */
interface HarnessOffer {
  id: string;
  machines: string[];
  models: { default: boolean; id: string; name: string }[];
  name: string;
}

/** What `GET /api/decides` answers: the fleet's table and what setup draws from. */
export interface FleetOffer extends FleetDecides {
  connections: { email: boolean; slack: boolean };
  harnesses: HarnessOffer[];
  skills: { id: string; note: string }[];
}

/** A project's table as the hub reads it, and the file it reads it from. */
export interface ProjectDecides {
  decides: DecidesTable;
  file: string;
}

const project = (id: string) =>
  `/api/projects/${encodeURIComponent(id)}/decides`;

export const readFleet = (): Promise<FleetOffer> => send("/api/decides");

export const readProject = (id: string): Promise<ProjectDecides> =>
  send(project(id));

/** The fleet's delegate types: what an agent member runs on. */
export const readTypes = (): Promise<{ types: DelegateType[] }> =>
  send("/api/delegate-types");

/** The fleet's routes, whole; answers the fleet as the hub then holds it. */
export const writeFleetRoutes = (
  routes: Record<string, string>
): Promise<FleetDecides> =>
  send("/api/decides/routes", json("PUT", { routes }));

/** Sets `routes` over the project's own (null: back to the fleet's), as one commit saying `message`. */
export const writeProjectRoutes = (
  id: string,
  routes: Record<string, string | null>,
  message: string
): Promise<ProjectDecides> =>
  send(project(id), json("PUT", { routes, message }));
