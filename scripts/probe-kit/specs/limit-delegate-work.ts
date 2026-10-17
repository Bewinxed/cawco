/**
 * When a delegate's work reaches its account's limit (core `DelegateWork`,
 * the routing's `atLimit.delegateWork`): the hub's word to a live work
 * item's session ("Your work item is still open", core `WORK_ITEM_ORIGIN`)
 * refused at its limit is sent again once at the reset (`resume`), moved
 * whole as a person's turn is (`move`), or left until someone writes
 * (`leave`) (hub at-limit.ts `refusedNotice`, `resumeAtReset`,
 * `lookAtNudge`). On a scratch fleet (real hub, agent and sessiond; the real
 * Claude Code CLI against the mock model) with two fake accounts in two
 * organizations, A and B, each read with room, every model request saying
 * which account it ran on (`Seen.auth`). Routing pins every session to A, so
 * B takes one only by a move. Run it where a workspace boundary can start
 * (not inside another one): an orchestrator in a project (Caw off, so only
 * this spec's sessions take turns; its repository has no origin remote, so
 * its workspaces are cut from the project's hub remote) delegates once per
 * leg.
 *
 * In each leg the delegate answers its brief without finishing, so the hub
 * tells it its item is still open; A is at its limit from that answer on,
 * for {@link LIMIT_MS}, and refuses that word.
 *
 * - resume: it is held on A with the word kept, its line saying it waits
 *   for A's reset; nothing moves it; at the reset the word goes again, on
 *   A, and the item runs to done.
 * - move: it moves whole to B and carries on there, to done.
 * - leave: nothing holds it, and nothing reaches it through the
 *   reset and {@link QUIET_AFTER_MS} after; its item is still running.
 *
 *   bun scripts/probe-kit/run.ts limit-delegate-work
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
/** How long A stays at its limit from the delegate's first answer. */
const LIMIT_MS = 45_000;
/** How long past A's reset the leave leg watches for anything reaching its delegate. */
const QUIET_AFTER_MS = 20_000;
const DELEGATE = "mcp__cawco__delegate";
const FINISH = "mcp__cawco__finish_item";
/** The quiet turn's word from the hub (work-items.ts `quietTurn`). */
const STILL_OPEN = "Your work item is still open";

const LEGS = ["resume", "move", "leave"] as const;
type Leg = (typeof LEGS)[number];

/** What each leg's delegate has done, as the mock saw it. */
interface Played {
  delegated: boolean;
  finished: boolean;
  /** A refuses the delegate until then, once it has answered its brief. */
  limitedUntil: number;
  /** When A refused it. */
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
let repo = "";
/** The project the repository is in, Caw off. */
let projectId = "";

/** What opens every word to the orchestrator: only its conversation holds it. */
const ASK = "PROBE-DELEGATE-";
/** Only the orchestrator's word to delegate `leg` carries this. */
const askOf = (leg: Leg) => `${ASK}${leg}`;
/** Only `leg`'s delegate's brief carries this. */
const briefOf = (leg: Leg) => `PROBE-CHILD-${leg}`;

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

/** `leg`'s delegate: answers its brief without finishing, is refused on A while A is limited, then finishes. */
const child = (request: Seen, leg: Leg): Reply => {
  const state = played[leg];
  if (onAccount(request, ACCOUNT) && state.limitedUntil > Date.now()) {
    state.refused.push(Date.now());
    return { everyMs: 5, words: [], refuse: { resetsAt: state.limitedUntil } };
  }
  if (!state.worked) {
    state.worked = true;
    state.limitedUntil = Date.now() + LIMIT_MS;
    return text("Working on it.");
  }
  if (state.finished) {
    return text("ok");
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
 * The orchestrator: delegates each leg its word asked for, once. Read from
 * every word it was given, not the last: `delegate` is found through
 * ToolSearch first, and the request after that answers ToolSearch.
 */
const orchestrator = (request: Seen): Reply => {
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
  const leg = LEGS.find((one) => request.all.includes(briefOf(one)));
  return leg ? child(request, leg) : text("ok");
};

/** Account B's Claude dir in `home`: signed in with its token, in another organization. */
const furnishB = async (home: string) => {
  const dir = join(home, ".cawco", "accounts", B, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[B],
        refreshToken: `${TOKEN[B]}-refresh`,
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
  return fleet;
};

/** Every session pinned to A, moving on at its limit, and `delegateWork` as the leg asks. */
const route = async (fleet: KitFleet, delegateWork: Leg): Promise<void> => {
  const pinned = { strategy: "pinned", pinnedAccountId: ACCOUNT };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: pinned,
      delegates: pinned,
      atLimit: {
        move: true,
        waitMinutes: 0,
        moveWholeUnderK: 200,
        delegateWork,
      },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
};

/** The probe's reads of the fleet for one delegate. */
const looks = (fleet: KitFleet) => ({
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
  heldWith: (instance: string) =>
    fleet.query<{ account_id: string; nudge: string | null }>(
      "SELECT account_id, nudge FROM limit_holds WHERE instance_id = ?",
      instance
    )[0],
  waitingWhy: (instance: string) =>
    fleet.query<{ why: string | null }>(
      "SELECT json_extract(move, '$.why') AS why FROM limit_events WHERE instance_id = ? AND json_extract(move, '$.kind') = 'waiting' ORDER BY at DESC LIMIT 1",
      instance
    )[0]?.why ?? null,
  /** What reached the model from `leg`'s delegate after `since`. */
  childSeen: (leg: Leg, since: number) =>
    fleet.seen.filter(
      (one) => one.at > since && one.tools && one.all.includes(briefOf(leg))
    ),
});
type Looks = ReturnType<typeof looks>;

/** One leg up to the refusal: routed, delegated, its brief answered, A's refusal of the hub's word. */
const delegated = async (
  kit: Kit,
  fleet: KitFleet,
  orch: string,
  leg: Leg
): Promise<string | undefined> => {
  await route(fleet, leg);
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
    `${leg}: A refuses the hub's word to its delegate`,
    () => played[leg].refused[0],
    Boolean,
    180_000
  ).catch(() => undefined);
  const word = fleet.seen.find(
    (one) =>
      one.all.includes(briefOf(leg)) &&
      one.last.includes(STILL_OPEN) &&
      onAccount(one, ACCOUNT)
  );
  kit.check(
    `${leg}: its delegate started on A, and A refused the hub's "still open" word at its limit`,
    !!instance && !!refused && !!word,
    `delegate ${instance ?? "none"}, refused ${refused ? "yes" : "no"}, word ${word ? "seen" : "not seen"}`
  );
  return instance && refused ? instance : undefined;
};

const resumeLeg = async (
  kit: Kit,
  look: Looks,
  instance: string
): Promise<void> => {
  const { limitedUntil, refused } = played.resume;
  const held = await until(
    "resume: held with its word",
    () => look.heldWith(instance),
    (row) => !!row?.nudge,
    30_000
  ).catch(() => look.heldWith(instance));
  kit.check(
    "resume: it is held on A with the hub's word kept",
    held?.account_id === ACCOUNT && !!held.nudge?.includes(STILL_OPEN),
    JSON.stringify(held ?? null)
  );
  kit.check(
    "resume: its line says it waits for A's reset (why: work)",
    look.waitingWhy(instance) === "work",
    `why ${look.waitingWhy(instance)}`
  );
  const again = await until(
    "resume: the word again after the reset",
    () =>
      look
        .childSeen("resume", limitedUntil)
        .find((one) => one.last.includes(STILL_OPEN)),
    Boolean,
    LIMIT_MS + 90_000
  ).catch(() => undefined);
  kit.check(
    "resume: nothing moved it before the reset",
    !look
      .childSeen("resume", refused[0] ?? 0)
      .some((one) => onAccount(one, B)) && look.accountOf(instance) === ACCOUNT,
    `account ${look.accountOf(instance)}`
  );
  kit.check(
    "resume: at the reset the hub's word goes again, once, on A",
    !!again &&
      onAccount(again, ACCOUNT) &&
      look
        .childSeen("resume", limitedUntil)
        .filter((one) => one.last.includes(STILL_OPEN) && !one.afterTool)
        .length === 1,
    again
      ? `sent ${again.at - limitedUntil} ms after the reset`
      : "never sent again"
  );
  const state = await until(
    "resume: its item done",
    () => look.itemState(instance) ?? undefined,
    (one) => one === "done",
    180_000
  ).catch(() => look.itemState(instance));
  kit.check(
    "resume: its item runs on, to done",
    state === "done",
    `state ${state}`
  );
};

const moveLeg = async (
  kit: Kit,
  look: Looks,
  instance: string
): Promise<void> => {
  const landed = await until(
    "move: it moves to B",
    () => look.accountOf(instance) ?? undefined,
    (one) => one === B,
    120_000
  ).catch(() => look.accountOf(instance));
  kit.check("move: it moves whole to B", landed === B, `account ${landed}`);
  const onB = await until(
    "move: it carries on on B",
    () =>
      look
        .childSeen("move", played.move.refused[0] ?? 0)
        .find((one) => onAccount(one, B)),
    Boolean,
    120_000
  ).catch(() => undefined);
  kit.check(
    "move: it carries on there, before A's reset",
    !!onB && onB.at < played.move.limitedUntil,
    onB
      ? `${played.move.limitedUntil - onB.at} ms before A's reset`
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

const leaveLeg = async (
  kit: Kit,
  look: Looks,
  instance: string
): Promise<void> => {
  const { limitedUntil, refused } = played.leave;
  const watchUntil = limitedUntil + QUIET_AFTER_MS;
  await Bun.sleep(Math.max(0, watchUntil - Date.now()));
  const after = look.childSeen("leave", refused.at(-1) ?? 0);
  // Not its account: rebalance may still carry an idle session off an
  // account at its limit between turns, which starts no turn; the setting
  // decides only what answers the refused word.
  kit.check(
    `leave: nothing holds it, and nothing reaches it through A's reset and ${QUIET_AFTER_MS / 1000} s after`,
    look.heldWith(instance) === undefined && after.length === 0,
    `held ${JSON.stringify(look.heldWith(instance) ?? null)}, account ${look.accountOf(instance)}, ${after.length} request(s) after`
  );
  kit.check(
    "leave: its item is still running",
    look.itemState(instance) === "running",
    `state ${look.itemState(instance)}`
  );
};

const LEG_RUN: Record<
  Leg,
  (kit: Kit, look: Looks, instance: string) => Promise<void>
> = {
  resume: resumeLeg,
  move: moveLeg,
  leave: leaveLeg,
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const look = looks(fleet);
  const orch = await fleet.spawn("claude", "Orchestrator", repo, {
    projectId,
  });
  for (const leg of LEGS) {
    // A free again before the next delegate is placed: pinned to A, it
    // would otherwise start on B.
    const previous = LEGS[LEGS.indexOf(leg) - 1];
    if (previous) {
      // biome-ignore lint/performance/noAwaitInLoops: each leg starts once A's limit from the last has reset
      await Bun.sleep(
        Math.max(0, played[previous].limitedUntil + 5000 - Date.now())
      );
    }
    const instance = await delegated(kit, fleet, orch, leg);
    if (instance) {
      await LEG_RUN[leg](kit, look, instance);
    }
  }
};

export default { name: "limit-delegate-work", run } satisfies Spec;
