import { platform } from "node:os";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { keychainLocked, loginKeychainPath } from "./login-keychain";

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

/** What a machine with no `claude` on the agent's PATH says, wherever it is asked. */
export const CLAUDE_NOT_INSTALLED =
  "Claude Code is not installed on this machine";

/**
 * The Claude Code installed on this machine: the absolute path of the
 * `claude` on the agent's PATH. CawCo carries no Claude Code of its own: the
 * installed one holds the person's login (on macOS its Keychain item is tied
 * to it), carries their plugins and updates itself.
 */
export const resolveClaudeExecutable = (): string | undefined =>
  Bun.which("claude") ?? undefined;

/**
 * The one way every SDK call finds its CLI. Absolute, because the SDK
 * rejects a bare name (it checks the path exists); without it the SDK would
 * reach for its own platform package instead.
 */
export const claudeExecutableOptions = (): {
  pathToClaudeCodeExecutable: string;
} => {
  const path = resolveClaudeExecutable();
  if (!path) {
    throw new Error(CLAUDE_NOT_INSTALLED);
  }
  return { pathToClaudeCodeExecutable: path };
};

/**
 * `errSecAuthFailed` (-25293), as `security` exits with it: the OSStatus's
 * low byte, as errSecInteractionNotAllowed's -25308 exits 36
 * (accounts.ts). Its message is "The user name or passphrase you entered is
 * not correct." (SecBase.h), so the exit, not the words, says the password
 * was wrong, in any system language.
 */
const SEC_AUTH_FAILED = 51;

/**
 * Unlocks this machine's login keychain with the password the reader typed in
 * the dashboard; the caller then says what the machine can do afterwards.
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
export const unlockKeychain = async (password: string): Promise<void> => {
  if (platform() !== "darwin") {
    throw new Error(
      "Only macOS keeps its credentials in a keychain that locks."
    );
  }
  if (!password) {
    throw new Error("The keychain password is required.");
  }

  const keychain = loginKeychainPath();
  const lockedBefore = keychainLocked(keychain);
  const unlocked =
    await Bun.$`security unlock-keychain -p ${password} ${keychain}`
      .quiet()
      .nothrow();
  // The keychain's own lock state says whether it opened (login-keychain.ts,
  // SecKeychainGetStatus); the exit only says why one still locked did not.
  // Live on a Mac the right password left it unlocked while the step said it
  // had refused it, and the agent never read Claude again or beat: the
  // answer had gone on the exit alone.
  const lockedAfter = keychainLocked(keychain);
  // The tool's own words: `security` prints the OSStatus's message and the
  // keychain's path, never the password it was given.
  const said = unlocked.stderr.toString().trim();
  console.info(
    `[keychain] security unlock-keychain ${keychain}: exit ${unlocked.exitCode}${said ? ` (${said})` : ""}; locked before ${lockedBefore}, after ${lockedAfter}`
  );
  if (!lockedAfter) {
    return;
  }
  if (unlocked.exitCode === SEC_AUTH_FAILED) {
    throw new Error("That password did not unlock the keychain.");
  }
  throw new Error(
    `The keychain refused to unlock: ${said || `security exited ${unlocked.exitCode} and the keychain is still locked`}`
  );
};
