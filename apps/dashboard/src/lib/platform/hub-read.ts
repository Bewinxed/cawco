import { fetchHub, type HubRequest } from "@cawco/core/hub-request";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import { z } from "zod";
/**
 * A read from the hub that says how it ended: the value, or the status the
 * hub answered and its own words. Loads use it so a failed read is carried to
 * whatever shows the data, or thrown where the page cannot stand without it —
 * never turned into an empty value that looks like a real answer.
 */

/**
 * A refused read: the status, and why, without its closing stop
 * ({@link hubFailure}). `code` is the hub's stable name for the cause (its
 * problem's `code`: every route's refusal carries one), for a caller that
 * tells causes apart; never shown as it is.
 */
export interface HubFailure {
  code?: string;
  detail: string;
  status: number;
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
 * A request the hub refused, as Eden's client hands it back (`if
 * (answer.error)`, the answer itself): the status and the body Eden read
 * (`error`), and the answer, for its headers. A request that got no answer
 * comes back so too, as Eden's 503, its `value` the error `fetch` rejected
 * with and no answer beside it.
 */
export interface Refused {
  error: { status: unknown; value: unknown };
  response: Response;
}

/**
 * A refused answer read whole, as Eden reads one ({@link Refused}), for a
 * request sent by `fetch` itself (a stream, a file, one of the dashboard's
 * own routes): its text, as JSON when it is.
 */
export async function refusedOf(response: Response): Promise<Refused> {
  const text = await response.text();
  return {
    error: { status: response.status, value: textValue(text) },
    response,
  };
}

/** A body's text as Eden reads it: JSON when it parses as an object or a list, else the text. */
function textValue(text: string): unknown {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return text;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/**
 * Whether `refused` is a request that got no answer at all: Eden hands back
 * what `fetch` rejected with as its value, with no answer beside it.
 */
export const unanswered = (refused: Refused): boolean =>
  refused.error.value instanceof Error;

/**
 * The answer of `refused`. A request that got no answer at all rejects here
 * with what `fetch` threw (a `TypeError` with the browser's words, an
 * abort's `AbortError`), as it rejected before Eden: every reader of a
 * refusal goes through this first.
 */
function refusedAnswer(refused: Refused): Response {
  if (unanswered(refused)) {
    throw refused.error.value;
  }
  return refused.response;
}

/**
 * A refusal as the {@link MachineAwayError} it is when the hub says its
 * machine is away; null otherwise, for the caller's own refusal.
 */
export function awayOf(refused: Refused): MachineAwayError | null;
/** A refused `response` as {@link awayOf} reads it, its body read first. */
export function awayOf(response: Response): Promise<MachineAwayError | null>;
export function awayOf(
  input: Refused | Response
): MachineAwayError | null | Promise<MachineAwayError | null> {
  if (input instanceof Response) {
    return refusedOf(input).then((read) => awayOf(read));
  }
  const refused = input;
  const { away, reconnectingMs } = machineAway(refusedAnswer(refused));
  return away
    ? new MachineAwayError(
        away,
        deadlineIn(reconnectingMs),
        failureSentence(hubFailure(refused))
      )
    : null;
}

/**
 * THE ONE READER of a refused response, everywhere the dashboard asks the
 * hub: what it said, its reason as the hub wrote it without its closing
 * stop, and never the body as it came. Every refusal of the hub is an RFC
 * 9457 problem (Elysia's `problem()`): its `detail`, else its `title`, and its
 * `code`. Anything else (a proxy's page in front of the hub, an empty body)
 * is the hub not answering: that, with its status ({@link noAnswer}).
 */
export function hubFailure(refused: Refused): HubFailure;
/** A refused `response` as {@link hubFailure} reads it, its body read first. */
export function hubFailure(response: Response): Promise<HubFailure>;
export function hubFailure(
  input: Refused | Response
): HubFailure | Promise<HubFailure> {
  if (input instanceof Response) {
    return refusedOf(input).then((read) => hubFailure(read));
  }
  const refused = input;
  const { status } = refusedAnswer(refused);
  const problem = problemOf(refused.error.value);
  return {
    status,
    detail:
      problem?.code === PARSE_PROBLEM
        ? hubFailureWords.unreadRequest
        : (sentenceOf(problem?.detail ?? problem?.title) ?? noAnswer(status)),
    ...(problem?.code ? { code: problem.code } : {}),
  };
}

/**
 * {@link hubFailure} as the error its caller throws, its sentence closed:
 * what every refused write and read rejects with. `then` is what the
 * caller says came of it ("so the project was not saved. Try again."),
 * said after the hub not answering; the hub's own words already say it.
 */
export function hubRefusal(refused: Refused, then?: string): Error;
/** A refused `response` as {@link hubRefusal} reads it, its body read first. */
export function hubRefusal(response: Response, then?: string): Promise<Error>;
export function hubRefusal(
  input: Refused | Response,
  then?: string
): Error | Promise<Error> {
  if (input instanceof Response) {
    return refusedOf(input).then((refused) => hubRefusal(refused, then));
  }
  const failure = hubFailure(input);
  const { detail, status } = failure;
  return new Error(
    then && detail === noAnswer(status)
      ? `${detail}, ${then}`
      : failureSentence(failure)
  );
}

/** What the hub said went wrong, in one clause without its stop, its status after it ({@link refusalClause}). */
export function hubSaid(refused: Refused): string;
/** A refused `response` as {@link hubSaid} reads it, its body read first. */
export function hubSaid(response: Response): Promise<string>;
export function hubSaid(input: Refused | Response): string | Promise<string> {
  if (input instanceof Response) {
    return refusedOf(input).then((refused) => hubSaid(refused));
  }
  return refusalClause(hubFailure(input));
}

/**
 * THE ONE READER of a hub request's JSON answer, everywhere the dashboard
 * asks the hub for one. Refused, `failure`'s error is thrown: the hub's
 * refusal in its own words ({@link hubRefusal}) unless the caller words it
 * ({@link couldNotOrAway}, {@link refusedOrUnreached}, its own `then`).
 * Answered, its body is read by {@link answerOf}, as {@link readHub} reads a
 * load's.
 */
export async function hubJson<T>(
  request: HubRequest,
  {
    failure = (response) => hubRefusal(response),
    init,
  }: {
    failure?: (response: Response) => Promise<Error>;
    init?: RequestInit;
  } = {}
): Promise<T> {
  const response = await hubFetch(request, init);
  if (!response.ok) {
    throw await failure(response);
  }
  return await answerOf<T>(response);
}

/**
 * An answered request's body as JSON, whatever type it says it is: Elysia
 * sends a route's bare `true`, number or string as text, and that is the
 * route's answer. A body that is no JSON at all (a proxy's page, an empty
 * answer) is the hub not answering, thrown as {@link noAnswer}.
 */
async function answerOf<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    // A read cut off (its signal aborted, the network gone) rejects as it is.
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    throw new Error(`${noAnswer(response.status)}.`, { cause: error });
  }
}

/**
 * A hub write whose answer is not read: refused, `failure`'s error is
 * thrown, worded as {@link hubJson}'s.
 */
export async function hubSend(
  request: HubRequest,
  {
    failure = (response) => hubRefusal(response),
    init,
  }: {
    failure?: (response: Response) => Promise<Error>;
    init?: RequestInit;
  } = {}
): Promise<void> {
  const response = await hubFetch(request, init);
  if (!response.ok) {
    throw await failure(response);
  }
}

/**
 * An answer as Eden's client hands one back (hub.ts): answered, its `data`;
 * refused, its `error` and the answer itself ({@link Refused}).
 */
export type HubAnswer<T> =
  | { data: T; error: null; response: Response; status: number }
  | {
      data: null;
      error: { status: unknown; value: unknown };
      response: Response;
      status: number;
    };

/** What a refused request throws: the hub's refusal in its own words, or the caller's. */
type Refusal = (refused: Refused) => Error;

/**
 * A refused answer as `refusal` words it. A request that got no answer
 * rejects with what `fetch` threw, before any refusal reads it
 * ({@link refusedAnswer}).
 */
function refusalOf(
  answer: { error: Refused["error"]; response: Response },
  refusal: Refusal
): Error {
  const refused = { error: answer.error, response: answer.response };
  refusedAnswer(refused);
  return refusal(refused);
}

/** The content types Eden reads a body as JSON by. */
const JSON_TYPE = /^application\/(?:problem\+)?json(?:;|$)/u;

/** The status a JSON route answers with, named when Eden's parse of its body fails and leaves none. */
const OK = 200;

/** The status of an answer with no body. */
const NO_CONTENT = 204;

/**
 * `call` as it settles, a body that says it is JSON and doesn't parse (Eden
 * rejects with the parser's `SyntaxError`) thrown as the hub not answering.
 */
const settled = <T>(
  call: Promise<HubAnswer<T>> | HubAnswer<T>
): Promise<HubAnswer<T>> =>
  Promise.resolve(call).catch((error: unknown) => {
    if (error instanceof SyntaxError) {
      throw new Error(`${noAnswer(OK)}.`, { cause: error });
    }
    throw error;
  });

/**
 * An answered body as Eden read it, which must be JSON: Elysia sends a
 * route's bare `true` or number as text, and Eden reads those; a body that
 * is no JSON at all (a proxy's page, an empty answer), which Eden hands back
 * as its text, is the hub not answering ({@link noAnswer}). A 204 says it
 * has no body, and is answered as Eden reads it.
 */
function bodyOf<T>(answer: Extract<HubAnswer<T>, { error: null }>): T {
  const kind = answer.response.headers.get("content-type") ?? "";
  if (
    typeof answer.data === "string" &&
    answer.status !== NO_CONTENT &&
    !JSON_TYPE.test(kind)
  ) {
    throw new Error(`${noAnswer(answer.status)}.`);
  }
  return answer.data;
}

/**
 * THE ONE READER of what the hub answers, everywhere the dashboard asks it
 * through Eden (hub.ts): refused, `refusal`'s error is thrown, the hub's
 * refusal in its own words ({@link hubRefusal}) unless the caller words it
 * ({@link couldNotOrAway}, {@link refusedOrUnreached}, its own `then`);
 * answered, its body ({@link bodyOf}). `call` may be an answer already
 * awaited, for a caller that reads one status of it as no refusal first.
 */
export async function hubData<T>(
  call: Promise<HubAnswer<T>> | HubAnswer<T>,
  refusal: Refusal = hubRefusal
): Promise<T> {
  const answer = await settled(call);
  if (answer.error) {
    throw refusalOf(answer, refusal);
  }
  return bodyOf(answer);
}

/**
 * A hub write whose answer is not read: refused, `refusal`'s error is
 * thrown, worded as {@link hubData}'s; answered, its body is never asked
 * to be JSON.
 */
export async function hubDone(
  call: Promise<HubAnswer<unknown>>,
  refusal: Refusal = hubRefusal
): Promise<void> {
  const answer = await call.catch((error: unknown) => {
    // A body that says it is JSON and doesn't parse: an answer all the same.
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  });
  if (answer?.error) {
    throw refusalOf(answer, refusal);
  }
}

/**
 * A request whose answer is neither read nor said (a beat, an ack): it
 * rejects only when it got no answer at all, with what `fetch` threw.
 */
export async function hubReached(
  call: Promise<HubAnswer<unknown>>
): Promise<void> {
  const answer = await call;
  if (answer.error && unanswered(answer)) {
    throw answer.error.value;
  }
}

/**
 * A load's read of the hub, as it shows one: refused, why ({@link
 * hubFailure}); answered, its body ({@link bodyOf}).
 */
export async function hubRead<T>(
  call: Promise<HubAnswer<T>>
): Promise<HubRead<T>> {
  const answer = await settled(call);
  if (answer.error) {
    return {
      ok: false,
      ...hubFailure({ error: answer.error, response: answer.response }),
    };
  }
  return { ok: true, value: bodyOf(answer) };
}

/**
 * A Configure read's or write's refusal: "Couldn't `attempt`. The hub's
 * words." ({@link couldNot}), or the {@link MachineAwayError} when the hub
 * says the machine it asked is away ({@link awayOf}).
 */
export function couldNotOrAway(attempt: string): {
  (refused: Refused): Error;
  (response: Response): Promise<Error>;
} {
  function refusal(refused: Refused): Error;
  function refusal(response: Response): Promise<Error>;
  function refusal(input: Refused | Response): Error | Promise<Error> {
    if (input instanceof Response) {
      return refusedOf(input).then((refused) => refusal(refused));
    }
    return awayOf(input) ?? couldNot(attempt, input);
  }
  return refusal;
}

/**
 * A refusal where a hub away or restarting throws its one wording: a
 * request the dashboard's proxy never got to the hub is the
 * {@link HubUnreachable} it is; any other, the hub's sentence, thrown as it
 * is (it already says what to do).
 */
export function refusedOrUnreached(refused: Refused): Error;
/** A refused `response` as {@link refusedOrUnreached} reads it, its body read first. */
export function refusedOrUnreached(response: Response): Promise<Error>;
export function refusedOrUnreached(
  input: Refused | Response
): Error | Promise<Error> {
  if (input instanceof Response) {
    return refusedOf(input).then((refused) => refusedOrUnreached(refused));
  }
  return unreachedAnswer(refusedAnswer(input))
    ? new HubUnreachable(HUB_UNREACHABLE)
    : hubRefusal(input);
}

/**
 * A refused Configure write as the error it throws: "Couldn't `attempt`."
 * and then the hub's words in the error formula, its status after them
 * ({@link failureSentence}): "Couldn't start sign-in to ElevenLabs. This
 * server refused client registration (400)."
 */
export function couldNot(attempt: string, refused: Refused): Error;
/** A refused `response` as {@link couldNot} reads it, its body read first. */
export function couldNot(attempt: string, response: Response): Promise<Error>;
export function couldNot(
  attempt: string,
  input: Refused | Response
): Error | Promise<Error> {
  if (input instanceof Response) {
    return refusedOf(input).then((refused) => couldNot(attempt, refused));
  }
  return new Error(
    `Couldn't ${attempt}. ${failureSentence(hubFailure(input))}`
  );
}

/**
 * A hub request sent from this page: `request` as core's door built it
 * (`hubRequest`, held to what its route takes), with `init`'s own signal,
 * keepalive or other headers beside it, through `through`: the page's
 * `fetch`, or a load's own. The one way the dashboard's code sends the hub a
 * request.
 */
export const hubFetch = (
  request: HubRequest,
  init: RequestInit = {},
  through: typeof globalThis.fetch = fetch
): Promise<Response> => fetchHub(through, "", request, init);

/**
 * A refused read as a clause without its stop: the hub's words with their
 * status after them for support (DESIGN.md, Voice, Error formula), or that it
 * didn't answer, which already names it. Every refusal the dashboard shows
 * says the hub's words so, through this or {@link failureSentence}.
 */
export const refusalClause = ({ detail, status }: HubFailure): string =>
  detail === noAnswer(status) ? detail : `${detail} (${status})`;

/** {@link refusalClause} as a sentence with its stop. */
export const failureSentence = (failure: HubFailure): string =>
  `${refusalClause(failure)}.`;

/**
 * The problem code the hub's framework writes when a request's body does not
 * parse as the type it came with (Elysia's `ParseError`, code `parse`, thrown
 * before any route of the hub runs). Its detail is the parser's exception
 * ("Unexpected end of JSON input"), and in production there is none, so it is
 * never a reason a person reads; core `hubFailureWords.unreadRequest` stands
 * for it. No route of the hub writes this code.
 */
const PARSE_PROBLEM = "parse";

/** That the hub didn't answer, naming the status that came instead, without a closing stop. */
const { noAnswer } = hubFailureWords;

/** A problem's fields that are strings, from a body Eden read as an object; null for any other body. */
function problemOf(value: unknown): {
  code?: string;
  detail?: string;
  title?: string;
} | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const body = z.record(z.string(), z.unknown()).catch({}).parse(value);
  const field = (key: string) => {
    const one = body[key];
    return typeof one === "string" && one !== "" ? one : undefined;
  };
  return {
    code: field("code"),
    detail: field("detail"),
    title: field("title"),
  };
}

/** A sentence's closing stop, dropped so the hub's words sit inside ours. */
const FINAL_STOP = /\.$/u;

/** Markup or a JSON dump, not prose: a reason never starts so. */
const NOT_PROSE = /^[<{[]/u;

/**
 * A thrown error's label ("Error:", "TypeError:"): the runtime's name for the
 * throw, not a word of the reason (DESIGN.md, Voice, "Error formula": a technical code
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
 * A new project's prompt that got no answer, in the error formula: what,
 * why, what is kept, the way back. It may have reached the hub: it goes
 * again under the id it went as (id.ts `idForWords`), which the hub takes
 * as the same ask.
 */
export const PROMPT_UNREACHED = hubFailureWords.promptUnreached;

/** Whether `error` is a request that never reached the hub, or never heard back from it. */
export function unreachable(error: unknown): boolean {
  return (
    error instanceof HubUnreachable ||
    (error instanceof TypeError && NO_ANSWER.test(error.message))
  );
}

/**
 * A request that got no answer, as a person reads it (DESIGN.md, Voice, "Error
 * formula"): what happened, why, and the way back. The browser's own words
 * ("Failed to fetch") are never the what-happened.
 */
export const HUB_UNREACHABLE = hubFailureWords.unreachable;

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

/**
 * Reads `request` through the given fetch (a load's own): refused, why, as
 * the load shows it; answered, its body read by {@link answerOf}, as
 * {@link hubJson} reads one.
 */
export async function readHub<T>(
  fetch: typeof globalThis.fetch,
  request: HubRequest,
  init: RequestInit = {}
): Promise<HubRead<T>> {
  const response = await fetchHub(fetch, "", request, init);
  if (!response.ok) {
    return { ok: false, ...hubFailure(await refusedOf(response)) };
  }
  return { ok: true, value: await answerOf<T>(response) };
}
