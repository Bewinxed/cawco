/**
 * Who decides, the dashboard's side of the hub's routes (hub decides.ts,
 * build spec §2.1): the fleet's members, kinds and routes with what the page
 * draws setup from, a project's table, and the writes that change either.
 * Every refusal throws the hub's sentence (project-tasks.ts `send`).
 */

import type {
  CawPoseId,
  DecidesTable,
  FleetDecides,
  Hear,
  Kind,
  Member,
} from "@cawco/core/decides";
import type { DelegateType } from "@cawco/core/delegate-types";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import { send } from "#lib/cawco/project-tasks.js";

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

export const readFleet = (): Promise<FleetOffer> =>
  send(hubRequest("GET /api/decides"));

export const readProject = (id: string): Promise<ProjectDecides> =>
  send(hubRequest("GET /api/projects/:id/decides", { path: { id } }));

/** The fleet's delegate types: what an agent member runs on. */
export const readTypes = (): Promise<{ types: DelegateType[] }> =>
  send(hubRequest("GET /api/delegate-types"));

/** The fleet's routes, whole; answers the fleet as the hub then holds it. */
export const writeFleetRoutes = (
  routes: Record<string, string>
): Promise<FleetDecides> =>
  send(hubRequest("PUT /api/decides/routes", { body: { routes } }));

/** Sets `routes` over the project's own (null: back to the fleet's), as one commit saying `message`. */
export const writeProjectRoutes = (
  id: string,
  routes: Record<string, string | null>,
  message: string
): Promise<ProjectDecides> =>
  send(
    hubRequest("PUT /api/projects/:id/decides", {
      path: { id },
      body: { routes, message },
    })
  );

/** An agent member's Runs on and Knows: its fleet delegate type. */
export interface AgentBody {
  delegates: boolean;
  effort?: EffortLevel;
  harness: HarnessKind;
  instructions: string;
  model: string;
  skills: string[];
}

/** Adds an agent member and its delegate type; answers the member as the hub holds it. */
export const addMember = (body: {
  agent: AgentBody;
  hear: Hear;
  hue: number;
  job: string;
  name: string;
}): Promise<Member> => send(hubRequest("POST /api/decides/members", { body }));

/** Saves an agent member's settings (the built-ins' too: their type and how he hears). */
export const saveMember = (
  id: string,
  body: { agent: AgentBody; hear: Hear; hue?: number; job?: string }
): Promise<Member> =>
  send(hubRequest("PUT /api/decides/members/:id", { path: { id }, body }));

/** A flock member's pose, or an added member's identity hue. */
export const setPicture = (
  id: string,
  picture: { pose: CawPoseId } | { hue: number }
): Promise<Member> =>
  send(
    hubRequest("PUT /api/decides/members/:id/picture", {
      path: { id },
      body: picture,
    })
  );

/** Removes a member he added: its kinds come back to him, in the fleet and every project file naming it. */
export const removeMember = (
  id: string
): Promise<{ kindsReturned: string[]; projectsRewritten: string[] }> =>
  send(hubRequest("DELETE /api/decides/members/:id", { path: { id } }));

/** Adds a kind of choice, decided by `to` across the fleet; answers the kind as the hub holds it. */
export const addKind = (body: {
  example: string;
  name: string;
  to: string;
}): Promise<Kind> => send(hubRequest("POST /api/decides/kinds", { body }));

/** Renames a kind in place, a built-in's too. */
export const renameKind = (
  id: string,
  body: { example: string; name: string }
): Promise<Kind> =>
  send(hubRequest("PUT /api/decides/kinds/:id", { path: { id }, body }));

/** Removes a kind he added; its open cards, on every page, move to `moveTo`. */
export const removeKind = (
  id: string,
  moveTo: string
): Promise<{ moved: number; projects: string[] }> =>
  send(
    hubRequest("DELETE /api/decides/kinds/:id", {
      path: { id },
      body: { moveTo },
    })
  );

/** The open decision cards filed under a kind, and the projects they wait in, by id. */
export const readWaiting = (
  id: string
): Promise<{ count: number; projects: string[] }> =>
  send(hubRequest("GET /api/decides/kinds/:id/waiting", { path: { id } }));

/** A member's record (hub `GET /api/decides/members/:id/record`): what it decided, and what waits on it now. */
export interface MemberRecord {
  /** Caw, read from a project's page: that project's conversations; null otherwise. */
  caw: {
    lastTurnAt: string | null;
    spendUsd: number;
    threads: number;
  } | null;
  decided: number;
  lastAt: string | null;
  spendUsd: number;
  takenBack: number;
  waiting: number;
}

/** A member's record; Caw's with project `projectId`'s conversations. */
export const readRecord = (
  id: string,
  projectId: string | null = null
): Promise<MemberRecord> =>
  send(
    hubRequest("GET /api/decides/members/:id/record", {
      path: { id },
      ...(projectId === null ? {} : { query: { project: projectId } }),
    })
  );
