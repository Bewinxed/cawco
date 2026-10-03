import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AuthState } from "@cawco/core";

/** The keychain item Claude Code keeps its OAuth credentials in on macOS. */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/** `errSecInteractionNotAllowed`: the item is there, this session may not read it. */
const SEC_INTERACTION_NOT_ALLOWED = 36;

/** Long enough for the CLI to boot and answer, short enough to not hold a start-up. */
const PROBE_TIMEOUT_MS = 20_000;

/**
 * A prompt that never yields. `query()` starts the CLI and its control channel
 * without it, letting MCP status probes make control calls without a model
 * turn. This costs a process and no tokens.
 */
export const idle: AsyncIterable<SDKUserMessage> = {
  [Symbol.asyncIterator]: () => ({
    next: () =>
      new Promise<never>(() => {
        // never resolves: this iterable is deliberately silent, forever
      }),
  }),
};

/** The native CLI selected by the SDK's default platform-package resolution. */
export const resolveClaudeExecutable = (): string | undefined => {
  const require = createRequire(
    import.meta.resolve("@anthropic-ai/claude-agent-sdk")
  );
  const name = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const report =
    process.platform === "linux" ? process.report?.getReport() : null;
  const musl =
    report !== null &&
    typeof report === "object" &&
    (report as { header?: { glibcVersionRuntime?: string } }).header
      ?.glibcVersionRuntime === undefined;
  let packages = [name];
  if (process.platform === "android") {
    packages = [`@anthropic-ai/claude-agent-sdk-linux-${process.arch}-android`];
  } else if (process.platform === "linux") {
    packages = musl ? [`${name}-musl`, name] : [name, `${name}-musl`];
  }
  const binary = process.platform === "win32" ? "claude.exe" : "claude";
  for (const pkg of packages) {
    try {
      const path = require.resolve(`${pkg}/${binary}`);
      if (existsSync(path)) {
        return path;
      }
    } catch {
      // An optional platform package that is not installed is not a CLI.
    }
  }
  return undefined;
};

/**
 * Whether macOS is holding credentials this process is not allowed to read.
 * Exit 36 is the whole signal — a missing item exits 44 instead.
 */
const keychainRefused = async (): Promise<boolean> => {
  if (platform() !== "darwin") {
    return false;
  }
  const secret =
    await Bun.$`security find-generic-password -s ${KEYCHAIN_SERVICE} -w`
      .quiet()
      .nothrow();
  return secret.exitCode === SEC_INTERACTION_NOT_ALLOWED;
};

/**
 * Claude Code's own login check, run with the agent's environment and the same
 * bundled executable sessions launch. `loggedIn` says whether the CLI has a
 * credential it would use, including environment credentials and providers.
 * The CLI reads the macOS keychain itself, so a working Mac is authenticated;
 * a logged-out answer with a keychain refusal is `unreadable-credentials`.
 *
 * A probe that cannot get an answer at all reports `unauthenticated`: whatever
 * stopped it would stop a session too, and the fleet is better off saying so.
 */
export const probeAuth = async (): Promise<AuthState> => {
  try {
    const executable = resolveClaudeExecutable();
    if (!executable) {
      return "unauthenticated";
    }
    const child = Bun.spawn([executable, "auth", "status", "--json"], {
      env: process.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      timeout: PROBE_TIMEOUT_MS,
    });
    const [output] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    if (child.signalCode !== null) {
      return "unauthenticated";
    }
    // Exit 1 with loggedIn:false is the CLI's normal logged-out answer.
    const status = JSON.parse(output) as { loggedIn?: unknown } | null;
    if (status?.loggedIn === true) {
      return "authenticated";
    }
    if (status?.loggedIn === false) {
      return (await keychainRefused())
        ? "unreadable-credentials"
        : "unauthenticated";
    }
  } catch {
    // A missing, timed-out or unreadable CLI answer cannot authenticate a session.
  }
  return "unauthenticated";
};

/**
 * Unlocks this machine's login keychain with the password the reader typed in
 * the dashboard, then reports what the machine can do afterwards.
 *
 * Why this exists at all: on macOS the login keychain is bound to the Aqua
 * session, and a locked one refuses every read with
 * `errSecInteractionNotAllowed`. The daemon then reports
 * `unreadable-credentials` and every turn on that machine answers "Not logged
 * in" — a fleet tool whose answer to that is "go and open a terminal on the
 * other machine" has stopped being a fleet tool.
 *
 * The password is used and dropped. It is never stored, never logged, and never
 * travels anywhere but into this one call.
 */
export const unlockKeychain = async (password: string): Promise<AuthState> => {
  if (platform() !== "darwin") {
    throw new Error(
      "Only macOS keeps its credentials in a keychain that locks."
    );
  }
  if (!password) {
    throw new Error("The keychain password is required.");
  }

  const keychain = `${homedir()}/Library/Keychains/login.keychain-db`;
  const unlocked =
    await Bun.$`security unlock-keychain -p ${password} ${keychain}`
      .quiet()
      .nothrow();
  if (unlocked.exitCode !== 0) {
    // The tool's own words, minus anything that might echo the password back.
    const said = unlocked.stderr.toString().trim();
    throw new Error(
      said.includes("password")
        ? "That password did not unlock the keychain."
        : `The keychain refused to unlock: ${said || `exit ${unlocked.exitCode}`}`
    );
  }
  return await probeAuth();
};
