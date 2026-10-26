/**
 * A call the release makes to a service outside this host (Apple's notary
 * service and its S3 bucket, GitHub's releases, a pinned download), asked
 * again when it got no answer and never when it got one.
 *
 * WHY. Nightly 5514 (7ac75ac07) failed on "error sending request for url
 * (https://appstoreconnect.apple.com/notary/v2/submissions)": one dropped
 * request ended the whole release while Apple answered seconds later.
 *
 * THE RULE is the error's kind, never its words:
 * - {@link NoAnswer}: no response came back (DNS, connect, TLS, a reset, the
 *   attempt's time running out), or the service said it could not answer
 *   now (a 5xx, 408, 429). {@link persist} asks again, with backoff, a few
 *   times and bounded in total time, logging each retry with its attempt
 *   number and the error.
 * - {@link Refused}: the service answered and said no (any other status at
 *   or above 400). It is thrown at once, carrying the service's own words.
 * - Anything else thrown is the caller's own failure and ends the call too.
 *
 * A call that is not safe to repeat (one that makes something) is retried
 * only through its own attempt function, which is told the attempt number
 * and looks first for what an earlier, unanswered attempt may have made.
 */

import { readWithin } from "../../packages/core/src/bounded";

/** No answer came back: {@link persist} asks again. */
export class NoAnswer extends Error {
  override readonly name = "NoAnswer";
}

/** The service answered and refused: never asked again. */
export class Refused extends Error {
  override readonly name = "Refused";
  readonly status: number;
  /** The service's own words: the body it answered with. */
  readonly said: string;
  constructor(what: string, status: number, said: string) {
    super(`${what} was refused: ${status}${said ? ` ${said.trim()}` : ""}`);
    this.status = status;
    this.said = said;
  }
}

/** How long a call keeps asking. */
export interface Patience {
  /** Attempts in all, the first included. */
  attempts: number;
  /** The wait before the second attempt; each later one doubles it. */
  firstWaitMs: number;
  /** No attempt starts past this much time from the first. */
  totalMs: number;
}

/** Five attempts over up to five minutes: 2s, 4s, 8s, 16s between them. */
export const PATIENCE: Patience = {
  attempts: 5,
  firstWaitMs: 2000,
  totalMs: 5 * 60_000,
};

/** Statuses that say "not now" rather than "no": a server's failure, a timeout, a rate limit. */
const notNow = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429;

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * `attempt` run until it returns, asked again only while it throws
 * {@link NoAnswer}, within `patience`. Each retry is logged as
 * `[release] retry <what>: attempt n of N got no answer (<error>), next in Ns`.
 */
export async function persist<T>(
  what: string,
  attempt: (n: number) => Promise<T>,
  patience: Patience = PATIENCE
): Promise<T> {
  const started = performance.now();
  for (let n = 1; ; n += 1) {
    try {
      return await attempt(n);
    } catch (error) {
      if (!(error instanceof NoAnswer)) {
        throw error;
      }
      const wait = patience.firstWaitMs * 2 ** (n - 1);
      const spent = performance.now() - started;
      if (n >= patience.attempts || spent + wait > patience.totalMs) {
        throw new Error(
          `${what} got no answer in ${n} attempts over ${(spent / 1000).toFixed(1)}s: ${reason(error)}`,
          { cause: error }
        );
      }
      console.log(
        `[release] retry ${what}: attempt ${n} of ${patience.attempts} got no answer (${reason(error)}), next in ${wait / 1000}s`
      );
      await Bun.sleep(wait);
    }
  }
}

/** An answer read whole: its status, headers and body. */
export interface Answer {
  /** The body as it came. */
  bytes: Uint8Array;
  headers: Headers;
  status: number;
  /** The body as UTF-8 text. */
  text: string;
}

/** An answer sorted: itself (2xx/3xx), {@link Refused}, or {@link NoAnswer}. */
export const sorted = (what: string, answer: Answer): Answer => {
  if (notNow(answer.status)) {
    throw new NoAnswer(`${what} answered ${answer.status}`);
  }
  if (answer.status >= 400) {
    throw new Refused(what, answer.status, answer.text);
  }
  return answer;
};

/**
 * One HTTP exchange, read whole within `timeoutMs`: the answer when it is
 * one (2xx/3xx), {@link Refused} with the body when the service said no,
 * {@link NoAnswer} when nothing (or "not now") came back. Not retried by
 * itself: {@link ask} is this under {@link persist}.
 */
export async function exchange(
  what: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000
): Promise<Answer> {
  const read = await readWithin(
    timeoutMs,
    async (signal): Promise<Answer | { broke: unknown }> => {
      try {
        const response = await fetch(url, { ...init, signal });
        const bytes = new Uint8Array(await response.arrayBuffer());
        return {
          status: response.status,
          headers: response.headers,
          bytes,
          text: new TextDecoder().decode(bytes),
        };
      } catch (broke) {
        // fetch threw, or the body broke off: no whole answer came back.
        return { broke };
      }
    }
  );
  if (read.kind === "unanswered") {
    throw new NoAnswer(`${what}: no answer within ${timeoutMs / 1000}s`);
  }
  if ("broke" in read.value) {
    throw new NoAnswer(`${what}: ${reason(read.value.broke)}`, {
      cause: read.value.broke,
    });
  }
  return sorted(what, read.value);
}

/** {@link exchange} asked again while it gets no answer: for a request that is safe to repeat. */
export const ask = (
  what: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000
): Promise<Answer> => persist(what, () => exchange(what, url, init, timeoutMs));

/** The status line `gh api --include` prints first: "HTTP/2.0 201 Created". */
const STATUS_LINE = /^HTTP\/[\d.]+ (\d{3})/u;

/**
 * The HTTP answer a command printed in front of its output (`gh api
 * --include`: "HTTP/2.0 201 Created", the headers, a blank line, the body),
 * or undefined when it printed none: then no answer came back.
 */
export const printedAnswer = (out: string): Answer | undefined => {
  const status = STATUS_LINE.exec(out);
  if (!status) {
    return;
  }
  const end = out.indexOf("\r\n\r\n");
  const head = end < 0 ? out : out.slice(0, end);
  const headers = new Headers();
  for (const line of head.split("\r\n").slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  const text = end < 0 ? "" : out.slice(end + 4);
  return {
    status: Number(status[1]),
    headers,
    bytes: new TextEncoder().encode(text),
    text,
  };
};
