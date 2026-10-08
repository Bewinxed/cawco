import { chmod, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import {
  type AccountIdentity,
  type HomeLogin,
  type HomeLoginMoved,
  sameIdentity,
} from "@cawco/core";
import { accountConfigDir } from "@cawco/core/paths";
import {
  accountEnv,
  authStatusIn,
  bareEnv,
  keychainService,
  keychainUser,
  kindOf,
  linkUserLayer,
} from "./accounts";
import { inFleetQueue, writeAtomic } from "./fleet";

/**
 * The one-time move of this machine's own Claude Code login (`~/.claude`)
 * into a CawCo account's dir, so that login keeps working in CawCo without a
 * second `claude auth login`. A move, never a copy: Claude Code rotates the
 * refresh token on every refresh, so two copies of one login sign each other
 * out. The credential stays in Claude Code's own store on this machine and
 * passes through nothing but this agent and the store's own tool; it is
 * never logged, and never sent to the hub.
 *
 * Where Claude Code keeps a login, as its 2.1.289 build (the one CawCo
 * bundles) reads and writes it:
 * - macOS: a Keychain generic password, account {@link keychainUser},
 *   service `Claude Code-credentials` for the default dir and
 *   {@link keychainService} for a `CLAUDE_CONFIG_DIR`; its plaintext
 *   fallback is `<dir>/.credentials.json`
 *   (https://github.com/musistudio/claude-code-router/issues/1601).
 * - Linux: `<dir>/.credentials.json` only (its backend there is
 *   `plaintext`, "the credentials file").
 * - Either: who the login is, `oauthAccount`, in `~/.claude.json` for the
 *   default dir and `<dir>/.claude.json` for a `CLAUDE_CONFIG_DIR`. Identity,
 *   not a secret; it moves with the credential.
 *
 * The order is the protection: write the account dir's copy, ask the
 * account dir's Claude Code who it is signed in as, and delete the original
 * only once it answers as the same identity. Any failure before that removes
 * what was written and leaves the original as it was.
 */

/** The default dir's Keychain service: no `CLAUDE_CONFIG_DIR`, no hash suffix. */
const HOME_SERVICE = "Claude Code-credentials";

/** `errSecItemNotFound`, as `security` exits for a missing item. */
const SEC_ITEM_NOT_FOUND = 44;

const CREDENTIALS = ".credentials.json";
const homeDir = (): string => join(homedir(), ".claude");
const homeClaudeJson = (): string => join(homedir(), ".claude.json");
const accountClaudeJson = (account: string): string =>
  join(accountConfigDir(account), ".claude.json");

const log = (line: string): void => {
  console.log(`[move-login] ${line}`);
};

/** Who the machine's own `~/.claude` is signed in as, by its `claude auth status`. */
export const readHomeLogin = async (): Promise<HomeLogin> => {
  const status = await authStatusIn(bareEnv());
  const kind = kindOf(status.authMethod);
  return {
    loggedIn: status.loggedIn,
    ...(status.identity ? { identity: status.identity } : {}),
    ...(kind ? { kind } : {}),
  };
};

/** One of Claude Code's credential stores, as the move uses it. */
interface Store {
  /** Whether the account dir already holds one here. */
  heldBy: (account: string) => Promise<boolean>;
  /** Claude Code's own name for it. */
  name: string;
  /** The default dir's credential; undefined when this store has none. */
  readHome: () => Promise<string | undefined>;
  remove: (account: string) => Promise<void>;
  removeHome: () => Promise<void>;
  write: (account: string, secret: string) => Promise<void>;
}

/** Runs `security`, its output read and never logged. */
const security = async (
  args: string[],
  input?: string
): Promise<{ code: number; stdout: string }> => {
  const child = Bun.spawn(["security", ...args], {
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "ignore",
    timeout: 20_000,
  });
  if (input !== undefined && child.stdin) {
    child.stdin.write(input);
    await child.stdin.end();
  }
  const [stdout, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return { code, stdout };
};

const findItem = async (service: string): Promise<string | undefined> => {
  const read = await security([
    "find-generic-password",
    "-a",
    keychainUser(),
    "-w",
    "-s",
    service,
  ]);
  if (read.code === SEC_ITEM_NOT_FOUND) {
    return undefined;
  }
  if (read.code !== 0) {
    throw new Error(
      `The Keychain refused the read of ${service} (security exited ${read.code}).`
    );
  }
  return read.stdout.trim() || undefined;
};

const deleteItem = async (service: string): Promise<void> => {
  const gone = await security([
    "delete-generic-password",
    "-a",
    keychainUser(),
    "-s",
    service,
  ]);
  if (gone.code !== 0 && gone.code !== SEC_ITEM_NOT_FOUND) {
    throw new Error(
      `The Keychain refused to delete ${service} (security exited ${gone.code}).`
    );
  }
};

/**
 * The macOS Keychain. Written the way Claude Code writes it: one
 * `add-generic-password -U -a "<user>" -s "<service>" -X "<hex>"` line on
 * `security -i`'s stdin, so the secret is never on a command line.
 */
const keychain: Store = {
  name: "the macOS Keychain",
  readHome: () => findItem(HOME_SERVICE),
  heldBy: async (account) =>
    (await findItem(keychainService(account))) !== undefined,
  write: async (account, secret) => {
    const hex = Buffer.from(secret, "utf-8").toString("hex");
    const added = await security(
      ["-i"],
      `add-generic-password -U -a "${keychainUser()}" -s "${keychainService(account)}" -X "${hex}"\n`
    );
    if (added.code !== 0) {
      throw new Error(
        `The Keychain refused the write (security exited ${added.code}).`
      );
    }
  },
  remove: (account) => deleteItem(keychainService(account)),
  removeHome: () => deleteItem(HOME_SERVICE),
};

const readText = async (path: string): Promise<string | undefined> => {
  try {
    const text = await readFile(path, "utf8");
    return text.trim() ? text : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

/** `<dir>/.credentials.json`, owner-only, as Claude Code keeps it. */
const credentialsFile: Store = {
  name: "the credentials file",
  readHome: () => readText(join(homeDir(), CREDENTIALS)),
  heldBy: async (account) =>
    (await readText(join(accountConfigDir(account), CREDENTIALS))) !==
    undefined,
  write: async (account, secret) => {
    const path = join(accountConfigDir(account), CREDENTIALS);
    await writeFile(path, secret, { mode: 0o600 });
    // An empty file already there keeps its mode through the write.
    await chmod(path, 0o600);
  },
  remove: (account) =>
    rm(join(accountConfigDir(account), CREDENTIALS), { force: true }),
  removeHome: () => rm(join(homeDir(), CREDENTIALS), { force: true }),
};

/** The store the default dir's login is in, and the login itself. */
const homeCredential = async (): Promise<{ secret: string; store: Store }> => {
  const stores =
    platform() === "darwin" ? [keychain, credentialsFile] : [credentialsFile];
  for (const store of stores) {
    // biome-ignore lint/performance/noAwaitInLoops: Claude Code's own order: the Keychain first, the file as its fallback
    const secret = await store.readHome();
    if (secret) {
      return { secret, store };
    }
  }
  throw new Error(
    `Claude Code reports ~/.claude signed in, but its login is in none of ${stores.map((one) => one.name).join(" or ")}; nothing was moved.`
  );
};

type Json = Record<string, unknown>;

const readJson = async (path: string): Promise<Json | undefined> => {
  const text = await readText(path);
  return text === undefined ? undefined : (JSON.parse(text) as Json);
};

/** Writes `oauthAccount` into (or, undefined, out of) one `.claude.json`. */
const putOauthAccount = async (
  path: string,
  oauthAccount: unknown
): Promise<void> => {
  const { oauthAccount: _was, ...rest } = (await readJson(path)) ?? {};
  await writeAtomic(
    path,
    JSON.stringify(
      oauthAccount === undefined ? rest : { ...rest, oauthAccount },
      null,
      2
    )
  );
};

/** Who the account's dir answers as now, by its own `claude auth status`. */
const accountAnswersAs = async (
  account: string
): Promise<AccountIdentity | undefined> => {
  const status = await authStatusIn({ ...bareEnv(), ...accountEnv(account) });
  return status.loggedIn ? status.identity : undefined;
};

/** What the move takes from `~/.claude`, read and checked before anything is written. */
interface Taken {
  oauthAccount: unknown;
  secret: string;
  store: Store;
}

/**
 * Reads what the move takes, refusing first: `~/.claude` must still be
 * signed in as `expected` (what the hub matched the account by), and the
 * account's dir must hold no login of its own yet.
 */
const take = async (
  account: string,
  expected: AccountIdentity
): Promise<Taken> => {
  const home = await readHomeLogin();
  if (!(home.loggedIn && home.identity)) {
    throw new Error(
      "Claude Code on this machine is not signed in; there is nothing to move."
    );
  }
  if (!sameIdentity(home.identity, expected)) {
    throw new Error(
      `Claude Code on this machine is signed in as ${home.identity.email} now, not ${expected.email}; nothing was moved.`
    );
  }
  await linkUserLayer(account);
  if (await accountAnswersAs(account)) {
    throw new Error(
      "The account's dir on this machine is already signed in; nothing was moved."
    );
  }
  const { secret, store } = await homeCredential();
  if (await store.heldBy(account)) {
    throw new Error(
      `The account's dir already holds a login in ${store.name}; nothing was moved.`
    );
  }
  const oauthAccount = (await readJson(homeClaudeJson()))?.oauthAccount;
  if (oauthAccount === undefined) {
    throw new Error(
      "~/.claude.json names no oauthAccount for the login; nothing was moved."
    );
  }
  return { oauthAccount, secret, store };
};

/** The account dir's `.claude.json` as it was, byte for byte; undefined when it had none. */
const priorOf = async (path: string): Promise<Buffer | undefined> =>
  (await lstat(path).then(
    () => true,
    () => false
  ))
    ? await readFile(path)
    : undefined;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Moves `~/.claude`'s login into `account`'s dir, the original deleted only
 * once the dir answers as `expected`; any failure before that removes what
 * was written and leaves the original as it was.
 */
export const moveHomeLogin = (
  account: string,
  expected: AccountIdentity
): Promise<HomeLoginMoved> =>
  inFleetQueue(async () => {
    const { oauthAccount, secret, store } = await take(account, expected);
    const accountJson = accountClaudeJson(account);
    const prior = await priorOf(accountJson);

    log(`writing the login into ${account}'s dir in ${store.name}`);
    const undo = async (why: string): Promise<never> => {
      await store.remove(account);
      if (prior) {
        await writeAtomic(accountJson, prior);
      } else {
        await rm(accountJson, { force: true });
      }
      log(`not moved, the account's copy removed: ${why}`);
      throw new Error(
        `${why} Nothing was moved; Claude Code's own login on this machine is as it was.`
      );
    };
    try {
      await store.write(account, secret);
      await putOauthAccount(accountJson, oauthAccount);
    } catch (error) {
      return undo(`Writing the account's copy failed: ${said(error)}.`);
    }
    const answered = await accountAnswersAs(account);
    if (!answered) {
      return undo("The account's dir did not answer as signed in.");
    }
    if (!sameIdentity(answered, expected)) {
      return undo(
        `The account's dir answered as ${answered.email}, not ${expected.email}.`
      );
    }
    log(
      `${account}'s dir answers as ${answered.email}; deleting the original from ${store.name}`
    );
    await store.removeHome();
    await putOauthAccount(homeClaudeJson(), undefined);
    log("moved; Claude Code's own login on this machine is signed out");
    return { store: store.name };
  });
