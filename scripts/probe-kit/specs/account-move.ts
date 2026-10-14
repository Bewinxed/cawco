/**
 * A session moved to another account carries on as it would have on the
 * old one: whatever would have woken it there still wakes it. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model)
 * with two fake accounts of one provider, A and B, each with its own token,
 * so every model request says which account it ran on (`Seen.auth`). Each
 * case moves a session through the hub's own door (`POST
 * /api/instances/:id/account`, a person's move) and reads the hub's answer,
 * its row and the mock's requests:
 *
 * 1. Mid-turn (a tool call running): the move waits ("pending"); the turn
 *    finishes its task; the row lands on the other account and a send after
 *    it runs there.
 * 2. A message queued behind a running turn: the move waits; the queued
 *    message is answered; the row lands; a send after it runs there.
 * 3. At rest, waiting on a background command (run_in_background): the move
 *    waits ("pending", for its background task); the command's completion
 *    wakes the session; then the row lands and a send runs there.
 * 4. At rest, with a one-time wake-up scheduled (CronCreate, not
 *    recurring): the move waits; the wake-up fires and is answered; then
 *    the row lands and a send runs there.
 *
 *   bun scripts/probe-kit/run.ts account-move
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

export const B = "acct-scratch-fleet-b";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
};

const words = (text: string): Reply => ({ everyMs: 5, words: [text] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Where the scheduled-wake-up case's turn has got to: its tool calls go one after another. */
let cronStep: "start" | "searched" | "scheduled" = "start";
/** CronCreate's result came back and was answered: the turn that scheduled the wake-up is ending. */
let cronAnswered = false;

/** The cron expression for one minute, `ahead` minutes from now, local time (the scheduler's). */
const cronAt = (ahead: number): string => {
  const at = new Date(Date.now() + ahead * 60_000);
  return `${at.getMinutes()} ${at.getHours()} ${at.getDate()} ${at.getMonth() + 1} *`;
};

const AFTER_MOVE = /AFTER-MOVE-\d/;
/** The words a background command's completion wakes the session with. */
const COMPLETION = /task-notification|bg-finished/i;
const BACKGROUND = /background/;
const WAKE_UP = /wake-up/;

/** Case 1: one tool call that lasts, then its answer. */
const midTurn = (request: Seen): Reply =>
  request.afterTool
    ? words("MID-TURN-DONE")
    : tool("Bash", {
        command: "sleep 10; echo mid-turn-step-done",
        description: "The turn's step",
      });

/** Case 2: ten seconds of words, then the queued message's answer. */
const longTurn = (request: Seen): Reply =>
  request.last.includes("QUEUED-NEXT")
    ? words("QUEUED-ANSWERED")
    : { everyMs: 1000, words: Array.from({ length: 10 }, () => "… ") };

/** Case 3: a command started in the background, the turn ended, its completion answered. */
const background = (request: Seen): Reply => {
  if (COMPLETION.test(request.last)) {
    return words("BG-NOTICED");
  }
  return request.afterTool
    ? words("BG-STARTED, waiting for it")
    : tool("Bash", {
        command: "sleep 25; echo bg-finished",
        description: "A background command",
        run_in_background: true,
      });
};

/** Case 4: CronCreate (loaded through ToolSearch when deferred), the turn ended, the wake-up answered. */
const wakeUp = (request: Seen): Reply => {
  if (request.last.includes("WAKEUP-FIRED")) {
    return words("WAKEUP-NOTICED");
  }
  if (cronStep === "scheduled") {
    cronAnswered = true;
    return words("WAKEUP-SCHEDULED, waiting for it");
  }
  if (cronStep === "start" && !request.toolNames.includes("CronCreate")) {
    cronStep = "searched";
    return tool("ToolSearch", { query: "select:CronCreate", max_results: 1 });
  }
  cronStep = "scheduled";
  return tool("CronCreate", {
    cron: cronAt(2),
    prompt: "WAKEUP-FIRED: carry on",
    recurring: false,
  });
};

const CASES: [string, (request: Seen) => Reply][] = [
  ["MID-MARK", midTurn],
  ["LONG-MARK", longTurn],
  ["BG-MARK", background],
  ["CRON-MARK", wakeUp],
];

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const after = AFTER_MOVE.exec(request.last);
  if (after) {
    return words(`${after[0]}-ANSWERED`);
  }
  const answer = CASES.find(([mark]) => request.all.includes(mark))?.[1];
  return answer ? answer(request) : words("ok");
};

/** A signed-in fake login for account `id` in `home`, with its own token and identity, one organization with A's. */
export const furnishAccount = async (home: string, id: string) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[id],
        refreshToken: `${TOKEN[id]}-refresh`,
        expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
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
        emailAddress: "probe-b@scratch-fleet.test",
        organizationName: "Scratch Fleet",
        accountUuid: "00000000-0000-4000-8000-00000000000b",
        organizationUuid: "00000000-0000-4000-8000-000000000002",
      },
    })
  );
};

interface Moved {
  accountId: string;
  state: "moved" | "pending";
  why: string;
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await furnishAccount(fleet.home, B);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
    B,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "account B signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        B
      )[0],
    (row) => row?.state === "signed-in"
  );

  const accountOf = (id: string) =>
    fleet.query<{ account_id: string | null }>(
      "SELECT account_id FROM instances WHERE id = ?",
      id
    )[0]?.account_id ?? null;
  /** A session spawned for one case: its id, the account it runs on and the one it is moved to. */
  const start = async (title: string) => {
    const id = await fleet.spawn("claude", title);
    const from: string = await until(
      `${title}: placed on an account`,
      () => accountOf(id) ?? "",
      (one) => one === ACCOUNT || one === B
    );
    return { id, from, to: from === ACCOUNT ? B : ACCOUNT };
  };
  const seenWhere = (
    test: (one: Seen) => boolean,
    label: string,
    ms?: number
  ) => until(label, () => fleet.seen.find(test), Boolean, ms);
  const move = (id: string, to: string) =>
    fleet.api<Moved>(`/api/instances/${id}/account`, { accountId: to });
  /** The row lands on `to`, and a send after it runs on `to`'s token. */
  const landsAndRuns = async (
    name: string,
    id: string,
    to: string,
    marker: string
  ) => {
    const landed = await until(
      `${name}: lands on the other account`,
      () => accountOf(id) ?? undefined,
      (one) => one === to,
      180_000
    ).catch(() => accountOf(id));
    kit.check(
      `${name}: its row lands on the other account`,
      landed === to,
      `account ${landed}`
    );
    await fleet.send(id, `${marker} hello`);
    const after = await seenWhere(
      (one) => one.last.includes(marker),
      `${name}: the send after the move reaches the model`
    ).catch(() => undefined);
    kit.check(
      `${name}: a send after the move runs on the account it moved to`,
      !!after?.auth.endsWith(TOKEN[to] ?? "?"),
      after ? `auth ${after.auth.slice(0, 48)}` : "no request seen"
    );
  };

  // 1. Mid-turn: a tool call running when the move is asked.
  {
    const name = "mid-turn";
    const s = await start("Mid-turn move");
    await fleet.send(s.id, "MID-MARK run the step");
    await seenWhere(
      (one) => one.all.includes("MID-MARK") && !one.afterTool,
      `${name}: its turn's tool call`
    );
    await Bun.sleep(2000);
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: the move waits for the turn's end`,
      asked.state === "pending",
      asked.why
    );
    const done = await seenWhere(
      (one) => one.all.includes("MID-MARK") && one.afterTool,
      `${name}: its turn's step finishes`
    ).catch(() => undefined);
    kit.check(
      `${name}: the turn finishes its task (the step's result reaches the model)`,
      !!done,
      done
        ? `on ${done.auth.endsWith(TOKEN[s.from] ?? "?") ? "the old account" : "another account"}`
        : undefined
    );
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-1");
  }

  // 2. A message queued behind a running turn.
  {
    const name = "queued message";
    const s = await start("Queued message move");
    await fleet.send(s.id, "LONG-MARK a long answer");
    await seenWhere(
      (one) => one.all.includes("LONG-MARK"),
      `${name}: its long turn`
    );
    await Bun.sleep(1000);
    const queued = await fleet.send(s.id, "QUEUED-NEXT the queued message");
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: the move waits for the turn's end`,
      asked.state === "pending",
      asked.why
    );
    const answered = await seenWhere(
      (one) => one.last.includes("QUEUED-NEXT"),
      `${name}: the queued message is answered`
    ).catch(() => undefined);
    kit.check(`${name}: the queued message is answered`, !!answered);
    const row = await until(
      `${name}: the queued send read`,
      () => fleet.sendRow(queued),
      (one) => one?.state === "read",
      60_000
    ).catch(() => fleet.sendRow(queued));
    kit.check(
      `${name}: the queued send is read, never failed`,
      row?.state === "read",
      `state ${row?.state} ${row?.reason ?? ""}`
    );
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-2");
  }

  // 3. At rest, waiting on a background command.
  {
    const name = "background command";
    const s = await start("Background move");
    await fleet.send(s.id, "BG-MARK start it and wait");
    await seenWhere(
      (one) => one.all.includes("BG-MARK") && one.afterTool,
      `${name}: the command started in the background`
    );
    // The turn ends on the words that follow the tool's result.
    await Bun.sleep(4000);
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: the move waits for the background command`,
      asked.state === "pending" && BACKGROUND.test(asked.why),
      asked.why
    );
    const woke = await seenWhere(
      (one) => one.all.includes("BG-MARK") && COMPLETION.test(one.last),
      `${name}: the command's completion wakes the session`,
      90_000
    ).catch(() => undefined);
    kit.check(`${name}: the command's completion wakes the session`, !!woke);
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-3");
  }

  // 4. At rest, with a one-time wake-up scheduled.
  {
    const name = "scheduled wake-up";
    const s = await start("Wake-up move");
    await fleet.send(s.id, "CRON-MARK schedule a wake-up and wait");
    await until(
      `${name}: CronCreate's result answered, the turn ending`,
      () => cronAnswered,
      Boolean
    );
    await Bun.sleep(4000);
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: the move waits for the wake-up`,
      asked.state === "pending" && WAKE_UP.test(asked.why),
      asked.why
    );
    const fired = await seenWhere(
      (one) => one.last.includes("WAKEUP-FIRED"),
      `${name}: the wake-up fires`,
      240_000
    ).catch(() => undefined);
    kit.check(`${name}: the scheduled wake-up fires and is answered`, !!fired);
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-4");
  }
};

export default { name: "account-move", run } satisfies Spec;
