/**
 * The agent's side of `log` inside a macOS workspace boundary. Seatbelt
 * refuses `log` outright inside a sandbox ("Cannot run while sandboxed"), so
 * each workspace's `log` shim asks the agent, which runs `/usr/bin/log`
 * outside the boundary and streams its output back: `log show` and `log
 * stream` only, read only ({@link logRefusal}, checked again here — a command
 * inside can ask without the shim).
 *
 * One listener per agent, on loopback, started by the first boundary that
 * needs it. It takes a request only with the token the agent wrote into the
 * shims, so a web page that reaches loopback (DNS rebinding) cannot read the
 * system log. A shim that goes away — its command interrupted, its reader
 * closed — takes its `log` with it.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:os";
import { LOG_FRAME, logFrame, logRefusal } from "./boundary-log-protocol";

/** Where the shims reach the agent. */
export interface LogRelay {
  readonly port: number;
  readonly token: string;
}

const LOG = "/usr/bin/log";
const MAX_REQUEST_BYTES = 64 * 1024;

const encoder = new TextEncoder();

/** `log`'s output as frames: stdout and stderr as they come, then its exit status. */
async function* framesOf(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">
): AsyncGenerator<Uint8Array> {
  const readers = new Map<number, ReadableStreamDefaultReader<Uint8Array>>([
    [LOG_FRAME.stdout, proc.stdout.getReader()],
    [LOG_FRAME.stderr, proc.stderr.getReader()],
  ]);
  const next = (kind: number) =>
    (readers.get(kind) as ReadableStreamDefaultReader<Uint8Array>)
      .read()
      .then((result) => ({ kind, result }));
  const reads = new Map([...readers.keys()].map((kind) => [kind, next(kind)]));
  while (reads.size > 0) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, in the order the pipes give them
    const { kind, result } = await Promise.race(reads.values());
    if (result.done) {
      reads.delete(kind);
      continue;
    }
    reads.set(kind, next(kind));
    yield logFrame(kind, result.value);
  }
  await proc.exited;
  const signal = proc.signalCode
    ? constants.signals[proc.signalCode as keyof typeof constants.signals]
    : undefined;
  const status = signal ? 128 + signal : (proc.exitCode ?? 1);
  yield logFrame(LOG_FRAME.exit, encoder.encode(String(status)));
}

/** A refusal, as the shim prints it: one line on stderr, status 64. */
const refused = (why: string): Response =>
  new Response(
    new Blob([
      logFrame(LOG_FRAME.stderr, encoder.encode(`${why}\n`)),
      logFrame(LOG_FRAME.exit, encoder.encode("64")),
    ])
  );

const argvOf = (body: unknown): string[] | undefined => {
  const argv = (body as { argv?: unknown } | null)?.argv;
  return Array.isArray(argv) && argv.every((word) => typeof word === "string")
    ? argv
    : undefined;
};

const start = (): LogRelay => {
  const token = randomBytes(32).toString("hex");
  const expected = Buffer.from(`Bearer ${token}`);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, served) {
      const authorization = Buffer.from(
        request.headers.get("authorization") ?? ""
      );
      if (
        authorization.length !== expected.length ||
        !timingSafeEqual(authorization, expected)
      ) {
        return new Response("not authorized\n", { status: 401 });
      }
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/log") {
        return new Response("not found\n", { status: 404 });
      }
      const text = await request.text();
      if (text.length > MAX_REQUEST_BYTES) {
        return refused("cawco: this log request is too large");
      }
      let argv: string[] | undefined;
      try {
        argv = argvOf(JSON.parse(text));
      } catch {
        argv = undefined;
      }
      if (!argv) {
        return refused("cawco: this log request is not a list of words");
      }
      const why = logRefusal(argv);
      if (why) {
        return refused(why);
      }
      // `log stream` may say nothing for a long while.
      served.timeout(request, 0);
      const proc = Bun.spawn([LOG, ...argv], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const stop = (): void => {
        proc.kill("SIGTERM");
      };
      request.signal.addEventListener("abort", stop);
      const frames = framesOf(proc);
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              const { value, done } = await frames.next();
              if (done) {
                controller.close();
              } else {
                controller.enqueue(value);
              }
            },
            cancel: stop,
          },
          { highWaterMark: 0 }
        )
      );
    },
  });
  const { port } = server;
  if (!port) {
    throw new Error("the log relay did not get a port");
  }
  console.info(`[workspace] log relay listening on 127.0.0.1:${port}`);
  return { port, token };
};

let relay: LogRelay | undefined;

/** The agent's log relay, started on first use. */
export const logRelay = (): LogRelay => {
  relay ??= start();
  return relay;
};
