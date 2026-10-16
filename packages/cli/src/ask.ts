/**
 * The one way the CLI asks a person a question: Node's line reader on standard
 * input and output, one interface for the whole run. Answers typed ahead stay
 * queued for the next question, which `rl.question()` would drop (it ignores a
 * line that arrives while no question is pending), so lines are taken from the
 * interface's async iterator instead. Where standard input is not a terminal,
 * nothing is asked.
 */
import { createInterface, type Interface } from "node:readline";
import { type Bounded, Gone, readWithin } from "@cawco/core/bounded";

const ANSWER_TIMEOUT_MS = 60_000;

let ended = false;
let reader: { rl: Interface; lines: AsyncIterator<string> } | undefined;
/** A line asked for by a question nobody answered in time: the next question takes it. */
let waiting: Promise<IteratorResult<string>> | undefined;

const open = () => {
  reader ??= (() => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return { rl, lines: rl[Symbol.asyncIterator]() };
  })();
  return reader;
};

/**
 * What asking came to: the line typed, the person not answering in time (or
 * standard input ending, reason "dead"), or nothing asked where there is no
 * terminal or its input already ended.
 */
export type Asked<T> = Bounded<T> | { kind: "not asked" };

/** One line typed at the terminal. */
export async function ask(
  text: string,
  timeoutMs = ANSWER_TIMEOUT_MS
): Promise<Asked<string>> {
  if (!process.stdin.isTTY) {
    return { kind: "not asked" };
  }
  if (ended) {
    process.stdout.write(`${text}\n`);
    return { kind: "not asked" };
  }
  const { rl, lines } = open();
  rl.setPrompt(text);
  rl.prompt();
  const answer = await readWithin(timeoutMs, async (signal) => {
    waiting ??= lines.next();
    const next = await waiting;
    if (signal.aborted) {
      // This question was let go: the line stays for the next one.
      return "";
    }
    waiting = undefined;
    if (next.done) {
      ended = true;
      throw new Gone("standard input ended");
    }
    return next.value;
  });
  // Paused between questions, so a command run in between has the terminal to itself.
  if (!ended) {
    rl.pause();
  }
  switch (answer.kind) {
    case "answered":
      return answer;
    case "unanswered":
      process.stdout.write("\n");
      return answer;
    default: {
      const unhandled: never = answer;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Releases standard input so the process can exit. */
export function closeAsking(): void {
  reader?.rl.close();
  reader = undefined;
  waiting = undefined;
  ended = false;
}

/** A yes/no question: only an answer beginning with y or Y is a yes. */
export async function askYes(text: string): Promise<Asked<boolean>> {
  const answer = await ask(text);
  switch (answer.kind) {
    case "answered":
      return {
        kind: "answered",
        value: answer.value.trim().toLowerCase().startsWith("y"),
      };
    case "unanswered":
    case "not asked":
      return answer;
    default: {
      const unhandled: never = answer;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}
