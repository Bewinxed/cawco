/**
 * The Mac Catalyst app started for a probe, and its own log: the one way a
 * probe reads this Mac's unified log.
 *
 * The host's log carries every process on the Mac, the iOS simulators' apps
 * included, and those log under the same subsystem (`dev.cawco.app`). A
 * stream filtered by subsystem alone reads whichever app speaks: a Mac run
 * beside an iPhone run once passed on the iPhone app's lines. So the stream
 * is narrowed twice. Its predicate names the binary started here (no
 * simulator app has that path), and only lines from the pid it was started
 * under are kept. The stream starts before the app, so the app's first lines
 * are read.
 *
 * A simulator's log needs neither filter: `xcrun simctl spawn <udid> log
 * stream` reads that simulator's own log alone.
 *
 *   const app = await macApp(binary, args, 'subsystem == "dev.cawco.app"');
 *   … app.lines …
 *   await app.stop();
 */
import type { Subprocess } from "bun";

/**
 * A compact line's stamp, process and `[subsystem:category]` tag, up to what
 * it says. The subsystem is dotted (`dev.cawco.app`), which the process's
 * own `[pid:thread]` before it never is; what it says may hold brackets.
 */
const HEAD = /^.*?\[[\w-]+(?:\.[\w-]+)+:[\w.-]+\] /;
/** `log stream`'s own first line, once it is attached: `Filtering the log data using …`. */
const ATTACHED = "Filtering the log data";
const BACKSLASH = /\\/g;
const QUOTE = /"/g;

export interface MacApp {
  /** What the app said, oldest first: each line's words, past its tag. */
  lines: string[];
  pid: number;
  /** Ends the app, then its stream. */
  stop: () => Promise<void>;
}

/**
 * Reads `child`'s stdout a line at a time, handing each to `take`; resolves
 * once `ready` (when given) is seen in a line.
 */
export function readLines(
  child: Subprocess<"ignore", "pipe", "ignore">,
  take: (line: string) => void,
  ready?: string
): Promise<void> {
  let attached: () => void = () => undefined;
  const seen = new Promise<void>((done) => {
    attached = done;
  });
  if (ready === undefined) {
    attached();
  }
  (async () => {
    const decoder = new TextDecoder();
    const reader = child.stdout.getReader();
    let rest = "";
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const split = rest.split("\n");
      rest = split.pop() ?? "";
      for (const line of split) {
        if (ready !== undefined && line.includes(ready)) {
          attached();
        }
        take(line);
      }
    }
    attached();
  })().catch(() => attached());
  return seen;
}

/**
 * A byte `log stream` writes as its octal code: every backslash a message
 * held comes out as `\134` (so `"R&D \"Labs\""` in JSON reads
 * `"R&D \134"Labs\134""`), and a backslash is never written bare.
 */
const ESCAPED = /\\([0-7]{3})/g;

/**
 * A line's words past its compact head, as the app said them (the stream's
 * own escapes undone), or undefined when it is not a log line.
 */
export function words(line: string): string | undefined {
  return HEAD.test(line)
    ? line
        .replace(HEAD, "")
        .replace(ESCAPED, (_, code: string) =>
          String.fromCharCode(Number.parseInt(code, 8))
        )
    : undefined;
}

/**
 * Starts the Mac app at `binary` with `args`, and reads its log lines that
 * match `predicate` (a `log stream` predicate, as `subsystem == "dev.cawco.app"
 * AND category == "Probe"`), its own only.
 */
export async function macApp(
  binary: string,
  args: string[],
  predicate: string
): Promise<MacApp> {
  const lines: string[] = [];
  let pid: number | undefined;
  const path = binary.replace(BACKSLASH, "\\\\").replace(QUOTE, '\\"');
  const stream = Bun.spawn(
    [
      "log",
      "stream",
      "--level",
      "debug",
      "--style",
      "compact",
      "--predicate",
      `(${predicate}) AND processImagePath == "${path}"`,
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "ignore" }
  );
  const attached = readLines(
    stream,
    (line) => {
      // Compact style names the process as `<name>[<pid>:<thread>]`.
      if (pid === undefined || !line.includes(`[${pid}:`)) {
        return;
      }
      const said = words(line);
      if (said !== undefined) {
        lines.push(said);
      }
    },
    ATTACHED
  );
  await attached;
  const app = Bun.spawn([binary, ...args], {
    stdout: "ignore",
    stderr: "ignore",
  });
  ({ pid } = app);
  return {
    lines,
    pid: app.pid,
    stop: async () => {
      app.kill();
      await app.exited;
      stream.kill();
      await stream.exited;
    },
  };
}
