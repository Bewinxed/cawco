/**
 * A DOWNLOAD THAT KEEPS MAKING PROGRESS ALWAYS FINISHES, HOWEVER SLOW THE
 * LINK. Only one that stops making progress is abandoned, and the next
 * attempt carries on from where the last one stopped.
 *
 * 2026-10-24, obelisk: nightly 5488's 117.7 MB archive came from GitHub at
 * about 237 KB/s, and a deadline of 600 s on the whole body abandoned it on
 * every machine, every attempt starting again from byte 0. So no download
 * here has a deadline on its body. The body streams to a partial file beside
 * where it will go, and the rule is Bun's own: fetch's `timeout` option is
 * "the socket idle timeout for this request. The timer is reset on every
 * byte sent or received; if the connection stays idle for longer than this,
 * the request fails with a timeout error … This is not a whole-request
 * deadline" (bun-types 1.4.3 globals.d.ts, `BunFetchRequestInit.timeout`).
 * Measured on Bun 1.4.4: a body that sent 64 KiB then held failed
 * `TimeoutError` 8.0 s in with `timeout: 3000` and 12.0 s in with 7000 (its
 * socket timer steps add up to ~5 s), while one that sent 1 KiB every 1.5 s
 * for 18 s finished with `timeout: 3000`.
 *
 * Every next attempt asks for the rest with `Range: bytes=<partial size>-`
 * and appends only when the host answers 206 with `Content-Range: bytes
 * <from>-<size-1>/<size>`; a 200 starts the partial over. GitHub's release
 * asset host honours it: asked live 2026-10-24 through
 * github.com/…/releases/download/…, it redirected (302) to
 * release-assets.githubusercontent.com, which answered `206`,
 * `accept-ranges: bytes`, `content-range: bytes 100000000-117733126/117733127`,
 * and Bun's fetch carried the Range header through that redirect (206,
 * `bytes 50000000-117733126/117733127`). The hub serves its copy with
 * `new Response(Bun.file(path))`, for which Bun.serve answers Range itself
 * ("Range request support - Automatically handles partial content requests
 * with `Content-Range` headers", https://bun.com/docs/runtime/http/routing).
 *
 * Whether the whole file is the build is not decided here: the caller checks
 * it against the signed manifest before it takes its final name, and deletes
 * a partial that fails.
 */
import { open, rm, stat } from "node:fs/promises";
import { downloadWords } from "./words/downloads";

/**
 * How long a download may go without one byte before the attempt is
 * abandoned: 60 s, our call from what was measured. GitHub's asset host,
 * read through Bun for 45 s at 180 KB/s (2026-10-24), never paused longer
 * than 295 ms between chunks; Bun's own default for the same timer is five
 * minutes (`BUN_CONFIG_HTTP_IDLE_TIMEOUT`, bun-types above), which leaves a
 * dead link unnoticed too long; Bun fires it up to ~5 s late. A minute is
 * two hundred times the longest pause seen and still notices a dead link
 * within about a minute.
 */
export const STALL_MS = 60_000;

/** Attempts in a row that brought no byte before the download gives up: the progress rule's end. */
const GIVE_UP_AFTER = 5;

/** The wait before attempt n+1 after n attempts in a row brought nothing: 1, 2, 4, 8, 16 s. */
const backoffMs = (fruitless: number): number =>
  1000 * 2 ** Math.max(0, fruitless - 1);

/**
 * The `code` Bun's fetch gives a connection refused, dropped, cut or
 * unroutable, before or during its answer, a name that did not resolve
 * included (Bun 1.4.4: "ECONNREFUSED: Unable to connect. Is the computer able
 * to access the url?", "ECONNRESET: The socket connection was closed
 * unexpectedly", the latter also for a body cut part-way; "ENETUNREACH" for
 * no route; https://github.com/oven-sh/bun/pull/36370 quotes `code:
 * "ECONNRESET"` on the same words): no answer at all.
 */
export const CUT_CODES = [
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNABORTED",
] as const;
export type CutCode = (typeof CUT_CODES)[number];

/** The connection code of a fetch error, when it is one. */
export const cutCode = (error: unknown): CutCode | undefined => {
  const { code } = (error ?? {}) as { code?: unknown };
  return CUT_CODES.find((cut) => cut === code);
};

export interface DownloadProgress {
  /** Bytes in the partial file so far. */
  received: number;
  /** The signed size. */
  total: number;
}

/** What the caller makes of an answer before it is read as a body: wait and ask again, or refuse with these words. */
export type Answered = { waitMs: number } | { refuse: string };

export interface ResumableDownload {
  /**
   * What the caller makes of an answer, before the default reading of it:
   * undefined reads it as a body (200, 206), starts over (416), retries
   * (408, 429, 5xx) or refuses (any other).
   */
  answered?: (response: Response) => Promise<Answered | undefined>;
  /** An error that ends the download at once, thrown on as it is: no retry. */
  ends?: (error: unknown) => boolean;
  /** The fetch to use: the agent's carries the machine's proof. */
  fetch?: (url: string, init: BunFetchRequestInit) => Promise<Response>;
  /** Each line a person reads in the log: retries, resumes, starts over. */
  log: (line: string) => void;
  /** Called with every chunk written. */
  onProgress?: (progress: DownloadProgress) => void;
  /** The file the body streams to, beside where it will go. */
  partial: string;
  /** The signed size. */
  size: number;
  url: string;
  /** The download's name in the log: "cawco-…-linux-x64.tar.gz from https://github.com". */
  what: string;
}

/** A refusal: said as it is, never retried. */
export class Refused extends Error {}

/** A write to the partial file failed: the disk's error, never retried as the network's. */
class LocalWrite extends Error {}

/** An answer's body, let go unread: one a caller read already is let go as it is. */
const drop = (response: Response): Promise<void> =>
  response.bodyUsed
    ? Promise.resolve()
    : (response.body?.cancel() ?? Promise.resolve()).catch(() => undefined);

/** The size of the partial file, 0 where there is none. */
const partialSize = (path: string): Promise<number> =>
  stat(path).then(
    (found) => found.size,
    () => 0
  );

/** `bytes <from>-<size-1>/<size>`, exactly: the rest, and nothing else. */
const isTheRest = (range: string | null, from: number, size: number): boolean =>
  range === `bytes ${from}-${size - 1}/${size}`;

/** Why one attempt stopped, in words, or the error itself when it is not the network's. */
function whyStopped(error: unknown): string {
  if (error instanceof LocalWrite) {
    throw error.cause;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return downloadWords.stalled(Math.round(STALL_MS / 1000));
  }
  const code = cutCode(error);
  if (code) {
    return downloadWords.cut(code);
  }
  if (error instanceof TypeError) {
    return error.message;
  }
  throw error;
}

/** What one attempt came to: the file whole, another attempt (and why), or a wait the host asked for. */
type Outcome =
  | { kind: "done" }
  | { kind: "again"; why: string }
  | { kind: "wait"; ms: number };

/**
 * The host's answer before its body: an {@link Outcome} when it is no body
 * to keep, or whether the body is the rest (`resumes`) or the whole file.
 */
async function readAnswer(
  download: ResumableDownload,
  from: number,
  response: Response
): Promise<Outcome | { resumes: boolean }> {
  const said = await download.answered?.(response);
  if (said && "refuse" in said) {
    throw new Refused(said.refuse);
  }
  if (said) {
    await drop(response);
    return { kind: "wait", ms: said.waitMs };
  }
  const { status } = response;
  if (status === 408 || status === 429 || status >= 500) {
    await drop(response);
    return { kind: "again", why: downloadWords.answered(status) };
  }
  const resumes =
    status === 206 &&
    isTheRest(response.headers.get("content-range"), from, download.size);
  if (status === 416 || (status === 206 && !resumes)) {
    // A part this download did not ask for, or none: nothing here is kept.
    await drop(response);
    await rm(download.partial, { force: true });
    download.log(downloadWords.startedOver(download.what, from, status));
    return { kind: "again", why: downloadWords.answered(status) };
  }
  if (!(response.ok && response.body)) {
    throw new Refused(downloadWords.refused(download.what, status));
  }
  if (from > 0) {
    download.log(
      resumes
        ? downloadWords.resumed(download.what, from, download.size)
        : downloadWords.startedOver(download.what, from, status)
    );
  }
  return { resumes };
}

/** Streams a body onto the partial file, the rest after `from` or the whole from 0. */
async function streamBody(
  download: ResumableDownload,
  body: ReadableStream<Uint8Array>,
  from: number
): Promise<Outcome> {
  let received = from;
  const file = await open(download.partial, from > 0 ? "a" : "w");
  try {
    for await (const chunk of body) {
      if (received + chunk.byteLength > download.size) {
        await file.close().catch(() => undefined);
        await rm(download.partial, { force: true });
        throw new Refused(downloadWords.tooLong(download.what));
      }
      await file.write(chunk).catch((error: unknown) => {
        throw new LocalWrite("the partial file could not be written", {
          cause: error,
        });
      });
      received += chunk.byteLength;
      download.onProgress?.({ received, total: download.size });
    }
  } finally {
    await file.close().catch(() => undefined);
  }
  return received === download.size
    ? { kind: "done" }
    : { kind: "again", why: downloadWords.cut("a short body") };
}

/**
 * One attempt: asks for what the partial file lacks and streams the answer
 * onto it. Answers what came of it, or throws why the attempt stopped (a
 * stall, a cut, a disk error, a refusal).
 */
async function attempt(
  download: ResumableDownload,
  from: number
): Promise<Outcome> {
  const ask = download.fetch ?? fetch;
  const response = await ask(download.url, {
    headers: from > 0 ? { range: `bytes=${from}-` } : {},
    timeout: STALL_MS,
  });
  const read = await readAnswer(download, from, response);
  if ("kind" in read) {
    return read;
  }
  return streamBody(
    download,
    response.body as ReadableStream<Uint8Array>,
    read.resumes ? from : 0
  );
}

/**
 * Streams `url` into `partial` until it holds `size` bytes, attempt after
 * attempt while each brings bytes, each next one asking only for the rest.
 * Gives up after {@link GIVE_UP_AFTER} attempts in a row that brought
 * nothing, keeping what came for the next download to go on from; refuses
 * at once ({@link Refused}) an answer that is a refusal, or a body longer
 * than `size`, which it deletes.
 */
export async function downloadResumably(
  download: ResumableDownload
): Promise<void> {
  let fruitless = 0;
  let attempts = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one attempt at a time, each from where the last stopped
    let from = await partialSize(download.partial);
    if (from > download.size) {
      await rm(download.partial, { force: true });
      from = 0;
    }
    if (from === download.size) {
      return;
    }
    download.onProgress?.({ received: from, total: download.size });
    attempts += 1;
    let why: string;
    try {
      const outcome = await attempt(download, from);
      if (outcome.kind === "done") {
        return;
      }
      if (outcome.kind === "wait") {
        // The host says not yet (the hub still fetching): no attempt spent.
        attempts -= 1;
        await Bun.sleep(outcome.ms);
        continue;
      }
      ({ why } = outcome);
    } catch (error) {
      if (error instanceof Refused || download.ends?.(error)) {
        throw error;
      }
      why = whyStopped(error);
    }
    const now = await partialSize(download.partial);
    fruitless = now > from ? 0 : fruitless + 1;
    if (fruitless >= GIVE_UP_AFTER) {
      throw new Error(
        downloadWords.gaveUp(
          download.what,
          now,
          download.size,
          GIVE_UP_AFTER,
          why
        )
      );
    }
    const waitMs = backoffMs(fruitless);
    download.log(
      downloadWords.retrying(
        download.what,
        now,
        download.size,
        why,
        attempts + 1,
        waitMs
      )
    );
    await Bun.sleep(waitMs);
  }
}

/** Whether the file at `path` is exactly `size` bytes hashing to `sha256`, read as a stream. */
export async function fileMatches(
  path: string,
  size: number,
  sha256: string
): Promise<boolean> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size !== size) {
    return false;
  }
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of file.stream()) {
    hasher.update(chunk);
  }
  return hasher.digest("hex") === sha256;
}
