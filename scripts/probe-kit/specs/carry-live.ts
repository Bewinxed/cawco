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
 * 4. At its limit, busy: a session on A at rest with a background command
 *    that runs on (a watcher) hits A's limit. The at-limit controller's
 *    move waits for the command at most `MOVE_LATER_WAIT_MS`, then ends it
 *    with the process: the row lands on B within that bound (plus a look's
 *    slack), the session is told on B what the move ended (the command's
 *    description and the last of its output), and a send after runs on B.
 * 5. A person's session in a folder a project lead's place holds (a
 *    `-caw` workspace record naming the session's folder, as Caw's boundary
 *    writes it) runs on the host, before and after a move: its shell's
 *    pid namespace and /proc/1 are the spec runner's own, never a boundary's.
 *    Its git changes (a continuation's read) run on the host, no boundary
 *    stood up for the place; and a person's OpenCode session in that folder
 *    (one OpenCode location for every session there) runs its `shell` on
 *    the host too.
 * 6. At its limit, two accounts free: B in A's organization and C in
 *    another, C ordered ahead of B. The at-limit controller carries the
 *    session to B, whose prompt cache it shares, and it carries on on B's
 *    token. C joins only for this case, after 2–4, which want B alone free.
 *
 *   bun scripts/probe-kit/run.ts carry-live
 *   CARRY_CASE=4 bun scripts/probe-kit/run.ts carry-live
 */
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MOVE_LATER_WAIT_MS } from "../../../packages/core/src/accounts";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { WORKSPACE_POLICY_NAME } from "../../../packages/core/src/paths";
import { LEAD_PLACE_SUFFIX } from "../../../packages/core/src/workspace-policy";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const B = "acct-scratch-fleet-b";
/** Case 6's account in another organization, placed ahead of B. */
const C = "acct-scratch-fleet-c";
/** The organization A and B share (scratch-fleet's own login's). */
const ORGANIZATION = "Scratch Fleet";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
  [C]: "sk-ant-oat01-fake-scratch-fleet-c",
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
/** Case 4's watcher, as the session is told of it on B. */
const WATCHER = "A watcher that runs on";
/** What the session reads on B about the work its move ended (hub `endedByMoveWords`): the watcher and the last of its output. */
const ENDED_NOTICE =
  /You were moved to another account[\s\S]*A watcher that runs on[\s\S]*watcher-tick/;
/** Case 5's shell: its pid namespace, then its pid 1's command line. */
const SHELL_PROBE =
  "readlink /proc/self/ns/pid; tr '\\0' ' ' < /proc/1/cmdline; echo";
/** A tool's result as a request carries it (chat completions' `tool` message, Anthropic's `tool_result`), for a failed check to show. */
const TOOL_RESULT = /"role":"tool".{0,600}|"tool_result".{0,600}/;
/** What a workspace boundary's pid 1 names in its command line (agent boundary.ts). */
const BOUNDARY_MARK = "cawco-boundary";
/** The shell probe's answer as the request after it carries it, for a failed check to show. */
const SHELL_ANSWER = /pid:\[\d+\][^"]{0,120}/;
/** Where case 4's watcher has got to: called, then its result answered and the turn at rest. */
let watcher: "none" | "called" | "started" = "none";
/** Case 5's shell probe was called, and its result is next. */
let shellAsked = false;

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
  return watcherReply(request) ?? shellReply(request) ?? words("ok");
};

/** Case 4: the watcher started once, its turn ending at rest; the notice of its end answered on B. */
const watcherReply = (request: Seen): Reply | undefined => {
  if (ENDED_NOTICE.test(request.all)) {
    return words("ENDED-NOTICED");
  }
  if (!request.all.includes("WATCH-MARK") || watcher === "started") {
    return undefined;
  }
  if (watcher === "none") {
    watcher = "called";
    return tool("Bash", {
      command: "for n in $(seq 1 900); do echo watcher-tick $n; sleep 1; done",
      description: WATCHER,
      run_in_background: true,
    });
  }
  if (!request.afterTool) {
    return undefined;
  }
  watcher = "started";
  return words("WATCH-STARTED, waiting for it");
};

/** Case 5: each SHELL-MARK send runs the shell probe once, and its result is answered. */
const shellReply = (request: Seen): Reply | undefined => {
  if (request.last.includes("SHELL-MARK") && !request.afterTool) {
    shellAsked = true;
    // Claude Code's shell is `Bash`; OpenCode 2.0's is `shell`.
    const name = request.toolNames.includes("shell") ? "shell" : "Bash";
    return tool(name, { command: SHELL_PROBE, description: "Read pid 1" });
  }
  if (!(shellAsked && request.afterTool)) {
    return undefined;
  }
  shellAsked = false;
  return words("SHELL-READ");
};

/** A signed-in fake login for account `id` in `home`, with its own token, in `organization`. */
const furnishAccount = async (
  home: string,
  id: string,
  organization = ORGANIZATION
) => {
  const tag = id.slice(-1);
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
        emailAddress: `probe-${tag}@scratch-fleet.test`,
        organizationName: organization,
        accountUuid: `00000000-0000-4000-8000-00000000000${tag}`,
        organizationUuid:
          organization === ORGANIZATION
            ? "00000000-0000-4000-8000-000000000002"
            : "00000000-0000-4000-8000-000000000003",
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
      (one) => one === ACCOUNT || one === B || one === C
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

  // Cases 2 and 3 leave A read at its limit for hours: they run last, after
  // 4 and 5, which need A free when they start.
  const limitCases = async () => {
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
        (one) =>
          one.all.includes("LIMIT-MARK") && accountOfAuth(one.auth) === B,
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
        asked.answer.state === "pending" &&
          AS_IT_CONNECTS.test(asked.answer.why),
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
          one.all.includes("QUEUED-WHILE-HELD") &&
          accountOfAuth(one.auth) === B,
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

  // 4. At its limit with a background command that runs on.
  if (runs("4")) {
    const name = "at its limit, busy";
    const s = await start("Busy limit move", ACCOUNT);
    await fleet.send(s.id, "WATCH-MARK start the watcher and wait");
    await until(
      `${name}: the watcher started and the turn at rest`,
      () => watcher,
      (one) => one === "started",
      120_000
    );
    await Bun.sleep(5000);
    limited.set(ACCOUNT, Date.now() + 4 * 60 * 60_000);
    const refusedAt = Date.now();
    await fleet.send(s.id, "WATCH-LIMIT go on");
    const landed = await until(
      `${name}: the move lands on B past its wait`,
      () => accountOf(s.id) ?? undefined,
      (one) => one === B,
      MOVE_LATER_WAIT_MS + 120_000
    ).catch(() => accountOf(s.id));
    const tookMs = Date.now() - refusedAt;
    kit.check(
      `${name}: it moves to B within the wait (${MOVE_LATER_WAIT_MS / 1000} s) and a look's slack, in ${Math.round(tookMs / 1000)} s`,
      landed === B && tookMs <= MOVE_LATER_WAIT_MS + 60_000,
      `account ${landed}`
    );
    if (landed !== B) {
      console.log((await linesAbout(s.id)).slice(-60).join("\n"));
    }
    const told = await seenWhere(
      (one) => ENDED_NOTICE.test(one.all) && accountOfAuth(one.auth) === B,
      `${name}: the session is told on B what the move ended`,
      120_000
    ).catch(() => undefined);
    kit.check(
      `${name}: the session is told on B what the move ended (the watcher and the last of its output)`,
      !!told
    );
    const carryLine = (await fleet.logs("agent"))
      .split("\n")
      .find((line) => line.includes(s.id) && line.includes("waited its bound"));
    kit.check(
      `${name}: the agent says the move ended the watcher with the process`,
      !!carryLine,
      carryLine
    );
    await landsAndRuns(name, s.id, B, "AFTER-MOVE-4");
    // A resets now: the hub forgets the limit it read off A's refusal, as
    // at A's reset, so the cases after this one start with A free.
    limited.delete(ACCOUNT);
    fleet.write("DELETE FROM account_bench WHERE account_id = ?", ACCOUNT);
    fleet.write("DELETE FROM account_readings WHERE account_id = ?", ACCOUNT);
  }

  // 5. A person's session in a folder a lead's place holds runs on the host.
  if (runs("5")) {
    const name = "host, not a lead's place";
    const place = join(
      fleet.home,
      ".cawco",
      "workspaces",
      `0badcafe${LEAD_PLACE_SUFFIX}`
    );
    await mkdir(place, { recursive: true });
    await writeFile(
      join(place, "create.json"),
      JSON.stringify({ path: fleet.workdir })
    );
    // A place's policy, as its boundary writes it: OpenCode's plugin reads it
    // as a location the place holds boots.
    await writeFile(join(place, WORKSPACE_POLICY_NAME), "{}");
    // The runner's own view: the session's shell sees the same, with no
    // boundary's pid namespace between them.
    const hostNs = readlinkSync("/proc/self/ns/pid");
    const hostInit = readFileSync("/proc/1/cmdline", "utf8")
      .replaceAll("\0", " ")
      .trim();
    /** The shell's answer to SHELL-MARK in the request after its tool call. */
    const shellSees = async (id: string, step: string, marker: string) => {
      const before = fleet.seen.length;
      await fleet.send(id, `SHELL-MARK ${marker}`);
      const read = await seenWhere(
        (one) =>
          fleet.seen.indexOf(one) >= before &&
          one.afterTool &&
          one.body.includes("pid:["),
        `${name}: the shell's answer ${step}`,
        120_000
      ).catch(() => undefined);
      if (!read) {
        for (const one of fleet.seen.slice(before)) {
          console.log(
            `  seen: tools ${one.toolNames.slice(0, 12).join(",")} afterTool ${one.afterTool} last ${JSON.stringify(one.last.slice(0, 120))} tool result ${JSON.stringify(TOOL_RESULT.exec(one.body)?.[0] ?? "none")}`
          );
        }
      }
      const body = read?.body ?? "";
      const sameNs = body.includes(hostNs);
      const sameInit = body.includes(JSON.stringify(hostInit).slice(1, -1));
      // A runner inside a workspace sees that workspace's boundary as its
      // own pid 1; the shell sees no other.
      const noBoundary =
        hostInit.includes(BOUNDARY_MARK) || !body.includes(BOUNDARY_MARK);
      const host = sameNs && sameInit && noBoundary;
      kit.check(
        `${name}: ${step}, its shell is in the runner's pid namespace and sees its pid 1`,
        host,
        read
          ? `same pid namespace ${sameNs}, same pid 1 ${sameInit}, no boundary of its own ${noBoundary}; runner ${hostNs} "${hostInit.slice(0, 60)}"; the shell's answer ${SHELL_ANSWER.exec(body)?.[0] ?? "not found"}`
          : "no answer seen"
      );
      return host;
    };
    const s = await start("Person in a lead's folder");
    await shellSees(s.id, "as it starts", "first");
    const asked = await move(s.id, s.to);
    kit.check(
      `${name}: a person's move at rest goes at once`,
      asked.answer.state === "moved",
      asked.answer.why
    );
    await until(
      `${name}: lands`,
      () => accountOf(s.id),
      (one) => one === s.to,
      120_000
    );
    await shellSees(s.id, "after its move", "after");

    // Its git changes (a continuation's read, CONTROL_GIT_CHANGES) run on the
    // host: no boundary is stood up for the place, which would write its
    // boundary.json first.
    await Bun.$`git init -q && git -c user.email=probe@scratch.test -c user.name=probe commit -q --allow-empty -m first && echo changed > changed.txt`
      .cwd(fleet.workdir)
      .quiet();
    const read = await fleet
      .api<{ entries: number }>(`/api/instances/${s.id}/continue`)
      .then(
        () => "answered",
        (error: unknown) => String(error)
      );
    const boundaryStarted = existsSync(join(place, "boundary.json"));
    kit.check(
      `${name}: its git changes are read on the host, with no boundary for the lead's place`,
      read === "answered" && !boundaryStarted,
      `continuation read ${read}; the place's boundary.json ${boundaryStarted ? "written" : "absent"}`
    );

    // An OpenCode session of a person's in the same folder: one OpenCode
    // location serves every session there, and the plugin bounds only the
    // lead's own sessions by his place.
    const oc = await fleet.spawn(
      "opencode",
      "Person's OpenCode in a lead's folder"
    );
    if (!(await shellSees(oc, "on OpenCode", "opencode"))) {
      console.log(
        (await fleet.logs("agent"))
          .split("\n")
          .filter((line) => line.includes("[opencode]") || line.includes(oc))
          .slice(-40)
          .join("\n")
      );
    }
    await rm(place, { recursive: true, force: true });
  }

  await limitCases();

  // 6. At its limit with B (A's organization) and C (another) free, C first
  // in order: the move stays in A's organization.
  if (runs("6")) {
    const name = "at its limit, two free";
    await furnishAccount(fleet.home, C, "Other Organization");
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe C', 'red', 1, 0, ?)",
      C,
      Date.now()
    );
    fleet.write('UPDATE accounts SET "order" = 2 WHERE id = ?', B);
    // The agent reads its accounts' logins as it starts.
    await fleet.stop("agent");
    fleet.launch("agent");
    await fleet.agentUp();
    const cIn = await until(
      "account C signed in",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          C
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    ).catch(() => undefined);
    kit.check(`${name}: C, in another organization, is signed in`, !!cIn);
    const s = await start("Organization move", ACCOUNT);
    limited.set(ACCOUNT, Date.now() + 4 * 60 * 60_000);
    await fleet.send(s.id, "ORG-MARK go on");
    const landed = await until(
      `${name}: the at-limit controller moves it`,
      () => accountOf(s.id) ?? undefined,
      (one) => one === B || one === C,
      180_000
    ).catch(() => accountOf(s.id));
    kit.check(
      `${name}: the at-limit controller carries it to B, in A's organization, not C`,
      landed === B,
      `account ${landed}`
    );
    if (landed !== B) {
      console.log((await linesAbout(s.id)).slice(-40).join("\n"));
    }
    const onB = await seenWhere(
      (one) => one.all.includes("ORG-MARK") && accountOfAuth(one.auth) === B,
      `${name}: it carries on on B`,
      120_000
    ).catch(() => undefined);
    kit.check(`${name}: it carries on on B's token`, !!onB);
    limited.delete(ACCOUNT);
  }
};

export default { name: "carry-live", run } satisfies Spec;
