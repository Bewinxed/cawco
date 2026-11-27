import { createHash } from "node:crypto";
import {
  lstat,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  symlink,
} from "node:fs/promises";
import { platform, userInfo } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { query, type SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import {
  type AccountCheck,
  type AccountIdentity,
  type AccountKind,
  type AccountProbe,
  type AccountReport,
  identityOf,
} from "@cawco/core/accounts";
import { QUIET_MS } from "@cawco/core/bounded";
import { boundedWhileLive, Gone, Unanswered } from "@cawco/core/effect/bounded";
import { makeJoin } from "@cawco/core/effect/join";
import { makeFolder } from "@cawco/core/folders";
import type { MachineHarnessReport } from "@cawco/core/harness";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import {
  accountClaudeJson,
  accountConfigDir,
  accountIds,
  claudeHome,
  removeAccountRoot,
  sessionConfigDir,
  USER_LAYER_DIRS,
  USER_LAYER_FILES,
  USER_LAYER_LEFT_DIRS,
  userLayerPath,
} from "@cawco/core/paths/claude";
import { hostEnvironment } from "@cawco/core/session-env";
import type { AuthState } from "@cawco/core/session-messages";
import { shortId } from "@cawco/core/short-id";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { configurePage } from "@cawco/core/words/configure";
import type { Subprocess } from "bun";
import { Effect, Schema, type Scope } from "effect";
import { z } from "zod";
import { idle } from "./auth";
import { retireConfigDir } from "./claude-sessions";
import { ClaudeRefused, claudeToStart } from "./claude-version";
import { runPromise } from "./daemon-runtime";
import {
  keychainLockState,
  type LockUnread,
  loginKeychainPath,
} from "./login-keychain";
import { probeStarted } from "./probe-count";
import { fromPromise, type Rejected } from "./rejected";

/**
 * An account's Claude Code on this machine: its config dir, which holds its
 * own credential (made by Claude Code's own `claude auth login`), transcripts
 * and `.claude.json`, with the fleet's user layer linked in from
 * {@link claudeHome}.
 * Who a dir is signed in as comes from Claude Code's own `auth status` and
 * initialize response. The one read of the credential itself is its access
 * token, for one request to Anthropic's usage endpoint (usage/anthropic.ts);
 * CawCo never writes or renews it: Claude Code does, under its own lock.
 */

/** The env that points Claude Code at an account's dir. */
export const accountEnv = (account: string): Record<string, string> => ({
  CLAUDE_CONFIG_DIR: accountConfigDir(account),
});

/**
 * The process env with neither of the config-dir variables Claude Code
 * reads (`CLAUDE_CONFIG_DIR`, and `CLAUDE_SECURESTORAGE_CONFIG_DIR`, which
 * overrides where its credential is kept): every Claude Code CawCo runs is
 * told its dir, never inherits one.
 */
export const bareEnv = (): Record<string, string | undefined> => {
  const {
    CLAUDE_CONFIG_DIR: _dir,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: _store,
    ...rest
  } = process.env;
  return rest;
};

/** The process env with the account's dir in place of any the agent itself carries. */
const envFor = (account: string): Record<string, string | undefined> => ({
  ...bareEnv(),
  ...accountEnv(account),
});

/**
 * What `claude auth status --json` said for a config dir: its sign-in, or
 * `unread` with the sentence why it says nothing of one (the version gate
 * refused to run it, or it printed nothing it could mean), or `locked`: it
 * was not asked, its login being in the locked login keychain
 * ({@link lockedAway}). None is signed out.
 */
export type AuthStatus =
  | {
      kind: "signin";
      loggedIn: boolean;
      authMethod?: string;
      identity?: AccountIdentity;
    }
  | { kind: "unread"; why: string }
  | { kind: "locked"; why: string };

/** Who each config dir was signed in as at its last `auth status` read, by the dir. */
const dirIdentities = new Map<string, AccountIdentity>();

/**
 * Who a Claude Code process running in config dir `dir` says it is (its
 * initialize response's `said`, which names no organization id), with the
 * organization id of the dir's own login as its last `auth status` read it,
 * when that login is the same email: one login, read twice. Another email,
 * or no read yet, leaves the id unknown, and such an identity is the same as
 * no other (core `sameIdentity`).
 */
export const dirIdentity = (
  dir: string | undefined,
  said: AccountIdentity | undefined
): AccountIdentity | undefined => {
  const read = dir === undefined ? undefined : dirIdentities.get(dir);
  return said && read?.email.toLowerCase() === said.email.toLowerCase()
    ? { ...said, orgId: read.orgId }
    : said;
};

/**
 * Who an `auth status` answer says its dir is signed in as, kept for the dir
 * (`configDir`, its `CLAUDE_CONFIG_DIR`; none for the machine's own) as
 * {@link dirIdentity} reads it. `email`, `orgName` and `orgId` are the
 * login's `emailAddress`, `organizationName` and `organizationUuid`. The id
 * is what the identity is keyed on (core `sameIdentity`); its initialize
 * response names none, so this read is the one that says who a dir is.
 */
const signedInAs = (
  status: NonNullable<ReturnType<typeof statusIn>>,
  configDir: string | undefined
): AccountIdentity | undefined => {
  const identity =
    status.loggedIn && typeof status.email === "string"
      ? identityOf({
          email: status.email,
          ...(typeof status.orgName === "string"
            ? { organization: status.orgName }
            : {}),
          ...(typeof status.orgId === "string" ? { orgId: status.orgId } : {}),
        })
      : undefined;
  if (configDir && identity) {
    dirIdentities.set(configDir, identity);
  } else if (configDir) {
    dirIdentities.delete(configDir);
  }
  return identity;
};

/** The sentence for a sign-in read of `dir` that gave no answer in time, or ended before it answered. */
const noAuthAnswer = (
  dir: string,
  { after, reason }: { after: number; reason: "timeout" | "dead" }
): string =>
  reason === "timeout"
    ? `The sign-in of ${dir} was not read: the keychain looks and \`claude auth status\` said nothing for ${secondsOf(QUIET_MS)} s (let go after ${after} ms).`
    : `The sign-in read of ${dir} ended before it answered (\`claude auth status\` or a keychain look ended by a signal), after ${after} ms. Its sign-in was not read.`;

/**
 * The sentence for a sign-in read of `dir` whose `claude auth status` was
 * not run: the gate refused this machine's Claude Code, `why`
 * (claude-version.ts `claudeToStart`).
 */
const authStatusNotRun = (dir: string, why: string): string =>
  `\`claude auth status\` was not run for ${dir}: ${why} Its sign-in was not read.`;

const AUTH_STATUS = z.object({
  loggedIn: z.boolean(),
  authMethod: z.unknown(),
  email: z.unknown(),
  orgId: z.unknown(),
  orgName: z.unknown(),
});

/** `claude auth status --json`'s output read as an answer, or undefined when it is none (no JSON, no `loggedIn`). */
const statusIn = (
  output: string
):
  | {
      loggedIn: boolean;
      authMethod?: unknown;
      email?: unknown;
      orgId?: unknown;
      orgName?: unknown;
    }
  | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  const status = AUTH_STATUS.safeParse(parsed);
  return status.success ? status.data : undefined;
};

/**
 * What `claude auth status --json` says, run in `env` (its config dir is
 * `dir`): signed in, how, and as whom ({@link AuthStatus}). Unanswered when
 * the read went a quiet spell with no answer (core bounded.ts `QUIET_MS`,
 * the keychain looks included, and however the process then took its
 * end), or something else
 * ended it before it answered: `unread`, with {@link noAuthAnswer}'s
 * sentence. Not run, and `locked`, when the dir's login is in the locked
 * login keychain ({@link lockedAway}).
 */
export const authStatus = Effect.fn("authStatus")(function* (
  env: Record<string, string | undefined>,
  dir: string
) {
  const executable = yield* fromPromise(() => claudeToStart()).pipe(
    Effect.catchIf(
      (error) => error.cause instanceof ClaudeRefused,
      (error) => Effect.succeed({ refused: error.message })
    )
  );
  if (typeof executable !== "string") {
    return {
      kind: "unread",
      why: authStatusNotRun(dir, executable.refused),
    } satisfies AuthStatus;
  }
  return yield* boundedWhileLive(() => statusOfDir(executable, env, dir)).pipe(
    Effect.catchTag("Unanswered", (none) =>
      Effect.succeed<AuthStatus>({
        kind: "unread",
        why: noAuthAnswer(dir, none),
      })
    )
  );
});

/** The promise edge of {@link authStatus}. */
export const authStatusIn = (
  env: Record<string, string | undefined>,
  dir: string
): Promise<AuthStatus> => runPromise(authStatus(env, dir));

/** `claude auth status --json` that did not start. */
class AuthStatusFailed extends Schema.TaggedError<AuthStatusFailed>()(
  "AuthStatusFailed",
  { message: Schema.String, cause: Schema.Defect() }
) {}

/**
 * {@link authStatus}'s read, inside its deadline: the keychain looks first
 * ({@link lockedAway}), then `executable auth status --json`, held for the
 * read and ended when the deadline lets it go.
 */
const statusOfDir = Effect.fn("statusOfDir")(function* (
  executable: string,
  env: Record<string, string | undefined>,
  dir: string
): Effect.fn.Return<
  AuthStatus,
  Gone | LockUnread | KeychainLookFailed | AuthStatusFailed,
  Scope.Scope
> {
  if (yield* lockedAway(serviceOf(env.CLAUDE_CONFIG_DIR))) {
    return {
      kind: "locked",
      why: `\`claude auth status\` was not run for ${dir}: its login is in the login keychain, which is locked, and Claude Code reads it only by unlocking it. Its sign-in was not read.`,
    };
  }
  const child = yield* heldChild(
    () =>
      Bun.spawn([executable, "auth", "status", "--json"], {
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      }),
    (cause) =>
      new AuthStatusFailed({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      })
  );
  const [output] = yield* Effect.promise(() =>
    Promise.all([new Response(child.stdout).text(), child.exited])
  );
  if (child.signalCode !== null) {
    return yield* new Gone({
      what: `claude auth status for ${dir} (${child.signalCode})`,
    });
  }
  const status = statusIn(output);
  if (!status) {
    return {
      kind: "unread",
      why: `Claude Code answered \`claude auth status\` for ${dir} with no JSON carrying a loggedIn (exit ${child.exitCode}). Its sign-in was not read.`,
    };
  }
  // It "Exits with code 0 if logged in, 1 if not"
  // (https://code.claude.com/docs/en/cli): an exit that says otherwise
  // than its JSON leaves neither read.
  if (status.loggedIn !== (child.exitCode === 0)) {
    return {
      kind: "unread",
      why: `Claude Code answered \`claude auth status\` for ${dir} with loggedIn ${status.loggedIn} but exit ${child.exitCode}, which say opposite things. Its sign-in was not read.`,
    };
  }
  const identity = signedInAs(status, env.CLAUDE_CONFIG_DIR);
  return {
    kind: "signin",
    loggedIn: status.loggedIn,
    ...(typeof status.authMethod === "string"
      ? { authMethod: status.authMethod }
      : {}),
    ...(identity ? { identity } : {}),
  };
}, Effect.scoped);

/**
 * A child `spawn` starts, held for a read in the caller's scope: ended
 * when the scope closes while it still runs, as a spawn's `signal` ended
 * it. A spawn that throws fails with `failed`'s error.
 */
export const heldChild = <C extends Subprocess, E>(
  spawn: () => C,
  failed: (cause: unknown) => E
): Effect.Effect<C, E, Scope.Scope> =>
  Effect.acquireRelease(Effect.try({ try: spawn, catch: failed }), (child) =>
    Effect.sync(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    })
  );

/** A dir signed in through `claude auth login --console` reports a method other than claude.ai. */
export const kindOf = (
  authMethod: string | undefined
): AccountKind | undefined => {
  if (!authMethod || authMethod === "none") {
    return undefined;
  }
  return authMethod === "claude.ai" ? "subscription" : "console";
};

/**
 * The sign-ins this agent is changing (a sign-in begun or finished, a dir
 * signed out, a login moved or joined into an account), and how many
 * changes have begun or ended: a report read across one says what a dir was
 * before it, and the hub would take that over what the change settled.
 */
const signinChanges = new Set<Promise<unknown>>();
let signinChanged = 0;

/** What hears each change to this machine's account dirs end ({@link onSigninsChanged}). */
const signinListeners = new Set<() => void>();

/** Listens for the end of each change to this machine's account dirs ({@link changingSignins}); answers the way to stop. */
export const onSigninsChanged = (listener: () => void): (() => void) => {
  signinListeners.add(listener);
  return () => signinListeners.delete(listener);
};

/** Runs a change to this machine's account dirs as one {@link accountReports} waits out. */
export const changingSignins = <T>(change: Promise<T>): Promise<T> => {
  signinChanges.add(change);
  signinChanged += 1;
  const over = () => {
    signinChanges.delete(change);
    signinChanged += 1;
    for (const listener of signinListeners) {
      listener();
    }
  };
  change.then(over, over);
  return change;
};

/**
 * What one read of the machine's account dirs found: each dir Claude Code
 * answered for, and the dirs whose sign-in was not read ({@link
 * authStatusIn} unanswered, answered with nothing of a sign-in, or not asked
 * for a login in the locked keychain), which are neither signed in nor out:
 * the hub keeps what it last had for each. `locked` names the unread ones
 * whose login is in the locked keychain.
 */
export interface AccountsRead {
  accounts: AccountReport[];
  locked: string[];
  unread: string[];
}

/** The account dirs whose last read went unanswered, so each is said once until it answers again. */
const unanswered = new Set<string>();

/** A dir whose sign-in was not read, and whether its login is in the locked keychain. */
interface Unread {
  account: string;
  locked: boolean;
}

/** A dir whose sign-in was not read, said once per streak with `why`. */
const unreadAccount = (
  account: string,
  why: string,
  locked: boolean
): Unread => {
  if (!unanswered.has(account)) {
    unanswered.add(account);
    console.warn(`[accounts] ${why}`);
  }
  return { account, locked };
};

/** One account dir read, or the dir unread (said once). */
const readAccount = async (
  account: string
): Promise<AccountReport | Unread> => {
  const dir = accountConfigDir(account);
  const status = await authStatusIn(envFor(account), dir);
  switch (status.kind) {
    case "unread":
      return unreadAccount(account, status.why, false);
    case "locked":
      return unreadAccount(account, status.why, true);
    case "signin": {
      unanswered.delete(account);
      const kind = kindOf(status.authMethod);
      return {
        account,
        loggedIn: status.loggedIn,
        ...(kind ? { kind } : {}),
        ...(status.identity ? { identity: status.identity } : {}),
      };
    }
    default:
      unhandled("status", status);
  }
};

/**
 * Every account dir on this machine and whether it is signed in, read when
 * no sign-in is changing here and again when one changed while it was read.
 */
export const accountReports = async (): Promise<AccountsRead> => {
  probeStarted();
  for (;;) {
    await Promise.allSettled([...signinChanges]);
    const seen = signinChanged;
    const read = await Promise.all(accountIds().map(readAccount));
    if (seen === signinChanged) {
      const unread = read.filter((one): one is Unread => "locked" in one);
      return {
        accounts: read.filter(
          (one): one is AccountReport => !("locked" in one)
        ),
        locked: unread.filter((one) => one.locked).map((one) => one.account),
        unread: unread.map((one) => one.account),
      };
    }
  }
};

/**
 * The user name Claude Code files its Keychain item under: `$USER`, else the
 * login's, and `claude-code-user` when that is not `[a-zA-Z0-9._-]+`. Read
 * from Claude Code 2.1.289's own `I9()` (its CLI's source) and
 * https://github.com/musistudio/claude-code-router/issues/1601.
 */
export const keychainUser = (): string => {
  let user: string;
  try {
    user = process.env.USER || userInfo().username;
  } catch {
    return "claude-code-user";
  }
  return KEYCHAIN_USER.test(user) ? user : "claude-code-user";
};

/** A user name Claude Code files its Keychain item under as it is. */
const KEYCHAIN_USER = /^[a-zA-Z0-9._-]+$/u;

/**
 * The Keychain service Claude Code keeps an account dir's login under:
 * `Claude Code-credentials-` and the first 8 hex of the SHA-256 of the
 * NFC-normalized `CLAUDE_CONFIG_DIR` exactly as set (no tilde expansion,
 * https://github.com/anthropics/claude-code/issues/79223). Claude Code
 * 2.1.289's `tGe()`: `Claude Code${OAUTH_FILE_SUFFIX}-credentials-${sha256(dir).slice(0,8)}`;
 * also https://github.com/musistudio/claude-code-router/issues/1601.
 */
export const keychainService = (account: string): string =>
  serviceOf(accountConfigDir(account));

/** The default dir's Keychain service: no `CLAUDE_CONFIG_DIR`, no hash suffix. */
export const HOME_SERVICE = "Claude Code-credentials";

/** The Keychain service of the dir `CLAUDE_CONFIG_DIR` names, or of the default dir when it names none ({@link keychainService}). */
// @limit measured: 8 hex characters are 32 bits of SHA-256; the service names of one machine's accounts, so two collide after about 2^16 names
const serviceOf = (configDir: string | undefined): string =>
  configDir === undefined
    ? HOME_SERVICE
    : `${HOME_SERVICE}-${createHash("sha256")
        .update(configDir.normalize("NFC"))
        .digest("hex")
        .slice(0, 8)}`;

/** A keychain look that did not start. */
class KeychainLookFailed extends Schema.TaggedError<KeychainLookFailed>()(
  "KeychainLookFailed",
  { message: Schema.String, cause: Schema.Defect() }
) {}

/**
 * Whether the keychain holds the login item filed under `service`: its
 * attributes only (no `-w`), which read while the keychain is locked and
 * never touch the secret, so no prompt rises. A missing item exits 44.
 * The look is held for the read it is part of, and ended with it.
 */
const keychainHolds = Effect.fn("keychainHolds")(function* (
  service: string
): Effect.fn.Return<boolean, Gone | KeychainLookFailed, Scope.Scope> {
  const child = yield* heldChild(
    () =>
      Bun.spawn(
        [
          "security",
          "find-generic-password",
          "-a",
          keychainUser(),
          "-s",
          service,
        ],
        {
          env: hostEnvironment(),
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        }
      ),
    (cause) =>
      new KeychainLookFailed({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      })
  );
  yield* Effect.promise(() => child.exited);
  if (child.signalCode !== null) {
    return yield* new Gone({
      what: `security find-generic-password -s ${service} (${child.signalCode})`,
    });
  }
  return child.exitCode === 0;
}, Effect.scoped);

/**
 * The login keychain's lock as one read answers it to every account read
 * that asks while it runs: the lock is the machine's, so the accounts read at
 * once (7 on the owner's Mac) start one lock read, not one each. Its own
 * deadline is the sign-in budget, so it never outlives the reads that wait
 * on it; each of those is bounded by its own as well.
 */
const lockReads = makeJoin<"login", boolean, Gone | LockUnread>();

const loginLocked: Effect.Effect<boolean, Gone | LockUnread> = lockReads.run(
  "login",
  boundedWhileLive(() => keychainLockState(loginKeychainPath())).pipe(
    // The account read waiting on it ends unanswered with it.
    Effect.catchTag("Unanswered", ({ reason, after }) =>
      Effect.fail(
        new Gone({
          what: `the login keychain's lock read (${reason}, after ${after} ms)`,
        })
      )
    )
  )
);

/**
 * Whether the login filed under `service` is in the login keychain while it
 * is locked for this process: on macOS, the item is there and the keychain is
 * locked (login-keychain.ts, no secret, no UI). Claude Code reads a login
 * only with its secret (`security find-generic-password … -w`, CLI 2.1.302),
 * which on a locked keychain raises the unlock dialog inside the desktop
 * session and waits on it, so nothing that runs it in the background is
 * started on such a login. The item is read first: the lock is read only of
 * a keychain that holds one. Both looks run in processes of their own, off
 * the agent's JS thread, inside the deadline of the read they are part of.
 */
const lockedAway = Effect.fn("lockedAway")(function* (service: string) {
  if (platform() !== "darwin") {
    return false;
  }
  return (yield* keychainHolds(service)) && (yield* loginLocked);
});

/**
 * The machine's word on Claude, from its account dirs alone: authenticated
 * when any account is signed in here; else `unreadable-credentials` when a
 * dir's login is in the locked login keychain ({@link lockedAway}), whatever
 * the other dirs said; else, when some dir gave no answer, undefined (its
 * dirs have not said, and the hub keeps the machine's last word); else
 * unauthenticated. The machine's own `~/.claude` has no say.
 */
const claudeAuth = ({
  accounts,
  locked,
  unread,
}: AccountsRead): AuthState | undefined => {
  if (accounts.some((report) => report.loggedIn)) {
    return "authenticated";
  }
  if (locked.length > 0) {
    return "unreadable-credentials";
  }
  if (unread.length > 0) {
    return undefined;
  }
  return "unauthenticated";
};

/**
 * The sign-in part of Claude's harness report, from one read of the account
 * dirs: the dirs that answered, the ones that did not (`unreadAccounts`, which
 * the hub leaves as they were), and the machine's word on Claude when its
 * dirs settle it. The one place the report's sign-ins are made.
 */
export const claudeSignins = (
  read: AccountsRead
): Pick<MachineHarnessReport, "accounts" | "auth" | "unreadAccounts"> => {
  const auth = claudeAuth(read);
  return {
    accounts: read.accounts,
    ...(read.unread.length > 0 ? { unreadAccounts: read.unread } : {}),
    ...(auth ? { auth } : {}),
  };
};

/**
 * What a machine's agent says about its Claude accounts once it has read
 * them (daemon.ts `noteClaudeAuth`): nothing while a CawCo account
 * is signed in here; with none, the sentence pointing at Configure →
 * Accounts; on a Mac whose keychain refuses this process an account's login,
 * that.
 */
export const claudeAuthNote = (state: AuthState): string | undefined => {
  if (state === "authenticated") {
    return;
  }
  return state === "unreadable-credentials"
    ? "A Claude account is signed in on this machine, but this process can't read its login: it is in the login keychain, which opens only inside the desktop session. Run the daemon as a service (`cawco service install`)."
    : `No Claude account is signed in on this machine. Add one in ${configurePage("accounts")} and sign it in there.`;
};

/** Why an account dir's Claude Code is not started, in a sentence. */
class NotStarted extends Schema.TaggedError<NotStarted>()("NotStarted", {
  message: Schema.String,
}) {}

/**
 * Fails with the sentence why an account dir's Claude Code is not started
 * (`done`: "probed", "checked"): its login is in the locked login keychain
 * ({@link lockedAway}), or the keychain's look gave no answer in time. A
 * look that failed otherwise fails with its own error.
 */
export const startable = Effect.fn("startable")(function* (
  account: string,
  done: string
) {
  const away = yield* boundedWhileLive(() =>
    lockedAway(keychainService(account))
  ).pipe(
    Effect.catchTag("Unanswered", ({ after }: Unanswered) =>
      Effect.fail(
        new NotStarted({
          message: `${accountConfigDir(account)} was not ${done}: the keychain looks before it said nothing for ${secondsOf(QUIET_MS)} s (let go after ${after} ms).`,
        })
      )
    )
  );
  if (away) {
    return yield* new NotStarted({
      message: `${accountConfigDir(account)} was not ${done}: its login is in the login keychain, which is locked, and Claude Code reads it only by unlocking it.`,
    });
  }
});

/**
 * What the check asks: the shortest prompt that still gets a turn. Its
 * system prompt is the same words, so the request carries next to nothing
 * beyond them (no tools, no settings, no MCP servers, no CLAUDE.md).
 */
const CHECK_PROMPT = "Reply with OK.";

/**
 * Whether Claude Code answers as `account` now: one real turn in its dir,
 * which the API answers or refuses (the hub's check of an account Claude
 * Code refused account-wide, hub accounts.ts `checkRefusal`). Built on
 * {@link probeAccount}'s session (its dir's env, the version gate's
 * `claude`, no user settings, no MCP servers, nothing persisted) with a
 * prompt, as few tokens as a turn takes: Haiku, no tools, no thinking, its
 * own one-line system prompt, one turn. `answered` when the turn ended with
 * an answer; `error` with Claude Code's `SDKAssistantMessageError` and its
 * words when its error stood in for one. Throws when the turn neither
 * answered nor was refused while it gave messages (core bounded.ts
 * `QUIET_MS` with none lets it go), or never started,
 * which says nothing of the account.
 */
export const checkAccount = (account: string): Promise<AccountCheck> =>
  runPromise(accountCheck(account));

/** Claude Code that gave no answer within a read's time: its words say which read. */
class ClaudeUnanswered extends Schema.TaggedError<ClaudeUnanswered>()(
  "ClaudeUnanswered",
  { message: Schema.String }
) {}

/** A read's "no answer in time" among its other failures (another module's rejection, a {@link Rejected}). */
const isUnanswered = (error: unknown): error is Unanswered =>
  error instanceof Unanswered;

/** A session of the agent SDK held for one read: closed when the read ends, however it ends. */
const heldQuery = (
  params: Parameters<typeof query>[0]
): Effect.Effect<ReturnType<typeof query>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => query(params)),
    (handle) => Effect.sync(() => handle.close())
  );

/** A held session's initialize response, waited on for a quiet spell (core bounded.ts `QUIET_MS`); past it, `late` is the failure. */
const initialized = (handle: ReturnType<typeof query>, late: string) =>
  boundedWhileLive(() => fromPromise(() => handle.initializationResult())).pipe(
    Effect.catchIf(isUnanswered, () =>
      Effect.fail(new ClaudeUnanswered({ message: late }))
    )
  );

/** {@link checkAccount}'s run, its promise edge. */
const accountCheck = Effect.fn("accountCheck")(function* (account: string) {
  yield* startable(account, "checked");
  const executable = yield* fromPromise(claudeToStart);
  const handle = yield* heldQuery({
    prompt: CHECK_PROMPT,
    options: {
      pathToClaudeCodeExecutable: executable,
      env: envFor(account),
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
      model: "haiku",
      tools: [],
      // @limit measured: one turn, the answer to a single question with tools off (tools: [] above)
      maxTurns: 1,
      thinking: { type: "disabled" },
      systemPrompt: CHECK_PROMPT,
    },
  });
  return yield* boundedWhileLive((alive) =>
    fromPromise(async (): Promise<AccountCheck> => {
      for await (const message of handle) {
        // Each message of the turn is a sign of life.
        alive();
        if (
          message.type === "assistant" &&
          !message.parent_tool_use_id &&
          message.error
        ) {
          return {
            kind: "error",
            error: message.error,
            text: message.message.content
              .flatMap((block) => (block.type === "text" ? [block.text] : []))
              .join("\n"),
          };
        }
        if (
          message.type === "result" &&
          message.subtype === "success" &&
          !message.is_error
        ) {
          return { kind: "answered" };
        }
      }
      throw new Error("Claude Code ended before the check's turn did");
    })
  ).pipe(
    Effect.catchIf(isUnanswered, () =>
      Effect.fail(
        new ClaudeUnanswered({
          message: `Claude Code said nothing of the check's turn for ${secondsOf(QUIET_MS)} s`,
        })
      )
    )
  );
}, Effect.scoped);

/**
 * One dir's initialize response, read by a session that never takes a turn:
 * its prompt is held open and yields nothing, so the CLI answers the SDK's
 * initialize and waits. Nothing it loads makes a request: no user settings,
 * no MCP servers, nothing persisted. Throws with the CLI's word when it
 * cannot answer, and with its own sentence when it gave no answer in time
 * (never a probe that read nothing). Not started on a login in the locked
 * login keychain ({@link lockedAway}): it throws that sentence. Its identity
 * carries the organization id the dir's `auth status` names.
 */
export const probeAccount = (account: string): Promise<AccountProbe> =>
  runPromise(accountProbe(account));

/** {@link probeAccount}'s run, its promise edge. */
const accountProbe = Effect.fn("accountProbe")(function* (account: string) {
  yield* startable(account, "probed");
  const executable = yield* fromPromise(claudeToStart);
  const handle = yield* heldQuery({
    prompt: idle,
    options: {
      pathToClaudeCodeExecutable: executable,
      env: envFor(account),
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
    },
  });
  const init = yield* initialized(
    handle,
    `Claude Code did not answer initialize in ${secondsOf(QUIET_MS)} s`
  );
  // Who it is, keyed on its organization's id, which only `auth status`
  // names: read now, so the id is this login's ({@link dirIdentity}).
  yield* fromPromise(() => readAccount(account));
  const identity = dirIdentity(
    accountConfigDir(account),
    identityOf(init.account)
  );
  return {
    models: init.models,
    ...(identity ? { identity } : {}),
    ...(init.account.subscriptionType
      ? { subscriptionType: init.account.subscriptionType }
      : {}),
  } satisfies AccountProbe;
}, Effect.scoped);

/** What decides a session's `/` menu in a folder (claude.ts `folderLaunch`). */
interface FolderLaunch {
  additionalDirectories: string[];
  extraArgs: Record<string, string | null>;
  model?: string;
  plugins?: { path: string; type: "local" }[];
  settings: Record<string, unknown>;
}

/**
 * The `/` menu a Claude session started in `cwd` on `account` (none: the
 * machine's own login) opens with, read before it exists: the initialize
 * response of a Claude Code that never takes a turn, in that folder and
 * that config dir, launched with what decides a session's menu there
 * (claude.ts `folderLaunch`: its flag settings, CLI flags and model). It is
 * what that session's own `supportedCommands()` answers until a
 * `commands_changed` replaces it: "async
 * supportedCommands(){let{commands:e}=await this.initialization;return
 * this.latestCommands??e}" (agent SDK 0.3.318). Its hooks are off and it is
 * handed no MCP server (`strictMcpConfig`), so reading the menu runs nothing
 * of the folder's or the fleet's; an MCP server's prompts join a session's
 * list as its servers connect (`commands_changed`).
 */
export const folderCommands = (
  cwd: string,
  account: string | undefined,
  launch: FolderLaunch
): Promise<SlashCommand[]> =>
  runPromise(commandsOfFolder(cwd, account, launch));

/** {@link folderCommands}'s run, its promise edge. */
const commandsOfFolder = Effect.fn("commandsOfFolder")(function* (
  cwd: string,
  account: string | undefined,
  launch: FolderLaunch
) {
  if (account) {
    yield* startable(account, "read for its commands");
  }
  const executable = yield* fromPromise(claudeToStart);
  const handle = yield* heldQuery({
    prompt: idle,
    options: {
      cwd,
      pathToClaudeCodeExecutable: executable,
      env: account ? envFor(account) : bareEnv(),
      ...launch,
      settings: { ...launch.settings, disableAllHooks: true },
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
    },
  });
  const init = yield* initialized(
    handle,
    `Claude Code did not list the commands of ${cwd} in ${secondsOf(QUIET_MS)} s`
  );
  return init.commands;
}, Effect.scoped);

/**
 * Links the fleet's user layer (core paths/claude.ts) into an account's dir: each
 * of its dirs ({@link USER_LAYER_DIRS}, made in {@link claudeHome} when it is
 * not there yet, so an account never starts a copy of its own) and each of
 * its files `claudeHome` has ({@link USER_LAYER_FILES}) becomes a symlink to
 * the user's one copy. A dir the account already has of its own is moved
 * into the user's copy first ({@link shareDir}); a file of its own is left
 * alone and said in the log. A dir earlier versions made for their own
 * writes ({@link USER_LAYER_LEFT_DIRS}) is linked only while the user's
 * copy is there, and never made.
 */
export const linkUserLayer = async (account: string): Promise<void> => {
  const dir = accountConfigDir(account);
  await makeFolder(dir, { mode: 0o700 });
  await Promise.all([
    ...USER_LAYER_DIRS.map(async (entry) => {
      const target = userLayerPath(entry);
      if (
        USER_LAYER_LEFT_DIRS.has(entry) &&
        !(await lstat(target).catch(() => undefined))
      ) {
        return;
      }
      await shareDir(join(dir, entry), target, account);
    }),
    ...USER_LAYER_FILES.map((entry) => {
      const target = userLayerPath(entry);
      const path = join(dir, entry);
      return onePathAtATime(path, async () => {
        if (!(await lstat(target).catch(() => undefined))) {
          return;
        }
        const there = await lstat(path).catch(() => undefined);
        if (there?.isSymbolicLink()) {
          return;
        }
        if (there) {
          console.warn(
            `[accounts] ${path} is the account's own, not the fleet's; left as it is`
          );
          return;
        }
        await symlink(target, path);
      });
    }),
  ]);
};

/**
 * Each link {@link linkUserLayer} made in an account dir whose target is
 * gone, taken away: the link at an entry's name ({@link USER_LAYER_DIRS},
 * {@link USER_LAYER_FILES}) that names exactly the user layer's path for
 * it, when nothing is at that path any more (a file or folder the fleet's
 * cleanup took back, or one the person deleted). A link elsewhere, a real
 * file or a real dir at that name is the account's, and stays. Answers the
 * links taken away.
 */
export const dropDanglingUserLayerLinks = async (): Promise<string[]> => {
  const entries = [...USER_LAYER_DIRS, ...USER_LAYER_FILES];
  const dropped = await Promise.all(
    accountIds().flatMap((account) =>
      entries.map(async (entry) => {
        const path = join(accountConfigDir(account), entry);
        const target = userLayerPath(entry);
        let gone = false;
        await onePathAtATime(path, async () => {
          const there = await lstat(path).catch(() => undefined);
          if (
            !there?.isSymbolicLink() ||
            (await readlink(path).catch(() => undefined)) !== target ||
            (await lstat(target).catch(() => undefined))
          ) {
            return;
          }
          await rm(path, { force: true });
          gone = true;
        });
        return gone ? [path] : [];
      })
    )
  );
  return dropped.flat();
};

/** Two files with the same bytes; never two dirs. */
const sameFile = async (a: string, b: string): Promise<boolean> => {
  const [one, two] = await Promise.all([lstat(a), lstat(b)]);
  return (
    one.isFile() &&
    two.isFile() &&
    one.size === two.size &&
    Buffer.from(await Bun.file(a).arrayBuffer()).equals(
      Buffer.from(await Bun.file(b).arrayBuffer())
    )
  );
};

/**
 * The link being made now at each config-dir path, as a promise that never
 * rejects. A link is a look then a change (lstat, then move and symlink), and
 * an account's user layer can be linked by two callers at once (a fleet sync
 * and a login), where every one that looked before the first had linked
 * failed its symlink with EEXIST. So one path is linked by one call at a
 * time: a later call waits for the earlier one to end, then looks, finds the
 * link, and returns.
 */
const linking = makeKeyedLock<string>();

const onePathAtATime = (
  path: string,
  link: () => Promise<void>
): Promise<void> => {
  const key = resolve(path);
  return linking.run(key, link);
};

/**
 * Makes `path`, a dir in an account's config dir, a symlink to `target`, the
 * user's one copy in {@link claudeHome}, made there if it is not yet. What
 * the account's dir already holds of its own there is moved into the copy
 * entry by entry first: one the copy already has with the same bytes goes,
 * one with other bytes is kept beside it as `<base>.account-<id8><ext>`, so
 * neither is lost. A file where the dir should be is left alone and said in
 * the log. One call at a time per path ({@link onePathAtATime}).
 */
const shareDir = (
  path: string,
  target: string,
  /** The account `path` is in, whose first 8 characters mark a copy kept beside. */
  account: string
): Promise<void> =>
  onePathAtATime(path, () => shareDirNow(path, target, account));

const shareDirNow = async (
  path: string,
  target: string,
  account: string
): Promise<void> => {
  const there = await lstat(path).catch(() => undefined);
  if (there?.isSymbolicLink()) {
    return;
  }
  if (there && !there.isDirectory()) {
    console.warn(`[accounts] ${path} is a file, not a dir; left as it is`);
    return;
  }
  await makeFolder(target);
  if (there) {
    const id8 = shortId(account);
    for (const name of await readdir(path)) {
      const from = join(path, name);
      const into = join(target, name);
      if (!(await lstat(into).catch(() => undefined))) {
        await rename(from, into);
      } else if (await sameFile(from, into)) {
        await rm(from, { force: true });
      } else {
        const ext = extname(name);
        await rename(
          from,
          join(target, `${basename(name, ext)}.account-${id8}${ext}`)
        );
      }
    }
    await rmdir(path);
    console.info(`[accounts] ${path}'s own entries moved into ${target}`);
  }
  await makeFolder(dirname(path));
  await symlink(target, path);
};

/** Every account dir's own `.claude.json`, where its MCP servers live. */
export const accountClaudeJsons = (): string[] =>
  accountIds().map(accountClaudeJson);

/**
 * The account's store on this machine (`~/.cawco/accounts/<id>`), gone: its
 * credential with it, once its harness signed it out. The one way any
 * account's store is deleted, so no session's data goes with one: each
 * Claude session that ran in its dir is carried out first ({@link
 * retireConfigDir}), into `into`'s dir when the account is joined into
 * another, else into {@link claudeHome}, the dir of a session on no account,
 * which is what each of their rows says once the account is gone.
 */
export const removeAccountDir = async (
  account: string,
  into: string | null = null
): Promise<void> => {
  const dir = accountConfigDir(account);
  if (await lstat(dir).catch(() => undefined)) {
    const target = sessionConfigDir({ accountId: into });
    const moved = await retireConfigDir(dir, target);
    if (moved > 0) {
      console.info(
        `[accounts] ${account}: ${moved} session(s) carried into ${target} before its dir goes`
      );
    }
  }
  await removeAccountRoot(account);
};
