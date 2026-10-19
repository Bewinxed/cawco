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
 *   and its first answer), and its item runs on to done.
 * - full: A and B are both limited until the same reset. Its tray chip and
 *   the orchestrator's `delegate_list` say it is stopped and continues at
 *   that reset; a person's message sent meanwhile reaches no model before
 *   it; past it, the delegate goes on by itself, the message arrives, and
 *   its item runs on to done.
 * - continued: only A is limited, and the policy waits for a reset this
 *   close, so it is held on A until its reset with a person's message
 *   queued for it. The orchestrator's `continue_session` moves its item to
 *   a new session (placed on B), then hands a message to the OLD session.
 *   The invariant (hub server.ts `retireContinued`): the old session never
 *   takes another turn, past A's reset and that handoff; its row names its
 *   continuation, it is stopped and no hold of its is left; the queued
 *   message and the handoff both reach the new session, and the handoff's
 *   answer names it.
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
import type { Kit, KitFleet, Spec } from "../kit";

const B = "acct-scratch-fleet-b";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
};
/** How long the limited accounts refuse a leg's delegate from its first answer. */
const LIMIT_MS: Record<Leg, number> = {
  move: 90_000,
  full: 75_000,
  continued: 150_000,
};
/** How long past A's reset the continued leg watches for its old session. */
const PAST_RESET_MS = 45_000;
/** A delegate moved off its limit runs on B within this of A's refusal. */
const MOVE_WITHIN_MS = 30_000;
const DELEGATE = "mcp__cawco__delegate";
const LIST = "mcp__cawco__delegate_list";
const FINISH = "mcp__cawco__finish_item";
const CONTINUE = "mcp__cawco__continue_session";
const HANDOFF = "mcp__cawco__handoff";

const LEGS = ["move", "full", "continued"] as const;
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
  full: [ACCOUNT, B],
  continued: [ACCOUNT],
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
  if (!state.worked) {
    state.worked = true;
    state.limitedUntil = Date.now() + LIMIT_MS[leg];
    return text(`Working on it. ${memoryOf(leg)}`);
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
  kit.check(
    `${leg}: its delegate started on A and answered its brief, then A refused it at its limit`,
    !!instance && !!refused,
    `delegate ${instance ?? "none"}, refused ${refused ? "yes" : "no"}`
  );
  return instance && refused ? instance : undefined;
};

const moveLeg = async (
  kit: Kit,
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
    120_000
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
  await fleet.send(old, `${HELD_NOTE}: and this`);
  const [queued] = fleet.query<{ owed: number; state: string }>(
    "SELECT owed IS NOT NULL AS owed, state FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
    old,
    `%${HELD_NOTE}%`
  );
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
  const [row] = fleet.query<Record<string, unknown>>(
    "SELECT * FROM instances WHERE id = ?",
    old
  );
  const holds = fleet.query<{ until: number | null }>(
    "SELECT until FROM limit_holds WHERE instance_id = ?",
    old
  );
  kit.check(
    "continued: the old session's row names its continuation, it is stopped, and no hold of its is left",
    row?.continued_into === target &&
      row?.status === "stopped" &&
      holds.length === 0,
    JSON.stringify({
      status: row?.status,
      continued_into: row?.continued_into ?? "(no such column)",
      work_item_id: row?.work_item_id,
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
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const orch = await fleet.spawn("claude", "Orchestrator", repo, {
    projectId,
  });
  const look = looks(fleet, orch);
  const moving = await delegated(kit, fleet, orch, "move");
  if (moving) {
    await moveLeg(kit, look, moving);
  }
  // A free again before the next delegate is placed: pinned to A, it would
  // otherwise start on B.
  await Bun.sleep(Math.max(0, played.move.limitedUntil + 5000 - Date.now()));
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
};

export default {
  name: "limit-stall",
  host: "it delegates once per leg, so its fleet cuts workspaces",
  run,
} satisfies Spec;
