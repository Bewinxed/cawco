/**
 * Fleet-wide tool denials. The fleet baseline lives in the hub's
 * `supervisor_config.denied_tools` column and reaches every machine through
 * the normal fleet-sync path (`FleetConfig.deniedTools`). The sidecar
 * (`~/.claude/cawco-fleet.json`) caches the last-synced value so a machine
 * that loses its hub still has a policy.
 *
 * The fleet's "CawCo's to-dos" choice rides beside it (`FleetConfig.cawcoTodos`,
 * cached in the same sidecar) and is never names in the list: while it is
 * on, {@link cawcoTodosDenied} is added.
 *
 * A machine that has not heard the list, or cannot read the sidecar, spawns
 * nothing until it can: no compiled list stands in for the fleet's.
 *
 * Two consumers read the resolved denials:
 *  1. The spawn paths (`claude.ts`, `opencode.ts`), through
 *     {@link sessionFleetDenials}: the baseline, plus the to-do and plan-mode
 *     set when the fleet's choice or the session's own (its delegate type's)
 *     is on.
 *  2. `convergeDeniedTools`, which writes the machine's share (the baseline,
 *     plus the set while the fleet's choice is on) into
 *     `~/.claude/settings.json` so the user's own `claude` sees the same
 *     denials — at daemon start, and again on every fleet sync.
 *
 * Both read {@link resolvedFleetDenials} — the single source — so they cannot
 * drift from each other.
 */
import { cawcoTodosDenied, opencodeToolsFor } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { userLayerPath } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** Every `claude` this user starts reads it, daemon-spawned or not. */
const SETTINGS = userLayerPath("settings.json");

/** The sidecar the fleet sync writes after every converge. */
const SIDECAR = userLayerPath("cawco-fleet.json");

/**
 * How long a spawn on a machine that has not heard the fleet's denials waits
 * for its first sync. The hub sends one on every register, so a spawn that
 * reaches a just-connected daemon finds it a moment later.
 */
const FIRST_SYNC_WAIT_MS = 30_000;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** The fleet's denials as this machine last heard them. */
export interface FleetDenials {
  /** The fleet's "CawCo's to-dos" choice. */
  cawcoTodos: boolean;
  /** The baseline. */
  deniedTools: readonly string[];
}

/**
 * What the sidecar says of the fleet's denials: the list and the choice, or
 * that this machine has not heard them yet (no sidecar, or one written before
 * a sync carried `deniedTools`), or why the sidecar cannot be read.
 */
export type FleetDenialsRead =
  | { kind: "known"; denials: FleetDenials }
  | { kind: "unsynced"; reason: string }
  | { kind: "unreadable"; reason: string };

const UNSYNCED = `this machine has not had its first fleet sync, so it does not know the fleet's denied tools yet (${SIDECAR})`;

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
    denials: { deniedTools: list, cawcoTodos: sidecar.cawcoTodos === true },
  };
};

/** Settled by the first fleet sync this daemon writes the sidecar in. */
let markSynced: () => void = () => undefined;
const firstSync = new Promise<void>((resolve) => {
  markSynced = resolve;
});

/** Called by the fleet sync once the sidecar it wrote carries the denials. */
export const fleetDenialsSynced = (): void => markSynced();

/** A spawn refused because the fleet's denials are not known here, in words. */
export class FleetDenialsRefused extends Error {
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
 * A machine that has not heard them waits for its first sync (the hub sends
 * one on register) and says so; one that has not had it within
 * {@link FIRST_SYNC_WAIT_MS}, or whose sidecar cannot be read, refuses with
 * {@link FleetDenialsRefused}.
 */
export const resolvedFleetDenials = async (): Promise<FleetDenials> => {
  let read = await readFleetDenials();
  if (read.kind === "unsynced") {
    console.info(
      `[fleet] ${read.reason}: the spawn waits for its first fleet sync`
    );
    await readWithin(FIRST_SYNC_WAIT_MS, () => firstSync);
    read = await readFleetDenials();
  }
  switch (read.kind) {
    case "known":
      return read.denials;
    case "unsynced":
      throw new FleetDenialsRefused(
        `${read.reason}, and none came within ${FIRST_SYNC_WAIT_MS / 1000}s`
      );
    case "unreadable":
      throw new FleetDenialsRefused(read.reason);
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** What the machine's own `claude` is denied: the baseline, and the to-do and plan-mode set while the fleet's choice is on. */
export const machineDenyList = ({
  deniedTools,
  cawcoTodos,
}: FleetDenials): string[] => [
  ...new Set([...deniedTools, ...cawcoTodosDenied(cawcoTodos)]),
];

/**
 * What the fleet denies a session being spawned: the baseline, and the to-do
 * and plan-mode set when the fleet's choice or the session's own (`cawcoTodos`
 * on its spawn, from its delegate type) is on. The spawn's own `denyTools`
 * union on top, in each adapter.
 */
export const sessionFleetDenials = async (
  cawcoTodos: boolean | undefined
): Promise<string[]> => {
  const fleet = await resolvedFleetDenials();
  return [
    ...new Set([
      ...fleet.deniedTools,
      ...cawcoTodosDenied(fleet.cawcoTodos || cawcoTodos === true),
    ]),
  ];
};

/**
 * The settings with every `deny` name they did not already carry, and without
 * the `dropped` names the fleet no longer denies (what cawco wrote there
 * before), and whether that changed anything — `changed: false` is a caller
 * with nothing to write. Every other key, and every other rule, comes back
 * out exactly as it went in; only a `deny` that is not a list at all is
 * replaced, because nothing else can be appended to.
 */
export function withDeniedTools(
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
