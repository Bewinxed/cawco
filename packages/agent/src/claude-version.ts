import { readFileSync, realpathSync, statSync } from "node:fs";
import { writeJsonAtomic } from "@cawco/core/binary-installation";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { claudeVersionPath } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import type { Subprocess } from "bun";
import { CLAUDE_NOT_INSTALLED, resolveClaudeExecutable } from "./auth";

/**
 * The oldest Claude Code CawCo runs at all ({@link claudeToStart}).
 * Its reason, Claude Code's CHANGELOG under 2.1.301: "Fixed sign-in refresh
 * timeouts and unexpected sign-outs after a short command such as `claude
 * auth status` or `claude plugin list` exited in the middle of a token
 * refresh". Below it, a refresh cut short can leave an account dir's stored
 * login blank (anthropics/claude-code#88583: the lock "protect[s] the save,
 * not the network call"), and every process on that dir is signed out after.
 */
export const CLAUDE_VERSION_FLOOR = "2.1.301";

/**
 * The first Claude Code whose initialize reply carries `claude_code_version`
 * ("Absent on CLIs that predate the field", sdk.d.ts 0.3.296). Read off the
 * installed binaries: 2.1.288 has no such field in its reply, 2.1.299 does.
 * A reply without it is from a CLI older than this, so older than
 * {@link CLAUDE_VERSION_FLOOR} too.
 */
export const INITIALIZE_SAYS_VERSION_FROM = "2.1.299";

const VERSION = /^(\d+)\.(\d+)\.(\d+)/;

/** Whether `version` (`x.y.z`, anything after it ignored) is older than `than`. */
export const olderThan = (version: string, than: string): boolean => {
  const a = VERSION.exec(version)?.slice(1).map(Number) ?? [0, 0, 0];
  const b = VERSION.exec(than)?.slice(1).map(Number) ?? [0, 0, 0];
  for (const [at, part] of a.entries()) {
    const other = b[at] ?? 0;
    if (part !== other) {
      return part < other;
    }
  }
  return false;
};

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

/** The first `x.y.z` that `claude --version` prints. */
const SAID = /\d+\.\d+\.\d+/;

/**
 * The version read of one binary: the file it is (`<real path>:<mtime>:<size>`),
 * the version its `claude --version` says, and that process while it runs
 * (none for a version kept on disk).
 */
interface VersionRead {
  binary: string;
  child: Subprocess | undefined;
  version: Promise<string | undefined>;
}

/** The read of the binary `claude` resolved to last; the one kept on disk until the first call. */
let read: VersionRead | undefined;
/** Whether the version kept on disk has been taken up ({@link keptRead}). */
let loaded = false;
/** The last version a read answered, which a change is said against. */
let known: string | undefined;

/** The version kept on disk by the last read that answered, on this agent or one before it. */
const keptRead = (): VersionRead | undefined => {
  let kept: { binary?: unknown; version?: unknown };
  try {
    kept = JSON.parse(readFileSync(claudeVersionPath(), "utf8"));
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

/** Starts `path --version` and reads it to its end. One that cannot even be run says no version. */
const readVersion = (path: string, binary: string): VersionRead => {
  let child: Subprocess<"ignore", "pipe", "ignore"> | undefined;
  let version: Promise<string | undefined>;
  try {
    child = Bun.spawn([path, "--version"], {
      env: hostEnvironment(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    version = Promise.all([new Response(child.stdout).text(), child.exited])
      .then(([said, code]) => (code === 0 ? SAID.exec(said)?.[0] : undefined))
      .catch(() => undefined);
  } catch {
    version = Promise.resolve(undefined);
  }
  const reading: VersionRead = { binary, version, child };
  // biome-ignore lint/complexity/noVoid: the change is said and kept when the read lands; callers take the version itself
  void version.then(async (answered) => {
    if (!answered) {
      // Not kept, so the next call asks again.
      if (read === reading) {
        read = undefined;
      }
      return;
    }
    if (known && answered !== known) {
      console.info(
        `[claude] this machine's Claude Code changed from ${known} to ${answered}: each Claude session on another version goes to sleep once it is at rest, and wakes on ${answered}`
      );
    }
    known = answered;
    try {
      await writeJsonAtomic(claudeVersionPath(), { binary, version: answered });
    } catch (error) {
      console.warn(
        `[claude] Claude Code ${answered} was not kept in ${claudeVersionPath()}, so the next agent reads it again: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
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
export const claudeHostVersion = (): Promise<Bounded<string | undefined>> => {
  const none = Promise.resolve({ kind: "answered" as const, value: undefined });
  const path = resolveClaudeExecutable();
  if (!path) {
    return none;
  }
  let binary: string;
  try {
    const real = realpathSync(path);
    const { mtimeMs, size } = statSync(real);
    binary = `${real}:${mtimeMs}:${size}`;
  } catch {
    return none;
  }
  if (!loaded) {
    loaded = true;
    read = keptRead();
  }
  if (read?.binary !== binary) {
    if (read?.child && read.child.exitCode === null) {
      read.child.kill();
    }
    read = readVersion(path, binary);
  }
  // The read is shared and outlives this wait, so the wait's end is not passed on to it.
  const { version } = read;
  return readWithin(VERSION_WAIT_MS, () => version);
};

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
      return `Claude Code on this machine hasn't said its version yet (\`claude --version\` gave no answer in ${Math.round(version.after / 1000)} s), so CawCo can't tell it is ${CLAUDE_VERSION_FLOOR} or newer, the oldest it runs.`;
    case "answered":
      if (!version.value) {
        return `Claude Code on this machine didn't say its version, so CawCo can't tell it is ${CLAUDE_VERSION_FLOOR} or newer, the oldest it runs.`;
      }
      return olderThan(version.value, CLAUDE_VERSION_FLOOR)
        ? `Claude Code ${version.value} on this machine is older than ${CLAUDE_VERSION_FLOOR}, the oldest CawCo runs, because older ones can sign an account out when a sign-in refresh is cut short: run \`claude update\` there.`
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
  const path = resolveClaudeExecutable();
  if (!path) {
    throw new ClaudeRefused("not-installed", CLAUDE_NOT_INSTALLED);
  }
  const refused = versionRefusal(await claudeHostVersion());
  if (refused) {
    throw new ClaudeRefused("version", refused);
  }
  return path;
};
