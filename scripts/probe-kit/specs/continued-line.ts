/**
 * Who asked for a continuation decides what it is (hub server.ts
 * `startTarget`, `foldContinued`, `retireContinued`, `inputRefusal`;
 * SessionPane.svelte `.continued`). On a scratch fleet, read from the hub's
 * records, its board and transcript routes, and the page's DOM, never from
 * pixels:
 *
 * 1. Asked by a session (`continue_session`'s route, `askedBy`): one
 *    session. The board lists one row, the continuation, with the old
 *    row's title and start (its place); the old id is a former id of it.
 *    The old id's transcript reads the old turns, then one `continued`
 *    line, then the opening folded under it and the new turns. The old
 *    session's page opens the live one, its composer there. A person's
 *    message to the old id reaches the new session.
 * 2. Asked by the person: two sessions. The board lists both, the old id is
 *    no former id, and the old id's transcript has no `continued` line.
 * 3. A person-continued session whose work item went on (its row names
 *    its continuation, `instances.continued_into`, written as the hub's
 *    `retireContinued` writes it), the continuation titled 60 characters
 *    long: a person's message to it is refused in the words "Continued in
 *    <title>", and the continuation never gets it; at 320px its page has no
 *    composer, only that line, the title a link to the continuation that
 *    ellipsizes inside its own box (DESIGN.md, the Truncate Inside Rule).
 *
 * 4. A session whose stored transcript is over 100 MB (89c82ab3's was
 *    118 MB), continued at a session's ask, answers within the hub's
 *    bound on a machine read: its machine reads the continuation's inputs
 *    where the transcript lives and answers with them alone. It goes on as
 *    one session, whose transcript reads.
 *
 * 5. A session with a command running in the background, continued at a
 *    session's ask: ending its process would lose that command, so the
 *    continue answers at once that it waits (what for, until when at the
 *    latest), and the job goes on by itself once the command has ended.
 *
 * It delegates nothing, so it runs inside a workspace. limit-stall's
 * `continued` leg (host) proves 1 on a continuation `continue_session`
 * starts for a session held at its account's limit.
 *
 *   bun scripts/probe-kit/run.ts continued-line
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranscriptBlock,
  TranscriptPage,
} from "../../../packages/core/src/transcript-types";
import type { Reply, Seen } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

/** The continuation's title in 3: 60 characters, longer than 320px holds. */
const TITLE = "Continue the payment retry work through the settlement queue";
/** The person's message to the continued session's id in 3. */
const TYPED = "PROBE-TYPED-to-the-continued-session";
/** The one-session leg's session, and its first and later words from the person. */
const ONE_TITLE = "PROBE-one-chat source";
const ONE_TURN = "PROBE-ONE-old-turn";
const ONE_AFTER = "PROBE-ONE-sent-to-the-old-id";
/** The person-asked leg's session, and its words. */
const TWO_TITLE = "PROBE-two-chats source";
const TWO_TURN = "PROBE-TWO-old-turn";
const TWO_AFTER = "PROBE-TWO-sent-to-the-old-id";
const WIDTH = 320;
/** The big-transcript leg's session, its words, and how big its stored transcript is made. */
const BIG_TITLE = "PROBE-big-transcript source";
const BIG_TURN = "PROBE-BIG-old-turn";
const BIG_BYTES = 110 * 1024 * 1024;
/** One filler command's output: a real transcript's records run to a few kilobytes each, tens of thousands of them. */
const OUTPUT_CHARS = 2000;
/** The hub's bound on a read through a machine (server.ts `READ_TIMEOUT_MS`). */
const READ_BOUND_MS = 10_000;

/** The work-in-flight leg's session's first words, and how long its background command runs. */
const BG_TURN = "PROBE-BG-old-turn";
const BG_SECONDS = 45;
/** When the work-in-flight leg's background command was started; 0 until then. */
let bgStarted = 0;

/**
 * Every session answers "ok"; the work-in-flight leg's, asked its first
 * words, starts a command in the background first, as a long build does.
 */
const respond = (request: Seen): Reply => {
  if (request.all.includes(BG_TURN) && !request.afterTool && !bgStarted) {
    bgStarted = Date.now();
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `sleep ${BG_SECONDS} && echo PROBE-BG-done`,
          description: "A long command in the background",
          run_in_background: true,
        },
      },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** A send's record, by words it carries. */
const sendOf = (fleet: KitFleet, words: string) =>
  fleet.query<{ instance_id: string; reason: string | null; state: string }>(
    "SELECT instance_id, state, reason FROM sent_messages WHERE body LIKE ?",
    `%${words}%`
  );

/** A person's message, once its session has read it. */
const said = async (fleet: KitFleet, id: string, words: string) => {
  await fleet.send(id, `${words}: from the person`);
  return until(
    `"${words}" read`,
    () => sendOf(fleet, words),
    (rows) => rows.some((one) => one.state !== "pending"),
    60_000
  ).catch(() => sendOf(fleet, words));
};

/** A continuation asked of the hub's continue route, settled: its new session's id. */
const continued = async (
  fleet: KitFleet,
  id: string,
  askedBy?: string
): Promise<{ stage: string | undefined; to: string }> => {
  const { targetInstanceId: to } = await fleet.api<{
    targetInstanceId: string;
  }>(`/api/instances/${id}/continue`, {
    target: {
      harness: "claude",
      model: "claude-haiku-4-5",
      permissionMode: "bypassPermissions",
    },
    asksOnly: true,
    ...(askedBy ? { askedBy } : {}),
  });
  const stage = () =>
    fleet.query<{ stage: string }>(
      "SELECT stage FROM continuations WHERE target_instance_id = ?",
      to
    )[0]?.stage;
  const settled = await until(
    "the continuation settled",
    stage,
    (now) => now === "started" || now === "failed",
    180_000
  ).catch(stage);
  return { stage: settled, to };
};

/** What the board lists of these ids: the rows the sidebar draws. */
const listed = async (fleet: KitFleet, ids: string[]) =>
  (
    await fleet.api<{ createdAt: string; id: string; title: string | null }[]>(
      "/api/instances"
    )
  ).filter((row) => ids.includes(row.id));

/** The newest page of a session's transcript, by the id it is asked by. */
const transcriptOf = (fleet: KitFleet, id: string) =>
  fleet.api<TranscriptPage>(`/api/instances/${id}/transcript?limit=200`);

/** Where in a page's blocks something stands; -1 when nowhere. */
const at = (
  blocks: TranscriptBlock[],
  test: (one: TranscriptBlock) => boolean
) => blocks.findIndex(test);

const isContinuedLine = (one: TranscriptBlock) =>
  one.type === "system.account_move" &&
  one.metadata?.accountMove?.kind === "continued";

/** 1: asked by a session, one session. */
const oneChat = async (kit: Kit, fleet: KitFleet, lead: string) => {
  const old = await fleet.spawn("claude", ONE_TITLE, fleet.repo);
  await said(fleet, old, ONE_TURN);
  const [was] = fleet.query<{ created_at: number; title: string | null }>(
    "SELECT created_at, title FROM instances WHERE id = ?",
    old
  );
  const { stage, to } = await continued(fleet, old, lead);
  kit.check(
    "1: a continuation a session asks for starts",
    stage === "started",
    `stage ${stage}`
  );
  const rows = await until(
    "1: the board settles on one row",
    () => listed(fleet, [old, to]),
    (them) => them.length === 1,
    30_000
  ).catch(() => listed(fleet, [old, to]));
  const [now] = fleet.query<{ created_at: number; title: string | null }>(
    "SELECT created_at, title FROM instances WHERE id = ?",
    to
  );
  const alias = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM instance_aliases WHERE id = ?",
    old
  )[0]?.instance_id;
  kit.check(
    "1: the board lists one row, the continuation, in the old row's place and title, and the old id is a former id of it",
    rows.length === 1 &&
      rows[0]?.id === to &&
      now?.title === was?.title &&
      now?.created_at === was?.created_at &&
      alias === to,
    JSON.stringify({ rows, was, now, alias: alias ?? null })
  );
  const page = await until(
    "1: the old id's transcript reads one conversation",
    () => transcriptOf(fleet, old),
    // The line, then the new session's first answer after its opening.
    (it) => {
      const opened = it.blocks.findIndex(
        (one) => one.metadata?.continuation === true
      );
      return (
        it.blocks.some(isContinuedLine) &&
        opened >= 0 &&
        it.blocks.some(
          (one, index) => index > opened && one.type.startsWith("assistant")
        )
      );
    },
    60_000
  ).catch(() => transcriptOf(fleet, old));
  const { blocks } = page;
  const turn = at(blocks, (one) => one.content.includes(ONE_TURN));
  const lines = blocks.filter(isContinuedLine);
  const line = at(blocks, isContinuedLine);
  const opening = at(blocks, (one) => one.metadata?.continuation === true);
  const reply = blocks.findIndex(
    (one, index) => index > opening && one.type.startsWith("assistant")
  );
  kit.check(
    "1: its transcript reads the old turns, then one continued line, then the opening folded under it and the new turns",
    turn >= 0 &&
      lines.length === 1 &&
      line > turn &&
      opening === line + 1 &&
      reply > opening,
    JSON.stringify({
      turn,
      line,
      opening,
      reply,
      lines: lines.length,
      words: lines[0]?.content ?? null,
      types: blocks.map((one) => one.type),
    })
  );

  const base = await fleet.dashboard();
  const tab = await kit.page("desk");
  await open(tab, `${base}/session/${old}`, '[data-slot="pane"]');
  const read = () =>
    tab.evaluate(() => ({
      path: location.pathname,
      composers: document.querySelectorAll('[data-slot="composer"]').length,
      continuedIn: document.querySelectorAll(".readonly.continued").length,
      line:
        [...document.querySelectorAll('[data-slot="words"]')]
          .map((one) => one.textContent ?? "")
          .find((words) => words.includes("from the person's messages")) ??
        null,
    }));
  const shown = await until(
    "1: the old page opens the live session",
    read,
    (it) => it.path === `/session/${to}` && it.composers > 0 && !!it.line,
    60_000
  ).catch(read);
  kit.check(
    "1: the old session's URL opens the live session, its composer there and the continued line in its transcript",
    shown.path === `/session/${to}` &&
      shown.composers > 0 &&
      shown.continuedIn === 0 &&
      !!shown.line,
    JSON.stringify(shown)
  );

  const sent = await said(fleet, old, ONE_AFTER);
  kit.check(
    "1: a person's message to the old id reaches the new session",
    sent.length === 1 &&
      sent[0]?.instance_id === to &&
      sent[0]?.state === "read",
    JSON.stringify(sent)
  );
};

/** 2: asked by the person, two sessions. */
const twoChats = async (kit: Kit, fleet: KitFleet) => {
  const old = await fleet.spawn("claude", TWO_TITLE, fleet.repo);
  await said(fleet, old, TWO_TURN);
  const { stage, to } = await continued(fleet, old);
  const rows = await listed(fleet, [old, to]);
  const alias = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM instance_aliases WHERE id = ?",
    old
  );
  const { blocks } = await transcriptOf(fleet, old);
  kit.check(
    "2: the person's own continuation is a session of its own: both rows listed, the old id no former id, and no continued line in the old transcript",
    stage === "started" &&
      rows.length === 2 &&
      alias.length === 0 &&
      !blocks.some(isContinuedLine) &&
      blocks.some((one) => one.content.includes(TWO_TURN)),
    JSON.stringify({ stage, rows: rows.map((one) => one.id), alias })
  );
  const sent = await said(fleet, old, TWO_AFTER);
  kit.check(
    "2: a person's message to the old id stays the old session's",
    sent.length === 1 && sent[0]?.instance_id === old,
    JSON.stringify(sent)
  );
};

/** 3: a person-continued session whose item went on. */
const continuedIn = async (kit: Kit, fleet: KitFleet) => {
  const old = await fleet.spawn("claude", "Continued source", fleet.repo);
  const next = await fleet.spawn("claude", TITLE, fleet.repo);
  kit.check(
    "3: the continuation's title is 60 characters",
    TITLE.length === 60,
    `${TITLE.length}`
  );
  fleet.write(
    "UPDATE instances SET continued_into = ? WHERE id = ?",
    next,
    old
  );
  const words = `Continued in ${TITLE}`;

  await fleet.send(old, `${TYPED}: typed on its page`);
  const typed = await until(
    "3: the person's send settled",
    () => sendOf(fleet, TYPED),
    (rows) => rows.some((one) => one.state !== "pending"),
    20_000
  ).catch(() => sendOf(fleet, TYPED));
  kit.check(
    `3: a person's send to the continued session is refused with "${words}", and the continuation never gets it`,
    typed.length === 1 &&
      typed[0]?.instance_id === old &&
      typed[0]?.state === "failed" &&
      typed[0]?.reason === words,
    JSON.stringify(typed)
  );

  const base = await fleet.dashboard();
  const page = await kit.page("phone");
  await page.setViewportSize({ width: WIDTH, height: 700 });
  await open(page, `${base}/session/${old}`, '[data-slot="pane"]');
  const read = () =>
    page.evaluate((to) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `a[href="/session/${to}"]`
      );
      const line = link?.closest("p");
      const lead = line?.querySelector(":scope > span");
      const title = link?.querySelector("span");
      const box = (el: Element | null | undefined) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          height: Math.round(r.height),
        };
      };
      return {
        viewport: window.innerWidth,
        pageScroll: document.documentElement.scrollWidth,
        composers: document.querySelectorAll('[data-slot="composer"]').length,
        words: line?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        line: box(line),
        lead: box(lead),
        link: box(link),
        title: title
          ? {
              shown: title.clientWidth,
              whole: title.scrollWidth,
              textOverflow: getComputedStyle(title).textOverflow,
            }
          : null,
        linkColor: link ? getComputedStyle(link).color : null,
      };
    }, next);
  const shown = await until(
    "3: the continued line on the old page",
    read,
    // Its title, not its id: the line as it settles, whatever drew first.
    (now) => !!now.words?.includes(TITLE),
    60_000
  ).catch(read);
  kit.note(`320px reading: ${JSON.stringify(shown)}`);
  const { line, lead, link, title } = shown;
  kit.check(
    "3: the continued session's page has no composer, only the line, its title a link to the continuation",
    shown.composers === 0 &&
      shown.words?.replace(/\s/g, "") === words.replace(/\s/g, ""),
    JSON.stringify({ composers: shown.composers, words: shown.words })
  );
  kit.check(
    `3: at ${WIDTH}px the line fits, on one line, and the title ellipsizes inside its own link`,
    !!(line && lead && link && title) &&
      shown.pageScroll <= WIDTH &&
      line.left >= 0 &&
      line.right <= WIDTH &&
      Math.abs(lead.top - link.top) <= 2 &&
      link.left >= lead.right &&
      link.right <= line.right &&
      title.whole > title.shown &&
      title.textOverflow === "ellipsis",
    JSON.stringify({
      pageScroll: shown.pageScroll,
      line,
      lead,
      link,
      title,
    })
  );
};

/** A session's stored Claude transcript under the fleet's home, by its session key. */
const transcriptFile = async (
  fleet: KitFleet,
  sessionId: string
): Promise<string | undefined> => {
  const found = (await readdir(fleet.home, { recursive: true })).find(
    (path) =>
      path.endsWith(`/${sessionId}.jsonl`) && !path.includes("/subagents/")
  );
  return found ? join(fleet.home, found) : undefined;
};

/**
 * Makes a stored transcript `BIG_BYTES` or more, as a long session's is:
 * command after command, each with a long output, ahead of its own first
 * turn and chained to it, so its live conversation holds them all.
 */
const inflate = async (file: string): Promise<number> => {
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
  const records = lines.map(
    (line) => JSON.parse(line) as Record<string, unknown>
  );
  const root = records.findIndex(
    (one) =>
      (one.type === "user" || one.type === "assistant") &&
      one.parentUuid === null
  );
  const first = records[root];
  if (!first) {
    throw new Error(`${file} has no conversation to grow`);
  }
  const shared = {
    isSidechain: false,
    userType: "external",
    cwd: first.cwd,
    sessionId: first.sessionId,
    version: first.version,
  };
  const output = "x".repeat(OUTPUT_CHARS);
  const filler: string[] = [];
  let parent: string | null = null;
  let size = 0;
  for (let n = 0; size < BIG_BYTES; n += 1) {
    const call = crypto.randomUUID();
    const asking = crypto.randomUUID();
    const answered = crypto.randomUUID();
    const when = new Date(
      Date.parse(String(first.timestamp)) - 1000
    ).toISOString();
    for (const record of [
      {
        ...shared,
        parentUuid: parent,
        type: "assistant",
        uuid: asking,
        timestamp: when,
        message: {
          id: `msg_${asking}`,
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [
            {
              type: "tool_use",
              id: `toolu_${call}`,
              name: "Bash",
              input: { command: `PROBE-BIG-command-${n}` },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
      {
        ...shared,
        parentUuid: asking,
        type: "user",
        uuid: answered,
        timestamp: when,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: `toolu_${call}`,
              content: output,
            },
          ],
        },
      },
    ]) {
      const line = JSON.stringify(record);
      filler.push(line);
      size += line.length + 1;
    }
    parent = answered;
  }
  records[root] = { ...first, parentUuid: parent };
  await writeFile(
    file,
    `${[...lines.slice(0, root), ...filler, ...records.slice(root).map((one) => JSON.stringify(one))].join("\n")}\n`
  );
  return (await stat(file)).size;
};

/** 4: a session whose stored transcript is over 100 MB, continued. */
const bigTranscript = async (kit: Kit, fleet: KitFleet, lead: string) => {
  const old = await fleet.spawn("claude", BIG_TITLE, fleet.repo);
  await said(fleet, old, BIG_TURN);
  const [row] = fleet.query<{ session_id: string | null }>(
    "SELECT session_id FROM instances WHERE id = ?",
    old
  );
  const file = row?.session_id
    ? await transcriptFile(fleet, row.session_id)
    : undefined;
  if (!file) {
    kit.check(
      "4: the big source's stored transcript is found",
      false,
      `session ${row?.session_id ?? "unknown"} has no transcript under ${fleet.home}`
    );
    return;
  }
  const bytes = await inflate(file);
  const asked = Date.now();
  const answer = await fleet
    .api<{ targetInstanceId: string }>(`/api/instances/${old}/continue`, {
      target: {
        harness: "claude",
        model: "claude-haiku-4-5",
        permissionMode: "bypassPermissions",
      },
      asksOnly: true,
      askedBy: lead,
    })
    .then(
      (value) => ({ to: value.targetInstanceId }),
      (error: unknown) => ({ error: String(error) })
    );
  const took = Date.now() - asked;
  const lines = (await fleet.logs("agent").catch(() => ""))
    .split("\n")
    .filter((line) => line.includes("[catalog]"))
    .slice(-4);
  kit.note(`4: the agent's catalog lines: ${JSON.stringify(lines)}`);
  kit.check(
    `4: continuing a session whose stored transcript is over 100 MB answers within the hub's ${READ_BOUND_MS / 1000} s bound`,
    bytes > 100 * 1024 * 1024 && "to" in answer && took < READ_BOUND_MS,
    JSON.stringify({ bytes, took, answer })
  );
  if (!("to" in answer)) {
    return;
  }
  const stage = () =>
    fleet.query<{ stage: string }>(
      "SELECT stage FROM continuations WHERE target_instance_id = ?",
      answer.to
    )[0]?.stage;
  const settled = await until(
    "4: the big continuation settled",
    stage,
    (now) => now === "started" || now === "failed",
    180_000
  ).catch(stage);
  const reading = Date.now();
  const page = await fleet
    .api<TranscriptPage>(`/api/instances/${answer.to}/transcript?limit=50`)
    .then(
      (value) => ({ blocks: value.blocks.length }),
      (error: unknown) => ({ error: String(error) })
    );
  const loads = (await fleet.logs("hub").catch(() => ""))
    .split("\n")
    .filter((line) => line.includes("[transcripts]"))
    .slice(-4);
  kit.note(`4: the hub's transcript loads: ${JSON.stringify(loads)}`);
  kit.check(
    "4: it goes on as one session, and that session's transcript, its 100 MB conversation before the line, reads",
    settled === "started" && "blocks" in page,
    JSON.stringify({ stage: settled, page, readIn: Date.now() - reading })
  );
};

/**
 * 5: a session with a command running in the background, continued at a
 * session's ask: ending its process would lose that command, so the
 * continue answers at once that it waits, for what and how long, and the
 * job goes on by itself once the command ends.
 */
const workInFlight = async (kit: Kit, fleet: KitFleet, lead: string) => {
  const old = await fleet.spawn("claude", "PROBE-busy source", fleet.repo);
  await fleet.send(old, `${BG_TURN}: start the build`);
  // Its turn has ended, the command still running.
  await until(
    "5: the command started and its turn ended",
    () =>
      bgStarted > 0 &&
      fleet.seen.some(
        (one) =>
          one.afterTool && one.all.includes(BG_TURN) && one.at > bgStarted
      ),
    Boolean,
    60_000
  ).catch(() => false);
  await Bun.sleep(2000);
  const asked = Date.now();
  const answer = await fleet
    .api<{
      targetInstanceId: string;
      waiting?: { since: number | null; until: number; why: string };
    }>(`/api/instances/${old}/continue`, {
      target: {
        harness: "claude",
        model: "claude-haiku-4-5",
        permissionMode: "bypassPermissions",
      },
      asksOnly: true,
      askedBy: lead,
    })
    .then(
      (value) => value,
      (error: unknown) => ({ error: String(error) })
    );
  const took = Date.now() - asked;
  kit.check(
    `5: continuing a session with a command running in the background answers within ${READ_BOUND_MS / 1000} s that it waits for that work`,
    "targetInstanceId" in answer &&
      took < READ_BOUND_MS &&
      !!answer.waiting?.why.includes("1 command running") &&
      answer.waiting.until > Date.now(),
    JSON.stringify({ took, answer })
  );
  if (!("targetInstanceId" in answer)) {
    return;
  }
  const stage = () =>
    fleet.query<{ stage: string }>(
      "SELECT stage FROM continuations WHERE target_instance_id = ?",
      answer.targetInstanceId
    )[0]?.stage;
  const left = await until(
    "5: the job leaves its wait",
    () => (stage() === "waiting" ? undefined : Date.now()),
    Boolean,
    (BG_SECONDS + 120) * 1000
  ).catch(() => undefined);
  const settled = await until(
    "5: the job settles",
    stage,
    (now) => now === "started" || now === "failed",
    180_000
  ).catch(stage);
  const ended = bgStarted + BG_SECONDS * 1000;
  kit.check(
    "5: it goes on by itself once the command has ended, never before, and starts the new session",
    !!left && left >= ended && settled === "started",
    JSON.stringify({
      leftWaitAfterTheCommandEnded: left ? left - ended : null,
      stage: settled,
    })
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // The session that asks for the one-session continuation, as an
  // orchestrator's continue_session does.
  const lead = await fleet.spawn("claude", "PROBE-orchestrator", fleet.repo);
  await oneChat(kit, fleet, lead);
  await bigTranscript(kit, fleet, lead);
  await workInFlight(kit, fleet, lead);
  await twoChats(kit, fleet);
  await continuedIn(kit, fleet);
};

export default { name: "continued-line", run } satisfies Spec;
