import { homedir, platform } from "node:os";
import {
  type AccountInfo,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AuthState } from "@cawco/core";

/** The keychain item Claude Code keeps its OAuth credentials in on macOS. */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/** `errSecInteractionNotAllowed`: the item is there, this session may not read it. */
const SEC_INTERACTION_NOT_ALLOWED = 36;

/** Long enough for the CLI to boot and answer, short enough to not hold a start-up. */
const PROBE_TIMEOUT_MS = 20_000;

/**
 * A prompt that never yields. `query()` starts the CLI and its control channel
 * without it, which is the whole point: the probe is a control call, so it costs
 * a process and no tokens.
 */
const idle: AsyncIterable<SDKUserMessage> = {
  [Symbol.asyncIterator]: () => ({
    next: () =>
      new Promise<never>(() => {
        // never resolves: this iterable is deliberately silent, forever
      }),
  }),
};

/**
 * Whether the account the CLI reports is one it can actually authenticate with.
 *
 * Observed shapes, from `accountInfo()` on real machines:
 *   logged in     `{ email, organization, subscriptionType, apiProvider: 'firstParty' }`
 *   env token     `{ tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN', apiProvider: 'firstParty' }`
 *   api key       `{ tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY', … }`
 *   nothing       `{ tokenSource: 'none', apiProvider: 'firstParty' }`
 *
 * so the test is for positive evidence of a credential rather than for the empty
 * case. A third-party provider carries none of these fields and authenticates
 * outside Claude Code entirely — AWS credentials, gcloud ADC — so it is taken at
 * its word. This says a credential is *reachable*, not that the server accepts
 * it; a stale token still reads as authenticated until it is used.
 */
const credentialed = (account: AccountInfo): boolean => {
  if (account.apiProvider && account.apiProvider !== "firstParty") {
    return true;
  }
  const token = account.tokenSource;
  return Boolean(
    account.email ?? account.apiKeySource ?? (token && token !== "none")
  );
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
 * What this machine can do about Claude Code credentials, asked of the SDK
 * rather than guessed from a file: `accountInfo()` is the CLI's own answer, and
 * it is the same answer a session would get. Only when it comes back empty is
 * the platform asked to tell apart "nobody has logged in here" from "somebody
 * has, and this process cannot reach it".
 *
 * A probe that cannot get an answer at all reports `unauthenticated`: whatever
 * stopped it would stop a session too, and the fleet is better off saying so.
 */
export const probeAuth = async (): Promise<AuthState> => {
  const handle = query({ prompt: idle });
  const account = await Promise.race([
    handle.accountInfo(),
    Bun.sleep(PROBE_TIMEOUT_MS).then(() => undefined),
  ]).catch(() => undefined);
  handle.close();

  if (account && credentialed(account)) {
    return "authenticated";
  }

  // Absence of evidence is not evidence of absence.
  //
  // `accountInfo()` answers `{tokenSource: 'none', apiProvider: 'firstParty'}`
  // on machines whose sessions work perfectly — measured: a Mac returning
  // exactly that shape answered a turn seconds later. So an empty answer says
  // nothing, and reporting `unauthenticated` from it puts "needs sign in" on a
  // working machine and sends the reader off to fix what is not broken.
  //
  // Only a refusal is positive evidence: `errSecInteractionNotAllowed` means
  // credentials are there and this process cannot reach them. Everything else
  // gets the benefit of the doubt, because a session that genuinely cannot
  // answer will say so itself, in the turn, where it is unambiguous.
  return (await keychainRefused()) ? "unreadable-credentials" : "authenticated";
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
