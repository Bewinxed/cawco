/**
 * A delegate whose turn ends on its account's usage limit never sits as
 * running (hub at-limit.ts `turnRefused`, `stall`): it continues on an
 * account with room by the fleet's own placement, its conversation with it;
 * with none, it shows as stopped until the earliest reset and goes on then
 * by itself, and what was sent to it meanwhile arrives. On a scratch fleet
 * (real hub, agent and sessiond; the real Claude Code CLI against the mock
 * model) with two fake accounts in two organizations, A and B, each read
 * with room, every model request saying which account it ran on
 * (`Seen.auth`). Delegates are pinned to A, so B takes one only by a move.
 * B's room is measured, as a signed-in account's is from its own history:
 * its 5-hour window at 10%, priced at $2.56 a percent, so every move onto
 * it is admitted against that room (hub admission.ts), never only alone.
 * No delegate's cache is measured unless its leg says so: the mock reports
 * none, so only the policy's wait and the admission decide where it goes.
 * Run it where a workspace boundary can start (not inside another one): an
 * orchestrator in a project (Caw off, so only this spec's sessions take
 * turns) delegates once per leg.
 *
 * In each leg the delegate answers its brief without finishing, so the hub
 * tells it its item is still open; from that answer on its account refuses
 * it as at its usage limit (the mock's 429 with the unified limit headers).
 *
 * - move: only A is limited. Within {@link MOVE_WITHIN_MS} of A's refusal
 *   it runs on B, the request there carrying its earlier turns (its brief
 *   and its first answer), and its item runs on to done. Once its turn on
 *   B is recorded and it sleeps, B's admission ledger holds its charge no
 *   longer (the hub's `[admission]` line says it goes).
 * - warm: as move, but its brief's answer wrote a 1-hour cache, so its
 *   cache is measured to outlast A's reset 2 minutes on (hub at-limit.ts
 *   `decideAtLimit`): waiting costs nothing and a move would re-read it
 *   cold, so it waits on A though the policy waits for no reset and B has
 *   room. Its chip says it continues at A's reset and names no move; at
 *   that reset it carries on on A, never on B, and its item runs to done.
 * - full: A and B are both limited until the same reset. Its tray chip and
 *   the orchestrator's `delegate_list` say it is stopped and continues at
 *   that reset; a person's message sent meanwhile reaches no model before
 *   it; past it, the delegate goes on by itself, the message arrives, and
 *   its item runs on to done.
 * - continued: only A is limited, and the policy waits for a reset this
 *   close, so it is held on A until its reset with a person's message
 *   queued for it. The orchestrator's `continue_session` moves its item to
 *   a new session (placed on B), then hands a message to the OLD session.
 *   The rule (hub server.ts `foldContinued`): a continuation a session asks
 *   for stays one session. The old session never takes another turn, past
 *   A's reset and that handoff; its id is a former id of the new one, the
 *   board lists the new row alone and no hold of the old is left; the
 *   queued message, the handoff and a person's message to the old id all
 *   reach the new session, and the handoff's answer names it; the old id's
 *   transcript reads the old conversation, one `continued` line, then the
 *   new one; its page opens the live session.
 *
 * - reset: as carry below, but A resets 2 minutes on, before the move's
 *   restart bound (30 minutes): its chip says it moves to B when its work
 *   in flight ends, or continues at A's reset, never a bound past that
 *   reset (hub at-limit.ts `carryStall`). At the reset it carries on on A,
 *   its command still running (between turns, a session is idle: agent
 *   `busyNow`), and its chip says nothing more.
 *
 * - carry: A refuses it while its brief's command runs in the background,
 *   which no resume on another account brings back, so its move to B (with
 *   room) waits for that command (hub at-limit.ts `unmoved`, server.ts
 *   `waitForLater`). While it waits, its tray chip says it moves to B when
 *   its work in flight ends, by the restart bound at the latest, never A's
 *   reset 40 minutes off; once the command ends it moves and runs on B,
 *   and its chip says nothing more.
 *
 *   bun scripts/probe-kit/run.ts limit-stall
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkItemSummary } from "../../../packages/core/src";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const B = "acct-scratch-fleet-b";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
};
/** How long the limited accounts refuse a leg's delegate from its first answer. */
const LIMIT_MS: Record<Leg, number> = {
  move: 90_000,
  // Well inside its measured cache's hour: the reset comes first.
  warm: 120_000,
  full: 75_000,
  continued: 150_000,
  // Well inside the restart bound (30 minutes): the reset comes first.
  reset: 120_000,
  // Past the restart bound (30 minutes): a reset the move beats, which the
  // words must never name.
  carry: 40 * 60_000,
};
/** How long past A's reset the continued leg watches for its old session. */
const PAST_RESET_MS = 45_000;
/**
 * How long past A's reset a leg held for it watches for its request there:
 * counted from the reset, never from when the wait starts. A flat wait begun
 * 119.5 s before a 2-minute reset ended 0.5 s past it, while the turn the
 * reset resumed was still landing (r90i, warm leg).
 */
const PAST_RESET_WATCH_MS = 120_000;
/** A delegate moved off its limit runs on B within this of A's refusal. */
const MOVE_WITHIN_MS = 30_000;
const DELEGATE = "mcp__cawco__delegate";
const LIST = "mcp__cawco__delegate_list";
const FINISH = "mcp__cawco__finish_item";
const CONTINUE = "mcp__cawco__continue_session";
const HANDOFF = "mcp__cawco__handoff";

const LEGS = ["move", "warm", "full", "continued", "reset", "carry"] as const;
type Leg = (typeof LEGS)[number];

/** What each leg's delegate has done, as the mock saw it. */
interface Played {
  delegated: boolean;
  finished: boolean;
  /** Its limited accounts refuse it until then, once it has answered its brief. */
  limitedUntil: number;
  /** When an account refused it. */
  refused: number[];
  worked: boolean;
}
const played = Object.fromEntries(
  LEGS.map((leg) => [
    leg,
    {
      delegated: false,
      finished: false,
      limitedUntil: 0,
      refused: [],
      worked: false,
    },
  ])
) as unknown as Record<Leg, Played>;
/** Which accounts each leg's delegate is refused on while limited. */
const LIMITED: Record<Leg, string[]> = {
  move: [ACCOUNT],
  warm: [ACCOUNT],
  full: [ACCOUNT, B],
  continued: [ACCOUNT],
  reset: [ACCOUNT],
  carry: [ACCOUNT],
};
let repo = "";
let projectId = "";

/** What the orchestrator is asked to do with a tool, besides delegating. */
type Ask = "list" | "continue" | "handoff";
/** Each tool's answer to the orchestrator, once it has one. */
const answers: Partial<Record<Ask, string>> = {};
/** The tool the orchestrator called and has not had the answer of. */
let asking: Ask | undefined;

/** What opens every word to the orchestrator: only its conversation holds it. */
const ASK = "PROBE-DELEGATE-";
const askOf = (leg: Leg) => `${ASK}${leg}`;
/** The orchestrator's word to read its delegation tree. */
const LIST_ASK = `${ASK}list`;
/** The orchestrator's word to continue a session, its id after it. */
const CONTINUE_ASK = `${ASK}session-on`;
/** The orchestrator's word to hand the old session a message, its id after it. */
const HANDOFF_ASK = `${ASK}hand-old`;
/** The orchestrator's handoff to the old session, after the move. */
const HANDED = "PROBE-HANDED-after-move";
/** The person's message to the continued leg's delegate while it is held. */
const HELD_NOTE = "PROBE-NOTE-held-then-continued";
/** The person's message to the old session's id once it was continued. */
const TYPED_AFTER = "PROBE-NOTE-typed-after-move";
/** Only a continuation from the person's asks opens this way (continuation.ts `asksOpening`). */
const RESTARTING = "Restarting session ";
/** A session id as an ask carries it. */
const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Only `leg`'s delegate's brief carries this. */
const briefOf = (leg: Leg) => `PROBE-CHILD-${leg}`;
/** Only `leg`'s delegate's first answer carries this: a later request that has it has its earlier turns. */
const memoryOf = (leg: Leg) => `PROBE-MEMORY-${leg}`;
/** The person's message to the full leg's delegate while it is stopped. */
const NOTE = "PROBE-NOTE-while-stopped";
/**
 * How long each command leg's background command runs: the carry leg's move
 * waits for it; the reset leg's outlasts A's reset, so it carries on there
 * with the command still running.
 */
const COMMAND_S: Partial<Record<Leg, number>> = { carry: 150, reset: 300 };
/** What the carry leg's background command says as it ends. */
const COMMAND_DONE = "PROBE-CARRY-command-done";
/** The warm leg's brief answer's cache: written for an hour (the mock's `cache` is 1h). */
const WARM_CACHE = { read: 0, write: 30_000 };
const HOUR = 3_600_000;
/** B's 5-hour window as read, and the dollars a percent of it costs, from its seeded history. */
const B_USED_PCT = 10;
const B_USD_PER_PCT = 2.56;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

const onAccount = (request: Seen, id: string): boolean =>
  request.auth.endsWith(TOKEN[id] as string);
const accountOfRequest = (request: Seen): string | undefined =>
  [ACCOUNT, B].find((id) => onAccount(request, id));

/** The text of the tool result a request answers, as its body carries it. */
const toolResultText = (request: Seen): string => {
  const body = JSON.parse(request.body) as {
    messages?: { content: unknown }[];
  };
  const last = body.messages?.at(-1)?.content;
  if (!Array.isArray(last)) {
    return "";
  }
  return last
    .flatMap((block: { type?: string; content?: unknown }) => {
      if (block.type !== "tool_result") {
        return [];
      }
      if (typeof block.content === "string") {
        return [block.content];
      }
      return Array.isArray(block.content)
        ? block.content.map((part: { text?: string }) => part.text ?? "")
        : [];
    })
    .join("\n");
};

/**
 * `leg`'s delegate: answers its brief without finishing, is refused on its
 * limited accounts while they are limited, then finishes (the full leg's
 * only once the person's message has reached it).
 */
const child = (request: Seen, leg: Leg): Reply => {
  const state = played[leg];
  const account = accountOfRequest(request);
  if (
    account &&
    LIMITED[leg].includes(account) &&
    state.limitedUntil > Date.now()
  ) {
    state.refused.push(Date.now());
    return { everyMs: 5, words: [], refuse: { resetsAt: state.limitedUntil } };
  }
  // A command leg's brief starts a background command, which no resume on
  // another account brings back: a move off A waits for it.
  const seconds = COMMAND_S[leg];
  if (seconds !== undefined && !state.worked && !request.afterTool) {
    return useTool("Bash", {
      command: `sleep ${seconds} && echo ${COMMAND_DONE}`,
      description: "A long command in the background",
      run_in_background: true,
    });
  }
  if (!state.worked) {
    state.worked = true;
    state.limitedUntil = Date.now() + LIMIT_MS[leg];
    const answer = text(`Working on it. ${memoryOf(leg)}`);
    // The warm leg's answer writes its cache for an hour, as Claude Code's
    // requests on a subscription do: the hub measures its lifetime from it.
    return leg === "warm" ? { ...answer, cache: WARM_CACHE } : answer;
  }
  if (state.finished) {
    return text("ok");
  }
  // Held, then continued: it never finishes, so every turn it takes shows.
  if (leg === "continued") {
    return text("Still working.");
  }
  if (leg === "full" && !request.all.includes(NOTE)) {
    return text("Still working.");
  }
  const reply = found(request, FINISH, {
    headline: `${leg} carried on`,
    summary: `${leg} carried on after the limit`,
  });
  if (reply.tool?.name === FINISH) {
    state.finished = true;
  }
  return reply;
};

/**
 * The orchestrator: delegates each leg its word asked for, once, and reads
 * its delegation tree when asked. Read from every word it was given, not the
 * last: a deferred tool is found through ToolSearch first.
 */
const orchestrator = (request: Seen): Reply => {
  // The tool it called answered: the next request carries its result.
  if (asking && request.afterTool) {
    answers[asking] = toolResultText(request);
    asking = undefined;
    return text("ok");
  }
  const call = (ask: Ask, name: string, input: object): Reply => {
    const reply = found(request, name, input);
    if (reply.tool?.name === name) {
      asking = ask;
    }
    return reply;
  };
  const asked = (word: string): string | undefined =>
    new RegExp(`${word} (${ID})`).exec(request.all)?.[1];
  if (request.all.includes(LIST_ASK) && !("list" in answers) && !asking) {
    return call("list", LIST, {});
  }
  const source = asked(CONTINUE_ASK);
  if (source && !("continue" in answers) && !asking) {
    return call("continue", CONTINUE, {
      session: source,
      from: "asks",
      target_harness: "claude",
      target_model: "claude-haiku-4-5",
    });
  }
  const old = asked(HANDOFF_ASK);
  if (old && !("handoff" in answers) && !asking) {
    return call("handoff", HANDOFF, {
      target: old,
      message: `${HANDED}: one more thing for this work.`,
    });
  }
  const leg = LEGS.find(
    (one) => !played[one].delegated && request.all.includes(askOf(one))
  );
  if (!leg) {
    return text("ok");
  }
  const reply = found(request, DELEGATE, {
    title: `Limit ${leg}`,
    prompt: `${briefOf(leg)}: work on it, then finish your item.`,
    cwd: repo,
    lands: "none",
  });
  if (reply.tool?.name === DELEGATE) {
    played[leg].delegated = true;
  }
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The orchestrator's conversation alone holds the words that ask it to
  // delegate; a delegate's report it reads may quote that delegate's brief.
  if (request.all.includes(ASK)) {
    return orchestrator(request);
  }
  // The continued leg's new session: its opening is the old one's asks.
  if (request.all.includes(RESTARTING)) {
    return text("Carrying on.");
  }
  const leg = LEGS.find((one) => request.all.includes(briefOf(one)));
  return leg ? child(request, leg) : text("ok");
};

/** Account B's Claude dir in `home`: signed in with its token (no refresh token), in another organization. */
const furnishB = async (home: string) => {
  const dir = join(home, ".cawco", "accounts", B, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[B],
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
        organizationName: "Other Organization",
        accountUuid: "00000000-0000-4000-8000-00000000000b",
        organizationUuid: "00000000-0000-4000-8000-000000000003",
      },
    })
  );
};

/**
 * B's room measured as the hub measures a signed-in account's (forecast.ts
 * `usdPerPercent`): its 5-hour window read at {@link B_USED_PCT}%, and its
 * history moving 0% → 10% across $25.60 of its turns, so a percent of it
 * costs {@link B_USD_PER_PCT}. Each move onto B is then charged its re-read
 * and next-turn allowance, about 0.2% of the window, under the 50% ceiling
 * (admission.ts), where an unmeasured B would take one move at a time.
 */
const measureB = (fleet: KitFleet): void => {
  const now = Date.now();
  const resetsAt = new Date(now + 4 * HOUR).toISOString();
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, ?, 'normal', ?)",
    B,
    B_USED_PCT,
    resetsAt
  );
  for (const [percent, at] of [
    [0, now - 2 * HOUR],
    [B_USED_PCT, now - HOUR],
  ] as const) {
    fleet.write(
      "INSERT INTO usage_limit_history (account_id, kind, scope_label, percent, severity, resets_at, fetched_at) VALUES (?, 'session', NULL, ?, 'normal', ?, ?)",
      B,
      percent,
      resetsAt,
      at
    );
  }
  fleet.write(
    "INSERT INTO turn_usage (instance_id, result_id, model, account_id, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens, cost_usd, keep_alive, at) VALUES ('b-history', 'b-history', 'claude-probe', ?, 0, 0, 0, 0, 0, ?, 0, ?)",
    B,
    B_USED_PCT * B_USD_PER_PCT,
    now - 1.5 * HOUR
  );
};

/** The fleet stood up: A and B signed in and read with room, a repository to delegate in, in its project. */
const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  await furnishB(fleet.home);
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
  for (const id of [ACCOUNT, B]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  measureB(fleet);
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  ({ id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Limits",
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  }));
  // Every session pinned to A, moving at its limit with no wait for a
  // close reset: placement alone decides where it goes.
  await route(fleet, ACCOUNT, 0);
  return fleet;
};

/**
 * Every session placed on `pinned`; at a limit, one moves to an account with
 * room unless its own resets within `waitMinutes`, when it is held for it.
 */
const route = async (
  fleet: KitFleet,
  pinned: string,
  waitMinutes: number
): Promise<void> => {
  const placed = { strategy: "pinned", pinnedAccountId: pinned };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: placed,
      delegates: placed,
      atLimit: { move: true, waitMinutes, moveWholeUnderK: 200 },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
};

/** The probe's reads of the fleet. */
const looks = (fleet: KitFleet, orch: string) => ({
  accountOf: (instance: string) =>
    fleet.query<{ account_id: string | null }>(
      "SELECT account_id FROM instances WHERE id = ?",
      instance
    )[0]?.account_id ?? null,
  itemState: (instance: string) =>
    fleet.query<{ state: string }>(
      "SELECT state FROM work_items WHERE instance_id = ?",
      instance
    )[0]?.state ?? null,
  /** Its tray chip as the dashboard reads it. */
  chip: async (instance: string) =>
    (await fleet.api<WorkItemSummary[]>(`/api/work-items?parent=${orch}`)).find(
      (item) => item.instanceId === instance
    ),
  /** What reached the model from `leg`'s delegate after `since`. */
  childSeen: (leg: Leg, since: number) =>
    fleet.seen.filter(
      (one) => one.at > since && one.tools && one.all.includes(briefOf(leg))
    ),
});
type Looks = ReturnType<typeof looks>;

/** One leg up to its first refusal: delegated, its brief answered, its account's refusal. */
const delegated = async (
  kit: Kit,
  fleet: KitFleet,
  orch: string,
  leg: Leg
): Promise<string | undefined> => {
  await fleet.send(orch, `${askOf(leg)} delegate it`);
  const instance = await until(
    `${leg}: its delegate`,
    () =>
      fleet.query<{ instance_id: string }>(
        "SELECT instance_id FROM work_items WHERE parent_instance_id = ? AND title = ?",
        orch,
        `Limit ${leg}`
      )[0]?.instance_id,
    Boolean,
    180_000
  ).catch(() => undefined);
  const refused = await until(
    `${leg}: A refuses its delegate at its limit`,
    () => played[leg].refused[0],
    Boolean,
    180_000
  ).catch(() => undefined);
  // A start its machine held for room never reached a model to be refused.
  const room = instance
    ? fleet.query<{ content: string }>(
        "SELECT content FROM session_lines WHERE instance_id = ? AND kind = 'room'",
        instance
      )[0]?.content
    : undefined;
  kit.check(
    `${leg}: its delegate started on A and answered its brief, then A refused it at its limit`,
    !!instance && !!refused,
    `delegate ${instance ?? "none"}, ${played[leg].worked ? "answered its brief" : "never answered its brief"}, refused ${refused ? "yes" : "no"}${room ? `; its start was held: ${room}` : ""}`
  );
  return instance && refused ? instance : undefined;
};

const moveLeg = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  instance: string
): Promise<void> => {
  const refusedAt = played.move.refused[0] as number;
  const onB = await until(
    "move: it runs on B",
    () => look.childSeen("move", refusedAt).find((one) => onAccount(one, B)),
    Boolean,
    MOVE_WITHIN_MS + 60_000
  ).catch(() => undefined);
  kit.check(
    `move: it leaves A and runs on B within ${MOVE_WITHIN_MS / 1000} s of A's refusal`,
    !!onB && onB.at - refusedAt <= MOVE_WITHIN_MS,
    onB
      ? `first request on B ${onB.at - refusedAt} ms after A's refusal (A resets ${played.move.limitedUntil - onB.at} ms later); account ${look.accountOf(instance)}`
      : `nothing on B; account ${look.accountOf(instance)}, item ${look.itemState(instance)}`
  );
  kit.check(
    "move: its conversation came with it (B's request carries its brief and its first answer)",
    !!onB &&
      onB.all.includes(briefOf("move")) &&
      onB.body.includes(memoryOf("move")),
    onB
      ? `brief ${onB.all.includes(briefOf("move"))}, first answer ${onB.body.includes(memoryOf("move"))}`
      : "nothing on B"
  );
  const state = await until(
    "move: its item done",
    () => look.itemState(instance) ?? undefined,
    (one) => one === "done",
    180_000
  ).catch(() => look.itemState(instance));
  kit.check(
    "move: its item runs on, to done",
    state === "done",
    `state ${state}`
  );
  // Its turn on B is recorded, so its cost is in B's measured spend: the
  // charge its move took on B goes (hub admission.ts `prune`), and B takes
  // the next move against its room alone.
  const released = (log: string) =>
    log
      .split("\n")
      .find(
        (line) =>
          line.startsWith("[admission] ") &&
          line.includes(`(${instance.slice(0, 8)})`) &&
          line.includes("its charge on Probe B goes")
      );
  const status = () =>
    fleet.query<{ status: string }>(
      "SELECT status FROM instances WHERE id = ?",
      instance
    )[0]?.status ?? null;
  const settled = await until(
    "move: it sleeps on B and B no longer holds its charge",
    async () => ({ line: released(await fleet.logs("hub")), at: status() }),
    (one) => !!one.line && one.at === "sleeping",
    120_000
  ).catch(async () => ({
    line: released(await fleet.logs("hub")),
    at: status(),
  }));
  kit.check(
    "move: once it ran on B and slept there, B's admission ledger no longer holds its charge",
    !!settled.line,
    `${settled.line ? JSON.stringify(settled.line) : "no line releasing its charge on B"}; status ${settled.at}`
  );
};

/**
 * A delegate whose cache was measured written for an hour, A refusing it
 * with its reset 2 minutes on and B measured with room: the reset comes
 * before its cache lapses, so it waits on A (at-limit.ts `decideAtLimit`,
 * "soon") though the policy waits for no reset. Its chip says it continues
 * at that reset and names no move; past it, it carries on on A, never on B.
 */
const warmLeg = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  instance: string
): Promise<void> => {
  const reset = played.warm.limitedUntil;
  const refusedAt = played.warm.refused[0] as number;
  const chip = await until(
    "warm: its chip says it continues at A's reset",
    () => look.chip(instance),
    (one) => !!one?.stalled?.includes("continues at"),
    60_000
  ).catch(() => look.chip(instance));
  const [hold] = fleet.query<{ carry: string | null; until: number | null }>(
    "SELECT carry, until FROM limit_holds WHERE instance_id = ?",
    instance
  );
  const [cache] = fleet.query<{
    cache_ttl: string | null;
    last_request_at: number | null;
  }>("SELECT cache_ttl, last_request_at FROM instances WHERE id = ?", instance);
  const holdUntil = hold?.until ?? Number.NaN;
  const lapses =
    cache?.cache_ttl === "1h" && cache.last_request_at !== null
      ? cache.last_request_at + HOUR
      : Number.NaN;
  kit.check(
    "warm: its cache measured to outlast A's reset, it waits on A for that reset though B has room, and its chip says it continues then and names no move",
    lapses > reset &&
      Date.now() < reset &&
      Math.abs(holdUntil - reset) <= 2000 &&
      !hold?.carry &&
      !!chip?.stalled?.startsWith("Stopped at Probe’s limit") &&
      chip.stalled.includes(`continues at ${clockOf(reset)}`) &&
      !chip.stalled.includes("moves to"),
    `stalled ${JSON.stringify(chip?.stalled ?? null)}; hold ${JSON.stringify(hold ?? null)}; cache ${JSON.stringify(cache ?? null)}, lapses ${Number.isNaN(lapses) ? "unmeasured" : `${lapses - reset} ms after the reset`}; A resets at ${clockOf(reset)}, ${reset - Date.now()} ms on`
  );
  const onA = await until(
    "warm: it carries on on A past its reset",
    () =>
      look
        .childSeen("warm", reset)
        .find((one) => onAccount(one, ACCOUNT) && !one.afterTool),
    Boolean,
    Math.max(0, reset - Date.now()) + PAST_RESET_WATCH_MS
  ).catch(() => undefined);
  const onB = look
    .childSeen("warm", refusedAt)
    .filter((one) => onAccount(one, B));
  kit.check(
    "warm: at A's reset it carries on on A, never on B",
    !!onA && onB.length === 0,
    `${onA ? `first request on A ${onA.at - reset} ms after its reset` : "nothing on A after its reset"}; ${onB.length} request(s) on B; account ${look.accountOf(instance)}`
  );
  const state = await until(
    "warm: its item done",
    () => look.itemState(instance) ?? undefined,
    (one) => one === "done",
    180_000
  ).catch(() => look.itemState(instance));
  kit.check(
    "warm: its item runs on, to done",
    state === "done",
    `state ${state}`
  );
};

const fullLeg = async (
  kit: Kit,
  fleet: KitFleet,
  orch: string,
  look: Looks,
  instance: string
): Promise<void> => {
  const reset = played.full.limitedUntil;
  const chip = await until(
    "full: its chip says it is stopped",
    () => look.chip(instance),
    (one) => !!one?.stalled?.includes("continues at"),
    60_000
  ).catch(() => look.chip(instance));
  kit.check(
    "full: its tray chip says it is stopped at its limit and continues at the reset",
    !!chip?.stalled?.startsWith("Stopped at") &&
      chip.stalled.includes("continues at") &&
      Date.now() < reset,
    `stalled ${JSON.stringify(chip?.stalled ?? null)}, state ${chip?.state}, ${reset - Date.now()} ms before the reset`
  );
  await fleet.send(orch, `${LIST_ASK} read your delegates`);
  const tree = await until(
    "full: delegate_list read",
    () => answers.list,
    Boolean,
    60_000
  ).catch(() => undefined);
  const node = (
    tree
      ? (
          JSON.parse(tree) as {
            delegates: {
              instanceId: string;
              state: string;
              stalled?: { words: string; until?: string };
            }[];
          }
        ).delegates
      : []
  ).find((one) => one.instanceId === instance);
  const listedUntil = node?.stalled?.until
    ? Date.parse(node.stalled.until)
    : Number.NaN;
  kit.check(
    "full: delegate_list says stalled, in words, until the reset",
    node?.state === "stalled" &&
      !!node.stalled?.words.startsWith("Stopped at") &&
      Math.abs(listedUntil - reset) <= 2000,
    JSON.stringify(node ?? tree ?? null)
  );
  const noteAt = Date.now();
  await fleet.send(instance, `${NOTE}: one more thing`);
  const after = await until(
    "full: it goes on by itself past the reset",
    () => look.childSeen("full", reset).find((one) => !one.afterTool),
    Boolean,
    Math.max(0, reset - Date.now()) + PAST_RESET_WATCH_MS
  ).catch(() => undefined);
  const early = look
    .childSeen("full", noteAt)
    .filter((one) => one.at < reset && one.all.includes(NOTE));
  kit.check(
    "full: the message sent while stopped reached no model before the reset",
    noteAt < reset && early.length === 0,
    `sent ${reset - noteAt} ms before the reset; ${early.length} request(s) with it before`
  );
  kit.check(
    "full: past the reset it goes on by itself",
    !!after,
    after
      ? `first request ${after.at - reset} ms after the reset, on ${accountOfRequest(after)}`
      : "nothing after the reset"
  );
  const noted = await until(
    "full: the message arrives",
    () => look.childSeen("full", reset).find((one) => one.all.includes(NOTE)),
    Boolean,
    120_000
  ).catch(() => undefined);
  kit.check(
    "full: the message sent while it was stopped arrives after the reset",
    !!noted,
    noted ? `arrived ${noted.at - reset} ms after the reset` : "never arrived"
  );
  const state = await until(
    "full: its item done",
    () => look.itemState(instance) ?? undefined,
    (one) => one === "done",
    180_000
  ).catch(() => look.itemState(instance));
  kit.check(
    "full: its item runs on, to done",
    state === "done",
    `state ${state}`
  );
};

/** What reached the model from the continued leg's old session after `since`: its brief, never the new session's opening. */
const oldSeen = (fleet: KitFleet, since: number): Seen[] =>
  fleet.seen.filter(
    (one) =>
      one.at > since &&
      one.tools &&
      one.all.includes(briefOf("continued")) &&
      !one.all.includes(RESTARTING)
  );

/** What reached the model from the continued leg's new session. */
const newSeen = (fleet: KitFleet): Seen[] =>
  fleet.seen.filter(
    (one) => one.tools && one.all.includes(RESTARTING) && !one.all.includes(ASK)
  );

const continuedLeg = async (
  kit: Kit,
  fleet: KitFleet,
  orch: string,
  old: string
): Promise<void> => {
  const reset = played.continued.limitedUntil;
  const hold = await until(
    "continued: it is held on A until its reset",
    () =>
      fleet.query<{ until: number | null }>(
        "SELECT until FROM limit_holds WHERE instance_id = ?",
        old
      )[0],
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "continued: held on A at its limit, the reset close enough to wait for",
    !!hold && Date.now() < reset,
    `hold ${JSON.stringify(hold ?? null)}, ${reset - Date.now()} ms before the reset`
  );
  // The send goes on the dashboard's socket and returns as it leaves; the
  // hub's record of it is read once the hub has taken it.
  await fleet.send(old, `${HELD_NOTE}: and this`);
  const record = () =>
    fleet.query<{ owed: number; state: string }>(
      "SELECT owed IS NOT NULL AS owed, state FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
      old,
      `%${HELD_NOTE}%`
    )[0];
  const queued = await until(
    "continued: the hub took the person's message",
    record,
    Boolean,
    20_000
  ).catch(record);
  kit.check(
    "continued: the person's message to it is queued at the hub while it is held",
    queued?.state === "pending" && queued.owed === 1,
    JSON.stringify(queued ?? null)
  );
  // Its continuation is placed on B, which has room.
  await route(fleet, B, 0);
  await fleet.send(orch, `${CONTINUE_ASK} ${old}`);
  const continued = await until(
    "continued: continue_session answered",
    () => answers.continue,
    Boolean,
    240_000
  ).catch(() => undefined);
  const movedAt = Date.now();
  const target = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM work_items WHERE parent_instance_id = ? AND title = ?",
    orch,
    "Limit continued"
  )[0]?.instance_id;
  kit.check(
    "continued: continue_session moved its item to a new session before its reset",
    !!continued && !!target && target !== old && movedAt < reset,
    `answer ${JSON.stringify(continued?.slice(0, 300) ?? null)}; item's session ${target ?? "none"}; ${reset - movedAt} ms before the reset`
  );
  if (!(target && target !== old)) {
    return;
  }
  await fleet.send(orch, `${HANDOFF_ASK} ${old}`);
  const handed = await until(
    "continued: handoff answered",
    () => answers.handoff,
    Boolean,
    120_000
  ).catch(() => undefined);
  // The scratch account resets; the hub's look at the old hold would resume it now.
  await Bun.sleep(Math.max(0, reset + PAST_RESET_MS - Date.now()));
  const turns = oldSeen(fleet, movedAt);
  kit.check(
    `continued: the old session takes no turn after the move, through A's reset and ${PAST_RESET_MS / 1000} s past it, and a handoff to it`,
    turns.length === 0,
    turns.length === 0
      ? `no request from it since the move (${reset - movedAt} ms before the reset)`
      : turns
          .map(
            (one) =>
              `request ${one.at - reset} ms after A's reset on ${accountOfRequest(one)}: ${JSON.stringify(one.last.slice(0, 160))}`
          )
          .join(" | ")
  );
  const [row] = fleet.query<{ end_intent: string | null; status: string }>(
    "SELECT status, end_intent FROM instances WHERE id = ?",
    old
  );
  const holds = fleet.query<{ until: number | null }>(
    "SELECT until FROM limit_holds WHERE instance_id = ?",
    old
  );
  const alias = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM instance_aliases WHERE id = ?",
    old
  )[0]?.instance_id;
  const listed = (await fleet.api<{ id: string }[]>("/api/instances")).filter(
    (one) => one.id === old || one.id === target
  );
  kit.check(
    "continued: one session from the move: the old id is a former id of the new one, the board lists the new row alone, the old row is gone or ending, and no hold of its is left",
    alias === target &&
      listed.length === 1 &&
      listed[0]?.id === target &&
      (!row || row.end_intent === "delete") &&
      holds.length === 0,
    JSON.stringify({
      alias: alias ?? null,
      listed: listed.map((one) => one.id),
      row: row ?? null,
      holds,
    })
  );
  const seen = newSeen(fleet);
  const note = seen.find((one) => one.all.includes(HELD_NOTE));
  kit.check(
    "continued: the message queued for the old session reaches the new one",
    !!note && !turns.some((one) => one.all.includes(HELD_NOTE)),
    note
      ? `the new session read it ${note.at - movedAt} ms after the move`
      : `never reached the new session; old turns with it: ${turns.filter((one) => one.all.includes(HELD_NOTE)).length}`
  );
  const reached = seen.find((one) => one.all.includes(HANDED));
  kit.check(
    "continued: a handoff to the old session reaches the new one, and its answer names the new one",
    !!reached &&
      !!handed?.includes(target.slice(0, 8)) &&
      !turns.some((one) => one.all.includes(HANDED)),
    `answer ${JSON.stringify(handed ?? null)}; ${reached ? "the new session read it" : "the new session never read it"}`
  );
  await personAfter(kit, fleet, old, target);
};

/**
 * A person writing to the old session's id after the move: one session, so
 * it reaches the new one; its transcript reads the old conversation, the
 * `continued` line, then the new one; its page opens the live session, its
 * composer there.
 */
const personAfter = async (
  kit: Kit,
  fleet: KitFleet,
  old: string,
  target: string
): Promise<void> => {
  await fleet.send(old, `${TYPED_AFTER}: typed on its page`);
  const sends = () =>
    fleet.query<{ instance_id: string; reason: string | null; state: string }>(
      "SELECT instance_id, state, reason FROM sent_messages WHERE body LIKE ?",
      `%${TYPED_AFTER}%`
    );
  const typed = await until(
    "continued: the person's send to the old id read",
    sends,
    (rows) => rows.some((one) => one.state !== "pending"),
    60_000
  ).catch(sends);
  const read = newSeen(fleet).some((one) => one.all.includes(TYPED_AFTER));
  kit.check(
    "continued: a person's send to the old id reaches the new session",
    typed.length === 1 &&
      typed[0]?.instance_id === target &&
      typed[0]?.state === "read" &&
      read,
    `${JSON.stringify(typed)}; the new session read it: ${read}`
  );
  const page = await fleet.api<{
    blocks: {
      content: string;
      metadata?: { accountMove?: { kind: string }; continuation?: boolean };
      type: string;
    }[];
  }>(`/api/instances/${old}/transcript?limit=400`);
  const line = page.blocks.findIndex(
    (one) =>
      one.type === "system.account_move" &&
      one.metadata?.accountMove?.kind === "continued"
  );
  const lines = page.blocks.filter(
    (one) => one.metadata?.accountMove?.kind === "continued"
  ).length;
  const brief = page.blocks.findIndex((one) =>
    one.content.includes(briefOf("continued"))
  );
  kit.check(
    "continued: the old id's transcript reads the old conversation, one continued line, then the opening folded under it",
    brief >= 0 &&
      lines === 1 &&
      line > brief &&
      page.blocks[line + 1]?.metadata?.continuation === true,
    JSON.stringify({
      brief,
      line,
      lines,
      words: page.blocks[line]?.content ?? null,
    })
  );
  const base = await fleet.dashboard();
  const tab = await kit.page("desk");
  await open(tab, `${base}/session/${old}`, '[data-slot="pane"]');
  const look = () =>
    tab.evaluate(() => ({
      path: location.pathname,
      composers: document.querySelectorAll('[data-slot="composer"]').length,
      continuedIn: document.querySelectorAll('[data-slot="continued"]').length,
    }));
  const shown = await until(
    "continued: the old page opens the live session",
    look,
    (it) => it.path === `/session/${target}` && it.composers > 0,
    30_000
  ).catch(look);
  kit.check(
    "continued: the old session's URL opens the live session, its composer there",
    shown.path === `/session/${target}` &&
      shown.composers > 0 &&
      shown.continuedIn === 0,
    JSON.stringify(shown)
  );
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const orch = await fleet.spawn("claude", "Orchestrator", repo, {
    projectId,
  });
  const look = looks(fleet, orch);
  const moving = await delegated(kit, fleet, orch, "move");
  if (moving) {
    await moveLeg(kit, fleet, look, moving);
  }
  // A free again before the next delegate is placed: pinned to A, it would
  // otherwise start on B.
  await Bun.sleep(Math.max(0, played.move.limitedUntil + 5000 - Date.now()));
  const warm = await delegated(kit, fleet, orch, "warm");
  if (warm) {
    await warmLeg(kit, fleet, look, warm);
  }
  await Bun.sleep(Math.max(0, played.warm.limitedUntil + 5000 - Date.now()));
  const full = await delegated(kit, fleet, orch, "full");
  if (full) {
    await fullLeg(kit, fleet, orch, look, full);
  }
  // Placed on A again, and held at A's limit for its reset (10 minutes is
  // well past it) rather than moved to B, which has room.
  await Bun.sleep(Math.max(0, played.full.limitedUntil + 5000 - Date.now()));
  await route(fleet, ACCOUNT, 10);
  const held = await delegated(kit, fleet, orch, "continued");
  if (held) {
    await continuedLeg(kit, fleet, orch, held);
  }
  // Placed on A again, moving to B at A's limit: B has room.
  await route(fleet, ACCOUNT, 0);
  const resetting = await delegated(kit, fleet, orch, "reset");
  if (resetting) {
    await resetLeg(kit, fleet, look, resetting);
  }
  // A free again before the carry leg's delegate is placed on it.
  await Bun.sleep(Math.max(0, played.reset.limitedUntil + 5000 - Date.now()));
  const carrying = await delegated(kit, fleet, orch, "carry");
  if (carrying) {
    await carryLeg(kit, fleet, look, carrying);
  }
};

/** A moment as the hub's words say it (core accounts.ts `clockWords`). */
const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * A delegate refused at A's limit with a command running in the background,
 * A resetting before the move's bound: while it is held its chip says it
 * moves to B when that command ends, or continues at A's reset, the instant
 * its hold names; at that reset it carries on on A, the command still
 * running, never on B, and its chip says nothing more.
 */
const resetLeg = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  instance: string
): Promise<void> => {
  const reset = played.reset.limitedUntil;
  const refusedAt = played.reset.refused[0] as number;
  const waiting = await until(
    "reset: its chip says it moves once its work ends, or continues at A's reset",
    () => look.chip(instance),
    (one) => !!one?.stalled?.includes("or continues at"),
    120_000
  ).catch(() => look.chip(instance));
  const [hold] = fleet.query<{ carry: string | null; until: number | null }>(
    "SELECT carry, until FROM limit_holds WHERE instance_id = ?",
    instance
  );
  const holdUntil = hold?.until ?? Number.NaN;
  kit.check(
    "reset: while its move waits for its command and A resets first, its chip says it moves to B when that work ends, or continues at the reset its hold names, and names no bound past it",
    Date.now() < reset &&
      Math.abs(holdUntil - reset) <= 2000 &&
      !!waiting?.stalled?.startsWith("Stopped at") &&
      waiting.stalled.includes("moves to Probe B") &&
      waiting.stalled.includes("(1 command running)") &&
      waiting.stalled.includes(`or continues at ${clockOf(holdUntil)}`) &&
      !waiting.stalled.includes("at the latest"),
    `stalled ${JSON.stringify(waiting?.stalled ?? null)}; hold ${JSON.stringify(hold ?? null)}; A resets at ${clockOf(reset)}, ${reset - Date.now()} ms on`
  );
  const onA = await until(
    "reset: it carries on on A past its reset",
    () =>
      look
        .childSeen("reset", reset)
        .find((one) => onAccount(one, ACCOUNT) && !one.afterTool),
    Boolean,
    Math.max(0, reset - Date.now()) + PAST_RESET_WATCH_MS
  ).catch(() => undefined);
  const ended = fleet.seen.some(
    (one) =>
      one.all.includes(briefOf("reset")) &&
      one.all.includes(COMMAND_DONE) &&
      one.at <= (onA?.at ?? Number.POSITIVE_INFINITY)
  );
  const onB = look
    .childSeen("reset", refusedAt)
    .filter((one) => onAccount(one, B));
  const after = await until(
    "reset: its chip says nothing once it carries on",
    () => look.chip(instance),
    (one) => !one?.stalled,
    60_000
  ).catch(() => look.chip(instance));
  kit.check(
    "reset: at A's reset it carries on on A with its command still running, never on B, and its chip no longer says it is stopped",
    !!onA && !ended && onB.length === 0 && !after?.stalled,
    `${onA ? `first request on A ${onA.at - reset} ms after its reset` : "nothing on A after its reset"}; the command ended before it: ${ended}; ${onB.length} request(s) on B; chip ${JSON.stringify(after?.stalled ?? null)}, state ${after?.state}; account ${look.accountOf(instance)}`
  );
};

/**
 * A delegate refused at A's limit with a command running in the background:
 * its move to B waits for that command, as the hub's line says ("It moves to
 * B when that work ends, or in 30 minutes at the latest"). Its tray chip,
 * which `delegate_list` reads the same stall for (at-limit.ts `stall`), says
 * so while it waits, never A's reset the move beats; once the command ends
 * it moves, runs on B, and its chip says nothing more.
 */
const carryLeg = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  instance: string
): Promise<void> => {
  const reset = played.carry.limitedUntil;
  const resetClock = clockOf(reset);
  const waiting = await until(
    "carry: its chip says it moves once its work in flight ends",
    () => look.chip(instance),
    (one) => !!one?.stalled?.includes("when its work in flight ends"),
    120_000
  ).catch(() => look.chip(instance));
  const [hold] = fleet.query<{ carry: string | null; until: number | null }>(
    "SELECT carry, until FROM limit_holds WHERE instance_id = ?",
    instance
  );
  const ended = fleet.seen.some(
    (one) =>
      one.all.includes(briefOf("carry")) && one.all.includes(COMMAND_DONE)
  );
  kit.check(
    "carry: while its move waits for its command, its chip says it moves to B when that work ends, by the bound at the latest, and never names A's reset",
    !ended &&
      !!waiting?.stalled?.startsWith("Stopped at") &&
      waiting.stalled.includes("moves to Probe B") &&
      waiting.stalled.includes("(1 command running)") &&
      waiting.stalled.includes("at the latest") &&
      !waiting.stalled.includes("continues at") &&
      !waiting.stalled.includes(resetClock),
    `stalled ${JSON.stringify(waiting?.stalled ?? null)}; hold ${JSON.stringify(hold ?? null)}; A resets at ${resetClock}; the command ended already: ${ended}`
  );
  const refusedAt = played.carry.refused[0] as number;
  const onB = await until(
    "carry: it runs on B once its command ends",
    () => look.childSeen("carry", refusedAt).find((one) => onAccount(one, B)),
    Boolean,
    ((COMMAND_S.carry as number) + 240) * 1000
  ).catch(() => undefined);
  const after = await until(
    "carry: its chip says nothing once it moved",
    () => look.chip(instance),
    (one) => !one?.stalled,
    60_000
  ).catch(() => look.chip(instance));
  kit.check(
    "carry: once its command ends it moves to B and runs there, before A's reset, and its chip no longer says it is stopped",
    !!onB && onB.at < reset && !after?.stalled,
    `${onB ? `first request on B ${onB.at - refusedAt} ms after A's refusal` : "nothing on B"}; chip ${JSON.stringify(after?.stalled ?? null)}, state ${after?.state}; account ${look.accountOf(instance)}`
  );
};

export default {
  name: "limit-stall",
  host: "it delegates once per leg, so its fleet cuts workspaces",
  run,
} satisfies Spec;
