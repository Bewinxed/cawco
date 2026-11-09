/**
 * A workspace boundary's records and the paths of its state: what
 * `boundary.json` keeps, the sandbox a Linux host runs now, each generation's
 * dir and files, the retiring boundaries' records, and the keepers that hold
 * them.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { KeeperName } from "@cawco/core/keepers";
import { machineEndpoint } from "@cawco/core/keepers";
import {
  workspaceReadOnlyDir,
  workspaceScratchDir,
  workspaceStateDir,
} from "@cawco/core/paths/workspace";
import { shellQuote } from "@cawco/core/shell-quote";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import { PolicySchema } from "@cawco/core/stored-shapes";
import type { Policy } from "@cawco/core/workspace-judge";
import { isPlace } from "@cawco/core/workspace-policy";
import { z } from "zod";
import { reportDamaged } from "../damaged-records";
import { type HeldProc, KeeperPool } from "../keepers";
import { boundaryProcId } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { HOST_FILES } from "./protocol";

/** A running boundary, as a harness uses it. */
const BoundaryShape = z.object({
  /** The temp root its sessions' Claude Code CLIs run with (`CLAUDE_CODE_TMPDIR`, core `workspaceClaudeTmpDir`): written on the host, read inside, so a background task's output is there for the session's shell. */
  claudeTmp: z.string(),
  /** `exec [--session [--cwd-out FILE] | --claude] COMMAND`: runs COMMAND inside the boundary, in the caller's directory; a session's command (`--session`) shows the workspace's notice first ({@link noticeOf}), and FILE gets the directory it ended in; `--claude` is a claude session's shell prefix's (exec.ts `execScript`). */
  exec: z.string(),
  /** The PreToolUse hook a claude session runs before each tool call (hook-judge.ts `hookScript`). */
  hook: z.string(),
  /** The process sessiond holds: the srt host (Linux) or the runner (macOS). */
  pid: z.number(),
  /** The workspace's policy file, which every harness judges its file tools by (`workspace-policy.ts`). */
  policy: z.string(),
  /** A claude session's shell prefix, `CLAUDE_CODE_SHELL_PREFIX` (hook-judge.ts `claudePrefixScript`): every shell command, shell-form hook and stdio MCP start of its CLI runs through it, inside the boundary. */
  prefix: z.string(),
  /** The workspace's scratch dir, its commands' `TMPDIR` (on macOS by its short name, `workspaceTmpDir`): `~/.cawco/tmp/<id8>` (`workspaceScratchDir`), on disk and outside the clone. */
  scratch: z.string(),
});

export type Boundary = Readonly<z.infer<typeof BoundaryShape>>;

/** A form's parts, each by name with its own hash (plan.ts `Plan.parts`). */
const FormPartsSchema = z.record(z.string(), z.string()).readonly();

export type FormParts = z.infer<typeof FormPartsSchema>;

/** What `boundary.json` keeps: the boundary, and what proves it is still the one this machine started. */
const HeldSchema = BoundaryShape.extend({
  /**
   * The form it was started in (plan.ts `formOf`). One of another form, or of
   * none, is handed over (ensure.ts `handOver`).
   */
  form: z.string().optional(),
  /**
   * Its generation: its sessiond id, its files in the state dir, its FIFO and
   * srt's temp dir are its own ({@link generationDir}), so an older one runs
   * on beside it.
   */
  gen: z.string(),
  /**
   * What its form was made of, part by part (plan.ts `Plan.parts`), so a move
   * names what moved (plan.ts `movedParts`). None on one an earlier build
   * started.
   */
  parts: FormPartsSchema.optional(),
  path: z.string(),
}).readonly();

export type Held = z.infer<typeof HeldSchema>;

/**
 * An older boundary still running beside the current one (ensure.ts `handOver`):
 * its record. The commands still running in it, or on their way into it,
 * are each its executor's own mark in its generation's dir (processes.ts `commandsIn`).
 */
export type Retiring = Held;

/**
 * Linux: the sandbox the srt host runs now, as it writes `<state>/sandbox`
 * each time it starts one (`boundary-host.ts`).
 */
export interface Place {
  /**
   * Every process of the sandbox when its runner was ready (its init, srt's
   * shell and socat bridges, the runner): anything else that descends from
   * its init is the workspace's work (processes.ts `inTree`, processes.ts `busyOld`).
   */
  readonly idle: readonly number[];
  /** The sandbox's init, whose mount table the executor checks before each command. */
  readonly inner: number;
  /** The outer bwrap; killing it ends the sandbox with everything in it. */
  readonly outer: number;
}

export const stateDir = workspaceStateDir;

export const scratchOf = workspaceScratchDir;

export const roOf = workspaceReadOnlyDir;

/**
 * A boundary generation's own part of the state dir: its srt settings and
 * runner (Linux) or Seatbelt profile (macOS), and the srt host's working
 * dir, where it names its sandbox ({@link placeOf}).
 */
export const generationDir = (id: string, gen: string): string =>
  join(stateDir(id), "boundaries", gen);

/**
 * The policy a boundary generation started with, as plan.ts `planFor` wrote it
 * beside its other files: what that boundary grants for its whole life,
 * whatever the workspace's policy says since (narrowing.ts `narrowing`).
 */
export const grantedOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "policy.json");

/** The policy generation `gen` of workspace `id` started with ({@link grantedOf}); undefined when none is on record. */
export const grantedPolicy = (
  id: string,
  gen: string
): Promise<Policy | undefined> =>
  readRecord(grantedOf(id, gen), PolicySchema).catch(() => undefined);

/**
 * Lines for a workspace's next session command, which its executor shows on
 * stderr before the command's own output and then removes (exec.ts `execScript`'s `--session`): what CawCo did to the work without being asked
 * (ensure.ts `replaceNarrowed`). In the state dir, which nothing inside writes.
 */
export const noticeOf = (id: string): string => join(stateDir(id), "notice");

/** The runner's FIFO, in the part of the state dir a command reads. */
export const fifoOf = (id: string, gen: string): string =>
  join(roOf(id), `runner-${gen}.fifo`);

/**
 * An empty git template: srt denies writes to every `.git/hooks`, so a `git
 * clone` inside (SwiftPM checkouts, git dependencies) fails copying git's
 * template hooks unless it has none to copy (REPORT.md §5g).
 */
export const gitTemplateOf = (id: string): string =>
  join(roOf(id), "git-template");

/**
 * The system gitconfig every command's git reads (`GIT_CONFIG_SYSTEM`, git
 * 2.32+), read-only inside, in place of the host's: Apple's git (Command
 * Line Tools) and Homebrew's each ship one naming
 * `credential.helper=osxkeychain`, which reaches no keychain service inside
 * in any case (`KEYCHAIN_MACH_SERVICES`). It names no helper: a workspace
 * holds no credential, and every push across the network and its clone's
 * own origin go through the git door, which signs in on the host
 * (hub-git.ts). The user's gitconfig, read after it, still applies.
 * `GIT_CONFIG_COUNT` is left alone: srt and the session hand git their own
 * entries through it.
 */
export const gitSystemConfigOf = (id: string): string =>
  join(roOf(id), "gitconfig");

/** {@link gitSystemConfigOf}'s text. */
export const gitSystemConfig = (id: string): string =>
  `# CawCo workspace ${id}: the system gitconfig git reads inside the boundary.\n`;

export const WHITESPACE = /\s+/u;

/** The line the runner prints once a command can be handed to it. */
export const READY = "cawco-boundary-ready";

export const STOP_TIMEOUT_MS = 5000;

/** Linux: where the srt host names the sandbox it runs now ({@link Place}): `sandbox` in its working dir. */
export const placeOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), HOST_FILES.sandbox);

/**
 * Linux: the protected binds of the sandbox {@link placeOf} names, one mount
 * point a line as `/proc/<pid>/mountinfo` spells it, written by the srt host
 * before the place, so the executor checks what that very sandbox holds.
 */
export const guardedOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), HOST_FILES.guarded);

export const readPlace = async (
  id: string,
  gen: string
): Promise<Place | undefined> => {
  const text = await readFile(placeOf(id, gen), "utf8").catch(() => "");
  const [outer, inner, ...idle] = text
    .trim()
    .split(WHITESPACE)
    .map((pid) => Number.parseInt(pid, 10));
  if (!(outer && inner) || idle.some(Number.isNaN)) {
    return;
  }
  return { outer, inner, idle };
};

/** A session's `command`, as it runs inside the boundary (pi's bash tool): `--session`, so it shows the workspace's notice first. */
export const boundaryCommand = (boundary: Boundary, command: string): string =>
  `${shellQuote(boundary.exec)} --session ${shellQuote(command)}`;

/** Writes `path` whole or not at all, at exactly `mode`: a reader never sees it half written. */
export const writeWhole = (
  path: string,
  content: string,
  mode: number
): Promise<void> => writeStateFile(path, content, { mode });

/** The machine's keeper endpoint: its directory, where every keeper's endpoint is, is hidden from a bounded command. */
export const sessiondPath = machineEndpoint;

/**
 * The machine's keepers as this module reaches them, dialled on first use: a
 * boundary or a judge starts on the current keeper, and one a retiring keeper
 * holds is found and stopped there.
 */
const keepers = new KeeperPool();

/** Every process every keeper holds. */
export const procsHeld = (): Promise<HeldProc[]> => keepers.held();

/** The keeper's process holding `procId`, on whichever keeper holds it. */
export const heldProc = (procId: string): Promise<HeldProc | undefined> =>
  keepers.holding(procId);

/** A connection to the keeper named `keeper`, if it is there. */
export const keeperOf = (
  keeper: KeeperName
): Promise<SessiondClient | undefined> => keepers.of(keeper);

/** The keeper every new boundary and judge starts on: the current one. */
export const sessiond = (): Promise<SessiondClient> => keepers.current();

/** Why a boundary can't start: a workspace's runs a delegate, a place's (core `isPlace`) a person's own folder. */
export const refusal = (id: string, why: string): Error =>
  new Error(
    isPlace(id)
      ? `place ${id} cannot be bounded on this machine: ${why}`
      : `workspace ${id.slice(0, 8)} cannot run a delegate on this machine: ${why}`
  );

/**
 * `read`'s answer; a ../../core/src/state-file.ts `DamagedRecord` it finds is reported
 * ({@link reportDamaged}) and thrown on: what reads the record stops there,
 * and every other workspace goes on.
 */
export const reported = async <T>(read: Promise<T>): Promise<T> => {
  try {
    return await read;
  } catch (error) {
    if (isDamagedRecord(error)) {
      await reportDamaged(error);
    }
    throw error;
  }
};

/**
 * The record of workspace `id`'s running boundary; undefined when there is
 * none or it cannot be read, and a ../../core/src/state-file.ts `DamagedRecord`, reported, when it
 * is there and does not parse.
 */
export const readHeld = (id: string): Promise<Held | undefined> =>
  reported(
    readRecord(join(stateDir(id), "boundary.json"), HeldSchema).catch(
      (error: unknown): Promise<Held | undefined> =>
        isDamagedRecord(error)
          ? Promise.reject(error)
          : Promise.resolve(undefined)
    )
  );

/** Whether a keeper, the current one or a retiring one, holds a live process under `procId`. */
export const holding = async (procId: string): Promise<boolean> =>
  Boolean(await heldProc(procId));

/**
 * The keeper's process running the boundary `held` names, on whichever keeper
 * runs it, when it is still the one that was started.
 */
export const running = async (
  id: string,
  held: Held
): Promise<HeldProc | undefined> => {
  const proc = await heldProc(boundaryProcId(id, held.gen));
  return proc?.pid === held.pid ? proc : undefined;
};

/** Each workspace's start of a boundary under way: one at a time, and whatever ensures one meanwhile waits for it. */
const starting = new Map<string, Promise<Boundary>>();

/** Workspace `id`'s start under way, if any. */
export const startUnderWay = (id: string): Promise<Boundary> | undefined =>
  starting.get(id);

/** Whether a start of workspace `id`'s boundary is under way. */
export const isStarting = (id: string): boolean => starting.has(id);

/**
 * Keeps `underWay` as workspace `id`'s start under way until `work` settles:
 * the one way a start is recorded, so none forgets its end. Whatever ensures
 * one meanwhile waits for `underWay`; `work` is what its caller goes on with,
 * and `ended`, if any, runs in the step the entry goes. Answers `work`.
 */
export const withStart = <T>(
  id: string,
  underWay: Promise<Boundary>,
  work: Promise<T>,
  ended?: () => void
): Promise<T> => {
  starting.set(id, underWay);
  return work.finally(() => {
    starting.delete(id);
    ended?.();
  });
};

/** Where an older boundary still running beside the current one is recorded ({@link Retiring}). */
export const retiringFileOf = (id: string, old: Pick<Held, "gen">): string =>
  join(stateDir(id), `retiring-${old.gen}.json`);

const RETIRING_FILE = /^retiring-[^/]+\.json$/u;

/** Every older boundary of workspace `id` recorded as still running beside the current one. */
export const readRetiring = async (id: string): Promise<Retiring[]> => {
  const names = await readdir(stateDir(id)).catch(() => [] as string[]);
  const records = await Promise.all(
    names
      .filter((name) => RETIRING_FILE.test(name))
      .map((name) =>
        reported(readRecord(join(stateDir(id), name), HeldSchema)).catch(
          () => undefined
        )
      )
  );
  return records.filter((record): record is Retiring => Boolean(record));
};

/** Each workspace's close under way (quiet, looks.ts `closeQuietly`, or an archive's, holding.ts `closedWhile`); it never rejects. An ensure waits for it. */
const closing = new Map<string, Promise<void>>();

/** Workspace `id`'s close under way, if any. */
export const closeUnderWay = (id: string): Promise<void> | undefined =>
  closing.get(id);

/** Whether a close of workspace `id`'s boundary is under way. */
export const isClosing = (id: string): boolean => closing.has(id);

/**
 * Keeps `underWay` as workspace `id`'s close under way, in place of any before
 * it, until `work` settles: the one way a close is recorded, so none forgets
 * its end. One that replaced it stays on record. Answers `work`.
 */
export const withClose = <T>(
  id: string,
  underWay: Promise<void>,
  work: Promise<T>
): Promise<T> => {
  closing.set(id, underWay);
  return work.finally(() => {
    if (closing.get(id) === underWay) {
      closing.delete(id);
    }
  });
};
