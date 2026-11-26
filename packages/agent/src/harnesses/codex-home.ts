/**
 * The Codex homes CawCo keeps: one per account (`CODEX_HOME`, core
 * `codexAccountHome`), each signed in by Codex itself, and the one thread
 * store every home on the machine shares (core `codexStoreDir`). What goes
 * in each home is CawCo's own config: no file of the person's `~/.codex` is
 * read or written.
 *
 * Codex's own sign-in (the owner's pick, 2026-11-17): a ChatGPT account
 * signs in with Codex's device code (`account/login/start
 * {type:"chatgptDeviceCode"}`), an API-key account by the key handed to
 * Codex (`{type:"apiKey"}`), each into its own home, where Codex keeps it in
 * its `auth.json`. CawCo never reads that file: it asks Codex who is signed
 * in (`account/read`).
 *
 * The probes this rests on are the Codex audit's (project assets
 * `f1ed8995/codex-harness-parity.md`): C-acct (one sign-in per home), C-k2
 * and C-k3 (a clone is marked untrusted before its first thread, or Codex
 * trusts it and runs its `.codex/config.toml` on the host), C-a2 to C-a4 (a
 * workspace's tools run in an execution environment `environments.toml`
 * names, read once as the app-server starts). The shared store: `sqlite_home`
 * and a `sessions` link, a thread begun in one home resumed and continued in
 * another (2026-11-17, Codex 0.169.0 against a scripted model).
 */
import { existsSync, readdirSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderSigninResult } from "@cawco/core/accounts";
import { boundedRead } from "@cawco/core/effect/bounded";
import { makeFolder } from "@cawco/core/folders";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { accountsRoot } from "@cawco/core/paths/claude";
import {
  codexAccountHome,
  codexFleetRoot,
  codexStoreDir,
} from "@cawco/core/paths/harnesses";
import { hostEnvironment } from "@cawco/core/session-env";
import { shellQuote } from "@cawco/core/shell-quote";
import { writeStateFile } from "@cawco/core/state-file";
import type { ToolSpec } from "@cawco/core/tools";
import { toolSpec } from "@cawco/core/tools";
import { Deferred, Effect, Exit } from "effect";
import { type NativeBinary, nativeEnv } from "../codex-native";
import { runPromise } from "../daemon-runtime";
import { resolveBin, runnable, toolGate, toolPath } from "../tools";
import type * as V2 from "./codex-protocol/v2.gen";
import { type CodexPeer, withAppServer } from "./codex-rpc";
import { pointLink } from "./fleet-common";

const CODEX_TOOL = toolSpec("codex");
if (!CODEX_TOOL) {
  throw new Error("The tool catalog names no codex");
}
/** Codex's catalog entry: its version gate (tools.ts `toolGate`) reads it. */
export const CODEX_SPEC: ToolSpec = CODEX_TOOL;

/** The `codex` on the machine's PATH. */
const codexOnPath = (): string | undefined => resolveBin("codex");

/** The native Codex binary a start runs, and the environment its launcher would have given it. */
export type CodexStart = Extract<NativeBinary, { kind: "native" }>;

/**
 * The Codex a session starts on: the native binary the machine's `codex`
 * fronts, as `@openai/codex`'s launcher finds it (tools.ts `runnable`,
 * codex-native.ts `codexNative`), so no `node` is needed; refused unless it
 * is the one release CawCo runs (core `CODEX_VERSION`), in the gate's own
 * words. The launcher itself is never run.
 */
export const codexToStart = async (): Promise<CodexStart> => {
  const gate = await toolGate(CODEX_SPEC);
  if (gate.refused) {
    throw new Error(gate.words);
  }
  const run = gate.path ? runnable(CODEX_SPEC, gate.path) : undefined;
  if (run?.kind !== "native") {
    throw new Error("Codex isn't installed on this machine.");
  }
  return run;
};

/** Why a Codex session needs an account, in the words its start is refused with. */
export const CODEX_NEEDS_ACCOUNT =
  "Codex runs on an account of yours: sign a ChatGPT account or an OpenAI API key in for Codex on this machine, and start it on that account. Nothing was started.";

/**
 * Codex's environment variables that would sign it in or point it at
 * another home behind CawCo's back: each home's own sign-in is the only one
 * a session runs on.
 */
const CODEX_OWN_ENV = [
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_BASE_URL",
  "CODEX_HOME",
] as const;

/**
 * The environment `codex` runs with for account `accountId`: the host's,
 * its own sign-in variables gone, with what its launcher would have set
 * (`codex.env`) and its home named.
 */
export const codexEnv = (
  codex: CodexStart,
  accountId: string,
  extra: Readonly<Record<string, string>> = {}
): Record<string, string> => {
  const env = hostEnvironment();
  for (const name of CODEX_OWN_ENV) {
    delete env[name];
  }
  return nativeEnv(
    { ...env, PATH: toolPath(), ...extra },
    { ...codex.env, CODEX_HOME: codexAccountHome(accountId) }
  );
};

/** One execution environment a home's `environments.toml` names: a workspace's boundary running `codex exec-server`. */
export interface CodexEnvironment {
  readonly args: readonly string[];
  readonly id: string;
  readonly program: string;
}

/** The id of workspace `workspace`'s execution environment. */
export const environmentId = (workspace: string): string =>
  `cawco-${workspace}`;

/**
 * Workspace `workspace`'s execution environment: its executor (`exec
 * --claude`, which hands its stdin to the command, as a Claude session's
 * stdio MCP servers get theirs: boundary/exec.ts `execScript`) running
 * `codex exec-server --listen stdio` inside the boundary. Every shell
 * command, file edit and picture read of a thread in it runs there, and a
 * subagent's too (C-a2, C-j, C-v).
 */
export const workspaceEnvironment = (
  workspace: string,
  exec: string,
  codex: string
): CodexEnvironment => ({
  id: environmentId(workspace),
  program: exec,
  args: ["--claude", `${shellQuote(codex)} exec-server --listen stdio`],
});

/** Per home, the writes in flight, so two starts never interleave one file's read and write. */
const writing = makeKeyedLock<string>();
const serial = <T>(home: string, work: () => Promise<T>): Promise<T> =>
  writing.run(home, work);

type Toml = Record<string, unknown>;

const isTable = (value: unknown): value is Toml =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readToml = async (path: string): Promise<Toml> => {
  try {
    const parsed: unknown = Bun.TOML.parse(await readFile(path, "utf8"));
    return isTable(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** `link` pointing at `target`, made or put right. */
const linkTo = async (link: string, target: string): Promise<void> => {
  await makeFolder(target);
  await pointLink(link, target);
};

/**
 * CawCo's settings in a home's `config.toml`, over what Codex itself wrote
 * there (its trust of each folder, its hooks' trust): analytics and the
 * update check off, the sign-in kept in the home's file, the shared store's
 * SQLite dir, and each clone in `untrust` marked untrusted (C-k3).
 *
 * Plugins are off (`[features] plugins`, on by default): each app-server
 * otherwise syncs OpenAI's plugin marketplace as it starts (Codex 0.169.0
 * core-plugins `maybe_start_curated_repo_sync_for_config`, gated on
 * `plugins_enabled`), a `git ls-remote https://github.com/openai/plugins.git`
 * from the host, outside any boundary, once per session. CawCo hands Codex
 * its skills and tools itself and installs no Codex plugin.
 *
 * Commands run in a plain shell (`allow_login_shell = false`), not
 * `bash -lc`: inside a boundary the login profile adds no PATH entry (the
 * app-server's environment, on `toolPath`, carries it, and the boundary hides
 * `~/.profile`), and on desktop Ubuntu its `im-config` script's
 * `systemd-cat`, cut off from journald, put three "Failed to create stream
 * fd" lines before every command's output.
 */
const CAWCO_CONFIG: Toml = {
  allow_login_shell: false,
  check_for_update_on_startup: false,
  cli_auth_credentials_store: "file",
  analytics: { enabled: false },
};

/** Codex's feature flags CawCo sets, over the home's own `[features]`. */
const CAWCO_FEATURES: Toml = { plugins: false };

/** What a launch writes into its home first. */
export interface HomeLaunch {
  /** The execution environments the launch's thread may name, kept beside those of the home's other live workspaces. */
  readonly environments?: readonly CodexEnvironment[];
  /** Folders whose project config Codex must never load: marked untrusted before the thread starts. */
  readonly untrust?: readonly string[];
}

/**
 * Account `accountId`'s Codex home, ready for an app-server to start in:
 * made, linked to the shared thread store and the fleet's skills and rules,
 * its `config.toml` and `environments.toml` written. Returns the home.
 */
export const prepareHome = (
  accountId: string,
  launch: HomeLaunch = {}
): Promise<string> => {
  const home = codexAccountHome(accountId);
  return serial(home, async () => {
    await makeFolder(home);
    const store = codexStoreDir();
    await makeFolder(join(store, "db"));
    await linkTo(join(home, "sessions"), join(store, "sessions"));
    await linkTo(join(home, "skills"), join(codexFleetRoot(), "skills"));
    const configPath = join(home, "config.toml");
    const held = await readToml(configPath);
    const config = { ...held, ...CAWCO_CONFIG };
    config.features = {
      ...(isTable(held.features) ? held.features : {}),
      ...CAWCO_FEATURES,
    };
    config.sqlite_home = join(store, "db");
    const projects = isTable(config.projects) ? { ...config.projects } : {};
    for (const folder of launch.untrust ?? []) {
      projects[folder] = { trust_level: "untrusted" };
    }
    if (Object.keys(projects).length > 0) {
      config.projects = projects;
    }
    await writeStateFile(configPath, Bun.TOML.stringify(config), {
      mode: 0o600,
    });
    await writeEnvironments(home, launch.environments ?? []);
    return home;
  });
};

/**
 * The home's `environments.toml`: its local environment, and an
 * environment per workspace a session of it runs in. Codex reads the file
 * once, as an app-server starts (C-a4), so every launch's file names the
 * environments of the home's other live workspaces too: one whose program
 * (its executor) is gone with its workspace is dropped.
 */
const writeEnvironments = async (
  home: string,
  wanted: readonly CodexEnvironment[]
): Promise<void> => {
  const path = join(home, "environments.toml");
  const held = await readToml(path);
  const kept = new Map<string, CodexEnvironment>();
  for (const entry of Array.isArray(held.environments)
    ? held.environments
    : []) {
    if (
      isTable(entry) &&
      typeof entry.id === "string" &&
      typeof entry.program === "string" &&
      Array.isArray(entry.args) &&
      existsSync(entry.program)
    ) {
      kept.set(entry.id, {
        id: entry.id,
        program: entry.program,
        args: entry.args.map(String),
      });
    }
  }
  for (const environment of wanted) {
    kept.set(environment.id, environment);
  }
  await writeStateFile(
    path,
    Bun.TOML.stringify({
      default: "local",
      include_local: true,
      environments: [...kept.values()].map((one) => ({
        id: one.id,
        program: one.program,
        args: [...one.args],
      })),
    }),
    { mode: 0o600 }
  );
};

/** `work` against a one-off app-server in account `accountId`'s home. */
const inHome = async <T>(
  accountId: string,
  work: (peer: CodexPeer) => Promise<T>,
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<T> => {
  const codex = await codexToStart();
  await prepareHome(accountId);
  return await withAppServer(
    codex.bin,
    codexEnv(codex, accountId),
    work,
    options
  );
};

/** Who account `accountId`'s Codex home is signed in as, in Codex's own words; null when signed out. */
const codexSignedIn = (
  accountId: string
): Promise<V2.GetAccountResponse["account"]> =>
  inHome(accountId, async (peer) => {
    const read = await peer.request("account/read", { refreshToken: false });
    return read.account;
  });

/** A device-code sign-in waiting for the person, held until it ends. */
interface CodexSignIn {
  readonly done: Deferred.Deferred<"done" | "expired" | Error>;
  readonly end: () => void;
  readonly expiresAt: number;
}

const signIns = new Map<string, CodexSignIn>();

/** How long Codex's device code is good for (OpenAI's device flow: 15 minutes). */
const DEVICE_CODE_MS = 15 * 60_000;

/**
 * Starts Codex's own device-code sign-in in account `accountId`'s home: the
 * page and code the person enters on any device. The app-server that asked
 * stays up until Codex says the sign-in ended, or the code expires.
 */
export const beginCodexLogin = async (
  accountId: string
): Promise<{
  expiresAt: number;
  userCode: string;
  verificationUrl: string;
}> => {
  signIns.get(accountId)?.end();
  signIns.delete(accountId);
  const codex = await codexToStart();
  await prepareHome(accountId);
  // The page and code Codex shows; how the sign-in ended; and its stop,
  // which a later begin, a completion or a sign-out says.
  const challenge = Deferred.makeUnsafe<
    { userCode: string; verificationUrl: string },
    Error
  >();
  const done = Deferred.makeUnsafe<"done" | "expired" | Error>();
  const stopped = Deferred.makeUnsafe<void>();
  const ended = (outcome: "done" | "expired" | Error): void => {
    Deferred.doneUnsafe(done, Exit.succeed(outcome));
  };
  const expiresAt = Date.now() + DEVICE_CODE_MS;
  withAppServer(
    codex.bin,
    codexEnv(codex, accountId),
    async (peer) => {
      const started = await peer.request("account/login/start", {
        type: "chatgptDeviceCode",
      });
      if (started.type !== "chatgptDeviceCode") {
        throw new Error(
          `Codex started a ${started.type} sign-in, not a device code.`
        );
      }
      Deferred.doneUnsafe(challenge, Exit.succeed(started));
      // The promise edge of the wait for the sign-in's end, or its stop.
      await runPromise(
        Effect.raceFirst(Deferred.await(done), Deferred.await(stopped))
      );
    },
    {
      timeoutMs: DEVICE_CODE_MS,
      notification: (message) => {
        if (message.method === "account/login/completed") {
          ended(
            message.params.success
              ? "done"
              : new Error(message.params.error ?? "Codex's sign-in failed.")
          );
        }
      },
    }
  ).then(
    () => ended("expired"),
    (error: unknown) => {
      const why = error instanceof Error ? error : new Error(String(error));
      Deferred.doneUnsafe(challenge, Exit.fail(why));
      ended(why);
    }
  );
  // The promise edge of the wait for Codex's page and code.
  const first = await runPromise(Deferred.await(challenge));
  signIns.set(accountId, {
    done,
    end: () => Deferred.doneUnsafe(stopped, Exit.void),
    expiresAt,
  });
  return { ...first, expiresAt };
};

/** How long a completion waits on the person before it says the sign-in still waits. */
const COMPLETE_WAIT_MS = 60_000;

/**
 * Waits up to a minute for the person to finish account `accountId`'s
 * device-code sign-in, and says how it stands: signed in (who, as Codex
 * says), still waiting, or ended.
 */
export const completeCodexLogin = async (
  accountId: string
): Promise<ProviderSigninResult> => {
  const signIn = signIns.get(accountId);
  if (!signIn) {
    return { state: "expired" };
  }
  // The promise edge of the wait on the person: a minute, then "still waiting".
  const outcome = await runPromise(
    boundedRead(COMPLETE_WAIT_MS, Deferred.await(signIn.done)).pipe(
      Effect.catchTag("Unanswered", () => Effect.succeed(undefined))
    )
  );
  if (outcome === undefined) {
    return Date.now() < signIn.expiresAt
      ? { state: "pending" }
      : { state: "expired" };
  }
  signIns.delete(accountId);
  signIn.end();
  if (outcome === "expired") {
    return { state: "expired" };
  }
  if (outcome instanceof Error) {
    throw outcome;
  }
  const account = await codexSignedIn(accountId);
  const chatgpt = account?.type === "chatgpt" ? account : undefined;
  return {
    state: "signed-in",
    email: chatgpt?.email ?? null,
    identity: null,
    plan: chatgpt?.planType ?? null,
  };
};

/**
 * An OpenAI API key handed to Codex for account `accountId`'s home: Codex
 * keeps it there (`account/login/start {type:"apiKey"}`).
 */
const setCodexKey = async (accountId: string, key: string): Promise<void> => {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("The key is empty.");
  }
  await inHome(accountId, async (peer) => {
    await peer.request("account/login/start", {
      type: "apiKey",
      apiKey: trimmed,
    });
  });
};

/**
 * An OpenAI key an account was given, handed to its Codex home as well
 * (`setCodexKey`) where the machine runs Codex: a key account runs Codex
 * sessions too. Any other provider's key is none of Codex's. One Codex
 * could not take is said on the log; the key's own store holds it still.
 */
export const keyCodexHome = async (
  accountId: string,
  provider: string,
  key: string
): Promise<void> => {
  if (provider !== "openai" || !codexOnPath()) {
    return;
  }
  await setCodexKey(accountId, key).catch((error: unknown) =>
    console.warn(
      `[codex] account ${accountId}: its Codex home did not take the key: ${error instanceof Error ? error.message : String(error)}`
    )
  );
};

/**
 * Codex signs itself out of account `accountId`'s home (`account/logout`),
 * a device-code sign-in still waiting there ended first. Where Codex can't
 * start (gone from the machine, or a release CawCo doesn't run), its
 * sign-in file is deleted unread. A home with no sign-in is left as it is.
 */
export const forgetCodexLogin = async (accountId: string): Promise<void> => {
  signIns.get(accountId)?.end();
  signIns.delete(accountId);
  const auth = join(codexAccountHome(accountId), "auth.json");
  if (!existsSync(auth)) {
    return;
  }
  const gate = await toolGate(CODEX_SPEC);
  if (gate.refused || !codexOnPath()) {
    await rm(auth, { force: true });
    return;
  }
  await inHome(accountId, async (peer) => {
    await peer.request("account/logout", undefined);
  });
};

/**
 * The accounts whose Codex home on this machine holds a Codex sign-in: its
 * `auth.json` there, which Codex writes at a sign-in (a ChatGPT account's
 * or an OpenAI key's) and removes at a sign-out. Found, never read: CawCo
 * never reads the token (the owner's pick "Codex's own sign-in",
 * 2026-11-17). The hub reads it as where each account runs Codex.
 */
export const codexSignedInAccounts = (): string[] => {
  try {
    return readdirSync(accountsRoot(), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(codexAccountHome(entry.name), "auth.json"))
      )
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }
};

/** Ends every device-code sign-in still waiting, for the daemon's exit. */
export const endCodexSignIns = (): void => {
  for (const signIn of signIns.values()) {
    signIn.end();
  }
  signIns.clear();
};
