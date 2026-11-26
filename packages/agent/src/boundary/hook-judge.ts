/**
 * A workspace's PreToolUse hook and what it asks: the hook's script, the claude
 * shell prefix, the scripts and arguments of the judge (`judge-process.ts`
 * starts it), and the judge's answers.
 */

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { boundedRead, type Unanswered } from "@cawco/core/effect/bounded";
import { timedEffect } from "@cawco/core/effect/timed";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { workspaceClaudeTmpDir } from "@cawco/core/paths/workspace";
import { hostEnvironment } from "@cawco/core/session-env";
import { shellQuote } from "@cawco/core/shell-quote";
import { systemProgram } from "@cawco/core/workspace-needs";
import { Deferred, Effect, Result } from "effect";
import { bunScriptRuntime } from "../bun-runtime";
import { runPromise } from "../daemon-runtime";
import { JUDGE_FORM_LENGTH } from "../proc-id";
import {
  JUDGE_ALLOWS,
  JUDGE_ANSWER_END,
  JUDGE_ANSWER_END_PERL,
  JUDGE_BUILD_QUESTION,
  JUDGE_NO_PREFIX,
  JUDGE_REFUSES,
  type JudgeArgs,
} from "./protocol";
import { scriptText } from "./shims";
import { refusal, stateDir } from "./state";

/** Claude Code's own limit on the boundary hook, in seconds; its default is 600. */
// @limit recording: agent.boundary-judge-answer-ms until 2026-12-03
export const HOOK_TIMEOUT_S = 90;

/**
 * How long the hook waits for the judge's answer before it refuses the call.
 * Under {@link HOOK_TIMEOUT_S}, with 10s to spare: Claude Code lets the call
 * through when it times a hook out ("A timed-out `command`… hook doesn't
 * block the tool call", code.claude.com/docs/en/hooks#timeouts), so the hook
 * always answers first. The judge answers in under a millisecond; the hook
 * takes 2–4ms on obelisk.
 */
// @limit measured: HOOK_TIMEOUT_S less 10 s, so the judge answers before its hook is killed
const HOOK_LIMIT_S = HOOK_TIMEOUT_S - 10;

/**
 * How the hook's refusal of a call it waited {@link HOOK_LIMIT_S} on begins.
 * That refusal stops only the one call. The model reads the line and runs the
 * command again, and the work item goes on (claude.ts `#watchBoundary`).
 */
const BOUNDARY_HOOK_SLOW = "cawco: the boundary hook took longer than";

/**
 * The perl the hook runs on, as the agent's PATH finds it (core
 * workspace-needs.ts). The runner already runs every command of a workspace
 * through it, on Linux and macOS alike.
 */
export const perl = (): string => systemProgram("perl");

/** `value` as a single-quoted perl string. */
export const perlQuote = (value: string): string =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

/** A workspace's judge, as its hook reaches it. */
export interface JudgeAt {
  /** Its socket's address, packed by perl's `Socket` on this machine, in hex. */
  readonly address: string;
  readonly socket: string;
}

/**
 * The workspace's PreToolUse hook, run before every tool call it is matched
 * to (launched-hook.ts `HOOKED_TOOLS`). It hands the call to the workspace's judge
 * (`boundary-judge.ts`, judge-process.ts `judgeFor`), with the shell prefix its CLI runs
 * under (`CLAUDE_CODE_SHELL_PREFIX`, from the CLI's environment, which a
 * settings file's `env` changes), and says what the judge answered: for a
 * shell call no decision, so the CLI's own permission rules judge the
 * command as the model wrote it, when the prefix is the workspace's
 * ({@link claudePrefixScript}), and a refusal otherwise; for every other
 * call its paths judged by the workspace's policy. A Bun started for every
 * call cost each one a process start a loaded Mac takes long to schedule;
 * the judge starts once, and the hook is perl with nothing to load.
 *
 * What the hook reads is never a prefix the CLI does not wrap with. Claude
 * Code 2.1.302 wraps a Bash call by its own environment
 * (`gt=a.CLAUDE_CODE_SHELL_PREFIX;if(gt)Dt=Npe(gt,Dt)`), and starts a hook
 * with that environment and its settings' env for children over it
 * (`os()`: `i={...process.env}; for (… of settingsEnvForChildren) i[…]=…`).
 * So a settings file's empty prefix that the CLI takes, into its own
 * environment or only its children's, reaches the hook, and the judge
 * refuses the call; one the CLI drops (a delegate's CLI on the host kept the
 * prefix its host set, r175) leaves the workspace's in both.
 *
 * A CLI whose environment names no prefix at all predates the prefix: every
 * CLI a build since launches has it set (claude.ts `sessionEnv`), and a
 * settings file gives a variable a string, never takes one away. The hook
 * says so (`-` for the prefix), and the judge runs that CLI's shell call
 * inside the boundary the way the build before did, by rewriting it, so a
 * turn running across a deploy goes on; the CLI is relaunched onto the
 * prefix as that turn ends (launched-hook.ts `hookFailsOpen`).
 *
 * The CLI runs it in exec form, never through the prefix it judges, and
 * blocks the call on any failure of it, a script that cannot start, a crash
 * or a timeout among them (`onFailure: "block"`,
 * launched-hook.ts `claudeBoundaryOptions`). It exits 0 only when the judge allowed the
 * call and its answer reached the CLI whole, and 2 otherwise, a perl error
 * too: a judge that is not there or answers nothing, and an answer not in by
 * {@link HOOK_LIMIT_S} ({@link BOUNDARY_HOOK_SLOW}), each refuse that call
 * alone, in words the model reads. Each refusal's first line names the hook,
 * so a failure the CLI reports is known as this one's.
 *
 * It runs as `perl -T`, which reads no module path or switch from the
 * environment, and loads no module: the socket's address is packed by perl's
 * `Socket` as the agent writes the hook ({@link socketAddress}), and AF_UNIX
 * and SOCK_STREAM are 1 on Linux and macOS alike. The call's JSON goes over
 * on one line (a line break in JSON is whitespace or invalid), the prefix on
 * the next, in hex, or `-` when the CLI's environment names none. The answer
 * is read up to the judge's end mark (protocol.ts `JUDGE_ANSWER_END`), or the
 * connection's end, whichever comes first: never the end alone, which on
 * macOS at times never came once the answer was written.
 */
export const hookScript = (
  id: string,
  hook: string,
  judge: JudgeAt
): string => `#!${perl()} -T
# CawCo workspace ${id}: the PreToolUse hook its claude sessions run before each
# tool call. It asks the workspace's judge and says what it answered. Any
# status but 0 refuses the call (exit 2).
$hook = ${perlQuote(hook)};
$judge = ${perlQuote(judge.socket)};
sub refuse { print STDERR "cawco boundary hook $hook\\n@_\\n"; exit 2 }
$SIG{__DIE__} = sub { refuse("cawco: the boundary hook failed (@_), so this call did not run") };
$SIG{ALRM} = sub { refuse(${perlQuote(`${BOUNDARY_HOOK_SLOW} ${HOOK_LIMIT_S}s on a loaded machine, so this call did not run. Run it again.`)}) };
$SIG{PIPE} = 'IGNORE';
alarm ${HOOK_LIMIT_S};
$call = do { local $/; <STDIN> };
refuse("cawco: the call reached the boundary hook with no input, so it did not run") unless length $call;
$call =~ tr/\\r\\n/  /;
$prefix = defined $ENV{CLAUDE_CODE_SHELL_PREFIX} ? unpack('H*', $ENV{CLAUDE_CODE_SHELL_PREFIX}) : '${JUDGE_NO_PREFIX}';
socket(JUDGE, 1, 1, 0) or refuse("cawco: the boundary hook could not open a socket ($!), so this call did not run");
connect(JUDGE, pack('H*', '${judge.address}')) or refuse("cawco: the workspace's judge at $judge did not answer ($!), so this call did not run");
select((select(JUDGE), $| = 1)[0]);
print JUDGE $call, "\\n", $prefix, "\\n" or refuse("cawco: the call could not be handed to the workspace's judge at $judge ($!), so it did not run");
$answer = do { local $/ = "${JUDGE_ANSWER_END_PERL}"; <JUDGE> };
defined $answer or refuse("cawco: the workspace's judge at $judge answered nothing, so this call did not run");
$answer =~ s/${JUDGE_ANSWER_END_PERL}\\z//;
close JUDGE;
$answer =~ /\\A([${JUDGE_ALLOWS}${JUDGE_REFUSES}])\\n/ or refuse("cawco: the workspace's judge at $judge answered nothing, so this call did not run");
$allowed = $1 eq '${JUDGE_ALLOWS}';
$said = substr($answer, 2);
refuse($said) unless $allowed;
print STDOUT $said or refuse("cawco: the judge's answer could not be written ($!), so this call did not run");
close STDOUT or refuse("cawco: the judge's answer could not be written ($!), so this call did not run");
exit 0;
`;

/** A workspace's {@link claudePrefixScript}, beside its hook and executor in the state dir, which nothing inside the boundary writes. */
export const claudePrefixOf = (id: string): string =>
  join(stateDir(id), "claude-prefix");

/**
 * The shell prefix a claude session of the workspace runs under
 * (`CLAUDE_CODE_SHELL_PREFIX`, claude.ts `sessionEnv`): "Command prefix that
 * wraps shell commands Claude Code spawns: Bash tool calls, hook commands,
 * status line commands, and stdio MCP server startup commands"
 * (code.claude.com/docs/en/env-vars). The CLI applies it after its permission
 * rules have judged the call, so every rule a person, repository or
 * organisation wrote matches the command as the model wrote it, and every
 * one of those commands runs inside the boundary (exec.ts `execScript`'s
 * `--claude`). It is a script with no flag of its own: Claude Code 2.1.302
 * splits a prefix at its last " -" for a Bash call, but spawns the whole
 * value as one program for a stdio MCP server (`posix_spawn '<path>
 * --claude'` failed ENOENT), and hands each of them its command as one
 * argument.
 */
export const claudePrefixScript = (
  id: string,
  exec: string
): string => `#!${systemProgram("bash")}
# CawCo workspace ${id}: the shell prefix its claude sessions run every shell
# command through (CLAUDE_CODE_SHELL_PREFIX), inside the workspace's boundary.
exec ${shellQuote(exec)} --claude "$1"
`;

const HEX = /^[0-9a-f]+$/u;

/**
 * `socket`'s address as perl's `Socket` packs it on this machine, in hex: the
 * hook connects with it and loads no module of its own ({@link hookScript}).
 * Refuses the workspace when perl cannot pack it, rather than writing a hook
 * that refuses every call.
 */
export const socketAddress = async (
  id: string,
  socket: string
): Promise<string> => {
  const packed = await packedSocketAddress(socket);
  if (!packed.ok) {
    throw refusal(
      id,
      `${perl()} could not pack its judge's socket address (${packed.why})`
    );
  }
  return packed.address;
};

/**
 * `socket`'s address as perl's `Socket` packs it on this machine, in hex,
 * or why perl could not pack it: what a hook with no module of its own
 * connects with ({@link socketAddress}; agy's, harnesses/agy-hook.ts).
 */
export const packedSocketAddress = async (
  socket: string
): Promise<
  | { readonly ok: true; readonly address: string }
  | { readonly ok: false; readonly why: string }
> => {
  const packed =
    await Bun.$`${perl()} -MSocket -e ${'print unpack("H*", pack_sockaddr_un($ARGV[0]))'} ${socket}`
      .env(hostEnvironment())
      .quiet()
      .nothrow();
  const address = packed.stdout.toString();
  return packed.exitCode === 0 && HEX.test(address)
    ? { ok: true, address }
    : {
        ok: false,
        why: packed.stderr.toString().trim() || `status ${packed.exitCode}`,
      };
};

/**
 * {@link bunScriptRuntime} for workspace `id`'s boundary scripts. Refuses the
 * workspace when it is not there, rather than writing a hook that refuses
 * every command.
 */
export const bunRuntime = async (id: string): Promise<string> => {
  const runtime = bunScriptRuntime();
  await access(runtime, constants.X_OK).catch(() => {
    throw refusal(
      id,
      `${runtime} is not there, so its boundary scripts could not run`
    );
  });
  return runtime;
};

/** The judge's file name in a workspace's state dir: `@cawco/core/workspace-judge`, as a plain Bun script. */
export const JUDGE_SCRIPT = "workspace-judge.ts";

/** The judge server's file name in a workspace's state dir, beside {@link JUDGE_SCRIPT}. */
export const JUDGE_SERVER = "boundary-judge.ts";

/**
 * The judge's three scripts as this build runs them: the judge beside it,
 * the server, and the protocol the server loads from beside it.
 */
export const judgeScripts = (): Promise<[string, string, string]> =>
  Promise.all([
    scriptText(
      "boundary/workspace-judge.ts",
      join(import.meta.dir, "..", "..", "..", "core", "src", JUDGE_SCRIPT)
    ),
    scriptText("boundary/judge.ts", join(import.meta.dir, "..", JUDGE_SERVER)),
    scriptText("boundary/protocol.ts", join(import.meta.dir, "protocol.ts")),
  ]);

/**
 * The build a judge runs, as it says it ({@link JUDGE_BUILD_QUESTION}): its
 * three scripts, hashed. Handed to each judge as it starts.
 */
// @limit measured: 16 hex characters are 64 bits of SHA-256; the judge builds one machine holds, so two collide after about 2^32 names
export const judgeBuildOf = ([judgeText, serverText, protocolText]: [
  string,
  string,
  string,
]): string =>
  createHash("sha256")
    .update([serverText, judgeText, protocolText].join("\0"))
    .digest("hex")
    .slice(0, JUDGE_FORM_LENGTH);

/** What a workspace's judge is handed besides its socket and its build. */
export type JudgeHanded = Omit<JudgeArgs, "socket" | "build">;

/**
 * What workspace `id`'s judge is handed besides its socket and its build
 * (protocol.ts `judgeArgv`), for the executor at `exec`, the hook at `hook` and
 * the policy at `policy`.
 */
export const judgeHanded = (
  id: string,
  exec: string,
  hook: string,
  policy: string
): JudgeHanded => ({
  hook,
  graceS: String(HOOK_TIMEOUT_S),
  exec,
  prefix: claudePrefixOf(id),
  claudeTmp: workspaceClaudeTmpDir(id),
  policyFile: policy,
  cat: systemProgram("cat"),
  rm: systemProgram("rm"),
});

/** The judge socket a workspace's hook names ({@link hookScript}'s `$judge`). */
const HOOK_JUDGE = /^\$judge = '((?:[^'\\]|\\.)*)';$/mu;

/**
 * What the judge at `socket` answers to {@link JUDGE_BUILD_QUESTION}, word
 * for word, or why it answered nothing; {@link Unanswered} when it said
 * nothing in as long as a hook gives it ({@link HOOK_LIMIT_S}). Its
 * connection is closed once the answer is whole, or the read let go.
 */
const judgeSays = (socket: string): Effect.Effect<string, Unanswered> =>
  timedEffect(
    boundedRead(
      HOOK_LIMIT_S * 1000,
      Effect.gen(function* () {
        const answer = yield* Deferred.make<string>();
        const said = (words: string) =>
          Deferred.doneUnsafe(answer, Effect.succeed(words));
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const chunks: Buffer[] = [];
            const connection = createConnection(socket);
            connection.on("connect", () => {
              connection.write(`${JUDGE_BUILD_QUESTION}\n`);
            });
            // Its answer is whole at its end mark (protocol.ts
            // `JUDGE_ANSWER_END`), or at the connection's end, which a judge on
            // macOS at times never sent.
            connection.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
              const read = Buffer.concat(chunks);
              const end = read.indexOf(JUDGE_ANSWER_END);
              if (end >= 0) {
                said(read.subarray(0, end).toString("utf8"));
              }
            });
            connection.on("end", () => {
              said(Buffer.concat(chunks).toString("utf8"));
            });
            connection.on("error", (error) => {
              said(`nothing (${error.message})`);
            });
            return connection;
          }),
          (connection) => Effect.sync(() => connection.destroy())
        );
        return yield* Deferred.await(answer);
      }).pipe(Effect.scoped)
    ),
    (ms) => recordLimitReading("agent.boundary-judge-answer-ms", ms)
  );

/** A judge's answer, or that it gave none in time, in words a law's line quotes. */
const judgeWords = (read: Result.Result<string, Unanswered>): string =>
  Result.isSuccess(read) ? read.success : `no answer within ${HOOK_LIMIT_S} s`;

/** A judge's socket file name (`judgeFor`): its form. */
export const JUDGE_SOCKET = /^judge-([0-9a-f]+)\.sock$/u;

/** What workspace `id`'s hook's judge answers now. */
export interface JudgeAnswer {
  /** Whether it answers as this build's judge. */
  readonly answers: boolean;
  /** The socket its hook names, if any. */
  readonly socket: string | undefined;
  /** What it said, in words a log line quotes. */
  readonly words: string;
}

/** Asks the judge workspace `id`'s hook names which build it runs ({@link JUDGE_BUILD_QUESTION}). */
export const judgeAnswer = (id: string, build: string): Promise<JudgeAnswer> =>
  // The promise edge of the judge's answer (looks.ts).
  runPromise(
    Effect.gen(function* () {
      const hook = yield* Effect.promise(() =>
        readFile(join(stateDir(id), "hook"), "utf8").catch(() => "")
      );
      const socket = HOOK_JUDGE.exec(hook)?.[1];
      if (!socket) {
        return { answers: false, socket, words: "its hook names no judge" };
      }
      const read = yield* Effect.result(judgeSays(socket));
      return {
        answers:
          Result.isSuccess(read) &&
          read.success === `${JUDGE_ALLOWS}\n${build}`,
        socket,
        words: `its hook's judge at ${socket} answered ${JSON.stringify(judgeWords(read))}`,
      };
    })
  );
