/**
 * The hub's gate on a project's Caw's own hands (owner, 2026-10-14: "caw
 * should be able to do whatever it wants … it should ask the user as
 * appropriate, not using text but actually asking permission"). Caw has
 * shell and edit tools inside the boundary of his place (caw.ts
 * `leadPlaceRef`), and every call of one reaches the hub as a permission ask
 * (core `LEAD_GATED_TOOLS`), which this decides before anything else sees it:
 *
 * 1. **Budget**: at most {@link CALLS_PER_WAKE} shell or edit calls in one
 *    wake (a turn, from the sends it read to its result); past it, refused:
 *    "delegate the rest".
 * 2. **Hard denials by argv** in a shared checkout (a place another live
 *    session also uses, or the project's folder the hub itself commits to;
 *    a delegate's workspace is a clone of its own, in no one's tree, and
 *    never makes one): `git checkout|reset|stash|clean|rebase|push`, `git add -A`
 *    and `git add .`, wherever they sit in the command (after `&&`, in a
 *    pipe, under `sh -c`, `eval`, `xargs`, `env`, a substitution). Refused:
 *    "file a task". Other people's repositories are not judged here: his
 *    place, like every workspace, holds no forge's credential, and what it
 *    writes with one goes through its doors on the machine, which keep to
 *    the project's upstream choice (core upstream-guard.ts).
 * 3. **Caw edits and size**: the files Caw may edit are the ones his project
 *    declares (gate.md's `Caw edits:` globs, gate-file.ts). With a list, an
 *    edit of a file it does not match is refused: "is not in this project's
 *    Caw edits: file a task". With none, the edit goes to your Approve card,
 *    its file neither refused nor guessed at; a gate.md that does not read
 *    refuses it, naming its problems. An edit that would take the wake past
 *    {@link FILES_PER_WAKE} files is refused: "file a task".
 * 4. **Turn provenance**, the one rule every session runs under (core
 *    turn-provenance.ts, kept by turn-provenance.ts): in a turn that is not
 *    the owner's (an event, a routine, a report, a nudge, an inbox of outside
 *    events or a web read came into it) every shell and edit call raises the
 *    Approve card, saying what made the turn outside.
 * 5. **The owner's turn**: a line that only reads ({@link readOnly}: readers
 *    and reading git, `git -C <path>` and `git fetch` of a named remote among
 *    them, the machine's own listings (`ps`, `ss`, `ip addr`), a `curl` GET,
 *    output only into `/dev/null` or another descriptor) runs; so do
 *    `git init`, `git add <paths>` and `git commit` where no one else works
 *    ({@link allowlisted}), and an edit of a file his project's Caw edits
 *    list. Anything else (an edit with no list, any other write, a line the
 *    gate cannot read) raises the Approve card, the ask parked as any
 *    session's is. A PowerShell line, which the gate's POSIX reader cannot
 *    read, and a pi lead's call of a tool from the person's own extensions,
 *    which may do anything, always raise it. The card says, in one line,
 *    which rule sent the call there ("Asked because …", kept as the call's
 *    `why`).
 * 6. **Visible**: every call is a `lead_calls` row and a note in the thread
 *    his turn answers: the command, its exit, the files it touched; a
 *    refusal with why, your Deny as yours.
 *
 * 7. **No questions**: his AskUserQuestion (OpenCode's `question`) is
 *    refused with {@link ASK_BY_CARD}. Every choice that reaches the person
 *    is a decision card on a page (the decision-page skill), his included:
 *    so it is in Decisions, in the record, and something a task can wait on.
 *    The refusal keeps no row: it is no call of his hands.
 *
 * Review independence (tasks.ts `moveTo`) reads the rows back: a task whose
 * only changes are his own edits passes review only once you approved them
 * ({@link reviewProblem}).
 */
import { isAbsolute, posix } from "node:path";
import {
  ASK_USER_QUESTION,
  type Envelope,
  type InstanceRow,
  LEAD_GATED_TOOLS,
  type NeutralMessage,
  type PermissionRequestFrame,
  type PermissionResult,
  POWERSHELL_TOOLS,
  SHELL_TOOLS,
  type ThreadNote,
  turnCall,
} from "@cawco/core";
import { GIT_VALUED_OPTIONS, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
import type { DbShape, LeadCallRow } from "./db";
import type { CawEdits } from "./gate-file";

/** The most shell or edit calls Caw makes in one wake. */
const CALLS_PER_WAKE = 20;
/** The most files his edits touch in one wake. */
const FILES_PER_WAKE = 5;

/**
 * What the gate answers a call: run it now, refuse it with words, or put it
 * on your card, saying which rule sent it there ("Asked because …").
 */
export type GateVerdict =
  | { kind: "allow" }
  | { kind: "deny"; message: string }
  | { kind: "card"; why: string };

/**
 * What {@link createLeadGate}'s `decide` answers: a verdict, or `withdrawn`
 * for an edit whose ask was over before gate.md was read (the harness
 * settled it, or its process ended): nothing is kept of it, and nothing
 * parks it.
 */
export type GateDecision = GateVerdict | { kind: "withdrawn"; why: string };

const GATED: ReadonlySet<string> = new Set([
  ...LEAD_GATED_TOOLS.claude,
  ...LEAD_GATED_TOOLS.opencode,
  ...LEAD_GATED_TOOLS.pi,
]);

/**
 * Shells whose lines {@link readShell} (a POSIX shell's reader) cannot read:
 * every harness's PowerShell (core `POWERSHELL_TOOLS`). A line of one never
 * runs without your card, however it reads: PowerShell runs a command from
 * `( … )` and `{ … }` where a POSIX shell reads words. Its shared-checkout
 * refusals still apply.
 */
const UNREAD_SHELLS = POWERSHELL_TOOLS;

/**
 * What a lead's call is, by its tool: a shell line, a file edit, or any
 * other tool. That last kind is a pi lead's: his host puts to the gate every
 * call of a tool CawCo did not give him, one a person's own pi extension
 * registered (agent pi-runtime.ts `PiGate`).
 */
type CallKind = "shell" | "edit" | "tool";

const kindOf = (tool: string): CallKind => {
  if (SHELL_TOOLS.has(tool)) {
    return "shell";
  }
  return GATED.has(tool) ? "edit" : "tool";
};

/**
 * Whether an ask is one of a lead's calls the gate decides: a shell or edit
 * tool's, or any tool ask a pi lead's host raised (only gated calls are put
 * to the hub from there, {@link CallKind}).
 */
const isGated = (ask: PermissionRequestFrame): boolean =>
  GATED.has(ask.toolName) ||
  (ask.harness === "pi" && (ask.requestKind ?? "tool") === "tool");

/** What his question is refused with: how to ask instead. */
const ASK_BY_CARD =
  "Caw asks the person with a decision page, never AskUserQuestion: write decisions/<name>/page.oui with one card (or a few for one topic), each with its kind from Who decides, publish it with artifact_create (kind page, does: pick, an ask), name the card in your reply by its link, and end your turn.";

/** Whether an ask is a question for the person: AskUserQuestion, as every harness's question reaches the hub. */
const isQuestion = (ask: PermissionRequestFrame): boolean =>
  ask.toolName === ASK_USER_QUESTION || ask.requestKind === "question";

/** The most of a tool call's input its row keeps as its command. */
const TOOL_INPUT_KEPT = 2000;

// --- the shell, read -------------------------------------------------------

/** One shell line, read: its simple commands' words, and what makes it more than reading. */
interface ShellLine {
  /** A `$(…)` or backticks: commands run to make words. */
  readonly nested: string[];
  readonly segments: string[][];
  /**
   * What in it the gate cannot read, in words ("an unclosed quote", "a here
   * document", "a process substitution"); none when it reads whole.
   */
  readonly unread: string | undefined;
  /**
   * What in its own syntax writes or leaves something running, in words: a
   * redirection into a file (`>`, `>>`, `>|`, `&>`, `<>` anywhere but
   * `/dev/null`), or a background `&`. A redirection into `/dev/null`, one
   * file descriptor onto another (`2>&1`) and input from a file
   * (`< notes.txt`) only read.
   */
  readonly writes: string | undefined;
}

/** A redirection's operator, at the `<` or `>` it starts with. */
const REDIRECT_OP = /^(?:<<<|<<-?|<>|<&|>>|>\||>&|<|>)/u;
/** Where one file descriptor goes onto another, or is closed: `&1`'s `1`, `&-`'s `-`. */
const DESCRIPTOR = /^(?:\d+|-)$/u;
/** A redirection's target ends at a blank or at what ends a command. */
const TARGET_END = /[ \t\n|;&()<>]/u;
/** Where output may go and nothing is written. */
const DEV_NULL = "/dev/null";
/** An fd number written right before a redirection, as in `2>`. */
const FD_NUMBER = /^\d+$/u;

const BLANK = /[ \t]/u;

/** The text up to the `)` that closes the one at `from` (just past `(`), and where it ends; `end` is the text's length when none does. */
const closing = (
  text: string,
  from: number
): { inner: string; end: number } => {
  let depth = 1;
  let quote: string | null = null;
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return { inner: text.slice(from, at), end: at };
      }
    }
  }
  return { inner: text.slice(from), end: text.length };
};

/**
 * A shell line as words, split into its simple commands at `;`, `&&`, `||`,
 * `|`, `&`, newlines and parentheses, quotes and escapes taken off; the
 * commands of each substitution kept apart to be read the same way.
 */
/** Where one simple command ends and the next begins, outside quotes. */
const SEPARATORS: ReadonlySet<string> = new Set(["|", ";", "\n", "(", ")"]);

/** One pass over a shell line, character by character ({@link readShell}). */
class ShellReader {
  readonly segments: string[][] = [[]];
  readonly nested: string[] = [];
  /** The first thing the gate cannot read ({@link ShellLine.unread}). */
  unread: string | undefined;
  /** The first thing that writes ({@link ShellLine.writes}). */
  writes: string | undefined;
  /** The word being read; undefined between words (`''` is a word). */
  #word: string | undefined;
  #quote: "'" | '"' | null = null;
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  read(): ShellLine {
    let at = 0;
    while (at < this.#text.length) {
      // Each step answers the last character it took.
      at = this.#step(at) + 1;
    }
    this.#endWord();
    if (this.#quote) {
      this.unread ??= "an unclosed quote";
    }
    return {
      segments: this.segments.filter((words) => words.length > 0),
      nested: this.nested,
      unread: this.unread,
      writes: this.writes,
    };
  }

  #add(text: string): void {
    this.#word = (this.#word ?? "") + text;
  }

  #endWord(): void {
    if (this.#word !== undefined) {
      this.segments.at(-1)?.push(this.#word);
    }
    this.#word = undefined;
  }

  #nextCommand(): void {
    this.#endWord();
    if ((this.segments.at(-1)?.length ?? 0) > 0) {
      this.segments.push([]);
    }
  }

  /** Reads what starts at `at`; answers the index of the last character it took. */
  #step(at: number): number {
    const char = this.#text[at] as string;
    const after = this.#text[at + 1];
    if (this.#quote === "'") {
      return this.#quoted(char, at);
    }
    if (char === "\\") {
      this.#add(after ?? "");
      return at + 1;
    }
    if ((char === "$" && after === "(") || char === "`") {
      return this.#substitution(char, at);
    }
    if (this.#quote === '"') {
      return this.#quoted(char, at);
    }
    return this.#bare(char, after, at);
  }

  #quoted(char: string, at: number): number {
    if (char === this.#quote) {
      this.#quote = null;
    } else {
      this.#add(char);
    }
    return at;
  }

  #substitution(char: string, at: number): number {
    if (char === "`") {
      const end = this.#text.indexOf("`", at + 1);
      if (end < 0) {
        this.unread ??= "an unclosed backtick";
      }
      this.nested.push(this.#text.slice(at + 1, end < 0 ? undefined : end));
      this.#add("`…`");
      return end < 0 ? this.#text.length : end;
    }
    const { inner, end } = closing(this.#text, at + 2);
    if (end >= this.#text.length) {
      this.unread ??= "an unclosed `$(`";
    }
    this.nested.push(inner);
    this.#add("$(…)");
    return end;
  }

  #bare(char: string, after: string | undefined, at: number): number {
    if (char === "'" || char === '"') {
      this.#quote = char;
      this.#add("");
      return at;
    }
    if (char === "<" || char === ">") {
      return this.#redirect(at);
    }
    if (BLANK.test(char)) {
      this.#endWord();
      return at;
    }
    if (char === "&" && after === ">") {
      // `&>` and `&>>`: both streams, read as `>` is.
      this.#endWord();
      return this.#redirect(at + 1);
    }
    if (char === "&") {
      if (after !== "&") {
        // A background `&`: the command is left running past the call.
        this.writes ??= "it leaves a command running in the background";
      }
      this.#nextCommand();
      return after === "&" ? at + 1 : at;
    }
    if (SEPARATORS.has(char)) {
      this.#nextCommand();
      return char === "|" && after === "|" ? at + 1 : at;
    }
    this.#add(char);
    return at;
  }

  /**
   * A redirection at `at`: its operator and its target taken off the
   * command's words, and whether it writes noted. An fd number written right
   * before it (`2>`) is its own, not a word of the command.
   */
  #redirect(at: number): number {
    if (this.#text[at + 1] === "(") {
      // A process substitution: what it runs beside the line is not read.
      this.unread ??= "a process substitution";
      return closing(this.#text, at + 2).end;
    }
    if (this.#word !== undefined && FD_NUMBER.test(this.#word)) {
      this.#word = undefined;
    } else {
      this.#endWord();
    }
    const op = REDIRECT_OP.exec(this.#text.slice(at))?.[0] ?? ">";
    let from = at + op.length;
    while (from < this.#text.length && BLANK.test(this.#text[from] as string)) {
      from += 1;
    }
    let end = from;
    while (
      end < this.#text.length &&
      !TARGET_END.test(this.#text[end] as string)
    ) {
      end += 1;
    }
    const target = this.#text.slice(from, end);
    const heard = HERE.get(op);
    if (heard) {
      this.unread ??= heard;
    } else if (!redirectReads(op, target)) {
      this.writes ??= `it writes to a file: \`${op} ${target}\``;
    }
    return end - 1;
  }
}

/** The redirections whose text is the shell's input, which the gate does not read, by what they are. */
const HERE: ReadonlyMap<string, string> = new Map([
  ["<<", "a here document"],
  ["<<-", "a here document"],
  ["<<<", "a here string"],
]);

/**
 * Whether a redirection only reads: one descriptor onto another or closed
 * (`2>&1`, `>&2`, `<&-`), output into `/dev/null`, or input from a file.
 * `<>` opens its file for writing.
 */
const redirectReads = (op: string, target: string): boolean => {
  if (op === ">&" || op === "<&") {
    return DESCRIPTOR.test(target) || target === DEV_NULL;
  }
  if (op === ">" || op === ">>" || op === ">|") {
    return target === DEV_NULL;
  }
  return op === "<" && target !== "";
};

const readShell = (command: string): ShellLine =>
  new ShellReader(command).read();

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
/** Shell words that open or join commands, never one themselves. */
const KEYWORDS: ReadonlySet<string> = new Set([
  "!",
  "{",
  "}",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
  "for",
  "case",
  "esac",
  "in",
  "time",
]);
/** Words that run the command after them, each with its options that take a value. */
const WRAPPERS: Readonly<Record<string, ReadonlySet<string>>> = {
  sudo: new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"]),
  doas: new Set(["-u", "-C"]),
  env: new Set(["-u", "-C", "-S", "--unset", "--chdir"]),
  command: new Set(),
  builtin: new Set(),
  exec: new Set(["-a"]),
  nice: new Set(["-n", "--adjustment"]),
  nohup: new Set(),
  stdbuf: new Set(["-i", "-o", "-e"]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  xargs: new Set([
    "-I",
    "-n",
    "-P",
    "-d",
    "-L",
    "-s",
    "-E",
    "-a",
    "--max-args",
    "--max-procs",
    "--delimiter",
    "--arg-file",
  ]),
  watch: new Set(["-n", "--interval"]),
  setsid: new Set(),
  unbuffer: new Set(),
};
const SHELLS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
]);
const SHELL_COMMAND_FLAG = /^-[a-zA-Z]*c[a-zA-Z]*$/u;
const DURATION = /^\d/u;

const baseName = (word: string): string => posix.basename(word);

/**
 * Every command a shell line runs, as its words from the program on: each
 * simple command past its assignments, keywords and wrappers (`sudo`, `env`,
 * `xargs`, `timeout` …), and, read again, what runs under `sh -c`, `eval`
 * and each substitution. `opaque` when a word that names a command could not
 * be read (a variable, a substitution), or the line nests too deep.
 */
/** How many words a wrapper's options take before the command it runs. */
const wrapperWords = (name: string, words: string[]): number => {
  const valued = WRAPPERS[name] ?? new Set<string>();
  let at = 1;
  while (at < words.length) {
    const word = words[at] as string;
    if (word === "--") {
      return at + 1;
    }
    if (name === "timeout" && DURATION.test(word)) {
      return at + 1;
    }
    if (valued.has(word)) {
      at += 2;
    } else if (
      word.startsWith("-") ||
      (name === "env" && ASSIGNMENT.test(word))
    ) {
      at += 1;
    } else {
      return at;
    }
  }
  return at;
};

/** `command`'s options that look a word up instead of running it. */
const COMMAND_LOOKUP = /^-[vV]$/u;

/** A simple command's words from the program it runs: past its assignments, keywords and wrappers. */
const programWords = (segment: string[]): string[] => {
  let words = segment;
  for (;;) {
    const lead = words.findIndex(
      (word) => !(ASSIGNMENT.test(word) || KEYWORDS.has(word))
    );
    words = lead < 0 ? [] : words.slice(lead);
    const [program, option] = words;
    if (
      program === undefined ||
      !WRAPPERS[baseName(program)] ||
      // `command -v` and `-V` name what a word runs, and run nothing.
      (baseName(program) === "command" && COMMAND_LOOKUP.test(option ?? ""))
    ) {
      return words;
    }
    words = words.slice(wrapperWords(baseName(program), words));
  }
};

/** A name a `for` or `select` loop binds. */
const LOOP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * Whether a simple command is a `for NAME in WORDS` or `select NAME in
 * WORDS` header: it runs no program, it only names the words its body runs
 * over (any substitution among them is read as a nested line).
 */
const loopHeader = (segment: string[]): boolean => {
  const [keyword, name, word] = segment;
  return (
    (keyword === "for" || keyword === "select") &&
    name !== undefined &&
    LOOP_NAME.test(name) &&
    (word === undefined || word === "in")
  );
};

/** A command line, read: every command it runs, and what makes it more than that. */
interface Commands {
  argvs: string[][];
  /** {@link ShellLine.unread}, of the line or any line nested in it, or a command the gate cannot see. */
  unread: string | undefined;
  /** {@link ShellLine.writes}, of the line or any line nested in it, or a variable set that can change what a command runs. */
  writes: string | undefined;
}

/** What a simple command runs besides itself: a shell's `-c` script, `eval`'s words; `unread` when that cannot be read. */
const innerScript = (
  name: string,
  words: string[]
): { script?: string; unread?: string } => {
  if (SHELLS.has(name)) {
    const flag = words.findIndex((word) => SHELL_COMMAND_FLAG.test(word));
    const script = flag >= 0 ? words[flag + 1] : undefined;
    // A shell reading a script file or its input: what it runs is unseen.
    return script === undefined
      ? { unread: `\`${name}\` runs a script the gate can't see` }
      : { script };
  }
  if (name === "eval") {
    return { script: words.slice(1).join(" ") };
  }
  return name === "source" || name === "."
    ? { unread: `\`${name}\` runs a file the gate can't see` }
    : {};
};

/**
 * Variables a command may be given that change only how it prints: the
 * locale, the time zone, the terminal's size, color off, and a pager that is
 * `cat`. Any other (`LD_PRELOAD`, `BASH_ENV`, `GIT_DIR`, `GIT_SSH_COMMAND`,
 * `PAGER=less`) can change what runs.
 */
const PRINT_ENV =
  /^(?:(?:LC_[A-Z]+|LANG|LANGUAGE|TZ|NO_COLOR|TERM|COLUMNS|LINES)=.*|(?:GIT_PAGER|PAGER)=(?:cat)?)$/su;

/** A variable a simple command sets for its program that can change what runs, in words; none when it sets none. */
const setsEnvironment = (
  segment: string[],
  words: string[]
): string | undefined => {
  const set = segment
    .slice(0, segment.length - words.length)
    .find((word) => ASSIGNMENT.test(word) && !PRINT_ENV.test(word));
  return set === undefined
    ? undefined
    : `it sets \`${set.slice(0, set.indexOf("="))}\` for a command, which can change what it runs`;
};

/** Whether a program's own word could not be read: a variable or a substitution names it. */
const unreadable = (program: string): boolean =>
  program.includes("$(…)") ||
  program.includes("`…`") ||
  program.startsWith("$");

const commandsOf = (command: string, depth = 0): Commands => {
  if (depth > 4) {
    return { argvs: [], unread: "it nests too deep", writes: undefined };
  }
  const line = readShell(command);
  const read: Commands = {
    argvs: [],
    unread: line.unread,
    writes: line.writes,
  };
  const take = (inner: string) => {
    const more = commandsOf(inner, depth + 1);
    read.argvs.push(...more.argvs);
    read.unread ??= more.unread;
    read.writes ??= more.writes;
  };
  for (const inner of line.nested) {
    take(inner);
  }
  for (const segment of line.segments) {
    if (loopHeader(segment)) {
      continue;
    }
    const words = programWords(segment);
    const [program] = words;
    if (program === undefined) {
      continue;
    }
    const inner = innerScript(baseName(program), words);
    read.writes ??= setsEnvironment(segment, words);
    read.unread ??=
      inner.unread ??
      (unreadable(program)
        ? `a variable or substitution names a command: \`${program}\``
        : undefined);
    if (inner.script === undefined) {
      read.argvs.push(words);
    } else {
      // `sh -c` and `eval` run their script: its commands are what is judged.
      take(inner.script);
    }
  }
  return read;
};

// --- git -------------------------------------------------------------------

/** git's global options that take the next word as their value. */
const GIT_VALUED: ReadonlySet<string> = new Set(GIT_VALUED_OPTIONS);
/**
 * git's global options that can make it run a program a config or another
 * place names, or read refs under another name: never part of a read. The
 * list is Codex's (`git_global_option_requires_prompt`, openai/codex
 * rust-v0.120.0 shell-command/src/command_safety/is_dangerous_command.rs),
 * with `-c` judged by its key ({@link gitConfigReads}). `-C <path>` is not
 * among them: Codex reads `git -C . branch --show-current` as safe, and it
 * only moves where git reads. What git there could run is what that
 * repository's own config and hooks name, and no session writes those: a
 * workspace's policy denies writing its clone's `.git/config`, `.git/hooks`
 * and `.git/modules` (core clone-denies.ts `GIT_EMPTY`), and a place's guard
 * moves aside any a command made (agent boundary.ts `placeGuard`).
 */
const GIT_RUNS_GLOBAL =
  /^(?:--config-env|--exec-path|--git-dir|--work-tree|--namespace|--super-prefix)(?:=|$)/u;

/**
 * The `-c` settings a read may carry: CawCo's own git's
 * ({@link SAFE_GIT_FLAGS}, each turning a program off), exactly; and keys
 * that only shape what git prints, any value. Any other key may name a
 * program (`core.pager`, `core.fsmonitor`, `diff.external`, `alias.*`).
 */
const SAFE_CONFIG_PAIRS: ReadonlySet<string> = new Set(
  SAFE_GIT_FLAGS.filter((_, at) => SAFE_GIT_FLAGS[at - 1] === "-c").map(
    (pair) => pair.toLowerCase()
  )
);
const PRINT_CONFIG =
  /^(?:color\.[\w.-]+|advice\.[\w.-]+|core\.quotepath|core\.abbrev|column\.ui|log\.(?:decorate|date|abbrevcommit|showroot|follow)|diff\.(?:renames|noprefix|mnemonicprefix|relative|context|interhunkcontext|statgraphwidth)|status\.(?:short|branch|relativepaths|showuntrackedfiles))=/iu;

/** Whether a `-c` setting is one a read may carry ({@link SAFE_CONFIG_PAIRS}, {@link PRINT_CONFIG}). */
const gitConfigReads = (setting: string): boolean =>
  SAFE_CONFIG_PAIRS.has(setting.toLowerCase()) ||
  PRINT_CONFIG.test(setting.includes("=") ? setting : `${setting}=`);

/** A git command line read: its global options as written (a valued one with its value), its subcommand and its arguments. */
interface GitLine {
  args: string[];
  globals: string[][];
  sub: string;
}

const gitOf = (argv: string[]): GitLine | undefined => {
  if (baseName(argv[0] ?? "") !== "git") {
    return;
  }
  const globals: string[][] = [];
  for (let at = 1; at < argv.length; at += 1) {
    const word = argv[at] as string;
    if (GIT_VALUED.has(word)) {
      globals.push(argv.slice(at, at + 2));
      at += 1;
      continue;
    }
    if (word.startsWith("-")) {
      globals.push([word]);
      continue;
    }
    return { sub: word, args: argv.slice(at + 1), globals };
  }
};

/** The first global option of a git line that a read may not carry, as written; none when every one may. */
const gitReadRisk = (git: GitLine): string | undefined =>
  git.globals
    .find(([option = "", value = ""]) =>
      option === "-c"
        ? !gitConfigReads(value)
        : GIT_RUNS_GLOBAL.test(option) || option.startsWith("-c")
    )
    ?.join(" ");

/**
 * Whether a git line's global options keep a write where the gate judged it:
 * none that reads ({@link gitReadRisk}), no `-C` into another repository,
 * and no setting at all.
 */
const gitWritesHere = (git: GitLine): boolean =>
  gitReadRisk(git) === undefined &&
  !git.globals.some(([option]) => option === "-C" || option === "-c");

/**
 * The git subcommands never run in a shared checkout: they move, drop or
 * publish what others there rely on. `switch` and `restore` are the two
 * halves `checkout` was split into (git 2.23), so they go with it.
 */
const SHARED_DENIED: ReadonlySet<string> = new Set([
  "checkout",
  "switch",
  "restore",
  "reset",
  "stash",
  "clean",
  "rebase",
  "push",
]);

/**
 * git's own commands, and git-lfs's. Any other word where a subcommand goes
 * is an alias (`git co`, `git -c alias.x=checkout x`) or another program on
 * PATH, which the hub cannot read: refused in a shared checkout, since it
 * may be one of {@link SHARED_DENIED}.
 */
const GIT_COMMANDS: ReadonlySet<string> = new Set(
  "add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config count-objects credential describe diagnose diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help index-pack init instaweb interpret-trailers lfs log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase reflog remote repack replace request-pull rerere reset restore rev-list rev-parse revert rm send-email shortlog show show-branch show-ref sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info var verify-commit verify-pack verify-tag version whatchanged worktree write-tree".split(
    " "
  )
);
/** `git add`'s arguments that stage the whole tree. */
const ADD_ALL =
  /^(?:-[a-zA-Z]*A[a-zA-Z]*|--all|--no-ignore-removal|\.|\.\/|:\/|:|\*)$/u;

const addsAll = (args: string[]): boolean =>
  args.some((arg) => ADD_ALL.test(arg));

/** The first command of a shell line refused in a shared checkout, in words; none when there is none. */
const sharedDenial = (argvs: string[][]): string | undefined => {
  for (const argv of argvs) {
    const git = gitOf(argv);
    if (!git) {
      continue;
    }
    if (SHARED_DENIED.has(git.sub) || !GIT_COMMANDS.has(git.sub)) {
      return `git ${git.sub}`;
    }
    if (git.sub === "add" && addsAll(git.args)) {
      return `git add ${git.args.find((arg) => ADD_ALL.test(arg)) ?? "-A"}`;
    }
  }
};

/** git subcommands that only read. */
const GIT_READS: ReadonlySet<string> = new Set([
  "status",
  "log",
  "diff",
  "diff-files",
  "diff-index",
  "diff-tree",
  "range-diff",
  "show",
  "show-branch",
  "blame",
  "ls-files",
  "ls-tree",
  "rev-parse",
  "describe",
  "name-rev",
  "merge-base",
  "for-each-ref",
  "shortlog",
  "grep",
  "cat-file",
  "rev-list",
  "show-ref",
  "cherry",
  "check-ignore",
  "check-attr",
  "count-objects",
  "whatchanged",
  "reflog",
  "version",
]);
/** `git branch` and `git tag` options that only list. */
const LISTS =
  /^(?:-a|--all|-r|--remotes|-v|-vv|--verbose|-l|--list|--show-current|-i|--ignore-case|--column|--no-column|--contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format|(?:--contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format)=.*|-n\d*)$/u;
/** `git branch` and `git tag` listing options whose value may be the next word: a commit, a key, a format. */
const LIST_VALUED: ReadonlySet<string> = new Set([
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
  "--sort",
  "--format",
]);
/** The listing options under which the words after are patterns to list by, never a name to make. */
const LIST_MODE: ReadonlySet<string> = new Set(["-l", "--list"]);
/** Arguments that make a reading git command write a file, or run a program on what it found (`git grep -O`). */
const WRITES_OUTPUT =
  /^--output(?:=|$)|^-o$|^--open-files-in-pager(?:=|$)|^-O/u;
/** `git config`'s options that only read. */
const CONFIG_READS = /^(?:--get|--get-all|--get-regexp|--list|-l)$/u;
/**
 * `git fetch`'s options that change nothing but its remote-tracking refs:
 * none runs a program (`--upload-pack`), recurses into submodules or writes
 * a local branch.
 */
const FETCH_FLAGS =
  /^(?:-q|--quiet|-v|--verbose|-p|--prune|-P|--prune-tags|-t|--tags|-n|--no-tags|--all|--multiple|--dry-run|--progress|--no-progress|--no-recurse-submodules|--no-write-fetch-head|--depth=\d+|--deepen=\d+|--shallow-since=\S+|--shallow-exclude=\S+|--unshallow)$/u;
/** A configured remote's name: never a URL or a path, which would reach a host the project does not name. */
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
/** A ref to fetch, into FETCH_HEAD and the remote-tracking refs only: no `:<dst>` naming a local branch to write. */
const FETCH_REF = /^\+?[A-Za-z0-9][A-Za-z0-9._/-]*$/u;

/**
 * Whether a `git branch` or `git tag` line only lists: every option one
 * that lists, a word after one only as its value, and other words only as
 * patterns under `--list` (`git branch -r --contains 8c2f706b9`).
 */
const listsOnly = (args: string[]): boolean => {
  const listing = args.some((arg) => LIST_MODE.has(arg));
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] as string;
    if (LISTS.test(arg)) {
      const next = args[at + 1];
      if (LIST_VALUED.has(arg) && next !== undefined && !next.startsWith("-")) {
        at += 1;
      }
    } else if (arg.startsWith("-") || !listing) {
      return false;
    }
  }
  return true;
};

/**
 * Whether a `git fetch` line only brings the remote's refs in: options from
 * {@link FETCH_FLAGS}, a configured remote by name, and refs without a local
 * destination.
 */
const fetchesOnly = (args: string[]): boolean => {
  const words = args.filter((arg) => !FETCH_FLAGS.test(arg));
  const [remote, ...refs] = words;
  return (
    words.every((word) => !word.startsWith("-")) &&
    (remote === undefined || REMOTE_NAME.test(remote)) &&
    refs.every((ref) => FETCH_REF.test(ref))
  );
};

/**
 * Why a git command line is not a read, in words; none when it only reads
 * (`git fetch` of a named remote among them).
 */
const gitReadBlocker = (argv: string[]): string | undefined => {
  const git = gitOf(argv);
  if (!git) {
    return "`git` names no subcommand";
  }
  const risk = gitReadRisk(git);
  if (risk) {
    return `\`git ${risk}\` can make git run another program`;
  }
  const output = git.args.find((arg) => WRITES_OUTPUT.test(arg));
  if (output) {
    return `this command writes a file or runs a program: \`git ${git.sub} ${output}\``;
  }
  if (git.sub === "fetch" && git.globals.some(([option]) => option === "-C")) {
    return "this `git -C … fetch` writes another repository's refs";
  }
  if (gitReads(git)) {
    return;
  }
  return git.sub === "fetch"
    ? "this `git fetch` names an address, or a branch of yours to write"
    : `this command writes: \`git ${git.sub}\``;
};

/** Whether a git command line is `git init`, `git add <paths>` or `git commit`, in a place no one else uses. */
const gitTidy = (argv: string[], shared: boolean): boolean => {
  const git = gitOf(argv);
  return !shared && !!git && gitWritesHere(git) && gitTidies(git);
};

/** `git remote`'s arguments that only list or name: `-v`, and `get-url <name>`. */
const remoteReads = (args: string[]): boolean =>
  args[0] === "get-url"
    ? args.slice(1).every((arg) => arg === "--all" || !arg.startsWith("-"))
    : args.every((arg) => arg === "-v" || arg === "--verbose");

/** Whether a git command only reads. */
const gitReads = (git: { args: string[]; sub: string }): boolean => {
  const [first] = git.args;
  if (GIT_READS.has(git.sub)) {
    return git.sub !== "reflog" || first === undefined || first === "show";
  }
  switch (git.sub) {
    case "branch":
    case "tag":
      return listsOnly(git.args);
    case "remote":
      return remoteReads(git.args);
    case "worktree":
      return first === "list";
    case "config":
      return git.args.some((arg) => CONFIG_READS.test(arg));
    case "fetch":
      return fetchesOnly(git.args);
    default:
      return false;
  }
};

/** Whether a git command is `git init`, `git add <paths>` or `git commit` as the allowlist takes them. */
const gitTidies = (git: { args: string[]; sub: string }): boolean => {
  if (git.sub === "init") {
    return git.args.every(
      (arg) =>
        arg === "-q" ||
        arg === "--quiet" ||
        arg.startsWith("--initial-branch=") ||
        arg === "-b" ||
        !arg.startsWith("-")
    );
  }
  if (git.sub === "add") {
    return (
      git.args.length > 0 &&
      !addsAll(git.args) &&
      !git.args.some(
        (arg) =>
          arg === "-u" ||
          arg === "--update" ||
          arg === "-f" ||
          arg === "--force"
      )
    );
  }
  if (git.sub === "commit") {
    return !git.args.some(
      (arg) =>
        arg === "--amend" ||
        arg.startsWith("--fixup") ||
        arg.startsWith("--squash")
    );
  }
  return false;
};

/** `find`'s actions that run a command or write a file. */
const FIND_ACTS =
  /^-(?:exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/u;

/** `tail`'s options that keep it running after the file's end. */
const FOLLOWS = /^(?:-f|-F|--follow(?:=.*)?|--retry)$/u;
/** `sort`'s options that write a file or run a program. */
const SORT_ACTS = /^(?:-o|--output(?:=.*)?|--compress-program(?:=.*)?)$/u;
/** `file`'s options that write a compiled magic file. */
const FILE_ACTS = /^(?:-C|--compile)$/u;
/** `tree`'s options that write its listing into a file. */
const TREE_ACTS = /^(?:-o|--output(?:=.*)?)$/u;
/** `date`'s options that set the clock. */
const DATE_ACTS = /^(?:-s|--set(?:=.*)?)$/u;
/** ripgrep's options that run a program on each file (Codex's `UNSAFE_RIPGREP_OPTIONS`). */
const RG_ACTS =
  /^(?:--pre(?:=.*)?|--hostname-bin(?:=.*)?|--search-zip|-[a-zA-Z]*z[a-zA-Z]*)$/u;
/** journalctl's options that change the journal, write a file or keep it running. */
const JOURNAL_ACTS =
  /^(?:-f|--follow|--vacuum-\w+(?:=.*)?|--rotate|--flush|--sync|--relinquish-var|--smart-relinquish-var|--setup-keys|--update-catalog|--cursor-file(?:=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/u;

/**
 * gh's commands that only read GitHub, by `<group> <verb>`: what a person
 * would read on the site. None changes an issue, a pull request, a run or a
 * repository; `gh api`, which can, is not among them.
 */
const GH_READS: ReadonlySet<string> = new Set([
  "auth status",
  "issue view",
  "issue list",
  "issue status",
  "pr view",
  "pr list",
  "pr status",
  "pr diff",
  "pr checks",
  "run view",
  "run list",
  "workflow view",
  "workflow list",
  "repo view",
  "release view",
  "release list",
  "label list",
  "search issues",
  "search prs",
  "search repos",
  "search code",
  "search commits",
]);
/** gh's options that open a browser or keep it running. */
const GH_ACTS = /^(?:-w|--web|--watch|-i|--interactive)$/u;

/** gh's words that make it act: a command not in {@link GH_READS}, or an option that opens a browser or keeps it running; none when it only reads. */
function ghReads(args: string[]): string | undefined {
  const [group = "", verb = ""] = args;
  if (!GH_READS.has(`${group} ${verb}`)) {
    return `${group} ${verb}`.trim();
  }
  return args.find((arg) => GH_ACTS.test(arg));
}

/** systemctl's verbs that only read a unit or the manager. */
const SYSTEMCTL_READS: ReadonlySet<string> = new Set([
  "status",
  "show",
  "cat",
  "help",
  "list-units",
  "list-unit-files",
  "list-timers",
  "list-sockets",
  "list-paths",
  "list-jobs",
  "list-dependencies",
  "is-active",
  "is-enabled",
  "is-failed",
  "is-system-running",
  "get-default",
]);
/** systemctl's options that take the next word as their value. */
const SYSTEMCTL_VALUED: ReadonlySet<string> = new Set([
  "-t",
  "--type",
  "-p",
  "--property",
  "-P",
  "-n",
  "--lines",
  "-o",
  "--output",
  "--state",
]);
/** systemd-analyze's verbs that only read the boot, the units or their settings. */
const ANALYZE_READS: ReadonlySet<string> = new Set([
  "time",
  "blame",
  "critical-chain",
  "plot",
  "dot",
  "dump",
  "cat-config",
  "unit-files",
  "unit-paths",
  "exit-status",
  "capability",
  "condition",
  "syscall-filter",
  "filesystems",
  "calendar",
  "timestamp",
  "timespan",
  "security",
  "architectures",
]);
/** systemd-analyze's options that take the next word as their value. */
const ANALYZE_VALUED: ReadonlySet<string> = new Set([
  "--root",
  "--image",
  "--fuzz",
  "--from-pattern",
  "--to-pattern",
  "--iterations",
  "--base-time",
  "--unit",
  "--threshold",
  "--security-policy",
  "--profile",
]);
/** A systemd tool's options that reach another host or machine. */
const SYSTEMD_REMOTE = /^(?:-H|--host|-M|--machine)(?:=|$)/u;

/**
 * A systemd tool's reader: its word that makes it act is a verb not in
 * `reads`, or a remote host; none when it only reads (no verb is its
 * listing). An option in `valued` takes the next word.
 */
const systemdReads =
  (reads: ReadonlySet<string>, valued: ReadonlySet<string>): Reader =>
  (args) => {
    for (let at = 0; at < args.length; at += 1) {
      const arg = args[at] as string;
      if (SYSTEMD_REMOTE.test(arg)) {
        return arg;
      }
      if (valued.has(arg)) {
        at += 1;
      } else if (!arg.startsWith("-")) {
        return reads.has(arg) ? undefined : arg;
      }
    }
  };

/** `ss`'s options that kill sockets (`-K`), dump raw data into a file (`-D`) or keep it running (`-E`). */
const SS_ACTS =
  /^(?:--kill|--events|--diag(?:=.*)?|-[a-zA-Z]*[KDE][a-zA-Z]*)$/u;
/** `netstat`'s options that keep it running. */
const NETSTAT_ACTS = /^(?:--continuous|-[a-zA-Z]*c[a-zA-Z]*)$/u;
/** `lsof`'s repeat mode, which keeps it running. */
const LSOF_ACTS = /^[-+]r/u;
/** `free`'s options that repeat it every few seconds. */
const FREE_ACTS = /^(?:--seconds(?:=.*)?|-[a-zA-Z]*s[a-zA-Z]*\d*)$/u;
/** `hostname`'s options that set the name from a file or at boot. */
const HOSTNAME_ACTS = /^(?:-F|--file|-b|--boot)$/u;

/** `hostname`'s word that sets the name: a name given, or a file to set it from; none when it only prints. */
const hostnameReads: Reader = (args) =>
  args.find((arg) => HOSTNAME_ACTS.test(arg) || !arg.startsWith("-"));

/**
 * The `ip` objects whose listing only reads, each as iproute2 takes it
 * written out or cut short (`ip a`, `ip r`).
 */
const IP_OBJECTS: ReadonlySet<string> = new Set([
  "address",
  "addr",
  "a",
  "route",
  "r",
  "link",
  "l",
  "neighbour",
  "neighbor",
  "neigh",
  "n",
  "rule",
]);
/**
 * The `ip` verbs that list, written out: iproute2 takes any prefix of a verb
 * (`ip addr a` is `add`), so a cut verb is not read. `get` asks the kernel
 * which route it would take.
 */
const IP_LISTS: ReadonlySet<string> = new Set(["show", "list", "lst", "get"]);
/** `ip`'s global options that only shape what it prints; `-batch` (commands from a file) and `-netns` are not among them. */
const IP_FLAGS =
  /^--?(?:4|6|0|br(?:ief)?|c(?:olor)?(?:=\w+)?|j(?:son)?|p(?:retty)?|s(?:tats?|tatistics)?|d(?:etails)?|o(?:neline)?|h(?:uman(?:-readable)?)?|r(?:esolve)?)$/u;

/** `ip`'s word that makes it act: an option or object the gate does not know, or a verb that is not a listing; none when it lists addresses, routes, links, neighbours or rules. */
function ipReads(args: string[]): string | undefined {
  const at = args.findIndex((arg) => !IP_FLAGS.test(arg));
  const object = args[at];
  if (object === undefined) {
    // `ip` with no object prints its usage.
    return;
  }
  if (!IP_OBJECTS.has(object)) {
    return object;
  }
  const verb = args[at + 1];
  return verb === undefined || IP_LISTS.has(verb) ? undefined : verb;
}

/**
 * curl's short options, by the long name the rules below judge them by. A
 * letter not here (`-d`, `-F`, `-T`, `-O`, `-c`, `-K`, `-J`, `-Q` …) is one
 * the gate does not know only reads.
 */
const CURL_SHORT: Readonly<Record<string, string>> = {
  s: "--silent",
  S: "--show-error",
  f: "--fail",
  L: "--location",
  I: "--head",
  i: "--include",
  v: "--verbose",
  k: "--insecure",
  N: "--no-buffer",
  g: "--globoff",
  "4": "--ipv4",
  "6": "--ipv6",
  "0": "--http1.0",
  "#": "--progress-bar",
  q: "--disable",
  Z: "--parallel",
  j: "--junk-session-cookies",
  n: "--netrc",
  ":": "--next",
  H: "--header",
  A: "--user-agent",
  e: "--referer",
  b: "--cookie",
  u: "--user",
  U: "--proxy-user",
  x: "--proxy",
  m: "--max-time",
  w: "--write-out",
  Y: "--speed-limit",
  y: "--speed-time",
  r: "--range",
  z: "--time-cond",
  E: "--cert",
  X: "--request",
  o: "--output",
  D: "--dump-header",
};
/** curl's switches that only shape a GET: how it fails, retries, follows, prints and speaks. */
const CURL_FLAGS: ReadonlySet<string> = new Set([
  "--silent",
  "--show-error",
  "--fail",
  "--fail-with-body",
  "--fail-early",
  "--location",
  "--head",
  "--include",
  "--show-headers",
  "--verbose",
  "--insecure",
  "--proxy-insecure",
  "--no-buffer",
  "--globoff",
  "--compressed",
  "--ipv4",
  "--ipv6",
  "--http1.0",
  "--http1.1",
  "--http2",
  "--http2-prior-knowledge",
  "--http3",
  "--http3-only",
  "--progress-bar",
  "--no-progress-meter",
  "--disable",
  "--parallel",
  "--parallel-immediate",
  "--junk-session-cookies",
  "--netrc",
  "--netrc-optional",
  "--next",
  "--retry-all-errors",
  "--retry-connrefused",
  "--no-keepalive",
  "--tcp-nodelay",
  "--path-as-is",
  "--raw",
  "--ssl-reqd",
  "--tlsv1.2",
  "--tlsv1.3",
  "--ca-native",
  "--anyauth",
  "--basic",
  "--digest",
  "--negotiate",
  "--suppress-connect-headers",
]);
/** curl's options whose value only shapes the request or what it prints: a header, a timeout, a retry, a proxy, a certificate, a file it reads. */
const CURL_VALUED: ReadonlySet<string> = new Set([
  "--header",
  "--proxy-header",
  "--user-agent",
  "--referer",
  "--cookie",
  "--user",
  "--proxy-user",
  "--oauth2-bearer",
  "--proxy",
  "--noproxy",
  "--max-time",
  "--connect-timeout",
  "--expect100-timeout",
  "--keepalive-time",
  "--retry",
  "--retry-delay",
  "--retry-max-time",
  "--max-redirs",
  "--max-filesize",
  "--limit-rate",
  "--speed-limit",
  "--speed-time",
  "--resolve",
  "--connect-to",
  "--cacert",
  "--capath",
  "--cert",
  "--cert-type",
  "--key",
  "--key-type",
  "--pass",
  "--pinnedpubkey",
  "--time-cond",
  "--range",
  "--url-query",
  "--netrc-file",
]);
/** curl's request methods that read. */
const CURL_METHOD = /^(?:GET|HEAD)$/u;
const HTTP_URL = /^https?:\/\//iu;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** Hosts curl reads, with no scheme written, as another protocol's ("If the outermost subdomain name matches DICT, FTP, IMAP, LDAP, POP3 or SMTP … that protocol is used"). */
const CURL_GUESSED = /^(?:[^/@]*@)?(?:dict|ftp|imap|ldap|pop3|smtp)\./iu;

/** A variable or a substitution in an address (`$HOST`, `$(…)`, `` `…` ``). */
const UNREAD_URL = /\$|`…`/u;

/**
 * Whether curl speaks HTTP to an address: an `http(s)://` URL, or one with
 * no scheme whose host curl does not take for another protocol's (`gopher`,
 * `dict`, `telnet` and `smtp` send what they are given). A variable or a
 * substitution in it is an address the gate cannot read.
 */
const curlSpeaksHttp = (url: string): boolean =>
  !UNREAD_URL.test(url) &&
  (HTTP_URL.test(url) || !(ANY_SCHEME.test(url) || CURL_GUESSED.test(url)));

/** Where curl's output may go and nothing is written: stdout (`-`), or `/dev/null`. */
const toStdout = (value: string): boolean =>
  value === "-" || value === DEV_NULL;

/** curl's options whose value decides whether it only reads, each with the values that do. */
const CURL_JUDGED: Readonly<Record<string, (value: string) => boolean>> = {
  "--request": (value) => CURL_METHOD.test(value),
  "--url": curlSpeaksHttp,
  // `%output{file}` (curl 8.3) writes what follows into a file; `@file` reads a format the gate can't see.
  "--write-out": (value) =>
    !(value.startsWith("@") || value.includes("%output{")),
  "--output": toStdout,
  "--dump-header": toStdout,
  "--trace": toStdout,
  "--trace-ascii": toStdout,
  "--stderr": toStdout,
};

const curlTakesValue = (name: string): boolean =>
  CURL_VALUED.has(name) || Object.hasOwn(CURL_JUDGED, name);

/**
 * A curl word's options by long name, each with a value written into the
 * word (`-XGET`'s `GET`; a long option takes its value as the next word
 * only); none when the word is an address. Short letters run together
 * (`-fsSL`) until one that takes a value.
 */
const curlOptions = (
  word: string
): { name: string; value?: string }[] | undefined => {
  if (word.startsWith("--")) {
    return [{ name: word }];
  }
  if (!word.startsWith("-") || word === "-") {
    return;
  }
  const options: { name: string; value?: string }[] = [];
  for (let at = 1; at < word.length; at += 1) {
    const letter = word[at] as string;
    const name = CURL_SHORT[letter] ?? `-${letter}`;
    const rest = word.slice(at + 1);
    if (curlTakesValue(name)) {
      options.push(rest ? { name, value: rest } : { name });
      return options;
    }
    options.push({ name });
  }
  return options;
};

/** One curl option's words that make it more than a read, given its value when it takes one; none when it only reads. */
const curlOptionActs = (
  name: string,
  value: string | undefined
): string | undefined => {
  if (value === undefined) {
    return CURL_FLAGS.has(name) ? undefined : name;
  }
  const judged = CURL_JUDGED[name];
  return judged && !judged(value) ? `${name} ${value}` : undefined;
};

/**
 * curl's word that makes it more than an HTTP read, as written: a method
 * other than GET or HEAD, a body or an upload (`-d`, `--json`, `-F`, `-T`),
 * a config file (`-K`), output into a file (`-o file`, `-O`, `-c`, `-D
 * file`, `--trace file`), a unix socket (Docker's and podman's, and the
 * GitHub door's, which writes with the machine's token), an address of
 * another protocol, or any option the gate does not know; none when it only
 * reads. A GET reaches outside hosts as Caw's WebFetch on Claude and
 * OpenCode, which no gate holds, already does; its content makes his wake
 * external as that does (web-reads.ts).
 */
function curlReads(args: string[]): string | undefined {
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] as string;
    const options = curlOptions(word);
    if (!options) {
      if (!curlSpeaksHttp(word)) {
        return word;
      }
      continue;
    }
    for (const { name, value: inline } of options) {
      let value = inline;
      if (value === undefined && curlTakesValue(name)) {
        at += 1;
        value = args[at] ?? "";
      }
      const acts = curlOptionActs(name, value);
      if (acts) {
        return acts;
      }
    }
  }
}

/** sed's options that are fine to read with. */
const SED_FLAGS =
  /^(?:-[nErsuz]+|--quiet|--silent|--regexp-extended|--separate|--unbuffered|--null-data|--posix|--sandbox|--debug|--line-length=\d+)$/u;
/** sed's short options ending in `e`, whose script is the next word (`-ne '1p'`). */
const SED_SCRIPT_NEXT = /^-[nErsuz]*e$/u;

/**
 * sed's word that makes it act: `-i` (it writes the file), `-f` (a script
 * the gate cannot see), or a script command that writes or runs ({@link
 * sedScriptActs}); none when it only prints.
 */
function sedReads(args: string[]): string | undefined {
  const scripts: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] as string;
    if (SED_SCRIPT_NEXT.test(arg) || arg === "--expression") {
      scripts.push(args[at + 1] ?? "");
      at += 1;
    } else if (arg.startsWith("--expression=")) {
      scripts.push(arg.slice("--expression=".length));
    } else if (arg === "-l") {
      at += 1;
    } else if (arg.startsWith("-") && arg !== "-") {
      if (!SED_FLAGS.test(arg)) {
        return arg;
      }
    } else if (scripts.length === 0) {
      // The first operand is the script when no `-e` gave one; the rest are files.
      scripts.push(arg);
    }
  }
  for (const script of scripts) {
    const acts = sedScriptActs(script);
    if (acts) {
      return acts;
    }
  }
}

/** A sed script command's letters that only print or move through the input. */
const SED_PRINTS = new Set("pPdDgGhHxnNlz=F{}");
/** sed commands whose argument runs to the end of the line: a text, a file to read, a comment. */
const SED_TO_LINE_END = new Set("aicrR#");
/** sed commands that take a label. */
const SED_LABELS = new Set(":btT");
const SED_BLANK = /[\s;]/u;
/** What runs on in a sed line number or step (`0~4`). */
const SED_STEP = /[\d~]/u;
/** A sed regex address's flags. */
const SED_REGEX_FLAGS = /[IM]/u;
const SED_SPACE = /[ \t]/u;
/** Blanks and the `!` that negates an address. */
const SED_NEGATION = /[ \t!]/u;
/** `q`'s and `Q`'s exit code. */
const SED_EXIT_CODE = /[ \t\d]/u;
/** A label's letters: up to `;` or the line's end. */
const SED_LABEL = /[^;\n]/u;
const DIGIT = /\d/u;

/**
 * The first command of a sed script that writes a file or runs one (`w`,
 * `W`, `e`, `s///w`, `s///e`) or that the gate does not know, as written;
 * none when it only prints.
 */
const sedScriptActs = (script: string): string | undefined => {
  const reader = new SedScript(script);
  return reader.acts();
};

/** One pass over a sed script ({@link sedScriptActs}). */
class SedScript {
  #at = 0;
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  acts(): string | undefined {
    for (;;) {
      this.#skip(SED_BLANK);
      if (this.#at >= this.#text.length) {
        return;
      }
      this.#addresses();
      const command = this.#text[this.#at] ?? "";
      this.#at += 1;
      const acts = this.#command(command);
      if (acts !== undefined) {
        return acts;
      }
    }
  }

  #skip(pattern: RegExp): void {
    while (
      this.#at < this.#text.length &&
      pattern.test(this.#text[this.#at] as string)
    ) {
      this.#at += 1;
    }
  }

  /** Past a delimited part (`/re/`, `|x|`), from its opening delimiter. */
  #delimited(): void {
    const delimiter = this.#text[this.#at];
    this.#at += 1;
    while (this.#at < this.#text.length && this.#text[this.#at] !== delimiter) {
      this.#at += this.#text[this.#at] === "\\" ? 2 : 1;
    }
    this.#at += 1;
  }

  #address(): void {
    const char = this.#text[this.#at] ?? "";
    if (DIGIT.test(char) || char === "+" || char === "~") {
      this.#at += 1;
      this.#skip(SED_STEP);
    } else if (char === "$") {
      this.#at += 1;
    } else if (char === "/" || char === "\\") {
      if (char === "\\") {
        this.#at += 1;
      }
      this.#delimited();
      this.#skip(SED_REGEX_FLAGS);
    }
  }

  #addresses(): void {
    this.#address();
    this.#skip(SED_SPACE);
    if (this.#text[this.#at] === ",") {
      this.#at += 1;
      this.#skip(SED_SPACE);
      this.#address();
    }
    this.#skip(SED_NEGATION);
  }

  #toLineEnd(): void {
    while (this.#at < this.#text.length && this.#text[this.#at] !== "\n") {
      this.#at += this.#text[this.#at] === "\\" ? 2 : 1;
    }
  }

  #command(command: string): string | undefined {
    if (SED_PRINTS.has(command)) {
      // `l` and `q` take a number; `}` may close a group.
      this.#skip(DIGIT);
      return;
    }
    if (command === "q" || command === "Q") {
      this.#skip(SED_EXIT_CODE);
      return;
    }
    if (SED_TO_LINE_END.has(command)) {
      this.#toLineEnd();
      return;
    }
    if (SED_LABELS.has(command)) {
      // A label ends at `;` or the line's end: what follows is read on.
      this.#skip(SED_LABEL);
      return;
    }
    if (command === "y") {
      this.#delimited();
      this.#at -= 1;
      this.#delimited();
      return;
    }
    if (command === "s") {
      return this.#substitute();
    }
    return command;
  }

  /** `s/re/text/flags`: its flags may write (`w`) or run (`e`). */
  #substitute(): string | undefined {
    this.#delimited();
    this.#at -= 1;
    this.#delimited();
    while (this.#at < this.#text.length) {
      const flag = this.#text[this.#at] as string;
      if (flag === ";" || flag === "\n" || flag === "}") {
        return;
      }
      if (!SED_SUBSTITUTE_FLAGS.test(flag)) {
        return `s///${flag}`;
      }
      this.#at += 1;
    }
  }
}

/** The flags of a sed `s` that only shape what it prints. */
const SED_SUBSTITUTE_FLAGS = /[gpiImM\d \t]/u;

/** awk's options that are fine to read with; `-f` (a program the gate cannot see) and the rest are not. */
const AWK_FLAGS =
  /^(?:-F.+|-v.+|-[bcnNOPrSt]+|--sandbox|--posix|--traditional|--characters-as-bytes|--non-decimal-data|--optimize|--re-interval|--field-separator=.*|--assign=.*)$/su;
/** In an awk program outside its strings and `||`: what writes (`>`, not `>=`), pipes (`|`), runs a program or loads code. */
const AWK_ACTS = /system|getline|@|\||>(?!=)/u;
/** awk's options that take the next word: a field separator, a variable. */
const AWK_VALUED: ReadonlySet<string> = new Set(["-F", "-v"]);
/** gawk's options whose next word is program text. */
const AWK_SOURCE: ReadonlySet<string> = new Set(["-e", "--source"]);
/** An awk string literal, escapes and all. */
const AWK_STRING = /"(?:[^"\\]|\\.)*"/gsu;

/** What in an awk program writes or runs, as written; none when it only prints. */
const awkProgramActs = (program: string): string | undefined => {
  const bare = program.replace(AWK_STRING, '""').replaceAll("||", "  ");
  return AWK_ACTS.exec(bare)?.[0];
};

/**
 * awk's word that makes it act: an option the gate does not know (`-f`, a
 * program in a file; `-i`, `-l`, code to load), or what its program writes
 * or runs ({@link awkProgramActs}); none when it only prints.
 */
function awkReads(args: string[]): string | undefined {
  const programs: string[] = [];
  let at = 0;
  for (; at < args.length; at += 1) {
    const arg = args[at] as string;
    if (arg === "--" || arg === "-" || !arg.startsWith("-")) {
      break;
    }
    if (AWK_VALUED.has(arg)) {
      at += 1;
    } else if (AWK_SOURCE.has(arg)) {
      programs.push(args[at + 1] ?? "");
      at += 1;
    } else if (arg.startsWith("--source=")) {
      programs.push(arg.slice("--source=".length));
    } else if (!AWK_FLAGS.test(arg)) {
      return arg;
    }
  }
  // With no `-e`, the first operand is the program; the rest are files.
  const first = args[args[at] === "--" ? at + 1 : at];
  if (programs.length === 0 && first !== undefined) {
    programs.push(first);
  }
  return awkProgramActs(programs.join("\n"));
}

/**
 * What a reader says of its arguments: the word that would make it write,
 * run something or keep running; none when they only read.
 */
type Reader = (args: string[]) => string | undefined;

/** A program that only reads whatever it is given. */
const onlyReads: Reader = () => undefined;

/** A reader whose arguments matching `acts` make it act. */
const unless =
  (acts: RegExp): Reader =>
  (args) =>
    args.find((arg) => acts.test(arg));

/** The words of a command that are not options. */
const operands = (args: string[]): string[] =>
  args.filter((arg) => !arg.startsWith("-"));

/**
 * The programs that only read, or print what they are given, each with what
 * of its arguments would make it write, run something or keep running. The
 * list follows Codex's safe commands (openai/codex rust-v0.120.0
 * shell-command/src/command_safety/is_safe_command.rs: `rg` without `--pre`,
 * `--hostname-bin` or `--search-zip`, `find` without its actions, `sed`
 * that only prints) and widens `sed` and `awk` to any script that writes no
 * file and runs no program ({@link sedReads}, {@link awkReads}).
 */
const READERS: Readonly<Record<string, Reader>> = {
  ls: onlyReads,
  cat: onlyReads,
  grep: onlyReads,
  egrep: onlyReads,
  fgrep: onlyReads,
  rg: unless(RG_ACTS),
  wc: onlyReads,
  head: onlyReads,
  find: unless(FIND_ACTS),
  echo: onlyReads,
  printf: onlyReads,
  tr: onlyReads,
  cut: onlyReads,
  pwd: onlyReads,
  // It moves only the shell's own directory: what runs after it is judged.
  cd: onlyReads,
  true: onlyReads,
  false: onlyReads,
  test: onlyReads,
  "[": onlyReads,
  tail: unless(FOLLOWS),
  sort: unless(SORT_ACTS),
  // A second operand is the file uniq writes its output to.
  uniq: (args) => operands(args)[1],
  file: unless(FILE_ACTS),
  stat: onlyReads,
  du: onlyReads,
  df: onlyReads,
  tree: unless(TREE_ACTS),
  realpath: onlyReads,
  readlink: onlyReads,
  basename: onlyReads,
  dirname: onlyReads,
  which: onlyReads,
  diff: onlyReads,
  cmp: onlyReads,
  comm: onlyReads,
  tac: onlyReads,
  nl: onlyReads,
  rev: onlyReads,
  paste: onlyReads,
  fold: onlyReads,
  column: onlyReads,
  od: onlyReads,
  hexdump: onlyReads,
  md5sum: onlyReads,
  sha1sum: onlyReads,
  sha256sum: onlyReads,
  sha512sum: onlyReads,
  cksum: onlyReads,
  jq: onlyReads,
  sed: sedReads,
  awk: awkReads,
  gawk: awkReads,
  mawk: awkReads,
  nawk: awkReads,
  gh: ghReads,
  systemctl: systemdReads(SYSTEMCTL_READS, SYSTEMCTL_VALUED),
  "systemd-analyze": systemdReads(ANALYZE_READS, ANALYZE_VALUED),
  journalctl: unless(JOURNAL_ACTS),
  date: unless(DATE_ACTS),
  whoami: onlyReads,
  id: onlyReads,
  uname: onlyReads,
  hostname: hostnameReads,
  nproc: onlyReads,
  uptime: onlyReads,
  free: unless(FREE_ACTS),
  ps: onlyReads,
  // pgrep finds processes; pkill, which signals them, is not a reader.
  pgrep: onlyReads,
  ss: unless(SS_ACTS),
  netstat: unless(NETSTAT_ACTS),
  lsof: unless(LSOF_ACTS),
  ip: ipReads,
  curl: curlReads,
  // It only waits: a wait loop's pause.
  sleep: onlyReads,
  // Only `command -v` and `-V` reach here ({@link programWords}): they name what a word runs.
  command: onlyReads,
};

/** What a judge says of one command: why it is more than the line may run, in words; none when it may run. */
type Judge = (argv: string[], name: string) => string | undefined;

/**
 * Why a shell line is more than `judge` lets run, in words: what the gate
 * cannot read, what its syntax writes, or its first command `judge` holds;
 * none when every command passes.
 */
const blockerOf = (command: string, judge: Judge): string | undefined => {
  const read = commandsOf(command);
  if (read.unread) {
    return `the gate can't read this line: ${read.unread}`;
  }
  if (read.writes) {
    return read.writes;
  }
  if (read.argvs.length === 0) {
    return "the gate found no command in this line";
  }
  for (const argv of read.argvs) {
    const why = judge(argv, baseName(argv[0] ?? ""));
    if (why) {
      return why;
    }
  }
};

/** Why one command is not a {@link READERS} reader within its limits, in words; none when it is. */
const readerBlocker = (argv: string[], name: string): string | undefined => {
  const reader = READERS[name];
  if (!reader) {
    return `\`${name}\` isn't a command the gate knows only reads`;
  }
  const acts = reader(argv.slice(1));
  return acts === undefined
    ? undefined
    : `\`${name} ${acts}\` can do more than read`;
};

/** Why one command does not only read, in words: a reader past its limits, a git command that is not a read. */
const readJudge: Judge = (argv, name) =>
  name === "git" ? gitReadBlocker(argv) : readerBlocker(argv, name);

/**
 * Why a shell line does not only read, in words ({@link readOnly}); none
 * when it does.
 */
const readBlocker = (command: string): string | undefined =>
  blockerOf(command, readJudge);

/**
 * Whether a shell line only reads, so the hub runs it in any wake without
 * asking: every command it runs is a {@link READERS} reader within its
 * limits or a git command that only reads (`git fetch` of a configured
 * remote by name among them, which moves only its remote-tracking refs);
 * redirected only into `/dev/null`, onto another descriptor or from a file;
 * nothing backgrounded, nothing unreadable. Nothing such a line does writes
 * the place's tree or publishes, and Caw's own Read, Grep and WebFetch
 * tools, which no gate holds, read as much: a `curl` GET reaches a host as
 * his WebFetch does.
 */
const readOnly = (command: string): boolean =>
  readBlocker(command) === undefined;

/**
 * Whether a shell line is one a turn your words woke runs without asking:
 * {@link readOnly}, or, in a place no one else uses, `git init`,
 * `git add <paths>` or `git commit` among its reading commands.
 */
const allowlisted = (command: string, shared: boolean): boolean =>
  blockerOf(command, (argv, name) =>
    name === "git" && gitTidy(argv, shared) ? undefined : readJudge(argv, name)
  ) === undefined;

/** What in a shell line is refused in a shared checkout, in words; none when nothing is. */
const sharedRefusal = (command: string): string | undefined =>
  sharedDenial(commandsOf(command).argvs);

/** The programs whose path arguments are files a shell line changes. */
const CHANGERS: ReadonlySet<string> = new Set([
  "rm",
  "rmdir",
  "mv",
  "cp",
  "touch",
  "mkdir",
  "ln",
  "chmod",
  "chown",
  "tee",
  "truncate",
  "sed",
  "unlink",
  "install",
]);

/** The files a shell line names that it changes: each path argument of a command that changes files, and what `git add` stages. */
const shellFiles = (command: string): string[] => {
  const files: string[] = [];
  for (const argv of commandsOf(command).argvs) {
    const git = gitOf(argv);
    const named = (args: string[]) =>
      files.push(...args.filter((arg) => !arg.startsWith("-")));
    const name = baseName(argv.at(0) ?? "");
    if (git?.sub === "add") {
      named(git.args);
    } else if (
      CHANGERS.has(name) &&
      // A sed that only prints changes nothing it names.
      !(name === "sed" && sedReads(argv.slice(1)) === undefined)
    ) {
      named(argv.slice(1));
    }
  }
  return [...new Set(files)];
};

// --- edits -----------------------------------------------------------------

/** The files an edit call names: Claude's `file_path`/`notebook_path`, OpenCode's `filepath` or its resources, pi's `path`. */
const editFiles = (input: Record<string, unknown>): string[] => {
  const named = [
    input.file_path,
    input.notebook_path,
    input.filepath,
    input.filePath,
    input.path,
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (named.length > 0) {
    return [...new Set(named)];
  }
  const { resources } = input;
  return Array.isArray(resources)
    ? resources.filter((value): value is string => typeof value === "string")
    : [];
};

/** Each `Caw edits:` glob, compiled once. */
const GLOBS = new Map<string, Bun.Glob>();

const globOf = (pattern: string): Bun.Glob => {
  let glob = GLOBS.get(pattern);
  if (!glob) {
    glob = new Bun.Glob(pattern);
    GLOBS.set(pattern, glob);
  }
  return glob;
};

/**
 * Whether a file, by its path in the place, is one the project declares its
 * Caw edits (gate.md's `Caw edits:`, gate-file.ts): a glob of `globs`
 * matches it. Never anything under `.git`, nothing outside the place, and
 * no absolute path.
 */
const inCawEdits = (relative: string, globs: readonly string[]): boolean => {
  if (
    relative.startsWith("../") ||
    relative === ".." ||
    relative.startsWith(".git/") ||
    isAbsolute(relative)
  ) {
    return false;
  }
  return globs.some((glob) => globOf(glob).match(relative));
};

/** A file an edit names, relative to the place. */
const inPlace = (place: string, file: string): string =>
  posix.relative(place, posix.resolve(place, file));

// --- the gate --------------------------------------------------------------

/** One wake of a lead, as the gate keeps it: what it spent. Whose it is is its turn's provenance (turn-provenance.ts). */
interface Wake {
  calls: number;
  /** The files its edits touched or asked to. */
  files: Set<string>;
}

const fresh = (): Wake => ({ calls: 0, files: new Set() });

export interface LeadGateDeps {
  /** The files the lead's project declares its Caw edits (gate-file.ts `projectCawEdits`). */
  readonly cawEdits: (projectId: string) => Promise<CawEdits>;
  readonly db: Pick<DbShape, "leadCalls">;
  /** Why the ask is no longer one its session waits on (server.ts `askRefusal`, read again now); undefined while it is. */
  readonly gone: (envelope: Envelope) => string | undefined;
  /** A note in the thread the lead's turn answers (caw.ts `noteCall`). */
  readonly note: (instanceId: string, note: ThreadNote) => void;
  /** Why the lead's turn is not the owner's, as a card's clause says it; null while it is (turn-provenance.ts `outside`). */
  readonly outside: (instanceId: string) => string | null;
  /** Whether the lead's place is a shared checkout: one another live session uses, or the project's folder on the hub. */
  readonly shared: (lead: InstanceRow) => boolean;
  /** The thread the lead's turn answers now (caw.ts `askThread`). */
  readonly thread: (lead: InstanceRow) => string | undefined;
}

/** A command or file as a note's title names it: its first line, cut. */
const shortly = (text: string): string => {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

/** A tool result's text. */
const resultText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("\n");
  }
  return "";
};

/** One call, as the gate reads it: its command (or the files it edits), and the files it changes. */
interface Call {
  command: string;
  files: string[];
  kind: CallKind;
  /** A shell line the gate can read ({@link UNREAD_SHELLS}); false for any other call. */
  readable: boolean;
  /** The tool, by its harness's name. */
  tool: string;
}

/** A call put on your card, with the rule that put it there: "Asked because …". */
const card = (why: string): GateVerdict => ({
  kind: "card",
  why: `Asked because ${why}.`,
});

/** An edit past the refusals, in the owner's turn: a file the project lists runs; with no list, it is put to you. */
const editVerdict = (edits: CawEdits): GateVerdict =>
  edits.kind === "declared"
    ? { kind: "allow" }
    : card("no Caw edits list names this file");

/**
 * Why a shell line goes to your card in the owner's turn, in words: the
 * first thing in it that is more than a read; and, for a write his own
 * place would run, that this place is a shared checkout.
 */
const shellAsk = (command: string, isShared: boolean): string => {
  const blocker = readBlocker(command) ?? "";
  return isShared && allowlisted(command, false)
    ? `this place is a shared checkout, and ${blocker}`
    : blocker;
};

/** Why a call is past the wake's budget, or nothing. */
const overBudget = (wake: Wake): string | undefined =>
  wake.calls > CALLS_PER_WAKE
    ? `That is past ${CALLS_PER_WAKE} shell and edit calls in this wake: delegate the rest.`
    : undefined;

/** Why a shell call is refused in a shared checkout, or nothing. */
const sharedDenied = (call: Call, isShared: boolean): string | undefined => {
  const refused = isShared ? sharedRefusal(call.command) : undefined;
  return refused
    ? `\`${refused}\` is refused here: this place is a shared checkout. File a task.`
    : undefined;
};

/**
 * Why an edit is refused by its files or its size, or nothing: a file the
 * project's Caw edits do not list, when it lists them; any edit while its
 * gate.md does not read. With no list, its files are not judged here.
 */
const editDenied = (
  call: Call,
  wake: Wake,
  edits: CawEdits
): string | undefined => {
  if (edits.kind === "unreadable") {
    return `This project's gate.md does not read, so the files Caw edits are not known: ${edits.problems.join(" ")} Fix gate.md, or file a task.`;
  }
  const outside =
    edits.kind === "declared"
      ? call.files.filter((file) => !inCawEdits(file, edits.globs))
      : [];
  if (
    edits.kind === "declared" &&
    (call.files.length === 0 || outside.length > 0)
  ) {
    return `${outside.join(", ") || "That file"} is not in this project's Caw edits: file a task.`;
  }
  if (new Set([...wake.files, ...call.files]).size > FILES_PER_WAKE) {
    return `That would edit more than ${FILES_PER_WAKE} files in this wake: an edit that size is a task's. File a task.`;
  }
};

/** What became of a call, as its row first stands. */
const OUTCOME_OF: Record<GateVerdict["kind"], LeadCallRow["outcome"]> = {
  allow: "ran",
  deny: "refused",
  card: "asked",
};

/** What a call's row keeps of why: a refusal's words, or the rule that put it on your card. */
const whyOf = (verdict: GateVerdict): string | null => {
  if (verdict.kind === "deny") {
    return verdict.message;
  }
  return verdict.kind === "card" ? verdict.why : null;
};

/** A call's row, read back, as the verdict its replay gets. */
const verdictOf = (row: LeadCallRow): GateVerdict => {
  switch (row.outcome) {
    case "refused":
      return { kind: "deny", message: row.why ?? "Refused." };
    case "denied":
      return { kind: "deny", message: "The person denied this call." };
    case "cut":
      return {
        kind: "deny",
        message: `This call was cut: ${row.why ?? "its ask left unanswered"}.`,
      };
    case "ran":
      return { kind: "allow" };
    case "asked":
      break;
  }
  return { kind: "card", why: row.why ?? "" };
};

/** What a ran call's note says of how it went. */
const ranBody = (row: LeadCallRow, kind: CallKind): string => {
  const approved = row.approved ? " · you approved it" : "";
  if (kind === "tool") {
    return `${row.exit === "failed" ? "Failed" : "Done"}${approved}`;
  }
  if (kind === "shell") {
    const files = row.files.length > 0 ? ` · ${row.files.join(", ")}` : "";
    const exit =
      row.exit === "failed" ? "Failed" : `Exit ${row.exit ?? "not reported"}`;
    return `${exit}${approved}${files}`;
  }
  return `${row.exit === "failed" ? "Did not apply" : "Applied"}${approved}`;
};

/** A call's note in its thread, by its outcome; none while it waits on your card. */
const noteFor = (row: LeadCallRow): ThreadNote | undefined => {
  const what = shortly(row.command);
  const kind = kindOf(row.tool);
  switch (row.outcome) {
    case "refused":
      return {
        title: `Caw · refused \`${what}\``,
        body: row.why ?? "",
        event: { kind: "caw", what: "refused", command: what },
      };
    case "denied":
      return {
        title: `Caw · you denied \`${what}\``,
        event: { kind: "caw", what: "denied", command: what },
      };
    case "cut":
      return {
        title: `Caw · cut \`${what}\``,
        body: row.why ?? "",
        event: { kind: "caw", what: "cut", command: what },
      };
    case "ran":
      return {
        title:
          kind === "edit" ? `Caw · edited ${what}` : `Caw · ran \`${what}\``,
        body: ranBody(row, kind),
        event: {
          kind: "caw",
          what: kind === "edit" ? "edited" : "ran",
          command: what,
        },
      };
    case "asked":
      return;
  }
};

/** A line a lead's place's guard said (agent boundary.ts `placeGuard`). */
const GUARD_LINE = /^cawco place-guard: .+$/gmu;

/** What a call's result says its place's guard found: each line, without its tag. */
const guardLines = (text: string): string[] =>
  (text.match(GUARD_LINE) ?? []).map((line) =>
    line.slice("cawco place-guard: ".length)
  );

/**
 * A ran call's exit: an edit's `ok` or `failed` by its result's `is_error`;
 * a shell's by the exit its harness hands over. OpenCode's `shell` result
 * carries it as `metadata.exit` (its built-in's code, CawCo's bounded
 * shell's code or signal; agent `toolResultOf` passes the metadata on as
 * `structuredContent`), and a command that exits non-zero there is still a
 * completed call. Claude Code's Bash result carries none (agent SDK 0.3.302
 * `BashOutput`), only `is_error`: its shell is `0` or `failed`, and the
 * number in the words the model reads is never read.
 */
const exitOf = (
  row: LeadCallRow,
  block: {
    content: unknown;
    is_error?: boolean;
    structuredContent?: Record<string, unknown>;
  }
): string => {
  if (kindOf(row.tool) !== "shell") {
    return block.is_error ? "failed" : "ok";
  }
  const exit = block.structuredContent?.exit;
  if (typeof exit === "number" && Number.isFinite(exit)) {
    return String(exit);
  }
  if (typeof exit === "string" && exit) {
    return exit;
  }
  return block.is_error ? "failed" : "0";
};

export const createLeadGate = ({
  cawEdits,
  db,
  gone,
  note,
  outside,
  shared,
  thread,
}: LeadGateDeps) => {
  /** Each lead's wake under way, by session. */
  const wakes = new Map<string, Wake>();
  /**
   * The edits waiting on their project's gate.md, by request: whose they
   * are, and why the ask was over meanwhile, once it was.
   */
  const reading = new Map<string, { instanceId: string; over?: string }>();
  const wakeOf = (instanceId: string): Wake => {
    let wake = wakes.get(instanceId);
    if (!wake) {
      wake = fresh();
      wakes.set(instanceId, wake);
    }
    return wake;
  };

  /** The call's words for its row and its note. */
  const describe = (lead: InstanceRow, ask: PermissionRequestFrame): Call => {
    const kind = kindOf(ask.toolName);
    if (kind === "shell") {
      const command =
        typeof ask.input.command === "string" ? ask.input.command : "";
      return {
        kind,
        tool: ask.toolName,
        command,
        files: shellFiles(command),
        readable: !UNREAD_SHELLS.has(ask.toolName),
      };
    }
    if (kind === "tool") {
      return {
        kind,
        tool: ask.toolName,
        command: `${ask.toolName} ${JSON.stringify(ask.input)}`.slice(
          0,
          TOOL_INPUT_KEPT
        ),
        files: [],
        readable: false,
      };
    }
    const files = editFiles(ask.input).map((file) => inPlace(lead.cwd, file));
    return {
      kind,
      tool: ask.toolName,
      command: files.join(", "),
      files,
      readable: false,
    };
  };

  /**
   * Why a call is refused outright, by the budget, the shared checkout or
   * the project's Caw edits; nothing for one that is not. `again`: a call
   * on your card judged again, which was inside its wake's budget as it was
   * asked, and spends none of it now.
   */
  const refusalOf = (
    call: Call,
    wake: Wake,
    isShared: boolean,
    edits: CawEdits,
    again: boolean
  ): string | undefined => {
    const refused = again ? undefined : overBudget(wake);
    if (refused || call.kind === "tool") {
      return refused;
    }
    return call.kind === "shell"
      ? sharedDenied(call, isShared)
      : editDenied(call, wake, edits);
  };

  const judge = (
    lead: InstanceRow,
    call: Call,
    edits: CawEdits,
    again: boolean
  ): GateVerdict => {
    const wake = wakeOf(lead.id);
    if (!again) {
      wake.calls += 1;
    }
    const isShared = shared(lead);
    const refused = refusalOf(call, wake, isShared, edits, again);
    if (refused) {
      return { kind: "deny", message: refused };
    }
    if (call.kind === "tool") {
      return card(
        `\`${call.tool}\` comes from your own pi extensions, which the gate can't read`
      );
    }
    if (call.kind === "edit") {
      for (const file of call.files) {
        wake.files.add(file);
      }
    }
    // The one rule every session runs under: a turn that is not the
    // owner's puts each shell and edit call to you, saying what made it so.
    const provenance = turnCall(outside(lead.id), undefined, call.kind);
    if (provenance.kind === "ask") {
      return { kind: "card", why: provenance.why };
    }
    if (call.kind === "edit") {
      return editVerdict(edits);
    }
    if (!call.readable) {
      return card(`the gate can't read ${call.tool}`);
    }
    // In the owner's turn a line that only reads runs, and the tidy writes
    // where no one else works; anything else is put to you, with the rule
    // that sent it.
    if (readOnly(call.command) || allowlisted(call.command, isShared)) {
      return { kind: "allow" };
    }
    return card(shellAsk(call.command, isShared));
  };

  /** A call's note in his thread, once its outcome is known. */
  const noteOf = (row: LeadCallRow): void => {
    const said = noteFor(row);
    if (said) {
      note(row.instanceId, said);
    }
  };

  /** A lead's turn ended: its wake with it. */
  const wakeEnded = (instanceId: string): void => {
    const wake = wakes.get(instanceId);
    wakes.delete(instanceId);
    if (wake) {
      console.log(
        `[lead-gate] ${instanceId}: wake ended after ${wake.calls} call(s) (${outside(instanceId) ?? "the owner's"})`
      );
    }
  };

  /** One of a lead's tool results: a ran call's says its exit. */
  const resulted = (
    instanceId: string,
    block: {
      content: unknown;
      is_error?: boolean;
      structuredContent?: Record<string, unknown>;
      tool_use_id: string;
    }
  ): void => {
    const row = db.leadCalls.ofToolUse(instanceId, block.tool_use_id);
    if (row?.outcome !== "ran" || row.exit !== null) {
      return;
    }
    const exit = exitOf(row, block);
    db.leadCalls.set(row.id, { exit });
    const guarded = guardLines(resultText(block.content));
    const said = noteFor({ ...row, exit });
    if (said && guarded.length > 0) {
      // What his place's guard moved aside or saw change: said whole, under
      // a title that says so.
      note(row.instanceId, {
        title: `Caw · his place's guard on \`${shortly(row.command)}\``,
        body: [said.body, ...guarded].filter(Boolean).join("\n"),
        event: { kind: "caw", what: "guard", command: shortly(row.command) },
      });
      return;
    }
    noteOf({ ...row, exit });
  };

  /**
   * What the project declares its Caw edits, read for an edit's verdict; or
   * the ask withdrawn while it was read, which nothing waits on any more.
   */
  const editsFor = async (
    projectId: string,
    lead: InstanceRow,
    envelope: Envelope,
    call: Call
  ): Promise<CawEdits | Extract<GateDecision, { kind: "withdrawn" }>> => {
    const requestId = envelope.requestId ?? "";
    reading.set(requestId, { instanceId: lead.id });
    // The read never throws: a failure is what gate.md says now.
    const edits = await cawEdits(projectId).catch(
      (error: unknown): CawEdits => ({
        kind: "unreadable",
        problems: [error instanceof Error ? error.message : String(error)],
      })
    );
    const over = reading.get(requestId)?.over ?? gone(envelope);
    reading.delete(requestId);
    if (over) {
      console.log(
        `[lead-gate] ${lead.id} ${call.tool} withdrawn while gate.md was read (${over}): not judged, not parked: ${shortly(call.command)}`
      );
      return { kind: "withdrawn", why: over };
    }
    return edits;
  };

  /**
   * A verdict on its call's row: a new row for a call first judged; for one
   * on your card judged again (`asked`), its row moved to the verdict
   * today's gate gives. A refusal is noted in his thread.
   */
  const fileVerdict = (
    lead: InstanceRow,
    projectId: string,
    ask: PermissionRequestFrame,
    call: Call,
    verdict: GateVerdict,
    asked: LeadCallRow | undefined
  ): void => {
    const outcome = OUTCOME_OF[verdict.kind];
    const why = whyOf(verdict);
    if (asked) {
      if (outcome === asked.outcome && why === asked.why) {
        return;
      }
      db.leadCalls.set(asked.id, { outcome, why });
      console.log(
        `[lead-gate] ${lead.id} ${ask.toolName} still on your card, judged again by today's gate: ${verdict.kind}: ${shortly(call.command)}`
      );
      if (outcome === "refused") {
        noteOf({ ...asked, outcome, why });
      }
      return;
    }
    const row: LeadCallRow = {
      id: crypto.randomUUID(),
      projectId,
      instanceId: lead.id,
      threadId: thread(lead) ?? null,
      requestId: ask.requestId,
      toolUseId: ask.toolUseId ?? null,
      tool: ask.toolName,
      command: call.command,
      files: call.files,
      writes: !(
        call.kind === "shell" &&
        call.readable &&
        allowlisted(call.command, true)
      ),
      outcome,
      approved: false,
      why,
      exit: null,
      at: new Date(),
    };
    db.leadCalls.add(row);
    console.log(
      `[lead-gate] ${lead.id} ${ask.toolName} ${verdict.kind}: ${shortly(call.command)}`
    );
    if (outcome === "refused") {
      noteOf(row);
    }
  };

  return {
    /**
     * Whether `requestId` is one of Caw's gated asks: only you answer those,
     * never a session.
     */
    owns: (requestId: string): boolean =>
      db.leadCalls.ofRequest(requestId) !== undefined,

    /**
     * A permission ask from `lead`, before it is parked: the gate's verdict,
     * a refusal for a question ({@link isQuestion}), or none for an ask that
     * is not one of a lead's gated calls ({@link isGated}; it parks as any
     * ask). A replay of one already settled answers the same, and spends
     * nothing again. A replay of one still on your card is judged again by
     * the gate as it stands now: its process still waits on it (a process
     * sessiond holds outlives every agent and hub install), and a call
     * today's gate lets run or refuses is the gate's to settle, not yours.
     * An edit's verdict waits on the project's gate.md read.
     */
    async decide(
      lead: InstanceRow,
      envelope: Envelope
    ): Promise<GateDecision | undefined> {
      const ask = envelope.payload as PermissionRequestFrame;
      const { requestId } = envelope;
      if (lead.role !== "lead" || !lead.projectId || !requestId) {
        return;
      }
      if (isQuestion(ask)) {
        console.log(
          `[lead-gate] ${lead.id} ${ask.toolName} refused: Caw asks with a decision page`
        );
        return { kind: "deny", message: ASK_BY_CARD };
      }
      if (!isGated(ask)) {
        return;
      }
      const known = db.leadCalls.ofRequest(requestId);
      if (known && known.outcome !== "asked") {
        return verdictOf(known);
      }
      const call = describe(lead, ask);
      const edits =
        call.kind === "edit"
          ? await editsFor(lead.projectId, lead, envelope, call)
          : ({ kind: "none" } as const);
      if (edits.kind === "withdrawn") {
        return edits;
      }
      // A replay that came in while gate.md was read was judged by then.
      const judged = db.leadCalls.ofRequest(requestId);
      if (judged && judged.outcome !== "asked") {
        return verdictOf(judged);
      }
      const verdict = judge(lead, call, edits, judged !== undefined);
      fileVerdict(lead, lead.projectId, ask, call, verdict, judged);
      return verdict;
    },

    /** You answered a call's card: Approve lets it run, as yours; Deny means it does not run. */
    answered(requestId: string, result: PermissionResult): void {
      const row = db.leadCalls.ofRequest(requestId);
      if (row?.outcome !== "asked") {
        return;
      }
      if (result.behavior === "allow") {
        db.leadCalls.set(row.id, { outcome: "ran", approved: true });
        return;
      }
      db.leadCalls.set(row.id, { outcome: "denied" });
      noteOf({ ...row, outcome: "denied" });
    },

    /**
     * A call's ask left unanswered (pending.ts `onSettled`, cancelled): its
     * process ended, relaunched or withdrew it, so it never runs. One still
     * on your card is completed as cut, with `why`.
     */
    cut(requestId: string, why: string): void {
      const row = db.leadCalls.ofRequest(requestId);
      if (row?.outcome !== "asked") {
        return;
      }
      db.leadCalls.set(row.id, { outcome: "cut", why });
      noteOf({ ...row, outcome: "cut", why });
    },

    /** A frame a lead's harness streamed: its calls' results, its turn's end. */
    frame(instance: InstanceRow, neutral: NeutralMessage): void {
      if (instance.role !== "lead") {
        return;
      }
      if (neutral.type === "result") {
        wakeEnded(instance.id);
      } else if (
        neutral.type === "user" &&
        Array.isArray(neutral.message.content)
      ) {
        for (const block of neutral.message.content) {
          if (block.type === "tool_result") {
            resulted(instance.id, block);
          }
        }
      }
    },

    /**
     * An ask was settled by its harness (a `permission_settled` frame): one
     * whose edit waits on gate.md is over, and is never parked.
     */
    settled(requestId: string): void {
      const waiting = reading.get(requestId);
      if (waiting) {
        waiting.over ??= "its harness settled it";
      }
    },

    /** A lead's process ended: its wake with it, and every ask of it waiting on gate.md. */
    ended(instanceId: string): void {
      wakes.delete(instanceId);
      for (const waiting of reading.values()) {
        if (waiting.instanceId === instanceId) {
          waiting.over ??= "its process ended";
        }
      }
    },
  };
};

/**
 * Review independence (Projects spec §5.9: "the lead reviews, never the
 * doer"): why a task whose changes are only Caw's own may not close or pass
 * review now, or nothing when it may. Its changes are his own when no
 * attempt at it landed; they are his calls that changed files in the thread
 * that names the task (`threadId`), or anywhere in the project when no
 * thread names it. They pass once you approved every one of those on its
 * card. Anyone's move but yours is checked: your move is your approval.
 */
export const reviewProblem = (
  calls: readonly LeadCallRow[],
  task: { id: string; landed: boolean; threadId: string | undefined }
): string | undefined => {
  if (task.landed) {
    return;
  }
  const his = calls.filter(
    (call) =>
      call.writes &&
      call.outcome === "ran" &&
      (task.threadId === undefined || call.threadId === task.threadId)
  );
  if (his.length === 0) {
    return;
  }
  const unapproved = his.filter((call) => !call.approved);
  if (unapproved.length === 0) {
    return;
  }
  return `${task.id}'s only changes are Caw's own, ${unapproved.length} of them not approved by you (${unapproved
    .slice(0, 3)
    .map((call) => `\`${shortly(call.command)}\``)
    .join(
      ", "
    )}): it passes review only once you approve them, or you move it yourself.`;
};
