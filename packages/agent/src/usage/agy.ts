/**
 * An Antigravity account's plan windows, read through Google's own agy:
 *
 *     agy --gemini_dir <home> --app_data_dir cawco -p /usage --output-format json
 *
 * in the account's home, with the environment a session of it runs in
 * (harnesses/agy-launch.ts `agyEnvironment`). agy 1.5.18 answers from its
 * backend, with no model call (0 tokens, no conversation), every model group
 * with its 5-hour and weekly buckets (`command.data.groups[].buckets`:
 * `window` "5h" or "weekly", `remaining_fraction`, `reset_time`). Only a
 * Google sign-in has a plan to read; a key or a Google Cloud project has
 * none.
 *
 * Print mode takes no `--disable-telemetry` ("flags provided but not
 * defined"), and agy's Enable Telemetry off on the account still left it
 * posting analytics to Google's Clearcut log, `play.googleapis.com/log`
 * (the owner's account, 2026-11-28, the project's `assets/49917009/`). So the
 * read is given no route there: its proxy is a port nothing serves
 * ({@link NO_ROUTE}) and only the hosts it reads from go direct
 * ({@link AGY_USAGE_HOSTS}). No proxy runs and nothing of agy's traffic is
 * read; a host the read needs that is not on the list fails it, in words
 * that name the host. On a machine that connects through a proxy of its
 * own, the read would go around that proxy, so it isn't made.
 *
 * Its log goes to a file of the read's own (`--log-file`), removed after it,
 * so the read leaves nothing in the home's `log/`; it makes no conversation.
 */
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { boundedRead } from "@cawco/core/effect/bounded";
import { timedEffect } from "@cawco/core/effect/timed";
import { makeFolder } from "@cawco/core/folders";
import {
  AGY_MODEL_GROUPS,
  agyMethodKind,
} from "@cawco/core/harness/agy-account";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { AGY_APP_DATA } from "@cawco/core/paths/harnesses";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import type { LimitWindow } from "@cawco/core/usage/types";
import { agyWords } from "@cawco/core/words/agy";
import { Effect, Option, Result, Schema } from "effect";
import {
  agyEnvironment,
  agyRecordOn,
  agyToStart,
  prepareAgyHome,
  readAgySignIn,
} from "../harnesses/agy-launch";

/**
 * The hosts a usage read reaches, which go direct: those the owner's read
 * reached on agy 1.5.18 behind a logging proxy (www.googleapis.com,
 * daily-cloudcode-pa.googleapis.com, aicode.googleapis.com,
 * lh3.googleusercontent.com), the production Cloud Code host beside the
 * daily one, and Google's token hosts for a sign-in's refresh. The read with
 * these alone answered whole, in 2.9 s (the project's
 * `assets/49917009/refuse/`).
 */
const AGY_USAGE_HOSTS = [
  "www.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "aicode.googleapis.com",
  "lh3.googleusercontent.com",
  "oauth2.googleapis.com",
  "accounts.google.com",
] as const;

/** Google's Clearcut log, which print mode posts agy's analytics to: refused, and never named as a host the read needs. */
const LOGGING_HOST = "play.googleapis.com";

/**
 * The proxy every other host is sent to: the discard port, which nothing
 * serves, so a connection there is refused (or, served, discarded) and
 * reaches no one.
 */
const NO_ROUTE = "http://127.0.0.1:9";

/** The variables a machine's own proxy is set in; Go's HTTP and gRPC clients read them. */
const PROXY_VARIABLES = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
] as const;

/** `env` with no route but to {@link AGY_USAGE_HOSTS}. */
const withNoRoute = (
  env: Readonly<Record<string, string>>
): Record<string, string> => {
  const hosts = AGY_USAGE_HOSTS.join(",");
  return {
    ...env,
    HTTPS_PROXY: NO_ROUTE,
    https_proxy: NO_ROUTE,
    HTTP_PROXY: NO_ROUTE,
    http_proxy: NO_ROUTE,
    NO_PROXY: hosts,
    no_proxy: hosts,
  };
};

// @limit recording: agent.agy-usage-ms until 2026-12-12
const READ_MS = 30_000;

const BucketSchema = Schema.Struct({
  id: Schema.String,
  window: Schema.String,
  // Absent at 0: agy writes the field with `omitempty`.
  remaining_fraction: Schema.optional(Schema.Number),
  reset_time: Schema.optional(Schema.String),
});

const GroupSchema = Schema.Struct({
  name: Schema.String,
  buckets: Schema.Array(BucketSchema),
});

const AnswerSchema = Schema.Struct({
  status: Schema.String,
  error: Schema.optional(Schema.String),
  usage: Schema.optional(
    Schema.Struct({ total_tokens: Schema.optional(Schema.Number) })
  ),
  command: Schema.optional(
    Schema.Struct({
      name: Schema.String,
      data: Schema.optional(
        Schema.Struct({ groups: Schema.optional(Schema.Array(GroupSchema)) })
      ),
    })
  ),
});

const decodeAnswer = Schema.decodeUnknownOption(
  Schema.fromJsonString(AnswerSchema)
);

type Bucket = typeof BucketSchema.Type;

/** What a read came to, as provider-usage.ts takes it. */
export type AgyUsageRead =
  | { ok: true; plan: null; windows: LimitWindow[] }
  | { ok: false; error: string };

/** A bucket's window length as a window's group and kind: its 5 hours, its week. */
const LENGTHS: Readonly<Record<string, { group: string; kind: string }>> = {
  "5h": { group: "session", kind: "session" },
  weekly: { group: "weekly", kind: "weekly_scoped" },
};

/**
 * The scope a group's windows carry: its {@link AGY_MODEL_GROUPS} scope, by
 * the prefix of its buckets' ids (`gemini-5h`), else agy's own name for it,
 * which no session's model is read as in (core `scopeBears`).
 */
const scopeOf = (bucket: Bucket, groupName: string): string =>
  AGY_MODEL_GROUPS.find((group) => bucket.id.startsWith(`${group.id}-`))
    ?.scope ?? groupName;

/** A bucket as a window: used is what it has not left; a reset at the epoch's start is a window not yet opened. */
const windowOf = (bucket: Bucket, groupName: string): LimitWindow => {
  const length = LENGTHS[bucket.window] ?? {
    group: bucket.window,
    kind: bucket.window,
  };
  const left = Math.min(1, Math.max(0, bucket.remaining_fraction ?? 0));
  const percent = Math.round((1 - left) * 1000) / 10;
  const reset = bucket.reset_time ? Date.parse(bucket.reset_time) : Number.NaN;
  const spent = percent >= 100;
  return {
    kind: length.kind,
    group: length.group,
    percent,
    severity: spent ? "critical" : "normal",
    resetsAt:
      Number.isFinite(reset) && reset > 0 ? (bucket.reset_time ?? null) : null,
    scopeLabel: scopeOf(bucket, groupName),
    isActive: spent,
  };
};

/** The hosts other than Google's log that agy's log says it found no route to: a host the read needs that {@link AGY_USAGE_HOSTS} lacks. */
const refusedHosts = (log: string): string[] => [
  ...new Set(
    [...log.matchAll(/"https?:\/\/([^/":]+)[^"]*": proxyconnect tcp/gu)]
      .map((match) => match[1] ?? "")
      .filter((host) => host !== "" && host !== LOGGING_HOST)
  ),
];

/** One run of agy, ended whole however the read ends: its exit code and what it printed. */
const runAgy = (run: {
  args: readonly string[];
  bin: string;
  cwd: string;
  env: Readonly<Record<string, string>>;
}) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.spawn([run.bin, ...run.args], {
        cwd: run.cwd,
        env: { ...run.env },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        // Its own process group, ended whole with what it starts.
        detached: true,
      })
    ),
    (child) =>
      Effect.promise(async () => {
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        return { code, stdout, stderr };
      }),
    (child) =>
      Effect.sync(() => {
        const pid = spawnedPid(child);
        if (pid !== undefined && child.exitCode === null) {
          signalGroup(pid, "SIGTERM");
        }
      })
  );

/** The last line agy said on stderr, for a failure's words. */
const lastLine = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";

/**
 * Account `accountId`'s windows, read through agy in its home; undefined for
 * an account that is no Antigravity one on this machine, or signs in by a
 * key or a Google Cloud project, which has no plan to read.
 */
export const agyUsage = Effect.fn("agyUsage")(function* (accountId: string) {
  const record = agyRecordOn(accountId);
  if (!(record && agyMethodKind(record.method) === "oauth")) {
    return;
  }
  const fail = (error: string): AgyUsageRead => ({ ok: false, error });
  const started = yield* agyToStart().pipe(Effect.result);
  if (Result.isFailure(started)) {
    return fail(started.failure.message);
  }
  const signIn = yield* readAgySignIn(accountId).pipe(Effect.result);
  if (Result.isFailure(signIn)) {
    return fail(signIn.failure.message);
  }
  const home = yield* prepareAgyHome(accountId, signIn.success).pipe(
    Effect.result
  );
  if (Result.isFailure(home)) {
    return fail(home.failure.message);
  }
  const env = agyEnvironment(signIn.success, home.success, {});
  if (PROXY_VARIABLES.some((name) => env[name])) {
    return fail(agyWords.usageBehindProxy);
  }
  const logs = join(dirname(home.success), "agy-usage");
  const log = join(logs, `${randomUUID()}.log`);
  yield* Effect.promise(() => makeFolder(logs, { mode: 0o700 }));
  const ran = yield* timedEffect(
    boundedRead(
      READ_MS,
      runAgy({
        bin: started.success.bin,
        args: [
          "--gemini_dir",
          home.success,
          "--app_data_dir",
          AGY_APP_DATA,
          "--log-file",
          log,
          "-p",
          "/usage",
          "--output-format",
          "json",
          "--print-timeout",
          `${READ_MS / 1000}s`,
        ],
        env: withNoRoute(env),
        cwd: home.success,
      })
    ),
    (ms) => recordLimitReading("agent.agy-usage-ms", ms)
  ).pipe(
    Effect.result,
    // agy's log, read for the hosts it found no route to, then removed
    // however the read ended.
    Effect.flatMap((result) =>
      Effect.promise(() => readFile(log, "utf8").catch(() => "")).pipe(
        Effect.map((said) => ({ result, refused: refusedHosts(said) }))
      )
    ),
    Effect.ensuring(Effect.promise(() => rm(log, { force: true })))
  );
  return readOf(ran.result, ran.refused);
});

/** A run of the read as what it came to: the account's windows, or why there are none. */
const readOf = (
  result: Result.Result<
    { code: number; stderr: string; stdout: string },
    unknown
  >,
  refused: readonly string[]
): AgyUsageRead => {
  const fault = (said: string): AgyUsageRead => ({
    ok: false,
    error:
      refused.length > 0
        ? agyWords.usageHostRefused(refused.join(", "))
        : agyWords.usageFailed(said),
  });
  if (Result.isFailure(result)) {
    return refused.length > 0
      ? fault("")
      : { ok: false, error: agyWords.usageUnanswered(READ_MS / 1000) };
  }
  const { stdout, stderr } = result.success;
  const answer = Option.getOrUndefined(decodeAnswer(stdout));
  const groups = answer?.command?.data?.groups;
  if (!(answer?.status === "SUCCESS" && groups)) {
    return fault(answer?.error ?? lastLine(stderr));
  }
  const tokens = answer.usage?.total_tokens ?? 0;
  if (tokens > 0) {
    return { ok: false, error: agyWords.usageSpent(tokens) };
  }
  return {
    ok: true,
    plan: null,
    windows: groups.flatMap((group) =>
      group.buckets.map((bucket) => windowOf(bucket, group.name))
    ),
  };
};
