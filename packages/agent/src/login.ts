import { homedir, platform, userInfo } from "node:os";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  saveCredentials,
} from "@whiffle/auth";
import type { AuthState } from "@whiffle/core";
import { probeAuth } from "./auth";

/**
 * Logging a machine in from the dashboard, over the tunnel.
 *
 * The alternative this replaces: open a terminal on the other machine. That is
 * the one thing this product exists to make unnecessary, and it was the standing
 * answer whenever a Mac's login keychain was locked — macOS binds that keychain
 * to the Aqua session, so a daemon that cannot reach it answers every turn with
 * "Not logged in" and there was nothing to do about it from here.
 *
 * Credentials land in `~/.claude/.credentials.json`, which is the file Claude
 * Code itself reads. That is the actual fix rather than a way around the lock:
 * a machine holding a token of its own never has to ask the keychain anything.
 *
 * The reader's part is a browser and a paste. Nothing secret goes near this
 * process except the code they paste, and that is exchanged and dropped.
 */

/**
 * Verifiers for the logins in flight, keyed by the state each authorisation link
 * carries (and that comes back after `#` in the pasted code). Held only in
 * memory: every link this daemon handed out stays redeemable until its code is
 * used or the daemon restarts.
 */
const pending = new Map<string, string>();

export interface LoginChallenge {
  /** Where the reader authorises. Opened in *their* browser, not on the machine. */
  url: string;
}

/** Starts a login and hands back the URL to authorise it. */
// biome-ignore lint/suspicious/useAwait: kept async so callers can uniformly await it alongside completeLogin/probeAuth
export const beginLogin = async (): Promise<LoginChallenge> => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  // The state doubles as the value the authorize page echoes back inside the
  // pasted code, so it is generated the same way the verifier is.
  const state = generateCodeVerifier();
  pending.set(state, verifier);
  return { url: buildAuthorizationUrl(challenge, state) };
};

/**
 * Finishes it with the code the reader pasted, and answers with what this
 * machine can do afterwards — which is the only claim worth making, since a
 * saved token that does not work is indistinguishable from no token at all
 * until something tries to use it.
 */
export const completeLogin = async (code: string): Promise<AuthState> => {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("Paste the code from the authorisation page.");
  }
  const hash = trimmed.indexOf("#");
  const statePart = hash === -1 ? "" : trimmed.slice(hash + 1);
  if (!statePart) {
    throw new Error(
      "Paste the whole code from the authorisation page, including the part after #."
    );
  }
  const verifier = pending.get(statePart);
  if (!verifier) {
    throw new Error(
      "That code belongs to a login this machine didn't start or already used. Open the authorisation page again."
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(trimmed, verifier, statePart);
    await saveCredentials(tokens);
    await storeInKeychain(tokens);
  } finally {
    // Used or refused, the challenge is spent either way.
    pending.delete(statePart);
  }
  return await probeAuth();
};

/** What macOS calls the item Claude Code keeps its account credentials in. */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/**
 * Puts the token where macOS Claude Code actually looks.
 *
 * `~/.claude/.credentials.json` is the whole story on Linux, and on macOS it is
 * not: the account credentials live in the login keychain, and the file there
 * holds only MCP OAuth entries. Writing the file alone therefore *appears* to
 * log the machine in and changes nothing — the CLI goes on reading the expired
 * token it already had, and every turn keeps answering "OAuth session expired".
 *
 * Best effort by design. A locked keychain refuses the write, and the file copy
 * is still correct — a machine that can be fixed by unlocking should not have
 * its login reported as failed.
 */
async function storeInKeychain(tokens: unknown): Promise<void> {
  if (platform() !== "darwin") {
    return;
  }
  const secret = JSON.stringify({ claudeAiOauth: tokens });
  // `-U` updates the item in place when it is already there, which it will be
  // on any machine that has ever been logged in.
  await Bun.$`security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${userInfo().username} -w ${secret}`
    .quiet()
    .nothrow();
}

/** Where Claude Code keeps the file copy of its credentials on every platform. */
const CREDENTIALS_FILE = `${homedir()}/.claude/.credentials.json`;

/**
 * This machine's account credential, for seeding another machine.
 *
 * The fleet is one account, but each machine hoards its own copy of the login —
 * so one expiring while another is fresh strands a machine for no reason the
 * user can see. The machine that works constantly keeps its token alive by
 * using it; the one that sleeps lets it die. Exporting from the healthy one is
 * how a login stops being per-machine.
 */
export const exportCredentials = async (): Promise<Record<string, unknown>> => {
  const file = Bun.file(CREDENTIALS_FILE);
  if (await file.exists()) {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    if (parsed.claudeAiOauth) {
      return { claudeAiOauth: parsed.claudeAiOauth };
    }
  }
  // On macOS the account credential lives in the keychain instead.
  if (platform() === "darwin") {
    const item =
      await Bun.$`security find-generic-password -s ${KEYCHAIN_SERVICE} -w`
        .quiet()
        .nothrow();
    if (item.exitCode === 0) {
      const parsed = JSON.parse(item.stdout.toString().trim()) as Record<
        string,
        unknown
      >;
      if (parsed.claudeAiOauth) {
        return { claudeAiOauth: parsed.claudeAiOauth };
      }
    }
  }
  throw new Error("This machine has no account credential to share.");
};

/**
 * Adopts another machine's credential as this machine's own: the file, and on
 * macOS the keychain item too, which is where the CLI actually reads. Answers
 * with what this machine can do afterwards.
 */
export const importCredentials = async (
  credentials: Record<string, unknown>
): Promise<AuthState> => {
  if (
    // biome-ignore lint/suspicious/noUnnecessaryConditions: credentials arrives over the wire from the dashboard/hub; its declared type is not a runtime guarantee
    !credentials ||
    typeof credentials !== "object" ||
    !credentials.claudeAiOauth
  ) {
    throw new Error("That is not a credential this machine can adopt.");
  }
  // Merged, not replaced: the file also carries MCP OAuth entries.
  const file = Bun.file(CREDENTIALS_FILE);
  const existing = (await file.exists())
    ? // biome-ignore lint/suspicious/noUnnecessaryConditions: `as` is an unchecked cast; JSON.parse returns null for a file literally containing "null" even though the cast type says otherwise
      ((JSON.parse(await file.text()) as Record<string, unknown>) ?? {})
    : {};
  await Bun.write(
    CREDENTIALS_FILE,
    JSON.stringify({ ...existing, claudeAiOauth: credentials.claudeAiOauth })
  );
  await storeInKeychain(credentials.claudeAiOauth);
  return await probeAuth();
};

/**
 * Removes this machine's account credential — file and keychain both.
 *
 * Exists to undo a credential seeded from another machine: one token being
 * used and refreshed from two places is indistinguishable from account abuse,
 * and the fleet must never leave a machine in that state. After this the
 * machine is honestly logged out until it gets a login of its own.
 */
export const clearCredentials = async (): Promise<AuthState> => {
  const file = Bun.file(CREDENTIALS_FILE);
  if (await file.exists()) {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    parsed.claudeAiOauth = undefined;
    await Bun.write(CREDENTIALS_FILE, JSON.stringify(parsed));
  }
  if (platform() === "darwin") {
    await Bun.$`security delete-generic-password -s ${KEYCHAIN_SERVICE}`
      .quiet()
      .nothrow();
  }
  return await probeAuth();
};
