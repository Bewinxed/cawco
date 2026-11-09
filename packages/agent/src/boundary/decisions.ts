/**
 * A boundary's spills, accounts and places, the checks a machine passes before
 * it holds one, and the decisions each start, handover or refusal records.
 */

import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { readUpdateState } from "@cawco/core/binary-installation";
import { nestedSeatbeltRefusal } from "@cawco/core/boundary-nesting";
import { currentKeeper } from "@cawco/core/keepers";
import {
  workspaceAccountsFile,
  workspaceSpillsFile,
} from "@cawco/core/paths/workspace";
import { runtimeVersion, standalone } from "@cawco/core/runtime";
import type { ProcSpec } from "@cawco/core/sessiond";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { workspaceNeeds } from "@cawco/core/workspace-needs";
import { isPlace, workspaceSpills } from "@cawco/core/workspace-policy";
import { z } from "zod";
import { ensureView, layerOf, viewArgv } from "../layer";
import { gateOf } from "./exec";
import { type Held, reported, stateDir, writeWhole } from "./state";

/**
 * Adds `dir` to the folders workspace `id`'s sessions save tool results in
 * ({@link workspaceSpillsFile}), once, and makes it ({@link keepSpill}):
 * srt binds a read allow back only where it exists as the sandbox starts,
 * and the harness writes its first saved result long after. Never taken
 * away while the workspace lives, as a session's transcript names its saved
 * results for as long as it is resumed.
 */
export const addSpill = async (id: string, dir: string): Promise<void> => {
  await keepSpill(dir);
  await addListed(id, workspaceSpillsFile(id), dir);
};

/** Adds `item` to the workspace's list record at `file` unless it is listed already. */
const addListed = async (
  id: string,
  file: string,
  item: string
): Promise<void> => {
  const listed = await reported(
    readRecord(file, z.array(z.string())).then((record = []) => record)
  );
  if (listed.includes(item)) {
    return;
  }
  await mkdir(stateDir(id), { recursive: true });
  await writeWhole(file, `${JSON.stringify([...listed, item])}\n`, 0o644);
};

/**
 * The entry that keeps a spill folder from being swept ({@link keepSpill}):
 * a link to `/dev/null`, which reads as empty wherever it is followed.
 */
const SPILL_KEEP = ".cawco-keep";

/**
 * Makes spill folder `dir` owner-only, as Claude Code makes its own, with
 * {@link SPILL_KEEP} in it. Claude Code's start-up retention sweep (2.1.302)
 * takes every empty session folder in its config dir away, a live session's
 * included: for each `projects/<slug>/<session id>/` it unlinks
 * `tool-results`' expired files and then `rmdir`s `tool-results`, the session
 * folder and the project folder, whatever their age (`T(L,n)`, `T(j,n)`,
 * `T(g,n)`, where `T` is `rmdir` of a directory). Twenty-one sessions starting
 * at once on one account took a folder away between srt resolving it and bwrap
 * binding it: "bwrap: Can't get type of source …/tool-results: No such file
 * or directory", and the boundary did not start. The sweep unlinks only the
 * files and empties only the directories it finds there and passes a link
 * by, so a folder holding the link stays, and its parents with it. The sweep
 * may take the folder between the `mkdir` and the link, so both are made
 * again until the link stands. The folder outlives its session by design:
 * what it holds is Claude Code's retention's to delete, and a workspace's
 * archive leaves it, as a retired workspace is cut again at the same path
 * and its session resumes there.
 */
const keepSpill = async (dir: string): Promise<void> => {
  const keep = join(dir, SPILL_KEEP);
  for (;;) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const kept = await symlink("/dev/null", keep).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") {
          return true;
        }
        if (error.code === "ENOENT") {
          return false;
        }
        throw error;
      }
    );
    if (kept) {
      return;
    }
  }
};

/**
 * Makes every spill folder workspace `id`'s policy binds ({@link keepSpill}),
 * as its boundary starts: one a session was launched with long ago can be
 * gone since (Claude Code removes a session's folders with its transcript),
 * and srt passes over an allow that is not there, so its session's saved
 * results would not be read. Made as {@link addSpill} makes them, so the
 * boundary's form is the same.
 */
export const keepSpills = async (id: string): Promise<void> => {
  const dirs = await reported(workspaceSpills(id));
  await Promise.all(dirs.map(keepSpill));
};

/**
 * Adds `account` to the accounts workspace `id`'s sessions run on
 * ({@link workspaceAccountsFile}), once. Never taken away: a session moved to
 * another account may still be running on the first until it relaunches,
 * and what each adds is only that account's links to the user layer.
 */
export const addAccount = (id: string, account: string): Promise<void> =>
  addListed(id, workspaceAccountsFile(id), account);

/**
 * Whether the machine's endpoint is still owed to this build's own keeper: on
 * a binary install, the keeper it names (core keepers.ts: the current one) is
 * not this build's, and this build's keeper has not failed to start
 * (`keeperFailedVersion`). An update restarts this agent first and hands the
 * keeper over only once the build answers (binary-apply.ts `settle`), and an
 * agent whose keeper is behind has a helper hand it over (binary-update.ts
 * `#advanceKeeper`); meanwhile the keeper the endpoint names is about to
 * retire, so a boundary replaced onto it would be replaced a second time. A
 * replacement waits for this build's keeper instead.
 */
export const ownKeeperOwed = async (): Promise<boolean> => {
  if (!standalone) {
    return false;
  }
  const current = await currentKeeper();
  if (
    !current ||
    (current.keeper.kind === "build" &&
      current.keeper.version === runtimeVersion)
  ) {
    return false;
  }
  return (await readUpdateState())?.keeperFailedVersion !== runtimeVersion;
};

/**
 * macOS: why this process can start no boundary at all, asked once: a
 * process under a Seatbelt profile stays under it for its whole life, and
 * one under none never gains one. Asked before anything of a boundary is
 * made, so the person reads why, not the EPERM the profile it runs under
 * answers a write into the socket root with (`linkWorkspaceTmp`).
 */
let seatbeltNested: { reason: string | undefined } | undefined;

export const nestedSeatbelt = (): string | undefined => {
  seatbeltNested ??= { reason: nestedSeatbeltRefusal() };
  return seatbeltNested.reason;
};

/** Says, as the agent starts, what this machine needs before it can hold a delegate's workspace (workspace-needs.ts). */
export const checkBoundaryHost = (): void => {
  const needs = workspaceNeeds();
  if (!needs.available) {
    console.warn(`[workspace] ${needs.reason}`);
  }
};

/**
 * The view a Linux boundary's srt host runs in (layer.ts): its spec entered
 * into the workspace's view namespace, so srt's binds of the folder are the
 * view's overlay. Nothing for a place, a copy, or on macOS.
 */
export const viewOfBoundary = async (
  ref: WorkspaceRef,
  spec: ProcSpec
): Promise<ProcSpec> => {
  if (process.platform !== "linux" || isPlace(ref.id)) {
    return spec;
  }
  const layer = await layerOf(ref.id, ref.path);
  if (layer?.form !== "overlay") {
    return spec;
  }
  const pid = await ensureView(ref.id, layer);
  const [command, ...args] = viewArgv(pid, spec.cwd ?? "/", [
    spec.command,
    ...spec.args,
  ]);
  return { ...spec, command: command as string, args };
};

/** The file in a workspace's state dir that holds its {@link BoundaryDecision}s. */
const DECISIONS_FILE = "boundary-decisions.json";

/** How many of a workspace's latest decisions its {@link DECISIONS_FILE} keeps. Ours: an update, a narrowing and the closes after them, with room. */
const DECISIONS_KEPT = 32;

/** A boundary generation as a decision names it. */
interface DecidedBoundary {
  /** Its form (plan.ts `formOf`); null when it has none. */
  readonly form: string | null;
  readonly gen: string;
  /** Its srt host (Linux) or runner (macOS). */
  readonly pid: number;
}

/** Why an update decision ({@link BoundaryDecision}) went as it did: each names what held then, the rest none. */
interface UpdateReasons {
  /** Its work's commands running, by executor pid (processes.ts `commandsIn`). */
  readonly commands: readonly number[];
  /** Why its grant cannot be compared with this build's policy (narrowing.ts `unknownGrant`); null when it can. */
  readonly grant: string | null;
  /** Kept until this build's session keeper is the machine's ({@link ownKeeperOwed}). */
  readonly keeperOwed: boolean;
  /** It holds an srt mount point where a dir stands in (staleness.ts `stubbed`): replaced whole once nothing runs in it. */
  readonly leftDirs: boolean;
  /** The ports its work listens on (narrowing.ts `workPorts`). */
  readonly listening: readonly number[];
  /** Every process of its work, by pid (processes.ts `workProcesses`). */
  readonly processes: readonly number[];
}

/** Why the agent looked for a narrowed access (looks.ts `recheckNarrowed`), or `use`: a use of the boundary (ensure.ts `ensure`). */
export type NarrowCause =
  "accounts" | "folder-moved" | "look" | "project" | "use";

/**
 * What the agent decided of one of a workspace's boundaries, as it says the
 * same in its log and from the same values: the log line is for people, this
 * record for what checks the agent (the end-to-end tests, probe specs). Each carries the
 * deciding agent's pid (`agent`) and when, in ms since the epoch (`at`).
 *
 * - `kept`, `handed-over`, `replaced`: of a boundary not of this build's
 *   form, on a retiring keeper, or whose grant is not comparable (ensure.ts `replaceOlder`): kept as it is, handed over to one started beside it
 *   (ensure.ts `handOver`), or replaced by one once nothing ran in it (ensure.ts `restartIfIdle`), with `reasons` and the boundary that took its place
 *   (`to`).
 * - `older-closed`: an older generation beside the current one closed
 *   (ensure.ts `closeIdle`): nothing ran in it (`idle`), it was gone, or a newer
 *   generation listens on every port its work listened on (`superseded`).
 * - `narrowed-stopped`: the generations whose access narrowed are stopped
 *   (ensure.ts `replaceNarrowed`), and the boundary that runs after (`runs`).
 * - `quiet-closed`: nothing held the workspace, and every generation closed
 *   (looks.ts `closeQuietly`).
 * - `closed-for-good`: every generation closed with what still ran in its
 *   clone, the workspace going or settled (control.ts `stopWorkspaceBoundary`).
 * - `host-restarted`: its srt host stopped its sandbox, with everything in
 *   it, and started it again, a path it guards (`path`) changed on the host
 *   (boundary-host.ts `guard`), as the host records it (ensure.ts `recordHostRestarts`); `inner` the init of the sandbox it stopped.
 * - `restarted-unasked`: the boundary ended with nothing of the agent's
 *   ending it, and was started again (`to`, ensure.ts `restartUnasked`).
 * - `left-down`: it ended unasked again within ensure.ts `UNASKED_RESTART_MS`
 *   of being started again, and is left down.
 */
type BoundaryDecision =
  | (DecidedBoundary & {
      readonly agent: number;
      readonly at: number;
      readonly decision: "kept" | "handed-over" | "replaced";
      readonly reasons: UpdateReasons;
      /** The boundary that took its place; null while it is kept. */
      readonly to: DecidedBoundary | null;
    })
  | (DecidedBoundary & {
      readonly agent: number;
      readonly at: number;
      readonly decision: "older-closed";
      /** The ports a newer generation took over, when `superseded`. */
      readonly ports: readonly number[];
      readonly why: "gone" | "idle" | "superseded";
    })
  | {
      readonly agent: number;
      readonly at: number;
      readonly cause: NarrowCause;
      readonly decision: "narrowed-stopped";
      /** What its access lost (narrowing.ts `narrowedBy`). */
      readonly narrowed: readonly string[];
      /** The boundary that runs after: a new one when the current was stopped, else the current one. */
      readonly runs: DecidedBoundary;
      readonly stopped: readonly DecidedBoundary[];
      /** The processes of their work that were stopped with them, by pid. */
      readonly work: readonly number[];
    }
  | {
      readonly agent: number;
      readonly at: number;
      readonly closed: readonly DecidedBoundary[];
      readonly decision: "quiet-closed";
      readonly judges: number;
      /** Why it closed now, in the log's words. */
      readonly why: string;
    }
  | {
      readonly agent: number;
      readonly at: number;
      readonly closed: readonly DecidedBoundary[];
      readonly decision: "closed-for-good";
    }
  | (DecidedBoundary & {
      readonly agent: number;
      readonly at: number;
      readonly decision: "host-restarted";
      /** When the host restarted it, by its own clock (ms since the epoch): what tells one restart from another. */
      readonly hostAt: number;
      readonly inner: number | null;
      readonly path: string;
    })
  | (DecidedBoundary & {
      readonly agent: number;
      readonly at: number;
      readonly decision: "restarted-unasked";
      readonly to: DecidedBoundary;
    })
  | (DecidedBoundary & {
      readonly agent: number;
      readonly at: number;
      readonly decision: "left-down";
    });

/** A {@link BoundaryDecision} as its decider writes it: the agent and the time are added. */
type Deciding = BoundaryDecision extends infer One
  ? One extends BoundaryDecision
    ? Omit<One, "agent" | "at">
    : never
  : never;

/** Boundary `held` as a decision names it. */
export const decided = (
  held: Pick<Held, "form" | "gen" | "pid">
): DecidedBoundary => ({
  form: held.form ?? null,
  gen: held.gen,
  pid: held.pid,
});

/** {@link UpdateReasons}: `given` holds, the rest none. */
export const reasonsOf = (given: Partial<UpdateReasons>): UpdateReasons => ({
  commands: [],
  grant: null,
  keeperOwed: false,
  leftDirs: false,
  listening: [],
  processes: [],
  ...given,
});

/** Each workspace's decision write under way: one at a time, so none is lost ({@link recordDecision}). */
const decisionWrites = new Map<string, Promise<void>>();

/**
 * Adds `entry` to workspace `id`'s {@link DECISIONS_FILE}, its
 * {@link DECISIONS_KEPT} latest kept, the file written whole or not at all.
 * A write that fails is said, never thrown: the record follows the agent,
 * never steers it.
 */
export const recordDecision = (id: string, entry: Deciding): Promise<void> => {
  const settled = (decisionWrites.get(id) ?? Promise.resolve())
    .then(() => appendDecision(id, entry))
    .catch((error: unknown) => {
      console.warn(
        `[workspace] ${id}: its ${DECISIONS_FILE} could not be written: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      if (decisionWrites.get(id) === settled) {
        decisionWrites.delete(id);
      }
    });
  decisionWrites.set(id, settled);
  return settled;
};

/** Workspace `id`'s decisions as recorded ({@link DECISIONS_FILE}), oldest first; none when there are none or they do not parse. */
export const readDecisions = async (
  id: string
): Promise<BoundaryDecision[]> => {
  const text = await readFile(join(stateDir(id), DECISIONS_FILE), "utf8").catch(
    () => "[]"
  );
  try {
    const read: unknown = JSON.parse(text);
    return Array.isArray(read) ? (read as BoundaryDecision[]) : [];
  } catch {
    return [];
  }
};

/** {@link recordDecision}'s write itself: the list read, `entry` added, written whole. */
const appendDecision = async (id: string, entry: Deciding): Promise<void> => {
  const path = join(stateDir(id), DECISIONS_FILE);
  const all = [
    ...(await readDecisions(id)),
    { ...entry, agent: process.pid, at: Date.now() },
  ].slice(-DECISIONS_KEPT);
  await writeWhole(path, `${JSON.stringify(all)}\n`, 0o644);
};

/** Each workspace's gate this agent holds up: how many of its steps hold it, and its write ({@link behindGate}). */
const gates = new Map<string, { count: number; readonly up: Promise<void> }>();

/** Each workspace's gate on its way down ({@link behindGate}): a step after it waits for it, then puts it up again. */
const gatesDown = new Map<string, Promise<void>>();

/**
 * Runs `step` with workspace `id`'s gate up ({@link gateOf}): an executor that
 * looks at it meanwhile waits, then runs through whichever boundary is
 * current once it is down (exec.ts `execScript`). Counted: a step inside
 * another (the start-up rewrite's ensure, ensure.ts `rearmOne`, handing a
 * boundary over) leaves it up for the outer one, and it comes down once the
 * last of them ends, never while one still runs.
 */
export const behindGate = async <T>(
  id: string,
  step: () => Promise<T>
): Promise<T> => {
  let hold = gates.get(id);
  if (hold) {
    hold.count += 1;
  } else {
    const down = gatesDown.get(id);
    hold = {
      count: 1,
      up: (async () => {
        await down;
        await writeStateFile(gateOf(id), String(process.pid));
      })(),
    };
    gates.set(id, hold);
  }
  try {
    await hold.up;
    return await step();
  } finally {
    hold.count -= 1;
    if (hold.count === 0 && gates.get(id) === hold) {
      gates.delete(id);
      const down = rm(gateOf(id), { force: true }).finally(() => {
        if (gatesDown.get(id) === down) {
          gatesDown.delete(id);
        }
      });
      gatesDown.set(id, down);
      await down;
    }
  }
};
