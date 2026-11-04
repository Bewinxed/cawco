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
 *   server.ts `settleRefusal` runs on a session's refused turn) signs the
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
 * An in-process hub on a scratch database; no fleet.
 *
 *   bun scripts/probe-kit/run.ts account-refused
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOUR_MS } from "../../../packages/core/src/time";
import type { Kit, Spec } from "../kit";

const MACHINE_A = "machine-a";
const MACHINE_B = "machine-b";

const spec: Spec = {
  group: "The hub and machines",
  name: "account-refused",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "account-refused-")
    );
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const dbPath = join(scratch, "hub", "hub.db");
      const { db, hub } = await hubInProcess(dbPath, join(scratch, "home"));
      const {
        checkRefusal,
        claudeCredentialRefused,
        refusalsDue,
        signOutRefused,
      } = await import("../../../packages/hub/src/accounts");
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

      // D: the way back, a check's one turn as the account.
      const orgRefusal = (words: string) => ({
        kind: "error" as const,
        error: "oauth_org_not_allowed",
        text: words,
      });
      const anyOnline = () => true;
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
        anyOnline
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
        anyOnline
      );
      kit.check(
        "D: a check with no answer, a timeout or another error gives no verdict, and the account stays out",
        noVerdict.kind === "none" &&
          asked.length === 2 &&
          standing(refused.id).every((one) =>
            one.startsWith("signed-out:account")
          ),
        JSON.stringify({ noVerdict, asked })
      );
      const offline = await checkRefusal(
        db,
        refused.id,
        () => Promise.reject(new Error("an offline machine is never asked")),
        () => false
      );
      kit.check(
        "D: with no machine that holds its sign-in connected, nothing is asked and there is no verdict",
        offline.kind === "none",
        JSON.stringify(offline)
      );

      // The route runs the same check: here no machine is connected.
      const routed = await hub.handle(
        new Request(
          `http://127.0.0.1/api/accounts/${refused.id}/refusal-check`,
          { method: "POST" }
        )
      );
      const routedBody = await routed.text();
      const machineRefused = account("four@example.com", "Four's", "org-4");
      if (auth) {
        signOutRefused(db, MACHINE_A, machineRefused.id, auth);
      }
      const machineRoute = await hub.handle(
        new Request(
          `http://127.0.0.1/api/accounts/${machineRefused.id}/refusal-check`,
          { method: "POST" }
        )
      );
      const machineBody = await machineRoute.text();
      kit.check(
        "D: POST /api/accounts/:id/refusal-check runs the check: an account refused account-wide is checked (no machine connected here: no verdict)",
        routed.status === 200 &&
          (JSON.parse(routedBody) as { kind: string }).kind === "none",
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
        anyOnline
      );
      kit.check(
        "D: a refusal of one machine's credential is never checked: the route and the check answer not-refused, nothing is asked, and it stays signed out",
        machineRoute.status === 200 &&
          (JSON.parse(machineBody) as { kind: string }).kind ===
            "not-refused" &&
          machineChecked.length === 0 &&
          signinOf(machineRefused.id, MACHINE_A)?.state === "signed-out",
        `${machineRoute.status} ${machineBody.slice(0, 200)}`
      );

      // The hourly clock, kept with the account across a restart.
      const checkedAt = db.accounts.refusalCheckedAt(refused.id) ?? 0;
      const again = await hubInProcess(dbPath, join(scratch, "home"));
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
        anyOnline
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
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
