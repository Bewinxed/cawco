/**
 * A shell command cut where it may break as the approval card draws it
 * (ApprovalCard.svelte): between commands (after `&&`, `||`, `|`, `;`),
 * and, inside one command too long for its line, between groups that keep
 * a program with its subcommand ("git reset"), a flag with what follows it
 * ("--cwd apps/dashboard"), an operator with the command it ends, and a short
 * token with the one before it ("git clean -fd"). No short token stands alone
 * on a line.
 *
 * Nothing is rewritten: the parts and the whitespace between them, in order,
 * are the command's text exactly, so what is copied is what runs.
 */

/** A group that wraps only when it alone is wider than its line, and the whitespace after it. */
export interface CommandPart {
  after: string;
  text: string;
}

/** One command, its operator ending its last part, and the whitespace after it. */
export interface CommandRun {
  after: string;
  parts: CommandPart[];
}

/** A line of the command: its leading whitespace, then its commands. */
export interface CommandLine {
  lead: string;
  runs: CommandRun[];
}

/** Longest first, so `&&` is never read as two `&`s. A lone `&` is a redirect's (`2>&1`), not a break. */
const OPERATORS = ["&&", "||", "|&", "|", ";"] as const;
/** A token this short never starts a group: it stays with the one before it. */
const SHORT = 3;
const SPACE = /\s/;

interface Token {
  kind: "op" | "space" | "word";
  text: string;
}

const operatorAt = (line: string, at: number): string | undefined =>
  OPERATORS.find((operator) => line.startsWith(operator, at));

/** Where the word starting at `from` ends: outside quotes, at whitespace or an operator. */
const wordEnd = (line: string, from: number): number => {
  let at = from;
  let quote: string | null = null;
  while (at < line.length) {
    const char = line[at];
    if (quote) {
      if (char === "\\" && quote === '"') {
        at += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      at += 1;
      continue;
    }
    if (char === "\\") {
      at += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      at += 1;
      continue;
    }
    if (SPACE.test(char ?? "") || operatorAt(line, at)) {
      break;
    }
    at += 1;
  }
  return Math.min(at, line.length);
};

const tokensOf = (line: string): Token[] => {
  const tokens: Token[] = [];
  let at = 0;
  while (at < line.length) {
    if (SPACE.test(line[at] ?? "")) {
      let end = at;
      while (end < line.length && SPACE.test(line[end] ?? "")) {
        end += 1;
      }
      tokens.push({ kind: "space", text: line.slice(at, end) });
      at = end;
      continue;
    }
    const operator = operatorAt(line, at);
    if (operator) {
      tokens.push({ kind: "op", text: operator });
      at += operator.length;
      continue;
    }
    const end = wordEnd(line, at);
    tokens.push({ kind: "word", text: line.slice(at, end) });
    at = end;
  }
  return tokens;
};

/** `b` into `a`, the whitespace between them kept. */
const join = (a: CommandPart, b: CommandPart): void => {
  a.text += a.after + b.text;
  a.after = b.after;
};

const isFlag = (word: string): boolean => word.startsWith("-");

/** One command's words as the groups it may break between. */
const grouped = (words: CommandPart[]): CommandPart[] => {
  const groups: CommandPart[] = [];
  words.forEach((word, index) => {
    const last = groups.at(-1);
    const before = words[index - 1];
    const joins =
      last !== undefined &&
      before !== undefined &&
      // The program and its subcommand: "git reset", "bun run".
      ((index === 1 && !isFlag(word.text)) ||
        // A flag and what follows it: "--cwd apps/dashboard".
        (isFlag(before.text) && !isFlag(word.text)) ||
        word.text.length <= SHORT);
    if (joins) {
      join(last, word);
    } else {
      groups.push({ ...word });
    }
  });
  return groups;
};

const lineOf = (line: string): CommandLine => {
  const runs: CommandRun[] = [];
  let lead = "";
  let words: CommandPart[] = [];
  const close = (): void => {
    if (words.length === 0) {
      return;
    }
    const parts = grouped(words);
    const last = parts.at(-1) as CommandPart;
    runs.push({ parts, after: last.after });
    last.after = "";
    words = [];
  };
  for (const token of tokensOf(line)) {
    if (token.kind === "space") {
      const last = words.at(-1);
      const run = runs.at(-1);
      if (last) {
        last.after += token.text;
      } else if (run) {
        run.after += token.text;
      } else {
        lead += token.text;
      }
      continue;
    }
    if (token.kind === "word") {
      words.push({ text: token.text, after: "" });
      continue;
    }
    // An operator ends the command before it, on that command's last word.
    const last = words.at(-1);
    if (last) {
      join(last, { text: token.text, after: "" });
      close();
      continue;
    }
    const run = runs.at(-1);
    const part = run?.parts.at(-1);
    if (run && part) {
      part.text += run.after + token.text;
      run.after = "";
    } else {
      words.push({ text: token.text, after: "" });
      close();
    }
  }
  close();
  return { lead, runs };
};

/** The command's lines, each cut into its commands and their groups. */
export const commandLines = (command: string): CommandLine[] =>
  command.split("\n").map(lineOf);
