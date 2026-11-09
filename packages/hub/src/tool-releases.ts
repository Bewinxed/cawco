/**
 * EVERY MACHINE RUNS THE NEWEST RELEASE OF EACH CLI CAWCO KEEPS CURRENT
 * (core `ToolSpec.release`: Claude Code), with no press and no running
 * session cut off. The owner, 2026-11-04: two machines on two Claude Code
 * builds worded one API refusal two ways, so one incident read as two.
 *
 * Why CawCo runs the updater: Claude Code updates itself only from its
 * interactive REPL (its footer's `AutoUpdaterWrapper`, on mount and every
 * 30 minutes), and every Claude Code CawCo starts is the Agent SDK's
 * stream-json process on pipes, which is never interactive ("return
 * n||t||o||!process.stdout.isTTY", 2.1.311's bundle). Nothing turns the
 * updater off; it is simply never reached, so a machine where nobody opens
 * `claude` in a terminal stays on its build (niftybot on 2.1.308).
 *
 * The hub reads each kept CLI's release (upstreams.ts `TOOL_RELEASES`, the
 * catalog's URLs) as it starts and every {@link RELEASE_READ_MS}, and each
 * machine whose copy says a version older than it is sent the catalog's
 * install, with that release to reach (tool-installs.ts `keepCurrent`): the same
 * control a press sends, so the agent runs the copy's own updater (`claude
 * update`) and answers what the copy says after it (agent tools.ts
 * `install`). An update never stops a process: Claude Code's updater puts
 * the new build beside the old and keeps "any version a session on the same
 * machine is running" (code.claude.com/docs/en/setup), and each session on
 * the old build goes to sleep only once it is at rest, waking on the new one
 * at its next message (agent session.ts `#retire`).
 *
 * One update per machine, tool and release ({@link updatesOwed}): an update
 * that left the copy older stands on its row with the updater's words until
 * a newer release, a Retry, or the machine connecting again (a new agent
 * process, whose own memory of the failure went with the old one).
 */

import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { MINUTE_MS, secondsOf } from "@cawco/core/time";
import {
  olderThan,
  type ToolPolicy,
  type ToolSpec,
  type ToolStatus,
} from "@cawco/core/tools";
import { versionSaid } from "@cawco/core/version-said";
import type { HubLifetimeShape } from "./lifetime";

/**
 * How often the hub reads each kept CLI's newest release. Our choice, as
 * Claude Code's own: its updater checks again every 30 minutes
 * (`Pa(()=>void z(),1800000)` in 2.1.311's `NativeAutoUpdater`).
 */
const RELEASE_READ_MS = 30 * MINUTE_MS;

/** How long one read of a release URL may take before it is let go. */
const RELEASE_WAIT_MS = 20_000;

/** What a release URL said when last read: the newest release, or why it said none. */
export type ReleaseRead =
  { at: number; version: string } | { at: number; failed: string };

/** Reads one release URL, within {@link RELEASE_WAIT_MS}. */
export const readRelease = async (
  url: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}
): Promise<ReleaseRead> => {
  const fetcher = options.fetcher ?? fetch;
  let read: Bounded<{ body: string; status: number }>;
  try {
    read = await readWithin(
      RELEASE_WAIT_MS,
      async (signal) => {
        const response = await fetcher(url, { signal });
        return { status: response.status, body: await response.text() };
      },
      options.signal ? { signal: options.signal } : {}
    );
  } catch (error) {
    return {
      at: Date.now(),
      failed: error instanceof Error ? error.message : String(error),
    };
  }
  if (read.kind === "unanswered") {
    return {
      at: Date.now(),
      failed: `no answer within ${secondsOf(read.after)} s`,
    };
  }
  const { status, body } = read.value;
  const version = status === 200 ? versionSaid(body) : undefined;
  if (!version) {
    return {
      at: Date.now(),
      failed:
        status === 200
          ? `it answered no version (“${body.trim().slice(0, 80)}”)`
          : `it answered ${status}`,
    };
  }
  return { at: Date.now(), version };
};

/**
 * The release a copy of `spec` is kept at or past, for a tool CawCo keeps
 * current: its newest release as last read, else, with none read yet, the
 * oldest CawCo runs (a copy older than that is updated all the same).
 * Undefined for any other tool.
 */
export const releaseTarget = (
  spec: ToolSpec,
  newest: string | undefined
): string | undefined =>
  spec.release ? (newest ?? spec.minVersion) : undefined;

/** One update a machine is owed: the tool, the version its copy says, and the release to reach. */
export interface UpdateOwed {
  newest: string;
  toolId: string;
  version: string;
}

/**
 * Each update one machine is owed, from the hub's cells for it: a tool CawCo
 * keeps current ({@link releaseTarget}) whose policy pins no version, whose
 * copy there says a version older than its release (`installed`, or
 * `failed` with a version: older than CawCo runs, or an update that failed),
 * with no install of it in flight there (`installing`, or one the hub awaits:
 * `inFlight`), and no update for that release answered on this connection
 * (`tried`). A copy that says no version, and a tool not there, are left to
 * a press: there is no version to compare, and CawCo installs nothing it
 * wasn't asked to.
 */
export const updatesOwed = (
  machine: {
    cells: Readonly<Record<string, ToolStatus>>;
    inFlight: (toolId: string) => boolean;
    tried: (toolId: string) => string | undefined;
  },
  fleet: {
    catalog: readonly ToolSpec[];
    newest: (toolId: string) => string | undefined;
    policies: readonly ToolPolicy[];
  }
): UpdateOwed[] =>
  fleet.catalog.flatMap((spec) => {
    const newest = releaseTarget(spec, fleet.newest(spec.id));
    const cell = machine.cells[spec.id];
    const pinned = fleet.policies.some(
      (policy) => policy.id === spec.id && policy.pinnedVersion !== null
    );
    if (
      !(newest && cell?.version) ||
      pinned ||
      (cell.state !== "installed" && cell.state !== "failed") ||
      !olderThan(cell.version, newest) ||
      machine.inFlight(spec.id) ||
      machine.tried(spec.id) === newest
    ) {
      return [];
    }
    return [{ toolId: spec.id, version: cell.version, newest }];
  });

/** Where a machine's tool is in {@link ToolReleases}' memory of what it tried. */
const triedKey = (machineId: string, toolId: string): string =>
  `${machineId}\0${toolId}`;

/** What {@link ToolReleases} reads with and tells. */
export interface ToolReleasesDeps {
  fetcher?: typeof fetch;
  lifetime: Pick<HubLifetimeShape, "every" | "signal">;
  /** The catalog's name for a tool id, for the log. */
  name: (toolId: string) => string;
  /** Runs after each read: the hub sends every machine what it is owed. */
  read: () => void;
  /** Each kept CLI's release URL, by tool id (upstreams.ts `TOOL_RELEASES`). */
  urls: Readonly<Record<string, string>>;
}

/**
 * The newest release of each CLI CawCo keeps current, read as the hub starts
 * and every {@link RELEASE_READ_MS}, and what each machine was last sent to
 * reach. After each read, `read` runs: the hub sends every machine what it
 * is owed (tool-installs.ts `keepCurrent`).
 */
export class ToolReleases {
  readonly #deps: ToolReleasesDeps;
  readonly #reads = new Map<string, ReleaseRead>();
  /** The release last read for each tool, kept through a read that failed. */
  readonly #newest = new Map<string, string>();
  /** The release an update was last answered for, by machine and tool, on its connection. */
  readonly #tried = new Map<string, string>();

  constructor(deps: ToolReleasesDeps) {
    this.#deps = deps;
  }

  /** Reads every release now, and every {@link RELEASE_READ_MS} after, until the hub closes. */
  start(): void {
    if (Object.keys(this.#deps.urls).length === 0) {
      return;
    }
    detach(this.readAll(), "tool releases");
    this.#deps.lifetime.every(RELEASE_READ_MS, () =>
      detach(this.readAll(), "tool releases")
    );
  }

  /** Reads every release once, then runs `read`. */
  async readAll(): Promise<void> {
    await Promise.all(
      Object.entries(this.#deps.urls).map(async ([toolId, url]) => {
        const read = await readRelease(url, {
          signal: this.#deps.lifetime.signal,
          ...(this.#deps.fetcher ? { fetcher: this.#deps.fetcher } : {}),
        });
        this.#took(toolId, url, read);
      })
    );
    // A hub that closed meanwhile sends nothing.
    if (!this.#deps.lifetime.signal.aborted) {
      this.#deps.read();
    }
  }

  /** Keeps a read, and says in the log what moved: a new release, or a read that failed. */
  #took(toolId: string, url: string, read: ReleaseRead): void {
    const before = this.#reads.get(toolId);
    this.#reads.set(toolId, read);
    const name = this.#deps.name(toolId);
    if ("version" in read) {
      const was = this.#newest.get(toolId);
      this.#newest.set(toolId, read.version);
      if (was !== read.version) {
        console.info(
          `[hub] ${name}'s newest release is ${read.version}${was ? `, after ${was}` : ""}: every machine with an older copy is updated to it`
        );
      }
      return;
    }
    if (!(before && "failed" in before) || before.failed !== read.failed) {
      const kept = this.#newest.get(toolId);
      console.warn(
        `[hub] ${name}'s newest release wasn't read from ${url} (${read.failed}), so machines are kept at ${kept ?? "the oldest CawCo runs"} until a read answers`
      );
    }
  }

  /** The newest release of `toolId` as last read; undefined before one answered. */
  newest(toolId: string): string | undefined {
    return this.#newest.get(toolId);
  }

  /** The release an update of `toolId` on `machineId` was last answered for, on its connection. */
  tried(machineId: string, toolId: string): string | undefined {
    return this.#tried.get(triedKey(machineId, toolId));
  }

  /** The machine answered an install sent to reach `newest`: no other is sent it for that release. */
  answered(machineId: string, toolId: string, newest: string): void {
    this.#tried.set(triedKey(machineId, toolId), newest);
  }

  /**
   * The machine connected: what it was sent before is forgotten, so a copy
   * still older is sent its update once more (a new agent remembers no
   * failure of the old one's, and its row would say none).
   */
  connected(machineId: string): void {
    for (const key of this.#tried.keys()) {
      if (key.startsWith(`${machineId}\0`)) {
        this.#tried.delete(key);
      }
    }
  }
}
