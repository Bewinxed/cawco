/**
 * A Claude account Claude Code refused for good is taken out of placement
 * where the refusal reaches, and its sessions go to an account that works.
 *
 * On 2026-11-04 a Max account met `oauth_org_not_allowed` (the API's "OAuth
 * authentication is currently not allowed for this organization") on two
 * machines, each on its own credential; the hub read only
 * `authentication_failed` as a refusal, so the account stayed in placement,
 * the rebalancer moved a session onto it, and every message to that session
 * failed with Claude Code's words.
 *
 * - A, the reading: `oauth_org_not_allowed` refuses the account on every
 *   machine, `authentication_failed` the one machine's credential, whatever
 *   their words; `server_error` refuses nothing.
 * - B, the sign-out: the hub's own rule (accounts.ts `signOutRefused`, which
 *   ask-routing.ts `settleRefusal` runs on a session's refused turn) signs the
 *   account out with the refusal's words on every machine it was signed in
 *   on, and leaves the other account alone; one reach `machine` signs it out
 *   on the refusing machine alone.
 * - C, the moves: a session on the refused account whose turn ended on the
 *   refusal moves to the other account (at-limit.ts `decideStop`, cause
 *   `refused-credential`, as `atLimit.signedOut` runs it); the rebalancer's
 *   decision for a session elsewhere (cause `forecast`) never names the
 *   refused account, which reads `signin`; and placement of a delegate
 *   whose type names the refused account starts it on the other account.
 *
 * - D, the way back (accounts.ts `checkRefusal`, which the hub runs hourly
 *   and on `POST /api/accounts/:id/refusal-check`): a check refused again
 *   keeps the account out with the new words; no answer or another error is
 *   no verdict; the route runs the check; a `machine`-reach refusal is never
 *   checked; the last check's time survives a hub opened again on the same
 *   database; a check answered on one machine brings the account back on
 *   every machine, and placement takes it.
 *
 * - E, end to end (a scratch fleet: real hub, agent and sessiond, Claude
 *   Code against the mock model, which answers each account's token as
 *   Anthropic does): accounts R (refused), W and V, R first in placement,
 *   each also signed in on a far machine. A delegate starts on R and its
 *   first request is refused 403 "OAuth authentication is currently not
 *   allowed for this organization", which Claude Code ends the turn on as
 *   `oauth_org_not_allowed`. R is signed out on both machines with Claude
 *   Code's words; the delegate moves to W and carries on there, its item
 *   live; a session already on R moves to an account that works at its
 *   own refused turn; placement starts the next delegate on W. Then W's
 *   token is revoked (403 "OAuth token has been revoked",
 *   `authentication_failed`): W is signed out on this machine only, and
 *   the delegate on it moves to V, its item live.
 *
 * Legs A to D run on an in-process hub on a scratch database; E on a fleet.
 *
 *   bun scripts/probe-kit/run.ts account-refused
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HubAnswer } from "../../../packages/agent/src/hub-client";
import type {
  Account,
  AccountSignin,
} from "../../../packages/core/src/accounts";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { DAY_MS, HOUR_MS } from "../../../packages/core/src/time";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import type { ClaudeRefusal } from "../../../packages/hub/src/accounts";
import {
  ACCOUNT,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import {
  answerText,
  type HubAsk,
  handled,
  hubAt,
  type Said,
  said,
} from "../hub";
import type { Kit, KitFleet, Spec } from "../kit";
import { delegateStarted } from "../kit";

/** `request` as the in-process hub reads it (`hub.handle`). */

/** `ask` of the in-process hub, as its routes read it (`hub.handle`). */
const hubAskedAnswer = async <A extends HubAnswer>(
  hub: { handle: (r: Request) => Promise<Response> | Response },
  ask: HubAsk<A>
): Promise<Said<A>> =>
  said(await ask(handled((request) => hub.handle(request))));

const MACHINE_A = "machine-a";
const MACHINE_B = "machine-b";

const spec: Spec = {
  group: "The hub and machines",
  name: "account-refused",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load: after a spec before it in a run had loaded them, it would open that spec's database",
  run: async (kit: Kit) => {
    // First: the in-process hub below points this process's HOME at its
    // scratch, and the fleet's processes take theirs from it.
    await throughTheAgent(kit);
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "account-refused-")
    );
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const dbPath = join(scratch, "hub", "hub.db");
      const { db, hub } = await hubInProcess(dbPath, join(scratch, "home"));
      const { claudeCredentialRefused, signOutRefused } =
        await import("../../../packages/hub/src/accounts");
      const { accountsRead, decideStop } =
        await import("../../../packages/hub/src/at-limit");
      const { createAdmission } =
        await import("../../../packages/hub/src/admission");
      const { place } = await import("../../../packages/hub/src/placement");

      // A: the reading.
      const orgWords =
        "Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access";
      const org = claudeCredentialRefused("oauth_org_not_allowed", orgWords);
      kit.check(
        "A: oauth_org_not_allowed refuses the account on every machine, its words the reason",
        org?.reach === "account" && org.reason === orgWords,
        JSON.stringify(org)
      );
      const auth = claudeCredentialRefused(
        "authentication_failed",
        "Anmeldung abgelaufen · Bitte /login ausführen"
      );
      kit.check(
        "A: authentication_failed refuses that machine's credential alone",
        auth?.reach === "machine",
        JSON.stringify(auth)
      );
      kit.check(
        "A: server_error refuses nothing",
        claudeCredentialRefused("server_error", "Failed to refresh") ===
          undefined
      );

      // B: the sign-out, on two Claude accounts signed in on two machines.
      const resetsAt = new Date(Date.now() + 3 * HOUR_MS).toISOString();
      const account = (email: string, organization: string, orgId: string) => {
        const made = db.accounts.create({
          provider: "anthropic",
          kind: "subscription",
          identity: { email, organization, orgId },
        });
        db.accounts.putReading(made.id, {
          windows: [
            {
              kind: "session",
              scopeLabel: null,
              group: "session",
              isActive: true,
              percent: 10,
              severity: "normal",
              resetsAt,
            },
          ],
          windowKinds: ["session"],
          subscription: "Claude Max",
        });
        for (const machineId of [MACHINE_A, MACHINE_B]) {
          db.accounts.putSignin({
            accountId: made.id,
            machineId,
            state: "signed-in",
          });
        }
        return made;
      };
      const refused = account("one@example.com", "One's Organization", "org-1");
      const works = account("two@example.com", "Two's Organization", "org-2");
      if (!org) {
        return;
      }
      const out = signOutRefused(db, MACHINE_A, refused.id, org);
      const signinOf = (accountId: string, machineId: string) =>
        db.accounts
          .signins()
          .find(
            (one) => one.accountId === accountId && one.machineId === machineId
          );
      kit.check(
        "B: an account-wide refusal signs the account out on every machine it was signed in on, with the refusal's words",
        out.length === 2 &&
          [MACHINE_A, MACHINE_B].every((machineId) => {
            const one = signinOf(refused.id, machineId);
            return one?.state === "signed-out" && one.reason === orgWords;
          }),
        JSON.stringify({ out, signins: db.accounts.signins() })
      );
      kit.check(
        "B: the other account stays signed in on both machines",
        [MACHINE_A, MACHINE_B].every(
          (machineId) => signinOf(works.id, machineId)?.state === "signed-in"
        )
      );
      // A machine-reach refusal of the other account: its machine alone.
      if (auth) {
        const third = account("three@example.com", "Three's", "org-3");
        signOutRefused(db, MACHINE_A, third.id, auth);
        kit.check(
          "B: a credential refusal signs the account out on its machine alone",
          signinOf(third.id, MACHINE_A)?.state === "signed-out" &&
            signinOf(third.id, MACHINE_B)?.state === "signed-in"
        );
        db.accounts.remove(third.id, "removed");
      }

      // C: the moves, as the at-limit controller and placement decide them.
      const admission = createAdmission(db);
      const now = Date.now();
      const rowOn = (accountId: string) =>
        ({
          id: crypto.randomUUID(),
          machineId: MACHINE_B,
          model: "claude-opus-5-5",
          accountId,
          contextTokens: 40_000,
        }) as unknown as Parameters<typeof accountsRead>[2];
      const inputFor = (
        accountId: string,
        cause: "refused-credential" | "forecast"
      ) => {
        const row = rowOn(accountId);
        const read = accountsRead(db, admission, row, accountId, {
          asks: { kind: "delegates" },
          machineName: MACHINE_B,
          owed: new Map(),
          provenSince: now - HOUR_MS,
          window: 1_000_000,
        });
        return decideStop({
          now,
          cause,
          policy: db.accounts.routing("anthropic").atLimit,
          strategy: read.strategy,
          session: {
            id: row.id,
            model: "claude-opus-5-5",
            context: 40_000,
            window: read.window,
            cacheTtl: null,
            cacheExpiresAt: null,
            burn: read.burn,
            forked: false,
            compactable: true,
            presence: "watched",
            handMove: null,
          },
          current: {
            id: accountId,
            organization: null,
            resetAt: cause === "forecast" ? now + HOUR_MS : null,
          },
          accounts: read.accounts,
        });
      };
      const moved = inputFor(refused.id, "refused-credential");
      kit.check(
        "C: a session whose turn ended on the refusal moves to the account that works",
        moved.action === "move" && moved.targets[0]?.accountId === works.id,
        JSON.stringify(moved)
      );
      const balanced = inputFor(works.id, "forecast");
      const named = balanced.accounts.find(
        (one) => one.accountId === refused.id
      );
      kit.check(
        "C: the rebalancer's decision never moves a session onto the refused account: it reads signin",
        named?.reason.kind === "signin" &&
          !(
            balanced.action === "move" &&
            balanced.targets.some((one) => one.accountId === refused.id)
          ),
        JSON.stringify({ action: balanced.action, named })
      );
      const placed = place({
        kind: "delegates",
        machineId: MACHINE_B,
        now,
        accounts: db.accounts.list(),
        signins: db.accounts.signins(),
        readings: db.accounts.readings(),
        bench: db.accounts.bench(now),
        routing: db.accounts.routing("anthropic"),
        typeAccount: refused.id,
      });
      kit.check(
        "C: a delegate whose type names the refused account starts on the account that works",
        placed.ok &&
          placed.accountId === works.id &&
          placed.strategy !== "type",
        JSON.stringify(placed)
      );

      await wayBack(kit, {
        account,
        auth,
        db,
        dbPath,
        home: join(scratch, "home"),
        hub,
        refused,
        signinOf,
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

type HubInProcess = Awaited<
  ReturnType<
    (typeof import("../../../packages/hub/scripts/hub-in-process"))["hubInProcess"]
  >
>;

/**
 * D: the way back, a check's one turn as the account, on the accounts the
 * legs before left: `refused` signed out account-wide on both machines.
 */
const wayBack = async (
  kit: Kit,
  {
    account,
    auth,
    db,
    dbPath,
    home,
    hub,
    refused,
    signinOf,
  }: {
    account: (email: string, organization: string, orgId: string) => Account;
    auth: ClaudeRefusal | undefined;
    db: HubInProcess["db"];
    dbPath: string;
    home: string;
    hub: HubInProcess["hub"];
    refused: Account;
    signinOf: (
      accountId: string,
      machineId: string
    ) => AccountSignin | undefined;
  }
): Promise<void> => {
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { checkRefusal, refusalsDue, signOutRefused } =
    await import("../../../packages/hub/src/accounts");
  const { place } = await import("../../../packages/hub/src/placement");
  // D: the way back, a check's one turn as the account.
  const orgRefusal = (words: string) => ({
    kind: "error" as const,
    error: "oauth_org_not_allowed",
    text: words,
  });
  const anyOnline = () => true;
  const boxOf = (machineId: string) => machineId.replace("machine-", "box-");
  const standing = (accountId: string) =>
    [MACHINE_A, MACHINE_B].map((machineId) => {
      const one = signinOf(accountId, machineId);
      return `${one?.state}:${one?.refusalReach}:${one?.reason}`;
    });
  const pastDue =
    "Claude Code can't use your Claude subscription, usually because a payment is past due";
  const stillOut = await checkRefusal(
    db,
    refused.id,
    () => Promise.resolve(orgRefusal(pastDue)),
    anyOnline,
    boxOf
  );
  kit.check(
    "D: a check Claude Code refuses again keeps the account out on every machine, its reason the new words",
    stillOut.kind === "refused" &&
      standing(refused.id).every(
        (one) => one === `signed-out:account:${pastDue}`
      ),
    JSON.stringify({ stillOut, out: standing(refused.id) })
  );
  const asked: string[] = [];
  const noVerdict = await checkRefusal(
    db,
    refused.id,
    (machineId) => {
      asked.push(machineId);
      return Promise.resolve(
        machineId === MACHINE_A
          ? { kind: "unread" as const, why: "machine-a didn't answer" }
          : {
              kind: "error" as const,
              error: "server_error",
              text: "Internal server error",
            }
      );
    },
    anyOnline,
    boxOf
  );
  kit.check(
    "D: a check with no answer, a timeout or another error gives no verdict, and the account stays out",
    noVerdict.kind === "none" &&
      noVerdict.why ===
        `machine-a didn't answer; ${accountsWords.problem.checkWhy.said("Internal server error", "box-b", "server_error")}` &&
      asked.length === 2 &&
      standing(refused.id).every((one) => one.startsWith("signed-out:account")),
    JSON.stringify({ noVerdict, asked })
  );
  const offline = await checkRefusal(
    db,
    refused.id,
    () => Promise.reject(new Error("an offline machine is never asked")),
    () => false,
    boxOf
  );
  kit.check(
    "D: with no machine that holds its sign-in connected, nothing is asked and there is no verdict",
    offline.kind === "none" &&
      offline.why === accountsWords.problem.checkWhy.noMachine,
    JSON.stringify(offline)
  );

  // The route runs the same check: here no machine is connected.
  const routed = await hubAskedAnswer(hub, (client) =>
    client.api.accounts({ id: refused.id })["refusal-check"].post()
  );
  const routedBody = routed.text;
  const machineRefused = account("four@example.com", "Four's", "org-4");
  if (auth) {
    signOutRefused(db, MACHINE_A, machineRefused.id, auth);
  }
  const machineRoute = await hubAskedAnswer(hub, (client) =>
    client.api.accounts({ id: machineRefused.id })["refusal-check"].post()
  );
  const machineBody = machineRoute.text;
  kit.check(
    "D: POST /api/accounts/:id/refusal-check runs the check: an account refused account-wide is checked (no machine connected here: no verdict)",
    routed.status === 200 && !routed.refused && routed.json.kind === "none",
    `${routed.status} ${routedBody.slice(0, 300)}`
  );
  const machineChecked: string[] = [];
  await checkRefusal(
    db,
    machineRefused.id,
    (machineId) => {
      machineChecked.push(machineId);
      return Promise.resolve({ kind: "answered" as const });
    },
    anyOnline,
    boxOf
  );
  kit.check(
    "D: a refusal of one machine's credential is never checked: the route and the check answer not-refused, nothing is asked, and it stays signed out",
    machineRoute.status === 200 &&
      !machineRoute.refused &&
      machineRoute.json.kind === "not-refused" &&
      machineChecked.length === 0 &&
      signinOf(machineRefused.id, MACHINE_A)?.state === "signed-out",
    `${machineRoute.status} ${machineBody.slice(0, 200)}`
  );

  // The hourly clock, kept with the account across a restart.
  const checkedAt = db.accounts.refusalCheckedAt(refused.id) ?? 0;
  const again = await hubInProcess(dbPath, home);
  const keptAt = again.db.accounts.refusalCheckedAt(refused.id);
  const soon = refusalsDue(again.db, checkedAt + HOUR_MS - 1);
  const due = refusalsDue(again.db, checkedAt + HOUR_MS);
  kit.check(
    "D: a hub opened again on the same database keeps each refused account's last check: not due before its hour, due at it",
    checkedAt > 0 &&
      keptAt === checkedAt &&
      !soon.includes(refused.id) &&
      due.includes(refused.id) &&
      !due.includes(machineRefused.id),
    JSON.stringify({ checkedAt, keptAt, soon, due })
  );

  const backCheckedOn: string[] = [];
  const back = await checkRefusal(
    db,
    refused.id,
    (machineId) => {
      backCheckedOn.push(machineId);
      return Promise.resolve({ kind: "answered" as const });
    },
    anyOnline,
    boxOf
  );
  kit.check(
    "D: a check that is answered brings the account back on every machine its refusal signed out, after one turn on one machine",
    back.kind === "back" &&
      back.machines.length === 2 &&
      backCheckedOn.length === 1 &&
      standing(refused.id).every((one) => one === "signed-in:null:null"),
    JSON.stringify({ back, backCheckedOn, out: standing(refused.id) })
  );
  const placedBack = place({
    kind: "delegates",
    machineId: MACHINE_B,
    now: Date.now(),
    accounts: db.accounts.list(),
    signins: db.accounts.signins(),
    readings: db.accounts.readings(),
    bench: db.accounts.bench(Date.now()),
    routing: db.accounts.routing("anthropic"),
    typeAccount: refused.id,
  });
  kit.check(
    "D: placement takes the account back: a delegate whose type names it starts on it",
    placedBack.ok && placedBack.accountId === refused.id,
    JSON.stringify(placedBack)
  );
};

/** E's accounts beside the fleet's own (R, its first): each a fake login and token. */
const W = "acct-refused-w";
const V = "acct-refused-v";
const R_TOKEN = "sk-ant-oat01-fake-scratch-fleet";
const W_TOKEN = "sk-ant-oat01-fake-refused-w";
const V_TOKEN = "sk-ant-oat01-fake-refused-v";
/** A machine the fleet has none of: each account is signed in there too. */
const FAR = "machine-far";
/** What opens the first delegate's brief, so the mock knows its requests. */
const DELEGATE = "PROBE-REFUSED-DELEGATE";
/** Anthropic's words for an organization whose subscription access is refused. */
const ORG_REFUSED =
  "OAuth authentication is currently not allowed for this organization.";
/** Anthropic's words for a revoked OAuth token. */
const REVOKED = "OAuth token has been revoked.";

/** What opens the next delegate's brief: its turns are held, on W until W is revoked, on V for good. */
const NEXT = "PROBE-REFUSED-NEXT";

/**
 * E's mock state: whether W's token is revoked (`revoke` lets the next
 * delegate's held turn on W go, refused), and what holds the delegates'
 * turns once they reach the account they moved to, so their items stay
 * live while the legs read them and no quiet turns pile up.
 */
const e = {
  revoked: false,
  revoke: Promise.withResolvers<void>(),
  held: Promise.withResolvers<void>(),
};

const limitsNow = (): Reply["limits"] => ({
  fiveHour: { resetsAt: Date.now() + 3 * HOUR_MS, utilization: 0.1 },
  sevenDay: { resetsAt: Date.now() + 5 * DAY_MS, utilization: 0.1 },
});

/** The mock as Anthropic answers each account's token. */
const respondE = async (request: Seen): Promise<Reply> => {
  if (request.auth.includes(R_TOKEN)) {
    return {
      everyMs: 5,
      words: [],
      deny: { status: 403, message: ORG_REFUSED },
    };
  }
  if (request.tools && request.all.includes(NEXT)) {
    if (request.auth.includes(W_TOKEN)) {
      await e.revoke.promise;
    } else {
      await e.held.promise;
    }
  }
  if (request.auth.includes(W_TOKEN) && e.revoked) {
    return { everyMs: 5, words: [], deny: { status: 403, message: REVOKED } };
  }
  // The first delegate's turn on W is held open: its item stays live while
  // the legs read it, and no quiet turns pile up.
  if (request.tools && request.all.includes(DELEGATE)) {
    await e.held.promise;
  }
  return { everyMs: 5, words: ["ok"], limits: limitsNow() };
};

/** A store of `id` in the fleet's HOME: a fake login, `token` its credential. */
const furnish = async (
  home: string,
  id: string,
  token: string,
  n: string
): Promise<void> => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: token,
        refreshToken: `sk-ant-ort01-fake-refused-${n}`,
        expiresAt: Date.now() + 365 * DAY_MS,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: `${n}@scratch-fleet.test`,
        organizationName: `${n} Organization`,
        accountUuid: `00000000-0000-4000-8000-0000000000${n}1`,
        organizationUuid: `00000000-0000-4000-8000-0000000000${n}2`,
      },
    })
  );
};

/** A reading of `id` (one session window, 10% used), so a move may weigh it. */
const fileReading = (fleet: KitFleet, id: string): void => {
  fleet.write(
    "INSERT OR REPLACE INTO account_readings (account_id, subscription, window_kinds, last_seen_at) VALUES (?, 'Claude Max', '[\"session\"]', ?)",
    id,
    Date.now()
  );
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, 10, 'normal', ?)",
    id,
    new Date(Date.now() + 3 * HOUR_MS).toISOString()
  );
};

const signinOn = (fleet: KitFleet, id: string, machineId: string) =>
  fleet.query<{
    reason: string | null;
    refusal_reach: string | null;
    state: string;
  }>(
    "SELECT state, reason, refusal_reach FROM account_signins WHERE account_id = ? AND machine_id = ?",
    id,
    machineId
  )[0];

const accountOfRow = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id;

/** The requests that reached the mock on `token` since `since`. */
const requestsOn = (fleet: KitFleet, token: string, since: number) =>
  fleet.seen.filter((one) => one.auth.includes(token) && one.at >= since);

/** E: the refusal through the real agent → hub path. */
const throughTheAgent = async (kit: Kit): Promise<void> => {
  e.revoked = false;
  e.revoke = Promise.withResolvers<void>();
  e.held = Promise.withResolvers<void>();
  const fleet = await kit.fleet(respondE);
  try {
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    for (const [id, order] of [
      [W, 1],
      [V, 2],
    ] as const) {
      fleet.write(
        "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', ?, 'green', ?, 0, ?)",
        id,
        id,
        order,
        Date.now()
      );
    }
    const routed = await hubAt(fleet.base)
      .api.accounts.routing({ provider: "anthropic" })
      .put({
        yours: { strategy: "fill-first" },
        delegates: { strategy: "fill-first" },
        atLimit: { move: true, waitMinutes: 15, moveWholeUnderK: 200 },
      });
    kit.check(
      "E setup: routing fills R first, then W, then V",
      routed.error === null,
      `${routed.status} ${answerText(routed)}`
    );
    await furnish(home, W, W_TOKEN, "w");
    await furnish(home, V, V_TOKEN, "v");
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    for (const id of [W, V]) {
      await until(
        `${id} signed in`,
        () => signinOn(fleet, id, machineOf(fleet))?.state,
        (state) => state === "signed-in",
        120_000
      );
    }
    for (const id of [ACCOUNT, W, V]) {
      fileReading(fleet, id);
      fleet.write(
        "INSERT OR REPLACE INTO account_signins (account_id, machine_id, state, checked_at) VALUES (?, ?, 'signed-in', ?)",
        id,
        FAR,
        Date.now()
      );
    }

    // A session on R before any refusal: placed there, no turn yet.
    const resting = await fleet.spawn("claude", "Resting on R");
    kit.check(
      "E setup: a session starts on R, placement's first",
      accountOfRow(fleet, resting) === ACCOUNT,
      String(accountOfRow(fleet, resting))
    );

    // The delegate's first turn on R is refused.
    const startedAt = Date.now();
    const delegate = delegateStarted(
      await fleet.api((client) =>
        client.api["work-items"].post({
          parentInstanceId: resting,
          title: "refused delegate",
          prompt: `${DELEGATE}: say ok.`,
          harness: "claude",
          model: MODEL.claude,
          host: true,
        })
      )
    );
    const refusedTo = await until(
      "R signed out on both machines",
      () => [
        signinOn(fleet, ACCOUNT, machineOf(fleet)),
        signinOn(fleet, ACCOUNT, FAR),
      ],
      (both) => both.every((one) => one?.state === "signed-out"),
      180_000
    ).catch(() => [
      signinOn(fleet, ACCOUNT, machineOf(fleet)),
      signinOn(fleet, ACCOUNT, FAR),
    ]);
    kit.check(
      "E1: the first refused turn (403 org not allowed, oauth_org_not_allowed) signs R out on every machine, reach account, with Claude Code's words",
      refusedTo.every(
        (one) =>
          one?.state === "signed-out" &&
          one.refusal_reach === "account" &&
          !!one.reason
      ) && requestsOn(fleet, R_TOKEN, startedAt).length > 0,
      JSON.stringify(refusedTo)
    );
    const onW = await until(
      "the delegate's turn reaches the mock on W",
      () =>
        requestsOn(fleet, W_TOKEN, startedAt).filter((one) =>
          one.all.includes(DELEGATE)
        ).length,
      (n) => n > 0,
      180_000
    ).catch(() => 0);
    const [item] = fleet.query<{ state: string; error: string | null }>(
      "SELECT state, error FROM work_items WHERE id = ?",
      delegate.workItemId
    );
    kit.check(
      "E2: the refused delegate moves to W and carries on there, and its work item stays live",
      accountOfRow(fleet, delegate.instanceId) === W &&
        onW > 0 &&
        item?.state !== "failed" &&
        item?.state !== "cancelled",
      JSON.stringify({
        account: accountOfRow(fleet, delegate.instanceId),
        onW,
        item,
      })
    );

    // The session already on R: its own turn meets the same refusal.
    const sentAt = Date.now();
    await fleet.send(resting, "PROBE-REFUSED-RESTING hello");
    const tokenOf = { [W]: W_TOKEN, [V]: V_TOKEN } as Record<string, string>;
    const restingAnswered = await until(
      "the resting session answers on an account that works",
      () => {
        const now = accountOfRow(fleet, resting) ?? "";
        const token = tokenOf[now];
        return token
          ? requestsOn(fleet, token, sentAt).filter((one) =>
              one.all.includes("PROBE-REFUSED-RESTING")
            ).length
          : 0;
      },
      (n) => n > 0,
      180_000
    ).catch(() => 0);
    kit.check(
      "E2: a session already on R moves to an account that works at its own refused turn, and carries on there",
      accountOfRow(fleet, resting) !== ACCOUNT && restingAnswered > 0,
      JSON.stringify({ account: accountOfRow(fleet, resting), restingAnswered })
    );

    // Placement takes R no more.
    const next = delegateStarted(
      await fleet.api((client) =>
        client.api["work-items"].post({
          parentInstanceId: resting,
          title: "next delegate",
          prompt: `${NEXT}: say ok.`,
          harness: "claude",
          model: MODEL.claude,
          host: true,
        })
      )
    );
    kit.check(
      "E3: placement starts the next delegate on W, never on R",
      accountOfRow(fleet, next.instanceId) === W,
      String(accountOfRow(fleet, next.instanceId))
    );

    // authentication_failed: W's token revoked, on this machine alone. The
    // next delegate's turn, held on W, is answered with the refusal.
    await until(
      "the next delegate's turn held on W",
      () =>
        requestsOn(fleet, W_TOKEN, 0).filter(
          (one) => one.tools && one.all.includes(NEXT)
        ).length,
      (n) => n > 0,
      180_000
    );
    e.revoked = true;
    const revokedAt = Date.now();
    e.revoke.resolve();
    const wOut = await until(
      "W signed out here",
      () => signinOn(fleet, W, machineOf(fleet)),
      (one) => one?.state === "signed-out",
      180_000
    ).catch(() => signinOn(fleet, W, machineOf(fleet)));
    const nextOnV = await until(
      "the next delegate answers on V",
      () =>
        requestsOn(fleet, V_TOKEN, revokedAt).filter((one) =>
          one.all.includes(NEXT)
        ).length,
      (n) => n > 0,
      180_000
    ).catch(() => 0);
    const [nextItem] = fleet.query<{ state: string }>(
      "SELECT state FROM work_items WHERE id = ?",
      next.workItemId
    );
    kit.check(
      "E4: a revoked token (authentication_failed) signs W out on this machine only, reach machine; the delegate on W moves to V and carries on, its item live",
      wOut?.state === "signed-out" &&
        wOut.refusal_reach === "machine" &&
        signinOn(fleet, W, FAR)?.state === "signed-in" &&
        accountOfRow(fleet, next.instanceId) === V &&
        nextOnV > 0 &&
        nextItem?.state !== "failed",
      JSON.stringify({
        here: wOut,
        far: signinOn(fleet, W, FAR),
        account: accountOfRow(fleet, next.instanceId),
        nextOnV,
        nextItem,
      })
    );
  } finally {
    e.revoke.resolve();
    e.held.resolve();
  }
};

/** The fleet's one machine. */
const machineOf = (fleet: KitFleet): string =>
  fleet.query<{ machine_id: string }>(
    "SELECT machine_id FROM agents WHERE machine_id != ?",
    FAR
  )[0]?.machine_id ?? "";

export default spec;
