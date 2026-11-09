/**
 * Who decides, the dashboard's side of the hub's routes (hub decides.ts,
 * build spec §2.1): the fleet's members, kinds and routes with what the page
 * draws setup from, a project's table, and the writes that change either.
 * Every refusal throws the hub's sentence (hub-read.ts `refusedOrUnreached`).
 */

import type { CawPoseId, FleetDecides, Hear } from "@cawco/core/decides";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import { hub } from "#lib/platform/hub.js";
import { hubData, refusedOrUnreached } from "#lib/platform/hub-read.js";

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

export const readFleet = () =>
  hubData(hub.api.decides.get(), refusedOrUnreached);

export const readProject = (id: string) =>
  hubData(hub.api.projects({ id }).decides.get(), refusedOrUnreached);

/** The fleet's delegate types: what an agent member runs on. */
export const readTypes = () =>
  hubData(hub.api["delegate-types"].get(), refusedOrUnreached);

/** The fleet's routes, whole; answers the fleet as the hub then holds it. */
export const writeFleetRoutes = (routes: Record<string, string>) =>
  hubData(hub.api.decides.routes.put({ routes }), refusedOrUnreached);

/** Sets `routes` over the project's own (null: back to the fleet's), as one commit saying `message`. */
export const writeProjectRoutes = (
  id: string,
  routes: Record<string, string | null>,
  message: string
) =>
  hubData(
    hub.api.projects({ id }).decides.put({ routes, message }),
    refusedOrUnreached
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
}) => hubData(hub.api.decides.members.post(body), refusedOrUnreached);

/** Saves an agent member's settings (the built-ins' too: their type and how he hears). */
export const saveMember = (
  id: string,
  body: { agent: AgentBody; hear: Hear; hue?: number; job?: string }
) => hubData(hub.api.decides.members({ id }).put(body), refusedOrUnreached);

/** A flock member's pose, or an added member's identity hue. */
export const setPicture = (
  id: string,
  picture: { pose: CawPoseId } | { hue: number }
) =>
  hubData(
    hub.api.decides.members({ id }).picture.put(picture),
    refusedOrUnreached
  );

/** Removes a member he added: its kinds come back to him, in the fleet and every project file naming it. */
export const removeMember = (id: string) =>
  hubData(hub.api.decides.members({ id }).delete(), refusedOrUnreached);

/** Adds a kind of choice, decided by `to` across the fleet; answers the kind as the hub holds it. */
export const addKind = (body: { example: string; name: string; to: string }) =>
  hubData(hub.api.decides.kinds.post(body), refusedOrUnreached);

/** Renames a kind in place, a built-in's too. */
export const renameKind = (
  id: string,
  body: { example: string; name: string }
) => hubData(hub.api.decides.kinds({ id }).put(body), refusedOrUnreached);

/** Removes a kind he added; its open cards, on every page, move to `moveTo`. */
export const removeKind = (id: string, moveTo: string) =>
  hubData(hub.api.decides.kinds({ id }).delete({ moveTo }), refusedOrUnreached);

/** The open decision cards filed under a kind, and the projects they wait in, by id. */
export const readWaiting = (id: string) =>
  hubData(hub.api.decides.kinds({ id }).waiting.get(), refusedOrUnreached);

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
  hubData(
    hub.api.decides.members({ id }).record.get({
      query: projectId === null ? {} : { project: projectId },
    }),
    refusedOrUnreached
  );
