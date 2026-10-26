import { z } from "zod";
/**
 * A read from the hub that says how it ended: the value, or the status the
 * hub answered and its own words. Loads use it so a failed read is carried to
 * whatever shows the data, or thrown where the page cannot stand without it —
 * never turned into an empty value that looks like a real answer.
 */

/**
 * A refused read: the status, and why, without its closing stop
 * ({@link hubFailure}). `type` and `title` are the hub's problem
 * fields when it sent them (RFC 9457), for a caller that tells causes
 * apart; never shown as they are.
 */
export interface HubFailure {
  detail: string;
  status: number;
  title?: string;
  type?: string;
}

export type HubRead<T> = { ok: true; value: T } | ({ ok: false } & HubFailure);

/**
 * The machine a transcript read's 503 names as not connected, and, when the
 * hub says it is on its way back (`X-Cawco-Machine-State: reconnecting`:
 * heard from moments ago), for how long more (ms): the hub's `Retry-After`,
 * the time left before it stops reading the machine so. Relative, as the
 * wire says it: whoever holds the answer makes it a deadline on its own
 * clock ({@link deadlineIn}), so no two clocks are ever compared. Null
 * otherwise. Any other answer names no machine.
 */
export function machineAway(response: Response): {
  away: string | null;
  reconnectingMs: number | null;
} {
  const away =
    response.status === 503 ? response.headers.get("x-cawco-machine") : null;
  const reconnecting =
    away !== null &&
    response.headers.get("x-cawco-machine-state") === "reconnecting";
  const seconds = Number(response.headers.get("retry-after"));
  return {
    away,
    reconnectingMs:
      reconnecting && Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : null,
  };
}

/** `ms` from now on this clock (epoch ms), or null with none: a relative wait made a deadline where it is held. */
export function deadlineIn(ms: number | null): number | null {
  return ms === null ? null : Date.now() + ms;
}

/**
 * A read refused because the machine it reads off is away: the hub's 503
 * naming it ({@link machineAway}; hub server.ts `awayStatus`). Every reader of
 * a route that reads off a machine throws it, so the surface that asked says
 * so in place and asks again once the machine is back (machine-wait.svelte.ts
 * `MachineWait`), never as a refusal.
 */
export class MachineAwayError extends Error {
  readonly machineId: string;
  /** Until when (epoch ms, this clock) the hub reads the machine as on its way back; null when it is offline. */
  readonly reconnectingUntil: number | null;
  constructor(
    machineId: string,
    reconnectingUntil: number | null,
    words: string
  ) {
    super(words);
    this.name = "MachineAwayError";
    this.machineId = machineId;
    this.reconnectingUntil = reconnectingUntil;
  }
}

/**
 * A refused `response` as the {@link MachineAwayError} it is when the hub
 * says its machine is away; null otherwise, its body unread for the caller's
 * own refusal.
 */
export async function awayOf(
  response: Response
): Promise<MachineAwayError | null> {
  const { away, reconnectingMs } = machineAway(response);
  return away
    ? new MachineAwayError(
        away,
        deadlineIn(reconnectingMs),
        `${(await hubFailure(response)).detail}.`
      )
    : null;
}

/**
 * THE ONE READER of a refused response, everywhere the dashboard asks the
 * hub: what it said, its reason as the hub wrote it without its closing
 * stop, and never the body as it came. The hub's problem (`type`, `title`, `status`,
 * `detail`; RFC 9457) gives its `detail`, else its `title`; the older
 * `{ error }` and `{ message }` shapes read the same; a plain-text answer
 * is the hub's own sentence. A proxy's page in front of the hub (a
 * tunnel's HTML 502), an empty body, or anything that is not a reason in
 * prose is the hub not answering: that, with its status
 * ({@link noAnswer}). Read from the body and its type alone: a universal
 * load may not read other headers SvelteKit does not serialise.
 */
export async function hubFailure(response: Response): Promise<HubFailure> {
  const { status } = response;
  const kind = response.headers.get("content-type") ?? "";
  const text = kind.includes("html") ? "" : (await response.text()).trim();
  const problem = text.startsWith("{") ? parsed(text) : null;
  const said = problem
    ? (problem.detail ?? problem.title ?? problem.error ?? problem.message)
    : unquoted(text);
  return {
    status,
    detail: sentenceOf(said) ?? noAnswer(status),
    ...(problem?.type ? { type: problem.type } : {}),
    ...(problem?.title ? { title: problem.title } : {}),
  };
}

/**
 * {@link hubFailure} as the error its caller throws, its sentence closed:
 * what every refused write and read rejects with. `then` is what the
 * caller says came of it ("so the project was not saved. Try again."),
 * said after the hub not answering; the hub's own words already say it.
 */
export async function hubRefusal(
  response: Response,
  then?: string
): Promise<Error> {
  const { detail, status } = await hubFailure(response);
  return new Error(
    then && detail === noAnswer(status) ? `${detail}, ${then}` : `${detail}.`
  );
}

/**
 * A refused read as a sentence with its stop: the hub's words with their
 * status after them for support (WORDS.md, Error formula), or that it
 * didn't answer, which already names it.
 */
export const failureSentence = ({ detail, status }: HubFailure): string =>
  detail === noAnswer(status) ? `${detail}.` : `${detail} (${status}).`;

/** That the hub didn't answer, naming the status that came instead, without a closing stop. */
export const noAnswer = (status: number): string =>
  `The hub didn't answer (${status})`;

/** Elysia's refusal as a JSON string (`"No such rule"`) read as its words; any other text as it is. */
function unquoted(text: string): string {
  if (!text.startsWith('"')) {
    return text;
  }
  try {
    const words: unknown = JSON.parse(text);
    return typeof words === "string" ? words : text;
  } catch {
    return text;
  }
}

/** A problem's fields that are strings; null for text that only starts like JSON. */
function parsed(text: string): {
  detail?: string;
  error?: string;
  message?: string;
  title?: string;
  type?: string;
} | null {
  try {
    const body = z
      .record(z.string(), z.unknown())
      .catch({})
      .parse(JSON.parse(text));
    const field = (key: string) =>
      typeof body[key] === "string" && body[key] !== ""
        ? (body[key] as string)
        : undefined;
    return {
      detail: field("detail"),
      error: field("error"),
      message: field("message"),
      title: field("title"),
      type: field("type"),
    };
  } catch {
    return null;
  }
}

/** A sentence's closing stop, dropped so the hub's words sit inside ours. */
const FINAL_STOP = /\.$/u;

/** Markup or a JSON dump, not prose: a reason never starts so. */
const NOT_PROSE = /^[<{[]/u;

/**
 * A thrown error's label ("Error:", "TypeError:"): the runtime's name for the
 * throw, not a word of the reason (WORDS.md, "Error formula": a technical code
 * is never the what-happened).
 */
const ERROR_LABEL = /^[A-Za-z]*(?:[Ee]rror|[Ee]xception):\s*/u;

/**
 * The hub's words as a reason a person reads, without its closing stop:
 * their first line whole, a thrown error's label taken off, when it is
 * prose; null for anything else (markup, a dump, a page, nothing). A stack
 * keeps only its first line, and a page or a dump starts with markup
 * (`NOT_PROSE`) or comes as HTML, which is never read: so no length makes
 * prose "not an answer", and a long refusal (placement's, naming every
 * account it weighed) is shown whole. Whole, not cut to its first sentence
 * either: core's refusals say what happened and then what to do ("That's
 * only part of the code. Copy all of it from the sign-in page, then paste it
 * again."), and the second sentence is the person's way on.
 */
function sentenceOf(said: string | undefined): string | null {
  const line = (said ?? "").split("\n", 1)[0].trim().replace(ERROR_LABEL, "");
  const sentence = line.replace(FINAL_STOP, "");
  return sentence.length > 0 && !NOT_PROSE.test(sentence)
    ? `${sentence[0].toUpperCase()}${sentence.slice(1)}`
    : null;
}

/**
 * The browsers' words for a request that got no answer at all: `fetch`
 * rejects with a TypeError saying one of them (Chromium "Failed to fetch",
 * Firefox "NetworkError when attempting to fetch resource.", Safari "Load
 * failed" or "The network connection was lost.").
 */
const NO_ANSWER =
  /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|The network connection was lost\.?)$/u;

/**
 * The header the dashboard's `/api` proxy sets on its own 502 when the hub
 * did not answer it (`routes/api/[...path]`): the request reached the
 * dashboard and stopped there, never the hub's refusal.
 */
export const HUB_UNREACHABLE_HEADER = "x-cawco-hub-unreachable";

/** A request the dashboard could not get to the hub, or got no answer for. */
export class HubUnreachable extends Error {}

/** Whether `response` is the dashboard's own word that the hub did not answer it. */
export function unreachedAnswer(response: Response): boolean {
  return (
    response.status === 502 &&
    response.headers.get(HUB_UNREACHABLE_HEADER) === "1"
  );
}

/**
 * An ask of Caw's that got no answer (a new project's prompt, a view
 * asked for), in the error formula: what, why, what is kept, the way back.
 * It may have reached him: each goes again under the id it went as (id.ts
 * `idForWords`), which the hub takes as the same ask.
 */
export const THREAD_SEND_UNREACHED =
  "Your message may not have gone: the hub didn't answer. Your words are back in the field. Send again once the hub answers, and it goes once.";

/** Whether `error` is a request that never reached the hub, or never heard back from it. */
export function unreachable(error: unknown): boolean {
  return (
    error instanceof HubUnreachable ||
    (error instanceof TypeError && NO_ANSWER.test(error.message))
  );
}

/**
 * A request that got no answer, as a person reads it (WORDS.md, "Error
 * formula"): what happened, why, and the way back. The browser's own words
 * ("Failed to fetch") are never the what-happened.
 */
export const HUB_UNREACHABLE =
  "The dashboard couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again.";

/**
 * Why something failed, in the one wording every surface shows: a request
 * that never reached the hub says so ({@link HUB_UNREACHABLE}); anything else
 * is the thrower's own words, the hub's refusals already in the formula.
 */
export function failureWords(error: unknown): string {
  if (unreachable(error)) {
    return HUB_UNREACHABLE;
  }
  return error instanceof Error ? error.message : String(error);
}

/** {@link failureWords} without its closing stop, for a sentence of the caller's that carries it. */
export function failureClause(error: unknown): string {
  return failureWords(error).replace(FINAL_STOP, "");
}

/** Reads `path` through the given fetch and parses its JSON, or says why not. */
export async function readHub<T>(
  fetch: typeof globalThis.fetch,
  path: string,
  init?: RequestInit
): Promise<HubRead<T>> {
  const response = await fetch(path, init);
  if (!response.ok) {
    return { ok: false, ...(await hubFailure(response)) };
  }
  return { ok: true, value: (await response.json()) as T };
}
