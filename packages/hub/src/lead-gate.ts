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
 *    "file a task". And anywhere, while the project keeps its sessions off
 *    other people's repositories (upstream.ts): a `gh`, `hub`, `glab` or
 *    `curl` that names another repository as the one it writes to (core
 *    upstream-guard.ts), refused with the guard's reason rather than put on
 *    your card. One whose target only the place's git remotes name is left
 *    to the place's shims, which read them as it runs.
 * 3. **Size**: an edit that would take the wake past {@link FILES_PER_WAKE}
 *    files, or touches a file that is not docs, config or assets by its path,
 *    is refused: "file a task".
 * 4. **Reads run**: a shell line that only reads ({@link readOnly}: readers
 *    and reading git, `git fetch` of a named remote among them, output only
 *    into `/dev/null` or another descriptor) runs without asking whatever
 *    woke him: it writes nothing in the tree, publishes nothing, and reaches
 *    no host the project does not name.
 * 5. **Wake source**: a turn whose every read send is the owner's message
 *    (a thread message, a view request, his own words straight into the
 *    session) with no outside text riding on it, and that has read no web
 *    content, also runs `git init`, `git add <paths>` and `git commit` where
 *    no one else works ({@link allowlisted}). Anything else (an edit, any
 *    other write, a line the gate cannot read; or those tidy writes in a turn
 *    an event, a routine, a report, a nudge, an inbox of outside events or a
 *    web read woke) raises the Approve card, the ask parked as any session's
 *    is.
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
  unboundedCommand,
} from "@cawco/core";
import {
  GUARDED_PROGRAMS,
  type UpstreamRule,
  upstreamRefusal,
  upstreamWrite,
} from "@cawco/core/upstream-guard";
import type { DbShape, LeadCallRow } from "./db";
import type { WebContext } from "./web-reads";
import { readsWeb } from "./web-reads";

/** The most shell or edit calls Caw makes in one wake. */
export const CALLS_PER_WAKE = 20;
/** The most files his edits touch in one wake. */
export const FILES_PER_WAKE = 5;
/** The wakes kept for their sends to be read ({@link createLeadGate}'s `woke`). */
const SENDS_KEPT = 2000;

/** What the gate answers a call: run it now, refuse it with words, or put it on your card. */
export type GateVerdict =
  { kind: "allow" } | { kind: "deny"; message: string } | { kind: "card" };

const GATED: ReadonlySet<string> = new Set([
  ...LEAD_GATED_TOOLS.claude,
  ...LEAD_GATED_TOOLS.opencode,
]);

// --- the shell, read -------------------------------------------------------

/** One shell line, read: its simple commands' words, and what makes it more than reading. */
interface ShellLine {
  /** A `$(…)`, backticks or `<(…)` / `>(…)`: commands run to make words. */
  readonly nested: string[];
  readonly segments: string[][];
  /**
   * It writes or leaves something running by its own syntax: a redirection
   * into a file (`>`, `>>`, `>|`, `&>` anywhere but `/dev/null`), a here
   * document or string, a process substitution, or a background `&`. A
   * redirection into `/dev/null`, one file descriptor onto another (`2>&1`)
   * and input from a file (`< notes.txt`) only read.
   */
  readonly writes: boolean;
}

/** A redirection's operator, at the `<` or `>` it starts with. */
const REDIRECT_OP = /^(?:<<<|<<-?|<>|<&|>>|>\||>&|<|>)/;
/** Where one file descriptor goes onto another, or is closed: `&1`'s `1`, `&-`'s `-`. */
const DESCRIPTOR = /^(?:\d+|-)$/;
/** A redirection's target ends at a blank or at what ends a command. */
const TARGET_END = /[ \t\n|;&()<>]/;
/** Where output may go and nothing is written. */
const DEV_NULL = "/dev/null";
/** An fd number written right before a redirection, as in `2>`. */
const FD_NUMBER = /^\d+$/;

const BLANK = /[ \t]/;

/** The text up to the `)` that closes the one at `from` (just past `(`), and where it ends. */
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
  writes = false;
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
    return {
      segments: this.segments.filter((words) => words.length > 0),
      nested: this.nested,
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
      this.nested.push(this.#text.slice(at + 1, end < 0 ? undefined : end));
      this.#add("`…`");
      return end < 0 ? this.#text.length : end;
    }
    const { inner, end } = closing(this.#text, at + 2);
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
        this.writes = true;
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
      // A process substitution: its commands are read as any nested ones.
      this.writes = true;
      const { inner, end } = closing(this.#text, at + 2);
      this.nested.push(inner);
      return end;
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
    if (!redirectReads(op, target)) {
      this.writes = true;
    }
    return end - 1;
  }
}

/**
 * Whether a redirection only reads: one descriptor onto another or closed
 * (`2>&1`, `>&2`, `<&-`), output into `/dev/null`, or input from a file. A
 * here document or string (`<<`, `<<<`) and `<>` are not read by the gate.
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

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
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
const SHELL_COMMAND_FLAG = /^-[a-zA-Z]*c[a-zA-Z]*$/;
const DURATION = /^\d/;

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
const LOOP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

/** A command line, read: every command it runs, and whether it is more than that. */
interface Commands {
  argvs: string[][];
  opaque: boolean;
  /** {@link ShellLine.writes}, of the line or any line nested in it. */
  writes: boolean;
}

/** What a simple command runs besides itself: a shell's `-c` script, `eval`'s words; `opaque` when that cannot be read. */
const innerScript = (
  name: string,
  words: string[]
): { opaque: boolean; script?: string } => {
  if (SHELLS.has(name)) {
    const flag = words.findIndex((word) => SHELL_COMMAND_FLAG.test(word));
    const script = flag >= 0 ? words[flag + 1] : undefined;
    // A shell reading a script file or its input: what it runs is unseen.
    return script === undefined ? { opaque: true } : { opaque: false, script };
  }
  if (name === "eval") {
    return { opaque: false, script: words.slice(1).join(" ") };
  }
  return { opaque: name === "source" || name === "." };
};

/** Whether a program's own word could not be read: a variable or a substitution names it. */
const unreadable = (program: string): boolean =>
  program.includes("$(…)") ||
  program.includes("`…`") ||
  program.startsWith("$");

const commandsOf = (command: string, depth = 0): Commands => {
  if (depth > 4) {
    return { argvs: [], opaque: true, writes: true };
  }
  const line = readShell(command);
  const read: Commands = {
    argvs: [],
    opaque: false,
    writes: line.writes,
  };
  const take = (inner: string) => {
    const more = commandsOf(inner, depth + 1);
    read.argvs.push(...more.argvs);
    read.opaque ||= more.opaque;
    read.writes ||= more.writes;
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
    read.opaque ||= inner.opaque || unreadable(program);
    if (inner.script !== undefined) {
      take(inner.script);
    }
    read.argvs.push(words);
  }
  return read;
};

// --- git -------------------------------------------------------------------

/** git's global options that take the next word as their value. */
const GIT_VALUED: ReadonlySet<string> = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix",
  "--list-cmds",
]);
/** git's global options that can make it run a command or read another repository. */
const GIT_RISKY_GLOBAL =
  /^(?:-c|--config-env|--exec-path|--git-dir|--work-tree|-C)(?:=|$)/;

/** A git command line's subcommand and its arguments, and whether a global option before it is risky. */
const gitOf = (
  argv: string[]
): { args: string[]; risky: boolean; sub: string } | undefined => {
  if (baseName(argv[0] ?? "") !== "git") {
    return;
  }
  let risky = false;
  for (let at = 1; at < argv.length; at += 1) {
    const word = argv[at] as string;
    if (GIT_RISKY_GLOBAL.test(word)) {
      risky = true;
    }
    if (GIT_VALUED.has(word)) {
      at += 1;
      continue;
    }
    if (word.startsWith("-")) {
      continue;
    }
    return { sub: word, args: argv.slice(at + 1), risky };
  }
};

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
  /^(?:-[a-zA-Z]*A[a-zA-Z]*|--all|--no-ignore-removal|\.|\.\/|:\/|:|\*)$/;

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
  "show",
  "blame",
  "ls-files",
  "ls-tree",
  "rev-parse",
  "describe",
  "shortlog",
  "grep",
  "cat-file",
  "rev-list",
  "show-ref",
  "whatchanged",
  "reflog",
]);
/** `git branch` and `git tag` options that only list. */
const LISTS =
  /^(?:-a|--all|-r|--remotes|-v|-vv|--verbose|-l|--list|--show-current|-i|--ignore-case|--column|--no-column|--contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format|(?:--contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format)=.*|-n\d*)$/;
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
/** Arguments that make a reading git command write a file. */
const WRITES_OUTPUT = /^--output(?:=|$)|^-o$/;
/** `git config`'s options that only read. */
const CONFIG_READS = /^(?:--get|--get-all|--get-regexp|--list|-l)$/;
/**
 * `git fetch`'s options that change nothing but its remote-tracking refs:
 * none runs a program (`--upload-pack`), recurses into submodules or writes
 * a local branch.
 */
const FETCH_FLAGS =
  /^(?:-q|--quiet|-v|--verbose|-p|--prune|-P|--prune-tags|-t|--tags|-n|--no-tags|--all|--multiple|--dry-run|--progress|--no-progress|--no-recurse-submodules|--no-write-fetch-head|--depth=\d+|--deepen=\d+|--shallow-since=\S+|--shallow-exclude=\S+|--unshallow)$/;
/** A configured remote's name: never a URL or a path, which would reach a host the project does not name. */
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** A ref to fetch, into FETCH_HEAD and the remote-tracking refs only: no `:<dst>` naming a local branch to write. */
const FETCH_REF = /^\+?[A-Za-z0-9][A-Za-z0-9._/-]*$/;

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

/** Whether a git command line only reads, or, in a place no one else uses, is `git init`, `git add <paths>` or `git commit`. */
const gitAllowed = (argv: string[], shared: boolean): boolean =>
  gitReadOnly(argv) || gitTidy(argv, shared);

/** Whether a git command line only reads (`git fetch` of a named remote among them). */
const gitReadOnly = (argv: string[]): boolean => {
  const git = gitOf(argv);
  return (
    !!git &&
    !git.risky &&
    !git.args.some((arg) => WRITES_OUTPUT.test(arg)) &&
    gitReads(git)
  );
};

/** Whether a git command line is `git init`, `git add <paths>` or `git commit`, in a place no one else uses. */
const gitTidy = (argv: string[], shared: boolean): boolean => {
  const git = gitOf(argv);
  return !(shared || !git || git.risky) && gitTidies(git);
};

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
      return git.args.every((arg) => arg === "-v" || arg === "--verbose");
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
  /^-(?:exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/;

/** `tail`'s options that keep it running after the file's end. */
const FOLLOWS = /^(?:-f|-F|--follow(?:=.*)?|--retry)$/;
/** `sort`'s options that write a file or run a program. */
const SORT_ACTS = /^(?:-o|--output(?:=.*)?|--compress-program(?:=.*)?)$/;
/** `file`'s options that write a compiled magic file. */
const FILE_ACTS = /^(?:-C|--compile)$/;
/** `tree`'s options that write its listing into a file. */
const TREE_ACTS = /^(?:-o|--output(?:=.*)?)$/;
/** `date`'s options that set the clock. */
const DATE_ACTS = /^(?:-s|--set(?:=.*)?)$/;

/** A program that only reads whatever it is given. */
const onlyReads = (): boolean => true;

/** The words of a command that are not options. */
const operands = (args: string[]): string[] =>
  args.filter((arg) => !arg.startsWith("-"));

/**
 * The programs that only read, or print what they are given, each with what
 * of its arguments would make it write, run something or keep running.
 */
const READERS: Readonly<Record<string, (args: string[]) => boolean>> = {
  ls: onlyReads,
  cat: onlyReads,
  grep: onlyReads,
  wc: onlyReads,
  head: onlyReads,
  find: (args) => !args.some((arg) => FIND_ACTS.test(arg)),
  echo: onlyReads,
  printf: onlyReads,
  tr: onlyReads,
  cut: onlyReads,
  pwd: onlyReads,
  true: onlyReads,
  false: onlyReads,
  test: onlyReads,
  "[": onlyReads,
  tail: (args) => !args.some((arg) => FOLLOWS.test(arg)),
  sort: (args) => !args.some((arg) => SORT_ACTS.test(arg)),
  // A second operand is the file uniq writes its output to.
  uniq: (args) => operands(args).length <= 1,
  file: (args) => !args.some((arg) => FILE_ACTS.test(arg)),
  stat: onlyReads,
  du: onlyReads,
  df: onlyReads,
  tree: (args) => !args.some((arg) => TREE_ACTS.test(arg)),
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
  date: (args) => !args.some((arg) => DATE_ACTS.test(arg)),
  whoami: onlyReads,
  id: onlyReads,
  uname: onlyReads,
};

/** Whether every command of a line passes `allowed`, nothing in it writes by its syntax, and it can all be read. */
const every = (
  command: string,
  allowed: (argv: string[], name: string) => boolean
): boolean => {
  const read = commandsOf(command);
  if (read.opaque || read.writes || read.argvs.length === 0) {
    return false;
  }
  return read.argvs.every((argv) => allowed(argv, baseName(argv[0] ?? "")));
};

/** Whether one command is a {@link READERS} reader within its limits. */
const reads = (argv: string[], name: string): boolean => {
  const reader = READERS[name];
  return reader ? reader(argv.slice(1)) : false;
};

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
  every(
    command,
    (argv, name) => reads(argv, name) || (name === "git" && gitReadOnly(argv))
  );

/**
 * Whether a shell line is one a turn your words woke runs without asking:
 * {@link readOnly}, or, in a place no one else uses, `git init`,
 * `git add <paths>` or `git commit` among its reading commands.
 */
export const allowlisted = (command: string, shared: boolean): boolean =>
  every(
    command,
    (argv, name) =>
      reads(argv, name) || (name === "git" && gitAllowed(argv, shared))
  );

/** What in a shell line is refused in a shared checkout, in words; none when nothing is. */
export const sharedRefusal = (command: string): string | undefined =>
  sharedDenial(commandsOf(command).argvs);

/**
 * Why a shell line does not run under the project's upstream rule: the
 * guard's reason for the first `gh`, `hub`, `glab` or `curl` it runs that
 * names another repository; none when none does. The place's remotes are
 * not read here (it is on its machine): what only they name is the place's
 * shims' to judge.
 */
export const upstreamDenial = (
  command: string,
  rule: UpstreamRule,
  env: Readonly<Record<string, string | undefined>> = {}
): string | undefined => {
  for (const argv of commandsOf(command).argvs) {
    const [program = "", ...args] = argv;
    if (!GUARDED_PROGRAMS.includes(baseName(program))) {
      continue;
    }
    const call = { program, args, env, cwdRemotes: () => [] };
    // A query the hub cannot read (a file on the place's machine) is the
    // place's shims' to read as the call runs.
    if (upstreamWrite(call)?.unread) {
      continue;
    }
    const refused = upstreamRefusal(rule, call);
    if (refused) {
      return refused;
    }
  }
};

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
    if (git?.sub === "add") {
      named(git.args);
    } else if (CHANGERS.has(baseName(argv.at(0) ?? ""))) {
      named(argv.slice(1));
    }
  }
  return [...new Set(files)];
};

// --- edits -----------------------------------------------------------------

/** The files an edit call names: Claude's `file_path`/`notebook_path`, OpenCode's `filepath` or its resources. */
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

const DOC = /\.(?:md|mdx|markdown|txt|rst|adoc|asciidoc|org)$/i;
const CONFIG =
  /\.(?:json|jsonc|json5|ya?ml|toml|ini|cfg|conf|properties|plist|env\.example|editorconfig)$/i;
const CONFIG_NAMES =
  /^(?:\.gitignore|\.gitattributes|\.editorconfig|\.npmrc|\.nvmrc|\.node-version|\.tool-versions|\.prettierrc|\.prettierignore|CODEOWNERS|LICENSE|NOTICE|AUTHORS|CHANGELOG|README)$/;
const ASSET =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|icns|bmp|tiff?|heic|mp3|wav|ogg|m4a|mp4|mov|webm|woff2?|ttf|otf|pdf)$/i;
/** Top-level folders a project keeps docs, config and assets in, by the usual names. */
const KEPT_DIRS =
  /^(?:docs?|documentation|assets|static|public|images|img|media|fonts|design|config|\.github)\//;

/**
 * Whether a file, by its path in the place, is docs, config or assets: by
 * its extension or name (Markdown and text, JSON/YAML/TOML and the dotfiles
 * that configure tools, images, media and fonts), or a folder the project
 * keeps them in. Never anything under `.git`, and nothing outside the place.
 */
export const docsConfigOrAsset = (relative: string): boolean => {
  if (
    relative.startsWith("../") ||
    relative === ".." ||
    relative.startsWith(".git/") ||
    isAbsolute(relative)
  ) {
    return false;
  }
  const name = posix.basename(relative);
  return (
    DOC.test(name) ||
    CONFIG.test(name) ||
    CONFIG_NAMES.test(name) ||
    ASSET.test(name) ||
    KEPT_DIRS.test(relative)
  );
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
  /** It read web content: a result of a call that reads the web came back. */
  web: boolean;
}

const fresh = (): Wake => ({
  calls: 0,
  files: new Set(),
  outside: false,
  owner: false,
  reading: new Set(),
  web: false,
});

export interface LeadGateDeps {
  readonly db: Pick<DbShape, "leadCalls">;
  /** A note in the thread the lead's turn answers (caw.ts `noteCall`). */
  readonly note: (instanceId: string, note: ThreadNote) => void;
  /** Whether the lead's place is a shared checkout: one another live session uses, or the project's folder on the hub. */
  readonly shared: (lead: InstanceRow) => boolean;
  /** The thread the lead's turn answers now (caw.ts `askThread`). */
  readonly thread: (lead: InstanceRow) => string | undefined;
  /** The lead's project's upstream rule (upstream.ts). */
  readonly upstream: (lead: InstanceRow) => UpstreamRule;
  /** What a web read is judged by (web-reads.ts). */
  readonly webContext: () => WebContext;
}

/** A command or file as a note's title names it: its first line, cut. */
const shortly = (text: string): string => {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

const EXIT_CODE = /Exit code (\d+)/;

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
  shell: boolean;
}

/** Whether a wake is yours: it read your words and nothing from outside, and no web content. */
const yours = (wake: Wake): boolean => wake.owner && !wake.outside && !wake.web;

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

/** Why an edit is refused by its size or its files, or nothing. */
const editDenied = (call: Call, wake: Wake): string | undefined => {
  const outside = call.files.filter((file) => !docsConfigOrAsset(file));
  if (call.files.length === 0 || outside.length > 0) {
    return `${outside.join(", ") || "That file"} is not docs, config or assets: your edits are docs, config and assets only. File a task.`;
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

/** A call's row, read back, as the verdict its replay gets. */
const verdictOf = (row: LeadCallRow): GateVerdict => {
  switch (row.outcome) {
    case "refused":
      return { kind: "deny", message: row.why ?? "Refused." };
    case "denied":
      return { kind: "deny", message: "The person denied this call." };
    case "ran":
      return { kind: "allow" };
    default:
      return { kind: "card" };
  }
};

/** What a ran call's note says of how it went. */
const ranBody = (row: LeadCallRow, shell: boolean): string => {
  const approved = row.approved ? " · you approved it" : "";
  if (shell) {
    const files = row.files.length > 0 ? ` · ${row.files.join(", ")}` : "";
    return `Exit ${row.exit ?? "not reported"}${approved}${files}`;
  }
  return `${row.exit === "failed" ? "Did not apply" : "Applied"}${approved}`;
};

/** A call's note in its thread, by its outcome; none while it waits on your card. */
const noteFor = (row: LeadCallRow): ThreadNote | undefined => {
  const what = shortly(row.command);
  const shell = LEAD_SHELL_TOOLS.has(row.tool);
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
        title: shell ? `Caw · ran \`${what}\`` : `Caw · edited ${what}`,
        body: ranBody(row, shell),
        event: { kind: "caw", what: shell ? "ran" : "edited", command: what },
      };
    default:
      return;
  }
};

/** A line a lead's place's guard said (agent boundary.ts `PLACE_GUARD`). */
const GUARD_LINE = /^cawco place-guard: .+$/gm;

/** What a call's result says its place's guard found: each line, without its tag. */
const guardLines = (text: string): string[] =>
  (text.match(GUARD_LINE) ?? []).map((line) =>
    line.slice("cawco place-guard: ".length)
  );

/** A ran call's exit, from its result: a shell's code, an edit's `ok` or `failed`. */
const exitOf = (
  row: LeadCallRow,
  block: { content: unknown; is_error?: boolean }
): string => {
  if (!LEAD_SHELL_TOOLS.has(row.tool)) {
    return block.is_error ? "failed" : "ok";
  }
  if (!block.is_error) {
    return "0";
  }
  return EXIT_CODE.exec(resultText(block.content))?.[1] ?? "failed";
};

export const createLeadGate = ({
  db,
  note,
  shared,
  thread,
  upstream,
  webContext,
}: LeadGateDeps) => {
  /** Each lead's wake under way, by session. */
  const wakes = new Map<string, Wake>();
  /** What each send the hub woke a lead with was: your words alone, or outside text, by its uuid (caw.ts `wake`). */
  const sends = new Map<string, "owner" | "outside">();
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
    const shell = LEAD_SHELL_TOOLS.has(ask.toolName);
    if (shell) {
      const command = unboundedCommand(
        typeof ask.input.command === "string" ? ask.input.command : ""
      );
      return { shell, command, files: shellFiles(command) };
    }
    const files = editFiles(ask.input).map((file) => inPlace(lead.cwd, file));
    return { shell, command: files.join(", "), files };
  };

  /** The verdict on one of a lead's calls, from the rules in order: budget, shared checkout and upstream, size, wake source. */
  const judge = (lead: InstanceRow, call: Call): GateVerdict => {
    const wake = wakeOf(lead.id);
    wake.calls += 1;
    const isShared = shared(lead);
    const refused =
      overBudget(wake) ??
      (call.shell
        ? (sharedDenied(call, isShared) ??
          upstreamDenial(call.command, upstream(lead)))
        : editDenied(call, wake));
    if (refused) {
      return { kind: "deny", message: refused };
    }
    if (!call.shell) {
      for (const file of call.files) {
        wake.files.add(file);
      }
    }
    // A line that only reads runs whatever woke him; the tidy writes only
    // in a turn your words woke; anything else is put to you.
    if (
      call.shell &&
      (readOnly(call.command) ||
        (yours(wake) && allowlisted(call.command, isShared)))
    ) {
      return { kind: "allow" };
    }
    return { kind: "card" };
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
    block: { content: unknown; is_error?: boolean; tool_use_id: string }
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
     * or none for an ask that is not a lead's shell or edit call (it parks as
     * any ask). A replay of one already judged answers the same, and spends
     * nothing again.
     */
    decide(lead: InstanceRow, envelope: Envelope): GateVerdict | undefined {
      const ask = envelope.payload as PermissionRequestFrame;
      const { requestId } = envelope;
      if (
        lead.role !== "lead" ||
        !lead.projectId ||
        !requestId ||
        !GATED.has(ask.toolName)
      ) {
        return;
      }
      const known = db.leadCalls.ofRequest(requestId);
      if (known) {
        return verdictOf(known);
      }
      const call = describe(lead, ask);
      const verdict = judge(lead, call);
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
        writes: !(call.shell && allowlisted(call.command, true)),
        outcome: OUTCOME_OF[verdict.kind],
        approved: false,
        why: verdict.kind === "deny" ? verdict.message : null,
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
    woke(uuid: string, kind: "owner" | "outside"): void {
      sends.set(uuid, kind);
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

    /** A lead's process ended: its wake with it. */
    ended(instanceId: string): void {
      wakes.delete(instanceId);
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
