/**
 * The one `PreToolUse` hook CawCo writes into an agy home
 * (`<gemini-dir>/config/hooks.json`), and the server that answers it for one
 * session. agy runs the hook before every tool call of every session the
 * home holds, its subagents' included (the project's
 * `assets/b3380ec3/agy-harness-parity.md` §P-j); the hook hands the call to
 * its session's judge and prints the judge's answer (agy-judge.ts).
 *
 * The hook knows its session by construction. An agy home is an account's,
 * shared by that account's sessions, and each session is an `agy acp`
 * process of its own, started with its judge's socket in its environment
 * ({@link agyJudgeEnv}). agy hands a hook its own environment
 * (`assets/338276e4/p0a.calls.jsonl`: the hook read the variable the probe
 * started agy with), so a session's hook reaches that session's judge and
 * no other, and one hooks.json serves every session of the home. A call
 * whose agy names no judge is denied.
 *
 * It fails closed. Every way it cannot hand back the judge's answer prints
 * `deny` with the reason the model reads: no judge named, none answering,
 * none answering in {@link HOOK_LIMIT_S}, an answer that is not a decision.
 * agy itself blocks a call whose hook exits non-zero or outlives its
 * timeout (`assets/338276e4/p0b.log`, `p0c.log`: `JSON hook … failed:
 * command failed: exit status 1` and `signal: killed`, the tool failed, its
 * marker never written), so a hook that cannot even print fails closed too.
 *
 * It runs as `perl -T`, as a workspace's Claude hook does
 * (boundary/hook-judge.ts `hookScript`): no start-up of its own to speak of,
 * no module path or switch read from the environment, and no module loaded.
 * The socket's address comes packed (boundary/hook-judge.ts
 * `packedSocketAddress`), and AF_UNIX and SOCK_STREAM are 1 on Linux and
 * macOS alike. agy runs a hook command through `sh -c` (`p0d.execve.txt`:
 * `execve("/usr/bin/sh", ["sh", "-c", …])`).
 */

import { rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { AGY_JUDGE_ENV } from "@cawco/core/harness/agy";
import { shellQuote } from "@cawco/core/shell-quote";
import { writeStateFile } from "@cawco/core/state-file";
import { Effect, Schema } from "effect";
import {
  HOOK_TIMEOUT_S,
  packedSocketAddress,
  perl,
  perlQuote,
} from "../boundary/hook-judge";
import { JUDGE_ANSWER_END, JUDGE_ANSWER_END_PERL } from "../boundary/protocol";
import type { AgyAnswer } from "./agy-judge";

/**
 * How long the hook waits for its judge before it denies the call: under
 * agy's own limit on it ({@link HOOK_TIMEOUT_S}, written in hooks.json), so
 * the hook's words, not agy's kill, are what the model reads.
 */
// @limit measured: HOOK_TIMEOUT_S less 10 s, so the judge answers before its hook is killed
const HOOK_LIMIT_S = HOOK_TIMEOUT_S - 10;

/** What every answer the hook passes on begins with: one of agy's decisions, never `{}` (which agy 1.5.18 reads as a denial) nor `ask`. */
const DECISION_HEAD = String.raw`\A\{"decision":"(?:allow|deny|force_ask)"`;

/**
 * The hook's script. Its one line out is the judge's answer as the judge
 * wrote it, or `deny` with why the hook could not get one; a write to
 * stdout that fails exits 1, which agy blocks on.
 */
const agyHookScript = (): string => `#!${perl()} -T
# CawCo: the PreToolUse hook every agy session of this home runs before each
# tool call. It hands the call to the session's judge, which its agy names in
# ${AGY_JUDGE_ENV}, and prints the judge's answer; anything else denies.
sub deny {
  my $why = "cawco: $_[0], so this call did not run.";
  $why =~ s/([\\\\"])/\\\\$1/g;
  $why =~ tr/\\x00-\\x1f/ /;
  print STDOUT qq({"decision":"deny","reason":"$why"}\\n) or exit 1;
  close STDOUT or exit 1;
  exit 0;
}
$SIG{__DIE__} = sub { deny("the hook failed (@_)") };
$SIG{ALRM} = sub { deny(${perlQuote(`this session's judge did not answer within ${HOOK_LIMIT_S}s`)}) };
$SIG{PIPE} = 'IGNORE';
alarm ${HOOK_LIMIT_S};
$call = do { local $/; <STDIN> };
deny("the call reached the hook with no input") unless length $call;
$call =~ tr/\\r\\n/  /;
($address) = (defined $ENV{${AGY_JUDGE_ENV}} ? $ENV{${AGY_JUDGE_ENV}} : '') =~ /\\A([0-9a-f]+)\\z/
  or deny("this agy session names no judge (${AGY_JUDGE_ENV})");
socket(JUDGE, 1, 1, 0) or deny("the hook could not open a socket ($!)");
connect(JUDGE, pack('H*', $address)) or deny("this session's judge did not answer ($!)");
select((select(JUDGE), $| = 1)[0]);
print JUDGE $call, "\\n" or deny("the call could not be handed to this session's judge ($!)");
$answer = do { local $/ = "${JUDGE_ANSWER_END_PERL}"; <JUDGE> };
defined $answer or deny("this session's judge answered nothing");
$answer =~ s/${JUDGE_ANSWER_END_PERL}\\z//;
close JUDGE;
$answer =~ /${DECISION_HEAD}/ or deny("this session's judge answered no decision");
print STDOUT $answer, "\\n" or exit 1;
close STDOUT or exit 1;
exit 0;
`;

/** The command agy runs for the hook at `script` (through `sh -c`). */
const hookCommand = (script: string): string =>
  `${shellQuote(perl())} -T ${shellQuote(script)}`;

/**
 * An agy home's `config/hooks.json`, holding the hook at `script` alone, on
 * every tool (its matcher is a regex agy anchors), with agy's limit on it.
 */
const agyHooksFile = (script: string): string =>
  `${JSON.stringify(
    {
      cawco: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [
              {
                type: "command",
                command: hookCommand(script),
                timeout: HOOK_TIMEOUT_S,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  )}\n`;

/** The hook could not be written. */
class AgyHookWriteError extends Schema.TaggedError<AgyHookWriteError>()(
  "AgyHookWriteError",
  { path: Schema.String, cause: Schema.Defect() }
) {}

/**
 * Writes the hook's script to `script` and the hooks.json that runs it into
 * agy home `home`, each whole (core state-file.ts). The script is read-only:
 * the hook is what every call passes, so nothing rewrites it but this.
 *
 * @public No module imports it yet: agy's adapter does once agy is a
 * registered harness (item 3 of tsk-340, which removes this tag and the
 * knip.ts entry for this file).
 */
export const writeAgyHook = Effect.fn("writeAgyHook")(function* (
  home: string,
  script: string
) {
  const hooks = join(home, "config", "hooks.json");
  yield* Effect.tryPromise({
    try: () => writeStateFile(script, agyHookScript(), { mode: 0o444 }),
    catch: (cause) => new AgyHookWriteError({ path: script, cause }),
  });
  yield* Effect.tryPromise({
    try: () => writeStateFile(hooks, agyHooksFile(script)),
    catch: (cause) => new AgyHookWriteError({ path: hooks, cause }),
  });
});

/** The judge's socket could not be packed or served. */
class AgyJudgeError extends Schema.TaggedError<AgyJudgeError>()(
  "AgyJudgeError",
  { socket: Schema.String, why: Schema.String }
) {}

/**
 * The environment an `agy acp` session is started with for its hook to
 * reach the judge at `socket` ({@link AGY_JUDGE_ENV}).
 *
 * @public No module imports it yet: agy's adapter does once agy is a
 * registered harness (item 3 of tsk-340, which removes this tag and the
 * knip.ts entry for this file).
 */
export const agyJudgeEnv = Effect.fn("agyJudgeEnv")(function* (socket: string) {
  const packed = yield* Effect.promise(() => packedSocketAddress(socket));
  if (!packed.ok) {
    return yield* new AgyJudgeError({
      socket,
      why: `${perl()} could not pack its address (${packed.why})`,
    });
  }
  return { [AGY_JUDGE_ENV]: packed.address };
});

/** A judge's answer as the hook passes it on: never with the end mark inside it (JSON escapes a NUL). */
const answerText = (answer: AgyAnswer): string =>
  `${JSON.stringify(answer)}${JUDGE_ANSWER_END}`;

/**
 * Serves one session's judge on `socket` for as long as the scope is open:
 * each connection's first line is a call as agy handed the hook, answered
 * with `answer` and the end mark, then closed. An answer that throws (the
 * workspace's policy unreadable, say) is a denial with why: a call never
 * runs that the judge could not answer. The socket is removed as the scope
 * closes.
 *
 * @public No module imports it yet: agy's adapter does once agy is a
 * registered harness (item 3 of tsk-340, which removes this tag and the
 * knip.ts entry for this file).
 */
export const serveAgyJudge = Effect.fn("serveAgyJudge")(function* (
  socket: string,
  answer: (line: string) => AgyAnswer
) {
  const answered = (line: string): string => {
    try {
      return answerText(answer(line));
    } catch (error) {
      return answerText({
        decision: "deny",
        reason: `cawco: this call did not run, because its judge could not answer it: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
  yield* Effect.acquireRelease(
    Effect.callback<Server, AgyJudgeError>((resume) => {
      rmSync(socket, { force: true });
      const server = createServer((connection) => {
        const chunks: Buffer[] = [];
        connection.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          const read = Buffer.concat(chunks);
          const end = read.indexOf(10);
          if (end < 0) {
            return;
          }
          connection.removeAllListeners("data");
          connection.end(answered(read.subarray(0, end).toString("utf8")));
        });
        // A hook agy killed mid-call leaves nothing to answer.
        connection.on("error", () => connection.destroy());
      });
      server.once("error", (error) =>
        resume(Effect.fail(new AgyJudgeError({ socket, why: error.message })))
      );
      server.listen(socket, () => resume(Effect.succeed(server)));
    }),
    (server) =>
      Effect.sync(() => {
        server.close();
        rmSync(socket, { force: true });
      })
  );
});
