/**
 * Every way the fleet can be broken, in one vocabulary.
 *
 * This file exists because of one badge. A sync failed on a MacBook and the
 * dashboard showed a single string — `error: unknown option '--scope'` — and
 * that string was hiding three separate faults: a stale `claude` binary
 * shadowing a newer one on the same machine, a `gh` with dead tokens making the
 * CLI fall back to ssh for a public repository, and whole sections of the
 * machine's report being dropped in transit so hook and memory failures were
 * invisible fleet-wide. None of that was legible without a terminal.
 *
 * So faults are modelled rather than printed. Two things follow:
 *
 *  - A fault has an ORIGIN. A row the hub could not fetch (`FleetSkillMeta.error`,
 *    `FleetPlugin.error` while no machine has installed that plugin from its own
 *    marketplace) never reached any machine and is fixed at the hub; a
 *    row a machine would not apply (`FleetItemState.state === 'failed'`) reached
 *    it and was refused there. They look alike in a log and have nothing in
 *    common as problems, so they never share a badge here.
 *  - A fault has a CAUSE, read off what the machine or the hub actually said.
 *    Every pattern below is matched against a string this repository is known to
 *    produce; the producer is named in each case's comment. Anything unmatched
 *    keeps its raw text and says so, rather than being guessed at.
 */
import type {
  FleetItemState,
  FleetPlugin,
  FleetSkillMeta,
  FleetSyncReport,
  HarnessKind,
} from "@cawco/core";

/** Which fleet panel a fault belongs to — the key its report is stored under. */
export type FaultScope =
  | "mcp"
  | "marketplaces"
  | "plugins"
  | "skills"
  | "memory"
  | "memoryDocs"
  | "memoryHook"
  | "hooks";

/** The named causes. `unknown` is not a failure of this table — it is a fault we refuse to guess at. */
export type FaultCause =
  | "auth-discovery"
  | "needs-auth"
  | "unsupported"
  | "cli-too-old"
  | "cli-missing"
  | "ssh-refused"
  | "marketplace-unlinked"
  | "drifted"
  | "absent"
  | "unparsable"
  | "unwritable"
  | "timed-out"
  | "no-checkout"
  | "missing-bytes"
  | "unsafe-path"
  | "unfetchable"
  | "unknown";

/**
 * What a cause means and what to do about it, in the operator's language.
 *
 * `fix` is the sentence under the raw output; `action` names the affordance
 * that is offered beside it, so the page never shows a remedy it does not also
 * provide a button for — or offers a button whose effect it has not said.
 */
export interface CauseCopy {
  /**
   * Which affordance answers it:
   * - `resync` — ask this machine to converge again.
   * - `refresh` — re-resolve the row at the hub, so the machines are handed bytes.
   * - `settle` — a human decision between two copies (adopt or overwrite).
   * - `none` — nothing the dashboard can press; the fix is off-dashboard.
   */
  action: "resync" | "refresh" | "settle" | "none";
  /** What resolves it. */
  fix: string;
  /** A title that names the fault, never the error text. */
  title: string;
  /** Set when the fault is about the `claude` binary, so the toolchain is worth showing. */
  toolchain?: true;
  /** Why this happened, in one sentence. */
  why: string;
}

export const CAUSE: Record<FaultCause, CauseCopy> = {
  "auth-discovery": {
    title: "The hub could not read this server’s authorization",
    why: "The server or its authorization metadata did not answer discovery.",
    fix: "Check this server’s URL, then save it again to retry discovery. Its connection starts once discovery succeeds.",
    action: "none",
  },
  "needs-auth": {
    title: "This server needs sign-in",
    why: "The fleet has no usable sign-in for this server.",
    fix: "Open this server and sign in. Every supported agent can use it once approval finishes on the selected computer.",
    action: "none",
  },
  unsupported: {
    title: "This agent has no MCP support",
    why: "pi cannot call MCP servers.",
    fix: "Use Claude Code or OpenCode for this server.",
    action: "none",
  },
  // `runClaude`'s output for a flag the CLI does not have. The real one:
  // `claude plugin install … --scope user` against a 2.0.x CLI.
  "cli-too-old": {
    title: "The claude CLI on this machine is too old",
    why: "The command CawCo ran uses an option this machine’s claude does not have, so the install never started.",
    fix: "Check which claude this machine resolves first — a newer one installed elsewhere is no help while a stale binary comes earlier on PATH. Update or unshadow it, then sync this machine again.",
    action: "resync",
    toolchain: true,
  },
  // agent/fleet.ts syncPlugins: `claude CLI not found`.
  "cli-missing": {
    title: "No claude CLI on this machine",
    why: "Marketplaces and plugins are registered through the claude CLI, and this machine has none on any path CawCo can see.",
    fix: "Install Claude Code on this machine, then sync it again.",
    action: "resync",
    toolchain: true,
  },
  // agent/fleet.ts SSH_REFUSED — the same three sentences, matched here so the
  // dashboard can say what that code already knows.
  "ssh-refused": {
    title: "Git fell back to ssh and had nothing to authenticate with",
    why: "The repository is public, but the plugin manifest names an ssh remote, and this machine’s git had no key or token it would accept — an expired gh login does exactly this.",
    fix: "The fleet does not need this machine to reach github at all: refresh the row at the hub and the bytes are carried to every machine instead. Fixing the machine’s gh login also works.",
    action: "refresh",
  },
  // agent/fleet.ts syncPlugins: `marketplace ${marketplace} is not linked`.
  "marketplace-unlinked": {
    title: "Its marketplace is not linked on this machine",
    why: "A plugin is installed out of a marketplace, and the one this plugin’s id names never linked here — the marketplace’s own row says why.",
    fix: "Resolve the marketplace failure first; this plugin follows it.",
    action: "none",
  },
  // agent/fleet.ts DRIFTED — `edited on this machine — adopt it or overwrite`.
  drifted: {
    title: "This machine edited its own copy",
    why: "CawCo only ever takes back the copy it wrote. Somebody changed this one on the machine itself, so it was left exactly where it is.",
    fix: "Decide which copy wins: adopt this machine’s into the fleet, or overwrite it with the fleet’s.",
    action: "settle",
  },
  // The `not in …` / `not on disk` family from `fleetStatus`: a passive read
  // finding that what the sidecar claims is no longer there.
  absent: {
    title: "What CawCo wrote is no longer there",
    why: "The last sync recorded writing this, and a later read could not find it — something on the machine removed or replaced it.",
    fix: "Sync this machine and it is written again.",
    action: "resync",
  },
  unparsable: {
    title: "A config file on this machine could not be read",
    why: "CawCo will not overwrite a file it cannot parse, so nothing that file holds was converged.",
    fix: "Repair the JSON named in the output on that machine, then sync it again.",
    action: "resync",
  },
  unwritable: {
    title: "A config file on this machine could not be written",
    why: "The file was read, and the write back failed — permissions, a full disk, or a read-only home.",
    fix: "Fix the write on that machine, then sync it again.",
    action: "resync",
  },
  "timed-out": {
    title: "The command never finished",
    why: "A clone or an install ran past the time a sync will hold open for it, and was killed rather than left running.",
    fix: "Usually a slow or blocked network on that machine. Sync it again once it can reach the source.",
    action: "resync",
  },
  // agent/fleet.ts syncHooks: 'bound to a project this machine has no checkout for'.
  "no-checkout": {
    title: "Bound to a project this machine does not have",
    why: "This row is scoped to a checkout, and there is no such checkout on this machine — so there was nowhere to write it.",
    fix: "Either clone the project on this machine, or scope the row to the whole fleet instead of to that project.",
    action: "none",
  },
  // agent/fleet.ts syncSkillFiles: 'the hub sent no files for this hash'.
  "missing-bytes": {
    title: "The hub sent no files for this version",
    why: "The machine was told which version to hold and was not given the bytes for it — the two sides disagree about what this machine already has.",
    fix: "Refresh the row at the hub so it is resolved and sent again.",
    action: "refresh",
  },
  "unsafe-path": {
    title: "A file in this row pointed outside its own directory",
    why: "Content the hub fetched named a path that climbs out of the directory it belongs in, and the whole row was refused rather than written.",
    fix: "This is a problem with the source, not with the machine. Point the row at a source you trust, or remove it.",
    action: "none",
  },
  // Hub-side: hub/plugins.ts and hub/skills.ts refusals.
  unfetchable: {
    title: "The hub could not fetch this",
    why: "This never reached any machine. The hub resolves content once for the whole fleet, and this source would not resolve — a name no linked marketplace lists, a repository that is gone or private, or a form the hub does not know how to fetch.",
    fix: "Correct the source, link the marketplace it names, then retry the fetch here at the hub.",
    action: "refresh",
  },
  unknown: {
    title: "This did not converge",
    why: "CawCo has no reading of what came back, so the machine’s own words are below, untouched.",
    fix: "Sync this machine again; if it says the same thing, the output is the whole of what is known.",
    action: "resync",
  },
};

/**
 * The same three sentences `packages/agent/src/fleet.ts` matches to decide
 * whether to retry a clone over https. Duplicated deliberately rather than
 * shared: that copy governs a retry on the machine, this one governs what the
 * page says, and neither should start behaving like the other by accident.
 */
const SSH_REFUSED =
  /Permission denied \(publickey\)|Could not read from remote repository|Host key verification failed/i;
const CLI_TOO_OLD = /unknown option|unknown argument|unknown command/i;
const CLI_MISSING = /claude CLI not found/i;
const MARKETPLACE_UNLINKED = /marketplace .+ is not linked/i;
const DRIFTED = /edited on this machine/i;
const MISSING_BYTES = /the hub sent no files/i;
const UNSAFE_PATH = /^unsafe path/i;
const NO_CHECKOUT = /no checkout|has no checkout for/i;
const TIMED_OUT = /timed out after/i;
const UNPARSABLE = /could not parse/i;
const UNWRITABLE = /could not write/i;
const ABSENT = /^not in |^not on disk|is not in known_marketplaces/i;

/** What a machine or the hub said, read as a cause. Order matters: the specific first. */
export function causeOf(
  detail: string | undefined,
  origin: FaultOrigin = "machine"
): FaultCause {
  const said = (detail ?? "").trim();
  if (said === "") {
    return origin === "hub" ? "unfetchable" : "unknown";
  }
  if (CLI_TOO_OLD.test(said)) {
    return "cli-too-old";
  }
  if (CLI_MISSING.test(said)) {
    return "cli-missing";
  }
  if (SSH_REFUSED.test(said)) {
    return "ssh-refused";
  }
  if (MARKETPLACE_UNLINKED.test(said)) {
    return "marketplace-unlinked";
  }
  if (DRIFTED.test(said)) {
    return "drifted";
  }
  if (MISSING_BYTES.test(said)) {
    return "missing-bytes";
  }
  if (UNSAFE_PATH.test(said)) {
    return "unsafe-path";
  }
  if (NO_CHECKOUT.test(said)) {
    return "no-checkout";
  }
  if (TIMED_OUT.test(said)) {
    return "timed-out";
  }
  if (UNPARSABLE.test(said)) {
    return "unparsable";
  }
  if (UNWRITABLE.test(said)) {
    return "unwritable";
  }
  if (ABSENT.test(said)) {
    return "absent";
  }
  // Hub refusals have no shared prefix, so origin is what names them: anything
  // a resolve said and this table does not recognise is still a fetch that
  // failed, and reads far better as that than as "unknown".
  return origin === "hub" ? "unfetchable" : "unknown";
}

/** Where the fault happened, which decides what could possibly fix it. */
export type FaultOrigin = "hub" | "machine";

/** One thing that is wrong, with everything needed to render and act on it. */
export interface Fault {
  cause: FaultCause;
  /** What was said, verbatim and never rewritten. */
  detail?: string;
  harness?: HarnessKind;
  /** The row's own key: a server name, a plugin id, a document path. Empty for the singular memory rows. */
  key: string;
  /** Which machine refused it; absent for a hub-side fault, which belongs to no machine. */
  machineId?: string;
  origin: FaultOrigin;
  scope: FaultScope;
}

const scan = (
  scope: FaultScope,
  machineId: string,
  record: Record<string, FleetItemState> | undefined
): Fault[] =>
  Object.entries(record ?? {})
    .filter(([, item]) =>
      ["failed", "needs-auth", "unsupported"].includes(item.state)
    )
    .map(([key, item]) => ({
      origin: "machine" as const,
      scope,
      key,
      machineId,
      ...(item.detail ? { detail: item.detail } : {}),
      cause:
        item.state === "needs-auth" || item.state === "unsupported"
          ? item.state
          : causeOf(item.detail),
    }));

/** Every row one machine's report says it could not apply. */
export function machineFaults(
  machineId: string,
  fleet: FleetSyncReport | undefined
): Fault[] {
  if (!fleet) {
    return [];
  }
  const single = (
    scope: FaultScope,
    item: FleetItemState | undefined
  ): Fault[] =>
    item?.state === "failed"
      ? [
          {
            origin: "machine" as const,
            scope,
            key: "",
            machineId,
            ...(item.detail ? { detail: item.detail } : {}),
            cause: causeOf(item.detail),
          },
        ]
      : [];
  return [
    ...(fleet.mcpByHarness
      ? Object.entries(fleet.mcpByHarness).flatMap(([harness, rows]) =>
          scan("mcp", machineId, rows).map((fault) => ({
            ...fault,
            harness: harness as HarnessKind,
          }))
        )
      : scan("mcp", machineId, fleet.mcp)),
    ...scan("marketplaces", machineId, fleet.marketplaces),
    ...scan("plugins", machineId, fleet.plugins),
    ...scan("skills", machineId, fleet.skills),
    ...scan("memoryDocs", machineId, fleet.memoryDocs),
    ...scan("hooks", machineId, fleet.hooks),
    ...single("memory", fleet.memory),
    ...single("memoryHook", fleet.memoryHook),
  ];
}

/**
 * Every row the HUB could not resolve. These belong to no machine: the bytes
 * were never fetched, so nothing was ever offered to one.
 *
 * A plugin is the exception. One the hub could not carry is installed by each
 * machine from its own marketplace instead, so its fetch error is a fault only
 * while no machine reports it applied — a plugin bigger than the hub carries
 * works everywhere and is not broken.
 */
export function hubFaults(
  skills: readonly FleetSkillMeta[],
  plugins: readonly FleetPlugin[],
  reports: readonly (FleetSyncReport | undefined)[]
): Fault[] {
  const appliedSomewhere = (id: string): boolean =>
    reports.some((report) => report?.plugins[id]?.state === "applied");
  return [
    ...skills
      .filter((row) => row.error)
      .map((row) => ({
        origin: "hub" as const,
        scope: "skills" as const,
        key: row.name,
        detail: row.error,
        cause: causeOf(row.error, "hub"),
      })),
    ...plugins
      .filter((row) => row.error && !appliedSomewhere(row.id))
      .map((row) => ({
        origin: "hub" as const,
        scope: "plugins" as const,
        key: row.id,
        detail: row.error,
        cause: causeOf(row.error, "hub"),
      })),
  ];
}

/** What each scope is called in a sentence, singular. */
export const SCOPE_NOUN: Record<FaultScope, string> = {
  mcp: "MCP server",
  marketplaces: "marketplace",
  plugins: "plugin",
  skills: "skill",
  memory: "memory",
  memoryDocs: "memory document",
  memoryHook: "model-memory hook",
  hooks: "hook",
};

/** Which Configure section owns the affordance for a scope — a fault links there, never re-creates it. */
export const SCOPE_ANCHOR: Record<FaultScope, string> = {
  mcp: "/config/mcp",
  marketplaces: "/config/skills",
  plugins: "/config/skills",
  skills: "/config/skills",
  memory: "/config/memory",
  memoryDocs: "/config/memory",
  memoryHook: "/config/memory",
  hooks: "/config/hooks",
};

/**
 * Where a fault is settled: the section, or — for a memory file or a hook —
 * its own editor, which is where its per-machine copies are compared.
 */
export function faultHref(fault: Pick<Fault, "scope" | "key">): string {
  if (fault.scope === "mcp") {
    return `/config/mcp/${encodeURIComponent(fault.key)}`;
  }
  if (fault.scope === "memory") {
    return "/config/memory/CLAUDE.md";
  }
  if (fault.scope === "memoryDocs") {
    return `/config/memory/${fault.key}`;
  }
  if (fault.scope === "hooks") {
    return `/config/hooks/${fault.key}`;
  }
  return SCOPE_ANCHOR[fault.scope];
}

/** The row's own name for a reader: the key, or the scope's noun for the singular rows. */
export const faultLabel = (fault: Fault): string =>
  fault.key || SCOPE_NOUN[fault.scope];

/**
 * Faults grouped by what they are, not by where they were found. A fleet where
 * the same stale CLI broke six plugins on one machine is one problem with six
 * symptoms, and a list that repeats it six times is a list nobody reads to the
 * end.
 */
export interface FaultGroup {
  cause: FaultCause;
  faults: Fault[];
  harness?: HarnessKind;
  machineId?: string;
  origin: FaultOrigin;
  scope: FaultScope;
}

export function groupFaults(faults: readonly Fault[]): FaultGroup[] {
  const groups = new Map<string, FaultGroup>();
  for (const fault of faults) {
    const id = `${fault.origin}|${fault.cause}|${fault.scope}|${fault.machineId ?? ""}|${fault.harness ?? ""}`;
    const existing = groups.get(id);
    if (existing) {
      existing.faults.push(fault);
      continue;
    }
    groups.set(id, {
      origin: fault.origin,
      cause: fault.cause,
      scope: fault.scope,
      ...(fault.harness ? { harness: fault.harness } : {}),
      ...(fault.machineId ? { machineId: fault.machineId } : {}),
      faults: [fault],
    });
  }
  // Hub faults first: they are the ones no machine can be asked to fix, and a
  // machine-side failure downstream of one is not worth chasing until it is gone.
  return [...groups.values()].sort((a, b) => {
    if (a.origin !== b.origin) {
      return a.origin === "hub" ? -1 : 1;
    }
    return b.faults.length - a.faults.length;
  });
}

/**
 * The `claude` this machine's sync actually ran, and any it did not. What makes
 * `unknown option '--scope'` attributable: the version that produced it, and
 * whether a newer one is sitting on the same machine behind it.
 */
export interface ToolchainReading {
  /** Installs the sync did NOT use, newest-looking first is not assumed — PATH order is kept. */
  others: { path: string; version?: string }[];
  /** True when one of `others` reports a strictly higher version than the used one. */
  shadowed: boolean;
  used?: { path: string; version?: string };
}

const SEMVER = /(\d+)\.(\d+)\.(\d+)/;

/** `1.2.3` as comparable numbers; anything unparsable sorts as nothing at all. */
const parts = (version: string | undefined): number[] | undefined => {
  const match = SEMVER.exec(version ?? "");
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
};

const higher = (a: string | undefined, b: string | undefined): boolean => {
  const left = parts(a);
  const right = parts(b);
  if (!(left && right)) {
    return false;
  }
  for (let at = 0; at < 3; at += 1) {
    if (left[at] !== right[at]) {
      return left[at] > right[at];
    }
  }
  return false;
};

export function readToolchain(
  fleet: FleetSyncReport | undefined
): ToolchainReading | undefined {
  const claude = fleet?.toolchain?.claude;
  if (!claude || claude.length === 0) {
    return undefined;
  }
  const used = claude.find((one) => one.used);
  const others = claude.filter((one) => one !== used);
  return {
    ...(used
      ? {
          used: {
            path: used.path,
            ...(used.version ? { version: used.version } : {}),
          },
        }
      : {}),
    others: others.map((one) => ({
      path: one.path,
      ...(one.version ? { version: one.version } : {}),
    })),
    shadowed: others.some((one) => higher(one.version, used?.version)),
  };
}
