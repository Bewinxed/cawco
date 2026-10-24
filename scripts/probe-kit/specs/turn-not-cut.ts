/**
 * A turn CawCo did not stop runs to its end. Nothing CawCo does while a
 * turn runs ends, interrupts or relaunches the session's process: a
 * message that arrives is read in that turn or right after it, a mode
 * change, an account move and a custody reattach wait for the turn's end,
 * and the running tool call returns its own result. On a scratch fleet
 * (real hub, agent and sessiond; the real Claude Code CLI against the mock
 * model), one Claude session in Full Send, with two Claude accounts signed
 * in on its machine, told apart by the token each request carries.
 *
 * Each leg starts a turn whose one tool call runs {@link HOLD_S} seconds,
 * then, {@link INTO_MS} into that call, does what the leg names:
 *
 * - (b) a person's message, the call a shell command (`sleep`);
 * - (m) a person's message, the call an MCP tool (the fleet's `probehold`),
 *   which Claude Code cannot move to the background;
 * - (s) a person's message with the session's mode set to what Full Send
 *   runs the CLI in (`bypassPermissions`: the same mode by another name),
 *   then the dashboard's start again in Full Send (a relaunch, its spawn
 *   saying `relaunch`), then another message;
 * - (a) a move to the other account asked by hand, then a person's message;
 * - (c) the agent restarted, its custody reattaching the live process, then
 *   a person's message;
 *
 * and in every leg:
 * - the call's own result reaches the model, and nothing the model is
 *   given in that leg says "moved to the background", "backgrounded by
 *   user", "doesn't want to proceed" or "[Request interrupted";
 * - every message the leg sent is read.
 *
 * Leg (s) also: the relaunch happens once the turn has ended, the agent's
 * log says it waited for it, and the session runs in Full Send after it.
 * Leg (a) also: the move is carried after the turn, and the next turn runs
 * on the other account. Leg (c) also: the agent attached to the live
 * process, and the session's process is the one it was before the restart.
 *
 *   bun scripts/probe-kit/run.ts turn-not-cut
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { CONTROL_SET_PERMISSION_MODE } from "../../../packages/core/src/harness";
import { turnWords } from "../../../packages/core/src/words/turns";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** How long each leg's tool call runs, in seconds. */
const HOLD_S = 20;
/** How far into the call the leg's event comes. */
const INTO_MS = 5000;
const SERVER = "probehold";
const MCP_TOOL = `mcp__${SERVER}__hold`;
/** What the model is told when a call was moved aside or cut short, not answered by its own result. */
const CUT =
  /moved to the background|backgrounded by user|doesn't want to proceed|Request interrupted/g;

/** A second account signed in on the session's machine. */
const SECOND = "acct-turn-other";
const TOKEN = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [SECOND]: "sk-ant-oat01-fake-scratch-fleet-turn-other",
} as const;

/** The account a model request ran on, by its token's end (the first token is the other's prefix). */
const accountOf = (request: Seen): string | undefined =>
  [SECOND, ACCOUNT].find((id) =>
    request.auth.endsWith(TOKEN[id as keyof typeof TOKEN])
  );

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const shell = (leg: string) => ({
  call: {
    name: "Bash",
    input: {
      command: `sleep ${HOLD_S}; echo PROBE-DONE-${leg.toUpperCase()}`,
      description: "Hold the turn",
      timeout: 120_000,
    },
  },
  result: `PROBE-DONE-${leg.toUpperCase()}`,
});

/** Each leg's call and the result that call returns. */
const LEGS = {
  b: shell("b"),
  m: {
    call: { name: MCP_TOOL, input: { seconds: HOLD_S } },
    result: `PROBE-HELD ${HOLD_S}`,
  },
  s: shell("s"),
  a: shell("a"),
  c: shell("c"),
} as const;
type Leg = keyof typeof LEGS;
const tagOf = (leg: Leg) => `PROBE-LEG-${leg.toUpperCase()}`;

/** When each leg's call was handed to the session. */
const called = new Map<Leg, number>();

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.afterTool) {
    return text("Done.");
  }
  for (const leg of Object.keys(LEGS) as Leg[]) {
    if (request.last.includes(tagOf(leg)) && !called.has(leg)) {
      called.set(leg, Date.now());
      return { everyMs: 5, words: [], tool: LEGS[leg].call };
    }
  }
  return text("ok");
};

/** The second account's sign-in, in its own dir, before the hub and agent start. */
const fileSecond = async (fleet: KitFleet): Promise<void> => {
  const dir = join(fleet.home, ".cawco", "accounts", SECOND, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[SECOND],
        expiresAt: Date.now() + 365 * 24 * 3_600_000,
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
        emailAddress: "other@scratch-fleet.test",
        organizationName: "Other Org",
        accountUuid: "00000000-0000-4000-8000-000000000081",
        organizationUuid: "00000000-0000-4000-8000-000000000082",
      },
    })
  );
};

const spec: Spec = {
  name: "turn-not-cut",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    await fileSecond(fleet);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', 'Other', 'green', 1, 0, ?)",
      SECOND,
      Date.now()
    );
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await until(
      `${SECOND} signed in`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          SECOND
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );

    const put = await fetch(`${fleet.base}/api/fleet/mcp/${SERVER}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: {
          command: process.execPath,
          args: [join(import.meta.dir, "../fixtures/hold-mcp-server.ts")],
        },
        enabled: true,
      }),
    });
    check(`the fleet runs ${SERVER}`, put.ok, String(put.status));

    const session = await fleet.spawn("claude", "Turn not cut", undefined, {
      permissionMode: "fullSend",
      account: ACCOUNT,
    });
    const stored = () =>
      fleet.query<{
        account_id: string | null;
        permission_mode: string | null;
        session_id: string | null;
      }>(
        "SELECT account_id, permission_mode, session_id FROM instances WHERE id = ?",
        session
      )[0];

    /** How many cut-call lines the model has been given so far, in its newest request. */
    const cutsSoFar = (from: readonly Seen[]): number =>
      from.at(-1)?.body.match(CUT)?.length ?? 0;

    /** The turn closed on the hub. */
    const turnClosed = (label: string) =>
      until(
        label,
        () =>
          fleet.instance(session)?.turn_open_at === null ? true : undefined,
        Boolean,
        120_000
      ).catch(() => undefined);

    /**
     * One leg: its turn, its event {@link INTO_MS} into the call (which
     * answers the messages it sent), and what the model was given.
     */
    const runLeg = async (
      leg: Leg,
      event: () => Promise<string[]>
    ): Promise<Seen[]> => {
      const { call, result } = LEGS[leg];
      const before = fleet.seen.length;
      const cutBefore = cutsSoFar(fleet.seen);
      await fleet.send(session, `${tagOf(leg)}: hold the turn.`);
      const at = await until(
        `leg ${leg}: its call handed out`,
        () => called.get(leg),
        Boolean,
        120_000
      );
      await Bun.sleep(Math.max(0, at + INTO_MS - Date.now()));
      const said = await event();
      const answered = await until(
        `leg ${leg}: the call's result reached the model`,
        () =>
          fleet.seen
            .slice(before)
            .find(
              (request) => request.afterTool && request.body.includes(result)
            ),
        Boolean,
        (HOLD_S + 90) * 1000
      ).catch(() => undefined);
      const read = await until(
        `leg ${leg}: every message read`,
        () => {
          const all = fleet.seen.at(-1)?.all ?? "";
          return said.every((words) => all.includes(words)) ? true : undefined;
        },
        Boolean,
        120_000
      ).catch(() => false);
      await turnClosed(`leg ${leg}: its turns closed`);
      const after = fleet.seen.slice(before);
      const cutNow = cutsSoFar(after);
      const own = answered?.last.includes(result) === true;
      check(
        `(${leg}) the ${call.name} call returns its own result, and nothing the model is given says it was moved aside or cut`,
        own && cutNow === cutBefore,
        cutNow > cutBefore
          ? `cut: ${[...(after.at(-1)?.body.matchAll(CUT) ?? [])]
              .slice(cutBefore)
              .map((one) => one[0])
              .join(
                ", "
              )}; the call's answer: ${answered?.last.slice(0, 300) ?? "never reached the model"}`
          : (answered?.last.slice(0, 300) ??
              "the call's result never reached the model")
      );
      check(
        `(${leg}) every message it sent is read: ${said.join(" / ")}`,
        read === true,
        read
          ? "read"
          : `not all read; the model's last words: ${(fleet.seen.at(-1)?.all ?? "").slice(-400)}`
      );
      return after;
    };

    const personSays = (words: string) => async (): Promise<string[]> => {
      await fleet.send(session, words);
      return [words];
    };

    // ── (b), (m) a person's message mid-call ──────────────────────────────
    await runLeg("b", personSays("PROBE-PERSON-B: are you there?"));
    await runLeg("m", personSays("PROBE-PERSON-M: are you there?"));

    // ── (s) the same mode by another name, then a start again ─────────────
    const agentBeforeS = await fleet.logMark("agent");
    let relaunchSentAt = 0;
    await runLeg("s", async () => {
      await fleet.control(session, CONTROL_SET_PERMISSION_MODE, [
        "bypassPermissions",
      ]);
      await fleet.send(session, "PROBE-PERSON-S1: mode set.");
      const sessionKey = stored()?.session_id;
      relaunchSentAt = Date.now();
      await fleet.post({
        verb: "spawn",
        machineId: MACHINE,
        instanceId: session,
        requestId: crypto.randomUUID(),
        payload: {
          instanceId: session,
          cwd: fleet.workdir,
          harness: "claude",
          ...(sessionKey ? { resume: { sessionKey } } : {}),
          relaunch: true,
          permissionMode: "fullSend",
        },
      });
      await fleet.send(session, "PROBE-PERSON-S2: and again.");
      return ["PROBE-PERSON-S1: mode set.", "PROBE-PERSON-S2: and again."];
    });
    const sLog = await until(
      "leg s: the agent says the start again waited for the turn and then went",
      async () => {
        const said = await agentBeforeS.since();
        return said.includes(turnWords.turnEndedOpening(session))
          ? said
          : undefined;
      },
      Boolean,
      60_000
    ).catch(async () => await agentBeforeS.since());
    const waited = sLog.includes(turnWords.relaunchWaits(session));
    const sResult = called.get("s");
    check(
      "(s) the start again waited for the turn's end, then started the session again, in Full Send",
      waited &&
        sLog.includes(turnWords.turnEndedOpening(session)) &&
        stored()?.permission_mode === "fullSend",
      `waited ${String(waited)}; asked ${sResult ? relaunchSentAt - sResult : "-"} ms into the call; mode ${stored()?.permission_mode ?? "-"}; agent: ${sLog
        .split("\n")
        .filter((line) => line.includes(session))
        .slice(-6)
        .join(" | ")
        .slice(0, 900)}`
    );

    // ── (a) a move to the other account asked mid-call ────────────────────
    let moveAsked = "";
    await runLeg("a", async () => {
      const asked = await fleet
        .api<{ state: string }>(`/api/instances/${session}/account`, {
          accountId: SECOND,
        })
        .catch((error: unknown) => ({ state: `refused: ${String(error)}` }));
      moveAsked = asked.state;
      await fleet.send(session, "PROBE-PERSON-A: moved?");
      return ["PROBE-PERSON-A: moved?"];
    });
    const moved = await until(
      "leg a: the move carried after the turn",
      () => stored()?.account_id ?? undefined,
      (account) => account === SECOND,
      120_000
    ).catch(() => stored()?.account_id ?? null);
    const nextSent = Date.now();
    await fleet.send(session, "PROBE-PERSON-A2: on the other account?");
    await until(
      "leg a: the next turn reaches the model",
      () => fleet.seen.find((one) => one.at >= nextSent && one.tools),
      Boolean,
      120_000
    ).catch(() => undefined);
    const ranOn = fleet.seen
      .filter((one) => one.at >= nextSent && one.tools)
      .map((one) => accountOf(one) ?? "none");
    check(
      "(a) the move asked mid-call waited for the turn, then was carried, and the next turn runs on the other account",
      moveAsked === "pending" &&
        moved === SECOND &&
        ranOn.length > 0 &&
        ranOn.every((one) => one === SECOND),
      JSON.stringify({ asked: moveAsked, account: moved, ranOn })
    );
    await turnClosed("leg a: the next turn closed");

    // ── (c) the agent restarted mid-call: custody reattaches ──────────────
    const pidBefore = await fleet.sessionPid(session).catch(() => undefined);
    const agentBeforeC = await fleet.logMark("agent");
    await runLeg("c", async () => {
      await fleet.stop("agent");
      fleet.launch("agent");
      await fleet.agentUp();
      await until(
        "leg c: the agent attached to the live process",
        async () =>
          (await agentBeforeC.since()).includes(turnWords.attached(session)) ||
          undefined,
        Boolean,
        60_000
      ).catch(() => undefined);
      await fleet.send(session, "PROBE-PERSON-C: still there?");
      return ["PROBE-PERSON-C: still there?"];
    });
    const pidAfter = await fleet.sessionPid(session).catch(() => undefined);
    const cLog = await agentBeforeC.since();
    check(
      "(c) the restarted agent attached to the live process, which is the one it was before the restart",
      cLog.includes(turnWords.attached(session)) &&
        pidBefore !== undefined &&
        pidBefore === pidAfter,
      `pid before ${String(pidBefore)}, after ${String(pidAfter)}; agent: ${cLog
        .split("\n")
        .filter((line) => line.includes(session))
        .slice(0, 6)
        .join(" | ")
        .slice(0, 900)}`
    );
  },
};

export default spec;
