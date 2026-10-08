import type { AuthState } from "@cawco/core";
import type { Subprocess } from "bun";
import { probeAuth, resolveClaudeExecutable } from "./auth";

/**
 * Logging a machine in from the dashboard, over the tunnel.
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
 * The sign-in in flight: one per daemon, since each `claude auth login` mints
 * its own PKCE challenge and only the process that printed a link can redeem
 * that link's code.
 */
interface SignIn {
  readonly child: Subprocess;
  /** Called on every chunk of output, while something is waiting on it. */
  heard?: () => void;
  /** Everything the CLI has printed, ANSI and all. */
  output: string;
  readonly terminal: Bun.Terminal;
}

let inFlight: SignIn | undefined;

export interface LoginChallenge {
  /** Where the reader authorises. Opened in *their* browser, not on the machine. */
  url: string;
}

const end = (signIn: SignIn) => {
  signIn.child.kill();
  signIn.terminal.close();
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

/** Starts `claude auth login` and hands back the link it prints. */
export const beginLogin = async (): Promise<LoginChallenge> => {
  if (inFlight) {
    end(inFlight);
    inFlight = undefined;
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
    child: Bun.spawn([executable, "auth", "login"], {
      // `true` as the browser: the link is for the reader's browser, not one
      // on this machine.
      env: { ...process.env, BROWSER: "true" },
      terminal,
    }),
    output: "",
    terminal,
  };
  inFlight = signIn;
  const current = signIn;

  const prompted = await until(
    current,
    () => current.output.includes(PROMPT),
    LINK_TIMEOUT_MS
  );
  const url = said(current).match(LINK)?.[0];
  if (!(prompted && url)) {
    end(current);
    if (inFlight === current) {
      inFlight = undefined;
    }
    throw new Error(
      said(current) || "`claude auth login` printed no sign-in link."
    );
  }
  return { url };
};

/**
 * Types the code the reader pasted into the waiting `claude auth login`, and
 * answers with what this machine can do afterwards — which is the only claim
 * worth making, since a login that does not work is indistinguishable from no
 * login at all until something tries to use it.
 */
export const completeLogin = async (code: string): Promise<AuthState> => {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("Paste the code from the authorisation page.");
  }
  const signIn = inFlight;
  if (!signIn || signIn.child.exitCode !== null) {
    throw new Error(
      "That code belongs to a login this machine didn't start or already used. Open the authorisation page again."
    );
  }
  // Used or refused, the sign-in is spent either way.
  inFlight = undefined;

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
  return await probeAuth();
};
