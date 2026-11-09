/**
 * Who decides, the dashboard's side of the hub's routes (hub decides.ts,
 * build spec §2.1): the fleet's members, kinds and routes with what the page
 * draws setup from, a project's table, and the writes that change either.
 * Every refusal throws the hub's sentence (hub-read.ts `refusedOrUnreached`).
 */

import type { CawPoseId, FleetDecides, Hear } from "@cawco/core/decides";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import { hub } from "#lib/platform/hub.js";
import { hubJson, refusedOrUnreached } from "#lib/platform/hub-read.js";

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

export const readFleet = async () => {
  const answer = await hub.api.decides.get();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

export const readProject = async (id: string) => {
  const answer = await hub.api.projects({ id }).decides.get();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** The fleet's delegate types: what an agent member runs on. */
export const readTypes = async () => {
  const answer = await hub.api["delegate-types"].get();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** The fleet's routes, whole; answers the fleet as the hub then holds it. */
export const writeFleetRoutes = async (routes: Record<string, string>) => {
  const answer = await hub.api.decides.routes.put({ routes });
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Sets `routes` over the project's own (null: back to the fleet's), as one commit saying `message`. */
export const writeProjectRoutes = async (
  id: string,
  routes: Record<string, string | null>,
  message: string
) => {
  const answer = await hub.api
    .projects({ id })
    .decides.put({ routes, message });
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

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
export const addMember = async (body: {
  agent: AgentBody;
  hear: Hear;
  hue: number;
  job: string;
  name: string;
}) => {
  const answer = await hub.api.decides.members.post(body);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Saves an agent member's settings (the built-ins' too: their type and how he hears). */
export const saveMember = async (
  id: string,
  body: { agent: AgentBody; hear: Hear; hue?: number; job?: string }
) => {
  const answer = await hub.api.decides.members({ id }).put(body);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** A flock member's pose, or an added member's identity hue. */
export const setPicture = async (
  id: string,
  picture: { pose: CawPoseId } | { hue: number }
) => {
  const answer = await hub.api.decides.members({ id }).picture.put(picture);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Removes a member he added: its kinds come back to him, in the fleet and every project file naming it. */
export const removeMember = async (id: string) => {
  const answer = await hub.api.decides.members({ id }).delete();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Adds a kind of choice, decided by `to` across the fleet; answers the kind as the hub holds it. */
export const addKind = async (body: {
  example: string;
  name: string;
  to: string;
}) => {
  const answer = await hub.api.decides.kinds.post(body);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Renames a kind in place, a built-in's too. */
export const renameKind = async (
  id: string,
  body: { example: string; name: string }
) => {
  const answer = await hub.api.decides.kinds({ id }).put(body);
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** Removes a kind he added; its open cards, on every page, move to `moveTo`. */
export const removeKind = async (id: string, moveTo: string) => {
  const answer = await hub.api.decides.kinds({ id }).delete({ moveTo });
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

/** The open decision cards filed under a kind, and the projects they wait in, by id. */
export const readWaiting = async (id: string) => {
  const answer = await hub.api.decides.kinds({ id }).waiting.get();
  if (answer.error) {
    throw refusedOrUnreached(answer);
  }
  return answer.data;
};

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
  hubJson(
    hubRequest("GET /api/decides/members/:id/record", {
      path: { id },
      ...(projectId === null ? {} : { query: { project: projectId } }),
    }),
    { failure: refusedOrUnreached }
  );
