/**
 * A live session's move between accounts completes, or fails in bounded time
 * with its reason; never "not answering". On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model) with two fake
 * accounts of one provider, A and B, each with its own token, so every model
 * request says which account it ran on (`Seen.auth`):
 *
 * 1. Large and waiting: a session whose transcript is several MB, at rest
 *    waiting on a background command, is moved by hand. The move waits for
 *    the command; its completion wakes the session; the row lands on the
 *    other account and a send after runs there. A second, at rest with the
 *    same large transcript, moves at once: the hub answers within the
 *    machine's carry bounds, and the agent's carry log names its steps.
 * 2. At its limit: a session on A whose turn A's limit refuses is carried
 *    to B by the at-limit controller, and carries on there on B's token.
 * 3. Held while its machine is away: A and B both at their limits, a
 *    session on A is held; a message to it is queued for the limit; its
 *    machine's agent stops, a person moves it to B ("as soon as the machine
 *    is connected again"), B's limit resets, the agent starts again. The
 *    move lands with no new message, and the queued message is answered on
 *    B's token.
 *
 *   bun scripts/probe-kit/run.ts carry-live
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const B = "acct-scratch-fleet-b";
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

/** The accounts the mock refuses at their limit now, with when each resets. */
const limited = new Map<string, number>();
/** Which account a request ran on, by its token. */
const accountOfAuth = (auth: string): string | undefined =>
  Object.entries(TOKEN)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, token]) => auth.endsWith(token))?.[0];

/** One answer of ~5 MB, in 20 KB words: a transcript past any small copy. */
const BIG = Array.from(
  { length: 250 },
  (_, at) => `${at} ${"x".repeat(20_000)}\n`
);

const COMPLETION = /task-notification|bg-finished/i;
const AFTER_MOVE = /AFTER-MOVE-\d/;
/** The agent's carry lines a session's carry must leave: its stop and its end, timed. */
const STOPPED_LINE = /ended between turns in \d+ ms/;
const CARRIED_LINE = /carried, \d+ entr/;
/** The hub's and agent's lines about moves, for a failed case to show. */
const MOVE_LINE = /\[at-limit\]|\[accounts\]|\[carry\]/;
/** A move pending on its machine says it goes as that machine connects again. */
const AS_IT_CONNECTS = /connected again/;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  // The session that puts B at its limit is refused with B's own reset,
  // whichever token its process still carries.
  const on = request.all.includes("B-LIMIT-MARK")
    ? B
    : accountOfAuth(request.auth);
  const resets = on ? limited.get(on) : undefined;
  if (resets !== undefined && resets > Date.now()) {
    return { everyMs: 5, words: [], refuse: { resetsAt: resets } };
  }
  const after = AFTER_MOVE.exec(request.last);
  if (after) {
    return words(`${after[0]}-ANSWERED`);
  }
  if (request.all.includes("QUEUED-WHILE-HELD")) {
    return words("QUEUED-ANSWERED");
  }
  if (request.all.includes("BG-MARK")) {
    if (COMPLETION.test(request.last)) {
      return words("BG-NOTICED");
    }
    // The command first, then the long answer after its result: one turn,
    // ending at rest with the command still running.
    if (request.afterTool) {
      return { everyMs: 1, words: [...BIG, "BG-STARTED, waiting for it"] };
    }
    return tool("Bash", {
      command: "sleep 25; echo bg-finished",
      description: "A background command",
      run_in_background: true,
    });
  }
  if (request.all.includes("BIG-MARK")) {
    return { everyMs: 1, words: [...BIG, "BIG-DONE"] };
  }
  return words("ok");
};

/** A signed-in fake login for account `id` in `home`, with its own token. */
const furnishAccount = async (home: string, id: string) => {
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
  /** A session spawned on `on`: moved there first when it was placed elsewhere. */
  const start = async (title: string, on?: string) => {
    const id = await fleet.spawn("claude", title);
    const from: string = await until(
      `${title}: placed on an account`,
      () => accountOf(id) ?? "",
      (one) => one === ACCOUNT || one === B
    );
    if (on && from !== on) {
      await fleet.api<Moved>(`/api/instances/${id}/account`, { accountId: on });
      await until(
        `${title}: on ${on}`,
        () => accountOf(id),
        (one) => one === on
      );
    }
    const at = on ?? from;
    return { id, from: at, to: at === ACCOUNT ? B : ACCOUNT };
  };
  const seenWhere = (
    test: (one: Seen) => boolean,
    label: string,
    ms?: number
  ) => until(label, () => fleet.seen.find(test), Boolean, ms);
  /** A person's move, timed: the hub's answer and how long it took. */
  const move = async (id: string, to: string) => {
    const at = Date.now();
    const answer = await fleet.api<Moved>(`/api/instances/${id}/account`, {
      accountId: to,
    });
    return { answer, ms: Date.now() - at };
  };
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
      !!after && accountOfAuth(after.auth) === to,
      after ? `ran on ${accountOfAuth(after.auth)}` : "no request seen"
    );
  };

  /** `CARRY_CASE=3` runs that case alone, to read its logs again. */
  const runs = (one: string) =>
    !process.env.CARRY_CASE || process.env.CARRY_CASE === one;
  /** The hub's and agent's lines about `id`, for a failed case to show. */
  const linesAbout = async (id: string) =>
    [
      ...(await fleet.logs("hub")).split("\n"),
      ...(await fleet.logs("agent")).split("\n"),
    ].filter((line) => line.includes(id) || MOVE_LINE.test(line));

  // 1. Large and waiting on a background command, then large and at rest.
  if (runs("1")) {
    const name = "large, waiting";
    const s = await start("Large waiting move");
    await fleet.send(s.id, "BG-MARK write it all, then start the command");
    await seenWhere(
      (one) => one.all.includes("BG-MARK") && one.afterTool,
      `${name}: the command started in the background`,
      180_000
    );
    await Bun.sleep(4000);
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: the move waits for the background command, answered in ${asked.ms} ms`,
      asked.answer.state === "pending" && asked.ms < 30_000,
      asked.answer.why
    );
    const woke = await seenWhere(
      (one) => one.all.includes("BG-MARK") && COMPLETION.test(one.last),
      `${name}: the command's completion wakes the session`,
      90_000
    ).catch(() => undefined);
    kit.check(`${name}: the command's completion wakes the session`, !!woke);
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-1");
  }
  if (runs("1")) {
    const name = "large, at rest";
    const s = await start("Large rest move");
    await fleet.send(s.id, "BIG-MARK write it all");
    await seenWhere(
      (one) => one.all.includes("BIG-MARK"),
      `${name}: its long answer`,
      60_000
    );
    await Bun.sleep(15_000);
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: moved at once, answered in ${asked.ms} ms`,
      asked.answer.state === "moved" && asked.ms < 30_000,
      asked.answer.why
    );
    await landsAndRuns(name, s.id, s.to, "AFTER-MOVE-2");
    const carryLines = (await fleet.logs("agent"))
      .split("\n")
      .filter((line) => line.includes("[carry]") && line.includes(s.id));
    kit.check(
      `${name}: the agent logs the carry's steps and its end with their times`,
      carryLines.some((line) => STOPPED_LINE.test(line)) &&
        carryLines.some((line) => CARRIED_LINE.test(line)),
      carryLines.slice(-3).join(" | ")
    );
  }

  // 2. At its limit: the at-limit controller carries it to B.
  if (runs("2")) {
    const name = "at its limit";
    const s = await start("Limit move", ACCOUNT);
    limited.set(ACCOUNT, Date.now() + 4 * 60 * 60_000);
    await fleet.send(s.id, "LIMIT-MARK go on");
    const landed = await until(
      `${name}: the at-limit controller moves it to B`,
      () => accountOf(s.id) ?? undefined,
      (one) => one === B,
      180_000
    ).catch(() => accountOf(s.id));
    kit.check(
      `${name}: the at-limit controller carries it to B`,
      landed === B,
      `account ${landed}`
    );
    const onB = await seenWhere(
      (one) => one.all.includes("LIMIT-MARK") && accountOfAuth(one.auth) === B,
      `${name}: it carries on on B`,
      120_000
    ).catch(() => undefined);
    kit.check(`${name}: it carries on on B's token`, !!onB);
    limited.delete(ACCOUNT);
  }

  // 3. Held while its machine is away: the move lands at reconnect.
  if (runs("3")) {
    const name = "held while away";
    const s = await start("Held away move", ACCOUNT);
    const t = await start("B at its limit", B);
    const bResets = Date.now() + 150_000;
    limited.set(B, bResets);
    limited.set(ACCOUNT, Date.now() + 4 * 60 * 60_000);
    // B's own refusal is what tells the hub B is at its limit.
    await fleet.send(t.id, "B-LIMIT-MARK");
    await Bun.sleep(8000);
    await fleet.send(s.id, "HELD-MARK go on");
    const held = await until(
      `${name}: held at A's limit`,
      () =>
        fleet.query<{ instance_id: string }>(
          "SELECT instance_id FROM limit_holds WHERE instance_id = ?",
          s.id
        )[0],
      Boolean,
      120_000
    ).catch(() => undefined);
    kit.check(`${name}: held at its limit, no account free`, !!held);
    const queued = await fleet.send(s.id, "QUEUED-WHILE-HELD answer this");
    await Bun.sleep(2000);
    kit.check(
      `${name}: the message waits for the limit`,
      fleet.sendRow(queued)?.state === "pending",
      `state ${fleet.sendRow(queued)?.state}`
    );
    await fleet.stop("agent");
    const asked = await move(s.id, B);
    kit.check(
      `${name}: the move waits for the machine, and says it goes as it connects`,
      asked.answer.state === "pending" && AS_IT_CONNECTS.test(asked.answer.why),
      asked.answer.why
    );
    limited.delete(B);
    await Bun.sleep(Math.max(0, bResets - Date.now() + 2000));
    fleet.launch("agent");
    await fleet.agentUp();
    const landed = await until(
      `${name}: lands on B with no new message`,
      () => accountOf(s.id) ?? undefined,
      (one) => one === B,
      180_000
    ).catch(() => accountOf(s.id));
    kit.check(
      `${name}: the move lands on B with no new message`,
      landed === B,
      `account ${landed}`
    );
    if (landed !== B) {
      console.log((await linesAbout(s.id)).slice(-60).join("\n"));
    }
    const answered = await seenWhere(
      (one) =>
        one.all.includes("QUEUED-WHILE-HELD") && accountOfAuth(one.auth) === B,
      `${name}: the queued message is answered on B`,
      180_000
    ).catch(() => undefined);
    const queuedRow = await until(
      `${name}: the queued message read`,
      () => fleet.sendRow(queued),
      (one) => one?.state === "read",
      60_000
    ).catch(() => fleet.sendRow(queued));
    kit.check(
      `${name}: the queued message is read and answered on B's token`,
      !!answered && queuedRow?.state === "read",
      `send ${queuedRow?.state} ${queuedRow?.reason ?? ""}; requests with it: ${fleet.seen
        .filter((one) => one.all.includes("QUEUED-WHILE-HELD"))
        .map((one) => accountOfAuth(one.auth))
        .join(",")}`
    );
    if (!answered) {
      console.log((await linesAbout(s.id)).slice(-40).join("\n"));
    }
    const hubLines = (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => line.includes("connected again"));
    kit.check(
      `${name}: the reconnect logs the move it retries, with why`,
      hubLines.length > 0,
      hubLines.at(-1)
    );
  }
};

export default { name: "carry-live", run } satisfies Spec;
