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
 *   `GEMINI_API_KEY` for a Gemini key. Agent Platform runs on gcloud's own
 *   default credentials, and its Google Cloud project and location, like
 *   Gemini Enterprise's, go in the home's settings, never the environment.
 * - Every launch of every method keeps agy's own sign-in in a file in the
 *   account's home, never the OS keyring ({@link HOME_SIGN_IN}), so each
 *   Google account's sign-in is its own and a key account's home holds no
 *   Google login to fall back to.
 * - Every launch carries `--disable-telemetry`, and agy's self-update and
 *   crash reports are off.
 * - CawCo's hook is written into the home before every launch (agy-hook.ts),
 *   and the session's judge is named in agy's environment (agy-judge.ts).
 *
 * CawCo reads no Google token: a Google sign-in is agy's, in the account's
 * home; a key is the account's credential, which CawCo already keeps
 * (core accounts.ts) and hands agy in its environment.
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import {
  type ClientApp,
  type ClientConnection,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { makeFolder } from "@cawco/core/folders";
import {
  AGY_METHODS,
  AGY_PROVIDER,
  type AgyAccountRecord,
  type AgySignIn,
  placeOf,
} from "@cawco/core/harness/agy-account";
import type { AgyLaunch } from "@cawco/core/harness/agy-host-state";
import {
  AGY_APP_DATA,
  AGY_SIGN_IN_FILE,
  agyAccountHome,
  agyAccountRecord,
  agySignInFile,
} from "@cawco/core/paths/harnesses";
import { agyJudgeSocket } from "@cawco/core/paths/hub";
import { sessionEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import { type ToolSpec, toolSpec } from "@cawco/core/tools";
import { agyWords } from "@cawco/core/words/agy";
import { systemProgram } from "@cawco/core/workspace-needs";
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

/** Account `accountId`'s record on this machine as it is now; none when it has none, or one that doesn't read. */
export const agyRecordOn = (
  accountId: string
): AgyAccountRecord | undefined => {
  try {
    return Option.getOrUndefined(
      decodeRecord(readFileSync(agyAccountRecord(accountId), "utf8"))
    );
  } catch {
    return undefined;
  }
};

/** Account `accountId`'s record written, owner-only: what every launch on it reads ({@link readAgySignIn}). */
export const writeAgyRecord = (
  accountId: string,
  record: AgyAccountRecord
): Promise<void> =>
  writeStateFile(
    agyAccountRecord(accountId),
    `${JSON.stringify(record, null, 2)}\n`,
    { mode: 0o600 }
  );

/** The key the account's credential holds, when it is an Antigravity key. */
const agyKeyOf = (accountId: string): string | undefined => {
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
  const place = placeOf(record.gcp);
  // A Google sign-in must be in the home before agy runs: agy asked to sign
  // in with none opens a browser on this machine.
  const signedIn = yield* Effect.promise(() =>
    Bun.file(agySignInFile(accountId)).exists()
  );
  switch (record.method) {
    case "oauth-personal":
      if (!signedIn) {
        return yield* refuse(agyWords.notSignedIn);
      }
      return { method: "oauth-personal" } satisfies AgySignIn;
    case "oauth-business":
      if (!place) {
        return yield* refuse(agyWords.noBusinessPlace);
      }
      if (!signedIn) {
        return yield* refuse(agyWords.notSignedIn);
      }
      return { method: "oauth-business", gcp: place } satisfies AgySignIn;
    case "gemini-api-key": {
      const key = agyKeyOf(accountId);
      if (!key) {
        return yield* refuse(agyWords.noKey("Gemini API key"));
      }
      return { method: "gemini-api-key", key } satisfies AgySignIn;
    }
    case "agent-platform": {
      if (!place) {
        return yield* refuse(agyWords.noPlatformPlace);
      }
      return { method: "agent-platform", gcp: place } satisfies AgySignIn;
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
  // No display: agy asked to sign in where it has no sign-in refuses a
  // browser it can't open, rather than opening one on this machine. Only a
  // Gemini Enterprise sign-in sets one, for CawCo's own opener
  // (agy-signin.ts).
  "DISPLAY",
  "WAYLAND_DISPLAY",
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
 * Where agy keeps a sign-in, for a launch in `home`: a file in the home's
 * app-data dir (`<home>/cawco/antigravity-oauth-token`), never D-Bus or the
 * OS keyring, which holds one entry for every home (agy 1.5.18's
 * `composite_token_storage.go`, the project's `assets/22523e77/REPORT.md`);
 * and agy's plugin secrets in the home too (`$XDG_CONFIG_HOME/antigravity`).
 * Set on every method's launch: a key account's home then holds no Google
 * login, so agy never falls back to one (agy changelog 1.5.9). Never
 * `SSH_CONNECTION`, which gives the same file but makes ACP `authenticate`
 * refuse a browser sign-in.
 */
const HOME_SIGN_IN = (home: string): Record<string, string> => ({
  AGY_CLI_FORCE_FILE_TOKEN_STORAGE: "1",
  XDG_CONFIG_HOME: join(home, "xdg"),
  ...NO_KEYRING(home),
});

/**
 * No OS keyring for agy to reach. The force switch above picks where agy
 * keeps a sign-in, but not where its auth chain reads one: asked to sign in
 * with no file in the home and the session bus in reach, agy 1.5.18 took
 * the machine's own keyring sign-in and wrote it into the home ("ChainedAuth:
 * authenticated via keyring", the project's `assets/cbec55e2/REPORT.md`).
 * Its keyring (go-keyring, Secret Service over D-Bus on Linux) and its own
 * bus look both read `DBUS_SESSION_BUS_ADDRESS` first, so it names a socket
 * that is never there: no bus, no keyring. macOS keeps its Keychain outside
 * any variable, so there the guard after each start holds it
 * ({@link signInAcp}).
 */
const NO_KEYRING = (home: string): Record<string, string> => ({
  DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(home, "no-session-bus")}`,
});

/**
 * The names a platform's browser opener goes by, which agy runs to open a
 * link (Go's `pkg/browser`: `xdg-open` and its fallbacks on Linux, `open`
 * on macOS; agy ignores `$BROWSER` and also tries `kde-open` and `gio`,
 * `assets/cbec55e2/REPORT.md`). CawCo's stand-in for each, first on every
 * agy launch's PATH, writes the link to `$CAWCO_AGY_OPENED` and opens
 * nothing, so no agy CawCo starts ever opens a browser on this machine; a
 * sign-in relays the link it wrote (agy-signin.ts).
 */
const OPENERS = [
  "xdg-open",
  "x-www-browser",
  "www-browser",
  "sensible-browser",
  "kde-open",
  "kde-open5",
  "gio",
  "open",
];

/** An account's openers, beside its agy home and outside it, and the file they write to. */
export const agyOpeners = (home: string): { dir: string; opened: string } => {
  const dir = join(dirname(home), "agy-open");
  return { dir, opened: join(dir, "opened") };
};

/** An opener: the link it is handed, written to `$CAWCO_AGY_OPENED`, and nothing opened. */
const opener = (): string =>
  `#!${systemProgram("sh")}\nprintf '%s\\n' "$*" >> "$CAWCO_AGY_OPENED"\n`;

/** The home's openers written afresh, owner-only, before every launch: whatever stood there is replaced. */
const writeOpeners = async (home: string): Promise<void> => {
  const { dir } = agyOpeners(home);
  await makeFolder(dir, { mode: 0o700 });
  for (const name of OPENERS) {
    await writeStateFile(join(dir, name), opener(), { mode: 0o700 });
  }
};

/** `env` with the home's openers first on its PATH, and `BROWSER` one of them. */
const withOpeners = (
  env: Record<string, string>,
  home: string
): Record<string, string> => {
  const { dir, opened } = agyOpeners(home);
  return {
    ...env,
    PATH: `${dir}${delimiter}${env.PATH}`,
    BROWSER: join(dir, "xdg-open"),
    CAWCO_AGY_OPENED: opened,
  };
};

/** The variable the method's credential is handed in, with its value; none for a method agy signs in itself. */
const credentialOf = (signIn: AgySignIn): Record<string, string> => {
  switch (signIn.method) {
    case "gemini-api-key":
      return { GEMINI_API_KEY: signIn.key };
    case "agent-platform":
    case "oauth-personal":
    case "oauth-business":
      return {};
    default:
      return {};
  }
};

/**
 * agy's environment for `signIn` in `home`: the host's, every variable
 * {@link droppedForAgy} names gone, on the tools' PATH, with the method's
 * credential, the home's own sign-in store ({@link HOME_SIGN_IN}), the
 * session's own extras (its judge, its git and container doors), and what every run of agy
 * carries (core tools.ts `runEnv`: its self-update and crash reports off).
 */
export const agyEnvironment = (
  signIn: AgySignIn,
  home: string,
  extras: Readonly<Record<string, string>>,
  host: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> =>
  withOpeners(
    {
      ...Object.fromEntries(
        Object.entries(sessionEnvironment(host)).filter(
          ([name]) => !droppedForAgy(name)
        )
      ),
      PATH: toolPath(),
      ...extras,
      ...credentialOf(signIn),
      ...HOME_SIGN_IN(home),
      ...AGY_SPEC.runEnv,
    },
    home
  );

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
  yield* Effect.promise(() => writeOpeners(home));
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
 * agy's own temp dir for session `instanceId` in agy home `home`: beside the
 * home, under the account's dir, which no workspace reads or writes. agy
 * reads what lies in its `TMPDIR` without asking (the project's
 * include-controls probe, 2026-11-26), so a workspace session's is its own
 * and never the workspace's scratch.
 */
const ownTmp = (home: string, instanceId: string): string =>
  join(dirname(home), "agy-tmp", instanceId);

/**
 * What session `instanceId` on account `accountId` runs as: the installed
 * agy, its argv, its environment whole, its home, its judge's socket and
 * the method `authenticate` names. A workspace session (`bounded`) runs
 * agy on a temp dir of its own ({@link ownTmp}). Refused before anything
 * starts when agy or the account's method cannot run it.
 */
export const agyLaunch = Effect.fn("agyLaunch")(function* (
  accountId: string,
  instanceId: string,
  extras: Readonly<Record<string, string>>,
  bounded: boolean
): Effect.fn.Return<AgyLaunch, AgyStartRefused> {
  const agy = yield* agyToStart();
  const signIn = yield* readAgySignIn(accountId);
  const home = yield* prepareAgyHome(accountId, signIn);
  const judgeSocket = agyJudgeSocket(instanceId);
  const judge = yield* agyJudgeEnv(judgeSocket).pipe(
    Effect.mapError((error) => refuse(error.why))
  );
  const tmp = bounded ? ownTmp(home, instanceId) : undefined;
  if (tmp) {
    yield* Effect.promise(() => makeFolder(tmp, { mode: 0o700 }));
  }
  const launch: AgyLaunch = {
    bin: agy.bin,
    args: agyArgs(home),
    env: agyEnvironment(signIn, home, {
      ...extras,
      ...judge,
      ...(tmp ? { TMPDIR: tmp } : {}),
    }),
    home,
    judgeSocket,
    methodId: signIn.method,
    ...(agy.version ? { version: agy.version } : {}),
    ...(tmp ? { tmp } : {}),
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
  version: string,
  guard: KeyringGuard
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
  await refuseKeyring(guard);
  return initialized;
};

/** What a launch's keyring guard reads ({@link refuseKeyring}): how to end its agy, its home, and whether a sign-in stood there before it. */
export interface KeyringGuard {
  readonly end: () => void;
  readonly home: string;
  /** Whether the home held a sign-in file before agy started. */
  readonly signedIn: boolean;
  /** When agy started: only its log lines since count. */
  readonly since: number;
}

/** Whether the agy home `home` holds a sign-in file now: read before agy starts, for its {@link KeyringGuard}. */
export const signedInAt = (home: string): Promise<boolean> =>
  Bun.file(signInFileIn(home)).exists();

/** The line agy's log says when its auth chain took the OS keyring's sign-in (`assets/cbec55e2/REPORT.md`). */
const KEYRING_SIGN_IN = "authenticated via keyring";

/** The sign-in file of the agy home `home` (core paths/harnesses.ts `agySignInFile`). */
const signInFileIn = (home: string): string =>
  join(home, AGY_APP_DATA, AGY_SIGN_IN_FILE);

/** Whether any of `home`'s agy logs written since `since` says agy took the keyring's sign-in. */
const keyringUsedSince = async (
  home: string,
  since: number
): Promise<boolean> => {
  const dir = join(home, AGY_APP_DATA, "log");
  const names = await readdir(dir).catch((): string[] => []);
  for (const name of names) {
    const file = Bun.file(join(dir, name));
    if (
      file.lastModified >= since &&
      (await file.text().catch(() => "")).includes(KEYRING_SIGN_IN)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * The guard after every start: a home that held no sign-in of its own, whose
 * agy then took the machine's keyring sign-in, is no account's. agy is
 * ended, the sign-in file it wrote removed, and the start refused. A home
 * whose own sign-in was there when agy started is left as it is: agy loads
 * it through the same chain.
 */
export const refuseKeyring = async (guard: KeyringGuard): Promise<void> => {
  if (guard.signedIn || !(await keyringUsedSince(guard.home, guard.since))) {
    return;
  }
  guard.end();
  await rm(signInFileIn(guard.home), { force: true });
  throw new Error(agyWords.keyringRefused);
};

/** agy's process group ended: agy and everything it started. */
export const endGroup = (child: AgyChild): void => {
  const pid = spawnedPid(child);
  if (pid !== undefined) {
    signalGroup(pid, "SIGTERM");
  }
};

/**
 * The conversation `sessionId` agy made in `home`, removed: its store, its
 * working files, its title (`annotations/<id>.pbtxt`) and its row in agy's
 * conversation summaries (`conversation_summaries.db`, keyed by `conversation_id`; what an image run
 * left there, the project's `assets/bbb39c69/after-runs-cawco-whole.txt`).
 * For a run that is no session of the person's (a models read, an image),
 * so it never shows as a conversation.
 */
export const removeAgyConversation = async (
  home: string,
  sessionId: string
): Promise<void> => {
  const data = join(home, AGY_APP_DATA);
  const store = join(data, "conversations", `${sessionId}.db`);
  // The store, and the write-ahead log and index SQLite keeps beside it.
  await Promise.all(
    ["", "-wal", "-shm"].map((end) => rm(`${store}${end}`, { force: true }))
  );
  await rm(join(data, "brain", sessionId), { recursive: true, force: true });
  await rm(join(data, "annotations", `${sessionId}.pbtxt`), { force: true });
  forgetSummary(join(data, "conversation_summaries.db"), sessionId);
};

/** Conversation `sessionId`'s row gone from agy's summaries at `file`; nothing when it has none or no such store. */
const forgetSummary = (file: string, sessionId: string): void => {
  if (!existsSync(file)) {
    return;
  }
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.try(() => new Database(file)),
      (database) =>
        Effect.try(() =>
          database
            .query(
              "DELETE FROM conversation_summaries WHERE conversation_id = ?"
            )
            .run(sessionId)
        ),
      (database) => Effect.sync(() => database.close())
    ).pipe(
      // Its store agy's to change: a row left is said, never a failed run.
      Effect.catch((error) =>
        Effect.logWarning(
          `[agy] conversation ${sessionId}'s summary stayed in ${file}: ${String(error)}`
        )
      )
    )
  );
};
