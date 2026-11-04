/**
 * The mock model's tool calls, for every probe that drives a session to
 * call a tool and reads what the tool answered: the one place a tool's
 * answer is read off the requests that follow its call.
 *
 * A call's answer is the request after it (its `tool_result`), unless
 * Claude Code moved the call to the background: a message reached the
 * session while it ran (the hub's delivery of the person's marks, a send),
 * so the request after it says `MCP tool "cawco/artifact_create" was moved
 * to the background as task kr5oov2q7 …` (Claude Code 2.1.318), and the
 * call's result comes in a later turn's task notification
 * (`<task-notification><task-id>…</task-id><status>…</status>…<result>…
 * </result>`). Read as the answer, that line was an empty one: pane-refusal
 * (o) and (w) found no artifact id in it. {@link ToolAnswer} reads both;
 * {@link ToolCalls} is the mock every spec that calls a tool on a marker
 * (`PROBE-CALL:<n>`) shares. scripts/lint/tool-answer-from-last.grit refuses
 * a probe that takes a request's `last` for a tool's answer itself.
 */
import { type Reply, type Seen, until } from "./scratch-fleet";

/** The line a call Claude Code moved to the background answers: the task it runs as. */
const MOVED_TO_BACKGROUND = /was moved to the background as task (\w+)/u;
/** A finished background task's notification: its id, its status, and the call's result. */
const TASK_RESULT =
  /<task-id>(\w+)<\/task-id>(?:\s*<status>(\w+)<\/status>)?[\s\S]*?<result>\n?([\s\S]*?)\n?<\/result>/gu;

/** A tool's answer as it came. */
export interface Answered {
  /** The tool answered an error: its result's `is_error`, or a task that did not complete. */
  failed: boolean;
  /** The request that carried it when it was the call's own result; none when a task notification did. */
  request?: Seen;
  /** What the tool answered: the result request's `last` (with any words read mid-turn beside it), or the task's result. */
  text: string;
}

/**
 * One tool call's answer, read off the requests that follow the call: the
 * first one after it (`afterTool`), or, when that one says the call was
 * moved to the background, the later one whose task notification carries
 * its result. Hand it every request after the call; it answers once.
 */
export class ToolAnswer {
  #task: string | undefined;
  #answered: Answered | undefined;

  /** The answer, once a request has carried it. */
  get answered(): Answered | undefined {
    return this.#answered;
  }

  /** Reads `request`, one after the call: the answer when it carries it (or carried one before), else none yet. */
  read(request: Seen): Answered | undefined {
    if (this.#answered) {
      return this.#answered;
    }
    if (this.#task === undefined) {
      if (!request.afterTool) {
        return;
      }
      this.#task = MOVED_TO_BACKGROUND.exec(request.last)?.[1];
      if (this.#task === undefined) {
        this.#answered = {
          failed: request.toolFailed,
          request,
          text: request.last,
        };
        return this.#answered;
      }
    }
    const done = [...request.all.matchAll(TASK_RESULT)].find(
      (match) => match[1] === this.#task
    );
    if (done) {
      this.#answered = {
        failed: done[2] !== undefined && done[2] !== "completed",
        text: done[3] ?? "",
      };
    }
    return this.#answered;
  }
}

/** What sends a session its words: a scratch fleet. */
interface Sends {
  send: (to: string, words: string) => Promise<unknown>;
}

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/**
 * The mock's call of `name(input)`: the call itself once the tool is
 * offered, else ToolSearch loading it while it is deferred, else words
 * saying it is not offered.
 */
export const toolReply = (
  request: Seen,
  name: string,
  input: object
): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${name}`, max_results: 1 },
        },
      }
    : text(`${name} is not offered`);
};

/**
 * The mock's tool calls on markers: a session sent `<tag>:<marker>` calls
 * the tool asked of that marker, loading it through ToolSearch first when
 * it is deferred, once, and its answer is read ({@link ToolAnswer}) from
 * the requests after it. A spec's `respond` hands each request to
 * {@link reply} and answers it its own way when that answers nothing.
 */
export class ToolCalls {
  readonly #tag: string;
  readonly #marker: RegExp;
  readonly #asks = new Map<string, { input: object; name: string }>();
  readonly #issuedAt = new Map<string, number>();
  readonly #answers = new Map<string, ToolAnswer>();
  readonly #answeredAt = new Map<string, number>();
  #count = 0;

  constructor(tag = "PROBE-CALL") {
    this.#tag = tag;
    this.#marker = new RegExp(`${tag}:([\\w-]+)`, "gu");
  }

  /** The words that start call `marker` in the session sent them. */
  words(marker: string): string {
    return `${this.#tag}:${marker}`;
  }

  /** Call `marker` is `call.name(call.input)`: sending its {@link words} starts it. */
  ask(marker: string, call: { input: object; name: string }): void {
    this.#asks.set(marker, call);
  }

  /** The newest marker `request`'s conversation holds. */
  markerOf(request: Seen): string | undefined {
    return [...request.all.matchAll(this.#marker)].at(-1)?.[1];
  }

  /** Whether call `marker`'s tool call went out. */
  issued(marker: string): boolean {
    return this.#issuedAt.has(marker);
  }

  /** When the model called call `marker`'s tool, ms since the epoch. */
  issuedAt(marker: string): number | undefined {
    return this.#issuedAt.get(marker);
  }

  /** Call `marker`'s answer, once it came. */
  answer(marker: string): string | undefined {
    return this.#answers.get(marker)?.answered?.text;
  }

  /** Call `marker`'s answer whole: its words, whether it failed, the request that carried it. */
  answered(marker: string): Answered | undefined {
    return this.#answers.get(marker)?.answered;
  }

  /** When call `marker`'s answer came, ms since the epoch. */
  answeredAt(marker: string): number | undefined {
    return this.#answeredAt.get(marker);
  }

  /**
   * The mock's reply to `request` for the call its newest marker asks, or
   * none when it asks none: the tool called once it is offered (ToolSearch
   * first while it is deferred), then to every request after it, each read
   * for the answer, what `after` says of the marker, else "done".
   */
  reply(
    request: Seen,
    after?: (marker: string) => Reply | undefined
  ): Reply | undefined {
    const marker = this.markerOf(request);
    const ask = marker ? this.#asks.get(marker) : undefined;
    if (!(marker && ask)) {
      return;
    }
    if (this.#issuedAt.has(marker)) {
      const answer = this.#answers.get(marker) ?? new ToolAnswer();
      this.#answers.set(marker, answer);
      const had = answer.answered;
      if (answer.read(request) && !had) {
        this.#answeredAt.set(marker, Date.now());
      }
      return after?.(marker) ?? text("done");
    }
    const reply = toolReply(request, ask.name, ask.input);
    if (reply.tool?.name === ask.name) {
      this.#issuedAt.set(marker, Date.now());
    }
    return reply;
  }

  /**
   * Session `to` calls `name(input)`, on the next free marker unless
   * `marker` names one: its answer, whether the call answered at once or
   * from the background.
   */
  async call(
    fleet: Sends,
    to: string,
    name: string,
    input: object,
    {
      marker,
      timeoutMs = 180_000,
    }: { marker?: string; timeoutMs?: number } = {}
  ): Promise<string> {
    this.#count += 1;
    const at = marker ?? String(this.#count);
    this.ask(at, { name, input });
    await fleet.send(to, this.words(at));
    return await until(
      `the ${name} call (${at})`,
      () => this.answer(at),
      (said) => said !== undefined,
      timeoutMs
    );
  }
}
