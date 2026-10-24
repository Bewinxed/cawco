/**
 * A turn CawCo did not stop runs to its end. Nothing CawCo does while a
 * turn runs ends, interrupts or relaunches the session's process, and
 * nothing the model is given says the person rejected, interrupted or
 * backgrounded anything. On a scratch fleet (real hub, agent and sessiond;
 * the real Claude Code CLI against the mock model), one Claude session in
 * Full Send, with two Claude accounts signed in on its machine, told apart
 * by the token each request carries.
 *
 * The person's message sent while the turn runs a call Claude Code can move
 * aside goes as its send-now (agent claude.ts `SEND_NOW`): the call moves
 * to the background, Claude Code says so in its own words ("so that a
 * message that arrived while it was running can reach you; it was not
 * interrupted"), the message is read within {@link EARLY_MS}, and the
 * call's own result still reaches the model when it ends. Sent while the
 * model is writing, or while a start again holds the session, it waits and
 * is read right after.
 *
 * Each leg starts a turn whose one call runs {@link HOLD_S} seconds (or
 * whose answer streams that long), then, {@link INTO_MS} in, does what the
 * leg names:
 *
 * - (b) a person's message, the call a shell command (`sleep`): read early;
 * - (m) a person's message, the call an MCP tool (the fleet's `probehold`):
 *   read early;
 * - (w) a person's message while the model writes a long answer: the answer
 *   is written to its end, and the message read after it;
 * - (s) the session's mode set to what Full Send runs the CLI in
 *   (`bypassPermissions`: the same mode by another name), the dashboard's
 *   start again in Full Send (a relaunch, its spawn saying `relaunch`),
 *   then a person's message: the call returns its own result in place, the
 *   start again waits for the turn's end, and the message is read by the
 *   process it starts;
 * - (a) a move to the other account asked by hand, then a person's message:
 *   read early; the move waits for the turn and its work, then the next
 *   turn runs on the other account;
 * - (c) the agent restarted, its custody reattaching the live process, then
 *   a person's message: the reattached agent did not see the call start,
 *   so the message waits for the call's own end, which runs in place; the
 *   process is the one it was.
 *
 *   bun scripts/probe-kit/run.ts turn-not-cut
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

/** How long each leg's call runs, or its answer streams, in seconds. */
const HOLD_S = 20;
/** How far into the call the leg's event comes. */
const INTO_MS = 5000;
/** How soon a message sent while every running call can move aside is read. */
const EARLY_MS = 5000;
const SERVER = "probehold";
const MCP_TOOL = `mcp__${SERVER}__hold`;
/** What would name the person for something they did not do. */
const BLAME =
  /backgrounded by user|manually backgrounded|doesn't want to proceed|Request interrupted/g;
/** Claude Code's own words for a call it moved aside to deliver a message (2.1.309). */
const MOVED_FOR_MESSAGE =
  "so that a message that arrived while it was running can reach you; it was not interrupted";
/** Where a moved shell command's output goes, as its moved result names it. */
const OUTPUT_FILE = /Output is being written to: (\S+?)\.(?:\s|$)/;
/** A moved shell command's task, as its moved result names it. */
const TASK_ID = /ID: (\w+)\)/;
/** The words of the streamed answer (w): one every 50 ms for {@link HOLD_S} s. */
const STREAMED = Array.from({ length: HOLD_S * 20 }, (_, n) => `w${n} `);

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

/** Each leg's call (none: a long answer) and the result that call returns. */
const LEGS = {
  b: shell("b"),
  m: {
    call: { name: MCP_TOOL, input: { seconds: HOLD_S } },
    result: `PROBE-HELD ${HOLD_S}`,
  },
  w: { call: undefined, result: STREAMED.at(-1)?.trim() ?? "" },
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
      const { call } = LEGS[leg];
      return call
        ? { everyMs: 5, words: [], tool: call }
        : { everyMs: 50, words: STREAMED };
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

/** How a leg's message is expected to be read. */
type Reading = "early" | "after";

/** What the model was given in a leg, read for its checks. */
interface Given {
  /** The call's result as the model first got it: its own, or the moved one. */
  answer: string;
  /** The person-blaming lines among what the leg gave the model. */
  blamed: string[];
  /** When the leg's call (or answer) was to end, ms after the message was sent. */
  endsAfter: number;
  /** The call's own result reached the model (in place, or once a moved call ended). */
  own: boolean;
  /** When the leg's message was read, ms after it was sent; null when never. */
  readAfter: number | null;
}

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
      (signin) => signin?.state === "signed-in",
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

    /** The person-blaming lines in the newest request so far. */
    const blamesIn = (from: readonly Seen[]): string[] =>
      [...(from.at(-1)?.body.matchAll(BLAME) ?? [])].map((one) => one[0]);

    /** The session at rest on the hub: its turns closed. */
    const atRest = (label: string) =>
      until(
        label,
        () =>
          fleet.instance(session)?.turn_open_at === null ? true : undefined,
        Boolean,
        120_000
      ).catch(() => undefined);

    /** Whether the call's own result reached the model in `after`: in place, or a moved call's once it ended. */
    const ownResult = async (
      leg: Leg,
      after: readonly Seen[],
      answer: string
    ): Promise<boolean> => {
      const { call, result } = LEGS[leg];
      // A streamed answer is the model's own words: whole in what it is
      // given next.
      if (!call) {
        return after.some((request) => request.body.includes(result));
      }
      if (after.some((request) => request.last.includes(result))) {
        return true;
      }
      // A moved shell command's output is in its file, and the model is told
      // when it ends, by its task's id.
      const file = OUTPUT_FILE.exec(answer)?.[1];
      const task = TASK_ID.exec(answer)?.[1];
      if (!(file && task)) {
        return false;
      }
      const output = await readFile(file, "utf8").catch(() => "");
      return (
        output.includes(result) &&
        after.some(
          (request) => request.last.includes(task) && request.last !== answer
        )
      );
    };

    /**
     * One leg: its turn, its event {@link INTO_MS} in, which sends `words`,
     * and what the model was given until the session is at rest again with
     * every call of the leg ended.
     */
    const runLeg = async (
      leg: Leg,
      words: string,
      event: () => Promise<void>
    ): Promise<Given> => {
      const before = fleet.seen.length;
      const blamedBefore = blamesIn(fleet.seen).length;
      await fleet.send(session, `${tagOf(leg)}: hold the turn.`);
      const at = await until(
        `leg ${leg}: its turn under way`,
        () => called.get(leg),
        Boolean,
        120_000
      );
      await Bun.sleep(Math.max(0, at + INTO_MS - Date.now()));
      await event();
      const sentAt = Date.now();
      await fleet.send(session, words);
      const read = await until(
        `leg ${leg}: the message read`,
        () =>
          fleet.seen
            .slice(before)
            .find(
              (request) => request.at >= sentAt && request.all.includes(words)
            ),
        Boolean,
        (HOLD_S + 90) * 1000
      ).catch(() => undefined);
      // Every call of the leg ended, and whatever it started told.
      await Bun.sleep(Math.max(0, at + (HOLD_S + 5) * 1000 - Date.now()));
      await atRest(`leg ${leg}: at rest`);
      const after = fleet.seen.slice(before);
      const { call } = LEGS[leg];
      const answer = call
        ? (after.find((request) => request.afterTool)?.last ?? "")
        : "";
      return {
        answer,
        blamed: blamesIn(after).slice(blamedBefore),
        own: await ownResult(leg, after, answer),
        endsAfter: at + HOLD_S * 1000 - sentAt,
        readAfter: read ? read.at - sentAt : null,
      };
    };

    /** The checks every leg is held to, by how its message is to be read. */
    const held = (leg: Leg, given: Given, reading: Reading): void => {
      const { call } = LEGS[leg];
      const name = call?.name ?? "streamed answer";
      check(
        `(${leg}) nothing the model is given says the person rejected, interrupted or backgrounded anything`,
        given.blamed.length === 0,
        given.blamed.join(", ") || "none"
      );
      check(
        `(${leg}) the ${name}'s own result reaches the model`,
        given.own,
        given.answer.slice(0, 400) || "(no tool result)"
      );
      if (reading === "early") {
        check(
          `(${leg}) the person's message is read within ${EARLY_MS / 1000} s, the ${name} moved aside in Claude Code's own words`,
          given.readAfter !== null &&
            given.readAfter <= EARLY_MS &&
            given.answer.includes(MOVED_FOR_MESSAGE),
          `read ${given.readAfter ?? "never"} ms after it was sent; the call answered: ${given.answer.slice(0, 300)}`
        );
      } else {
        check(
          `(${leg}) the person's message waits, read once the ${name} has ended, which ran in place`,
          given.readAfter !== null &&
            given.readAfter >= given.endsAfter - 1000 &&
            !given.answer.includes(MOVED_FOR_MESSAGE),
          `read ${given.readAfter ?? "never"} ms after it was sent; the call answered: ${given.answer.slice(0, 300) || "(no tool result)"}`
        );
      }
    };

    const nothing = async () => {
      // The leg's event is its message alone.
    };

    // ── (b), (m) a person's message mid-call: read early ─────────────────
    held(
      "b",
      await runLeg("b", "PROBE-PERSON-B: are you there?", nothing),
      "early"
    );
    held(
      "m",
      await runLeg("m", "PROBE-PERSON-M: are you there?", nothing),
      "early"
    );

    // ── (w) a person's message while the model writes: it waits ──────────
    held(
      "w",
      await runLeg("w", "PROBE-PERSON-W: are you there?", nothing),
      "after"
    );

    // ── (s) the same mode by another name, then a start again ─────────────
    const agentBeforeS = await fleet.logMark("agent");
    held(
      "s",
      await runLeg("s", "PROBE-PERSON-S: and now?", async () => {
        await fleet.control(session, CONTROL_SET_PERMISSION_MODE, [
          "bypassPermissions",
        ]);
        const sessionKey = stored()?.session_id;
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
      }),
      "after"
    );
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
    check(
      "(s) the start again waited for the turn's end, then started the session again, in Full Send",
      waited &&
        sLog.includes(turnWords.turnEndedOpening(session)) &&
        stored()?.permission_mode === "fullSend",
      `waited ${String(waited)}; mode ${stored()?.permission_mode ?? "-"}; agent: ${sLog
        .split("\n")
        .filter((line) => line.includes(session))
        .slice(-6)
        .join(" | ")
        .slice(0, 900)}`
    );

    // ── (a) a move to the other account asked mid-call ────────────────────
    let moveAsked = "";
    held(
      "a",
      await runLeg("a", "PROBE-PERSON-A: moved?", async () => {
        const asked = await fleet
          .api<{ state: string }>(`/api/instances/${session}/account`, {
            accountId: SECOND,
          })
          .catch((error: unknown) => ({ state: `refused: ${String(error)}` }));
        moveAsked = asked.state;
      }),
      "early"
    );
    const moved = await until(
      "leg a: the move carried after the turn and its work",
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
    await atRest("leg a: the next turn closed");

    // ── (c) the agent restarted mid-call: custody reattaches ──────────────
    const pidBefore = await fleet.sessionPid(session).catch(() => undefined);
    const agentBeforeC = await fleet.logMark("agent");
    held(
      "c",
      await runLeg("c", "PROBE-PERSON-C: still there?", async () => {
        await fleet.stop("agent");
        fleet.launch("agent");
        await fleet.agentUp();
        await until(
          "leg c: the agent attached to the live process",
          async () =>
            (await agentBeforeC.since()).includes(
              turnWords.attached(session)
            ) || undefined,
          Boolean,
          60_000
        ).catch(() => undefined);
      }),
      "after"
    );
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
