import { homedir } from "node:os";
import { readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import {
  type ToolSigninChallenge,
  type ToolSigninSpec,
  type ToolSpec,
  type ToolStatus,
  toolSpec,
} from "@cawco/core/tools";
import { unhandled } from "@cawco/core/unhandled";
import { toolWords } from "@cawco/core/words/tools";
import type { Subprocess } from "bun";
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

/** How long the sign-in may take to show its link. */
const LINK_MS = 60_000;
/** How long a sign-in waits for its code before it is ended. */
const KEEP_MS = 10 * 60_000;
/** How long the tool may take to finish once the code is typed. */
const EXCHANGE_MS = 120_000;
/** How many of the screen's last lines a refusal quotes. */
const SCREEN_LINES = 6;

/** One tool's sign-in, waiting for its code. */
interface Waiting {
  readonly child: Subprocess;
  /** Ends it, unless it was used, once {@link KEEP_MS} pass. */
  readonly expiry: ReturnType<typeof setTimeout>;
  /** Called on every chunk of output, while something is waiting on it. */
  heard?: () => void;
  /** Everything it printed, ANSI and all. */
  output: string;
  readonly terminal: Bun.Terminal;
}

/** The sign-ins waiting for a code, by tool id. */
const waiting = new Map<string, Waiting>();

const end = (one: Waiting): void => {
  clearTimeout(one.expiry);
  one.child.kill();
  one.terminal.close();
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
  const lines = Bun.stripANSI(one.output.slice(from))
    .split(LINE_BREAKS)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-SCREEN_LINES)
    .join("\n");
  return code ? lines.replaceAll(code, "(the pasted code)") : lines;
};

const ended = (one: Waiting): boolean =>
  one.child.exitCode !== null || one.child.signalCode !== null;

/** Whether `done` held, on each chunk the tool printed or when it ended, within `ms`. */
const until = async (
  one: Waiting,
  done: () => boolean,
  ms: number
): Promise<boolean> => {
  const read = await readWithin(
    ms,
    (signal) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (answer: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          one.heard = undefined;
          resolve(answer);
        };
        signal.addEventListener("abort", () => settle(done()), {
          once: true,
        });
        one.heard = () => {
          if (done()) {
            settle(true);
          }
        };
        detach(
          one.child.exited.then(() => settle(done())),
          "then"
        );
        one.heard();
      })
  );
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      return done();
    default:
      return unhandled("read", read);
  }
};

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
  const terminal = new Bun.Terminal({
    // Wide enough that the link is never wrapped across lines.
    cols: 4096,
    data(_terminal, bytes) {
      if (heard) {
        heard.output += decoder.decode(bytes, { stream: true });
        heard.heard?.();
      }
    },
  });
  const child = Bun.spawn([bin, ...words.login], {
    // No display: the link is for the person's browser, not one here.
    env: { ...toolEnv(), DISPLAY: undefined, WAYLAND_DISPLAY: undefined },
    cwd: homedir(),
    terminal,
  });
  const one: Waiting = {
    child,
    terminal,
    output: "",
    expiry: setTimeout(() => {
      if (waiting.get(toolId) === one) {
        waiting.delete(toolId);
      }
      end(one);
    }, KEEP_MS),
  };
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
