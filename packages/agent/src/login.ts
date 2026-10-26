import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  type AccountIdentity,
  type AccountKind,
  type AccountSigninResult,
  accountsWords,
  configurePage,
  sameIdentity,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { accountConfigDir, accountIds, accountsRoot } from "@cawco/core/paths";
import { bootId, processStart } from "@cawco/core/process-identity";
import {
  identifiedPid,
  isSignalRefused,
  signal as signalPid,
} from "@cawco/core/signal";
import {
  isDamagedRecord,
  readRecordSync,
  writeStateFile,
} from "@cawco/core/state-file";
import type { Subprocess } from "bun";
import {
  accountEnv,
  authStatusIn,
  bareEnv,
  linkUserLayer,
  noAuthAnswer,
  probeAccount,
  removeAccountDir,
} from "./accounts";
import { ClaudeRefused, claudeToStart } from "./claude-version";

/**
 * Signing an account in on a machine from the dashboard, over the tunnel, in
 * that account's own config dir (`~/.cawco/accounts/<id>/claude`).
 *
 * The sign-in is Claude Code's own: the daemon runs the unmodified
 * `claude auth login` under a pseudo-terminal, hands the authorize link it
 * prints to the reader, and types the code they paste back into it. Its
 * screen is read for that link alone ({@link AUTHORIZE}), and whether it
 * signed in comes from its `claude auth status` afterwards. The CLI
 * exchanges the code and stores the login where it always does — the macOS
 * keychain, or `.credentials.json` in its config directory when the keychain
 * refuses the write (a daemon outside the GUI session, a locked keychain) and
 * on Linux. Nothing here ever holds a token: Anthropic's terms require sign-in
 * to complete through Anthropic's own flow, and a credential that never leaves
 * its machine's store cannot be clobbered by a copy of itself.
 */

/**
 * Where Claude Code's sign-in authorises: its `CLAUDE_AI_AUTHORIZE_URL`
 * (a subscription) and `CONSOLE_AUTHORIZE_URL` (`--console`), origin and
 * path, as 2.1.302's own source holds them and its `auth login` printed them
 * in a pty. Nothing of the screen but a link to one of these is read: not
 * its prompt's words, not any other link on it. When Claude Code moves them,
 * the sign-in stops and shows its screen ({@link noLink}).
 */
const AUTHORIZE = new Set([
  "https://claude.com/cai/oauth/authorize",
  "https://platform.claude.com/oauth/authorize",
]);

/** The PKCE request an authorize link carries, each its own parameter. */
const AUTHORIZE_PARAMS = ["client_id", "code_challenge", "state"];

/**
 * Each whole link on the screen: one a space or a line's end follows, so a
 * link still arriving is never read cut short.
 */
const LINKS = /https:\/\/\S+(?=\s)/gu;

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
  readRecordSync<LoginMarker>(markerFile(account));

const markLogin = async (account: string, pid: number): Promise<void> => {
  const [procStart, boot] = await Promise.all([processStart(pid), bootId()]);
  const marker: LoginMarker = {
    pid,
    ...(procStart ? { procStart } : {}),
    ...(boot ? { bootId: boot } : {}),
  };
  await writeStateFile(markerFile(account), JSON.stringify(marker));
};

/** Drops the marker while it still names `pid`: a newer login's stays. */
const unmarkLogin = (account: string, pid: number): void => {
  let marked: number | undefined;
  try {
    marked = readMarker(account)?.pid;
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    console.warn(`[login] ${error.message}: left for the next start to drop`);
    return;
  }
  if (marked === pid) {
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
    let marker: LoginMarker | undefined;
    try {
      marker = readMarker(account);
    } catch (error) {
      if (!isDamagedRecord(error)) {
        throw error;
      }
      // It names no process to end: said, and dropped as every marker is.
      console.warn(
        `[login] ${error.message}: the sign-in it marked is not ended, and the marker is removed`
      );
      rmSync(markerFile(account), { force: true });
      continue;
    }
    if (!marker) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one marker per account, each read and ended before the next
    const live = await identifiedPid(marker).catch((error: unknown) => {
      if (!isSignalRefused(error)) {
        throw error;
      }
      // It names no process CawCo may signal: said, and dropped as every marker is.
      console.warn(
        `[login] ${markerFile(account)}: ${error.message}; the sign-in it marked is not ended, and the marker is removed`
      );
    });
    // Gone between the check and the signal, it has nothing left to end.
    if (live !== undefined && signalPid(live, "SIGTERM") === "denied") {
      throw new Error(
        `[login] the sign-in ${markerFile(account)} marks, pid ${live}, is not this user's to end`
      );
    }
    rmSync(markerFile(account), { force: true });
  }
};

/** What the CLI printed since `from`, as the text a terminal would show. */
const said = (signIn: SignIn, from = 0) =>
  Bun.stripANSI(signIn.output.slice(from)).trim();

/** The distinct authorize links ({@link AUTHORIZE}) on the screen. */
const authorizeLinks = (signIn: SignIn): string[] => {
  const found = new Set<string>();
  for (const [link] of Bun.stripANSI(signIn.output).matchAll(LINKS)) {
    const url = URL.parse(link);
    if (
      url &&
      AUTHORIZE.has(`${url.origin}${url.pathname}`) &&
      AUTHORIZE_PARAMS.every((param) => url.searchParams.get(param))
    ) {
      found.add(link);
    }
  }
  return [...found];
};

/** How many of the screen's last lines a stop shows, and how much of each. */
const SCREEN_LINES = 6;
const SCREEN_LINE_CHARS = 240;

/** A pty's line ends: `\r\n`, and `\r\r\n` where it adds its own `\r`. */
const LINE_BREAKS = /[\r\n]+/u;

/** The CLI's last lines since `from`, ANSI stripped, for a stop to show. */
const lastLines = (signIn: SignIn, from = 0): string => {
  const lines = said(signIn, from)
    .split(LINE_BREAKS)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-SCREEN_LINES)
    .map((line) =>
      line.length > SCREEN_LINE_CHARS
        ? `${line.slice(0, SCREEN_LINE_CHARS)}…`
        : line
    );
  return lines.length > 0 ? lines.join("\n") : "(nothing)";
};

/** Whether the CLI has ended, by its exit or a signal. */
const ended = (signIn: SignIn): boolean =>
  signIn.child.exitCode !== null || signIn.child.signalCode !== null;

/** Why a sign-in stopped before handing out a link, and the screen it stopped on. */
const noLink = (
  signIn: SignIn,
  why: "timeout" | "ended" | "several"
): string => {
  const what = {
    timeout: `Claude Code on this machine didn't show its sign-in link within ${LINK_TIMEOUT_MS / 1000} s, so the sign-in stopped.`,
    ended:
      "Claude Code's sign-in on this machine ended before it showed its sign-in link.",
    several:
      "Claude Code on this machine showed more than one sign-in link, so the sign-in stopped rather than pick one.",
  }[why];
  return `${what} Nothing was signed in or out. If Claude Code there is out of date, update it from its row in ${configurePage("cli-tools")}, then open the sign-in link again. Its screen said:\n${lastLines(signIn)}`;
};

/**
 * Answered true once `done` holds, answered with `done()` once the CLI
 * exits; unanswered when neither happened within `ms`.
 */
const until = (
  signIn: SignIn,
  done: () => boolean,
  ms: number
): Promise<Bounded<boolean>> =>
  readWithin(
    ms,
    (signal) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (answer: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          signIn.heard = undefined;
          resolve(answer);
        };
        signal.addEventListener(
          "abort",
          () => {
            signIn.heard = undefined;
          },
          { once: true }
        );
        signIn.heard = () => {
          if (done()) {
            settle(true);
          }
        };
        // biome-ignore lint/complexity/noVoid: the exit only settles the wait; its value is read from the process
        void signIn.child.exited.then(() => settle(done()));
        signIn.heard();
      })
  );

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
  const executable = await claudeToStart();
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

  // Ready once its authorize link is on the screen, whatever its prompt says.
  const shown = await until(
    current,
    () => authorizeLinks(current).length > 0,
    LINK_TIMEOUT_MS
  );
  const links = authorizeLinks(current);
  let failure: string | undefined;
  switch (shown.kind) {
    case "answered":
      // A link printed by a CLI that then ended is one no process can redeem.
      if (ended(current)) {
        failure = noLink(current, "ended");
      } else if (links.length > 1) {
        failure = noLink(current, "several");
      }
      break;
    case "unanswered":
      failure = noLink(current, "timeout");
      break;
    default: {
      const unhandled: never = shown;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  const [url] = links;
  if (failure !== undefined || !url) {
    end(current);
    if (inFlight.get(account) === current) {
      inFlight.delete(account);
    }
    throw new Error(failure ?? noLink(current, "ended"));
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
  // The page's code is whole as `code#state`. Claude Code answers anything
  // short of it by asking again and waiting on, never exiting (its `auth
  // login` line handler: "Invalid code. Please make sure the full code was
  // copied."), so it is refused here at once, and the login waits on for
  // the whole code.
  const [authorization, state] = trimmed.split("#");
  if (!(authorization && state)) {
    throw new Error(accountsWords.signin.notWhole);
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
  // The terminal echoed the code back: shown as what it was, never itself.
  const screen = `Open the sign-in link again for a new code. Its screen said:\n${lastLines(signIn, from).replaceAll(trimmed, "(the pasted code)")}`;
  switch (exited.kind) {
    case "answered":
      if (exitCode !== 0) {
        throw new Error(
          `Claude Code's sign-in on this machine ended without signing in (exit ${exitCode}). ${screen}`
        );
      }
      break;
    case "unanswered":
      throw new Error(
        `Claude Code on this machine didn't finish signing in within ${EXCHANGE_TIMEOUT_MS / 1000} s, so the sign-in stopped. ${screen}`
      );
    default: {
      const unhandled: never = exited;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  // Signed in is what the dir's `claude auth status` says, not the screen.
  const dir = accountConfigDir(account);
  const status = await authStatusIn(
    { ...bareEnv(), ...accountEnv(account) },
    dir
  );
  switch (status.kind) {
    case "unanswered":
      throw new Error(noAuthAnswer(dir, status));
    case "answered":
      switch (status.value.kind) {
        case "signin":
          if (!status.value.loggedIn) {
            throw new Error(
              `Claude Code's sign-in on this machine finished, but \`claude auth status\` says it isn't signed in. ${screen}`
            );
          }
          return;
        case "unread":
        case "locked":
          throw new Error(status.value.why);
        default: {
          const unhandled: never = status.value;
          throw new Error(`unhandled status: ${JSON.stringify(unhandled)}`);
        }
      }
    default: {
      const unhandled: never = status;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
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

/**
 * Runs `claude auth logout` in an account's dir: Claude Code signs it out
 * itself. With no Claude Code here there is nothing to sign out with; one
 * the version gate refuses is refused ({@link claudeToStart}).
 */
const logout = async (account: string): Promise<void> => {
  let executable: string;
  try {
    executable = await claudeToStart();
  } catch (error) {
    if (error instanceof ClaudeRefused && error.reason === "not-installed") {
      return;
    }
    throw error;
  }
  const ran = await readWithin(LOGOUT_MS, async (signal) => {
    const child = Bun.spawn([executable, "auth", "logout"], {
      env: { ...bareEnv(), ...accountEnv(account) },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      signal,
    });
    if ((await child.exited) !== 0) {
      const why = Bun.stripANSI(await new Response(child.stderr).text()).trim();
      throw new Error(why || "`claude auth logout` did not finish.");
    }
  });
  switch (ran.kind) {
    case "answered":
      return;
    case "unanswered":
      throw new Error(
        `\`claude auth logout\` did not answer within ${LOGOUT_MS / 1000} s; whether the account signed out is not known.`
      );
    default: {
      const unhandled: never = ran;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** How long `claude auth logout` may take to answer. */
const LOGOUT_MS = 30_000;

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
 * is ended first, and gone before the dir is: nothing of the account stays
 * but its sessions, carried into `into`'s dir (an account it joins), else
 * into the dir of a session on no account ({@link removeAccountDir}).
 */
export const forgetAccount = async (
  account: string,
  into: string | null = null
): Promise<void> => {
  const waiting = inFlight.get(account);
  if (waiting) {
    inFlight.delete(account);
    end(waiting);
    await waiting.child.exited;
  }
  await logout(account);
  await removeAccountDir(account, into);
};
