/**
 * A conversation gets small only through Claude Code's own `/compact`, which
 * a person can interrupt like any turn; at its account's limit a session
 * moves whole to another account, files its open items, and is compacted
 * there natively. On a scratch fleet (real hub, agent and sessiond; the real
 * Claude Code CLI against the mock model) with two fake accounts in two
 * organizations, A and B, each with its own token, so every model request
 * says which account it ran on (`Seen.auth`), and each read with room. Both
 * accounts' Claude settings carry the fleet's SessionStart hook on the
 * `compact` source (`cawco tool open_items`). One session on A is given a
 * large conversation ({@link TURNS} turns of {@link REPLY_CHARS} characters
 * each, every request reporting its size as its context), then:
 *
 * 1. Stopped mid-compaction: a person's `/compact <focus>` starts Claude
 *    Code's summary request, which the mock answers slowly; the dashboard's
 *    interrupt (the agent's `ClaudeSession.interrupt`, the Agent SDK's
 *    `Query.interrupt`) ends that turn within {@link STOP_WITHIN_MS}, long
 *    before the summary would have finished; nothing is compacted; no
 *    summary request follows; the next send reads the whole conversation.
 * 2. Moved at its limit: A refuses the session's turn at its limit. The hub
 *    moves it whole to B (the same conversation, the same row). Its filing
 *    send bounces: the agent reaches the hub through the kit's relay
 *    (relay.ts), which holds the relaunch's spawn and passes the filing send
 *    behind it, so the agent finds no process for it and hands it back, owed
 *    to the session's next process; the spawn goes on once the hub has said
 *    so (as on obelisk at 11:57:34 on 2026-10-22, where the new process
 *    started 12 s after its filing send came back). With no interrupt, its
 *    first step on B is its carry-on, the turn that answers the message A
 *    refused (that message has no answer in Claude Code's transcript, so a
 *    filing prompt sent first was read with it as one turn); then its filing
 *    turn, apart from it (it files its spec with todo_write), then Claude
 *    Code's `/compact` with the hub's focus. A
 *    person's word sent while it compacts is held at the hub, then goes once
 *    the hub says what was sent meanwhile goes, and reaches B after the
 *    `/compact`. The move line says "compacting", then "compacted". The turn
 *    after reads Claude Code's summary and the Open items the hook built
 *    from the session's records, word for word, and not the conversation.
 * 3 and 4. A dropped relaunch: a further session, its policy compacting
 *    any context, a command of its running in the background, moves at its
 *    limit to B, and the relaunch's spawn never reaches its machine (the
 *    relay drops it), so the session has no process when what it is sent
 *    comes back owed. In 3 the hub restarts before it has a first turn on B;
 *    in 4 nothing restarts, and the hub starts it again for its step and
 *    says so. Either way, with no interrupt, it is told on B what the move
 *    ended, with its carry-on, then its filing turn and `/compact` run and
 *    the compaction ends.
 *
 * Sizes are each request's body as Claude Code sent it, in characters and in
 * tokens at four characters a token: the mock has no tokenizer, and the
 * comparison between requests is what decides. The mock models no cache: on
 * the real API the filing turn's first request is the one uncached read a
 * move to another organization pays, and the requests after it (its tool
 * rounds, the summary request) read what it wrote.
 *
 *   bun scripts/probe-kit/run.ts native-compact
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CLAUDE_DIR_NAME,
  CLAUDE_JSON_NAME,
} from "../../../packages/core/src/claude-dirs";
import { COMPACT_FOCUS } from "../../../packages/hub/src/open-items";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";
import { type Relay, relay } from "../relay";

const B = "acct-scratch-fleet-b";
/** Each account's token, as its requests carry it. */
const TOKEN: Record<string, string> = {
  [ACCOUNT]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-b",
};
/** Turns that build the large conversation. */
const TURNS = 8;
/** Characters of each of those turns' answers: 8 × 380k ≈ 3 MB, ≈ 760k tokens. */
const REPLY_CHARS = 380_000;
/** How soon after the interrupt the compacting turn has to have ended. */
const STOP_WITHIN_MS = 15_000;
/** How long the slow summary would take to finish, had nothing stopped it. */
const SLOW_SUMMARY_MS = 120_000;
/** The focus the stopped `/compact` carries: it marks its summary request. */
const FOCUS_STOPPED = "FOCUS-STOPPED keep the open asks";
/** What marks the summary request of the hub's own `/compact`: its focus. */
const HUB_FOCUS = COMPACT_FOCUS.slice(0, 40);
/** What marks the filing turn: the hub's filing prompt. */
const FILING = "file everything still open";
/** What opens the hub's carry-on past a limit (server.ts `CARRY_ON`). */
const CARRY_ON =
  "The usage limit that stopped your last turn no longer applies";
/** The summary the mock writes for the hub's compaction. */
const SUMMARY = "SUMMARY-WRITTEN: the conversation so far, compacted.";
/** The spec the filing turn files: what the Open items must carry back. */
const SPEC =
  "OPEN-ITEM-SPEC: ship the move first, because the owner asked; read docs/plan.md";
const BIG = /BIG-(\d+)/;
/** What opens legs 3 and 4's first turn, by its leg's tag. */
const DROPPED_ONE = /(RELAUNCH|RESTART)-ONE/;

/** An answer of these words. */
const words = (text: string): Reply => ({ everyMs: 5, words: [text] });
const toolCall = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** One turn's large answer: its marker, then filler, in 40 chunks. */
const bigAnswer = (n: string): Reply => {
  const filler = `ANSWER-${n} ${"lorem ipsum dolor sit amet ".repeat(REPLY_CHARS / 27)}`;
  const size = Math.ceil(filler.length / 40);
  return {
    everyMs: 5,
    words: Array.from({ length: 40 }, (_, i) =>
      filler.slice(i * size, (i + 1) * size)
    ),
  };
};

/**
 * Whether `request` is a `/compact` summary request whose focus starts
 * `focus`: its last user message, the summary instruction Claude Code
 * appends, names it. The `/compact` line itself never is that message.
 */
const summarising = (request: Seen, focus: string): boolean =>
  request.last.includes(focus) &&
  !request.last.trimStart().startsWith("/compact") &&
  // The turn after a compaction carries the /compact line's own output
  // (`<local-command-…>`, its focus in it) merged into its message.
  !request.last.includes("<local-command");

/** The mock's state across the run. */
const state = {
  /** A refuses at its limit until this moment. */
  limitedUntil: 0,
  /** Legs 3 and 4: the tags whose session has left its command running in the background. */
  commands: new Set<string>(),
  /** Where the filing turn's tool calls have got to. */
  filing: "none" as "none" | "searched" | "filed" | "done",
};

/**
 * The relaunch's filing send bounced (leg 2): armed with a session's id, the
 * relay holds the hub's next spawn of it and passes the send behind it.
 */
const bounce = {
  /** The session whose next spawn is held, while armed. */
  armedFor: undefined as string | undefined,
  /** The held spawn, sent on to the agent. */
  spawn: undefined as (() => void) | undefined,
  /** The send that went to the agent while its spawn was held: the move's first step. */
  filing: undefined as string | undefined,
  /** The held spawn is dropped, never sent on: its process never starts (leg 3). */
  drop: false as boolean,
};

/** What the hub says to the agent, through the relay: see {@link bounce}. */
const toAgent = (
  text: string,
  send: (more: string) => void
): string | undefined => {
  const id = bounce.armedFor;
  if (!id || text.length > 200_000 || !text.includes(id)) {
    return text;
  }
  let frame: {
    instanceId?: string;
    payload?: { instanceId?: string; message?: { uuid?: string } };
    verb?: string;
  };
  try {
    frame = JSON.parse(text);
  } catch {
    return text;
  }
  if ((frame.instanceId ?? frame.payload?.instanceId) !== id) {
    return text;
  }
  if (frame.verb === "spawn" && !bounce.spawn) {
    bounce.spawn = bounce.drop ? () => undefined : () => send(text);
    return undefined;
  }
  if (frame.verb === "send" && bounce.spawn && !bounce.filing) {
    bounce.filing = frame.payload?.message?.uuid;
    bounce.armedFor = undefined;
  }
  return text;
};

/** The todo_write tool as Claude Code names a CawCo MCP tool. */
const TODO_WRITE = "mcp__cawco__todo_write";

const answer = (request: Seen): Reply => {
  if (summarising(request, FOCUS_STOPPED.split(" ")[0] as string)) {
    // Slow: one word a second for two minutes.
    return {
      everyMs: 1000,
      words: Array.from({ length: SLOW_SUMMARY_MS / 1000 }, () => "slow "),
    };
  }
  if (summarising(request, HUB_FOCUS)) {
    // Five seconds, so a send meanwhile is seen held.
    return {
      everyMs: 500,
      words: [
        "<summary>",
        ...Array.from({ length: 9 }, () => " "),
        SUMMARY,
        "</summary>",
      ],
    };
  }
  if (!request.tools) {
    return words("Probe title");
  }
  if (
    state.limitedUntil > Date.now() &&
    request.auth.endsWith(TOKEN[ACCOUNT] as string)
  ) {
    return { everyMs: 5, words: [], refuse: { resetsAt: state.limitedUntil } };
  }
  if (state.filing !== "done" && request.all.includes(FILING)) {
    return filingAnswer(request);
  }
  // Legs 3 and 4: a first turn leaves a command running in the background,
  // which the move ends and tells the session of on B.
  const tag = DROPPED_ONE.exec(request.all)?.[1];
  if (tag && !state.commands.has(tag)) {
    // After the call, the last message is its result, not the ask.
    if (request.afterTool) {
      state.commands.add(tag);
      return words("ok");
    }
    return toolCall("Bash", {
      command: "sleep 600",
      description: "A long wait in the background",
      run_in_background: true,
    });
  }
  const big = BIG.exec(request.last);
  if (big?.[1]) {
    return bigAnswer(big[1]);
  }
  return words("ok");
};

/** The filing turn: todo_write loaded through ToolSearch, the spec filed with it, then its end. */
const filingAnswer = (request: Seen): Reply => {
  if (state.filing === "none" && !request.toolNames.includes(TODO_WRITE)) {
    state.filing = "searched";
    return toolCall("ToolSearch", {
      query: `select:${TODO_WRITE}`,
      max_results: 1,
    });
  }
  if (state.filing !== "filed") {
    state.filing = "filed";
    return toolCall(TODO_WRITE, { spec: SPEC });
  }
  state.filing = "done";
  return words("Filed.");
};

/**
 * Every answer reports its request's size as the context it read (prompt
 * cache tokens, as Claude Code adds them up), so the session's context reads
 * as large as it is.
 */
const respond = (request: Seen): Reply => {
  const reply = answer(request);
  return reply.refuse
    ? reply
    : {
        ...reply,
        cache: { read: Math.round(request.body.length / 4), write: 0 },
      };
};

/** A request's size: its body's characters, and tokens at four characters a token. */
const size = (request: Seen | undefined): string =>
  request
    ? `${request.body.length.toLocaleString("en")} chars ≈ ${Math.round(request.body.length / 4).toLocaleString("en")} tokens`
    : "none";

/**
 * The fleet's SessionStart hook on the `compact` source, run with this
 * checkout's CLI: a session CawCo did not start has no records, and is shown
 * nothing.
 */
const compactHook = {
  hooks: {
    SessionStart: [
      {
        matcher: "compact",
        hooks: [
          {
            type: "command",
            command: `[ -z "\${CAWCO_INSTANCE_ID:-}" ] || bun ${join(ROOT, "packages/cli/src/cli.ts")} tool open_items`,
          },
        ],
      },
    ],
  },
};

/** Account `id`'s Claude dir in `home`: signed in with its token, in `organization`, with the compact hook. */
const furnish = async (home: string, id: string, organization: string) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  if (id === B) {
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
          organizationName: organization,
          accountUuid: "00000000-0000-4000-8000-00000000000b",
          organizationUuid: "00000000-0000-4000-8000-000000000003",
        },
      })
    );
  }
  await writeFile(join(dir, "settings.json"), JSON.stringify(compactHook));
};

/**
 * The fleet stood up: both accounts signed in and read with room, the compact
 * hook in every Claude settings layer, its agent through the relay
 * ({@link toAgent}).
 */
const standUp = async (
  kit: Kit
): Promise<{ between: Relay; fleet: KitFleet }> => {
  const fleet = await kit.fleet(respond);
  await furnish(fleet.home, ACCOUNT, "Scratch Fleet");
  await furnish(fleet.home, B, "Other Organization");
  // The user layer too, where the fleet writes its hooks (agent fleet.ts).
  await mkdir(join(fleet.home, CLAUDE_DIR_NAME), { recursive: true });
  await writeFile(
    join(fleet.home, CLAUDE_DIR_NAME, "settings.json"),
    JSON.stringify(compactHook)
  );
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
  const between = relay(fleet.base, { toApp: toAgent });
  fleet.launch("agent", [], {
    CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
  });
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
  // Each account read with room, as a usage read with no window spent says it.
  for (const id of [ACCOUNT, B]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  return { between, fleet };
};

/** The probe's reads of the fleet: where a session runs, what the mock saw, what Claude Code wrote. */
const looks = (fleet: KitFleet) => {
  const sessionOf = (instance: string) =>
    fleet.query<{ session_id: string }>(
      "SELECT session_id FROM instances WHERE id = ?",
      instance
    )[0]?.session_id;
  const accountOf = (instance: string) =>
    fleet.query<{ account_id: string | null }>(
      "SELECT account_id FROM instances WHERE id = ?",
      instance
    )[0]?.account_id ?? null;
  const turnOpen = (instance: string) =>
    fleet.instance(instance)?.turn_open_at ?? null;
  const seenWhere = (
    test: (one: Seen) => boolean,
    label: string,
    ms?: number
  ) => until(label, () => fleet.seen.find(test), Boolean, ms);
  const turnEnds = (instance: string, label: string, ms = 120_000) =>
    until(label, () => turnOpen(instance) === null, Boolean, ms);
  /** Every record of the session's Claude conversation, across the accounts' dirs. */
  const records = async (
    instance: string
  ): Promise<Record<string, unknown>[]> => {
    const key = sessionOf(instance);
    if (!key) {
      return [];
    }
    const files = (
      await readdir(fleet.home, { recursive: true }).catch(() => [] as string[])
    ).filter((file) => file.endsWith(`${key}.jsonl`));
    const texts = await Promise.all(
      files.map((file) => readFile(join(fleet.home, file), "utf8"))
    );
    return texts.flatMap((text) =>
      text
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        })
    );
  };
  const compactions = async (instance: string) => {
    const all = await records(instance);
    return {
      boundaries: all.filter((one) => one.subtype === "compact_boundary")
        .length,
      summaries: all.filter((one) => one.isCompactSummary === true).length,
    };
  };
  /** The session's move line's compaction stage, as the hub stored it. */
  const compactStage = (instance: string) =>
    fleet.query<{ compact: string | null }>(
      "SELECT json_extract(move, '$.compact') AS compact FROM limit_events WHERE instance_id = ? AND json_extract(move, '$.kind') = 'moved' ORDER BY at DESC LIMIT 1",
      instance
    )[0]?.compact ?? null;
  return {
    accountOf,
    compactions,
    compactStage,
    seenWhere,
    sessionOf,
    turnEnds,
    turnOpen,
  };
};
type Looks = ReturnType<typeof looks>;

/** The session's large conversation, one turn at a time; the request after it, sized. */
const largeConversation = async (
  kit: Kit,
  fleet: KitFleet,
  { seenWhere, turnEnds }: Looks,
  id: string
): Promise<Seen> => {
  for (let n = 1; n <= TURNS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each turn after the last has ended
    await fleet.send(id, `BIG-${n} answer at length`);
    await seenWhere(
      (one) => one.last.includes(`BIG-${n}`),
      `turn ${n} reaches the model`
    );
    await turnEnds(id, `turn ${n} ends`);
  }
  await fleet.send(id, "SIZE-BEFORE how big is it now");
  const before = await seenWhere(
    (one) => one.last.includes("SIZE-BEFORE"),
    "the sizing turn reaches the model"
  );
  await turnEnds(id, "the sizing turn ends");
  kit.check(
    "the conversation is large: every big answer is in the next request",
    Array.from({ length: TURNS }, (_, i) => `ANSWER-${i + 1}`).every((mark) =>
      before.body.includes(mark)
    ),
    size(before)
  );
  return before;
};

/** 1. Stopped mid-compaction. Whether its summary request was seen, so the probe goes on. */
const stoppedCompaction = async (
  kit: Kit,
  fleet: KitFleet,
  { compactions, seenWhere, turnEnds, turnOpen }: Looks,
  id: string
): Promise<boolean> => {
  const name = "stopped compaction";
  await fleet.send(id, `/compact ${FOCUS_STOPPED}`);
  const summary = await seenWhere(
    (one) => summarising(one, "FOCUS-STOPPED"),
    `${name}: Claude Code's summary request reaches the model`,
    60_000
  ).catch(() => undefined);
  kit.check(
    `${name}: \`/compact <focus>\` starts Claude Code's summary request, its focus in it`,
    !!summary,
    summary ? size(summary) : "no summary request"
  );
  if (!summary) {
    return false;
  }
  kit.check(
    `${name}: the turn is open while the summary is written`,
    turnOpen(id) !== null
  );
  await Bun.sleep(3000);
  const asked = Date.now();
  await fleet.control(id, "interrupt");
  const ended = await turnEnds(id, `${name}: the turn ends`, SLOW_SUMMARY_MS)
    .then(() => Date.now() - asked)
    .catch(() => undefined);
  kit.check(
    `${name}: the interrupt ends the compacting turn within ${STOP_WITHIN_MS / 1000} s (the summary would take ${SLOW_SUMMARY_MS / 1000} s)`,
    ended !== undefined && ended < STOP_WITHIN_MS,
    ended === undefined ? "never ended" : `ended ${ended} ms after it`
  );
  const written = await compactions(id);
  kit.check(
    `${name}: nothing is compacted: no compact_boundary and no summary record`,
    written.boundaries === 0 && written.summaries === 0,
    JSON.stringify(written)
  );
  await Bun.sleep(5000);
  const again = fleet.seen.filter((one) =>
    summarising(one, "FOCUS-STOPPED")
  ).length;
  kit.check(
    `${name}: no summary request follows the interrupt`,
    again === 1,
    `${again} summary request(s)`
  );
  await fleet.send(id, "AFTER-STOP carry on");
  const after = await seenWhere(
    (one) => one.last.includes("AFTER-STOP"),
    `${name}: the send after it reaches the model`
  ).catch(() => undefined);
  await turnEnds(id, `${name}: the send after it ends`).catch(() => undefined);
  kit.check(
    `${name}: the next send reads the whole conversation as it stood, on A`,
    !!after &&
      after.body.includes("ANSWER-1") &&
      after.body.includes(`ANSWER-${TURNS}`) &&
      after.auth.endsWith(TOKEN[ACCOUNT] as string),
    after ? size(after) : "no request seen"
  );
  return true;
};

/**
 * Leg 2's filing send bounced: handed back by an agent with no process for
 * it, owed at the hub ({@link bounce}); then the held spawn goes on.
 */
const filingBounces = async (
  kit: Kit,
  fleet: KitFleet,
  id: string,
  hubLog: Awaited<ReturnType<KitFleet["logMark"]>>,
  name: string
) => {
  const filing = await until(
    `${name}: the filing send passes the held spawn`,
    () => bounce.filing,
    Boolean,
    60_000
  ).catch(() => undefined);
  const cameBack = `send ${filing} to ${id} came back: no process took it; owed to the session's next process`;
  const backed = await until(
    `${name}: the hub says the filing send came back`,
    async () => (await hubLog.since()).includes(cameBack),
    Boolean,
    60_000
  ).catch(() => false);
  const bounced = filing ? fleet.sendRow(filing) : undefined;
  kit.check(
    `${name}: its filing send comes back from a machine with no process for it, owed at the hub`,
    !!filing && backed && bounced?.state === "pending" && bounced.owed !== null,
    `send ${filing}: ${backed ? "came back" : "never came back"}, state ${bounced?.state} owed ${bounced?.owed ? "yes" : "no"}`
  );
  bounce.spawn?.();
};

/** 2. Moved at its limit: whole to B, its open items filed, compacted there. */
const movedAtLimit = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  id: string,
  before: Seen
) => {
  const { accountOf, compactions, compactStage, seenWhere, sessionOf } = look;
  const name = "moved at its limit";
  const sessionBefore = sessionOf(id);
  const hubLog = await fleet.logMark("hub");
  bounce.armedFor = id;
  state.limitedUntil = Date.now() + 4 * 60 * 60_000;
  const askedAt = Date.now();
  await fleet.send(id, "LIMIT-MARK carry on with the work");
  const landed = await until(
    `${name}: the at-limit controller moves it to B`,
    () => accountOf(id) ?? undefined,
    (one) => one === B,
    180_000
  ).catch(() => accountOf(id));
  kit.check(
    `${name}: it moves to B, in the other organization`,
    landed === B,
    `account ${landed}`
  );
  await filingBounces(kit, fleet, id, hubLog, name);
  const onB = (one: Seen) =>
    one.at >= askedAt && one.auth.endsWith(TOKEN[B] as string) && one.tools;
  const firstOnB = await seenWhere(
    onB,
    `${name}: its first request on B`,
    120_000
  ).catch(() => undefined);
  kit.check(
    `${name}: its first step on B is its carry-on, which answers the message A refused, and carries no filing prompt`,
    !!firstOnB?.all.includes("LIMIT-MARK") &&
      !!firstOnB.last.includes(CARRY_ON) &&
      !firstOnB.all.includes(FILING),
    firstOnB?.last.slice(0, 200)
  );
  const filingAsk = await seenWhere(
    (one) => onB(one) && one.last.includes(FILING),
    `${name}: its filing turn reaches the model`,
    120_000
  ).catch(() => undefined);
  kit.check(
    `${name}: then its filing turn, apart: its own message carries the filing prompt and not the refused message`,
    !!filingAsk &&
      !!firstOnB &&
      filingAsk.at > firstOnB.at &&
      !filingAsk.last.includes("LIMIT-MARK"),
    filingAsk?.last.slice(0, 200)
  );
  const summary = await seenWhere(
    (one) => one.at >= askedAt && summarising(one, HUB_FOCUS),
    `${name}: the hub's /compact reaches the model`,
    180_000
  ).catch(() => undefined);
  kit.check(
    `${name}: then Claude Code's /compact runs with the hub's focus, on B`,
    !!summary && summary.auth.endsWith(TOKEN[B] as string),
    summary ? size(summary) : "no summary request"
  );
  kit.check(
    `${name}: the filing turn filed the spec before the compaction`,
    state.filing === "done" &&
      fleet.seen.some(
        (one) =>
          one.at >= askedAt &&
          one.afterTool &&
          one.body.includes(TODO_WRITE) &&
          one.body.includes("OPEN-ITEM-SPEC")
      ),
    `filing ${state.filing}`
  );
  // A person writes to it while it compacts.
  const late = await fleet.send(id, "LATE-WORD from the person");
  await Bun.sleep(1000);
  const held = fleet.sendRow(late);
  kit.check(
    `${name}: a person's word while it compacts is held at the hub`,
    held?.state === "pending" && held.owed !== null,
    `state ${held?.state} owed ${held?.owed ? "yes" : "no"}`
  );
  const stage = await until(
    `${name}: the move line says compacted`,
    () => compactStage(id) ?? undefined,
    (one) => one === "compacted",
    120_000
  ).catch(() => compactStage(id));
  kit.check(
    `${name}: the move line says "moved, then compacted"`,
    stage === "compacted",
    `compact ${stage}`
  );
  const written = await compactions(id);
  kit.check(
    `${name}: Claude Code compacted it (compact_boundary and a summary record)`,
    written.boundaries > 0 && written.summaries > 0,
    JSON.stringify(written)
  );
  const afterCompact = await seenWhere(
    (one) =>
      summary !== undefined &&
      one.at > summary.at &&
      one.tools &&
      one.auth.endsWith(TOKEN[B] as string) &&
      !summarising(one, HUB_FOCUS),
    `${name}: the turn after the compaction`,
    120_000
  ).catch(() => undefined);
  await writeFile(
    join(kit.out, "after-compaction-request.txt"),
    afterCompact?.body ?? "none"
  );
  kit.check(
    `${name}: the turn after reads the summary and the Open items, word for word`,
    !!afterCompact &&
      afterCompact.body.includes("SUMMARY-WRITTEN") &&
      afterCompact.body.includes("Open items") &&
      afterCompact.body.includes("OPEN-ITEM-SPEC"),
    afterCompact ? size(afterCompact) : "no request seen"
  );
  kit.check(
    `${name}: the turn after does not read the conversation`,
    !!afterCompact && !afterCompact.body.includes("ANSWER-1 lorem"),
    `see ${kit.out}/after-compaction-request.txt`
  );
  const lateRead = await until(
    `${name}: the held word read`,
    () => fleet.sendRow(late),
    (one) => one?.state === "read",
    120_000
  ).catch(() => fleet.sendRow(late));
  kit.check(
    `${name}: the held word is read after the compaction`,
    lateRead?.state === "read",
    `state ${lateRead?.state}`
  );
  const said = await hubLog.since();
  const goes = said
    .split("\n")
    .filter((line) => line.includes("What was sent to it meanwhile goes now"));
  kit.check(
    `${name}: the hub ends the compaction with no interrupt, and what was sent meanwhile goes`,
    goes.length === 1 && !said.includes("was interrupted"),
    goes.join(" | ") || "no such line"
  );
  const lateOnB = fleet.seen.find(
    (one) =>
      one.last.includes("LATE-WORD") && one.auth.endsWith(TOKEN[B] as string)
  );
  kit.check(
    `${name}: the person's word reaches B after the /compact`,
    !!lateOnB && summary !== undefined && lateOnB.at > summary.at,
    lateOnB && summary
      ? `${lateOnB.at - summary.at} ms after the summary request`
      : "no such request"
  );
  const sessionAfter = sessionOf(id);
  kit.check(
    `${name}: the same conversation, moved whole`,
    sessionAfter === sessionBefore,
    `${sessionBefore} → ${sessionAfter}`
  );
  // The cost, as tokens read: what a whole move re-reads anyway, then the compaction.
  const filingRequests = fleet.seen.filter(
    (one) =>
      firstOnB !== undefined &&
      summary !== undefined &&
      one.at >= firstOnB.at &&
      one.at < summary.at &&
      one.tools
  );
  const ratio = summary ? summary.body.length / before.body.length : 0;
  kit.check(
    `${name}: the summary request reads the whole conversation once (within 10% of the turn before the move)`,
    ratio > 0.9 && ratio < 1.1,
    `${(ratio * 100).toFixed(1)}%`
  );
  kit.note(
    `cost: the turn before the move read ${size(before)}; the filing turn sent ${filingRequests.length} request(s): ${filingRequests.map(size).join("; ")}; the summary request read ${size(summary)}; the turn after the compaction read ${size(afterCompact)}`
  );
};

/** What the hub tells a session whose move ended its background work (server.ts `endedByMoveWords`). */
const ENDED = "You were moved to another account.";

/**
 * Legs 3 and 4: a session compacting any context, a command of its running
 * in the background, moved at its limit to B; the relaunch's spawn is
 * dropped, so it has no process when its first step comes back owed. With
 * `restart` (leg 3, tag RESTART), the hub restarts between the carry and its
 * first turn on B: it is still told what the move ended (kept across the
 * restart). Without (leg 4, tag RELAUNCH), nothing but the hub can start it:
 * the hub starts it again for its step and says so. Either way, with no
 * interrupt, it is told on B what ended, its carry-on runs and its
 * compaction ends.
 */
const droppedRelaunch = async (
  kit: Kit,
  fleet: KitFleet,
  look: Looks,
  restart: boolean
): Promise<void> => {
  const tag = restart ? "RESTART" : "RELAUNCH";
  const title = restart ? "Native compact restart" : "Native compact relaunch";
  const name = restart
    ? "a hub restart between the carry and its first turn"
    : "relaunched for its step";
  const placed = { strategy: "pinned", pinnedAccountId: ACCOUNT };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: placed,
      delegates: placed,
      atLimit: { move: true, waitMinutes: 0, moveWholeUnderK: 1 },
    }),
  });
  kit.check(
    `${name}: its policy compacts any context`,
    put.ok,
    `${put.status}`
  );
  state.limitedUntil = 0;
  const id = await fleet.spawn("claude", title, undefined, {
    account: ACCOUNT,
  });
  await fleet.send(id, `${tag}-ONE say ok`);
  await until(
    `${name}: its first turn leaves its command running`,
    () => state.commands.has(tag),
    Boolean,
    120_000
  );
  await look.turnEnds(id, `${name}: its first turn ends`);
  const hubLog = await fleet.logMark("hub");
  Object.assign(bounce, {
    armedFor: id,
    spawn: undefined,
    filing: undefined,
    drop: true,
  });
  state.limitedUntil = Date.now() + 4 * 60 * 60_000;
  const askedAt = Date.now();
  await fleet.send(id, `${tag}-MARK carry on with the work`);
  const landed = await until(
    `${name}: the at-limit controller moves it to B`,
    () => look.accountOf(id) ?? undefined,
    (one) => one === B,
    180_000
  ).catch(() => look.accountOf(id));
  const dropped = await until(
    `${name}: the relaunch's spawn is dropped and what it was sent bounces`,
    () => bounce.filing,
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    `${name}: it moves to B, and its relaunch never reaches its machine while what it was sent is handed back`,
    landed === B && !!dropped,
    `account ${landed}; first send ${dropped ?? "never sent"}`
  );
  if (restart) {
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
  }
  const ended = await until(
    `${name}: its compaction ends by itself`,
    async () =>
      (await hubLog.since())
        .split("\n")
        .find(
          (line) =>
            line.includes(title) &&
            line.includes("What was sent to it meanwhile goes now")
        ),
    Boolean,
    360_000
  ).catch(() => undefined);
  const said = (await hubLog.since())
    .split("\n")
    .filter((line) => line.includes(title));
  const relaunched = said.find((line) =>
    line.includes("process ended before it took its")
  );
  const onB = (one: Seen) =>
    one.at > askedAt &&
    one.all.includes(`${tag}-MARK`) &&
    one.auth.endsWith(TOKEN[B] as string);
  const carried = fleet.seen.find(
    (one) => onB(one) && one.last.includes(CARRY_ON)
  );
  const told = fleet.seen.find((one) => onB(one) && one.all.includes(ENDED));
  const filingAsk = fleet.seen.find(
    (one) => onB(one) && one.last.includes(FILING)
  );
  kit.check(
    restart
      ? `${name}: with no interrupt, it is told on B what the move ended (kept across the restart), with its carry-on, before its filing turn; its compaction ends`
      : `${name}: its process gone before its step, with no interrupt, the hub starts it again and says so; it is told on B what ended, with its carry-on, before its filing turn; its compaction ends`,
    (restart || !!relaunched) &&
      !!carried &&
      !!told &&
      told.at <= carried.at &&
      !!filingAsk &&
      filingAsk.at > carried.at &&
      !!ended &&
      !said.some((line) => line.includes("was interrupted")),
    `relaunched ${JSON.stringify(relaunched ?? null)}; told ${told ? `${told.at - askedAt} ms after the ask` : "never"}; carry-on ${carried ? `${carried.at - askedAt} ms after the ask` : "never"}; filing ${filingAsk ? `${filingAsk.at - askedAt} ms after the ask` : "never"}; ended ${JSON.stringify(ended ?? null)}`
  );
};

const run = async (kit: Kit) => {
  const { between, fleet } = await standUp(kit);
  try {
    const look = looks(fleet);
    const id = await fleet.spawn("claude", "Native compact probe");
    const from = await until(
      "placed on an account",
      () => look.accountOf(id) ?? "",
      (one) => one === ACCOUNT || one === B
    );
    if (!kit.check("the session starts on A", from === ACCOUNT, `on ${from}`)) {
      return;
    }
    const before = await largeConversation(kit, fleet, look, id);
    if (await stoppedCompaction(kit, fleet, look, id)) {
      await movedAtLimit(kit, fleet, look, id, before);
    }
    await droppedRelaunch(kit, fleet, look, true);
    await droppedRelaunch(kit, fleet, look, false);
  } finally {
    between.stop();
  }
};

export default { name: "native-compact", run } satisfies Spec;
