/**
 * Accounts of every provider other than Claude's, on this machine.
 *
 * An account is one sign-in or one key for one provider, held once per
 * machine in `~/.cawco/accounts/<id>/credential.json`, in pi-ai's credential
 * format (`{ "<provider>": { "type": "oauth" | "api_key", … } }`). The agent
 * is its only writer: it signs in through pi-ai's own login, writes a key the
 * hub relayed, and refreshes an OAuth credential through pi-ai's own refresh
 * (`ModelRuntime.getAuth`, which refreshes under the store's `modify`).
 * Every harness on the machine that speaks the provider uses this one
 * credential: pi sessions read it through their runtime's store, and the
 * account's own OpenCode server through the store the agent writes for it
 * from this one ({@link opencodeAuthOf}). Nothing holds a second copy of a
 * grant: refresh tokens rotate, so copies sign each other out, and OpenCode's
 * copy carries a marker where a rotating refresh token would be.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type AccountBorrowFrame,
  type AccountIdentity,
  type AccountJoinedOn,
  type AccountReport,
  BORROWED_REFRESH,
  type HomeCredential,
  type HomeLoginMoved,
  type LentAccess,
  type ProviderSigninChallenge,
  type ProviderSigninResult,
  sameIdentity,
} from "@cawco/core";
import {
  accountCredentialPath,
  credentialAccountIds,
  sessionIdentityDir,
} from "@cawco/core/paths";
import { chatgptClaims, readChatgptUsage } from "@cawco/core/usage/chatgpt";
import {
  fetchOpenCodeGoLimits,
  opencodeDataDir,
} from "@cawco/core/usage/opencode-go";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { removeAccountDir } from "./accounts";

// ── The store ────────────────────────────────────────────────────────────

/** What an account's store holds: its provider and its one credential. */
export interface Held {
  credential: Credential;
  provider: string;
}

/** The account's credential as it is on disk now; undefined when it holds none. */
export const readHeld = (accountId: string): Held | undefined => {
  try {
    const stored = JSON.parse(
      readFileSync(accountCredentialPath(accountId), "utf8")
    ) as Record<string, Credential>;
    const [entry] = Object.entries(stored);
    return entry ? { provider: entry[0], credential: entry[1] } : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Written whole and moved into place, owner-only; then the account's OpenCode
 * store, so a sign-in, a key, a refresh and a sign-out reach its OpenCode
 * server the moment they are made.
 */
const writeHeld = async (
  accountId: string,
  held: Held | undefined
): Promise<void> => {
  const path = accountCredentialPath(accountId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const staged = `${path}.${process.pid}.tmp`;
  await writeFile(
    staged,
    JSON.stringify(held ? { [held.provider]: held.credential } : {}, null, 2),
    { mode: 0o600 }
  );
  await chmod(staged, 0o600);
  await rename(staged, path);
  await writeOpencodeAuth(accountId, held);
};

/**
 * The account's store here gone (any Claude session in it carried out
 * first, {@link removeAccountDir}), and its OpenCode server's data with it.
 */
const removeAccount = async (accountId: string): Promise<void> => {
  await removeAccountDir(accountId);
  await rm(opencodeAccountHome(accountId), { recursive: true, force: true });
};

/** One write at a time per account, in this process: the only writer. */
const writing = new Map<string, Promise<unknown>>();
const serial = <T>(accountId: string, work: () => Promise<T>): Promise<T> => {
  const next = (writing.get(accountId) ?? Promise.resolve()).then(work, work);
  writing.set(
    accountId,
    next.catch(() => undefined)
  );
  return next;
};

/** pi-ai's store over one account's file: the account's provider only. */
class AccountStore implements CredentialStore {
  readonly #account: string;
  readonly #provider: string;

  constructor(account: string, provider: string) {
    this.#account = account;
    this.#provider = provider;
  }

  read(providerId: string, _options?: AuthOperationOptions) {
    const held = readHeld(this.#account);
    return Promise.resolve(
      providerId === this.#provider && held?.provider === providerId
        ? held.credential
        : undefined
    );
  }

  list(_options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    const held = readHeld(this.#account);
    return Promise.resolve(
      held ? [{ providerId: held.provider, type: held.credential.type }] : []
    );
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    _options?: AuthOperationOptions
  ): Promise<Credential | undefined> {
    if (providerId !== this.#provider) {
      return Promise.reject(
        new Error(
          `Account ${this.#account} holds ${this.#provider}, not ${providerId}.`
        )
      );
    }
    return serial(this.#account, async () => {
      const current = readHeld(this.#account);
      const was =
        current?.provider === providerId ? current.credential : undefined;
      const next = await fn(was);
      // pi-ai's refresh answers its own fields only: who the sign-in is
      // stays on it while it is the same grant (the same refresh token; a
      // Copilot refresh keeps its GitHub token). A new sign-in written over
      // it is someone to be asked about again.
      const kept = was ? keptIdentity(was) : undefined;
      const sameGrant =
        was?.type === "oauth" &&
        next?.type === "oauth" &&
        was.refresh === next.refresh;
      const written =
        next !== undefined && kept && sameGrant && !keptIdentity(next)
          ? ({ ...next, [IDENTITY]: kept } as Credential)
          : next;
      if (written !== undefined) {
        await writeHeld(this.#account, {
          provider: providerId,
          credential: written,
        });
      }
      return written ?? current?.credential;
    });
  }

  delete(providerId: string, _options?: AuthOperationOptions): Promise<void> {
    return serial(this.#account, async () => {
      if (readHeld(this.#account)?.provider === providerId) {
        await writeHeld(this.#account, undefined);
      }
    });
  }
}

const runtimes = new Map<string, Promise<ModelRuntime>>();

/** The agent's pi-ai runtime over one account's store: its login, refresh and request auth. */
const runtimeOf = (accountId: string, provider: string) => {
  const key = `${accountId}\u0000${provider}`;
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = ModelRuntime.create({
      refreshOnCreate: false,
      credentials: new AccountStore(accountId, provider),
    });
    runtime.catch(() => runtimes.delete(key));
    runtimes.set(key, runtime);
  }
  return runtime;
};

/** How long before its expiry an OAuth credential is refreshed. */
const FRESH_FOR_MS = 15 * 60_000;

/**
 * Refreshes the account's OAuth credential through pi-ai's own refresh when
 * it has less than {@link FRESH_FOR_MS} left; a key, or a credential with
 * time left, is left as it is. Every refresh of every account goes through
 * here, one at a time per account. A borrowed sign-in is never refreshed
 * here: a fresh access token is asked of its lender ({@link borrowFresh}).
 * `periodic`: asked by a timer, not by something that needs the sign-in now.
 */
export const freshen = async (
  accountId: string,
  periodic = false
): Promise<void> => {
  const held = readHeld(accountId);
  if (held?.credential.type !== "oauth") {
    return;
  }
  if (held.credential.expires - Date.now() > FRESH_FOR_MS) {
    return;
  }
  const lender = lenderOf(held.credential);
  if (lender) {
    await borrowFresh(accountId, lender, held.credential.access, periodic);
    return;
  }
  const runtime = await runtimeOf(accountId, held.provider);
  await runtime.getAuth(held.provider, { minOAuthValidityMs: FRESH_FOR_MS });
};

/** Keeps every OAuth credential on the machine fresh; a failure is said and tried again next time. */
export const freshenAll = async (): Promise<void> => {
  for (const account of credentialAccountIds()) {
    // biome-ignore lint/performance/noAwaitInLoops: one refresh at a time keeps the providers' token endpoints calm
    await freshen(account, true).catch((error: unknown) =>
      console.warn(
        `[accounts] ${account}: refresh failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
};

// ── Who a credential is ──────────────────────────────────────────────────

/** A key as an identity: its last four characters, and a fingerprint of it. */
export const keyIdentity = (key: string): AccountIdentity => ({
  email: `…${key.slice(-4)}`,
  organization: `key:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`,
});

/**
 * Who a sign-in is, kept on its credential where the provider's token names
 * nobody (Copilot's GitHub token): written when it signs in or moves in
 * ({@link withIdentity}), and carried across pi-ai's refresh, which writes a
 * credential of its own fields only ({@link AccountStore.modify}).
 */
const IDENTITY = "cawcoIdentity";

const keptIdentity = (credential: Credential): AccountIdentity | undefined => {
  const kept = (credential as Record<string, unknown>)[IDENTITY] as
    | AccountIdentity
    | undefined;
  return kept && typeof kept.email === "string" ? kept : undefined;
};

/** GitHub's host for a Copilot sign-in: github.com, or its Enterprise domain (pi-ai's `normalizeDomain`). */
const githubDomain = (credential: Credential): string => {
  const enterprise = (credential as { enterpriseUrl?: unknown }).enterpriseUrl;
  return typeof enterprise === "string" && enterprise.trim()
    ? enterprise.trim().replace(LEADING_SCHEME, "").replace(TRAILING_PATH, "")
    : "github.com";
};
const LEADING_SCHEME = /^https?:\/\//;
const TRAILING_PATH = /\/.*$/;

/**
 * A Copilot sign-in's GitHub user, read with its GitHub token (`refresh`,
 * where pi-ai and OpenCode both keep it) from GitHub's REST API on the
 * sign-in's own domain, `api.<domain>`, as pi-ai reaches it
 * (github-copilot.js 244-268: `https://api.${domain}/copilot_internal/v2/token`).
 * Its login is who it is; the domain tells github.com from an Enterprise.
 */
const githubIdentity = async (
  credential: Credential
): Promise<AccountIdentity> => {
  const domain = githubDomain(credential);
  const token = (credential as { refresh?: unknown }).refresh;
  if (typeof token !== "string" || !token) {
    throw new Error("The Copilot sign-in holds no GitHub token.");
  }
  const response = await fetch(`https://api.${domain}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "CawCo",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub (${domain}) answered ${response.status} when asked who the Copilot sign-in is.`
    );
  }
  const user = (await response.json()) as { login?: unknown };
  if (typeof user.login !== "string" || !user.login) {
    throw new Error(
      `GitHub (${domain}) named no user for the Copilot sign-in.`
    );
  }
  return { email: user.login, organization: `github:${domain}` };
};

/**
 * The credential with who it is kept on it, read from the provider where its
 * token names nobody: Copilot's, from GitHub. Any other as it is.
 */
export const withIdentity = async (
  provider: string,
  credential: Credential
): Promise<Credential> =>
  provider === "github-copilot" &&
  credential.type === "oauth" &&
  !keptIdentity(credential)
    ? ({
        ...credential,
        [IDENTITY]: await githubIdentity(credential),
      } as Credential)
    : credential;

/** Who a credential is, as far as it says. */
export const identityOf = (
  provider: string,
  credential: Credential
): AccountIdentity | undefined => {
  const kept = keptIdentity(credential);
  if (kept) {
    return kept;
  }
  if (credential.type === "api_key") {
    return credential.key ? keyIdentity(credential.key) : undefined;
  }
  const claims = chatgptClaims(credential.access);
  const accountId =
    (typeof credential.accountId === "string" ? credential.accountId : null) ??
    claims.accountId;
  const email =
    claims.email ??
    (typeof credential.email === "string" ? credential.email : null);
  return email ? { email, organization: accountId ?? provider } : undefined;
};

/** Every provider account's store on this machine and who it is signed in as. */
export const providerAccountReports = (): AccountReport[] =>
  credentialAccountIds().map((account) => {
    const held = readHeld(account);
    const identity = held
      ? identityOf(held.provider, held.credential)
      : undefined;
    return {
      account,
      loggedIn: held !== undefined,
      ...(held
        ? {
            provider: held.provider,
            kind: held.credential.type === "oauth" ? "oauth" : "api_key",
          }
        : {}),
      ...(identity ? { identity } : {}),
    } satisfies AccountReport;
  });

/** The plan a ChatGPT token's account is on: the usage endpoint's word, else the token's claim. */
const planOf = async (held: Held): Promise<string | null> => {
  if (held.provider !== "openai-codex" || held.credential.type !== "oauth") {
    return null;
  }
  const claims = chatgptClaims(held.credential.access);
  if (!claims.accountId) {
    return claims.plan;
  }
  const read = await readChatgptUsage(held.credential.access, claims.accountId);
  return read.ok && read.plan ? read.plan : claims.plan;
};

// ── One grant, lent ──────────────────────────────────────────────────────

/** The machine a borrowed sign-in was lent by, kept on it beside its access token. */
const LENDER = "cawcoLender";

/** The machine that lent `credential`, when it is borrowed ({@link BORROWED_REFRESH}). */
export const lenderOf = (credential: Credential): string | undefined => {
  if (credential.type !== "oauth" || credential.refresh !== BORROWED_REFRESH) {
    return undefined;
  }
  const lender = (credential as Record<string, unknown>)[LENDER];
  return typeof lender === "string" && lender ? lender : undefined;
};

/** A lent access token as the borrower's store keeps it: no refresh token, ever. */
const borrowedCredential = (lender: string, lent: LentAccess): Credential =>
  ({
    type: "oauth",
    access: lent.access,
    refresh: BORROWED_REFRESH,
    expires: lent.expires,
    ...(lent.accountId ? { accountId: lent.accountId } : {}),
    [IDENTITY]: lent.identity,
    [LENDER]: lender,
  }) as unknown as Credential;

/** Where a borrower's asks go: the daemon's socket to the hub. */
let askHub: ((frame: AccountBorrowFrame) => void) | undefined;
export const setBorrowAsk = (
  send: (frame: AccountBorrowFrame) => void
): void => {
  askHub = send;
};

/** How long the hub gets to bring a lender's fresh access token. */
const LEND_WAIT_MS = 60_000;

/** Asks waiting on the hub's answer, by request id. */
const lendWaits = new Map<
  string,
  {
    accountId: string;
    lender: string;
    settle: (outcome: Error | undefined) => void;
  }
>();
/** The ask under way per account: callers at once share it. */
const asking = new Map<string, Promise<void>>();
/**
 * Why the last ask for each account failed, with the access token it was
 * asked for: a timer does not ask again for the same token
 * ({@link freshen}'s `periodic`), so a lender that is away is said once, not
 * every minute. Something that needs the sign-in now asks again.
 */
const lendRefused = new Map<string, { access: string; why: string }>();

/**
 * A borrowed sign-in near its expiry: a fresh access token asked of its
 * lender through the hub, written into the account's store when it comes.
 */
const borrowFresh = (
  accountId: string,
  lender: string,
  access: string,
  periodic: boolean
): Promise<void> => {
  const refused = lendRefused.get(accountId);
  if (periodic && refused?.access === access) {
    return Promise.resolve();
  }
  const under = asking.get(accountId);
  if (under) {
    return under;
  }
  const ask = new Promise<void>((resolve, reject) => {
    if (!askHub) {
      reject(new Error("The agent is not connected to the hub yet."));
      return;
    }
    const requestId = randomUUID();
    const timer = setTimeout(
      () =>
        lendWaits
          .get(requestId)
          ?.settle(
            new Error(
              `The hub did not bring a fresh sign-in for account ${accountId} from its lender in time.`
            )
          ),
      LEND_WAIT_MS
    );
    lendWaits.set(requestId, {
      accountId,
      lender,
      settle: (outcome) => {
        clearTimeout(timer);
        lendWaits.delete(requestId);
        if (outcome) {
          reject(outcome);
        } else {
          resolve();
        }
      },
    });
    askHub({ kind: "account_borrow", accountId, lender, requestId });
  })
    .then(
      () => {
        lendRefused.delete(accountId);
      },
      (error: unknown) => {
        const why = error instanceof Error ? error.message : String(error);
        lendRefused.set(accountId, { access, why });
        throw error instanceof Error ? error : new Error(why);
      }
    )
    .finally(() => asking.delete(accountId));
  asking.set(accountId, ask);
  return ask;
};

/**
 * The hub's answer to a borrower: a lender's fresh access token written into
 * the account's store, or why there is none. `requestId` null: the lender
 * came back and the hub brings what an earlier ask could not get.
 */
export const accountLent = async (
  requestId: string | null,
  answer: LentAccess | { error: string },
  accountId?: string
): Promise<{ written: boolean }> => {
  const wait = requestId ? lendWaits.get(requestId) : undefined;
  const target = wait?.accountId ?? accountId;
  if (!target) {
    return { written: false };
  }
  if ("error" in answer) {
    wait?.settle(new Error(answer.error));
    return { written: false };
  }
  const written = await serial(target, async () => {
    const held = readHeld(target);
    const lender = held ? lenderOf(held.credential) : undefined;
    const as = held ? identityOf(held.provider, held.credential) : undefined;
    if (
      !(held && lender) ||
      held.provider !== answer.provider ||
      !(as && sameIdentity(as, answer.identity)) ||
      (wait && wait.lender !== lender)
    ) {
      return false;
    }
    await writeHeld(target, {
      provider: held.provider,
      credential: borrowedCredential(lender, answer),
    });
    return true;
  });
  if (written) {
    lendRefused.delete(target);
    wait?.settle(undefined);
  } else {
    wait?.settle(
      new Error(
        `Account ${target}'s store here is not a borrowed sign-in of ${answer.identity.email} any more.`
      )
    );
  }
  return { written };
};

/**
 * The account's working sign-in, lent: refreshed here first when it is near
 * its expiry (this machine's own refresh, the grant's only refresher), then
 * its access token, its expiry and who it is. Never its refresh token.
 */
export const lendAccount = async (accountId: string): Promise<LentAccess> => {
  const held = readHeld(accountId);
  if (!held) {
    throw new Error("This machine holds no sign-in of the account.");
  }
  if (held.credential.type !== "oauth") {
    throw new Error("Only a sign-in is lent, never a key.");
  }
  if (lenderOf(held.credential)) {
    throw new Error(
      "This machine's sign-in of the account is itself borrowed."
    );
  }
  await freshen(accountId);
  const now = readHeld(accountId);
  if (now?.credential.type !== "oauth") {
    throw new Error("The account's sign-in is gone from this machine.");
  }
  const identity = identityOf(now.provider, now.credential);
  if (!identity) {
    throw new Error("The account's sign-in does not say who it is.");
  }
  const { credential } = now;
  const chatgptAccount =
    (typeof credential.accountId === "string" ? credential.accountId : null) ??
    (now.provider === "openai-codex"
      ? chatgptClaims(credential.access).accountId
      : null);
  return {
    access: credential.access,
    expires: credential.expires,
    identity,
    provider: now.provider,
    ...(chatgptAccount ? { accountId: chatgptAccount } : {}),
  };
};

// ── Signing in ───────────────────────────────────────────────────────────

const COMPLETE_WAIT_MS = 60_000;
/** A sign-in method that asks for a device code, by its id or its label. */
const DEVICE_OPTION = /device/i;
const DEVICE_LABEL = /device|headless/i;
/** A pi key resolved at request time (`!command`, `$VAR`): not a key to move. */
const RESOLVED_KEY = /^[!$]/;
const DEVICE_FLOW_TIMED_OUT = /Device flow timed out|expired/i;

interface SignIn {
  readonly abort: AbortController;
  /** A code the sign-in asked to have pasted, when it asks for one. */
  code?: (code: string) => void;
  readonly done: Promise<"done" | "expired" | Error>;
  readonly expiresAt: number | null;
  readonly provider: string;
}

const signIns = new Map<string, SignIn>();

/**
 * Starts pi-ai's own OAuth sign-in for `provider` into the account's store:
 * its device-code method where it has one, so the person can finish it on
 * any device; else its link, after which they paste the code it ends on.
 */
export const beginProviderLogin = async (
  accountId: string,
  provider: string
): Promise<ProviderSigninChallenge> => {
  signIns.get(accountId)?.abort.abort();
  signIns.delete(accountId);
  const held = readHeld(accountId);
  if (held && held.provider !== provider) {
    throw new Error(
      `This account holds ${held.provider} on this machine, not ${provider}.`
    );
  }
  const runtime = await runtimeOf(accountId, provider);
  const abort = new AbortController();
  let shown: (challenge: ProviderSigninChallenge) => void = () => undefined;
  const challenge = new Promise<ProviderSigninChallenge>((resolve) => {
    shown = resolve;
  });
  const signIn: { code?: (code: string) => void } = {};
  const login = runtime.login(provider, "oauth", {
    signal: abort.signal,
    prompt: (prompt) => {
      if (prompt.type === "select") {
        const device = prompt.options.find(
          (option) =>
            DEVICE_OPTION.test(option.id) || DEVICE_LABEL.test(option.label)
        );
        return Promise.resolve((device ?? prompt.options[0])?.id ?? "");
      }
      if (prompt.type === "manual_code") {
        return new Promise<string>((resolve) => {
          signIn.code = resolve;
        });
      }
      // A question the sign-in asks with a default (Copilot's enterprise
      // domain): the default.
      return Promise.resolve("");
    },
    notify: (event) => {
      if (event.type === "device_code") {
        shown({
          verificationUrl: event.verificationUri,
          userCode: event.userCode,
          expiresAt: Date.now() + (event.expiresInSeconds ?? 900) * 1000,
        });
      } else if (event.type === "auth_url") {
        shown({ url: event.url });
      }
    },
  });
  const done = login.then(
    () => "done" as const,
    (error: unknown) => {
      const failed = error instanceof Error ? error : new Error(String(error));
      return DEVICE_FLOW_TIMED_OUT.test(failed.message)
        ? ("expired" as const)
        : failed;
    }
  );
  const first = await Promise.race([
    challenge,
    done.then((ended) => ({ ended })),
  ]);
  if ("ended" in first) {
    throw first.ended instanceof Error
      ? first.ended
      : new Error(`${provider}'s sign-in ended before it showed anything.`);
  }
  signIns.set(accountId, {
    abort,
    done,
    provider,
    expiresAt: "expiresAt" in first ? first.expiresAt : null,
    get code() {
      return signIn.code;
    },
  });
  return first;
};

/** A sign-in finished: who it is, kept or signed straight out as someone else's. */
const settled = async (
  accountId: string,
  expected: AccountIdentity | null
): Promise<ProviderSigninResult> => {
  const signed = readHeld(accountId);
  if (!signed) {
    throw new Error(
      "The sign-in finished but the account's store holds nothing."
    );
  }
  // Who it is, asked of the provider where its token says nobody.
  const credential = await withIdentity(signed.provider, signed.credential);
  if (credential !== signed.credential) {
    await serial(accountId, () =>
      writeHeld(accountId, { provider: signed.provider, credential })
    );
  }
  const held = { provider: signed.provider, credential };
  const identity = identityOf(held.provider, held.credential);
  if (expected && identity && !sameIdentity(expected, identity)) {
    await (await runtimeOf(accountId, held.provider)).logout(held.provider);
    return { state: "mismatch", email: identity.email };
  }
  return {
    state: "signed-in",
    email: identity?.email ?? null,
    identity: identity ?? null,
    plan: await planOf(held),
  };
};

/**
 * Feeds a pasted code to a sign-in that asked for one, or waits up to a
 * minute for the person to enter the device code, and says how it stands.
 */
export const completeProviderLogin = async (
  code: string | null,
  accountId: string,
  expected: AccountIdentity | null
): Promise<ProviderSigninResult> => {
  const signIn = signIns.get(accountId);
  if (!signIn) {
    return { state: "expired" };
  }
  if (code) {
    signIn.code?.(code.trim());
  }
  const outcome = await Promise.race([
    signIn.done,
    Bun.sleep(COMPLETE_WAIT_MS).then(() => "waiting" as const),
  ]);
  if (outcome === "waiting") {
    return signIn.expiresAt === null || Date.now() < signIn.expiresAt
      ? { state: "pending" }
      : { state: "expired" };
  }
  signIns.delete(accountId);
  if (outcome === "expired") {
    return { state: "expired" };
  }
  if (outcome instanceof Error) {
    throw outcome;
  }
  return await settled(accountId, expected);
};

/** Ends every sign-in still waiting, for the daemon's exit. */
export const endProviderSignIns = (): void => {
  for (const signIn of signIns.values()) {
    signIn.abort.abort();
  }
  signIns.clear();
};

/**
 * A key the person typed in the dashboard, relayed by the hub for this
 * machine: written into the account's store. A key other than the one the
 * account already is is refused as someone else's.
 */
export const setProviderKey = async (
  accountId: string,
  provider: string,
  key: string,
  expected: AccountIdentity | null
): Promise<ProviderSigninResult> => {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("The key is empty.");
  }
  const identity = keyIdentity(trimmed);
  if (expected && !sameIdentity(expected, identity)) {
    return { state: "mismatch", email: identity.email };
  }
  const held = readHeld(accountId);
  if (held && held.provider !== provider) {
    throw new Error(
      `This account holds ${held.provider} on this machine, not ${provider}.`
    );
  }
  await serial(accountId, () =>
    writeHeld(accountId, {
      provider,
      credential: { type: "api_key", key: trimmed },
    })
  );
  return {
    state: "signed-in",
    email: identity.email,
    identity,
    plan: null,
  };
};

/** Signs the account's store out (pi-ai's logout) and deletes its dir. */
export const forgetProviderAccount = async (
  accountId: string
): Promise<void> => {
  signIns.get(accountId)?.abort.abort();
  signIns.delete(accountId);
  const held = readHeld(accountId);
  // A borrowed sign-in is its lender's grant: dropped here, never signed out.
  if (held && !lenderOf(held.credential)) {
    await (await runtimeOf(accountId, held.provider)).logout(held.provider);
  }
  for (const key of runtimes.keys()) {
    if (key.startsWith(`${accountId}\u0000`)) {
      runtimes.delete(key);
    }
  }
  await removeAccount(accountId);
};

// ── The machine's own stores, and the one-time move out of them ──────────

const piStorePath = (): string => join(getAgentDir(), "auth.json");
const opencodeStorePath = (): string => join(opencodeDataDir(), "auth.json");

/**
 * A fingerprint of pi's and OpenCode's own stores as they are on disk now:
 * it changes whenever a login is made, refreshed or moved out there, so the
 * hub moves a login made under a connected machine at once
 * ({@link HeartbeatPayload.homeStores}). Never the stores' contents.
 */
export const homeStoresStamp = (): string => {
  const hash = createHash("sha256");
  for (const path of [piStorePath(), opencodeStorePath()]) {
    try {
      hash.update(readFileSync(path));
    } catch {
      hash.update("absent");
    }
    hash.update("\u0000");
  }
  return hash.digest("hex").slice(0, 16);
};

type Json = Record<string, Record<string, unknown>>;

const readJson = (path: string): Json => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Json;
  } catch {
    return {};
  }
};

const writeJson = async (path: string, value: Json): Promise<void> => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const staged = `${path}.cawco-${process.pid}.tmp`;
  await writeFile(staged, JSON.stringify(value, null, 2), { mode: 0o600 });
  await chmod(staged, 0o600);
  await rename(staged, path);
};

/** One store's entry as pi-ai's credential, or undefined for one CawCo does not hold. */
const credentialOf = (
  store: "pi" | "opencode",
  entry: Record<string, unknown>
): Credential | undefined => {
  if (store === "pi") {
    if (entry.type === "api_key" && typeof entry.key === "string") {
      // A `!command` or `$VAR` key is resolved by pi at request time: not a key to move.
      return RESOLVED_KEY.test(entry.key)
        ? undefined
        : { type: "api_key", key: entry.key };
    }
    return entry.type === "oauth" &&
      typeof entry.access === "string" &&
      typeof entry.refresh === "string"
      ? (entry as unknown as Credential)
      : undefined;
  }
  if (entry.type === "api" && typeof entry.key === "string") {
    // What OpenCode keeps beside a key (an Azure resource, a Cloudflare
    // account) moves with it, into the account's own OpenCode store.
    return {
      type: "api_key",
      key: entry.key,
      ...(isRecord(entry.metadata) ? { metadata: entry.metadata } : {}),
    } as Credential;
  }
  if (
    entry.type === "oauth" &&
    typeof entry.access === "string" &&
    typeof entry.refresh === "string"
  ) {
    const { type: _type, ...rest } = entry;
    return { ...rest, type: "oauth" } as unknown as Credential;
  }
  return undefined;
};

/** The account provider an entry in a store is for. */
const providerOfEntry = (
  store: "pi" | "opencode",
  storeProvider: string,
  credential: Credential
): string =>
  store === "opencode" &&
  storeProvider === "openai" &&
  credential.type === "oauth"
    ? "openai-codex"
    : storeProvider;

/**
 * Every credential in pi's and OpenCode's own stores on this machine a CawCo
 * account can hold. A Claude subscription's OAuth there (`anthropic`) is
 * never listed: Anthropic's terms keep it in Claude Code alone, and it stays
 * where it is. One whose provider cannot say who it is (GitHub not
 * answering for a Copilot sign-in) is not listed, and the agent says why.
 */
export const readHomeCredentials = async (): Promise<HomeCredential[]> => {
  const entries = (["pi", "opencode"] as const).flatMap((store) =>
    Object.entries(
      readJson(store === "pi" ? piStorePath() : opencodeStorePath())
    ).flatMap(([storeProvider, entry]) => {
      if (storeProvider === "anthropic") {
        return [];
      }
      const credential = credentialOf(store, entry);
      return credential
        ? [
            {
              store,
              storeProvider,
              credential,
              provider: providerOfEntry(store, storeProvider, credential),
            },
          ]
        : [];
    })
  );
  const listed = await Promise.all(
    entries.map(async ({ store, storeProvider, credential, provider }) => {
      const known = await withIdentity(provider, credential).catch(
        (error: unknown) => {
          moveLog(
            `${store}'s ${storeProvider} is not listed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      );
      const identity = known ? identityOf(provider, known) : undefined;
      return identity
        ? [
            {
              store,
              storeProvider,
              provider,
              kind:
                credential.type === "oauth"
                  ? ("oauth" as const)
                  : ("api_key" as const),
              identity,
            },
          ]
        : [];
    })
  );
  return listed.flat();
};

const moveLog = (line: string): void => {
  console.log(`[move-login] ${line}`);
};

/** A borrowed sign-in answers while its access token, refreshed by its lender only, has time left. */
const borrowedAnswers = async (
  accountId: string
): Promise<string | undefined> => {
  await freshen(accountId);
  const now = readHeld(accountId);
  return now?.credential.type === "oauth" && now.credential.expires > Date.now()
    ? undefined
    : "the borrowed sign-in has run out";
};

/**
 * Whether the account answers with the credential just written: ChatGPT's
 * usage endpoint for a ChatGPT sign-in, OpenCode Go's for its key, pi-ai's
 * own request auth for any other OAuth sign-in (refreshed by it if it has
 * run out), a borrowed sign-in by its time left ({@link borrowedAnswers}),
 * and the store giving the key back for any other key (no provider-neutral
 * endpoint answers for a key without spending it).
 * Undefined when it answers; else why not.
 */
const answers = async (accountId: string): Promise<string | undefined> => {
  const held = readHeld(accountId);
  if (!held) {
    return "the account's store holds nothing";
  }
  if (held.provider === "openai-codex" && held.credential.type === "oauth") {
    await freshen(accountId);
    const now = readHeld(accountId);
    if (now?.credential.type !== "oauth") {
      return "the refreshed sign-in is gone";
    }
    const claims = chatgptClaims(now.credential.access);
    const read = claims.accountId
      ? await readChatgptUsage(now.credential.access, claims.accountId)
      : { ok: false as const, error: "the token names no ChatGPT account" };
    return read.ok ? undefined : read.error;
  }
  if (held.credential.type === "api_key") {
    if (held.provider === "opencode-go") {
      const go = await fetchOpenCodeGoLimits(held.credential.key ?? null);
      return go?.error ?? undefined;
    }
    return held.credential.key ? undefined : "the store gave no key back";
  }
  if (lenderOf(held.credential)) {
    return await borrowedAnswers(accountId);
  }
  const auth = await (await runtimeOf(accountId, held.provider))
    .getAuth(held.provider)
    .catch(() => undefined);
  return auth
    ? undefined
    : `pi-ai gives no request auth for ${held.provider} from it`;
};

/**
 * Moves one credential out of pi's or OpenCode's own store into an account:
 * written into the account's store, checked to answer, and only then removed
 * from the store it came from, if that entry is still the one moved. Any
 * failure before that empties the account's store and leaves the original as
 * it was.
 */
export const moveHomeCredential = async (
  accountId: string,
  store: "pi" | "opencode",
  storeProvider: string,
  expected: AccountIdentity
): Promise<HomeLoginMoved> => {
  const path = store === "pi" ? piStorePath() : opencodeStorePath();
  const entry = readJson(path)[storeProvider];
  const read = entry ? credentialOf(store, entry) : undefined;
  // Already moved: a hub that stopped while the move ran asks for it again.
  const held = read ? undefined : readHeld(accountId);
  const heldAs = held ? identityOf(held.provider, held.credential) : undefined;
  if (heldAs && sameIdentity(heldAs, expected)) {
    moveLog(
      `already moved: account ${accountId} holds ${store}'s ${storeProvider}`
    );
    return { store: "the account's credential file" };
  }
  if (!read) {
    throw new Error(
      `${store}'s own store on this machine holds no ${storeProvider} credential CawCo can hold; nothing was moved.`
    );
  }
  const provider = providerOfEntry(store, storeProvider, read);
  // Who it is, asked of the provider where its token says nobody, and kept
  // on it in the account's store.
  const credential = await withIdentity(provider, read);
  const identity = identityOf(provider, credential);
  if (!(identity && sameIdentity(identity, expected))) {
    throw new Error(
      `${store}'s ${storeProvider} credential on this machine is not ${expected.email} any more; nothing was moved.`
    );
  }
  if (readHeld(accountId)) {
    throw new Error(
      "The account already holds a credential on this machine; nothing was moved."
    );
  }
  moveLog(`writing ${store}'s ${storeProvider} into account ${accountId}`);
  await serial(accountId, () => writeHeld(accountId, { provider, credential }));
  const undo = async (why: string): Promise<never> => {
    await serial(accountId, () => writeHeld(accountId, undefined));
    moveLog(`not moved, the account's copy removed: ${why}`);
    throw new Error(
      `${why} Nothing was moved; ${store}'s own ${storeProvider} on this machine is as it was.`
    );
  };
  const refused = await answers(accountId).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  );
  if (refused) {
    // Its own sign-in does not answer: nothing moves, and the hub lends the
    // account's working one here when another machine holds it.
    await serial(accountId, () => writeHeld(accountId, undefined));
    moveLog(
      `not moved, the account's copy removed: it did not answer: ${refused}`
    );
    return { store: "nothing", expired: refused };
  }
  if (!(await dropHomeEntry(path, storeProvider, read))) {
    return undo(`${store} changed its own ${storeProvider} during the move.`);
  }
  moveLog(`moved; ${store}'s own store no longer holds ${storeProvider}`);
  return { store: "the account's credential file" };
};

/**
 * The entry a move took, removed from its store when it is still the one
 * taken (the same refresh token, the same key); false when the store changed
 * it meanwhile, and it stays.
 */
const dropHomeEntry = async (
  path: string,
  storeProvider: string,
  taken: Credential
): Promise<boolean> => {
  const now = readJson(path);
  const still = now[storeProvider];
  const unchanged =
    still &&
    (taken.type === "oauth"
      ? still.refresh === taken.refresh
      : (still.key ?? null) === taken.key);
  if (!unchanged) {
    return false;
  }
  const { [storeProvider]: _moved, ...rest } = now;
  await writeJson(path, rest);
  return true;
};

/**
 * A machine whose own sign-in of the account's identity expired
 * ({@link HomeLoginMoved.expired}) runs on the account's working one, lent
 * by `lender`: the lent access token written into the account's store here
 * (never a refresh token), checked to answer, and then the expired entry
 * removed from its store, as a move removes the entry it took.
 */
export const borrowAccount = async (
  accountId: string,
  lender: string,
  lent: LentAccess,
  store: "pi" | "opencode",
  storeProvider: string,
  expected: AccountIdentity
): Promise<HomeLoginMoved> => {
  const path = store === "pi" ? piStorePath() : opencodeStorePath();
  const entry = readJson(path)[storeProvider];
  const read = entry ? credentialOf(store, entry) : undefined;
  const held = readHeld(accountId);
  const heldAs = held ? identityOf(held.provider, held.credential) : undefined;
  if (!read && held && heldAs && sameIdentity(heldAs, expected)) {
    moveLog(
      `already borrowed: account ${accountId} holds ${store}'s ${storeProvider}`
    );
    return { store: "the account's credential file" };
  }
  if (!read) {
    throw new Error(
      `${store}'s own store on this machine holds no ${storeProvider} credential; nothing was borrowed.`
    );
  }
  const provider = providerOfEntry(store, storeProvider, read);
  const identity = identityOf(provider, read);
  if (
    !(
      identity &&
      sameIdentity(identity, expected) &&
      sameIdentity(lent.identity, expected)
    ) ||
    lent.provider !== provider
  ) {
    throw new Error(
      `The lent sign-in is not ${store}'s own ${storeProvider} (${expected.email}); nothing was borrowed.`
    );
  }
  if (held) {
    throw new Error(
      "The account already holds a credential on this machine; nothing was borrowed."
    );
  }
  moveLog(`writing the account ${accountId}'s sign-in, lent by ${lender}`);
  await serial(accountId, () =>
    writeHeld(accountId, {
      provider,
      credential: borrowedCredential(lender, lent),
    })
  );
  const undo = async (why: string): Promise<never> => {
    await serial(accountId, () => writeHeld(accountId, undefined));
    moveLog(`not borrowed, the account's copy removed: ${why}`);
    throw new Error(
      `${why} Nothing was borrowed; ${store}'s own ${storeProvider} on this machine is as it was.`
    );
  };
  const refused = await answers(accountId).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  );
  if (refused) {
    return undo(`The lent sign-in did not answer: ${refused}.`);
  }
  if (!(await dropHomeEntry(path, storeProvider, read))) {
    return undo(`${store} changed its own ${storeProvider} meanwhile.`);
  }
  moveLog(
    `borrowed; ${store}'s own store no longer holds its expired ${storeProvider}`
  );
  return { store: "the account's credential file" };
};

/** Drops an account's store here with nothing signed out: its credential is another account's now. */
const dropStore = async (accountId: string): Promise<void> => {
  signIns.get(accountId)?.abort.abort();
  signIns.delete(accountId);
  for (const key of runtimes.keys()) {
    if (key.startsWith(`${accountId}\u0000`)) {
      runtimes.delete(key);
    }
  }
  await removeAccount(accountId);
};

/**
 * A sign-in made into `from` came out as `into`, an account that already is
 * `expected` ({@link CONTROL_JOIN_PROVIDER_ACCOUNT}). When `into` already
 * holds a credential here, `from`'s is a second grant of the same person:
 * signed out through pi-ai and dropped. Else it moves into `into`'s store,
 * checked to answer there ({@link answers}) before `from`'s store is dropped;
 * one that does not answer stays where it was.
 */
export const joinProviderAccount = async (
  from: string,
  into: string,
  expected: AccountIdentity
): Promise<AccountJoinedOn> => {
  const held = readHeld(from);
  if (!held) {
    throw new Error("The sign-in's store on this machine holds nothing.");
  }
  const identity = identityOf(held.provider, held.credential);
  if (!(identity && sameIdentity(identity, expected))) {
    throw new Error(`The sign-in on this machine is not ${expected.email}.`);
  }
  if (readHeld(into)) {
    await forgetProviderAccount(from);
    moveLog(
      `${from} joined ${into}: ${into}'s own sign-in kept, ${from}'s signed out`
    );
    return { outcome: "kept" };
  }
  await serial(into, () => writeHeld(into, held));
  const refused = await answers(into).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  );
  if (refused) {
    await serial(into, () => writeHeld(into, undefined));
    throw new Error(
      `${expected.email}'s sign-in did not answer as ${into}'s: ${refused}. It stays where it was.`
    );
  }
  await dropStore(from);
  moveLog(`${from} joined ${into}: its sign-in is ${into}'s here now`);
  return { outcome: "moved" };
};

// ── OpenCode: each account's own server and its store ─────────────────

/** OpenCode's id for an account provider: ChatGPT is its `openai`. */
export const opencodeProviderOf = (provider: string): string =>
  provider === "openai-codex" ? "openai" : provider;

/**
 * The data dir of the account's own OpenCode server, its `XDG_DATA_HOME`:
 * OpenCode reads its store at `Global.Path.data/auth.json`, `data` being
 * `xdgData/opencode` (v1.18.34 packages/opencode/src/auth/index.ts 10,
 * packages/core/src/global.ts 11), so this server's store holds this
 * account's credential and nothing else. Beside the session credentials,
 * hidden as they are from every workspace boundary.
 */
export const opencodeAccountHome = (accountId: string): string =>
  join(sessionIdentityDir(), "opencode-accounts", accountId);

/** The account's OpenCode store, in its server's data dir. */
export const opencodeAccountStore = (accountId: string): string =>
  join(opencodeAccountHome(accountId), "opencode", "auth.json");

/**
 * Written in an account's OpenCode store where the refresh token of a sign-in
 * whose refresh token rotates would be: pi-ai stays its only refresher, and
 * the agent writes each fresh access token into the store ahead of its
 * expiry. A refresh OpenCode tried with it would fail at the provider.
 */
export const OPENCODE_MARKER = "cawco-account";

/**
 * The OpenCode providers whose own sign-in plugin reads the store on every
 * request (v1.18.34: `const currentAuth = await getAuth()` inside the
 * loader's fetch, plugin/openai/codex.ts 363, github-copilot/copilot.ts 103,
 * xai.ts 225; `Auth.all` reads the file on each call, auth/index.ts 58-67):
 * a token the agent refreshes reaches their next request. Everything else
 * OpenCode reads once, when an instance starts (`provider.key`,
 * provider/provider.ts 1647-1656), so it is part of how the server was
 * launched ({@link opencodeLaunchCredential}).
 */
const READS_EACH_REQUEST = new Set(["openai", "github-copilot", "xai"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The account's credential as OpenCode's own sign-in would have stored it
 * (OpenCode's `Auth.Info` shapes, auth/index.ts 14-33), under OpenCode's id
 * for the provider:
 * - ChatGPT and xAI: the access token, its expiry and (ChatGPT) its account,
 *   as their sign-ins store them, with {@link OPENCODE_MARKER} for the
 *   refresh token they rotate;
 * - Copilot: the GitHub token as both, expiring never, as its own sign-in
 *   stores it (copilot.ts 294-299) and sends it (164);
 * - a key: the key, with what OpenCode kept beside it;
 * - any other sign-in: its access token as the key, which is how OpenCode
 *   sends a key to a provider it has no sign-in plugin for.
 */
export const opencodeAuthOf = (
  held: Held
): Record<string, Record<string, unknown>> => {
  const id = opencodeProviderOf(held.provider);
  const { credential } = held;
  if (credential.type === "api_key") {
    const { metadata } = credential as { metadata?: unknown };
    return credential.key
      ? {
          [id]: {
            type: "api",
            key: credential.key,
            ...(isRecord(metadata) ? { metadata } : {}),
          },
        }
      : {};
  }
  if (!READS_EACH_REQUEST.has(id)) {
    return { [id]: { type: "api", key: credential.access } };
  }
  if (id === "github-copilot") {
    const { enterpriseUrl } = credential as { enterpriseUrl?: unknown };
    return {
      [id]: {
        type: "oauth",
        refresh: credential.refresh,
        access: credential.refresh,
        expires: 0,
        ...(typeof enterpriseUrl === "string" && enterpriseUrl
          ? { enterpriseUrl }
          : {}),
      },
    };
  }
  const accountId =
    id === "openai"
      ? ((typeof credential.accountId === "string"
          ? credential.accountId
          : null) ?? chatgptClaims(credential.access).accountId)
      : null;
  return {
    [id]: {
      type: "oauth",
      access: credential.access,
      refresh: OPENCODE_MARKER,
      expires: credential.expires,
      ...(accountId ? { accountId } : {}),
    },
  };
};

/**
 * What of the account's credential its OpenCode server took when it started:
 * a fingerprint of a key, or of a sign-in OpenCode reads only then; for a
 * sign-in it reads on every request, only which provider. A server launched
 * on another is replaced at its next rest (opencode.ts).
 */
export const opencodeLaunchCredential = (accountId: string): string => {
  const held = readHeld(accountId);
  if (!held) {
    return "none";
  }
  const id = opencodeProviderOf(held.provider);
  if (held.credential.type === "oauth" && READS_EACH_REQUEST.has(id)) {
    return id;
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(opencodeAuthOf(held)))
    .digest("hex")
    .slice(0, 16);
  return `${id}:${fingerprint}`;
};

/**
 * The provider settings a key carries (pi-ai's `ApiKeyCredential.env`: "Provider-scoped
 * environment/config values such as Cloudflare account/gateway ids"), for its
 * OpenCode server's environment: OpenCode reads Google Vertex's project and
 * location, Bedrock's region and SAP's deployment only from there
 * (provider/provider.ts 343-369, 550-598, 620-629 at v1.18.34). Each account
 * has its own server, so two accounts' settings never meet.
 */
export const opencodeAccountEnv = (
  accountId: string
): Record<string, string> => {
  const credential = readHeld(accountId)?.credential;
  return credential?.type === "api_key" ? { ...credential.env } : {};
};

/** The account's OpenCode store made what its credential is now; gone with it. */
const writeOpencodeAuth = async (
  accountId: string,
  held: Held | undefined
): Promise<void> => {
  if (!held) {
    await rm(opencodeAccountHome(accountId), { recursive: true, force: true });
    return;
  }
  await writeJson(opencodeAccountStore(accountId), opencodeAuthOf(held));
};

/** The account's OpenCode store written from its credential, for a server about to start on it. */
export const prepareOpencodeAccount = async (
  accountId: string
): Promise<void> => {
  const held = readHeld(accountId);
  if (!held) {
    throw new Error(
      `CawCo account ${accountId} holds no sign-in on this machine, so no OpenCode server starts on it.`
    );
  }
  await serial(accountId, () => writeOpencodeAuth(accountId, held));
};

/**
 * The entries CawCo kept in OpenCode's own store before each account had a
 * server of its own (`cawco-account` as a key or an access token, which made
 * OpenCode run CawCo's plugin for the provider): removed, so the machine's
 * own OpenCode server lists only the sign-ins really there. A real entry is
 * never touched. The file that plugin read each session's account from
 * (`opencode-accounts-<hub>.json` beside the session credentials) goes too.
 */
export const dropOpencodeMarkers = async (): Promise<void> => {
  const stale = (await readdir(sessionIdentityDir()).catch(() => [])).filter(
    (file) => file.startsWith("opencode-accounts-") && file.endsWith(".json")
  );
  await Promise.all(
    stale.map((file) => rm(join(sessionIdentityDir(), file), { force: true }))
  );
  const path = opencodeStorePath();
  const store = readJson(path);
  const kept = Object.fromEntries(
    Object.entries(store).filter(
      ([, entry]) =>
        entry.key !== OPENCODE_MARKER && entry.access !== OPENCODE_MARKER
    )
  );
  if (Object.keys(kept).length !== Object.keys(store).length) {
    await writeJson(path, kept);
    console.info(
      "[accounts] OpenCode's own store no longer holds CawCo's account markers"
    );
  }
};

// ── The providers an account can be for ─────────────────────────────────

/**
 * pi-ai's OAuth sign-ins that ask for a device code, in pi-ai 1.0.1
 * (dist/auth/oauth/*.js notify `device_code`): finishable from any device.
 * openrouter's is a localhost callback; pi-ai's `openai` OAuth is a second
 * ChatGPT flow, and ChatGPT is `openai-codex` here.
 */
const DEVICE_CODE = new Set([
  "openai-codex",
  "github-copilot",
  "xai",
  "kimi-coding",
  "meta",
  "radius",
]);

/** pi-ai's providers on this machine (its own and those models.json adds), with how each signs in. */
export const piProviders = async () => {
  const runtime = await ModelRuntime.create({ refreshOnCreate: false });
  return runtime.getProviders().map((provider) => {
    const { auth } = provider as {
      auth?: { oauth?: unknown; apiKey?: unknown };
    };
    const oauth = Boolean(auth?.oauth) && provider.id !== "openai";
    return {
      id: provider.id,
      name: String((provider as { name?: unknown }).name ?? provider.id),
      oauth,
      deviceCode: oauth && DEVICE_CODE.has(provider.id),
      key: Boolean(auth?.apiKey),
    };
  });
};
