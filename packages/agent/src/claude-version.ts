import { realpathSync, statSync } from "node:fs";
import { CLAUDE_NOT_INSTALLED, resolveClaudeExecutable } from "./auth";
import { toolVersion } from "./capabilities";

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

/** The last version read, by the binary `claude` resolved to then ({@link claudeHostVersion}). */
let read: { binary: string; version: Promise<string | undefined> } | undefined;
/** The last version a read answered, which a change is said against. */
let known: string | undefined;

/**
 * The machine's Claude Code version, as its `claude --version` says it
 * (`x.y.z`). Asked again only when the file `claude` resolves to changed: a
 * `claude update` points the symlink at a new build, an npm update rewrites
 * the file. A read that gave no version is not kept, so the next asks again.
 * Undefined when Claude Code is not installed or did not say.
 *
 * THE VERSION-CHANGE DETECTION: each read that answers a version other than
 * the last says so in the agent's log; the sessions on the old one find out
 * on the supervisor's next sweep ({@link import("./harness").HarnessSession.outdated}).
 */
export const claudeHostVersion = (): Promise<string | undefined> => {
  const path = resolveClaudeExecutable();
  if (!path) {
    return Promise.resolve(undefined);
  }
  let binary: string;
  try {
    const real = realpathSync(path);
    const { mtimeMs, size } = statSync(real);
    binary = `${real}:${mtimeMs}:${size}`;
  } catch {
    return Promise.resolve(undefined);
  }
  if (read?.binary === binary) {
    return read.version;
  }
  // One that could not even be run said no version either.
  const version = toolVersion(path)
    .then((said) => VERSION.exec(said ?? "")?.[0])
    .catch(() => undefined);
  const reading = { binary, version };
  read = reading;
  // biome-ignore lint/complexity/noVoid: the change is said when the read lands; callers take the version itself
  void version.then((answered) => {
    if (!answered) {
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
  });
  return version;
};

/**
 * Why CawCo runs nothing of this machine's Claude Code, in one sentence;
 * nothing when it is {@link CLAUDE_VERSION_FLOOR} or newer. The words
 * {@link claudeToStart} refuses with, and the machine's report says.
 */
export const versionRefusal = (
  version: string | undefined
): string | undefined => {
  if (!version) {
    return `Claude Code on this machine didn't say its version, so CawCo can't tell it is ${CLAUDE_VERSION_FLOOR} or newer, the oldest it runs.`;
  }
  return olderThan(version, CLAUDE_VERSION_FLOOR)
    ? `Claude Code ${version} on this machine is older than ${CLAUDE_VERSION_FLOOR}, the oldest CawCo runs, because older ones can sign an account out when a sign-in refresh is cut short: run \`claude update\` there.`
    : undefined;
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
