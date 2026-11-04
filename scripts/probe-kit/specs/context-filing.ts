/**
 * A session files its open items once its context reaches its compaction
 * policy's `fileAtPct` of its model's window, and every harness lists them
 * after each of its compactions (hub at-limit.ts `fileDue`, server.ts
 * `fileAtThreshold` and `observeCompaction`, open-items.ts).
 *
 * First the rule itself, pure (at-limit.ts `fileDue`): below, at, above the
 * threshold, a reading over the window capped at it, an unknown window, no
 * reading and a policy of 0. And the filing turn's words: its opening fact
 * and closing clause around the proven body (open-items.ts `filingPrompt`).
 *
 * Then on a scratch fleet (real hub, agent and sessiond; Claude Code, pi and
 * OpenCode against the mock model), the policy's threshold set to 50% so
 * every reading stays under Claude Code's own auto-compact point. The mock
 * reports a turn's context as the turn asks (`[[reading N]]` in its words).
 * On a Claude session:
 * - (a) a turn at 40% of the window files nothing;
 * - (b) a turn at exactly 50% files: the rise is kept, its line says
 *   filing, the hub's filing turn opens on the share and the window and
 *   closes on the harness compacting later, and its line then says filed;
 * - (c) a turn at 60% in the same rise files nothing more;
 * - (d) the session's `/compact` re-arms it: the rise goes, a line says the
 *   compaction came after a filing, and the next request carries the Open
 *   items section (the agent's SessionStart hook on `compact`);
 * - (e) re-armed, a turn at 55% files again.
 *
 * On a second Claude session, (f) a move's compaction whose filing turn
 * ends at 60% sends no filing at the threshold beside it, and its own
 * `/compact` writes no line of the threshold's.
 *
 * On a pi session and an OpenCode session, (g) a `/compact` is followed by
 * the Open items section in the session's next request: pi on its
 * `compaction_end`, OpenCode through CawCo's plugin on its
 * `session.compaction.ended`.
 *
 * Last, (h) Configure's Claude routing shows the threshold the policy holds
 * beside its other values, inside the page at 1440 and at 390, and a new
 * one typed there and saved is the policy's.
 *
 *   bun scripts/probe-kit/run.ts context-filing
 */
import { DEFAULT_AT_LIMIT } from "../../../packages/core/src/accounts";
import { COMPACTION_ORIGIN } from "../../../packages/core/src/harness";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { contextWords } from "../../../packages/core/src/words/context";
import { fileDue } from "../../../packages/hub/src/at-limit";
import { filingPrompt } from "../../../packages/hub/src/open-items";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The threshold the fleet's policy is set to: every reading stays under Claude Code's own auto-compact point (167K of a 200K window). */
const FILE_AT = 50;
const READING = /\[\[reading (\d+)\]\]/u;
/** The heading every Open items section opens with (open-items.ts). */
const OPEN_ITEMS = "## Open items (this session's records, word for word)";
/** How long a turn's end is given to start a filing that must not come. */
const QUIET_MS = 5000;
/** The proven body's first words (open-items.ts `filingPrompt`). */
const BODY =
  "Before this conversation is compacted, file everything still open";

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

/** (0) The rule, pure, and the filing turn's words. */
const rule = (kit: Kit) => {
  const { check } = kit;
  const window = 200_000;
  const due = (reported: number | null) =>
    fileDue({ fileAtPct: 85, reported, window });
  check("fileDue: 84% of the window files nothing", !due(168_000));
  check("fileDue: exactly 85% files", due(170_000));
  check("fileDue: 90% files", due(180_000));
  check(
    "fileDue: a reading over its window, capped at it, files",
    due(250_000)
  );
  check(
    "fileDue: an unknown window files nothing, however full",
    !fileDue({ fileAtPct: 85, reported: 199_000, window: undefined })
  );
  check("fileDue: no reading files nothing", !due(null));
  check(
    "fileDue: a policy of 0 files nothing",
    !fileDue({ fileAtPct: 0, reported: window, window })
  );
  const plain = filingPrompt("compacted");
  const full = filingPrompt("compacted", { tokens: 172_000, window });
  check(
    "filingPrompt: the threshold's turn opens on the share and the window, closes on the harness compacting later, the proven body between",
    full.startsWith(contextWords.filingFact(86, window)) &&
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

const run = async (kit: Kit) => {
  const { check } = kit;
  rule(kit);

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const lines = (id: string) =>
    fleet
      .query<Line>(
        "SELECT id, content FROM session_lines WHERE instance_id = ? AND kind = 'context' ORDER BY rowid",
        id
      )
      .map((line) => ({ id: line.id, said: JSON.parse(line.content) }));
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
      `"${text}" answered`,
      () => fleet.seen.slice(asked).find((one) => one.last.includes(text)),
      Boolean,
      120_000
    );
    await until(
      `"${text}"'s turn ended`,
      () =>
        fleet.query<{ turn_open_at: number | null; context_tokens: number }>(
          "SELECT turn_open_at, context_tokens FROM instances WHERE id = ?",
          id
        )[0],
      // A reading at the threshold is followed by its filing turn at once,
      // whose own reading takes its place.
      (row) =>
        row?.turn_open_at === null &&
        (reading === undefined ||
          row.context_tokens === reading ||
          rise(id) !== undefined),
      120_000
    );
  };
  /** The next request the mock gets for `id`'s words after `asked`, whole. */
  const nextRequest = async (id: string, words: string) => {
    const asked = fleet.seen.length;
    await turn(id, words);
    return fleet.seen.slice(asked).find((one) => one.last.includes(words));
  };

  // The threshold at 50% for Claude.
  fleet.write(
    "INSERT INTO account_routing (provider, yours_strategy, delegates_strategy, at_limit) VALUES ('anthropic', 'fill-first', 'fill-first', ?) ON CONFLICT(provider) DO UPDATE SET at_limit = excluded.at_limit",
    JSON.stringify({
      ...DEFAULT_AT_LIMIT,
      compaction: { ...DEFAULT_AT_LIMIT.compaction, fileAtPct: FILE_AT },
    })
  );

  const claude = await fleet.spawn("claude", "Filing");
  await turn(claude, "hello");
  const window = await until(
    "Claude's window for the session's model, as its result reported it",
    () =>
      fleet.query<{ context_window: number }>(
        "SELECT w.context_window FROM claude_context_windows w JOIN instances i ON i.model = w.model WHERE i.id = ?",
        claude
      )[0]?.context_window,
    (found) => typeof found === "number" && found > 0,
    30_000
  ).catch((error: unknown) => {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}: the windows kept are ${JSON.stringify(fleet.query("SELECT model, context_window FROM claude_context_windows"))}, the session's model ${JSON.stringify(fleet.query("SELECT model FROM instances WHERE id = ?", claude))}`
    );
  });
  kit.note(`${MODEL.claude}'s window: ${window} tokens`);
  const share = (pct: number) => Math.round((window * pct) / 100);

  // (a) Below.
  await turn(claude, "below", share(40));
  await Bun.sleep(QUIET_MS);
  check(
    "(a) a turn at 40% of the window files nothing",
    !rise(claude) && filings(claude).length === 0 && !plan(claude),
    JSON.stringify({ rise: rise(claude), lines: lines(claude) })
  );

  // (b) At.
  await turn(claude, "at", share(FILE_AT));
  const started = await until(
    "(b) a filing at the threshold",
    () => filings(claude)[0],
    Boolean,
    60_000
  ).catch(() => undefined);
  const [sent] = filingSends(claude);
  const prompt = sent
    ? String(JSON.parse(sent.body).message.content)
    : "(none sent)";
  check(
    "(b) a turn at exactly 50% files: its rise is kept, under its filing's line",
    !!started && rise(claude)?.line_id === started.id,
    JSON.stringify({ rise: rise(claude), lines: lines(claude) })
  );
  check(
    "(b) the filing turn opens on the share and the window, closes on the harness compacting later, the proven body between",
    prompt.startsWith(contextWords.filingFact(FILE_AT, window)) &&
      prompt.includes(BODY) &&
      prompt.endsWith(contextWords.filingLater),
    prompt
  );
  const filed = await until(
    "(b) its filing ended",
    () => filings(claude)[0]?.said.stage,
    (stage) => stage === "filed",
    120_000
  ).catch(() => filings(claude)[0]?.said.stage);
  check(
    "(b) its line says filed once its turn ended, and its plan is gone",
    filed === "filed" && !plan(claude),
    JSON.stringify({ lines: lines(claude), plan: plan(claude) })
  );

  // (c) Above, the same rise.
  await turn(claude, "above", share(60));
  await Bun.sleep(QUIET_MS);
  check(
    "(c) a turn at 60% in the same rise files nothing more",
    filings(claude).length === 1 && filingSends(claude).length === 1,
    JSON.stringify({ lines: lines(claude) })
  );

  // (d) A compaction re-arms it, and the open items come back.
  await fleet.send(claude, "/compact");
  const compacted = await until(
    "(d) the compaction's line",
    () => lines(claude).find((line) => line.said.kind === "compacted"),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    "(d) the session's /compact re-arms it: its rise is gone, and its line says a filing came first",
    !!compacted && compacted.said.filed === "filed" && !rise(claude),
    JSON.stringify({ lines: lines(claude), rise: rise(claude) })
  );
  await until(
    "Claude running again after its /compact",
    () => fleet.instance(claude)?.status,
    (status) => status === "running",
    120_000
  );
  const afterClaude = await nextRequest(claude, "after the compaction");
  check(
    "(d) Claude Code's next request carries the Open items section (the agent's SessionStart hook on compact)",
    !!afterClaude?.body.includes(OPEN_ITEMS),
    afterClaude ? afterClaude.body.slice(0, 2000) : "(no request)"
  );

  // (e) Re-armed.
  await turn(claude, "again", share(55));
  const second = await until(
    "(e) a second filing",
    () => filings(claude)[1],
    Boolean,
    60_000
  ).catch(() => undefined);
  check(
    "(e) re-armed, a turn at 55% files again",
    !!second && rise(claude)?.line_id === second.id,
    JSON.stringify({ lines: lines(claude) })
  );

  await moveCompaction(kit, fleet, share, { lines, plan, rise, filings });
  for (const harness of ["pi", "opencode"] as const) {
    await listedAfter(kit, fleet, harness, { lines, nextRequest, turn });
  }
  await configured(kit, fleet);
};

/** (h) The threshold on Configure's Claude routing, which a provider has from its second account on. */
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
    )?.compaction?.fileAtPct;
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    await page.goto(
      `${await fleet.dashboard()}/config/accounts/anthropic/routing`
    );
    const field = page.getByLabel(accountsWords.atLimit.fileAt, {
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
    const expected = String(view === "desk" ? FILE_AT : 70);
    kit.check(
      `(h) at ${view}, Configure's Claude routing shows the policy's threshold, ${expected}%, its row inside the page`,
      shown === expected && fits,
      JSON.stringify({ shown, fits })
    );
    if (view === "desk") {
      await field.fill("70");
      await page
        .getByRole("button", { name: accountsWords.routingEditor.save })
        .click();
      const saved = await until(
        "(h) the threshold saved",
        policy,
        (value) => value === 70,
        30_000
      ).catch(policy);
      kit.check(
        "(h) a threshold typed there and saved is the policy's",
        saved === 70,
        JSON.stringify({ saved })
      );
    }
    await page.close();
  }
};

/** (f) A move's compaction: no filing at the threshold beside it. */
const moveCompaction = async (
  kit: Kit,
  fleet: KitFleet,
  share: (pct: number) => number,
  read: {
    filings: (id: string) => unknown[];
    lines: (id: string) => { said: { kind: string } }[];
    plan: (id: string) => { stage: string } | undefined;
    rise: (id: string) => unknown;
  }
) => {
  const { check } = kit;
  const id = await fleet.spawn("claude", "Moving");
  const filingUuid = crypto.randomUUID();
  const compactUuid = crypto.randomUUID();
  const move = {
    kind: "moved",
    from: { id: ACCOUNT, name: "Probe", hue: "blue" },
    to: { id: "acct-context-b", name: "B", hue: "green" },
    sameOrganization: false,
    tokens: share(60),
    window: null,
    resetsAt: null,
    compact: "filing",
  };
  fleet.write(
    "INSERT INTO limit_compactions (instance_id, stage, line_id, move, fill, carry_uuid, filing_uuid, compact_uuid, compacted, ended_step, created_at) VALUES (?, 'filing', ?, ?, NULL, NULL, ?, ?, 0, NULL, ?)",
    id,
    `probe-move-${id}`,
    JSON.stringify(move),
    filingUuid,
    compactUuid,
    Date.now()
  );
  // The move's filing turn, sent as its step, ends at 60%.
  const words = `the move's filing turn [[reading ${share(60)}]]`;
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: id,
    payload: {
      instanceId: id,
      message: {
        type: "user",
        uuid: filingUuid,
        message: { role: "user", content: words },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });
  const ended = await until(
    "(f) the move's compaction ended",
    () => read.plan(id) ?? "ended",
    (stage) => stage === "ended",
    240_000
  ).catch(() => read.plan(id));
  const compactSent = fleet.sendRow(compactUuid);
  check(
    "(f) a move's compaction whose filing turn ended at 60% went on to its own /compact and ended",
    ended === "ended" && !!compactSent,
    JSON.stringify({ plan: read.plan(id), compact: compactSent })
  );
  check(
    "(f) no filing at the threshold beside it, nor a line of the threshold's for its /compact",
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

/** (g) After a pi or OpenCode compaction, the open items come back. */
const listedAfter = async (
  kit: Kit,
  fleet: KitFleet,
  harness: "pi" | "opencode",
  read: {
    lines: (id: string) => { said: { harness?: string; kind: string } }[];
    nextRequest: (id: string, words: string) => Promise<Seen | undefined>;
    turn: (id: string, words: string, reading?: number) => Promise<void>;
  }
) => {
  const { check } = kit;
  const id = await fleet.spawn(harness, `Listing ${harness}`);
  await read.turn(id, "hello");
  await read.turn(id, `read this ${LONG_TEXT}`);
  await fleet.send(id, "/compact");
  const compacted = await until(
    `(g) ${harness}'s compaction line`,
    () => read.lines(id).find((line) => line.said.kind === "compacted"),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    `(g) ${harness}'s /compact is said in a line, its harness named`,
    compacted?.said.harness === harness,
    JSON.stringify(read.lines(id))
  );
  // OpenCode's manual compaction ends no turn of the hub's (no result frame
  // follows its `session.compaction.ended`): its next send is taken up all
  // the same, so only pi's is waited out.
  await until(
    `${harness} at rest after its compaction`,
    () =>
      fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      )[0],
    (row) => harness === "opencode" || row?.turn_open_at === null,
    120_000
  );
  // The listing is written once the hub's records are read: given a moment.
  await Bun.sleep(3000);
  const after = await read.nextRequest(id, `after ${harness}'s compaction`);
  check(
    `(g) ${harness}'s next request carries the Open items section`,
    !!after?.body.includes(OPEN_ITEMS),
    after ? after.body.slice(-3000) : "(no request)"
  );
};

export default {
  group: "The hub and machines",
  name: "context-filing",
  run,
} satisfies Spec;
