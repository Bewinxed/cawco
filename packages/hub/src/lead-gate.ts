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
 * 4. **Reads run**: a shell line that only reads ({@link readOnly}: readers
 *    and reading git, `git -C <path>` and `git fetch` of a named remote among
 *    them, output only into `/dev/null` or another descriptor) runs without
 *    asking whatever woke him: it writes nothing in the tree, publishes
 *    nothing, and reaches no host the project does not name.
 * 5. **Wake source**: a turn whose every read send is the owner's message
 *    (a thread message, a view request, his own words straight into the
 *    session) with no outside text riding on it, and that has read no web
 *    content, also runs `git init`, `git add <paths>` and `git commit` where
 *    no one else works ({@link allowlisted}), and an edit of a file his
 *    project's Caw edits list. Anything else (an edit with no list, any other
 *    write, a line the gate cannot read; or those writes in a turn an event,
 *    a routine, a report, a nudge, an inbox of outside events or a web read
 *    woke) raises the Approve card, the ask parked as any session's is. A
 *    PowerShell line, which the gate's POSIX reader cannot read, and a pi
 *    lead's call of a tool from the person's own extensions, which may do
 *    anything, always raise it. The card says, in one line, which rule sent
 *    the call there ("Asked because …", kept as the call's `why`).
 * 6. **Visible**: every call is a `lead_calls` row and a note in the thread
 *    his turn answers: the command, its exit, the files it touched; a
 *    refusal with why, your Deny as yours.
 *
 * Review independence (tasks.ts `moveTo`) reads the rows back: a task whose
 * only changes are his own edits passes review only once you approved them
 * ({@link reviewProblem}).
 */
import { isAbsolute, posix } from "node:path";
import {
  type Envelope,
  type InstanceRow,
  LEAD_GATED_TOOLS,
  LEAD_SHELL_TOOLS,
  type NeutralMessage,
  type NeutralOrigin,
  type PermissionRequestFrame,
  type PermissionResult,
  type ThreadNote,
} from "@cawco/core";
import { GIT_VALUED_OPTIONS, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
import type { DbShape, LeadCallRow } from "./db";
import type { CawEdits } from "./gate-file";
import type { WebContext } from "./web-reads";
import { readsWeb } from "./web-reads";

/** The most shell or edit calls Caw makes in one wake. */
export const CALLS_PER_WAKE = 20;
/** The most files his edits touch in one wake. */
export const FILES_PER_WAKE = 5;
/** The wakes kept for their sends to be read ({@link createLeadGate}'s `woke`). */
const SENDS_KEPT = 2000;

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
 * Claude Code's Windows `PowerShell`. A line of one never runs without your
 * card, however it reads: PowerShell runs a command from `( … )` and `{ … }`
 * where a POSIX shell reads words. Its shared-checkout refusals still apply.
 */
const UNREAD_SHELLS: ReadonlySet<string> = new Set(["PowerShell"]);

/**
 * What a lead's call is, by its tool: a shell line, a file edit, or any
 * other tool. That last kind is a pi lead's: his host puts to the gate every
 * call of a tool CawCo did not give him, one a person's own pi extension
 * registered (agent pi-runtime.ts `PiLeadGate`).
 */
type CallKind = "shell" | "edit" | "tool";

const kindOf = (tool: string): CallKind => {
  if (LEAD_SHELL_TOOLS.has(tool)) {
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

/** A simple command's words from the program it runs: past its assignments, keywords and wrappers. */
const programWords = (segment: string[]): string[] => {
  let words = segment;
  for (;;) {
    const lead = words.findIndex(
      (word) => !(ASSIGNMENT.test(word) || KEYWORDS.has(word))
    );
    words = lead < 0 ? [] : words.slice(lead);
    const [program] = words;
    if (program === undefined || !WRAPPERS[baseName(program)]) {
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
 * only moves where git reads, as `git status` in the place reads there.
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
/** systemctl's options that reach another host or machine. */
const SYSTEMCTL_REMOTE = /^(?:-H|--host|-M|--machine)(?:=|$)/u;

/** systemctl's word that makes it act: a verb that is not a read, or a remote host; none when it only reads (no verb lists units). */
function systemctlReads(args: string[]): string | undefined {
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] as string;
    if (SYSTEMCTL_REMOTE.test(arg)) {
      return arg;
    }
    if (SYSTEMCTL_VALUED.has(arg)) {
      at += 1;
    } else if (!arg.startsWith("-")) {
      return SYSTEMCTL_READS.has(arg) ? undefined : arg;
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
  systemctl: systemctlReads,
  journalctl: unless(JOURNAL_ACTS),
  date: unless(DATE_ACTS),
  whoami: onlyReads,
  id: onlyReads,
  uname: onlyReads,
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
export const readBlocker = (command: string): string | undefined =>
  blockerOf(command, readJudge);

/**
 * Whether a shell line only reads, so the hub runs it in any wake without
 * asking: every command it runs is a {@link READERS} reader within its
 * limits or a git command that only reads (`git fetch` of a configured
 * remote by name among them, which moves only its remote-tracking refs);
 * redirected only into `/dev/null`, onto another descriptor or from a file;
 * nothing backgrounded, nothing unreadable. Nothing such a line does writes
 * the place's tree, publishes, or reaches a host the project does not name,
 * and Caw's own Read and Grep tools, which no gate holds, read as much.
 */
export const readOnly = (command: string): boolean =>
  readBlocker(command) === undefined;

/**
 * Whether a shell line is one a turn your words woke runs without asking:
 * {@link readOnly}, or, in a place no one else uses, `git init`,
 * `git add <paths>` or `git commit` among its reading commands.
 */
export const allowlisted = (command: string, shared: boolean): boolean =>
  blockerOf(command, (argv, name) =>
    name === "git" && gitTidy(argv, shared) ? undefined : readJudge(argv, name)
  ) === undefined;

/** What in a shell line is refused in a shared checkout, in words; none when nothing is. */
export const sharedRefusal = (command: string): string | undefined =>
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
export const inCawEdits = (
  relative: string,
  globs: readonly string[]
): boolean => {
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

/** One wake of a lead, as the gate keeps it: whose it is, and what it spent. */
interface Wake {
  calls: number;
  /** The files its edits touched or asked to. */
  files: Set<string>;
  /** It read outside text: an event's wake, a routine's, a report, an inbox of outside events. */
  outside: boolean;
  /** It read your words: a thread message, a view request, a message straight into his session. */
  owner: boolean;
  /** Its web reads still waiting on their result, by call. */
  reading: Set<string>;
  /** The first outside text it read, as an ask names it ("a routine", "a message from Fix tray"). */
  source: string | undefined;
  /** It read web content: a result of a call that reads the web came back. */
  web: boolean;
}

const fresh = (): Wake => ({
  calls: 0,
  files: new Set(),
  outside: false,
  owner: false,
  reading: new Set(),
  source: undefined,
  web: false,
});

/**
 * What a send the hub woke a lead with was (caw.ts `sourceOf`): your words
 * alone, or outside text: an event, a routine's run, or your words with
 * outside events riding on them.
 */
export type WakeSource = "owner" | "event" | "routine" | "inbox";

/** An outside wake's source, as an ask names what woke the turn. */
const SOURCE_WORDS: Record<Exclude<WakeSource, "owner">, string> = {
  event: "a CawCo event",
  routine: "a routine",
  inbox: "outside events that came with your message",
};

/** A send whose wake the hub did not mark, by who sent it, as an ask names it. */
const originWords = (origin: NeutralOrigin | undefined): string => {
  if (origin?.kind === "peer") {
    return origin.name
      ? `a message from ${origin.name}`
      : "another session's message";
  }
  return origin?.kind === "system"
    ? "a CawCo notice"
    : "a message that wasn't yours";
};

export interface LeadGateDeps {
  /** The files the lead's project declares its Caw edits (gate-file.ts `projectCawEdits`). */
  readonly cawEdits: (projectId: string) => Promise<CawEdits>;
  readonly db: Pick<DbShape, "leadCalls">;
  /** Why the ask is no longer one its session waits on (server.ts `askRefusal`, read again now); undefined while it is. */
  readonly gone: (envelope: Envelope) => string | undefined;
  /** A note in the thread the lead's turn answers (caw.ts `noteCall`). */
  readonly note: (instanceId: string, note: ThreadNote) => void;
  /** Whether the lead's place is a shared checkout: one another live session uses, or the project's folder on the hub. */
  readonly shared: (lead: InstanceRow) => boolean;
  /** The thread the lead's turn answers now (caw.ts `askThread`). */
  readonly thread: (lead: InstanceRow) => string | undefined;
  /** What a web read is judged by (web-reads.ts). */
  readonly webContext: () => WebContext;
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

/** Whether a wake is yours: it read your words and nothing from outside, and no web content. */
const yours = (wake: Wake): boolean => wake.owner && !wake.outside && !wake.web;

/** Why a wake is not yours, in words, as an ask's reason says it. */
const wakeWords = (wake: Wake): string => {
  if (wake.web) {
    return "this turn read web content";
  }
  if (wake.outside) {
    return `this turn was woken by ${wake.source ?? "something other than your words"}`;
  }
  return "nothing you said woke this turn";
};

/** A call put on your card, with the rule that put it there: "Asked because …". */
const card = (why: string): GateVerdict => ({
  kind: "card",
  why: `Asked because ${why}.`,
});

/**
 * An edit past the refusals: a file the project lists runs in a turn your
 * words woke; with no list, or in any other turn, it is put to you.
 */
const editVerdict = (wake: Wake, edits: CawEdits): GateVerdict => {
  if (edits.kind !== "declared") {
    return card("no Caw edits list names this file");
  }
  return yours(wake)
    ? { kind: "allow" }
    : card(
        `${wakeWords(wake)}, and Caw edits a file unasked only in a turn your words woke`
      );
};

/**
 * Why a shell line goes to your card, in words: the first thing in it that
 * is more than a read; and, for a write a turn your words woke would run,
 * what makes this turn or this place not one that runs it.
 */
const shellAsk = (command: string, wake: Wake, isShared: boolean): string => {
  const blocker = readBlocker(command) ?? "";
  if (allowlisted(command, isShared)) {
    return `${wakeWords(wake)}, and ${blocker}`;
  }
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
  shared,
  thread,
  webContext,
}: LeadGateDeps) => {
  /** Each lead's wake under way, by session. */
  const wakes = new Map<string, Wake>();
  /**
   * The edits waiting on their project's gate.md, by request: whose they
   * are, and why the ask was over meanwhile, once it was.
   */
  const reading = new Map<string, { instanceId: string; over?: string }>();
  /** What each send the hub woke a lead with was: your words alone, or outside text, by its uuid (caw.ts `wake`). */
  const sends = new Map<string, WakeSource>();
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
   * The verdict on one of a lead's calls, from the rules in order: budget,
   * shared checkout, the project's Caw edits and size, wake source. `edits`
   * is what the project declares, for an edit. Any other tool's call (a pi
   * lead's tool from the person's own extensions) may do anything, so past
   * the budget it is put to you.
   */
  /** Why a call is refused outright, by the budget, the shared checkout or the project's Caw edits; nothing for one that is not. */
  const refusalOf = (
    call: Call,
    wake: Wake,
    isShared: boolean,
    edits: CawEdits
  ): string | undefined => {
    const refused = overBudget(wake);
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
    edits: CawEdits
  ): GateVerdict => {
    const wake = wakeOf(lead.id);
    wake.calls += 1;
    const isShared = shared(lead);
    const refused = refusalOf(call, wake, isShared, edits);
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
      return editVerdict(wake, edits);
    }
    if (!call.readable) {
      return card(`the gate can't read ${call.tool}`);
    }
    // A line that only reads runs whatever woke him; the tidy writes only
    // in a turn your words woke; anything else, and any line the gate cannot
    // read, is put to you, with the rule that sent it.
    if (
      readOnly(call.command) ||
      (yours(wake) && allowlisted(call.command, isShared))
    ) {
      return { kind: "allow" };
    }
    return card(shellAsk(call.command, wake, isShared));
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
        `[lead-gate] ${instanceId}: wake ended after ${wake.calls} call(s) (${yours(wake) ? "yours" : "external"})`
      );
    }
  };

  /** The calls a lead's message makes that read the web: their results make his wake external. */
  const calledWeb = (
    instanceId: string,
    content: readonly { type: string }[]
  ): void => {
    const context = webContext();
    for (const block of content) {
      const use = block as {
        id?: string;
        input?: unknown;
        name?: string;
        type: string;
      };
      if (
        use.type === "tool_use" &&
        use.id &&
        use.name &&
        readsWeb(
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          context
        )
      ) {
        wakeOf(instanceId).reading.add(use.id);
      }
    }
  };

  /** One of a lead's tool results: a web read's makes his wake external; a ran call's says its exit. */
  const resulted = (
    instanceId: string,
    block: {
      content: unknown;
      is_error?: boolean;
      structuredContent?: Record<string, unknown>;
      tool_use_id: string;
    }
  ): void => {
    const wake = wakes.get(instanceId);
    if (wake?.reading.delete(block.tool_use_id)) {
      wake.web = true;
      console.log(
        `[lead-gate] ${instanceId}: read web content; its wake is external from here`
      );
    }
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

  return {
    /**
     * Whether `requestId` is one of Caw's gated asks: only you answer those,
     * never a session.
     */
    owns: (requestId: string): boolean =>
      db.leadCalls.ofRequest(requestId) !== undefined,

    /**
     * A permission ask from `lead`, before it is parked: the gate's verdict,
     * or none for an ask that is not one of a lead's gated calls
     * ({@link isGated}; it parks as any ask). A replay of one already judged answers the same, and spends
     * nothing again. An edit's verdict waits on the project's gate.md read.
     */
    async decide(
      lead: InstanceRow,
      envelope: Envelope
    ): Promise<GateDecision | undefined> {
      const ask = envelope.payload as PermissionRequestFrame;
      const { requestId } = envelope;
      if (
        lead.role !== "lead" ||
        !lead.projectId ||
        !requestId ||
        !isGated(ask)
      ) {
        return;
      }
      const known = db.leadCalls.ofRequest(requestId);
      if (known) {
        return verdictOf(known);
      }
      const call = describe(lead, ask);
      let edits: CawEdits = { kind: "none" };
      if (call.kind === "edit") {
        reading.set(requestId, { instanceId: lead.id });
        // The read never throws: a failure is what gate.md says now.
        edits = await cawEdits(lead.projectId).catch(
          (error: unknown): CawEdits => ({
            kind: "unreadable",
            problems: [error instanceof Error ? error.message : String(error)],
          })
        );
        const over = reading.get(requestId)?.over ?? gone(envelope);
        reading.delete(requestId);
        if (over) {
          console.log(
            `[lead-gate] ${lead.id} ${ask.toolName} withdrawn while gate.md was read (${over}): not judged, not parked: ${shortly(call.command)}`
          );
          return { kind: "withdrawn", why: over };
        }
      }
      // A replay that came in while gate.md was read was judged by then.
      const judged = db.leadCalls.ofRequest(requestId);
      if (judged) {
        return verdictOf(judged);
      }
      const verdict = judge(lead, call, edits);
      const row: LeadCallRow = {
        id: crypto.randomUUID(),
        projectId: lead.projectId,
        instanceId: lead.id,
        threadId: thread(lead) ?? null,
        requestId,
        toolUseId: ask.toolUseId ?? null,
        tool: ask.toolName,
        command: call.command,
        files: call.files,
        writes: !(
          call.kind === "shell" &&
          call.readable &&
          allowlisted(call.command, true)
        ),
        outcome: OUTCOME_OF[verdict.kind],
        approved: false,
        why: whyOf(verdict),
        exit: null,
        at: new Date(),
      };
      db.leadCalls.add(row);
      console.log(
        `[lead-gate] ${lead.id} ${ask.toolName} ${verdict.kind}: ${shortly(call.command)}`
      );
      if (row.outcome === "refused") {
        noteOf(row);
      }
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

    /** The hub woke a lead with a send (caw.ts `wake`): your words alone, or outside text with them. */
    woke(uuid: string, source: WakeSource): void {
      sends.set(uuid, source);
      // One never read is let go with the oldest; unread, it says nothing.
      if (sends.size > SENDS_KEPT) {
        const [oldest] = sends.keys();
        if (oldest !== undefined) {
          sends.delete(oldest);
        }
      }
    },

    /** A lead's harness read a send: its wake is yours only while all it read is your words. */
    read(
      instance: InstanceRow,
      uuid: string,
      origin: NeutralOrigin | undefined
    ): void {
      if (instance.role !== "lead") {
        return;
      }
      const wake = wakeOf(instance.id);
      const woke = sends.get(uuid);
      sends.delete(uuid);
      if (
        woke === "owner" ||
        (woke === undefined && origin?.kind === "human")
      ) {
        wake.owner = true;
      } else {
        wake.outside = true;
        wake.source ??= woke ? SOURCE_WORDS[woke] : originWords(origin);
      }
    },

    /** A frame a lead's harness streamed: its web reads, its calls' results, its turn's end. */
    frame(instance: InstanceRow, neutral: NeutralMessage): void {
      if (instance.role !== "lead") {
        return;
      }
      if (neutral.type === "result") {
        wakeEnded(instance.id);
      } else if (neutral.type === "assistant") {
        calledWeb(instance.id, neutral.message.content);
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

export type LeadGate = ReturnType<typeof createLeadGate>;

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
