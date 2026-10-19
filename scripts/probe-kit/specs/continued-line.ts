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
 * It delegates nothing, so it runs inside a workspace. limit-stall's
 * `continued` leg (host) proves 1 on a continuation `continue_session`
 * starts for a session held at its account's limit.
 *
 *   bun scripts/probe-kit/run.ts continued-line
 */
import type {
  TranscriptBlock,
  TranscriptPage,
} from "../../../packages/core/src/transcript-types";
import type { Reply } from "../../scratch-fleet";
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

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

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
    (it) => it.blocks.some(isContinuedLine),
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
  await twoChats(kit, fleet);
  await continuedIn(kit, fleet);
};

export default { name: "continued-line", run } satisfies Spec;
