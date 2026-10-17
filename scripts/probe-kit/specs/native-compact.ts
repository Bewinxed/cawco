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
 *    moves it whole to B (the same conversation, the same row) and its first
 *    steps there are its filing turn (it files its spec with todo_write),
 *    then Claude Code's `/compact` with the hub's focus. A person's word sent
 *    while it compacts is held at the hub, then read after. The move line
 *    says "compacting", then "compacted". The turn after reads Claude Code's
 *    summary and the Open items the hook built from the session's records,
 *    word for word, and not the conversation.
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
/** The summary the mock writes for the hub's compaction. */
const SUMMARY = "SUMMARY-WRITTEN: the conversation so far, compacted.";
/** The spec the filing turn files: what the Open items must carry back. */
const SPEC =
  "OPEN-ITEM-SPEC: ship the move first, because the owner asked; read docs/plan.md";
const BIG = /BIG-(\d+)/;

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
  !request.last.trimStart().startsWith("/compact");

/** The mock's state across the run. */
const state = {
  /** A refuses at its limit until this moment. */
  limitedUntil: 0,
  /** Where the filing turn's tool calls have got to. */
  filing: "none" as "none" | "searched" | "filed" | "done",
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

/** The fleet stood up: both accounts signed in and read with room, the compact hook in every Claude settings layer. */
const standUp = async (kit: Kit): Promise<KitFleet> => {
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
  // Each account read with room, as a usage read with no window spent says it.
  for (const id of [ACCOUNT, B]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  return fleet;
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
  const onB = (one: Seen) =>
    one.at >= askedAt && one.auth.endsWith(TOKEN[B] as string) && one.tools;
  const firstOnB = await seenWhere(
    onB,
    `${name}: its first request on B`,
    120_000
  ).catch(() => undefined);
  kit.check(
    `${name}: its first step on B is its filing turn`,
    !!firstOnB?.last.includes(FILING),
    firstOnB?.last.slice(0, 160)
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

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
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
};

export default { name: "native-compact", run } satisfies Spec;
