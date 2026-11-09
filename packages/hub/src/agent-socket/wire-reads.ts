/** What the agent socket reads of its own: the hub's constants and pure reads the stages share. */

import type { FleetSyncReport } from "@cawco/core/fleet";
import type { FramePayload } from "@cawco/core/frames";
import {
  BOUNDARY_RELAUNCH,
  COMPACT_RELAUNCH,
  GATEWAY_RELAUNCH,
} from "@cawco/core/harness";
import type { HubPreviewOrigins } from "@cawco/core/preview/hub-previews";
import type {
  BuildInfo,
  DeliveryMark,
  Envelope,
  IngestMark,
  SessionCustody,
  SessionLimits,
} from "@cawco/core/protocol";
import type { CarrySessionRequest } from "@cawco/core/session/controls";
import {
  MESSAGES_HELD,
  MESSAGES_READ,
  MESSAGES_STORED,
} from "@cawco/core/session-messages";
import { BuildInfoSchema } from "@cawco/core/stored-shapes";
import type { RegisterAckPayload } from "@cawco/core/stream";
import type { RelaunchFor } from "@cawco/core/words/relaunch";
import { DASHBOARD_PORT, LOCAL_DASHBOARD_PORT, PREVIEW_PORTS } from "../config";
import { MACHINE_LINE_SUBTYPE } from "../cut-turns";
import type { MachineLineKind } from "../db/schema";
import type { SendSignal } from "../sends";
import { received } from "../stored-json";
import type { TailnetHttpsService } from "../tailnet-https";

export const registerAck = (
  envelope: Envelope,
  ingested: Record<string, IngestMark>,
  delivered: Record<string, DeliveryMark>,
  unknownAccounts: string[] | undefined,
  sessions: CarrySessionRequest[],
  instances: string[],
  machineCredential: string,
  sessionLimits: SessionLimits,
  hostsHub: boolean,
  revokedCredentials: string[],
  gitOrigins: string[],
  previewOrigins: HubPreviewOrigins,
  tailnetHttps: ReturnType<TailnetHttpsService["serving"]>
): Envelope<RegisterAckPayload> => ({
  verb: envelope.verb,
  machineId: envelope.machineId,
  payload: {
    ok: true,
    ingested,
    delivered,
    gitOrigins,
    hubEpoch: HUB_EPOCH,
    machineCredential,
    sessionLimits,
    // What the agent serves on its own computer's loopback (agent
    // hub-loopback.ts), and whether that computer is this hub's: then nothing.
    dashboardPorts: { hub: DASHBOARD_PORT, local: LOCAL_DASHBOARD_PORT },
    hostsHub,
    previewPorts: PREVIEW_PORTS,
    previewOrigins,
    // Where that loopback carries over https, while this hub serves it.
    ...(tailnetHttps ? { tailnetHttps } : {}),
    ...(unknownAccounts ? { unknownAccounts } : {}),
    sessions,
    instances,
    revokedCredentials,
  },
});

/**
 * `register`'s ack, carrying the ingest ledger for the instances the daemon
 * says it is holding (sessiond design §7, step 3): where each attached `Query`
 * starts reading, so what a child wrote while no agent was reading reaches
 * this hub exactly once.
 */
/** This hub process, random at its start (RegisterAckPayload.hubEpoch). */
const HUB_EPOCH = crypto.randomUUID();

/**
 * THE SESSIONS A REGISTER ACK'S LEDGER MUST COVER (sessiond design §7, step 3).
 *
 * The ledger used to be computed off `instances` alone — the daemon's own live
 * list — which is EMPTY exactly when replay matters: a daemon that just
 * restarted holds nothing, so the ack carried `{}`, every reattach followed
 * from head, and the lines sessiond buffered during the absence were dropped
 * instead of recovered. The at-most-once half of §7 fired; the replay half
 * never did.
 *
 * It cannot be fixed from the daemon's side, because naming those ids in
 * `instances` is what makes `settleInstances` call them live — and then the hub
 * stops sending the `restore` spawns that are the daemon's ONLY source of a
 * surviving child's `cwd`. So the hub answers it instead, from the one place
 * that already knows both halves: the sessions it just told this daemon to
 * restore are precisely the rows the daemon will hand to `takeHeld`, and a
 * mark for anything else is a mark it could never act on.
 *
 * Union, de-duplicated, order preserved: `reported` covers the sessions the
 * daemon named live, `restored` covers the ones this hub just told it to restore.
 */
export const reattachable = (
  reported: readonly string[],
  restored: readonly string[]
): string[] => [...new Set([...reported, ...restored])];

/**
 * And how many, newest first.
 *
 * Ours, because a register is one message and the respawns it triggers all land
 * on one machine at once. Twenty simultaneous harness launches is already a
 * heavy but survivable burst; the 178 rows that motivated this work would have
 * been a fork bomb wearing a recovery hat. Everything past the cap settles as
 * `sleeping`, which is a wake button away.
 */
export const RESTORE_MAX = 20;

/**
 * The sessions whose process sessiond holds alive on a machine, attached to
 * its daemon or not; none when its custody could not be read.
 */
export const heldProcesses = (custody: SessionCustody | undefined): string[] =>
  custody?.state === "available" ? custody.instances : [];

/** What is kept of a build a machine reported (a key this hub's type does not declare is left out). */
export const keptBuild = (
  build: BuildInfo | undefined
): BuildInfo | undefined =>
  build && received(BuildInfoSchema, build, "a machine's register (its build)");

/** The `system` subtypes an agent asks a relaunch at rest with, each with what it is for (`relaunchAtRest`). */
export const RELAUNCH_SUBTYPES: ReadonlyMap<string, RelaunchFor> = new Map([
  [BOUNDARY_RELAUNCH, "boundary"],
  [COMPACT_RELAUNCH, "compact"],
  [GATEWAY_RELAUNCH, "gateway"],
]);

export const peekSendSignal = (
  frame: FramePayload & { kind: "frame" }
): SendSignal | undefined => {
  const { message } = frame;
  if (message.type !== "system") {
    return undefined;
  }
  switch (message.subtype) {
    case MESSAGES_STORED:
      return { kind: "stored", storedAs: message.storedAs ?? {} };
    case MESSAGES_HELD:
      return {
        kind: "held",
        held: message.held ?? [],
        whole: message.whole === true,
      };
    case MESSAGES_READ:
      return {
        kind: "read",
        read: message.read ?? [],
        storedAs: message.storedAs ?? {},
      };
    default:
      return undefined;
  }
};

/** Which line its machine said, by the frame's subtype; none for any other frame. */
export const machineLineKind = (subtype: string): MachineLineKind | undefined =>
  (Object.keys(MACHINE_LINE_SUBTYPE) as MachineLineKind[]).find(
    (kind) => MACHINE_LINE_SUBTYPE[kind] === subtype
  );

/** Why a held session was not taken back, said on its row and in its transcript. */
export const custodyReason = (hours: string): string =>
  `OpenCode's server still holds this session, idle ${hours} h, and CawCo didn't take it back after its restart. Review its pending work before you wake it.`;

/**
 * How far back a register will reach to restart a session it finds orphaned.
 *
 * Ours, because nothing in the protocol declares a session worth reviving. A
 * daemon restart — a crash, an update, a `systemctl restart` — puts the machine
 * back inside seconds to a couple of minutes, and the sessions that were alive
 * across that gap are the ones the operator was in the middle of. Half an hour
 * covers that with room to spare while excluding the case that produced the
 * defect this bound exists for: a machine that had been down for a day and a
 * half came back and the hub cheerfully re-spawned every session it had ever
 * held, because an orphan from 36 hours ago and an orphan from 30 seconds ago
 * were treated identically. Older rows are not lost — they settle as `sleeping`
 * and the operator wakes the ones they want.
 */
export const RESTORE_HORIZON_MS = 30 * 60_000;

/** A report's three tables of states, which is what tells a report from any other frame. */
export const isFleetReport = (value: unknown): value is FleetSyncReport =>
  isRecord(value) &&
  isRecord((value as FleetSyncReport).mcp) &&
  isRecord((value as FleetSyncReport).marketplaces) &&
  isRecord((value as FleetSyncReport).plugins);

const isRecord = (value: unknown): boolean =>
  typeof value === "object" && value !== null;
