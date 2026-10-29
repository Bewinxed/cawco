/**
 * What a machine's own frame data already says about whether it has converged
 * with the rest of the fleet — the board's answer to the Mac's 21-day silence
 * (see `.unlazy-liveness/gates/c2.md`): a build nobody can place and a sync stuck
 * on a decision nobody was asked to make. Every reader here is pure: given the frame data a
 * machine already carries, no reach into the network.
 */

import {
  FLEET_ACK_MS,
  type FleetItemStatus,
  type FleetSyncReport,
} from "@cawco/core/fleet";
import { itemKind, projectItemOf } from "@cawco/core/fleet-items";
import { isHarnessConfigKind } from "@cawco/core/harness-config";
import type { AgentRow, BuildInfo } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { fleetFaultWords } from "@cawco/core/words/fleet-faults";

/** Whether a machine's own reported build is level with the hub's. */
export type BuildConvergence = "unknown" | "current" | "behind";

/**
 * `unknown` whenever either side has nothing to compare — most importantly a
 * machine that never reported a commit at all, which must never read as
 * "current" just because it also never read as "behind". That is the exact
 * shape of the incident this leaf exists to catch: 21 days of `commit: None`
 * rendering as nothing, rather than as the absence it is.
 */
export function buildConvergence(
  build: BuildInfo | undefined,
  hubBuild: BuildInfo | undefined
): BuildConvergence {
  if (!(build?.commit && hubBuild?.commit)) {
    return "unknown";
  }
  return build.commit === hubBuild.commit ? "current" : "behind";
}

/**
 * The fleet-sync failure readers that used to live here — `SyncFailure`,
 * `fleetSyncFailures` and `SYNC_FAILURE_ANCHOR` — now live in `fleet-faults.ts`
 * as `Fault`, `machineFaults` and `SCOPE_ANCHOR`. They were the same concept
 * twice: this file could say a row failed, and nothing anywhere could say WHY
 * or what to do about it. One vocabulary answers both, so this one is gone
 * rather than kept as its poorer half.
 */

/**
 * How long ago a machine's fleet report was taken, in ms — `undefined` for a
 * machine that has never synced at all. "11 days" is the number that would
 * have made the Mac's drift visible on day one; this is where it comes from.
 */
function fleetSyncAgeMs(
  fleet: FleetSyncReport | undefined,
  now: number = Date.now()
): number | undefined {
  return fleet ? Math.max(0, now - fleet.at) : undefined;
}

/**
 * Where a machine's fleet stands, from its row: the answer to the last delta
 * the hub sent it (`fleetSync`) and each item as its harnesses converge it
 * (`fleetItems`), read with the age of the last report it kept
 * ({@link fleetSyncAgeMs}). A missing report is never fine: a machine that
 * has answered nothing is `never`.
 */
export type SyncReading =
  | { state: "never" }
  | { state: "refused"; error: string }
  | { state: "unacknowledged"; ageMs: number | undefined }
  | { state: "setting-up"; done: number; total: number }
  | { state: "failed"; failed: FleetItemStatus[]; total: number }
  | { state: "converged"; ageMs: number | undefined };

export function machineSync(
  machine: Pick<AgentRow, "fleet" | "fleetItems" | "fleetSync">,
  now: number = Date.now()
): SyncReading {
  const ageMs = fleetSyncAgeMs(machine.fleet, now);
  const outcome = machine.fleetSync;
  if (outcome?.state === "nacked") {
    return { state: "refused", error: outcome.error };
  }
  if (
    outcome?.state === "unacked" ||
    (outcome?.state === "sent" && now - outcome.sentAt > FLEET_ACK_MS)
  ) {
    return { state: "unacknowledged", ageMs };
  }
  const items = Object.values(machine.fleetItems ?? {});
  const moving = items.filter(
    (item) => item.state === "pending" || item.state === "running"
  );
  if (moving.length > 0) {
    return {
      state: "setting-up",
      done: items.length - moving.length,
      total: items.length,
    };
  }
  const failed = items.filter((item) => item.state === "failed");
  if (failed.length > 0) {
    return { state: "failed", failed, total: items.length };
  }
  if (!outcome && ageMs === undefined && items.length === 0) {
    return { state: "never" };
  }
  return { state: "converged", ageMs };
}

/**
 * What a machine's row says of its fleet, in a word or two; `null` when
 * there is nothing to say: every item converged. The age is the last
 * report's, said by `span` (the home's "4m", "2d").
 */
export function syncNotice(
  reading: SyncReading,
  span: (ms: number) => string
): string | null {
  switch (reading.state) {
    case "never":
      return "never synced";
    case "refused":
      return "sync refused";
    case "unacknowledged": {
      if (reading.ageMs === undefined) {
        return "sync unanswered · never synced";
      }
      const said = span(reading.ageMs);
      return `sync unanswered · last synced ${said === "now" ? "just now" : `${said} ago`}`;
    }
    case "setting-up":
      return `setting up ${reading.done}/${reading.total}`;
    case "failed":
      return `${reading.failed.length} of ${reading.total} not set up`;
    case "converged":
      return null;
    default:
      unhandled("reading", reading);
  }
}

/** A harness config row's key, `<kind>:<name>` and a placed copy's `@<place id>`, in words. */
function harnessConfigWords(key: string): string {
  const colon = key.indexOf(":");
  const kind = key.slice(0, colon);
  const at = key.indexOf("@", colon);
  const name = key.slice(colon + 1, at < 0 ? undefined : at);
  return colon > 0 && isHarnessConfigKind(kind)
    ? fleetFaultWords.harnessConfigRow(kind, name)
    : key;
}

/**
 * What a fleet item is, in words: "MCP server chrome-devtools", "skill show",
 * "the memory". Every kind is named below, so a kind added to core's
 * `FleetItemKind` fails the types here until it has its words.
 */
function itemWords(id: string): string {
  const kind = itemKind(id);
  const key =
    projectItemOf(id)?.key ??
    (id.includes(":") ? id.slice(id.indexOf(":") + 1) : "");
  const name = key.includes("@") ? key.slice(0, key.lastIndexOf("@")) : key;
  switch (kind) {
    case "mcp":
    case "projectMcp":
      return `MCP server ${name}`;
    case "skill":
    case "projectSkill":
      return `skill ${name}`;
    case "marketplace":
      return `marketplace ${name}`;
    case "plugin":
    case "pluginPayload":
      return `plugin ${name}`;
    case "memory":
      return "the memory";
    case "memoryDoc":
    case "projectMemory":
      return `memory document ${key}`;
    case "hook":
    case "projectHook":
      return `hook ${key}`;
    case "harnessConfig":
    case "projectHarnessConfig":
      return harnessConfigWords(key);
    case "projectCheckout":
      return "the project's checkout";
    case "policy":
      return "the fleet's denied tools";
    case "hubOnly":
      return "the hub-only marketplaces";
  }
}

/**
 * A machine's failed items gathered by the cause it gave for each, the
 * group with most items first: 141 items that failed for one reason are one
 * failure, said once, with one Retry (the machines panel).
 */
export interface FailureGroup {
  /** What the machine said, word for word; `undefined` when it said nothing. */
  cause: string | undefined;
  /** The items, in their words' order. */
  items: FleetItemStatus[];
}

export function failureGroups(
  items: Iterable<FleetItemStatus>
): FailureGroup[] {
  const byCause = Map.groupBy(
    [...items].filter((item) => item.state === "failed"),
    (item) => item.error?.trim() || undefined
  );
  return [...byCause]
    .map(([cause, group]) => ({
      cause,
      items: group.toSorted((a, b) =>
        itemWords(a.id).localeCompare(itemWords(b.id))
      ),
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

/**
 * A harness's thrown converge as the agent joins it, one per line
 * (session.ts `#harnessFailures`: "opencode: Error: …"): the harness's name
 * says whose it was, and the "Error: " a thrown Error's string carries after
 * it says nothing more.
 */
const HARNESS_ERROR = /^([\w-]+): (?:Error: )+/gmu;

/**
 * A group's reason, in the error formula: what happened (the one item by
 * name, or the count), then the machine's cause as a sentence of its own.
 */
export function failureReason(group: FailureGroup): string {
  const [first] = group.items;
  const what =
    group.items.length === 1 && first
      ? `${itemWords(first.id)} didn't set up.`
      : `${group.items.length} items didn't set up.`;
  const cause = group.cause
    ?.replace(HARNESS_ERROR, "$1: ")
    .replace(/\s+/gu, " ");
  return `${what} ${cause ?? "The machine gave no reason."}`;
}

/** A group's Show details: each item by name, one to a line; none for a group of one, which its reason names. */
export function failureDetails(group: FailureGroup): string | undefined {
  return group.items.length > 1
    ? group.items.map((item) => itemWords(item.id)).join("\n")
    : undefined;
}
