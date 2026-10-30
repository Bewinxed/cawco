/**
 * Fleet-wide tool denials. The fleet baseline lives in the hub's
 * `supervisor_config.denied_tools` column and reaches every machine through
 * the normal fleet-sync path (`FleetConfig.deniedTools`). The sidecar
 * (`~/.claude/cawco-fleet.json`) caches the last-synced value so a machine
 * that loses its hub still has a policy.
 *
 * Every session is denied its harness's own to-do list and plan mode
 * besides (core `OWN_LIST_DENIED`): a session's plan is CawCo's list, always;
 * and its own question tool (core `QUESTION_TOOL_DENIED`), at spawn alone.
 * Those names are never stored in the baseline; they are added here.
 *
 * A machine that has not heard the list, or cannot read the sidecar, spawns
 * nothing: no compiled list stands in for the fleet's.
 *
 * The list is the policy the hub's welcome carries (core fleet.ts
 * `FLEET_DELTA`): the agent writes it as the welcome arrives
 * ({@link applyFleetDenials}), before it answers, and the hub marks the
 * machine online only on that answer. So a machine online holds the list,
 * and a spawn waits on nothing but a write already under way: a missing
 * list at a spawn is a fault, said at once.
 *
 * Two consumers read the resolved denials:
 *  1. The spawn paths (`claude.ts`, `opencode.ts`, `pi.ts`), through
 *     {@link sessionFleetDenials}: the baseline, plus the own-list set.
 *  2. `convergeDeniedTools`, which writes the machine's share (the baseline,
 *     plus the own-list set) into
 *     `~/.claude/settings.json` so the user's own `claude` sees the same
 *     denials — at daemon start, and again on every fleet sync.
 *
 * Both read {@link resolvedFleetDenials} — the single source — so they cannot
 * drift from each other.
 */
import {
  clockWords,
  OWN_LIST_DENIED,
  opencodeToolsFor,
  QUESTION_TOOL_DENIED,
} from "@cawco/core";
import { userLayerPath } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";

/** Every `claude` this user starts reads it, daemon-spawned or not. */
const SETTINGS = userLayerPath("settings.json");

/** The sidecar: the policy as each welcome or delta arrives, what the converge wrote after it. */
const SIDECAR = userLayerPath("cawco-fleet.json");

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** The fleet's denials as this machine last heard them. */
export interface FleetDenials {
  /** The baseline. */
  deniedTools: readonly string[];
}

/**
 * What the sidecar says of the fleet's denials: the list, or
 * that this machine has not heard them yet (no sidecar, or one written before
 * a sync carried `deniedTools`), or why the sidecar cannot be read.
 */
export type FleetDenialsRead =
  | { kind: "known"; denials: FleetDenials }
  | { kind: "unsynced"; reason: string }
  | { kind: "unreadable"; reason: string };

const UNSYNCED = `this machine has not written the fleet's denied tools (${SIDECAR})`;

/**
 * The fleet's denials as the last sync wrote them, read now. Nothing stands in
 * for a list the hub never sent: a machine that has not heard it, or cannot
 * read it, says so ({@link resolvedFleetDenials} refuses on it). An empty list
 * is only ever the operator's own, cleared in the hub.
 */
export const readFleetDenials = async (): Promise<FleetDenialsRead> => {
  const file = Bun.file(SIDECAR);
  if (!(await file.exists())) {
    return { kind: "unsynced", reason: UNSYNCED };
  }
  let stored: unknown;
  try {
    stored = await file.json();
  } catch (error) {
    return {
      kind: "unreadable",
      reason: `could not parse ${SIDECAR}: ${said(error)}`,
    };
  }
  const sidecar = asRecord(stored);
  if (!sidecar) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR} is not a JSON object`,
    };
  }
  if (sidecar.deniedTools === undefined) {
    return { kind: "unsynced", reason: UNSYNCED };
  }
  const list = sidecar.deniedTools;
  if (!(
    Array.isArray(list) && list.every((tool) => typeof tool === "string")
  )) {
    return {
      kind: "unreadable",
      reason: `${SIDECAR}: deniedTools is not a list of tool names`,
    };
  }
  return {
    kind: "known",
    denials: { deniedTools: list },
  };
};

/** The policy write a welcome or delta began last: what a spawn waits on, and all it waits on. */
let writing: Promise<void> = Promise.resolve();

/** The last policy write's failure, in its words, until a write lands. */
let lastFailure: { at: number; reason: string } | undefined;

/** The sidecar's writes, one at a time: a delta's policy never lands inside a converge's write of the rest. */
let sidecarQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs `work`, a write of the sidecar, after every write of it before:
 * {@link applyFleetDenials}'s, and the converge's own (fleet.ts), which
 * keeps the denials the sidecar holds as it writes.
 */
export const sidecarTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const next = sidecarQueue.then(work, work);
  sidecarQueue = next.catch(() => undefined);
  return next;
};

/**
 * The fleet's denials, as a welcome or a delta carried them, into the
 * sidecar before the agent answers it; then the machine's own `claude`
 * follows the fleet at once (`permissions.deny` gains what the fleet now
 * denies, and drops what it denied before and no longer does). Throws in its
 * own words when the sidecar cannot be written: the agent refuses the delta
 * with them (NACK), and a spawn refuses with them too.
 */
export const applyFleetDenials = (
  deniedTools: readonly string[]
): Promise<void> => {
  const write = (async () => {
    let before: string[] = [];
    try {
      await sidecarTurn(async () => {
        const read = await readFleetDenials();
        before = read.kind === "known" ? machineDenyList(read.denials) : [];
        const file = Bun.file(SIDECAR);
        // A sidecar that does not parse holds nothing to keep: the converge
        // after this rewrites it whole, as it always has.
        const stored = (await file.exists())
          ? asRecord(await file.json().catch(() => undefined))
          : undefined;
        await writeStateFile(
          SIDECAR,
          JSON.stringify({ ...stored, deniedTools: [...deniedTools] }, null, 2)
        );
      });
    } catch (error) {
      const reason = `could not write ${SIDECAR}: ${said(error)}`;
      lastFailure = { at: Date.now(), reason };
      throw new Error(reason, { cause: error });
    }
    lastFailure = undefined;
    const settings = await convergeDeniedTools(before);
    if (settings.state === "failed" || settings.state === "unsynced") {
      console.warn(`[fleet] ${SETTINGS}: ${settings.detail}`);
    }
  })();
  writing = write.catch(() => undefined);
  return write;
};

/** A spawn refused because the fleet's denials are not known here, in words. */
class FleetDenialsRefused extends Error {
  constructor(reason: string) {
    super(`Not started: ${reason}.`);
    this.name = "FleetDenialsRefused";
  }
}

/**
 * The single source of truth for the fleet's denials. Both the spawn path
 * and the settings-convergence path read the sidecar through
 * {@link readFleetDenials}, so they read the same value and cannot drift.
 *
 * Waits only on a policy write already under way (a welcome that arrived
 * with the spawn behind it). A machine with no list after that, or whose
 * sidecar cannot be read, refuses at once with {@link FleetDenialsRefused}:
 * the hub marks a machine online only once it has written the list, so
 * none here is a fault, said in words that say which.
 */
const resolvedFleetDenials = async (): Promise<FleetDenials> => {
  await writing;
  const read = await readFleetDenials();
  switch (read.kind) {
    case "known":
      return read.denials;
    case "unsynced":
      throw new FleetDenialsRefused(
        lastFailure
          ? `${read.reason}: the policy the hub sent at ${clockWords(lastFailure.at)} could not be written (${lastFailure.reason})`
          : `${read.reason}: the hub marks a machine online only once it has written them, so this start reached the machine before the hub's welcome`
      );
    case "unreadable":
      throw new FleetDenialsRefused(read.reason);
    default:
      unhandled("read", read);
  }
};

/** What the machine's own `claude` is denied: the baseline, and the own-list set. */
const machineDenyList = ({ deniedTools }: FleetDenials): string[] => [
  ...new Set([...deniedTools, ...OWN_LIST_DENIED]),
];

/**
 * What the fleet denies a session being spawned: the baseline, the own-list
 * set, and the harness's own question tool (core `QUESTION_TOOL_DENIED`: a
 * session asks the person through CawCo's `ask`), which the machine's own
 * `claude` keeps. The spawn's own `denyTools` union on top, in each adapter.
 */
export const sessionFleetDenials = async (): Promise<string[]> => [
  ...new Set([
    ...machineDenyList(await resolvedFleetDenials()),
    ...QUESTION_TOOL_DENIED,
  ]),
];

/**
 * The settings with every `deny` name they did not already carry, and without
 * the `dropped` names the fleet no longer denies (what cawco wrote there
 * before), and whether that changed anything — `changed: false` is a caller
 * with nothing to write. Every other key, and every other rule, comes back
 * out exactly as it went in; only a `deny` that is not a list at all is
 * replaced, because nothing else can be appended to.
 */
function withDeniedTools(
  settings: unknown,
  deny: readonly string[],
  dropped: readonly string[] = []
): { changed: boolean; next: Record<string, unknown> } {
  const next = { ...(asRecord(settings) ?? {}) };
  const permissions = { ...(asRecord(next.permissions) ?? {}) };
  const current = Array.isArray(permissions.deny)
    ? (permissions.deny as unknown[])
    : [];
  const gone = new Set(dropped.filter((tool) => !deny.includes(tool)));
  const kept = current.filter(
    (tool) => !(typeof tool === "string" && gone.has(tool))
  );
  const missing = deny.filter((tool) => !kept.includes(tool));
  if (missing.length === 0 && kept.length === current.length) {
    return { changed: false, next };
  }

  permissions.deny = [...kept, ...missing];
  next.permissions = permissions;
  return { changed: true, next };
}

/** What a boot-time converge came to, so the daemon can say it in one line. */
export type DenyConvergence =
  | { state: "applied" | "unchanged" }
  | { state: "failed" | "unsynced"; detail: string };

/**
 * Converges `~/.claude/settings.json` with the machine's share of the fleet's
 * denials ({@link machineDenyList}), taking out `dropped`: the names cawco
 * wrote for the fleet before and the fleet no longer denies (a fleet sync
 * knows them; daemon start passes none). Writes only when that changes the
 * file. Nothing is written over a file that cannot
 * be parsed: the rest of it is the user's own, and a rewrite from an empty
 * root would take their settings with it. Nothing is written either while the
 * fleet's denials are not known here: `unsynced` until the first sync,
 * `failed` with the sidecar's own fault.
 */
export const convergeDeniedTools = async (
  dropped: readonly string[] = []
): Promise<DenyConvergence> => {
  try {
    const read = await readFleetDenials();
    if (read.kind !== "known") {
      return {
        state: read.kind === "unsynced" ? "unsynced" : "failed",
        detail: read.reason,
      };
    }
    const deny = machineDenyList(read.denials);

    const file = Bun.file(SETTINGS);
    let settings: unknown = {};
    if (await file.exists()) {
      try {
        settings = await file.json();
      } catch (error) {
        return {
          state: "failed",
          detail: `could not parse ${SETTINGS}: ${said(error)}`,
        };
      }
    }

    const { changed, next } = withDeniedTools(settings, deny, dropped);
    if (!changed) {
      return { state: "unchanged" };
    }

    // Written whole and moved into place: a half-written settings file is a
    // machine whose next `claude` starts with none of the user's settings.
    await writeStateFile(SETTINGS, JSON.stringify(next, null, 2));
    return { state: "applied" };
  } catch (error) {
    return {
      state: "failed",
      detail: `could not write ${SETTINGS}: ${said(error)}`,
    };
  }
};

/** One rule of an OpenCode 2.0 session's permission set. */
export interface OpencodeRule {
  action: string;
  effect: "allow" | "ask" | "deny";
  resource: string;
}

/**
 * OpenCode 2.0's denial of each tool a denied-tool list names (the fleet
 * baseline, a delegate type's, a spawn's), written in Claude's names: one
 * session rule per OpenCode action ({@link opencodeToolsFor}), `deny` over
 * every resource. 2.0 drops a tool so denied from the model's list (and from
 * Code Mode's catalog) and refuses a call to it (settled #9: "A rule
 * `{action, resource:"*", effect:"deny"}` drops the tool from the list
 * entirely"). Names OpenCode has no tool for are left out; the hub refuses
 * them on an OpenCode type.
 */
export const opencodeDenyRules = (deny: readonly string[]): OpencodeRule[] =>
  opencodeToolsFor(deny).tools.map((action) => ({
    action,
    resource: "*",
    effect: "deny",
  }));
