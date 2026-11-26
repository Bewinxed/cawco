/**
 * An Antigravity account's sign-in on this machine, into the account's own
 * agy home (agy-launch.ts), on the one method the account was made with
 * (core harness/agy-account.ts). CawCo never reads or holds a Google
 * sign-in: agy keeps it in a file in the home (core paths/harnesses.ts
 * `agySignInFile`), which CawCo only looks for. Follows T3 Code's
 * `antigravityAuthSupport.ts` and `AntigravityDriver.ts`.
 *
 * - A Google account (`oauth-personal`): agy's own `agy acp --login`, run
 *   under a pseudo-terminal (tool-signin.ts `beginPtySignin`); its link
 *   goes to the person on whatever device they are on, and the code Google
 *   shows them is typed back into it.
 * - Gemini Enterprise (`oauth-business`): ACP `authenticate`, whose browser
 *   agy opens through the platform's opener; CawCo puts its own opener first
 *   on agy's PATH, which only hands the link on, so no browser opens on the
 *   machine. Google sends the person's browser back to agy's loopback on
 *   this machine; on another device that address fails, so the person
 *   pastes it and CawCo forwards it to agy's loopback here.
 * - A Gemini API key or Agent Platform: connected, no browser. The key goes
 *   into the account's store (provider-accounts.ts), never a file agy reads.
 *   Agent Platform runs on a Google Cloud project and location with the
 *   machine's gcloud default credentials, which must be there: agy 1.5.18's
 *   ACP takes no key for it (core harness/agy-account.ts).
 *
 * What a method needs and the account lacks is refused in words before any
 * agy process starts.
 */
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { client, methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
  type AccountIdentity,
  type AccountProbe,
  type AccountReport,
  type ProviderSigninChallenge,
  type ProviderSigninResult,
  sameIdentity,
} from "@cawco/core/accounts";
import { boundedRead } from "@cawco/core/effect/bounded";
import {
  AGY_PROVIDER,
  type AgyAccountRecord,
  type AgySignIn,
  agyMethodKind,
  agyRecordRefusal,
  type GcpPlace,
  placeOf,
} from "@cawco/core/harness/agy-account";
import {
  AGY_APP_DATA,
  agyAccountHome,
  agySignInFile,
} from "@cawco/core/paths/harnesses";
import { runtimeVersion } from "@cawco/core/runtime";
import { agyWords } from "@cawco/core/words/agy";
import { lastLines } from "@cawco/core/words/helpers";
import { Effect, Fiber, Schedule } from "effect";
import {
  identityOf,
  providerAccountReports,
  readHeld,
  setProviderKey,
} from "../provider-accounts";
import {
  beginPtySignin,
  completePtySignin,
  endPtySignin,
  ptySigninWaits,
} from "../tool-signin";
import {
  agyArgs,
  agyEnvironment,
  agyOpeners,
  agyRecordOn,
  agyToStart,
  endGroup,
  type KeyringGuard,
  prepareAgyHome,
  refuseKeyring,
  signedInAt,
  startAcp,
  writeAgyRecord,
} from "./agy-launch";
import { agyAccountIds, agyAccountModels } from "./agy-models";

/** Thrown with the words the person reads. */
const refused = (words: string): Error => new Error(words);

// ── Where a sign-in stands ────────────────────────────────────────────────

/** Whether agy keeps a Google sign-in in the account's home: the file is there; what it holds is never read. */
const signedInHere = (accountId: string): boolean =>
  existsSync(agySignInFile(accountId));

/**
 * Where gcloud keeps the machine's Application Default Credentials, which
 * agy reads for Agent Platform: gcloud's own default place, as
 * Google's auth libraries find it (`%APPDATA%\gcloud` on Windows,
 * `~/.config/gcloud` elsewhere). `CLOUDSDK_CONFIG` is never handed to agy
 * (agy-launch.ts `droppedForAgy`), so no other place counts.
 */
const adcFile = (): string =>
  join(
    process.platform === "win32"
      ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
      : join(homedir(), ".config"),
    "gcloud",
    "application_default_credentials.json"
  );

/**
 * An Agent Platform account on a Google Cloud place, as an identity: the
 * project its name, the project and location its id, so the same place on
 * two machines is one account. A Google account names nobody CawCo can read.
 */
const placeIdentity = (place: GcpPlace): AccountIdentity => ({
  email: place.project,
  organization: `gcp:${place.project}/${place.location}`,
  orgId: `gcp:${place.project}/${place.location}`,
});

/** Whether an account's record lets it run here: its method's sign-in, key or place is on this machine. */
const runsHere = (accountId: string, record: AgyAccountRecord): boolean => {
  switch (record.method) {
    case "oauth-personal":
    case "oauth-business":
      return signedInHere(accountId);
    case "gemini-api-key":
      return readHeld(accountId)?.provider === AGY_PROVIDER;
    case "agent-platform":
      return placeOf(record.gcp) !== undefined && existsSync(adcFile());
    default:
      return false;
  }
};

/** Who an account is, as far as this machine can say: its key's fingerprint, its Google Cloud place, or nobody. */
const identityHere = (
  accountId: string,
  record: AgyAccountRecord
): AccountIdentity | undefined => {
  const held = readHeld(accountId);
  if (held?.provider === AGY_PROVIDER) {
    return identityOf(held.provider, held.credential);
  }
  const place = placeOf(record.gcp);
  return record.method === "agent-platform" && place
    ? placeIdentity(place)
    : undefined;
};

/** Each Antigravity account's store on this machine, as the hub reads every account's (core `AccountReport`). */
const agyAccountReports = (): AccountReport[] =>
  agyAccountIds().flatMap((account) => {
    const record = agyRecordOn(account);
    if (!record) {
      return [];
    }
    const identity = identityHere(account, record);
    return [
      {
        account,
        loggedIn: runsHere(account, record),
        provider: AGY_PROVIDER,
        kind: agyMethodKind(record.method),
        ...(identity ? { identity } : {}),
      } satisfies AccountReport,
    ];
  });

/**
 * Every provider account's store on this machine (provider-accounts.ts
 * `providerAccountReports`), an Antigravity account's said by its method
 * here: its sign-in in its home, its key, or its place.
 */
export const machineProviderAccountReports = (): AccountReport[] => {
  const agy = agyAccountReports();
  const ours = new Set(agy.map((one) => one.account));
  return [
    ...providerAccountReports().filter((one) => !ours.has(one.account)),
    ...agy,
  ];
};

// ── Connect: a key, or a Google Cloud place ──────────────────────────────

/**
 * Core `CONTROL_CONNECT_AGY`: a Gemini API key or Agent Platform account
 * set up here, no browser. Its record checked and written; a key kept in the
 * account's store (one other than the account already is answers
 * `mismatch`, and nothing is written); Agent Platform on its place with the
 * machine's gcloud default credentials, refused when there are none.
 */
export const connectAgy = async (
  accountId: string,
  record: AgyAccountRecord,
  key: string | null,
  expected: AccountIdentity | null
): Promise<ProviderSigninResult> => {
  const why = agyRecordRefusal(record, "api_key");
  if (why) {
    throw refused(why);
  }
  const place = placeOf(record.gcp);
  const given = key?.trim() || undefined;
  if (record.method === "gemini-api-key" && !given) {
    throw refused(agyWords.noKey("Gemini API key"));
  }
  if (record.method === "agent-platform" && given) {
    throw refused(agyWords.platformNoKey);
  }
  if (record.method === "agent-platform" && !existsSync(adcFile())) {
    throw refused(agyWords.noAdc(adcFile()));
  }
  const kept: AgyAccountRecord = {
    method: record.method,
    ...(place ? { gcp: place } : {}),
  };
  if (given) {
    const result = await setProviderKey(
      accountId,
      AGY_PROVIDER,
      given,
      expected
    );
    if (result.state === "signed-in") {
      await writeAgyRecord(accountId, kept);
    }
    return result;
  }
  // Agent Platform on gcloud's credentials: its place is who it is
  // (agyRecordRefusal holds that it has one).
  if (!place) {
    throw refused(agyWords.noPlatformPlace);
  }
  const identity = placeIdentity(place);
  if (expected && !sameIdentity(expected, identity)) {
    return { state: "mismatch", email: identity.email };
  }
  await writeAgyRecord(accountId, kept);
  return { state: "signed-in", email: identity.email, identity, plan: null };
};

// ── A browser sign-in, relayed ────────────────────────────────────────────

/** How long agy may take to show its link: it starts in about a second and a half (agy-models.ts `READ_MS`). */
const LINK_MS = 60_000;
/** How long a sign-in waits for what the person pastes: as tool-signin.ts keeps one. */
const KEEP_MS = 10 * 60_000;
/** How long agy may take to finish once the address is forwarded. */
const EXCHANGE_MS = 120_000;
/** How often the opener's file is looked at while agy's link is awaited. */
const LOOK_MS = 250;
/** How many of agy's last lines a refusal quotes. */
const SAID_LINES = 4;
/** Where Google's sign-in links are: the only host a relayed link may be on. */
const GOOGLE_SIGNIN = "accounts.google.com";

/**
 * The home's openers (agy-launch.ts `agyOpeners`, first on every agy
 * launch's PATH) with the file they write to emptied, for a sign-in to
 * read the link agy opens there. A sign-in's agy also runs with the
 * account's home as its HOME, since `agy acp --login` looks in `~/.gemini`
 * for conversations of its own (item 5's probe): it runs no command of the
 * person's, so nothing else reads it.
 */
const freshOpeners = async (
  home: string
): Promise<{ dir: string; opened: string }> => {
  const openers = agyOpeners(home);
  await rm(openers.opened, { force: true });
  return openers;
};

const SPACES = /\s+/u;

/** The first Google sign-in link in `text`. */
const googleLink = (text: string): URL | undefined => {
  for (const word of text.split(SPACES)) {
    const url = URL.parse(word);
    if (url?.protocol === "https:" && url.host === GOOGLE_SIGNIN) {
      return url;
    }
  }
  return undefined;
};

/** How agy's `authenticate` ended: signed in, or refused in its words. */
type AuthEnd = { ok: true } | { ok: false; said: string };

/** A Gemini Enterprise sign-in waiting for the address the person landed on. */
interface Business {
  /** agy's `authenticate`, still running until Google answers its loopback. */
  readonly authed: Promise<AuthEnd>;
  /** Where Google sends the browser back: agy's loopback on this machine. */
  readonly callback: URL;
  /** Ends agy, its connection and its expiry. */
  readonly end: () => void;
  /** The start's keyring guard (agy-launch.ts `refuseKeyring`), read once agy says it signed in. */
  readonly guard: KeyringGuard;
  /** The `state` the sign-in's link carries, which the address must carry back. */
  readonly state: string;
}

/** The Gemini Enterprise sign-ins waiting here, by account. */
const businesses = new Map<string, Business>();

/** The pseudo-terminal sign-in's key for an account (tool-signin.ts). */
const ptyKey = (accountId: string): string => `agy:${accountId}`;

/** Every sign-in of `accountId` waiting here ended. */
const endWaiting = (accountId: string): void => {
  businesses.get(accountId)?.end();
  businesses.delete(accountId);
  endPtySignin(ptyKey(accountId));
};

/** Every Gemini Enterprise sign-in ended, for the daemon's exit: agy outlives its connection otherwise. */
export const endAgySignins = (): void => {
  for (const one of businesses.values()) {
    one.end();
  }
  businesses.clear();
};

/** An error's words. */
const wordsOf = (error: unknown): string =>
  lastLines(
    (error instanceof Error ? error.message : String(error))
      .split("\n")
      .filter(Boolean),
    SAID_LINES,
    " "
  );

/**
 * agy's ACP `authenticate` for Gemini Enterprise in `home`, its browser
 * opened by CawCo's openers alone, and the link it opened once it does.
 * Refused with agy's words when it ends before showing one, or in words
 * when it shows none in time.
 */
const beginBusiness = async (
  accountId: string,
  run: { bin: string; env: Record<string, string>; home: string }
): Promise<ProviderSigninChallenge> => {
  const openers = await freshOpeners(run.home);
  const signedIn = await signedInAt(run.home);
  const since = Date.now();
  const said: string[] = [];
  const { child, connection } = startAcp(
    {
      bin: run.bin,
      args: agyArgs(run.home),
      cwd: run.home,
      // agy refuses a browser sign-in with no display to open one on; the
      // only opener it finds is CawCo's.
      env: { ...run.env, DISPLAY: ":0", HOME: run.home },
    },
    client({ name: "cawco" }),
    { said: (text) => said.push(text), ended: () => undefined }
  );
  const authed: Promise<AuthEnd> = connection.agent
    .request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "cawco", title: "CawCo", version: runtimeVersion },
    })
    .then(() =>
      connection.agent.request(methods.agent.authenticate, {
        methodId: "oauth-business",
      })
    )
    .then(
      (): AuthEnd => ({ ok: true }),
      (error: unknown): AuthEnd => ({ ok: false, said: wordsOf(error) })
    );
  const guard: KeyringGuard = {
    end: () => endGroup(child),
    home: run.home,
    signedIn,
    since,
  };
  let expiry: Fiber.Fiber<void> | undefined;
  const end = (): void => {
    if (expiry) {
      Effect.runFork(Fiber.interrupt(expiry));
    }
    connection.close();
    endGroup(child);
  };
  // The link agy opened, looked for until it is there, or agy's
  // `authenticate` ended first.
  const look = Effect.promise(() =>
    readFile(openers.opened, "utf8").catch(() => "")
  ).pipe(
    Effect.map(googleLink),
    Effect.repeat(
      Schedule.spaced(LOOK_MS).pipe(
        Schedule.setInputType<URL | undefined>(),
        Schedule.passthrough,
        Schedule.while(({ input }) => input === undefined)
      )
    )
  );
  // What came first: the link, or agy's `authenticate` ending (none, when
  // neither came in time).
  const first: { url: URL } | { ended: AuthEnd } | undefined =
    await Effect.runPromise(
      boundedRead(
        LINK_MS,
        Effect.raceFirst(
          look.pipe(Effect.map((url) => (url ? { url } : undefined))),
          Effect.promise(() => authed).pipe(Effect.map((ended) => ({ ended })))
        )
      ).pipe(Effect.orElseSucceed(() => undefined))
    );
  if (!(first && "url" in first)) {
    const ended = first?.ended;
    // Signed in with no link shown: the keyring's sign-in, unless the home
    // held one of its own.
    if (ended?.ok) {
      await refuseKeyring(guard).finally(end);
    }
    end();
    const why = ended && !ended.ok && ended.said ? ended.said : undefined;
    throw refused(
      ended?.ok
        ? agyWords.alreadySignedIn
        : agyWords.noLink(
            why ?? lastLines(said.join("").split("\n"), SAID_LINES, " ")
          )
    );
  }
  const link = first.url;
  const back = link.searchParams.get("redirect_uri");
  const state = link.searchParams.get("state");
  const callback = back ? URL.parse(back) : null;
  if (!(callback && state && isLoopback(callback))) {
    end();
    throw refused(agyWords.noLink(""));
  }
  businesses.set(accountId, { authed, callback, end, guard, state });
  expiry = Effect.runFork(
    Effect.sleep(KEEP_MS).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (businesses.get(accountId)?.authed === authed) {
            businesses.delete(accountId);
            end();
          }
        })
      )
    )
  );
  return { url: link.href };
};

/** Whether `url` is a loopback address on this machine, plain HTTP: the only place a pasted address is forwarded to. */
const isLoopback = (url: URL): boolean =>
  url.protocol === "http:" &&
  (url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]");

/**
 * What the person pasted, forwarded to agy's loopback here: the address
 * Google sent their browser to, which must be that loopback's path and
 * carry the sign-in's own `state` and a code. Only its query goes on, to the
 * loopback agy named; nothing else is ever fetched. Then agy's
 * `authenticate` waited for. A sign-in that already ended (the person's
 * browser was on this machine and reached agy itself) answers as it ended.
 */
const completeBusiness = async (
  accountId: string,
  one: Business,
  pasted: string
): Promise<void> => {
  const settled = await Promise.race([one.authed, Promise.resolve(undefined)]);
  if (settled === undefined) {
    const given = URL.parse(pasted.trim());
    if (
      !given ||
      given.pathname !== one.callback.pathname ||
      given.searchParams.get("state") !== one.state ||
      !given.searchParams.get("code")
    ) {
      throw refused(agyWords.notCallback);
    }
    const target = new URL(one.callback.href);
    target.search = given.search;
    await Effect.runPromise(
      boundedRead(
        EXCHANGE_MS,
        Effect.promise(() =>
          fetch(target, { redirect: "manual" }).then(
            () => undefined,
            () => undefined
          )
        )
      ).pipe(Effect.orElseSucceed(() => undefined))
    );
  }
  const ended = await Effect.runPromise(
    boundedRead(
      EXCHANGE_MS,
      Effect.promise(() => one.authed)
    ).pipe(Effect.orElseSucceed((): AuthEnd => ({ ok: false, said: "" })))
  );
  businesses.delete(accountId);
  if (ended.ok) {
    await refuseKeyring(one.guard).finally(one.end);
  }
  one.end();
  if (!ended.ok) {
    throw refused(agyWords.signInEnded(ended.said));
  }
};

/**
 * Core `CONTROL_BEGIN_AGY_LOGIN`: agy's own browser sign-in of a Google
 * account or Gemini Enterprise, in the account's home here, on its record
 * (written first, so every launch after runs on it); answers the link agy
 * shows. One already waiting for the account is ended first.
 */
export const beginAgyLogin = async (
  accountId: string,
  record: AgyAccountRecord
): Promise<ProviderSigninChallenge> => {
  const why = agyRecordRefusal(record, "oauth");
  if (why) {
    throw refused(why);
  }
  const place = placeOf(record.gcp);
  const signIn: AgySignIn =
    record.method === "oauth-business" && place
      ? { method: "oauth-business", gcp: place }
      : { method: "oauth-personal" };
  const { bin } = await Effect.runPromise(
    agyToStart().pipe(Effect.mapError((error) => refused(error.message)))
  );
  await writeAgyRecord(accountId, {
    method: signIn.method,
    ...(place && signIn.method === "oauth-business" ? { gcp: place } : {}),
  });
  const home = await Effect.runPromise(
    prepareAgyHome(accountId, signIn).pipe(
      Effect.mapError((error) => refused(error.message))
    )
  );
  endWaiting(accountId);
  const env = agyEnvironment(signIn, home, {});
  if (signIn.method === "oauth-business") {
    return await beginBusiness(accountId, { bin, env, home });
  }
  // agy's `--login` prints its link, which goes to the person, and waits
  // for the code; the browser it also opens, display or none, is CawCo's
  // opener, which opens nothing here.
  await freshOpeners(home);
  const { url } = await beginPtySignin(ptyKey(accountId), {
    bin,
    args: [
      "acp",
      "--login",
      "--disable-telemetry",
      "--gemini-dir",
      home,
      "--app-data-dir",
      AGY_APP_DATA,
    ],
    env: { ...env, HOME: home },
    cwd: home,
    name: "Antigravity",
    loginHosts: [GOOGLE_SIGNIN],
  });
  return { url };
};

/**
 * Core `CONTROL_COMPLETE_AGY_LOGIN`: what the person pasted (Google's code,
 * or the address their browser landed on) handed to the account's sign-in
 * waiting here, and how it ended. Signed in once agy keeps a sign-in in the
 * account's home; agy names nobody CawCo reads, so the account goes by its
 * nickname.
 */
export const completeAgyLogin = async (
  pasted: string,
  accountId: string
): Promise<ProviderSigninResult> => {
  const business = businesses.get(accountId);
  if (business) {
    await completeBusiness(accountId, business, pasted);
  } else if (ptySigninWaits(ptyKey(accountId))) {
    const home = agyAccountHome(accountId);
    const guard: KeyringGuard = {
      end: () => endPtySignin(ptyKey(accountId)),
      home,
      signedIn: await signedInAt(home),
      since: Date.now(),
    };
    await completePtySignin(ptyKey(accountId), pasted);
    await refuseKeyring(guard);
  } else {
    throw refused(agyWords.notWaiting);
  }
  if (!signedInHere(accountId)) {
    throw refused(agyWords.noToken);
  }
  return { state: "signed-in", email: null, identity: null, plan: null };
};

// ── The account's models ──────────────────────────────────────────────────

/**
 * Core `CONTROL_PROBE_ACCOUNT` for an Antigravity account: the models agy
 * lists in the account's own home on its own method (agy-models.ts), which
 * the hub keeps as the account's catalog. Names nobody: CawCo reads no
 * Google sign-in.
 */
export const probeAgyAccount = async (
  accountId: string
): Promise<AccountProbe> => ({
  models: await agyAccountModels(accountId),
});
