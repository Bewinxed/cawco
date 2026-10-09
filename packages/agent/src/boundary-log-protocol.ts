/**
 * What `log` may do for a command inside a macOS workspace boundary: `log
 * show` and `log stream`, reading the system log, and nothing that writes a
 * file, reads a path or hands the terminal to another program. Seatbelt
 * refuses `log` itself ("Cannot run while sandboxed"), so the agent runs
 * these outside the boundary. The workspace's `log` shim checks an argv with
 * this before it asks, and the agent (`log-relay.ts`) checks it again,
 * because a command inside can ask without the shim.
 *
 * Every option is listed: one this does not know is refused, so a `log` that
 * grows a writing option stays refused until it is listed here. The lists are
 * `log help show` and `log help stream` on macOS 27.0.1.
 *
 * It also holds how the agent answers: a stream of frames, each a kind byte,
 * a 4-byte big-endian length and that many bytes; the exit frame carries the
 * status as decimal text and comes last.
 *
 * A plain file with no imports: the shim's runtime loads it beside the shim,
 * from the workspace's state dir.
 */

/** The kinds of frame the agent answers a `log` request with. */
export const LOG_FRAME = { stdout: 1, stderr: 2, exit: 3 } as const;
export const LOG_FRAME_HEADER = 5;

/** One frame of `kind` around `data`. */
export const logFrame = (
  kind: number,
  data: Uint8Array
): Uint8Array<ArrayBuffer> => {
  const frame = new Uint8Array(LOG_FRAME_HEADER + data.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint8(0, kind);
  view.setUint32(1, data.byteLength);
  frame.set(data, LOG_FRAME_HEADER);
  return frame;
};

interface Grammar {
  /** Options that take no value. */
  readonly flags: ReadonlySet<string>;
  /** Options refused, with why. */
  readonly refused: ReadonlyMap<string, string>;
  /** Options whose value is the next word. */
  readonly values: ReadonlySet<string>;
}

const READS_A_PATH =
  "reads a path outside the workspace boundary, where the boundary's read rules do not hold";

const SHOW: Grammar = {
  flags: new Set([
    "--backtrace",
    "--no-backtrace",
    "--debug",
    "--no-debug",
    "--info",
    "--no-info",
    "--loss",
    "--no-loss",
    "--signpost",
    "--no-signpost",
    "-L",
    "--last24",
    "-Y",
    "--yesterday",
    "-T",
    "--today",
    "--no-pager",
    "--metric",
    "--realtime",
    "--source",
    "--mach-continuous-time",
    "--unreliable",
  ]),
  values: new Set([
    "-c",
    "--color",
    "-E",
    "--end",
    "-l",
    "--last",
    "-H",
    "--highlight-predicate",
    "-P",
    "--predicate",
    "-p",
    "--process",
    "-S",
    "--start",
    "-s",
    "--style",
    "-Z",
    "--timezone",
  ]),
  refused: new Map([
    ["-A", READS_A_PATH],
    ["--archive", READS_A_PATH],
    ["-D", READS_A_PATH],
    ["--directory", READS_A_PATH],
    [
      "--pager",
      "hands the output to less outside the workspace boundary, which can write files and run commands",
    ],
  ]),
};

const STREAM: Grammar = {
  flags: new Set([
    "--source",
    "--mach-continuous-time",
    "--unreliable",
    "--ignore-dropped",
    "-o",
    "--payload",
    "--backtrace",
    "--no-backtrace",
    "--debug",
    "--no-debug",
    "--info",
    "--no-info",
    "--metric",
    "--signpost",
    "--no-signpost",
  ]),
  values: new Set([
    "-c",
    "--color",
    "-l",
    "--level",
    "-P",
    "--predicate",
    "-p",
    "--process",
    "-u",
    "--user",
    "-s",
    "--style",
    "-T",
    "--timeout",
    "-Y",
    "--type",
  ]),
  refused: new Map(),
};

const GRAMMARS: Readonly<Record<string, Grammar>> = {
  show: SHOW,
  stream: STREAM,
};

/** Why `log ARGV` is refused inside a workspace boundary, in one line; nothing when it may run. */
export const logRefusal = (argv: readonly string[]): string | undefined => {
  const [command, ...rest] = argv;
  const grammar = command ? GRAMMARS[command] : undefined;
  if (!(command && grammar)) {
    return `cawco: inside a workspace boundary log runs only \`log show\` and \`log stream\`, read only, so \`log${command ? ` ${command}` : ""}\` did not run`;
  }
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] as string;
    const why = grammar.refused.get(word);
    if (why) {
      return `cawco: \`log ${command} ${word}\` did not run: it ${why}`;
    }
    if (grammar.flags.has(word)) {
      continue;
    }
    if (grammar.values.has(word)) {
      if (index + 1 >= rest.length) {
        return `cawco: \`log ${command} ${word}\` did not run: it needs a value`;
      }
      index += 1;
      continue;
    }
    return word.startsWith("-")
      ? `cawco: \`log ${command} ${word}\` did not run: inside a workspace boundary log takes only the options \`log help ${command}\` lists, each as its own word, and none that writes a file or reads a path`
      : `cawco: \`log ${command} ${word}\` did not run: a log archive path ${READS_A_PATH}`;
  }
};
