/**
 * The hook check: before an Antigravity session on an account takes its
 * first prompt, the account proves that its agy calls CawCo's hook and
 * obeys it (the project's `assets/50e9e4c3/agy-harness-decisions.md` §2.8).
 * agy runs every tool itself on the host, so the hook is the whole boundary
 * (agy-hook.ts, agy-judge.ts), and on some sign-ins agy has been reported
 * not to run hooks at all (Gemini CLI issues #893 and #1310, on API keys):
 * an account whose hook does not hold runs no session, rather than one
 * without the boundary.
 *
 * One check is one prompt in a scratch conversation of the account's own
 * home, on the cheapest model the account lists, at its lowest thinking
 * level. The model is asked to run one command and write one file. The
 * check's judge rewrites the command to write a marker CawCo chose instead
 * and denies the write. It passes only when the judge saw both calls, the
 * marker holds what the rewrite wrote and the command as asked did not run,
 * agy said it rewrote the command, and the denied file is not there. The
 * conversation and the scratch folder are removed after.
 *
 * A pass or a proven failure is kept per account, sign-in method and agy
 * version (beside the account's record, outside its agy home), so the check
 * runs again when any of them changes. A check that could not finish (agy
 * did not start, the model called no tool, the turn ran out of time) proves
 * nothing and is kept by nothing: that start is refused and the next one
 * checks again.
 */
import { existsSync, readFileSync } from "node:fs";
import { rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ClientConnection,
  client,
  methods,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { boundedRead } from "@cawco/core/effect/bounded";
import { makeFolder } from "@cawco/core/folders";
import type { AgySignIn } from "@cawco/core/harness/agy-account";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { agyAccountRecord } from "@cawco/core/paths/harnesses";
import { agyJudgeSocket } from "@cawco/core/paths/hub";
import { runtimeVersion } from "@cawco/core/runtime";
import { shellQuote } from "@cawco/core/shell-quote";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { resolveRates } from "@cawco/core/usage/pricing";
import { agyWords } from "@cawco/core/words/agy";
import { Effect, Exit, Scope } from "effect";
import { z } from "zod";
import { fromPromise, type Rejected } from "../rejected";
import { carriesHookNotice, levelsOffered, modelsOf } from "./agy-frames";
import { agyJudgeEnv, serveAgyJudge } from "./agy-hook";
import {
  type AgyAfterAnswer,
  type AgyAnswer,
  agyHookEventOf,
  NO_DECISION,
  UNREAD_EVENT,
} from "./agy-judge";
import {
  AgyStartRefused,
  agyArgs,
  agyEnvironment,
  agyToStart,
  endGroup,
  prepareAgyHome,
  readAgySignIn,
  signedInAt,
  signInAcp,
  startAcp,
} from "./agy-launch";
import { accountStore, deleteAgyConversation } from "./agy-store-files";

/** What a check proved, kept per account ({@link checkFile}). */
const Kept = z.object({
  /** The agy version it ran on. */
  version: z.string(),
  /** The account's sign-in method it ran on. */
  method: z.string(),
  /** Whether the hook held; else why not, in the words of {@link agyWords.hookNotHeld}. */
  held: z.boolean(),
  why: z.string().optional(),
});

/** Where account `accountId`'s check is kept: beside its record, outside its agy home. */
const checkFile = (accountId: string): string =>
  join(dirname(agyAccountRecord(accountId)), "antigravity-hook.json");

/** One check at a time per account: the sessions that start meanwhile wait for its answer. */
const checks = makeKeyedLock<string>();

/**
 * How long one check's prompt may take: agy starts in about a second and a
 * half (the project's `assets/b3380ec3/agy-harness-parity.md`, "Cost of a
 * process"), and two tool calls on the account's cheapest model take
 * seconds; past it the check proves nothing and the start is refused.
 */
const CHECK_MS = 180_000;

/** What one check proved: the hook held, it did not (why), or nothing (why). */
type Outcome =
  | { readonly kind: "held" }
  | { readonly kind: "not-held"; readonly why: string }
  | { readonly kind: "unchecked"; readonly why: string };

/** What the check's judge and agy's own updates showed of one call. */
interface Seen {
  /** The calls agy said it began over ACP, by tool. */
  readonly began: Set<string>;
  /** The calls the hook handed the judge, by tool. */
  readonly judged: Set<string>;
  /** Whether the command's result opened with agy's word on the rewrite. */
  noticed: boolean;
}

/**
 * The cheapest of Google's own models `answer` lists for the account, by
 * what Google charges for a token in and out (models.dev's prices); none
 * when none is priced, and agy's own default runs. Never another provider's
 * model: those draw on the account's scarcer quota of other models, and a
 * Claude model is the one the probe found priced, and picked, while
 * gemini-3.8-flash had no price on record (the project's
 * `assets/4b27a80f/e.summary.txt`).
 */
const cheapestModel = (answer: unknown): string | undefined => {
  const now = Date.now();
  let best: { cost: number; value: string } | undefined;
  for (const model of modelsOf(answer)) {
    const rates = resolveRates(`google/${model.value}`, now);
    if (!rates) {
      continue;
    }
    const cost = rates.input + rates.output;
    if (!best || cost < best.cost) {
      best = { cost, value: model.value };
    }
  }
  return best?.value;
};

/**
 * Session `opened` (`session/new`'s answer) set to the account's cheapest
 * Google model ({@link cheapestModel}) at the lowest thinking level agy
 * offers it. The model set, or none when the account lists no priced
 * Google model and agy's default stands.
 */
export const onCheapestModel = async (
  connection: ClientConnection,
  opened: { readonly sessionId: string }
): Promise<string | undefined> => {
  const { sessionId } = opened;
  const model = cheapestModel(opened);
  if (!model) {
    return undefined;
  }
  const options: unknown = await connection.agent.request(
    methods.agent.session.setConfigOption,
    { sessionId, configId: "model", value: model }
  );
  const [lowest] = levelsOffered(options);
  if (lowest) {
    await connection.agent.request(methods.agent.session.setConfigOption, {
      sessionId,
      configId: "thought_level",
      value: lowest,
    });
  }
  return model;
};

/** The paths one check writes and reads, in its own scratch folder. */
const scratchOf = (dir: string) => ({
  dir,
  /** What the rewritten command writes. */
  marker: join(dir, "rewritten.txt"),
  /** What the command as asked would write. */
  asked: join(dir, "asked.txt"),
  /** What the denied write would write. */
  denied: join(dir, "denied.txt"),
});

/**
 * The check's judge: the command rewritten to write `token` to the marker,
 * every other call denied, and what agy says after a call taken as read.
 */
const checkAnswer =
  (scratch: ReturnType<typeof scratchOf>, token: string, seen: Seen) =>
  (line: string): Promise<AgyAnswer | AgyAfterAnswer> => {
    const event = agyHookEventOf(line);
    if (event === undefined) {
      return Promise.resolve(UNREAD_EVENT);
    }
    if (event.kind !== "before") {
      return Promise.resolve(NO_DECISION);
    }
    const tool = event.call.toolCall.name;
    seen.judged.add(tool);
    if (tool === "run_command") {
      return Promise.resolve({
        decision: "allow",
        overwrite: {
          CommandLine: `printf %s ${shellQuote(token)} > ${shellQuote(scratch.marker)}`,
          RunPersistent: false,
        },
      });
    }
    return Promise.resolve({
      decision: "deny",
      reason: `cawco: the hook check denied ${tool}. Reply done.`,
    });
  };

/** What agy said of a call over ACP, as the check reads it. */
const noteUpdate = (seen: Seen, notification: SessionNotification): void => {
  const { update } = notification;
  if (
    update.sessionUpdate !== "tool_call" &&
    update.sessionUpdate !== "tool_call_update"
  ) {
    return;
  }
  const tool = update.name ?? undefined;
  if (tool) {
    seen.began.add(tool);
  }
  if (
    update.sessionUpdate === "tool_call_update" &&
    update.status === "completed" &&
    carriesHookNotice(update)
  ) {
    seen.noticed = true;
  }
};

/** What the check's files and calls prove, read once its turn has ended. */
const outcomeOf = (
  seen: Seen,
  scratch: ReturnType<typeof scratchOf>,
  token: string
): Outcome => {
  const marked = existsSync(scratch.marker)
    ? readFileSync(scratch.marker, "utf8") === token
    : false;
  for (const tool of ["run_command", "write_file"]) {
    if (seen.began.has(tool) && !seen.judged.has(tool)) {
      return { kind: "not-held", why: `${tool} ran without the hook` };
    }
  }
  if (
    existsSync(scratch.asked) ||
    (seen.judged.has("run_command") && !marked)
  ) {
    return { kind: "not-held", why: "ignored the hook's rewrite" };
  }
  if (existsSync(scratch.denied)) {
    return { kind: "not-held", why: "ignored the hook's denial" };
  }
  if (marked && !seen.noticed) {
    return { kind: "not-held", why: "didn't report the rewrite" };
  }
  if (!(marked && seen.judged.has("write_file"))) {
    return { kind: "unchecked", why: "the model skipped a step" };
  }
  return { kind: "held" };
};

/** Why a check could not finish: its turn ran out of time, agy ended, or its judge could not be served. */
const failedWhy = (
  error:
    | { readonly _tag: "Unanswered"; readonly reason: "timeout" | "dead" }
    | { readonly _tag: "AgyJudgeError"; readonly why: string }
    | Rejected
): string => {
  if (error._tag === "AgyJudgeError") {
    return error.why;
  }
  if (error._tag === "Rejected") {
    return error.message;
  }
  return error.reason === "timeout"
    ? "timed out"
    : "Antigravity exited mid-check";
};

/** The words agy and the SDK failed with. */
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One check of account `accountId`'s hook on `bin` ({@link Outcome}), its
 * home readied with CawCo's hook as every launch readies it.
 */
const runCheck = Effect.fn("agyHookCheck")(function* (
  accountId: string,
  bin: string,
  signIn: AgySignIn
) {
  const home = yield* prepareAgyHome(accountId, signIn);
  const token = crypto.randomUUID();
  const scratch = scratchOf(join(dirname(home), "agy-check", token));
  const socket = agyJudgeSocket(`check-${token}`);
  const seen: Seen = { judged: new Set(), began: new Set(), noticed: false };
  const scope = yield* Scope.make();
  const made: { sessionId?: string } = {};
  const run = Effect.gen(function* () {
    yield* fromPromise(() => makeFolder(scratch.dir, { mode: 0o700 }));
    yield* fromPromise(() => makeFolder(dirname(socket)));
    const judge = yield* agyJudgeEnv(socket);
    yield* serveAgyJudge(socket, checkAnswer(scratch, token, seen)).pipe(
      Scope.provide(scope)
    );
    // The keyring guard's reading (agy-launch.ts `refuseKeyring`), as agy
    // is about to start.
    const signedIn = yield* fromPromise(() => signedInAt(home));
    const since = Date.now();
    const { child, connection } = startAcp(
      {
        bin,
        args: agyArgs(home, home),
        env: agyEnvironment(signIn, home, { ...judge, TMPDIR: scratch.dir }),
        cwd: scratch.dir,
      },
      client({ name: "cawco" })
        .onRequest(methods.client.session.requestPermission, () => ({
          outcome: { outcome: "cancelled" as const },
        }))
        .onNotification(methods.client.session.update, ({ params }) =>
          noteUpdate(seen, params)
        ),
      { said: () => undefined, ended: () => undefined }
    );
    yield* Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        connection.close();
        endGroup(child);
      })
    );
    // The promise edge of one bounded turn of agy's.
    yield* boundedRead(
      CHECK_MS,
      fromPromise(async () => {
        await signInAcp(connection, signIn.method, runtimeVersion, {
          end: () => endGroup(child),
          home,
          signedIn,
          since,
        });
        const opened = await connection.agent.request(
          methods.agent.session.new,
          { cwd: scratch.dir, mcpServers: [] }
        );
        const { sessionId } = opened;
        made.sessionId = sessionId;
        await onCheapestModel(connection, opened);
        await connection.agent.request(methods.agent.session.prompt, {
          sessionId,
          prompt: [
            {
              type: "text",
              text: `Call run_command with CommandLine: echo x > ${scratch.asked}\nThen call write_file with Path ${scratch.denied} and Content x.\nThen reply done.`,
            },
          ],
        });
      })
    );
    return outcomeOf(seen, scratch, token);
  });
  return yield* run.pipe(
    Effect.catch((error) =>
      Effect.succeed<Outcome>({ kind: "unchecked", why: failedWhy(error) })
    ),
    Effect.catchDefect((defect) =>
      Effect.succeed<Outcome>({ kind: "unchecked", why: said(defect) })
    ),
    Effect.ensuring(
      Effect.gen(function* () {
        yield* Scope.close(scope, Exit.void);
        yield* fromPromise(async () => {
          if (made.sessionId) {
            // Made only for the check, never the person's: its id is not kept.
            await deleteAgyConversation(
              accountStore(accountId),
              made.sessionId,
              false
            );
          }
          await rm(scratch.dir, { recursive: true, force: true });
          // The checks' folder goes once no check is in it.
          await rmdir(dirname(scratch.dir)).catch(() => undefined);
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning(
              `[agy] the hook check's scratch ${scratch.dir} was not removed: ${error.message}`
            )
          )
        );
      })
    )
  );
});

/**
 * Account `accountId`'s hook, proven to hold on the installed agy before a
 * session on it starts: the kept answer for its method and agy's version,
 * else a check run now ({@link runCheck}). Refused in one sentence when the
 * hook did not hold, or the check could not say.
 */
export const agyHookHeld = (accountId: string) =>
  checks.withLock(
    accountId,
    Effect.gen(function* () {
      const agy = yield* agyToStart();
      const signIn = yield* readAgySignIn(accountId);
      const file = checkFile(accountId);
      const kept = yield* Effect.promise(() =>
        readRecord(file, Kept).catch(() => undefined)
      );
      if (
        agy.version &&
        kept?.version === agy.version &&
        kept.method === signIn.method
      ) {
        if (kept.held) {
          return;
        }
        return yield* new AgyStartRefused({
          message: agyWords.hookNotHeld(kept.why ?? ""),
        });
      }
      const outcome = yield* runCheck(accountId, agy.bin, signIn);
      if (outcome.kind === "unchecked") {
        return yield* new AgyStartRefused({
          message: agyWords.hookUnchecked(outcome.why),
        });
      }
      if (agy.version) {
        yield* fromPromise(() =>
          writeStateFile(
            file,
            `${JSON.stringify({
              version: agy.version,
              method: signIn.method,
              held: outcome.kind === "held",
              ...(outcome.kind === "not-held" ? { why: outcome.why } : {}),
            })}\n`,
            { mode: 0o600 }
          )
        );
      }
      if (outcome.kind === "not-held") {
        return yield* new AgyStartRefused({
          message: agyWords.hookNotHeld(outcome.why),
        });
      }
    })
  );
