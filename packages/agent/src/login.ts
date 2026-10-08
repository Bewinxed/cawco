import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AccountIdentity,
  type AccountKind,
  type AccountSigninResult,
  sameIdentity,
} from "@cawco/core";
import { accountIds, accountsRoot } from "@cawco/core/paths";
import {
  bootId,
  markerIsLive,
  processStart,
} from "@cawco/core/process-identity";
import type { Subprocess } from "bun";
import {
  accountEnv,
  bareEnv,
  linkUserLayer,
  probeAccount,
  removeAccountDir,
} from "./accounts";
import { resolveClaudeExecutable } from "./auth";

/**
 * Signing an account in on a machine from the dashboard, over the tunnel, in
 * that account's own config dir (`~/.cawco/accounts/<id>/claude`).
 *
 * The sign-in is Claude Code's own: the daemon runs the unmodified
 * `claude auth login` under a pseudo-terminal, hands the authorisation link it
 * prints to the reader, and types the code they paste back into it. The CLI
 * exchanges the code and stores the login where it always does — the macOS
 * keychain, or `.credentials.json` in its config directory when the keychain
 * refuses the write (a daemon outside the GUI session, a locked keychain) and
 * on Linux. Nothing here ever holds a token: Anthropic's terms require sign-in
 * to complete through Anthropic's own flow, and a credential that never leaves
 * its machine's store cannot be clobbered by a copy of itself.
 */

/** The prompt `claude auth login` shows once its link is printed. */
const PROMPT = "Paste code here";

/** The authorisation link in what the CLI printed before that prompt. */
const LINK = /https:\/\/\S+/;

/** Long enough for the CLI to boot and print its link. */
const LINK_TIMEOUT_MS = 30_000;

/** Long enough for the CLI to exchange the code and store the login. */
const EXCHANGE_TIMEOUT_MS = 60_000;

/**
 * A sign-in in flight: one per config dir, since each `claude auth login`
 * mints its own PKCE challenge and only the process that printed a link can
 * redeem that link's code.
 */
interface SignIn {
  readonly child: Subprocess;
  /** Called on every chunk of output, while something is waiting on it. */
  heard?: () => void;
  /** Everything the CLI has printed, ANSI and all. */
  output: string;
  readonly terminal: Bun.Terminal;
}

/** The sign-ins in flight, by account id. */
const inFlight = new Map<string, SignIn>();

export interface LoginChallenge {
  /** Where the reader authorises. Opened in *their* browser, not on the machine. */
  url: string;
}

const end = (signIn: SignIn) => {
  signIn.child.kill();
  signIn.terminal.close();
};

/**
 * Ends every sign-in still waiting for a code, synchronously, for the
 * daemon's exit: the CLI outlives the daemon's terminal otherwise, and a
 * daemon started again knows nothing of it, so nothing could ever end it.
 */
export const endSignIns = (): void => {
  for (const [account, signIn] of inFlight) {
    end(signIn);
    rmSync(markerFile(account), { force: true });
  }
  inFlight.clear();
};

/**
 * An account's waiting `claude auth login`, named on disk beside its config
 * dir (`~/.cawco/accounts/<id>/login.pid`): its pid, start time and boot. A
 * daemon that was killed or crashed ends no login; the next one to start
 * reads these and ends each that is still the same process.
 */
interface LoginMarker {
  bootId?: string;
  pid: number;
  procStart?: string;
}

const markerFile = (account: string): string =>
  join(accountsRoot(), account, "login.pid");

const readMarker = (account: string): LoginMarker | undefined =>
  existsSync(markerFile(account))
    ? (JSON.parse(readFileSync(markerFile(account), "utf8")) as LoginMarker)
    : undefined;

const markLogin = async (account: string, pid: number): Promise<void> => {
  const [procStart, boot] = await Promise.all([processStart(pid), bootId()]);
  const marker: LoginMarker = {
    pid,
    ...(procStart ? { procStart } : {}),
    ...(boot ? { bootId: boot } : {}),
  };
  writeFileSync(markerFile(account), JSON.stringify(marker));
};

/** Drops the marker while it still names `pid`: a newer login's stays. */
const unmarkLogin = (account: string, pid: number): void => {
  if (readMarker(account)?.pid === pid) {
    rmSync(markerFile(account), { force: true });
  }
};

/**
 * At daemon start: ends every account login an earlier daemon left waiting
 * (its marker names a live process with the same start time), and drops
 * every marker.
 */
export const endOrphanedSignIns = async (): Promise<void> => {
  for (const account of accountIds()) {
    const marker = readMarker(account);
    if (!marker) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one marker per account, each read and ended before the next
    if (await markerIsLive(marker)) {
      try {
        process.kill(marker.pid, "SIGTERM");
      } catch (error) {
        // Gone between the check and the signal: nothing left to end.
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          throw error;
        }
      }
    }
    rmSync(markerFile(account), { force: true });
  }
};

/** What the CLI printed since `from`, as the text a terminal would show. */
const said = (signIn: SignIn, from = 0) =>
  Bun.stripANSI(signIn.output.slice(from)).trim();

/** Resolves true once `done` holds, false once the CLI exits or `ms` passes. */
const until = (signIn: SignIn, done: () => boolean, ms: number) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (answer: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signIn.heard = undefined;
      resolve(answer);
    };
    const timer = setTimeout(() => settle(done()), ms);
    signIn.heard = () => {
      if (done()) {
        settle(true);
      }
    };
    // biome-ignore lint/complexity/noVoid: the exit only settles the wait; its value is read from the process
    void signIn.child.exited.then(() => settle(done()));
    signIn.heard();
  });

/**
 * Starts `claude auth login` in an account's config dir and hands back the
 * link it prints. A Console account signs in with `--console`; a
 * subscription with the CLI's default.
 */
const beginSignIn = async (
  account: string,
  kind: AccountKind
): Promise<LoginChallenge> => {
  const previous = inFlight.get(account);
  if (previous) {
    end(previous);
    inFlight.delete(account);
  }
  const executable = resolveClaudeExecutable();
  if (!executable) {
    throw new Error("Claude Code is not installed on this machine.");
  }
  const decoder = new TextDecoder();
  let signIn: SignIn | undefined;
  const terminal = new Bun.Terminal({
    // Wide enough that the link is never wrapped across lines.
    cols: 4096,
    data(_terminal, bytes) {
      if (signIn) {
        signIn.output += decoder.decode(bytes, { stream: true });
        signIn.heard?.();
      }
    },
  });
  signIn = {
    child: Bun.spawn(
      [
        executable,
        "auth",
        "login",
        ...(kind === "console" ? ["--console"] : []),
      ],
      {
        // `true` as the browser: the link is for the reader's browser, not
        // one on this machine.
        env: { ...bareEnv(), ...accountEnv(account), BROWSER: "true" },
        terminal,
      }
    ),
    output: "",
    terminal,
  };
  inFlight.set(account, signIn);
  const current = signIn;
  const { pid } = current.child;
  await markLogin(account, pid);
  // biome-ignore lint/complexity/noVoid: the marker goes however the login ends; nothing waits on it
  void current.child.exited.then(() => unmarkLogin(account, pid));

  const prompted = await until(
    current,
    () => current.output.includes(PROMPT),
    LINK_TIMEOUT_MS
  );
  const url = said(current).match(LINK)?.[0];
  if (!(prompted && url)) {
    end(current);
    if (inFlight.get(account) === current) {
      inFlight.delete(account);
    }
    throw new Error(
      said(current) || "`claude auth login` printed no sign-in link."
    );
  }
  return { url };
};

/**
 * Types the code the reader pasted into the dir's waiting `claude auth
 * login`, and waits for it to exchange the code and store the login.
 */
const finishSignIn = async (account: string, code: string): Promise<void> => {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("Paste the code from the authorisation page.");
  }
  const signIn = inFlight.get(account);
  if (!signIn || signIn.child.exitCode !== null) {
    throw new Error(
      "That code belongs to a login this machine didn't start or already used. Open the authorisation page again."
    );
  }
  // Used or refused, the sign-in is spent either way.
  inFlight.delete(account);

  const from = signIn.output.length;
  signIn.terminal.write(`${trimmed}\r`);
  const exited = await until(
    signIn,
    () => signIn.child.exitCode !== null,
    EXCHANGE_TIMEOUT_MS
  );
  const { exitCode } = signIn.child;
  end(signIn);
  if (!exited || exitCode !== 0) {
    throw new Error(
      said(signIn, from) ||
        (exited
          ? `\`claude auth login\` exited with code ${exitCode}.`
          : "`claude auth login` did not finish signing in.")
    );
  }
};

/**
 * Starts an account's sign-in in its own config dir, with the fleet's user
 * layer linked in first so the dir is a whole Claude Code home from its first
 * session.
 */
export const beginAccountLogin = async (
  account: string,
  kind: AccountKind
): Promise<LoginChallenge> => {
  await linkUserLayer(account);
  return beginSignIn(account, kind);
};

/** Runs `claude auth logout` in an account's dir: Claude Code signs it out itself. */
const logout = async (account: string): Promise<void> => {
  const executable = resolveClaudeExecutable();
  if (!executable) {
    return;
  }
  const child = Bun.spawn([executable, "auth", "logout"], {
    env: { ...bareEnv(), ...accountEnv(account) },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  });
  if ((await child.exited) !== 0) {
    const why = Bun.stripANSI(await new Response(child.stderr).text()).trim();
    throw new Error(why || "`claude auth logout` did not finish.");
  }
};

/**
 * Finishes an account's sign-in, then asks the dir's Claude Code who it is
 * signed in as. One that answers as someone other than the account already
 * is (`expected`) is signed straight out again: the dir is that account's
 * and nobody else's.
 */
export const completeAccountLogin = async (
  code: string,
  account: string,
  expected: AccountIdentity | null
): Promise<AccountSigninResult> => {
  await finishSignIn(account, code);
  const probe = await probeAccount(account);
  if (!probe.identity) {
    return { state: "signed-out", probe };
  }
  if (expected && !sameIdentity(expected, probe.identity)) {
    await logout(account);
    return { state: "mismatch", probe };
  }
  return { state: "signed-in", probe };
};

/**
 * Signs an account out of this machine with Claude Code itself, and drops its
 * dir. A `claude auth login` it began there and that still waits for a code
 * is ended first, and gone before the dir is: nothing of the account stays.
 */
export const forgetAccount = async (account: string): Promise<void> => {
  const waiting = inFlight.get(account);
  if (waiting) {
    inFlight.delete(account);
    end(waiting);
    await waiting.child.exited;
  }
  await logout(account);
  await removeAccountDir(account);
};
