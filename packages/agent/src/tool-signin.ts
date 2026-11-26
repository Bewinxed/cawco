import { homedir } from "node:os";
import {
  type ToolSigninChallenge,
  type ToolSigninSpec,
  type ToolSpec,
  type ToolStatus,
  toolSpec,
} from "@cawco/core/tools";
import { lastLines } from "@cawco/core/words/helpers";
import { toolWords } from "@cawco/core/words/tools";
import { Duration, Effect, Exit, Scope } from "effect";
import { heardUntil, openInTerminal, type TerminalRun } from "./login";
import { probeToolStatus, signinMoved, toolBinary, toolEnv } from "./tools";

/**
 * A catalog tool's own sign-in, from the dashboard, over the tunnel (core
 * `ToolSpec.signin`: the Antigravity CLI's `agy acp --login`). The daemon
 * runs the tool's own sign-in, unmodified, under a pseudo-terminal, hands
 * the person the sign-in link it prints on one of its own hosts, and types
 * the code they paste back into it. Whether it signed in is the tool's own
 * read afterwards. The tool stores its login where it always does (the OS
 * keyring); CawCo never holds it, and makes no request of the tool's
 * service of its own.
 */

/** How long the sign-in may go without a word before it shows its link. */
const LINK_MS = 60_000;
/** How long a sign-in waits for its code before it is ended. */
const KEEP_MS = 10 * 60_000;
/** How long the tool may go without a word once the code is typed, before it ends. */
const EXCHANGE_MS = 120_000;
/** How many of the screen's last lines a refusal quotes. */
const SCREEN_LINES = 6;

/** One tool's sign-in, waiting for its code. */
interface Waiting extends TerminalRun {
  /** Everything it printed, ANSI and all. */
  output: string;
  /**
   * What the sign-in holds: its terminal, its tool, and the wait that ends
   * it once {@link KEEP_MS} pass unused. Closing it ends all three.
   */
  readonly scope: Scope.Closeable;
  readonly terminal: Bun.Terminal;
}

/** The sign-ins waiting for a code, by tool id. */
const waiting = new Map<string, Waiting>();

/**
 * Ends the sign-in: its scope closed, the tool killed and its terminal
 * closed at once, then its expiry's wait let go.
 */
const end = (one: Waiting): void => {
  Effect.runFork(Scope.close(one.scope, Exit.void));
};

/** Ends every waiting sign-in, for the daemon's exit: the tool outlives its terminal otherwise. */
export const endToolSignins = (): void => {
  for (const one of waiting.values()) {
    end(one);
  }
  waiting.clear();
};

/** Each whole link on the screen: one a space or a line's end follows, so one still arriving is never read cut short. */
const LINKS = /https:\/\/\S+(?=\s)/gu;

/** The links on the screen on one of the tool's own sign-in hosts. */
const signinLinks = (one: Waiting, words: ToolSigninSpec): string[] => [
  ...new Set(
    (Bun.stripANSI(one.output).match(LINKS) ?? []).filter((url) => {
      try {
        return words.loginHosts.includes(new URL(url).host);
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
 * Whether `done` held, on each chunk the tool printed or when it ended; let
 * go once `quietMs` pass with nothing printed, and answered by `done` then.
 * The promise edge of login.ts `heardUntil`.
 */
const until = (
  one: Waiting,
  done: () => boolean,
  quietMs: number
): Promise<boolean> =>
  Effect.runPromise(
    heardUntil(one, done, quietMs).pipe(
      Effect.map((answer) => (answer === "quiet" ? done() : answer))
    )
  );

/** The tool asked for, with its own sign-in, and its binary here; else why not, in words. */
const signinTool = async (
  toolId: string
): Promise<{ bin: string; spec: ToolSpec; words: ToolSigninSpec }> => {
  const spec = toolSpec(toolId);
  if (!spec?.signin) {
    throw new Error(toolWords.signinNone(spec?.name ?? toolId));
  }
  const bin = await toolBinary(spec);
  if (!bin) {
    throw new Error(toolWords.signinNotInstalled(spec.name));
  }
  return { bin, spec, words: spec.signin };
};

/**
 * Core `CONTROL_BEGIN_TOOL_SIGNIN`: starts the tool's own sign-in (one
 * already waiting is ended first) and answers its link once it shows one on
 * a host of its own; the sign-in then waits {@link KEEP_MS} for its code.
 */
export const beginToolSignin = async (
  toolId: string
): Promise<ToolSigninChallenge> => {
  const { bin, spec, words } = await signinTool(toolId);
  const before = waiting.get(toolId);
  if (before) {
    waiting.delete(toolId);
    end(before);
  }
  const decoder = new TextDecoder();
  // Its screen, read into the sign-in's own record whether or not it still waits.
  let heard: Waiting | undefined;
  const scope = Scope.makeUnsafe();
  // Forked first, so the scope lets it go last: closing ends the tool and
  // its terminal before anything else.
  Effect.runFork(
    Effect.sleep(Duration.millis(KEEP_MS)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (heard && waiting.get(toolId) === heard) {
            waiting.delete(toolId);
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
      Bun.spawn([bin, ...words.login], {
        // No display: the link is for the person's browser, not one here.
        env: { ...toolEnv(), DISPLAY: undefined, WAYLAND_DISPLAY: undefined },
        cwd: homedir(),
        terminal,
      }),
    (bytes) => {
      if (heard) {
        heard.output += decoder.decode(bytes, { stream: true });
        heard.heard?.();
      }
    }
  );
  const one: Waiting = { ...opened, scope, output: "" };
  heard = one;
  waiting.set(toolId, one);
  await until(one, () => signinLinks(one, words).length > 0, LINK_MS);
  const [url] = signinLinks(one, words);
  if (!url || ended(one)) {
    waiting.delete(toolId);
    end(one);
    throw new Error(toolWords.signinNoLink(spec.name, screen(one)));
  }
  return { url, expiresAt: Date.now() + KEEP_MS };
};

/**
 * Core `CONTROL_COMPLETE_TOOL_SIGNIN`: types the pasted code into the
 * tool's waiting sign-in, waits for it to end, and answers the tool's
 * status with its sign-in read again. A sign-in that ended without signing
 * in is refused with its screen, the code never shown.
 */
export const completeToolSignin = async (
  toolId: string,
  code: string
): Promise<ToolStatus> => {
  const { spec } = await signinTool(toolId);
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error(toolWords.signinNoCode);
  }
  const one = waiting.get(toolId);
  if (!one || ended(one)) {
    waiting.delete(toolId);
    throw new Error(toolWords.signinNotWaiting(spec.name));
  }
  // Used or refused, the sign-in is spent either way.
  waiting.delete(toolId);
  const from = one.output.length;
  one.terminal.write(`${trimmed}\r`);
  const exited = await until(one, () => ended(one), EXCHANGE_MS);
  const { exitCode } = one.child;
  const said = screen(one, from, trimmed);
  end(one);
  signinMoved(toolId);
  if (!exited) {
    throw new Error(toolWords.signinNotEnded(spec.name, EXCHANGE_MS / 1000));
  }
  if (exitCode !== 0) {
    throw new Error(toolWords.signinFailed(spec.name, exitCode ?? -1, said));
  }
  return await probeToolStatus(spec, { fresh: true });
};
