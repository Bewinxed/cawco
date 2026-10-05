/**
 * The one way the CLI asks a person a question: Node's line reader on standard
 * input and output, one interface for the whole run. Answers typed ahead stay
 * queued for the next question, which `rl.question()` would drop (it ignores a
 * line that arrives while no question is pending), so lines are taken from the
 * interface's async iterator instead. Where standard input is not a terminal,
 * nothing is asked.
 */
import { createInterface, type Interface } from "node:readline";

const ANSWER_TIMEOUT_MS = 60_000;

let ended = false;
let reader: { rl: Interface; lines: AsyncIterator<string> } | undefined;

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

/** One line typed at the terminal; null when there is no terminal, input has ended, or nobody answered in time. */
export async function ask(
  text: string,
  timeoutMs = ANSWER_TIMEOUT_MS
): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return null;
  }
  if (ended) {
    process.stdout.write(`${text}\n`);
    return null;
  }
  const { rl, lines } = open();
  rl.setPrompt(text);
  rl.prompt();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silence = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const next = await Promise.race([lines.next(), silence]);
  clearTimeout(timer);
  // Paused between questions, so a command run in between has the terminal to itself.
  if (next?.done) {
    ended = true;
  } else {
    rl.pause();
  }
  if (next === null || next.done) {
    process.stdout.write("\n");
    return null;
  }
  return next.value;
}

/** Releases standard input so the process can exit. */
export function closeAsking(): void {
  reader?.rl.close();
  reader = undefined;
  ended = false;
}

/** A yes/no question: only an answer beginning with y or Y is a yes. */
export async function askYes(text: string): Promise<boolean> {
  return (await ask(text))?.trim().toLowerCase().startsWith("y") ?? false;
}
