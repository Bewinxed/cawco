/**
 * A session files its open items once its context comes within its
 * compaction policy's `fileRoom` of the point where its own harness compacts
 * it, and every harness lists them after each of its compactions (hub
 * at-limit.ts `fileDue`, server.ts `fileAtThreshold` and
 * `observeCompaction`, open-items.ts, the agent's compaction-points.ts).
 *
 * First the rules, pure: `fileDue` below, at and past the room, a point its
 * harness did not say, no reading and a room of 0; each harness's own point
 * (Claude Code's on a 1M and a 200K window, pi's reserve, OpenCode's
 * buffer); and the filing turn's words around the proven body.
 *
 * Then on a scratch fleet (real hub, agent and sessiond; Claude Code, pi and
 * OpenCode against the mock model), the default room of 30,000. The mock
 * reports a turn's context as the turn asks (`[[reading N]]` in its words).
 * On a 200K Claude session (Claude Code compacts it at 167,000):
 * - (a) a turn at 120,000 files nothing;
 * - (b) a turn at exactly 137,000 files, before 167K: the rise is kept, its
 *   line says filing, the filing turn opens on the reading and the point,
 *   and its line then says filed;
 * - (c) a turn at 140,000 in the same rise files nothing more;
 * - (d) the session's `/compact` re-arms it, says a filing came first, and
 *   the next request carries the Open items section;
 * - (e) re-armed, a turn at 139,000 files again.
 *
 * (f) On a 1M Claude session, it files at about 937,000 (Claude Code
 * compacts it at 967,000): not at 930,000, at 937,000.
 *
 * (g) A move's compaction on a Claude session whose filing turn ends past
 * the room sends no filing beside it, and its `/compact` no line of the
 * threshold's.
 *
 * (h) pi files within the room of its reserve (100,000 less 16,384), and
 * OpenCode within the room of its buffer (100,000 less 16,000): not at
 * 50,000, at 60,000. Each `/compact` of theirs is said in a line, and their
 * next request carries the Open items section.
 *
 * (i) An OpenCode `/compact` ends the hub's turn: its send is read as
 * OpenCode delivers the compaction, so the execution's result closes it.
 *
 * (j) A move's `/compact` on an OpenCode session, CawCo's focus with it,
 * ends by itself, never waiting on its machine's idle reading; OpenCode's
 * summary request carries OpenCode's own template and none of CawCo's
 * focus (the 2.0.29 compact call takes none), and it compacts.
 *
 * Last, (k) Configure's Claude routing shows the room the policy holds,
 * inside the page at 1440 and at 390, and a new one saved there is the
 * policy's.
 *
 *   bun scripts/probe-kit/run.ts context-filing
 */
import {
  claudeCompactsAt,
  opencodeCompactsAt,
  piCompactsAt,
} from "../../../packages/agent/src/harnesses/compaction-points";
import { DEFAULT_COMPACTION } from "../../../packages/core/src/accounts";
import { COMPACTION_ORIGIN } from "../../../packages/core/src/harness";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { contextWords } from "../../../packages/core/src/words/context";
import { fileDue } from "../../../packages/hub/src/at-limit";
import {
  COMPACT_FOCUS,
  filingPrompt,
} from "../../../packages/hub/src/open-items";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const ROOM = DEFAULT_COMPACTION.fileRoom;
const READING = /\[\[reading (\d+)\]\]/u;
/** The heading every Open items section opens with (open-items.ts). */
const OPEN_ITEMS = "## Open items (this session's records, word for word)";
/** How long a turn's end is given to start a filing that must not come. */
const QUIET_MS = 5000;
/** The proven body's first words (open-items.ts `filingPrompt`). */
const BODY =
  "Before this conversation is compacted, file everything still open";
/** The last sentence of CawCo's compaction focus: none of it reaches OpenCode's summary. */
const FOCUS_TAIL = COMPACT_FOCUS.slice(
  COMPACT_FOCUS.lastIndexOf("Open questions")
);
/** A model whose window Claude Code knows as 1M natively. */
const CLAUDE_1M = "claude-sonnet-5";
/** The scratch fleet's pi and OpenCode models' windows (scratch-fleet.ts `furnish`). */
const MOCK_WINDOW = 100_000;

/**
 * A heading of OpenCode 2.0.29's compaction template, which its compaction
 * refuses a summary without ("Compaction summary did not match the required
 * template").
 */
const OPENCODE_TEMPLATE = "## Objective";

const respond = (request: Seen): Reply => {
  if (request.last.includes(OPENCODE_TEMPLATE)) {
    return {
      everyMs: 5,
      words: [`${OPENCODE_TEMPLATE}\n`, "- carry the probe on\n"],
    };
  }
  const reading = READING.exec(request.last)?.[1];
  return reading
    ? {
        everyMs: 5,
        words: ["ok"],
        usage: { prompt: Number(reading), completion: 10 },
      }
    : { everyMs: 5, words: ["ok"] };
};

/** (0) The rules, pure, and the filing turn's words. */
const rules = (kit: Kit) => {
  const { check } = kit;
  const compactsAt = 167_000;
  const due = (reported: number | null) =>
    fileDue({ compactsAt, reported, room: ROOM });
  check("fileDue: 136,999 of a 167,000 point files nothing", !due(136_999));
  check("fileDue: exactly the room short of the point files", due(137_000));
  check("fileDue: a reading past the point files", due(170_000));
  check(
    "fileDue: a point its harness did not say files nothing, however full",
    !fileDue({ compactsAt: undefined, reported: 199_000, room: ROOM })
  );
  check("fileDue: no reading files nothing", !due(null));
  check(
    "fileDue: a room of 0 files nothing",
    !fileDue({ compactsAt, reported: compactsAt, room: 0 })
  );
  check(
    "Claude Code compacts a 1M window at 967,000 and a 200K one at 167,000",
    claudeCompactsAt({ contextWindow: 1_000_000, maxOutputTokens: 128_000 }) ===
      967_000 &&
      claudeCompactsAt({ contextWindow: 200_000, maxOutputTokens: 64_000 }) ===
        167_000 &&
      claudeCompactsAt({ contextWindow: 200_000, maxOutputTokens: 8000 }) ===
        179_000
  );
  check(
    "pi compacts at its window less its reserve, never with compaction off",
    piCompactsAt(100_000, { enabled: true, reserveTokens: 16_384 }) ===
      83_616 &&
      piCompactsAt(100_000, { enabled: false, reserveTokens: 16_384 }) ===
        undefined
  );
  check(
    "OpenCode compacts at its window less its buffer, by default a tenth and at least 16,000, never with auto off",
    opencodeCompactsAt({ context: 100_000 }, {}) === 84_000 &&
      opencodeCompactsAt({ context: 1_000_000 }, {}) === 900_000 &&
      opencodeCompactsAt({ context: 200_000, input: 150_000 }, {}) ===
        134_000 &&
      opencodeCompactsAt({ context: 100_000 }, { buffer: 20_000 }) === 80_000 &&
      opencodeCompactsAt({ context: 100_000 }, { auto: false }) === undefined
  );
  const plain = filingPrompt("compacted");
  const full = filingPrompt("compacted", { tokens: 140_000, compactsAt });
  check(
    "filingPrompt: the threshold's turn opens on the reading and the point, closes on the harness compacting later, the proven body between",
    full.startsWith(contextWords.filingFact(140_000, compactsAt)) &&
      full.endsWith(contextWords.filingLater) &&
      full.includes(plain) &&
      plain.startsWith(BODY),
    full
  );
};

interface Line {
  content: string;
  id: string;
}

interface Said {
  filed?: string | null;
  fill?: { compactsAt: number; tokens: number };
  harness?: string;
  kind: string;
  stage?: string;
}

const reads = (fleet: KitFleet) => {
  const lines = (id: string) =>
    fleet
      .query<Line>(
        "SELECT id, content FROM session_lines WHERE instance_id = ? AND kind = 'context' ORDER BY rowid",
        id
      )
      .map((line) => ({ id: line.id, said: JSON.parse(line.content) as Said }));
  const filings = (id: string) =>
    lines(id).filter((line) => line.said.kind === "filing");
  const rise = (id: string) =>
    fleet.query<{ line_id: string }>(
      "SELECT line_id FROM context_rises WHERE instance_id = ?",
      id
    )[0];
  const plan = (id: string) =>
    fleet.query<{ stage: string; fill: string | null }>(
      "SELECT stage, fill FROM limit_compactions WHERE instance_id = ?",
      id
    )[0];
  const turnOpen = (id: string) =>
    fleet.query<{ turn_open_at: number | null }>(
      "SELECT turn_open_at FROM instances WHERE id = ?",
      id
    )[0]?.turn_open_at ?? null;
  const filingSends = (id: string) =>
    fleet
      .query<{ body: string }>(
        "SELECT body FROM sent_messages WHERE instance_id = ?",
        id
      )
      .filter(
        (row) =>
          JSON.parse(row.body)?.origin?.name === COMPACTION_ORIGIN &&
          String(JSON.parse(row.body)?.message?.content ?? "").includes(BODY)
      );
  /** One turn, asked and ended: the mock answered it and the hub wrote its reading. */
  const turn = async (id: string, words: string, reading?: number) => {
    const text =
      reading === undefined ? words : `${words} [[reading ${reading}]]`;
    const asked = fleet.seen.length;
    await fleet.send(id, text);
    await until(
      `"${text.slice(0, 60)}" answered`,
      () => fleet.seen.slice(asked).find((one) => one.last.includes(text)),
      Boolean,
      120_000
    );
    await until(
      `"${text.slice(0, 60)}"'s turn ended`,
      () =>
        fleet.query<{ turn_open_at: number | null; context_tokens: number }>(
          "SELECT turn_open_at, context_tokens FROM instances WHERE id = ?",
          id
        )[0],
      // A reading within the room is followed by its filing turn at once,
      // whose own reading takes its place.
      (row) =>
        row?.turn_open_at === null &&
        (reading === undefined ||
          row.context_tokens === reading ||
          rise(id) !== undefined),
      120_000
    );
  };
  /** The next request the mock gets for `id`'s words, whole. */
  const nextRequest = async (id: string, words: string) => {
    const asked = fleet.seen.length;
    await turn(id, words);
    return fleet.seen.slice(asked).find((one) => one.last.includes(words));
  };
  /** A filing that must not come, given its moment. */
  const noFiling = async (id: string) => {
    await Bun.sleep(QUIET_MS);
    return !rise(id) && filings(id).length === 0 && !plan(id);
  };
  /** The first filing of `id` after `before` filings, once said. */
  const filingAfter = (id: string, before: number) =>
    until("a filing", () => filings(id)[before], Boolean, 60_000).catch(
      () => undefined
    );
  return {
    filingAfter,
    filings,
    filingSends,
    lines,
    nextRequest,
    noFiling,
    plan,
    rise,
    turn,
    turnOpen,
  };
};

type Reads = ReturnType<typeof reads>;

/** (a)–(e) A 200K Claude session, compacted by Claude Code at 167,000. */
const claude200k = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const { filings, filingSends, lines, rise, plan, turn } = read;
  const id = await fleet.spawn("claude", "Filing");
  await turn(id, "hello");

  await turn(id, "below", 120_000);
  check(
    "(a) a 200K Claude session's turn at 120,000 files nothing",
    await read.noFiling(id),
    JSON.stringify({ rise: rise(id), lines: lines(id) })
  );

  await turn(id, "at", 137_000);
  const started = await read.filingAfter(id, 0);
  check(
    "(b) a 200K Claude session files at 137,000, before Claude Code's 167,000: its rise is kept under its filing's line, the point its harness said",
    !!started &&
      rise(id)?.line_id === started.id &&
      started.said.fill?.compactsAt === 167_000 &&
      started.said.fill?.tokens === 137_000,
    JSON.stringify({ rise: rise(id), lines: lines(id) })
  );
  const [sent] = filingSends(id);
  const prompt = sent
    ? String(JSON.parse(sent.body).message.content)
    : "(none sent)";
  check(
    "(b) the filing turn opens on the reading and the point, closes on the harness compacting later, the proven body between",
    prompt.startsWith(contextWords.filingFact(137_000, 167_000)) &&
      prompt.includes(BODY) &&
      prompt.endsWith(contextWords.filingLater),
    prompt
  );
  const filed = await until(
    "(b) its filing ended",
    () => filings(id)[0]?.said.stage,
    (stage) => stage === "filed",
    120_000
  ).catch(() => filings(id)[0]?.said.stage);
  check(
    "(b) its line says filed once its turn ended, and its plan is gone",
    filed === "filed" && !plan(id),
    JSON.stringify({ lines: lines(id), plan: plan(id) })
  );

  await turn(id, "above", 140_000);
  await Bun.sleep(QUIET_MS);
  check(
    "(c) a turn at 140,000 in the same rise files nothing more",
    filings(id).length === 1 && filingSends(id).length === 1,
    JSON.stringify({ lines: lines(id) })
  );

  await fleet.send(id, "/compact");
  const compacted = await until(
    "(d) the compaction's line",
    () => lines(id).find((line) => line.said.kind === "compacted"),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    "(d) the session's /compact re-arms it: its rise is gone, and its line says a filing came first",
    !!compacted && compacted.said.filed === "filed" && !rise(id),
    JSON.stringify({ lines: lines(id), rise: rise(id) })
  );
  await until(
    "Claude running again after its /compact",
    () => fleet.instance(id)?.status,
    (status) => status === "running",
    120_000
  );
  const after = await read.nextRequest(id, "after the compaction");
  check(
    "(d) Claude Code's next request carries the Open items section (the agent's SessionStart hook on compact)",
    !!after?.body.includes(OPEN_ITEMS),
    after ? after.body.slice(0, 2000) : "(no request)"
  );

  await turn(id, "again", 139_000);
  const second = await read.filingAfter(id, 1);
  check(
    "(e) re-armed, a turn at 139,000 files again",
    !!second && rise(id)?.line_id === second.id,
    JSON.stringify({ lines: lines(id) })
  );
};

/** (f) A 1M Claude session, compacted by Claude Code at 967,000. */
const claude1m = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const id = await fleet.spawn("claude", "Filing 1M", undefined, {
    model: CLAUDE_1M,
  });
  await read.turn(id, "hello");
  const window = fleet.query<{ context_window: number }>(
    "SELECT context_window FROM claude_context_windows WHERE model = ?",
    CLAUDE_1M
  )[0]?.context_window;
  kit.note(`${CLAUDE_1M}'s window, as Claude Code reported it: ${window}`);
  await read.turn(id, "below", 930_000);
  check(
    "(f) a 1M Claude session's turn at 930,000 files nothing",
    await read.noFiling(id),
    JSON.stringify({ window, lines: read.lines(id) })
  );
  await read.turn(id, "at", 937_000);
  const started = await read.filingAfter(id, 0);
  check(
    "(f) a 1M Claude session files at 937,000, Claude Code compacting it at 967,000",
    started?.said.fill?.compactsAt === 967_000 &&
      started?.said.fill?.tokens === 937_000,
    JSON.stringify({ window, lines: read.lines(id) })
  );
};

/** A move's compaction plan put on `id` at its filing step, as at-limit.ts `startCompaction` puts one. */
const movePlan = (
  fleet: KitFleet,
  id: string,
  compactBy?: "opencode"
): { compactUuid: string; filingUuid: string; lineId: string } => {
  const plan = {
    filingUuid: crypto.randomUUID(),
    compactUuid: crypto.randomUUID(),
    lineId: `probe-move-${id}`,
  };
  const move = {
    kind: "moved",
    from: { id: ACCOUNT, name: "Probe", hue: "blue" },
    to: { id: "acct-context-b", name: "B", hue: "green" },
    sameOrganization: false,
    tokens: 150_000,
    window: null,
    resetsAt: null,
    compact: "filing",
    ...(compactBy ? { compactBy } : {}),
  };
  fleet.write(
    "INSERT INTO limit_compactions (instance_id, stage, line_id, move, fill, carry_uuid, filing_uuid, compact_uuid, compacted, ended_step, created_at) VALUES (?, 'filing', ?, ?, NULL, NULL, ?, ?, 0, NULL, ?)",
    id,
    plan.lineId,
    JSON.stringify(move),
    plan.filingUuid,
    plan.compactUuid,
    Date.now()
  );
  return plan;
};

/** The move's filing step, sent under its uuid, as the hub sends it. */
const sendStep = (fleet: KitFleet, id: string, uuid: string, words: string) =>
  fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: id,
    payload: {
      instanceId: id,
      message: {
        type: "user",
        uuid,
        message: { role: "user", content: words },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });

/** The move line a plan says as it ends, by its id. */
const moveLine = (fleet: KitFleet, lineId: string) =>
  JSON.parse(
    fleet.query<{ move: string }>(
      "SELECT move FROM limit_events WHERE id = ?",
      lineId
    )[0]?.move ?? "null"
  ) as { compact?: string } | null;

/** (g) A move's compaction: no filing at the threshold beside it. */
const moveCompaction = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const id = await fleet.spawn("claude", "Moving");
  const plan = movePlan(fleet, id);
  await sendStep(
    fleet,
    id,
    plan.filingUuid,
    "the move's filing turn [[reading 150000]]"
  );
  const ended = await until(
    "(g) the move's compaction ended",
    () => (read.plan(id) ? "running" : "ended"),
    (stage) => stage === "ended",
    240_000
  ).catch(() => (read.plan(id) ? "running" : "ended"));
  const compactSent = fleet.sendRow(plan.compactUuid);
  check(
    "(g) a move's compaction whose filing turn ended past the room went on to its own /compact and ended",
    ended === "ended" && !!compactSent,
    JSON.stringify({ plan: read.plan(id), compact: compactSent })
  );
  check(
    "(g) no filing at the threshold beside it, nor a line of the threshold's for its /compact",
    read.filings(id).length === 0 &&
      !read.rise(id) &&
      read.lines(id).every((line) => line.said.kind !== "compacted"),
    JSON.stringify({ lines: read.lines(id), rise: read.rise(id) })
  );
};

/** A pi or OpenCode session's text that its summary can't hold whole: more than pi keeps as its recent tail (20,000 tokens). */
const LONG_TEXT = Array.from(
  { length: 2500 },
  (_, at) => `line ${at} of what the session read, kept long on purpose.`
).join("\n");

/** (h), (i) pi and OpenCode: within the room of their own point, and their listing after a compaction. */
const piAndOpencode = async (
  kit: Kit,
  fleet: KitFleet,
  harness: "pi" | "opencode",
  read: Reads
) => {
  const { check } = kit;
  const point =
    harness === "pi"
      ? piCompactsAt(MOCK_WINDOW, { enabled: true, reserveTokens: 16_384 })
      : opencodeCompactsAt({ context: MOCK_WINDOW }, {});
  const id = await fleet.spawn(harness, `Filing ${harness}`);
  await read.turn(id, "hello");
  await read.turn(id, "below", 50_000);
  check(
    `(h) ${harness}'s turn at 50,000 files nothing (its point ${point})`,
    await read.noFiling(id),
    JSON.stringify(read.lines(id))
  );
  await read.turn(id, "at", 60_000);
  const started = await read.filingAfter(id, 0);
  check(
    `(h) ${harness} files at 60,000, within the room of where it compacts it, ${point}`,
    started?.said.fill?.compactsAt === point &&
      started?.said.fill?.tokens === 60_000,
    JSON.stringify(read.lines(id))
  );
  await until(
    `${harness}'s filing ended`,
    () => read.filings(id)[0]?.said.stage,
    (stage) => stage === "filed",
    120_000
  ).catch(() => undefined);

  await read.turn(id, `read this ${LONG_TEXT}`);
  await fleet.send(id, "/compact");
  const compacted = await until(
    `(h) ${harness}'s compaction line`,
    () => read.lines(id).find((line) => line.said.kind === "compacted"),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    `(h) ${harness}'s /compact is said in a line, its harness named, after its filing`,
    compacted?.said.harness === harness && compacted.said.filed === "filed",
    JSON.stringify(read.lines(id))
  );
  const atRest = await until(
    `${harness} at rest after its compaction`,
    () => read.turnOpen(id) ?? "closed",
    (open) => open === "closed",
    60_000
  ).catch(() => read.turnOpen(id));
  if (harness === "opencode") {
    check(
      "(i) OpenCode's /compact ends the hub's turn: its send read as OpenCode delivers the compaction, the execution's result closing it",
      atRest === "closed",
      JSON.stringify({ turnOpenAt: atRest })
    );
  }
  // The listing is written once the hub's records are read: given a moment.
  await Bun.sleep(3000);
  const after = await read.nextRequest(id, `after ${harness}'s compaction`);
  check(
    `(h) ${harness}'s next request carries the Open items section`,
    !!after?.body.includes(OPEN_ITEMS),
    after ? after.body.slice(-3000) : "(no request)"
  );
};

/** (j) A move's `/compact` on OpenCode: ends by itself, its summary on OpenCode's template alone. */
const opencodeMove = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const id = await fleet.spawn("opencode", "Moving opencode");
  await read.turn(id, "hello");
  await read.turn(id, `read this ${LONG_TEXT}`);
  const plan = movePlan(fleet, id, "opencode");
  const asked = fleet.seen.length;
  await sendStep(fleet, id, plan.filingUuid, "the move's filing turn");
  const ended = await until(
    "(j) the move's compaction on OpenCode ended",
    () => (read.plan(id) ? "running" : "ended"),
    (stage) => stage === "ended",
    120_000
  ).catch(() => (read.plan(id) ? "running" : "ended"));
  check(
    "(j) a move's /compact on OpenCode ends by itself, never waiting on its machine's idle reading",
    ended === "ended" && read.turnOpen(id) === null,
    JSON.stringify({ plan: read.plan(id), turnOpenAt: read.turnOpen(id) })
  );
  const summary = fleet.seen
    .slice(asked)
    .find((one) => one.last.includes(OPENCODE_TEMPLATE));
  check(
    "(j) OpenCode's summary request carries its own template and none of CawCo's focus, and it compacts",
    !!summary &&
      !summary.body.includes(FOCUS_TAIL) &&
      moveLine(fleet, plan.lineId)?.compact === "compacted",
    JSON.stringify({
      line: moveLine(fleet, plan.lineId),
      focusInRequest: summary?.body.includes(FOCUS_TAIL),
      sent: fleet.sendRow(plan.compactUuid),
    })
  );
};

/** (k) The room on Configure's Claude routing, which a provider has from its second account on. */
const configured = async (kit: Kit, fleet: KitFleet) => {
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES ('acct-context-b', 'anthropic', 'console', 'Second', 'green', 1, 0, ?)",
    Date.now()
  );
  const policy = () =>
    JSON.parse(
      fleet.query<{ at_limit: string }>(
        "SELECT at_limit FROM account_routing WHERE provider = 'anthropic'"
      )[0]?.at_limit ?? "{}"
    )?.compaction?.fileRoom;
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    await page.goto(
      `${await fleet.dashboard()}/config/accounts/anthropic/routing`
    );
    const field = page.getByLabel(accountsWords.atLimit.fileRoom, {
      exact: true,
    });
    await field.waitFor({ timeout: 30_000 }).catch(() => undefined);
    const shown = await field.inputValue().catch(() => "(no field)");
    const fits = await field
      .evaluate((input) => {
        const row = input.closest("p");
        return (
          !!row &&
          row.scrollWidth <= row.clientWidth &&
          input.getBoundingClientRect().right <= window.innerWidth &&
          document.documentElement.scrollWidth <= window.innerWidth
        );
      })
      .catch(() => false);
    const expected = String(view === "desk" ? ROOM / 1000 : 40);
    kit.check(
      `(k) at ${view}, Configure's Claude routing shows the policy's room, ${expected}k, its row inside the page`,
      shown === expected && fits,
      JSON.stringify({ shown, fits })
    );
    if (view === "desk") {
      await field.fill("40");
      await page
        .getByRole("button", { name: accountsWords.routingEditor.save })
        .click();
      const saved = await until(
        "(k) the room saved",
        policy,
        (value) => value === 40_000,
        30_000
      ).catch(policy);
      kit.check(
        "(k) a room typed there and saved is the policy's",
        saved === 40_000,
        JSON.stringify({ saved })
      );
    }
    await page.close();
  }
};

const run = async (kit: Kit) => {
  rules(kit);
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const read = reads(fleet);
  await claude200k(kit, fleet, read);
  await claude1m(kit, fleet, read);
  await moveCompaction(kit, fleet, read);
  for (const harness of ["pi", "opencode"] as const) {
    await piAndOpencode(kit, fleet, harness, read);
  }
  await opencodeMove(kit, fleet, read);
  await configured(kit, fleet);
};

export default {
  group: "The hub and machines",
  name: "context-filing",
  run,
} satisfies Spec;
