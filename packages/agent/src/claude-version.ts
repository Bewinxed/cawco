import { readFile, realpath, stat } from "node:fs/promises";
import { writeJsonAtomic } from "@cawco/core/binary-installation";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import type { FleetItemState } from "@cawco/core/fleet";
import { claudeVersionPath } from "@cawco/core/paths/cawco";
import { hostEnvironment } from "@cawco/core/session-env";
import { spawnRead, untether } from "@cawco/core/tether";
import { secondsOf } from "@cawco/core/time";
import { CLAUDE_VERSION_FLOOR, olderThan } from "@cawco/core/tools";
import { versionSaid } from "@cawco/core/version-said";
import { harnessRefusedWords } from "@cawco/core/words/harness";
import type { Subprocess } from "bun";
import { CLAUDE_NOT_INSTALLED, claudeExecutable } from "./auth";

/**
 * The first Claude Code whose initialize reply carries `claude_code_version`
 * ("Absent on CLIs that predate the field", sdk.d.ts 0.3.296). Read off the
 * installed binaries: 2.1.288 has no such field in its reply, 2.1.299 does.
 * A reply without it is from a CLI older than this, so older than
 * {@link CLAUDE_VERSION_FLOOR} too.
 */
export const INITIALIZE_SAYS_VERSION_FROM = "2.1.299";

/*
 * THE VERSION READ. A binary's version is a fact about the file, so it is
 * read once per file (its real path, mtime and size: a `claude update`
 * points the symlink at a new build, an npm update rewrites the file), by one
 * `claude --version` that runs until it answers, and kept on disk with the
 * file it was read from ({@link claudeVersionPath}). A caller waits for it
 * {@link VERSION_WAIT_MS}; the wait ends there, the read does not.
 *
 * Why, from the nightly of d0ca43009 (stage 2): the gate ({@link
 * claudeToStart}) took the capabilities probe's read, killed at 5 s and
 * held in memory only. On a host whose `--version` answered in 30 s, every
 * read was cut, so every start and every `auth status` was refused: the
 * stand-in's `--version` was cut every minute and no `auth status` was asked
 * in 300 s. Every update restarts the agent, so a memory-only answer was
 * also gone at the moment sessions are relaunched and sign-ins re-read.
 */

/**
 * How long a caller waits for the machine's Claude Code to say its version
 * ({@link claudeHostVersion}). Our choice, because: every start and each
 * minute's read of the account dirs waits on it, and five seconds is what
 * they waited before. A read still running past it is answered `unanswered`,
 * and the next caller finds its answer.
 */
const VERSION_WAIT_MS = 5000;

/**
 * The version read of one binary: the file it is (`<real path>:<mtime>:<size>`),
 * the version its `claude --version` says, and that process while it runs
 * (none for a version kept on disk).
 */
interface VersionRead {
  binary: string;
  child: Subprocess | undefined;
  version: Promise<string | undefined>;
  /** A caller's wait ran out before it answered: its answer is news ({@link onVersionAnswered}). */
  waitedOut?: true;
}

/** What hears a version read answer after a caller stopped waiting for it ({@link onVersionAnswered}). */
const answeredListeners = new Set<() => void>();

/**
 * Listens for a version read that a caller stopped waiting for
 * ({@link VERSION_WAIT_MS}) finally answering, a version or none: what that
 * caller said of the machine's Claude Code ("hasn't said its version yet")
 * is out of date from then, and the gate ({@link claudeToStart}) already
 * reads the answer. Answers the way to stop.
 */
export const onVersionAnswered = (listener: () => void): (() => void) => {
  answeredListeners.add(listener);
  return () => answeredListeners.delete(listener);
};

/** The read of the binary `claude` resolved to last; the one kept on disk until the first call. */
let read: VersionRead | undefined;
/** The version kept on disk, read once, off the loop ({@link keptRead}). */
let loaded: Promise<VersionRead | undefined> | undefined;
/** The last version a read answered, which a change is said against. */
let known: string | undefined;

/** The version kept on disk by the last read that answered, on this agent or one before it. */
const keptRead = async (): Promise<VersionRead | undefined> => {
  let kept: { binary?: unknown; version?: unknown };
  try {
    kept = JSON.parse(await readFile(claudeVersionPath(), "utf8"));
  } catch {
    return undefined;
  }
  if (typeof kept.binary !== "string" || typeof kept.version !== "string") {
    return undefined;
  }
  known = kept.version;
  return {
    binary: kept.binary,
    version: Promise.resolve(kept.version),
    child: undefined,
  };
};

/** Tells every {@link onVersionAnswered} listener. */
const tellAnswered = (): void => {
  for (const listener of answeredListeners) {
    listener();
  }
};

/**
 * Starts `path --version` and reads it to its end. One that cannot even be
 * run says no version. It outlives a caller's wait on purpose (its late
 * answer is news, {@link onVersionAnswered}), never the agent: it runs
 * tethered (core tether.ts `spawnRead`) off Windows, so an agent that ends however it
 * ends, mid-read, ends it too, where a plain spawn was left running,
 * reparented.
 */
const readVersion = (path: string, binary: string): VersionRead => {
  let child: Subprocess<"pipe", "pipe", "ignore"> | undefined;
  let version: Promise<string | undefined>;
  try {
    const spawned = spawnRead([path, "--version"], {
      env: hostEnvironment(),
      stderr: "ignore",
    });
    child = spawned;
    version = Promise.all([new Response(spawned.stdout).text(), spawned.exited])
      .then(([said, code]) => (code === 0 ? versionSaid(said) : undefined))
      .catch(() => undefined)
      .finally(() => untether(spawned.stdin));
  } catch {
    version = Promise.resolve(undefined);
  }
  const reading: VersionRead = { binary, version, child };
  detach(
    version.then(async (answered) => {
      // Still the binary's read, and a caller said it gave no answer: its
      // answer goes out now, read afresh by the listeners.
      const news = reading.waitedOut === true && read === reading;
      // None is not kept, so the next call asks again.
      if (!answered && read === reading) {
        read = undefined;
      }
      if (news) {
        tellAnswered();
      }
      if (!answered) {
        return;
      }
      if (known && answered !== known) {
        console.info(
          `[claude] this machine's Claude Code changed from ${known} to ${answered}: each Claude session on another version goes to sleep once it is at rest, and wakes on ${answered}`
        );
      }
      known = answered;
      try {
        await writeJsonAtomic(claudeVersionPath(), {
          binary,
          version: answered,
        });
      } catch (error) {
        console.warn(
          `[claude] Claude Code ${answered} was not kept in ${claudeVersionPath()}, so the next agent reads it again: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }),
    "then"
  );
  return reading;
};

/**
 * The machine's Claude Code version, as its `claude --version` says it
 * (`x.y.z`), waited for {@link VERSION_WAIT_MS} (THE VERSION READ above).
 * Answered with no version when Claude Code is not installed or did not say;
 * unanswered while its read is still running. A new binary's read ends the
 * one before it if that one is still running.
 *
 * THE VERSION-CHANGE DETECTION: each read that answers a version other than
 * the last says so in the agent's log; the sessions on the old one find out
 * on the supervisor's next sweep ({@link import("./harness").HarnessSession.outdated}).
 */
export const claudeHostVersion = async (): Promise<
  Bounded<string | undefined>
> => {
  const none = { kind: "answered" as const, value: undefined };
  const path = await claudeExecutable();
  if (!path) {
    return none;
  }
  // The binary and the version kept on disk, read off the loop; from here
  // to the read's start nothing awaits, so calls at once share one read.
  let binary: string;
  try {
    const real = await realpath(path);
    const { mtimeMs, size } = await stat(real);
    binary = `${real}:${mtimeMs}:${size}`;
  } catch {
    return none;
  }
  if (loaded) {
    await loaded;
  } else {
    loaded = keptRead();
    read = await loaded;
  }
  if (read?.binary !== binary) {
    if (read?.child && read.child.exitCode === null) {
      read.child.kill();
    }
    read = readVersion(path, binary);
  }
  // The read is shared and outlives this wait, so the wait's end is not passed on to it.
  const reading = read;
  const said = await readWithin(VERSION_WAIT_MS, () => reading.version);
  if (said.kind === "unanswered") {
    reading.waitedOut = true;
  }
  return said;
};

/**
 * The fix a refusal ends on, a copy older than the floor's and one that
 * said no version alike: the press that runs Claude Code's own updater on
 * the machine (core TOOL_CATALOG's `claude`), wherever the refusal stands
 * in the dashboard (`HarnessBlock`). Whether the hub sends that update with
 * no press is the fleet's choice and whose the copy is (hub
 * tool-installs.ts `keepCopies`): the machine's tool status says it, not
 * this sentence.
 */
const UPDATE_FIX =
  "Update Claude Code on this machine, and CawCo runs it again: nothing was started or signed in.";

/**
 * Why CawCo runs nothing of this machine's Claude Code, in one sentence;
 * nothing when it is {@link CLAUDE_VERSION_FLOOR} or newer. The words
 * {@link claudeToStart} refuses with, and the machine's report says.
 */
export const versionRefusal = (
  version: Bounded<string | undefined>
): string | undefined => {
  switch (version.kind) {
    case "unanswered":
      return harnessRefusedWords.claudeVersionUnsaid(
        secondsOf(version.after),
        CLAUDE_VERSION_FLOOR
      );
    case "answered":
      if (!version.value) {
        return `Claude Code on this machine didn't say its version, so CawCo can't tell it is ${CLAUDE_VERSION_FLOOR} or newer, the oldest it runs. ${UPDATE_FIX}`;
      }
      return olderThan(version.value, CLAUDE_VERSION_FLOOR)
        ? `Claude Code ${version.value} on this machine is older than ${CLAUDE_VERSION_FLOOR}, the oldest CawCo runs, because older ones can sign an account out when a sign-in refresh is cut short. ${UPDATE_FIX}`
        : undefined;
    default:
      return version satisfies never;
  }
};

/**
 * What {@link claudeToStart} refuses with: its message is the one sentence,
 * `reason` which of the two it is.
 */
export class ClaudeRefused extends Error {
  readonly reason: "not-installed" | "version";
  constructor(reason: ClaudeRefused["reason"], message: string) {
    super(message);
    this.name = "ClaudeRefused";
    this.reason = reason;
  }

  /** A fleet item that needed this Claude Code, failed for this refusal. */
  get itemState(): FleetItemState {
    return {
      state: "failed",
      cause: this.reason === "version" ? "cli-too-old" : "cli-missing",
      detail: this.message,
    };
  }
}

/**
 * THE GATE every start of this machine's Claude Code goes through: a
 * session, `claude auth status`, `auth login` and `logout`, an account's
 * probe, the MCP status read, the plugin commands. The path to run, or
 * {@link ClaudeRefused} with {@link CLAUDE_NOT_INSTALLED} or
 * {@link versionRefusal}'s sentence. Asking its version
 * ({@link claudeHostVersion}) is the one run that does not go through it.
 */
export const claudeToStart = async (): Promise<string> => {
  const path = await claudeExecutable();
  if (!path) {
    throw new ClaudeRefused("not-installed", CLAUDE_NOT_INSTALLED);
  }
  const refused = versionRefusal(await claudeHostVersion());
  if (refused) {
    throw new ClaudeRefused("version", refused);
  }
  return path;
};
