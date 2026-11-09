/**
 * A session files its open items once its context comes within its
 * compaction policy's `fileRoom` of the point where its own harness compacts
 * it, and every harness lists them after each of its compactions (hub
 * at-limit.ts `fileDue`, compaction.ts `fileAtThreshold` and
 * `observeCompaction`, open-items.ts, the agent's compaction-points.ts).
 *
 * First the rules, pure: `fileDue` below, at and past the room, a reading
 * past the whole window, a point its harness did not say, no reading and a
 * room of 0; each harness's own point (Claude Code's on a 1M and a 200K
 * window, pi's reserve, OpenCode's buffer); what a filing wrote, counted
 * against what the records held as it started (open-items.ts
 * `filingWrote`); and the words: the lines naming the harness and what the
 * filing wrote, and the filing turn's around the proven body.
 *
 * Then on a scratch fleet (real hub, agent and sessiond; Claude Code, pi and
 * OpenCode against the mock model), the default room of 30,000. The mock
 * reports a turn's context as the turn asks (`[[reading N]]` in its words).
 * On a 200K Claude session (Claude Code compacts it at 167,000):
 * - (a) a turn at 120,000 files nothing;
 * - (b) a turn at exactly 137,000 files, before 167K: the rise is kept, its
 *   line says filing, the filing turn opens on the reading and the point,
 *   and its line then says filed and what the filing turn wrote (its mock
 *   model writes two plan steps through `todo_write`);
 * - (c) a turn at 140,000 in the same rise files nothing more;
 * - (d) the session's `/compact` re-arms it, says a filing came first, and
 *   the next request carries the Open items section;
 * - (e) re-armed, a turn at 139,000 files again, and its line says it wrote
 *   nothing new (its model writes nothing).
 *
 * (m) A turn within the room that ends while another message to the
 * session waits files nothing then: its filing goes once that next turn
 * ends, a turn of its own, never joined into the waiting message's.
 *
 * (o) A 200K claude-haiku-4-5 session, whose window Claude Code resolves to
 * source "auto" unless one is set, files at 137,000, and past 167,000
 * Claude Code compacts it on its own before its next request, which
 * carries the Open items section: CawCo hands every session a window.
 *
 * (f) On a 1M Claude session, it files at about 937,000 (Claude Code
 * compacts it at 967,000): not at 930,000, at 937,000. (n) Then a turn at
 * 970,000, past that point, and the next message: Claude Code compacts it
 * on its own, its line says so (not "as asked") with its open items filed
 * first, and the next request carries the Open items section.
 *
 * (g) A move's compaction on a Claude session whose filing turn ends past
 * the room sends no filing beside it, and its `/compact` no line of the
 * threshold's.
 *
 * (h) pi files within the room of its reserve (100,000 less 16,384), and
 * OpenCode within the room of its buffer (100,000 less 16,000): not at
 * 50,000, at 60,000, its line naming the harness and saying it wrote
 * nothing new. Each `/compact` of theirs is said in a line, and their next
 * request carries the Open items section.
 *
 * (l) After each of their compactions, its own result files nothing (pi's
 * reports what its large kept tail leaves, within the room), and their next
 * turn of their own work within the room files, once. (d) says the same
 * hold of Claude's `/compact`.
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
  claudeEnvWindow,
  opencodeCompactsAt,
  piCompactsAt,
} from "../../../packages/agent/src/harnesses/compaction-points";
import { DEFAULT_COMPACTION } from "../../../packages/core/src/accounts";
import type {
  FilingStage,
  FilingWrote,
} from "../../../packages/core/src/context-filing";
import { CONTEXT_LINE } from "../../../packages/core/src/harness";
import { COMPACTION_ORIGIN } from "../../../packages/core/src/harness/kinds";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { contextWords } from "../../../packages/core/src/words/context";
import { fileDue } from "../../../packages/hub/src/at-limit";
import {
  COMPACT_FOCUS,
  filingPrompt,
  filingWrote,
} from "../../../packages/hub/src/open-items";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { toolReply } from "../../tool-calls";
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
/** A model whose 200K window Claude Code resolves to source "auto" when no window is set (tsk-231). */
const CLAUDE_200K = "claude-haiku-4-5";
/** The scratch fleet's pi and OpenCode models' windows (scratch-fleet.ts `furnish`). */
const MOCK_WINDOW = 100_000;

/**
 * A heading of OpenCode 2.0.29's compaction template, which its compaction
 * refuses a summary without ("Compaction summary did not match the required
 * template").
 */
const OPENCODE_TEMPLATE = "## Objective";

/** Words in a session's first message that make its first filing turn write {@link FILED_STEPS} through `todo_write`. */
const FILES = "[[files its plan]]";
/** Words that make the mock answer slowly, about 3 seconds, so a second message waits behind the turn. */
const SLOW = "[[slow]]";
const TODO_WRITE = "mcp__cawco__todo_write";
/** The plan steps (b)'s filing turn writes. */
const FILED_STEPS = [
  { content: "Carry the probe on past its compaction", status: "pending" },
  { content: "Read the reading back after it", status: "pending" },
];

/** Whether the filing turn of the session sent {@link FILES} has called `todo_write`: once, its first filing alone. */
let filedSteps = false;

const respond = (request: Seen): Reply => {
  if (request.last.includes(OPENCODE_TEMPLATE)) {
    return {
      everyMs: 5,
      words: [`${OPENCODE_TEMPLATE}\n`, "- carry the probe on\n"],
    };
  }
  // The first filing turn of the session that asked it to write its plan:
  // its request, and the one after its ToolSearch (never a summary's).
  if (
    !filedSteps &&
    request.all.includes(FILES) &&
    request.all.includes(BODY) &&
    (request.last.includes(BODY) || request.afterTool)
  ) {
    const reply = toolReply(request, TODO_WRITE, { steps: FILED_STEPS });
    filedSteps = reply.tool?.name === TODO_WRITE;
    return reply;
  }
  if (request.last.includes(SLOW)) {
    return {
      everyMs: 150,
      words: Array.from({ length: 20 }, () => "slow "),
      usage: {
        prompt: Number(READING.exec(request.last)?.[1] ?? 10),
        completion: 20,
      },
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

/** What a filing that wrote nothing new is counted as. */
const WROTE_NOTHING: FilingWrote = {
  notes: 0,
  spec: false,
  steps: 0,
  tasks: 0,
  todos: 0,
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
    "fileDue: a reading past its whole window (a harness's count over it) files, as one at the point does",
    due(250_000)
  );
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
    "Claude Code handed a 1,000,000 window compacts a 1M model at 967,000 and a 200K one at 167,000",
    claudeCompactsAt(
      { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
      1_000_000
    ) === 967_000 &&
      claudeCompactsAt(
        { contextWindow: 200_000, maxOutputTokens: 64_000 },
        1_000_000
      ) === 167_000 &&
      claudeCompactsAt(
        { contextWindow: 200_000, maxOutputTokens: 8000 },
        1_000_000
      ) === 179_000
  );
  check(
    "Claude Code handed a 150,000 window compacts a 200K model at 117,000",
    claudeCompactsAt(
      { contextWindow: 200_000, maxOutputTokens: 64_000 },
      150_000
    ) === 117_000
  );
  check(
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW reads as Claude Code reads it: k and m, held to 100,000–1,000,000, none when not a count",
    claudeEnvWindow("150000") === 150_000 &&
      claudeEnvWindow("150k") === 150_000 &&
      claudeEnvWindow("1m") === 1_000_000 &&
      claudeEnvWindow("50000") === 100_000 &&
      claudeEnvWindow("2m") === 1_000_000 &&
      claudeEnvWindow("auto") === undefined &&
      claudeEnvWindow(undefined) === undefined
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
  const fill = { tokens: 137_000, compactsAt };
  const filingLine = (stage: FilingStage, wrote?: FilingWrote) =>
    contextWords.line({
      kind: "filing",
      fill,
      harness: "claude",
      stage,
      ...(wrote ? { wrote } : {}),
    });
  const compactedLine = (
    trigger: "auto" | "manual",
    filed: "filed" | null,
    failed?: true
  ) =>
    contextWords.line({
      kind: "compacted",
      filed,
      harness: "claude",
      tokens: 165_000,
      trigger,
      ...(failed ? { failed } : {}),
    });
  check(
    "words: a filing line names the reading, its harness and the point in tokenWords' form",
    filingLine("filing").title ===
      "Filing its open items at 137k tokens · Claude Code compacts it at 167k" &&
      filingLine("filed").title ===
        "Open items filed at 137k tokens · Claude Code compacts it at 167k" &&
      filingLine("stopped").detail ===
        "It is not asked to file again before Claude Code compacts it.",
    JSON.stringify([filingLine("filing"), filingLine("stopped")])
  );
  check(
    "words: once filed, its detail says what it wrote, each kind counted; nothing new said as such; unknown, its title alone",
    filingLine("filed", { ...WROTE_NOTHING, steps: 2, spec: true, notes: 1 })
      .detail === "Wrote 2 plan steps, its spec and 1 note." &&
      filingLine("filed", { ...WROTE_NOTHING, tasks: 1 }).detail ===
        "Wrote 1 task." &&
      filingLine("filed", WROTE_NOTHING).detail ===
        "Wrote nothing new to its records." &&
      filingLine("filed").detail === "",
    JSON.stringify([
      filingLine("filed", { ...WROTE_NOTHING, steps: 2, spec: true, notes: 1 }),
      filingLine("filed", WROTE_NOTHING),
    ])
  );
  const held = {
    notes: ["n-1"],
    spec: "2026-11-05T10:00:00.000Z",
    steps: ["pending\tRead the report", "in_progress\tWrite the fix"],
    tasks: ["tsk-1"],
    todos: ["tsk-1\t1\t \tCheck the gate"],
  };
  const later = {
    notes: ["n-1", "n-2"],
    spec: "2026-11-05T11:00:00.000Z",
    steps: [
      "pending\tRead the report",
      "completed\tWrite the fix",
      "pending\tRun the gate",
    ],
    tasks: ["tsk-1", "tsk-2"],
    todos: ["tsk-1\t1\tx\tCheck the gate", "tsk-2\t1\t \tShip it"],
  };
  check(
    "filingWrote: the same records again wrote nothing; a step closed, a step added, the spec rewritten, a task filed with its to-do, a to-do ticked and a note each count once, a task's own to-dos with it",
    Bun.deepEquals(filingWrote(held, held), WROTE_NOTHING) &&
      Bun.deepEquals(filingWrote(held, later), {
        notes: 1,
        spec: true,
        steps: 2,
        tasks: 1,
        todos: 1,
      }),
    JSON.stringify([filingWrote(held, held), filingWrote(held, later)])
  );
  check(
    "words: a person's /compact is titled as asked, the harness's own is not, one detail for both",
    compactedLine("manual", "filed").title ===
      "Compacted by Claude Code as asked at 165k tokens · its open items filed first" &&
      compactedLine("auto", null).title ===
        "Compacted by Claude Code at 165k tokens · nothing filed first" &&
      compactedLine("auto", null).detail ===
        compactedLine("manual", "filed").detail,
    JSON.stringify([
      compactedLine("manual", "filed"),
      compactedLine("auto", null),
    ])
  );
  check(
    "words: a failed compaction's detail branches on whether a filing had come: the longer one says more after the shorter",
    compactedLine("auto", null, true).detail !==
      compactedLine("auto", "filed", true).detail &&
      compactedLine("auto", "filed", true).detail.startsWith(
        `${compactedLine("auto", null, true).detail} · `
      ),
    JSON.stringify([
      compactedLine("auto", null, true),
      compactedLine("auto", "filed", true),
    ])
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
  tokens?: number | null;
  trigger?: string | null;
  wrote?: FilingWrote;
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
  /** Whether `id`'s compaction still holds its filing back: no answer of its own since (schema `context_compactions`). */
  const gated = (id: string) =>
    fleet.query<{ at: number }>(
      "SELECT at FROM context_compactions WHERE instance_id = ?",
      id
    ).length > 0;
  /** `id`'s transcript's context lines as the hub draws them: each title and the detail under it. */
  const notes = async (id: string) =>
    (
      await fleet.api<{
        blocks: {
          content?: string;
          metadata?: { noteTitle?: string; subtype?: string };
        }[];
      }>(hubRequest("GET /api/instances/:id/transcript", { path: { id } }))
    ).blocks
      .filter((block) => block.metadata?.subtype === CONTEXT_LINE)
      .map((block) => ({
        title: block.metadata?.noteTitle ?? "",
        content: block.content ?? "",
      }));
  /** `id`'s context as the hub last stored it. */
  const stored = (id: string) =>
    fleet.query<{ context_tokens: number | null }>(
      "SELECT context_tokens FROM instances WHERE id = ?",
      id
    )[0]?.context_tokens ?? null;
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
    gated,
    lines,
    nextRequest,
    notes,
    noFiling,
    plan,
    rise,
    stored,
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
  await turn(id, `hello ${FILES}`);

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
  check(
    "(b) its filed line counts what the filing turn wrote: the two plan steps its todo_write wrote, nothing else",
    filedSteps &&
      Bun.deepEquals(filings(id)[0]?.said.wrote, {
        ...WROTE_NOTHING,
        steps: FILED_STEPS.length,
      }),
    JSON.stringify({ filedSteps, lines: lines(id) })
  );
  const filedNote = (await read.notes(id)).find((note) =>
    note.title.startsWith("Open items filed")
  );
  check(
    "(b) its transcript draws the line by its words, naming Claude Code, and what it wrote under it",
    filedNote?.title ===
      "Open items filed at 137k tokens · Claude Code compacts it at 167k" &&
      filedNote.content === "Wrote 2 plan steps.",
    JSON.stringify(filedNote)
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
  await until(
    "Claude at rest after its /compact",
    () => read.turnOpen(id) ?? "closed",
    (open) => open === "closed",
    60_000
  ).catch(() => undefined);
  const compactedNote = (await read.notes(id)).find((note) =>
    note.title.startsWith("Compacted by")
  );
  check(
    '(d) a person\'s /compact is drawn as asked: "Compacted by Claude Code as asked at …k tokens · its open items filed first"',
    !!compactedNote?.title.startsWith(
      "Compacted by Claude Code as asked at "
    ) &&
      compactedNote.title.endsWith("k tokens · its open items filed first") &&
      compactedNote.content === "What its records hold is listed back to it.",
    JSON.stringify(compactedNote)
  );
  check(
    "(d) Claude's /compact turn leaves its filing held back until it answers a request of its own",
    read.gated(id) && read.filings(id).length === 1,
    JSON.stringify({ gated: read.gated(id), lines: lines(id) })
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
  const secondFiled = await until(
    "(e) its second filing ended",
    () => filings(id)[1]?.said,
    (said) => said?.stage === "filed",
    120_000
  ).catch(() => filings(id)[1]?.said);
  check(
    "(e) a filing turn that writes nothing says so: it wrote nothing new",
    Bun.deepEquals(secondFiled?.wrote, WROTE_NOTHING),
    JSON.stringify(secondFiled)
  );
};

/**
 * (m) A turn within the room that ends while a message to the session
 * waits behind it: no filing then; it goes once the next turn ends, a turn
 * of its own.
 */
const midTurn = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const id = await fleet.spawn("claude", "Filing mid-turn");
  await read.turn(id, "hello");
  const first = `busy one ${SLOW} [[reading 137000]]`;
  const second = `busy two ${SLOW} [[reading 138000]]`;
  const asked = fleet.seen.length;
  await fleet.send(id, first);
  await until(
    "(m) the first turn asked",
    () => fleet.seen.slice(asked).find((one) => one.last.includes(first)),
    Boolean,
    120_000
  );
  await fleet.send(id, second);
  const secondAsked = await until(
    "(m) the second turn asked",
    () => fleet.seen.slice(asked).find((one) => one.last.includes(second)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const started = await read.filingAfter(id, 0);
  const filingAsked = await until(
    "(m) the filing turn asked",
    () => fleet.seen.slice(asked).find((one) => one.last.includes(BODY)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const startedAt = started
    ? fleet.query<{ at: number }>(
        "SELECT at FROM session_lines WHERE instance_id = ? AND kind = 'context' AND id = ?",
        id,
        started.id
      )[0]?.at
    : undefined;
  check(
    "(m) the first turn's end, its reading within the room, files nothing while the second message waits: its filing starts once the second turn has run (its answer takes 3s)",
    !!secondAsked &&
      startedAt !== undefined &&
      startedAt >= secondAsked.at + 2000 &&
      started?.said.fill?.tokens === 138_000,
    JSON.stringify({
      secondAskedAt: secondAsked?.at,
      startedAt,
      lines: read.lines(id),
    })
  );
  check(
    "(m) the filing is a turn of its own, after the second, never joined into it",
    !!filingAsked &&
      !!secondAsked &&
      filingAsked.at > secondAsked.at &&
      !secondAsked.body.includes(BODY) &&
      read.filingSends(id).length === 1,
    JSON.stringify({
      filingAskedAt: filingAsked?.at,
      secondAskedAt: secondAsked?.at,
      sends: read.filingSends(id).length,
    })
  );
};

/**
 * (o) A 200K claude-haiku-4-5 session driven past its point: CawCo hands it
 * a window (claude.ts `SESSION_DEFAULTS`), so Claude Code enforces
 * its threshold. It files at 137,000, and Claude Code compacts it on its own
 * before the request that would carry 170,000.
 */
const haikuPast = async (kit: Kit, fleet: KitFleet, read: Reads) => {
  const { check } = kit;
  const { lines, rise } = read;
  const id = await fleet.spawn("claude", "Filing haiku past", undefined, {
    model: CLAUDE_200K,
  });
  await read.turn(id, "hello");
  await read.turn(id, "at", 137_000);
  const started = await read.filingAfter(id, 0);
  check(
    "(o) a claude-haiku-4-5 session files at 137,000, Claude Code compacting it at 167,000",
    started?.said.fill?.compactsAt === 167_000 &&
      started?.said.fill?.tokens === 137_000,
    JSON.stringify({ lines: lines(id) })
  );
  await until(
    "(o) its filing ended",
    () => read.filings(id)[0]?.said.stage,
    (stage) => stage === "filed",
    120_000
  ).catch(() => undefined);
  await read.turn(id, "past the point", 170_000);
  const asked = fleet.seen.length;
  await fleet.send(id, "after the haiku point");
  const own = await until(
    "(o) Claude Code's own compaction's line",
    () => lines(id).find((line) => line.said.kind === "compacted"),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    "(o) Claude Code compacts a claude-haiku-4-5 session past 167,000 on its own, its filing first",
    own?.said.trigger === "auto" &&
      own.said.harness === "claude" &&
      own.said.filed === "filed" &&
      own.said.tokens !== null &&
      own.said.tokens !== undefined &&
      own.said.tokens >= 170_000 &&
      !rise(id),
    JSON.stringify({ lines: lines(id), rise: rise(id) })
  );
  const next = await until(
    "(o) the request after Claude Code's own compaction",
    () =>
      fleet.seen
        .slice(asked)
        .find((one) => one.last.includes("after the haiku point")),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(o) its compact boundary comes before the request that would carry 170,000: that request carries the Open items section",
    !!next?.body.includes(OPEN_ITEMS),
    next ? next.body.slice(0, 2000) : "(no request)"
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
  await until(
    "(f) its filing ended",
    () => read.filings(id)[0]?.said.stage,
    (stage) => stage === "filed",
    120_000
  ).catch(() => undefined);

  // (n) Past its point, Claude Code compacts it on its own before its next
  // request.
  const { lines, rise } = read;
  await read.turn(id, "past the point", 970_000);
  const compactions = () =>
    lines(id).filter((line) => line.said.kind === "compacted");
  const asked = fleet.seen.length;
  await fleet.send(id, "after the point");
  const own = await until(
    "(n) Claude Code's own compaction's line",
    () => compactions()[0],
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    "(n) Claude Code compacts a 1M session past its point on its own, and its line says so, its filing first",
    own?.said.trigger === "auto" &&
      own.said.harness === "claude" &&
      own.said.filed === "filed" &&
      !rise(id),
    JSON.stringify({ lines: lines(id), rise: rise(id) })
  );
  const ownNote = (await read.notes(id)).find((note) =>
    note.title.startsWith("Compacted by")
  );
  const ownTitle = contextWords.line({
    kind: "compacted",
    filed: "filed",
    harness: "claude",
    tokens: own?.said.tokens ?? null,
    trigger: "auto",
  }).title;
  check(
    "(n) its line is titled as Claude Code's own compaction at what it reported, its open items filed first, not as one a person asked for",
    own?.said.tokens !== null &&
      own?.said.tokens !== undefined &&
      own.said.tokens >= 970_000 &&
      ownNote?.title === ownTitle,
    JSON.stringify({ ownNote, ownTitle })
  );
  const listed = await until(
    "(n) the request after Claude Code's own compaction",
    () =>
      fleet.seen
        .slice(asked)
        .find((one) => one.last.includes("after the point")),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(n) the request after it carries the Open items section",
    !!listed?.body.includes(OPEN_ITEMS),
    listed ? listed.body.slice(0, 2000) : "(no request)"
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
    `(h) ${harness} files at 60,000, within the room of where it compacts it, ${point}, its line naming it`,
    started?.said.fill?.compactsAt === point &&
      started?.said.fill?.tokens === 60_000 &&
      started.said.harness === harness,
    JSON.stringify(read.lines(id))
  );
  const filed = await until(
    `${harness}'s filing ended`,
    () => read.filings(id)[0]?.said,
    (said) => said?.stage === "filed",
    120_000
  ).catch(() => read.filings(id)[0]?.said);
  check(
    `(h) ${harness}'s filed line says its turn wrote nothing new`,
    Bun.deepEquals(filed?.wrote, WROTE_NOTHING),
    JSON.stringify(filed)
  );

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
  // The compaction's own result: no filing, whatever it reports.
  await Bun.sleep(QUIET_MS);
  const left = read.stored(id);
  if (harness === "pi") {
    check(
      `(l) pi's compaction's own result reports what its large kept tail leaves, within the room of its point (${left} of ${point})`,
      point !== undefined && left !== null && left >= point - ROOM,
      JSON.stringify({ reading: left, point, room: ROOM })
    );
  }
  check(
    `(l) ${harness}'s compaction's own result files nothing: its filing held back until it answers a request of its own`,
    read.filings(id).length === 1 && read.gated(id) && !read.plan(id),
    JSON.stringify({
      reading: left,
      gated: read.gated(id),
      lines: read.lines(id),
    })
  );
  // The listing is written once the hub's records are read: given a moment.
  await Bun.sleep(3000);
  const after = await read.nextRequest(id, `after ${harness}'s compaction`);
  check(
    `(h) ${harness}'s next request carries the Open items section`,
    !!after?.body.includes(OPEN_ITEMS),
    after ? after.body.slice(-3000) : "(no request)"
  );
  check(
    `(l) ${harness}'s answer of its own after the compaction lets it file again`,
    !read.gated(id),
    JSON.stringify({ gated: read.gated(id) })
  );
  await read.turn(id, "work again", 60_000);
  const again = await read.filingAfter(id, 1);
  await read.turn(id, "work on", 61_000);
  await Bun.sleep(QUIET_MS);
  check(
    `(l) ${harness}'s next turn of its own work within the room files, once`,
    again?.said.fill?.tokens === 60_000 && read.filings(id).length === 2,
    JSON.stringify(read.lines(id))
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
  await midTurn(kit, fleet, read);
  await haikuPast(kit, fleet, read);
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
