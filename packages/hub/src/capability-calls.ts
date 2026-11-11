/**
 * Which skills and MCP servers each role's sessions called, in a project or
 * in every project, over a window of days: per role and name, how many
 * sessions called it and when the last call was. The calls are the ones the
 * hub counts from every harness's frames (usage-count.ts), per session.
 *
 * A role is the session's delegate type (`instances.delegate_type`) when it
 * was started as one, else who started it (core `SessionOrigin`): `person`
 * for the sessions the person starts himself, `project` for one his
 * project's events reach, `check` for one another session started with
 * `start_session` or the hub's own workers, `delegate` for a delegate that
 * named no type.
 *
 * Asked for every project, it also names what is installed and no session
 * called: each skill and server a session in the window listed at its start
 * (`instances.commands`, `instances.tooling`), with the machines it was
 * listed on. pi lists neither, so its machines' installs are read from
 * their Claude Code and OpenCode sessions.
 */
import { type HarnessKind, machineLabel } from "@cawco/core";
import type { CapabilityKind } from "@cawco/core/suggest";
import { DAY_MS } from "@cawco/core/time";
import type { DbShape } from "./db";
import { mcpUsageName, SCORE_WINDOW_DAYS } from "./usage-count";

/** The window a count reads when none is asked: the starting-set spec's 30 days. */
export const CALLS_DEFAULT_DAYS = 30;
/** The longest window: the calls the hub keeps (usage-count.ts). */
export const CALLS_MAX_DAYS = SCORE_WINDOW_DAYS;

/** A skill or an MCP server: what a role's set lists. */
export type CalledKind = Exclude<CapabilityKind, "tool">;

/** One role's calls of one skill or server in the window. */
export interface RoleCalls {
  kind: CalledKind;
  /** Its last call, ms epoch. */
  lastAt: number;
  /** A skill's name, or a server's as its tools' `mcp__<server>__` prefix writes it. */
  name: string;
  role: string;
  /** How many of the role's sessions called it. */
  sessions: number;
}

/** A skill or server sessions listed in the window that no session called. */
export interface Uncalled {
  kind: CalledKind;
  /** The machines it was listed on, by label. */
  machines: string[];
  name: string;
}

export interface CapabilityCallsReport {
  days: number;
  /** Every machine that listed anything in the window: what {@link Uncalled.machines} is out of. */
  machines: string[];
  /** The project counted; null for every project. */
  project: { id: string; name: string } | null;
  /** One row per role and name, by role, then the most sessions first. */
  rows: RoleCalls[];
  /** How many sessions were counted, on each harness. */
  sessions: Partial<Record<HarnessKind, number>>;
  /** The window's start, ms epoch. */
  since: number;
  /** Every project only: what was installed and called by no session, by kind and name. */
  uncalled?: Uncalled[];
}

/** Why a count cannot be answered as asked. */
export class CapabilityCallsRefusal extends Error {}

/** The role a session's calls count under. */
const roleOf = (session: {
  delegateType: string | null;
  origin: string | null;
}): string => session.delegateType ?? session.origin ?? "person";

/** What sessions in the window listed, keyed by kind and name: the machines each was on. */
const installed = (
  db: DbShape,
  since: Date
): { listed: Map<string, Uncalled>; machines: Set<string> } => {
  const listed = new Map<string, Uncalled>();
  const machines = new Set<string>();
  const note = (kind: CalledKind, name: string, machine: string) => {
    const key = `${kind}:${name}`;
    const item = listed.get(key) ?? { kind, name, machines: [] };
    if (!item.machines.includes(machine)) {
      item.machines.push(machine);
    }
    listed.set(key, item);
  };
  for (const listing of db.capabilityCalls.listings(since)) {
    const skills = listing.commands?.skills ?? [];
    if (skills.length === 0 && listing.servers.length === 0) {
      continue;
    }
    const machine = machineLabel(listing.machine);
    machines.add(machine);
    for (const skill of skills) {
      note("skill", skill, machine);
    }
    for (const server of listing.servers) {
      note("mcp", mcpUsageName(server), machine);
    }
  }
  return { listed, machines };
};

/**
 * The count for `projectId` (undefined: every project, sessions in none
 * included) over the last `days` days.
 */
export const capabilityCalls = (
  db: DbShape,
  asked: { days?: number; projectId?: string },
  now = Date.now()
): CapabilityCallsReport => {
  const days = asked.days ?? CALLS_DEFAULT_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > CALLS_MAX_DAYS) {
    throw new CapabilityCallsRefusal(
      `days is ${days}: give a whole number of days from 1 to ${CALLS_MAX_DAYS}, the calls the hub keeps.`
    );
  }
  const project = asked.projectId ? db.project(asked.projectId) : undefined;
  if (asked.projectId && !project) {
    throw new CapabilityCallsRefusal(
      `${asked.projectId} is no project of this hub.`
    );
  }
  const since = now - days * DAY_MS;
  const calls = db.capabilityCalls
    .bySession(new Date(since))
    .filter((call) => !project || call.projectId === project.id);

  const rows = new Map<string, RoleCalls & { ids: Set<string> }>();
  const counted = new Map<string, HarnessKind | null>();
  for (const call of calls) {
    const kind = call.kind as CalledKind;
    const role = roleOf(call);
    const key = `${role}\u0000${kind}\u0000${call.name}`;
    const row = rows.get(key) ?? {
      role,
      kind,
      name: call.name,
      sessions: 0,
      lastAt: 0,
      ids: new Set<string>(),
    };
    row.ids.add(call.instanceId);
    row.sessions = row.ids.size;
    row.lastAt = Math.max(row.lastAt, call.lastAt.getTime());
    rows.set(key, row);
    counted.set(call.instanceId, call.harness);
  }

  const sessions: Partial<Record<HarnessKind, number>> = {};
  for (const harness of counted.values()) {
    if (harness) {
      sessions[harness] = (sessions[harness] ?? 0) + 1;
    }
  }

  const report: CapabilityCallsReport = {
    project: project ? { id: project.id, name: project.name } : null,
    days,
    since,
    sessions,
    machines: [],
    rows: [...rows.values()]
      .map(({ ids: _ids, ...row }) => row)
      .sort(
        (a, b) =>
          a.role.localeCompare(b.role) ||
          a.kind.localeCompare(b.kind) ||
          b.sessions - a.sessions ||
          a.name.localeCompare(b.name)
      ),
  };
  if (project) {
    return report;
  }
  const called = new Set(calls.map((call) => `${call.kind}:${call.name}`));
  const { listed, machines } = installed(db, new Date(since));
  return {
    ...report,
    machines: [...machines].sort(),
    uncalled: [...listed.entries()]
      .filter(([key]) => !called.has(key))
      .map(([, item]) => ({ ...item, machines: item.machines.sort() }))
      .sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
      ),
  };
};
