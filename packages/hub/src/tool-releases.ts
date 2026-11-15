/**
 * EVERY COPY CAWCO PUT ON A MACHINE RUNS THE NEWEST RELEASE OF EACH CLI
 * CAWCO KEEPS CURRENT (core `ToolSpec.release`: Claude Code), with no press
 * and no running session cut off, while the fleet is set to update. The
 * owner, 2026-11-04: two machines on two Claude Code builds worded one API
 * refusal two ways, so one incident read as two. Narrowed 2026-11-14 to the
 * rule every tool follows (core tool-updates.ts): a copy the person
 * installed is never updated by CawCo, and under "ask" CawCo's own copy
 * waits on the person's Update.
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
 * machine whose copy CawCo put there says a version older than it is sent the catalog's
 * install, with that release to reach (tool-installs.ts `keepCopies`): the same
 * control a press sends, so the agent runs the copy's own updater (`claude
 * update`) and answers what the copy says after it (agent tools.ts
 * `install`). An update never stops a process: Claude Code's updater puts
 * the new build beside the old and keeps "any version a session on the same
 * machine is running" (code.claude.com/docs/en/setup), and each session on
 * the old build goes to sleep only once it is at rest, waking on the new one
 * at its next message (agent session.ts `#retire`).
 *
 * One update per copy and release ({@link keptReleases}): an update that
 * left the copy older stands on its row with the updater's words until a
 * newer release, a Retry, the copy moving, or a new agent process, whose
 * own memory of the failure went with the old one (agent tools.ts
 * `failures`).
 */

import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { MINUTE_MS, secondsOf } from "@cawco/core/time";
import type { ToolPolicy, ToolSpec } from "@cawco/core/tools";
import { versionSaid } from "@cawco/core/version-said";
import { cutShort } from "@cawco/core/words/helpers";
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
const readRelease = async (
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
          ? `it answered no version (“${cutShort(body.trim(), 80)}”)`
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

/**
 * The release each CLI CawCo keeps current is kept at, by tool id: its
 * newest release as last read, for each tool whose policy pins no version
 * (a pinned tool is held at its pin, and no release moves it). What core
 * `toolUpdateOf` judges a copy CawCo put there by, for the hub's pass
 * (tool-installs.ts `keepCopies`) and for `/api/tool-updates` alike, so a
 * copy the screens call due is one the pass sends: CawCo's own copy that
 * says a version older than it, while the fleet is set to update, with no
 * attempt standing on it (the agent's words on a copy an update left
 * older, kept until that copy moves, agent tools.ts `failures`). A tool
 * whose release was never read is in none: a copy older than the oldest
 * CawCo runs is its machine's to say (`wants`).
 */
export const keptReleases = (fleet: {
  catalog: readonly ToolSpec[];
  newest: (toolId: string) => string | undefined;
  policies: readonly ToolPolicy[];
}): Record<string, string> =>
  Object.fromEntries(
    fleet.catalog.flatMap((spec) => {
      const newest = spec.release ? fleet.newest(spec.id) : undefined;
      const pinned = fleet.policies.some(
        (policy) => policy.id === spec.id && policy.pinnedVersion !== null
      );
      return newest && !pinned ? [[spec.id, newest]] : [];
    })
  );

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
 * and every {@link RELEASE_READ_MS}. After each read, `read` runs: the hub sends every machine what it
 * is owed (tool-installs.ts `keepCopies`).
 */
export class ToolReleases {
  readonly #deps: ToolReleasesDeps;
  readonly #reads = new Map<string, ReleaseRead>();
  /** The release last read for each tool, kept through a read that failed. */
  readonly #newest = new Map<string, string>();

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
}
