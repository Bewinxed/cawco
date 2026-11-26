import { lastLines } from "@cawco/core/words/helpers";
import { toolWords } from "@cawco/core/words/tools";
import { Duration, Effect, Exit, Scope } from "effect";
import { runFork, runPromise } from "./daemon-runtime";
import { heardUntil, openInTerminal, type TerminalRun } from "./login";

/**
 * A program's own interactive sign-in, run under a pseudo-terminal for the
 * person at the dashboard: the program prints a link on one of its own sign-in
 * hosts, the person opens it on their own device, and the code they paste
 * back is typed into it. The program stores its login where it always does;
 * CawCo reads only its screen, never the login, and makes no request of the
 * program's service of its own. Each sign-in waits under its caller's key
 * (an account on this machine, say) until its code comes or it lapses.
 */

/** How long the sign-in may go without a word before it shows its link. */
const LINK_MS = 60_000;
/** How long a sign-in waits for its code before it is ended. */
const KEEP_MS = 10 * 60_000;
/** How long the program may go without a word once the code is typed, before it ends. */
const EXCHANGE_MS = 120_000;
/** How many of the screen's last lines a refusal quotes. */
const SCREEN_LINES = 6;

/**
 * What a sign-in runs: its program, as the caller built it, and the hosts its link may be on.
 */
export interface PtySigninRun {
  readonly args: readonly string[];
  readonly bin: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The hosts its sign-in link may be on; no other link on its screen is read. */
  readonly loginHosts: readonly string[];
  /** The program's name, as a refusal says it. */
  readonly name: string;
}

/**
 * A sign-in begun: the link the person opens, and until when it waits for its code (ms epoch).
 */
export interface PtySigninChallenge {
  readonly expiresAt: number;
  readonly url: string;
}

/** One sign-in, waiting for its code. */
interface Waiting extends TerminalRun {
  /** Everything it printed, ANSI and all. */
  output: string;
  readonly run: PtySigninRun;
  /**
   * What the sign-in holds: its terminal, its program, and the wait that
   * ends it once {@link KEEP_MS} pass unused. Closing it ends all three.
   */
  readonly scope: Scope.Closeable;
  readonly terminal: Bun.Terminal;
}

/** The sign-ins waiting for a code, by their callers' keys. */
const waiting = new Map<string, Waiting>();

/**
 * Ends the sign-in: its scope closed, the program killed and its terminal
 * closed at once, then its expiry's wait let go.
 */
const end = (one: Waiting): void => {
  runFork(Scope.close(one.scope, Exit.void));
};

/** Whether a sign-in waits under `key` for its code. */
export const ptySigninWaits = (key: string): boolean => {
  const one = waiting.get(key);
  return one !== undefined && !ended(one);
};

/** Ends the sign-in waiting under `key`, if one is. */
export const endPtySignin = (key: string): void => {
  const one = waiting.get(key);
  if (one) {
    waiting.delete(key);
    end(one);
  }
};

/** Ends every waiting sign-in, for the daemon's exit: the program outlives its terminal otherwise. */
export const endToolSignins = (): void => {
  for (const one of waiting.values()) {
    end(one);
  }
  waiting.clear();
};

/** Each whole link on the screen: one a space or a line's end follows, so one still arriving is never read cut short. */
const LINKS = /https:\/\/\S+(?=\s)/gu;

/** The links on the screen on one of the program's own sign-in hosts. */
const signinLinks = (one: Waiting): string[] => [
  ...new Set(
    (Bun.stripANSI(one.output).match(LINKS) ?? []).filter((url) => {
      try {
        return one.run.loginHosts.includes(new URL(url).host);
      } catch {
        return false;
      }
    })
  ),
];

const LINE_BREAKS = /\r?\n|\r/u;

/** The screen's last lines from `from` on, one per line, the pasted `code` never among them. */
const screen = (one: Waiting, from = 0, code?: string): string => {
  const lines = lastLines(
    Bun.stripANSI(one.output.slice(from))
      .split(LINE_BREAKS)
      .map((line) => line.trim())
      .filter(Boolean),
    SCREEN_LINES,
    "\n"
  );
  return code ? lines.replaceAll(code, "(the pasted code)") : lines;
};

const ended = (one: Waiting): boolean =>
  one.child.exitCode !== null || one.child.signalCode !== null;

/**
 * Whether `done` held, on each chunk the program printed or when it ended;
 * let go once `quietMs` pass with nothing printed, and answered by `done`
 * then. The promise edge of login.ts `heardUntil`.
 */
const until = (
  one: Waiting,
  done: () => boolean,
  quietMs: number
): Promise<boolean> =>
  runPromise(
    heardUntil(one, done, quietMs).pipe(
      Effect.map((answer) => (answer === "quiet" ? done() : answer))
    )
  );

/**
 * Starts `run`'s sign-in under `key` (one already waiting there is ended
 * first) and answers its link once it shows one on a host of its own; the
 * sign-in then waits {@link KEEP_MS} for its code.
 */
export const beginPtySignin = async (
  key: string,
  run: PtySigninRun
): Promise<PtySigninChallenge> => {
  const before = waiting.get(key);
  if (before) {
    waiting.delete(key);
    end(before);
  }
  const decoder = new TextDecoder();
  // Its screen, read into the sign-in's own record whether or not it still waits.
  let heard: Waiting | undefined;
  const scope = Scope.makeUnsafe();
  // Forked first, so the scope lets it go last: closing ends the program and
  // its terminal before anything else.
  runFork(
    Effect.sleep(Duration.millis(KEEP_MS)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (heard && waiting.get(key) === heard) {
            waiting.delete(key);
          }
        })
      ),
      Effect.andThen(Scope.close(scope, Exit.void)),
      Effect.forkIn(scope)
    )
  );
  const opened = openInTerminal(
    scope,
    (terminal) =>
      Bun.spawn([run.bin, ...run.args], {
        // No display: the link is for the person's browser, not one here.
        env: { ...run.env, DISPLAY: undefined, WAYLAND_DISPLAY: undefined },
        cwd: run.cwd,
        terminal,
      }),
    (bytes) => {
      if (heard) {
        heard.output += decoder.decode(bytes, { stream: true });
        heard.heard?.();
      }
    }
  );
  const one: Waiting = { ...opened, run, scope, output: "" };
  heard = one;
  waiting.set(key, one);
  await until(one, () => signinLinks(one).length > 0, LINK_MS);
  const [url] = signinLinks(one);
  if (!url || ended(one)) {
    waiting.delete(key);
    end(one);
    throw new Error(toolWords.signinNoLink(run.name, screen(one)));
  }
  return { url, expiresAt: Date.now() + KEEP_MS };
};

/**
 * Types the pasted code into the sign-in waiting under `key` and waits for
 * its program to end. Resolves when it ended signed in (exit 0); a sign-in
 * that ended otherwise is refused with its screen, the code never shown.
 */
export const completePtySignin = async (
  key: string,
  code: string
): Promise<void> => {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error(toolWords.signinNoCode);
  }
  const one = waiting.get(key);
  if (!one || ended(one)) {
    waiting.delete(key);
    throw new Error(toolWords.signinNotWaiting);
  }
  const { name } = one.run;
  // Used or refused, the sign-in is spent either way.
  waiting.delete(key);
  const from = one.output.length;
  one.terminal.write(`${trimmed}\r`);
  const exited = await until(one, () => ended(one), EXCHANGE_MS);
  const { exitCode } = one.child;
  const said = screen(one, from, trimmed);
  end(one);
  if (!exited) {
    throw new Error(toolWords.signinNotEnded(name, EXCHANGE_MS / 1000));
  }
  if (exitCode !== 0) {
    throw new Error(toolWords.signinFailed(name, exitCode ?? -1, said));
  }
};
