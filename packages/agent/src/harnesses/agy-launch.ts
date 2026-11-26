/**
 * What an Antigravity session runs as: Google's own `agy acp`, in its
 * account's agy home, with an environment built from nothing but what the
 * account's one sign-in method needs (tsk-340, "Compliance posture"; T3
 * Code's `antigravityAuthSupport.ts`, whose launch this follows).
 *
 * - The account's method is read whole before anything starts
 *   ({@link readAgySignIn}): a key or a project the method needs and the
 *   machine does not hold refuses the start in one sentence, so agy never
 *   runs on a method with no credential, where it would fall back to a saved
 *   Google login (agy changelog 1.5.9).
 * - Every Google, Gemini, gcloud and agy variable of the host is dropped
 *   ({@link agyEnvironment}), then only the method's credential is set:
 *   `GEMINI_API_KEY` for a Gemini key, `GOOGLE_API_KEY` for an Agent
 *   Platform key, the file sign-in switches for a Google account; the
 *   Google Cloud project and location go in the home's settings, never the
 *   environment, as `GOOGLE_API_KEY` there outranks them.
 * - Every launch carries `--disable-telemetry`, and agy's self-update and
 *   crash reports are off.
 * - CawCo's hook is written into the home before every launch (agy-hook.ts),
 *   and the session's judge is named in agy's environment (agy-judge.ts).
 *
 * CawCo reads no Google token: a Google sign-in is agy's, in the account's
 * home; a key is the account's credential, which CawCo already keeps
 * (core accounts.ts) and hands agy in its environment.
 */
import { join } from "node:path";
import {
  type ClientApp,
  type ClientConnection,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import {
  AGY_METHODS,
  AGY_PROVIDER,
  type AgyAccountRecord,
  type AgySignIn,
} from "@cawco/core/harness/agy-account";
import type { AgyLaunch } from "@cawco/core/harness/agy-host-state";
import {
  AGY_APP_DATA,
  agyAccountHome,
  agyAccountRecord,
} from "@cawco/core/paths/harnesses";
import { agyJudgeSocket } from "@cawco/core/paths/hub";
import { sessionEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import { type ToolSpec, toolSpec } from "@cawco/core/tools";
import { agyWords } from "@cawco/core/words/agy";
import { Effect, Option, Schema } from "effect";
import { readHeld } from "../provider-accounts";
import { toolGate, toolPath } from "../tools";
import { linkAgyFleet } from "./agy-fleet";
import { agyJudgeEnv, writeAgyHook } from "./agy-hook";

const AGY_TOOL = toolSpec("antigravity");
if (!AGY_TOOL) {
  throw new Error("The tool catalog names no antigravity");
}
/** agy's catalog entry: its version gate (tools.ts `toolGate`) reads it. */
export const AGY_SPEC: ToolSpec = AGY_TOOL;

/** A start refused before anything ran, in the words the person reads. */
export class AgyStartRefused extends Schema.TaggedError<AgyStartRefused>()(
  "AgyStartRefused",
  { message: Schema.String }
) {}

const refuse = (message: string) => new AgyStartRefused({ message });

/** The installed agy a start runs, and its version; refused in the gate's words when it is missing or older than CawCo runs. */
export const agyToStart = Effect.fn("agyToStart")(function* () {
  const gate = yield* Effect.promise(() => toolGate(AGY_SPEC));
  if (gate.refused || !gate.path) {
    return yield* refuse(gate.words ?? `${AGY_SPEC.name} isn't installed.`);
  }
  return { bin: gate.path, version: gate.version };
});

const GcpPlaceSchema = Schema.Struct({
  project: Schema.String,
  location: Schema.String,
});

/** An account's record on its machine (core paths/harnesses.ts `agyAccountRecord`). */
const AccountRecordSchema = Schema.Struct({
  method: Schema.Literals(AGY_METHODS),
  gcp: Schema.optional(GcpPlaceSchema),
});

const decodeRecord = Schema.decodeUnknownOption(
  Schema.fromJsonString(AccountRecordSchema)
);

/** A place both of whose names are written. */
const placeOf = (record: AgyAccountRecord) =>
  record.gcp?.project.trim() && record.gcp.location.trim()
    ? {
        project: record.gcp.project.trim(),
        location: record.gcp.location.trim(),
      }
    : undefined;

/** The key the account's credential holds, when it is an Antigravity key. */
const keyOf = (accountId: string): string | undefined => {
  const held = readHeld(accountId);
  return held?.provider === AGY_PROVIDER &&
    held.credential.type === "api_key" &&
    held.credential.key?.trim()
    ? held.credential.key.trim()
    : undefined;
};

/**
 * Account `accountId`'s sign-in on this machine, complete for its method,
 * or the start refused in words that say what is missing.
 */
export const readAgySignIn = Effect.fn("readAgySignIn")(function* (
  accountId: string
) {
  const text = yield* Effect.promise(() =>
    Bun.file(agyAccountRecord(accountId))
      .text()
      .catch(() => "")
  );
  const record = Option.getOrUndefined(decodeRecord(text));
  if (!record) {
    return yield* refuse(agyWords.noMethod);
  }
  const place = placeOf(record);
  switch (record.method) {
    case "oauth-personal":
      return { method: "oauth-personal" } satisfies AgySignIn;
    case "oauth-business":
      if (!place) {
        return yield* refuse(agyWords.noBusinessPlace);
      }
      return { method: "oauth-business", gcp: place } satisfies AgySignIn;
    case "gemini-api-key": {
      const key = keyOf(accountId);
      if (!key) {
        return yield* refuse(agyWords.noKey("Gemini API key"));
      }
      return { method: "gemini-api-key", key } satisfies AgySignIn;
    }
    case "agent-platform": {
      const key = keyOf(accountId);
      if (key) {
        return { method: "agent-platform", key } satisfies AgySignIn;
      }
      if (place) {
        return { method: "agent-platform", gcp: place } satisfies AgySignIn;
      }
      return yield* refuse(agyWords.noPlatformAccess);
    }
    default:
      return yield* refuse(agyWords.noMethod);
  }
});

/**
 * The host's variables agy must never see: every one that could sign agy in
 * or point it at a project, a home or a browser behind the account's back
 * (T3 Code's `removedEnvironmentKeys`), and agy's own switches, which CawCo
 * sets itself. Matched without regard to case, as Windows reads them.
 */
const DROPPED_NAMES = new Set([
  "BROWSER",
  "SSH_CONNECTION",
  "SSH_CLIENT",
  "SSH_TTY",
  "PYTHONUNBUFFERED",
  "ELECTRON_RUN_AS_NODE",
  "CHROME_CRASHPAD_PIPE_NAME",
]);

/** The families of variables dropped whole: Google's, Gemini's, gcloud's, Vertex's and agy's own. */
const DROPPED_PREFIXES = [
  "GOOGLE_",
  "GEMINI_",
  "GCLOUD_",
  "CLOUDSDK_",
  "VERTEX",
  "AGY_",
  "ANTIGRAVITY_",
];

/** Whether the host's variable `name` stays out of agy's environment. */
const droppedForAgy = (name: string): boolean => {
  const upper = name.toUpperCase();
  return (
    DROPPED_NAMES.has(upper) ||
    DROPPED_PREFIXES.some((prefix) => upper.startsWith(prefix))
  );
};

/**
 * agy 1.5 keeps a Google sign-in in one OS keyring entry for every home,
 * unless it believes it runs over SSH; then it keeps it in a file in the
 * home's app-data dir (T3 Code's `antigravityEnvironment`, issue #1833). Set
 * for a Google account alone, so each account's sign-in is its own.
 */
const FILE_SIGN_IN = {
  SSH_CONNECTION: "127.0.0.1 0 127.0.0.1 0",
  AGY_ACP_FORCE_FILE_STORAGE: "1",
} as const;

/** The variable the method's credential is handed in, with its value; none for a method agy signs in itself. */
const credentialOf = (signIn: AgySignIn): Record<string, string> => {
  switch (signIn.method) {
    case "gemini-api-key":
      return { GEMINI_API_KEY: signIn.key };
    case "agent-platform":
      return "key" in signIn ? { GOOGLE_API_KEY: signIn.key } : {};
    case "oauth-personal":
      return FILE_SIGN_IN;
    case "oauth-business":
      return {};
    default:
      return {};
  }
};

/**
 * agy's environment for `signIn`: the host's, every variable
 * {@link droppedForAgy} names gone, on the tools' PATH, with the method's
 * credential, the session's own extras (its judge, its git and container
 * doors), and agy's self-update and crash reports off.
 */
export const agyEnvironment = (
  signIn: AgySignIn,
  extras: Readonly<Record<string, string>>,
  host: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(sessionEnvironment(host)).filter(
      ([name]) => !droppedForAgy(name)
    )
  ),
  PATH: toolPath(),
  ...extras,
  ...credentialOf(signIn),
  AGY_CLI_DISABLE_AUTO_UPDATE: "true",
  ANTIGRAVITY_SENTRY_SAMPLE_RATE: "0",
});

/**
 * The home's settings for `signIn` (its app-data dir's `settings.json`): the
 * method agy signs in with, every tool call proceeding without agy's own ask
 * (CawCo's judge asks, agy-judge.ts), and the Google Cloud place where the
 * method names one. Never a credential.
 */
const settingsOf = (signIn: AgySignIn) => ({
  auth: { type: signIn.method },
  toolPermission: "always-proceed",
  artifactReviewPolicy: "always-proceed",
  ...("gcp" in signIn ? { gcp: signIn.gcp } : {}),
});

/** The hook's script in an account's home: beside its hooks.json, where nothing a session runs writes. */
const hookScript = (home: string): string => join(home, "cawco-hook.pl");

/**
 * Account `accountId`'s agy home, readied for a launch on `signIn`: its
 * settings and CawCo's hook written, the fleet's skills and memory linked
 * (agy-fleet.ts). Returns the home.
 */
export const prepareAgyHome = Effect.fn("prepareAgyHome")(function* (
  accountId: string,
  signIn: AgySignIn
): Effect.fn.Return<string, AgyStartRefused> {
  const home = agyAccountHome(accountId);
  yield* Effect.promise(() =>
    writeStateFile(
      join(home, AGY_APP_DATA, "settings.json"),
      `${JSON.stringify(settingsOf(signIn), null, 2)}\n`,
      { mode: 0o600 }
    )
  );
  yield* writeAgyHook(home, hookScript(home)).pipe(
    Effect.mapError((error) =>
      refuse(`CawCo couldn't write its hook into ${error.path}.`)
    )
  );
  yield* linkAgyFleet(home).pipe(
    Effect.mapError((error) => refuse(agyWords.noFleetLink(error.link)))
  );
  return home;
});

/** agy's argv for a session in `home`: ACP, telemetry off, the home and its app-data dir. */
export const agyArgs = (home: string): string[] => [
  "acp",
  "--disable-telemetry",
  "--gemini-dir",
  home,
  "--app-data-dir",
  AGY_APP_DATA,
];

/**
 * What session `instanceId` on account `accountId` runs as: the installed
 * agy, its argv, its environment whole, its home, its judge's socket and
 * the method `authenticate` names. Refused before anything starts when agy
 * or the account's method cannot run it.
 */
export const agyLaunch = Effect.fn("agyLaunch")(function* (
  accountId: string,
  instanceId: string,
  extras: Readonly<Record<string, string>>
): Effect.fn.Return<AgyLaunch, AgyStartRefused> {
  const agy = yield* agyToStart();
  const signIn = yield* readAgySignIn(accountId);
  const home = yield* prepareAgyHome(accountId, signIn);
  const judgeSocket = agyJudgeSocket(instanceId);
  const judge = yield* agyJudgeEnv(judgeSocket).pipe(
    Effect.mapError((error) => refuse(error.why))
  );
  const launch: AgyLaunch = {
    bin: agy.bin,
    args: agyArgs(home),
    env: agyEnvironment(signIn, { ...extras, ...judge }),
    home,
    judgeSocket,
    methodId: signIn.method,
    ...(agy.version ? { version: agy.version } : {}),
  };
  return launch;
});

/** A running agy, its stdio piped. */
export type AgyChild = Bun.Subprocess<"pipe", "pipe", "pipe">;

/**
 * agy started as `run` says, in a process group of its own, and CawCo's ACP
 * connection to it through `app`, the client's handlers registered on it.
 * Its stderr is handed to `said` as it comes, and its end to `ended`.
 */
export const startAcp = (
  run: {
    readonly args: readonly string[];
    readonly bin: string;
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
  },
  app: ClientApp,
  watch: { ended: (why: string) => void; said: (text: string) => void }
): { child: AgyChild; connection: ClientConnection } => {
  const child = Bun.spawn([run.bin, ...run.args], {
    cwd: run.cwd,
    env: { ...run.env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    // Its own process group, ended whole with what it starts.
    detached: true,
    onExit: (_proc, code, signal, error) =>
      watch.ended(error ? error.message : `agy exited (${code ?? signal})`),
  });
  const input = child.stdin;
  const connection = app.connect(
    ndJsonStream(
      new WritableStream<Uint8Array>({
        write: (chunk) => {
          input.write(chunk);
          input.flush();
        },
        close: () => {
          input.end();
        },
      }),
      child.stdout
    )
  );
  readStderr(child.stderr, watch.said);
  return { child, connection };
};

/** `stream` handed to `said` a decoded chunk at a time until it ends. */
const readStderr = (
  stream: ReadableStream<Uint8Array>,
  said: (text: string) => void
): void => {
  const decoder = new TextDecoder();
  stream
    .pipeTo(
      new WritableStream<Uint8Array>({
        write: (chunk) => said(decoder.decode(chunk, { stream: true })),
      })
    )
    .catch(() => undefined);
};

/**
 * agy `initialize`d as CawCo, by its own name and build, advertising no
 * file system, terminal or elicitation of the client's, then signed in by
 * the account's one method (`authenticate`, which agy needs named even
 * when its environment holds the method's key: issue #1701). Its
 * `initialize` answer.
 */
export const signInAcp = async (
  connection: ClientConnection,
  methodId: AgySignIn["method"],
  version: string
) => {
  const initialized = await connection.agent.request(methods.agent.initialize, {
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: "cawco", title: "CawCo", version },
  });
  await connection.agent
    .request(methods.agent.authenticate, { methodId })
    .catch((error: unknown) => {
      throw new Error(
        agyWords.signInRefused(
          error instanceof Error ? error.message : String(error)
        )
      );
    });
  return initialized;
};

/** agy's process group ended: agy and everything it started. */
export const endGroup = (child: AgyChild): void => {
  const pid = spawnedPid(child);
  if (pid !== undefined) {
    signalGroup(pid, "SIGTERM");
  }
};
