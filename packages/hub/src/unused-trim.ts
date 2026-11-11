/**
 * The unused skills and servers routine (tsk-329 stories 14–19, 21, 23, 24):
 * a routine of the hub's own, as the memory curator is (routines.ts, target
 * `trim`), that proposes trimmed starting sets and changes none itself.
 *
 * - **Offered.** Caw suggests it at the foot of a project's Routines ledger
 *   until the person answers: Turn on makes the routine, Not now waves the
 *   suggestion away, and either is kept (db `trim_offers`), so it is never
 *   suggested there again. The fleet switch (Configure › Skills) turns it on
 *   in every project and adds the fleet-level run, a routine in no project.
 * - **A run** is code, then one call. The hub reads the count
 *   (capability-calls.ts) over {@link TRIM_DAYS} days and compares it with
 *   each starting set the project's sessions take: the project's own
 *   (project-starting-set.ts), against the calls of the roles that take it
 *   (every role but a delegate type with a set of its own), and each fleet
 *   delegate type's set, against that type's calls in every project, since
 *   the type is the fleet's. A set none of whose sessions ran in the window
 *   is left alone: no count speaks for it. Nothing to propose ends the run
 *   with that said, no model asked; else a delegate in the `trimmer` role
 *   calls `trim_propose` ({@link createTrim}'s `propose`), which puts each
 *   set without its uncalled items to the person through that set's own
 *   write: `project_settings` for the project's set, the delegate type's
 *   `admin_delegate_types_write` for a type's, each the hub's one ask
 *   (asks.ts), in Needs you and at the run's session. The approval draws
 *   what leaves the set as a table of the count's rows (core
 *   permission-presentation.ts `unlisted`, fed by {@link createTrim}'s
 *   `standing`). A set with a proposal still open is not proposed again.
 * - **The fleet-level run** proposes turning off each fleet skill and
 *   fleet-wide MCP server that every machine listed and no session of any
 *   project called (`admin_skills_write` disable, `admin_mcp_servers_write`
 *   put with `enabled: false`), names what is installed outside the fleet
 *   and so not CawCo's to turn off, and names a skill installed twice under
 *   two names (`writing-for-agents` and `mattpocock-skills:writing-for-agents`).
 * - **Rejected stays listed.** A trimmer's ask the person denies records
 *   what it would have taken out, by set (db `trim_kept`), and no later run
 *   proposes those items for that set ({@link createTrim}'s `declined`).
 *
 * Nothing here unlists by itself, uninstalls anything, or touches a type
 * defined in a project's own `delegates/*.md`, which cannot name a set yet.
 */
import {
  type DelegateType,
  type InstanceRow,
  type SetOwner,
  type SetStanding,
  type StartingSet,
  startingSetProblem,
  type UnlistedRow,
} from "@cawco/core";
import { type AskRecord, PROJECT_SETTINGS } from "@cawco/core/asks";
import { routinesWords } from "@cawco/core/words/routines";
import {
  CALLS_DEFAULT_DAYS,
  CALLS_MAX_DAYS,
  type CapabilityCallsReport,
  type RoleCalls,
} from "./capability-calls";
import type { DbShape } from "./db";
import type { KeptItem } from "./db/trim";
import type { DelegateTypesShape } from "./delegate-types";
import { mcpUsageName } from "./usage-count";

/** The window a run reads: "nobody has called in 30 days". */
const TRIM_DAYS = CALLS_DEFAULT_DAYS;

/** The routine's name, as Caw suggests it and its row says it. */
export const TRIM_NAME = routinesWords.trimName;
/** Its schedule: Mondays at 09:00, in the hub's zone. */
export const TRIM_CRON = "0 9 * * 1";

/** The tool a trimmer run calls once: the hub puts its proposals to the person. */
export const TRIM_PROPOSE = "trim_propose";

const DELEGATE_TYPES_WRITE = "admin_delegate_types_write";
const SKILLS_WRITE = "admin_skills_write";
const MCP_SERVERS_WRITE = "admin_mcp_servers_write";

/** What each run does, before the hub's own findings: the routine's prompt. */
export const TRIM_PROMPT = `You run the unused skills and servers routine. The hub has compared what sessions called over the last ${TRIM_DAYS} days with each starting set; its findings follow. Call ${TRIM_PROPOSE} once: it puts each trimmed set to the person through that set's own approval, and nothing changes until they approve. Then call finish_item with the headline it answers, word for word.`;

/** Whose set a proposal changes, as the hub keys it. */
type Owner =
  { kind: "project"; projectId: string } | { kind: "type"; name: string };

/** One set's proposal: what it lists now and what it would list. */
interface SetProposal {
  label: string;
  leaving: KeptItem[];
  owner: Owner;
  proposed: StartingSet;
}

/** What the fleet-level run found. */
interface FleetFindings {
  /** Fleet skills and servers to propose turning off. */
  off: KeptItem[];
  /** Installed on every machine and called by no project, outside the fleet's own: not CawCo's to turn off. */
  outside: KeptItem[];
  /** Skills installed twice under two names, each group's names. */
  twice: string[][];
}

/** A run's findings: the sets to propose, or why there are none. */
export type TrimFindings =
  | { kind: "none"; said: string }
  | { kind: "project"; sets: SetProposal[] }
  | { kind: "fleet"; found: FleetFindings };

/** The kept-items key of a set (db `trim_kept`). */
const keyOf = (owner: Owner | "fleet"): string => {
  if (owner === "fleet") {
    return "fleet";
  }
  return owner.kind === "project"
    ? `project:${owner.projectId}`
    : `type:${owner.name}`;
};

const itemKey = (item: KeptItem): string => `${item.kind}\u0000${item.name}`;

/** A count row's kind as a set names it. */
const kindOf = (row: Pick<RoleCalls, "kind">): KeptItem["kind"] =>
  row.kind === "mcp" ? "server" : "skill";

/** `n` items, in words. */
const items = (count: number): string =>
  `${count} ${count === 1 ? "item" : "items"}`;

const listed = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export interface TrimDeps {
  /** Records `name(input)` as the person's ask of `actor` (asks.ts `ask`); undefined in Full Send. */
  readonly askAdmin: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>,
    toolUseId: string | undefined
  ) => Promise<string | undefined>;
  /** Asks the person to set the project's starting set, through `project_settings` with `ask: true`. */
  readonly askProjectSet: (
    actor: InstanceRow,
    set: StartingSet,
    reason: string,
    toolUseId: string | undefined
  ) => Promise<string>;
  /** The count of calls (capability-calls.ts) for a project or every one. */
  readonly calls: (asked: {
    days: number;
    projectId?: string;
  }) => CapabilityCallsReport;
  readonly db: Pick<
    DbShape,
    | "asks"
    | "fleetConfig"
    | "getInstancesByIds"
    | "getMcpServer"
    | "listSkills"
    | "project"
    | "trim"
  >;
  /** The project's own starting set (project-starting-set.ts); null for none. */
  readonly projectSet: (projectId: string) => StartingSet | null;
  readonly types: Pick<DelegateTypesShape, "get" | "list">;
}

export const createTrim = (deps: TrimDeps) => {
  const { db, types } = deps;

  /** The fleet types that name a set of their own. */
  const typesWithSets = (): (DelegateType & { startingSet: StartingSet })[] =>
    types
      .list()
      .filter(
        (type): type is DelegateType & { startingSet: StartingSet } =>
          !!type.startingSet
      );

  const setOf = (owner: Owner): StartingSet | null =>
    owner.kind === "project"
      ? deps.projectSet(owner.projectId)
      : (types.get(owner.name)?.startingSet ?? null);

  const labelOf = (owner: Owner): string => {
    if (owner.kind === "type") {
      return routinesWords.typeSet(owner.name);
    }
    return routinesWords.projectSet(
      db.project(owner.projectId)?.name ?? owner.projectId
    );
  };

  /**
   * The count's rows of the roles that take `owner`'s set: a project's own
   * set is every role's but a type with a set of its own; a type's set its
   * own role's, in every project.
   */
  const rowsOf = (owner: Owner, days = TRIM_DAYS): RoleCalls[] => {
    if (owner.kind === "type") {
      return deps.calls({ days }).rows.filter((row) => row.role === owner.name);
    }
    const own = new Set(typesWithSets().map((type) => type.name));
    return deps
      .calls({ days, projectId: owner.projectId })
      .rows.filter((row) => !own.has(row.role));
  };

  /**
   * `set`'s items its sessions called, by the set's own names: a server is
   * named by its fleet name in a set and by its tools' prefix in the count.
   */
  const callsOf = (
    set: StartingSet,
    rows: RoleCalls[]
  ): (UnlistedRow & { lastAt: number })[] => {
    const called = new Map<string, { lastAt: number; sessions: number }>();
    for (const row of rows) {
      const key = itemKey({ kind: kindOf(row), name: row.name });
      const was = called.get(key);
      called.set(key, {
        lastAt: Math.max(was?.lastAt ?? 0, row.lastAt),
        // A session counts under one role, so the roles' sessions add up.
        sessions: (was?.sessions ?? 0) + row.sessions,
      });
    }
    const out: (UnlistedRow & { lastAt: number })[] = [];
    const add = (kind: KeptItem["kind"], name: string, counted: string) => {
      const found = called.get(itemKey({ kind, name: counted }));
      if (found) {
        out.push({ kind, name, ...found });
      }
    };
    for (const name of set.skills) {
      add("skill", name, name);
    }
    for (const name of set.servers) {
      add("server", name, mcpUsageName(name));
    }
    return out;
  };

  /**
   * A set as it stands and its sessions' calls: what an approval draws
   * against (core `SetStanding`). Over every day the hub keeps, so an item
   * a run proposes (no call in {@link TRIM_DAYS} days) still says when it
   * was last called before them.
   */
  const standingOf = (owner: Owner): SetStanding => {
    const set = setOf(owner);
    return {
      set,
      label: labelOf(owner),
      days: CALLS_MAX_DAYS,
      calls: set ? callsOf(set, rowsOf(owner, CALLS_MAX_DAYS)) : [],
    };
  };

  /** Approve asks still open, with the project of the session that asked. */
  const openApprovals = (): {
    input: Record<string, unknown>;
    projectId: string | null;
    tool: string;
  }[] =>
    db.asks.open().flatMap((ask: AskRecord) =>
      ask.asked.kind === "approve"
        ? [
            {
              tool: ask.asked.tool,
              input: ask.asked.input,
              projectId:
                db.getInstancesByIds([ask.instanceId])[0]?.projectId ?? null,
            },
          ]
        : []
    );

  /** Whether a change to `owner`'s set already waits on the person. */
  const waiting = (owner: Owner | "fleet", item?: KeptItem): boolean =>
    openApprovals().some(({ tool, input, projectId }) => {
      if (owner === "fleet") {
        return (
          (tool === SKILLS_WRITE || tool === MCP_SERVERS_WRITE) &&
          input.name === item?.name
        );
      }
      if (owner.kind === "type") {
        return (
          tool === DELEGATE_TYPES_WRITE &&
          input.name === owner.name &&
          input.startingSet !== undefined
        );
      }
      return (
        tool === PROJECT_SETTINGS &&
        projectId === owner.projectId &&
        Array.isArray(input.changes) &&
        input.changes.some(
          (change: { kind?: unknown }) => change.kind === "set_starting_set"
        )
      );
    });

  /** `owner`'s set without what its sessions never called and the person never kept; undefined when nothing leaves. */
  const proposalOf = (owner: Owner): SetProposal | undefined => {
    const set = setOf(owner);
    if (!set || waiting(owner)) {
      return;
    }
    const rows = rowsOf(owner);
    // No session of the set ran in the window: no count speaks for it.
    if (rows.length === 0) {
      return;
    }
    const called = new Set(callsOf(set, rows).map((row) => itemKey(row)));
    const kept = new Set(db.trim.kept(keyOf(owner)).map(itemKey));
    const stays = (item: KeptItem) =>
      called.has(itemKey(item)) || kept.has(itemKey(item));
    const leaving = [
      ...set.skills.map((name) => ({ kind: "skill" as const, name })),
      ...set.servers.map((name) => ({ kind: "server" as const, name })),
    ].filter((item) => !stays(item));
    if (leaving.length === 0) {
      return;
    }
    const gone = new Set(leaving.map(itemKey));
    return {
      owner,
      label: labelOf(owner),
      leaving,
      proposed: {
        skills: set.skills.filter(
          (name) => !gone.has(itemKey({ kind: "skill", name }))
        ),
        servers: set.servers.filter(
          (name) => !gone.has(itemKey({ kind: "server", name }))
        ),
      },
    };
  };

  /** Skills listed under two names for one skill: `x` and `plugin:x`, or two plugins' `x`. */
  const twiceOf = (report: CapabilityCallsReport): string[][] => {
    const names = new Set([
      ...report.rows
        .filter((row) => row.kind === "skill")
        .map((row) => row.name),
      ...(report.uncalled ?? [])
        .filter((item) => item.kind === "skill")
        .map((item) => item.name),
    ]);
    const byBase = new Map<string, string[]>();
    for (const name of names) {
      const base = name.split(":").at(-1) ?? name;
      byBase.set(base, [...(byBase.get(base) ?? []), name]);
    }
    return [...byBase.values()]
      .filter((group) => group.length > 1)
      .map((group) => group.sort());
  };

  /** What the fleet-level run finds over every project. */
  const fleetFindings = (): FleetFindings => {
    const report = deps.calls({ days: TRIM_DAYS });
    const everywhere = (report.uncalled ?? []).filter(
      (item) =>
        report.machines.length > 0 &&
        item.machines.length === report.machines.length
    );
    const kept = new Set(db.trim.kept(keyOf("fleet")).map(itemKey));
    const skills = new Map(
      db
        .listSkills()
        .filter((skill) => skill.enabled && !skill.projectId)
        .map((skill) => [skill.name, skill])
    );
    const servers = new Map(
      db
        .fleetConfig()
        .mcp.filter((server) => server.enabled !== false && !server.projectId)
        .map((server) => [mcpUsageName(server.name), server.name])
    );
    const skillNamed = (name: string) => (skills.has(name) ? name : undefined);
    const off: KeptItem[] = [];
    const outside: KeptItem[] = [];
    for (const item of everywhere) {
      const own =
        item.kind === "mcp" ? servers.get(item.name) : skillNamed(item.name);
      const kind = kindOf(item);
      if (!own) {
        outside.push({ kind, name: item.name });
        continue;
      }
      const found = { kind, name: own };
      if (!(kept.has(itemKey(found)) || waiting("fleet", found))) {
        off.push(found);
      }
    }
    return { off, outside, twice: twiceOf(report) };
  };

  /** What a run of the routine in `projectId` (null: the fleet-level run) finds now. */
  const findings = (projectId: string | null): TrimFindings => {
    if (projectId === null) {
      const found = fleetFindings();
      return found.off.length === 0 && found.twice.length === 0
        ? { kind: "none", said: fleetNothing(found) }
        : { kind: "fleet", found };
    }
    const owners: Owner[] = [
      { kind: "project", projectId },
      ...typesWithSets().map((type) => ({
        kind: "type" as const,
        name: type.name,
      })),
    ];
    const sets = owners.flatMap((owner) => proposalOf(owner) ?? []);
    if (sets.length > 0) {
      return { kind: "project", sets };
    }
    const anySet = owners.some((owner) => setOf(owner) !== null);
    return {
      kind: "none",
      said: anySet
        ? `Found nothing to unlist: every item in this project's starting sets was called in the last ${TRIM_DAYS} days, kept by you, or already waits on you.`
        : "Found nothing to unlist: neither this project nor a delegate type names a starting set, so its sessions start with everything installed.",
    };
  };

  /** The fleet-level run's words when it proposes nothing. */
  const fleetNothing = (found: FleetFindings): string =>
    [
      `Found nothing to turn off: every fleet skill and server on every machine was called in the last ${TRIM_DAYS} days, kept by you, or already waits on you.`,
      outsideWords(found),
    ]
      .filter(Boolean)
      .join(" ");

  const outsideWords = (found: FleetFindings): string =>
    found.outside.length === 0
      ? ""
      : `Installed on every machine outside the fleet's own, and called by no project: ${listed(found.outside.map((item) => item.name))}.`;

  const twiceWords = (found: FleetFindings): string =>
    found.twice
      .map(
        (group) =>
          `${group[0]?.split(":").at(-1)} is installed twice, as ${listed(group)}.`
      )
      .join(" ");

  /** The brief a trimmer run reads after the routine's prompt. */
  const briefOf = (found: Exclude<TrimFindings, { kind: "none" }>): string => {
    if (found.kind === "project") {
      return `\n\n## What the hub found\n\n${found.sets
        .map(
          (set) =>
            `- ${set.label}: ${items(set.leaving.length)} no session of it called (${listed(set.leaving.map((item) => item.name))}).`
        )
        .join("\n")}`;
    }
    return `\n\n## What the hub found\n\n${[
      found.found.off.length > 0
        ? `- Installed on every machine and called by no project: ${listed(found.found.off.map((item) => item.name))}.`
        : "",
      found.found.twice.length > 0 ? `- ${twiceWords(found.found)}` : "",
    ]
      .filter(Boolean)
      .join("\n")}`;
  };

  /** A type's put, as `admin_delegate_types_write` takes it, with `startingSet` set. */
  const typePut = (
    type: DelegateType,
    startingSet: StartingSet,
    reason: string
  ): Record<string, unknown> => ({
    action: "put",
    reason,
    name: type.name,
    description: type.description,
    harness: type.harness,
    model: type.model,
    ...(type.effort ? { effort: type.effort } : {}),
    ...(type.skills ? { skills: type.skills } : {}),
    ...(type.denyTools ? { denyTools: type.denyTools } : {}),
    ...(type.mayStart ? { mayStart: type.mayStart } : {}),
    ...(type.connections ? { connections: type.connections } : {}),
    ...(type.account ? { account: type.account } : {}),
    startingSet,
  });

  /** One set's proposal, put to the person through its own write: the line its headline names it by. */
  const proposeSet = async (
    actor: InstanceRow,
    set: SetProposal,
    toolUseId: string | undefined
  ): Promise<string | undefined> => {
    if (startingSetProblem(set.proposed)) {
      return;
    }
    const reason = `Its sessions called none of these in the last ${TRIM_DAYS} days; each stays installed.`;
    if (set.owner.kind === "project") {
      await deps.askProjectSet(actor, set.proposed, reason, toolUseId);
    } else {
      const type = types.get(set.owner.name);
      if (!type) {
        return;
      }
      await deps.askAdmin(
        actor,
        DELEGATE_TYPES_WRITE,
        typePut(type, set.proposed, reason),
        toolUseId
      );
    }
    return `${items(set.leaving.length)} from ${set.label}`;
  };

  /** One fleet skill or server, put to the person to turn off. */
  const proposeOff = async (
    actor: InstanceRow,
    item: KeptItem,
    toolUseId: string | undefined
  ): Promise<void> => {
    const reason = `No project's sessions called it in the last ${TRIM_DAYS} days, and every machine has it.`;
    if (item.kind === "skill") {
      await deps.askAdmin(
        actor,
        SKILLS_WRITE,
        { action: "disable", name: item.name, reason },
        toolUseId
      );
      return;
    }
    const row = db.getMcpServer(item.name);
    if (row) {
      await deps.askAdmin(
        actor,
        MCP_SERVERS_WRITE,
        {
          action: "put",
          name: item.name,
          config: row.config,
          enabled: false,
          ...(row.platforms ? { platforms: row.platforms } : {}),
          reason,
        },
        toolUseId
      );
    }
  };

  /**
   * `trim_propose`: the run's findings, worked out again now, each put to
   * the person through its set's own write. Answers the headline the run
   * finishes with.
   */
  const propose = async (
    actor: InstanceRow,
    toolUseId: string | undefined
  ): Promise<string> => {
    if (actor.role !== "trimmer") {
      throw new Error(
        `${TRIM_PROPOSE} belongs to a run of the unused skills and servers routine.`
      );
    }
    const found = findings(actor.projectId ?? null);
    if (found.kind === "none") {
      return found.said;
    }
    if (found.kind === "project") {
      const lines: string[] = [];
      for (const set of found.sets) {
        const line = await proposeSet(actor, set, toolUseId);
        if (line) {
          lines.push(line);
        }
      }
      return lines.length > 0
        ? `Proposed unlisting ${listed(lines)}. Each waits on you in Needs you.`
        : "Proposed nothing: no trimmed set read as a starting set.";
    }
    return await proposeFleet(actor, found.found, toolUseId);
  };

  /** The fleet-level run's: each fleet item to turn off put to the person; the headline names them, and what is installed twice or outside the fleet. */
  const proposeFleet = async (
    actor: InstanceRow,
    found: FleetFindings,
    toolUseId: string | undefined
  ): Promise<string> => {
    const { off } = found;
    for (const item of off) {
      await proposeOff(actor, item, toolUseId);
    }
    return [
      off.length > 0
        ? `Proposed turning off ${items(off.length)} that every machine has and no project called: ${listed(off.map((item) => item.name))}. Each waits on you in Needs you.`
        : "",
      twiceWords(found),
      outsideWords(found),
    ]
      .filter(Boolean)
      .join(" ");
  };

  /**
   * A trimmer's ask the person denied (asks.ts `declined`): what it would
   * have taken out is kept, by set, so no later run proposes it there.
   */
  const declined = (
    name: string,
    input: Record<string, unknown>,
    asker: InstanceRow
  ): void => {
    if (asker.role !== "trimmer") {
      return;
    }
    const leavingOf = (
      before: StartingSet | null,
      after: StartingSet | undefined
    ): KeptItem[] =>
      before && after
        ? [
            ...before.skills
              .filter((each) => !after.skills.includes(each))
              .map((each) => ({ kind: "skill" as const, name: each })),
            ...before.servers
              .filter((each) => !after.servers.includes(each))
              .map((each) => ({ kind: "server" as const, name: each })),
          ]
        : [];
    if (name === PROJECT_SETTINGS && asker.projectId) {
      const changes = Array.isArray(input.changes) ? input.changes : [];
      const change = changes.find(
        (each: { kind?: unknown }) => each.kind === "set_starting_set"
      ) as { startingSet?: StartingSet | null } | undefined;
      const owner: Owner = { kind: "project", projectId: asker.projectId };
      db.trim.keep(
        keyOf(owner),
        leavingOf(setOf(owner), change?.startingSet ?? undefined)
      );
      return;
    }
    if (name === DELEGATE_TYPES_WRITE && typeof input.name === "string") {
      const owner: Owner = { kind: "type", name: input.name };
      db.trim.keep(
        keyOf(owner),
        leavingOf(setOf(owner), input.startingSet as StartingSet | undefined)
      );
      return;
    }
    if (typeof input.name !== "string") {
      return;
    }
    if (name === SKILLS_WRITE && input.action === "disable") {
      db.trim.keep(keyOf("fleet"), [{ kind: "skill", name: input.name }]);
    } else if (name === MCP_SERVERS_WRITE && input.enabled === false) {
      db.trim.keep(keyOf("fleet"), [{ kind: "server", name: input.name }]);
    }
  };

  /**
   * A set as an approval draws it (core `PresentationContext.startingSet`),
   * for a session in `projectId`: the project's own, or a fleet type's.
   */
  const standing = (
    owner: SetOwner,
    projectId: string | null
  ): SetStanding | undefined => {
    if (owner.kind === "type") {
      return types.get(owner.name) ? standingOf(owner) : undefined;
    }
    return projectId ? standingOf({ kind: "project", projectId }) : undefined;
  };

  return {
    /** The brief a run reads, or why it ends at once with nothing to propose. */
    brief: (
      projectId: string | null
    ): { kind: "none"; said: string } | { kind: "run"; text: string } => {
      const found = findings(projectId);
      return found.kind === "none"
        ? found
        : { kind: "run", text: briefOf(found) };
    },
    declined,
    propose,
    standing,
  };
};
