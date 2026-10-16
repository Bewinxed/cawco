/**
 * `?at=<docId>` opens a conversation scrolled to that record, centred and
 * marked, however far back it is; an id the conversation does not hold opens
 * at the latest row and says so (Transcript.svelte, open-at.svelte.ts). A
 * scratch fleet: a Claude session of 12 turns (a send, 12 Bash calls and a
 * reply each, ~300 records against a 60-record newest page) and a project
 * thread of long messages, the built dashboard against its hub, on the desk.
 * Read from the engine: the history requests, the marked row's attribute and
 * box against the scroller's, the scroll offsets.
 *
 *  - a session opened at turn 3's message, which the newest page does not
 *    hold: older pages are read (`?before=`), and the row holding it is
 *    marked, in the room above the composer's foot, centred within 2px;
 *  - a reply arriving at the tail meanwhile moves neither the view nor the
 *    row, and the mark stays; the reader's wheel lets the mark go;
 *  - a session opened at an id it does not hold: at its latest row, nothing
 *    marked, "That moment isn't in this session any more.";
 *  - a thread, already open at its latest, sent to its second message by an
 *    in-app link: marked and centred; to an id it does not hold: said, with
 *    "thread";
 *  - no page or console error.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { open, type Spec, settle } from "../../kit";

const SCROLLER = '[aria-label="Session transcript"]';
const MARKED = `${SCROLLER} [data-row][data-marked="on"]`;
const GONE = `${SCROLLER} [data-open-at="gone"]`;
const TURNS = 12;
const CALLS = 12;
/** The turn whose message the session is opened at: far enough back to need older pages, with rows either side. */
const SOUGHT_TURN = 3;
const NOTES = 6;
/** The thread message opened at: the second of yours, with rows either side. */
const SOUGHT_NOTE = 2;

interface Block {
  id: string;
  sdkUuid?: string;
  type: string;
}
interface PageRead {
  blocks: Block[];
  cursor: string | null;
  tail?: { busy?: boolean };
}

/** The marked row against its scroller, or null while none is marked. */
const markedBox = () => {
  const row = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"] [data-row][data-marked]'
  );
  const scroller = row?.closest<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  if (!(row && scroller)) {
    return null;
  }
  const view = scroller.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  const foot = scroller.querySelector(":scope > .foot");
  const tint = getComputedStyle(row, "::before");
  const swatch = document.createElement("div");
  swatch.style.background = "var(--selection)";
  scroller.append(swatch);
  const selection = getComputedStyle(swatch).backgroundColor;
  swatch.remove();
  return {
    state: row.dataset.marked ?? "",
    text: row.textContent ?? "",
    top: box.top - view.top,
    height: box.height,
    room: scroller.clientHeight - (foot?.getBoundingClientRect().height ?? 0),
    scrollTop: scroller.scrollTop,
    tint: tint.backgroundColor,
    opacity: Number(tint.opacity),
    selection,
  };
};

/** The scroller in front: how far from its end, and whether any row is marked. */
const tailOf = () => {
  const scrollers = [
    ...document.querySelectorAll<HTMLElement>(
      '[aria-label="Session transcript"]'
    ),
  ].filter((node) => node.getBoundingClientRect().height > 0);
  const scroller = scrollers.at(-1);
  if (!scroller) {
    return null;
  }
  return {
    fromEnd: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
    marked: scroller.querySelector("[data-marked]") !== null,
    note: scroller.querySelector("[data-open-at]")?.textContent?.trim() ?? "",
  };
};

/** The marked row stands still: two reads 300ms apart agree. */
async function markedAtRest(page: Page) {
  return await until(
    "the marked row at rest",
    async () => {
      const first = await page.evaluate(markedBox);
      await page.waitForTimeout(300);
      const second = await page.evaluate(markedBox);
      return first && second && Math.abs(first.top - second.top) <= 0.5
        ? second
        : undefined;
    },
    Boolean,
    60_000
  );
}

/** Centred in the room above the foot, wholly inside it. */
const centredIn = (box: NonNullable<ReturnType<typeof markedBox>>) =>
  box.height < box.room &&
  box.top >= 0 &&
  box.top + box.height <= box.room &&
  Math.abs(box.top + box.height / 2 - box.room / 2) <= 2;

const describe = (box: NonNullable<ReturnType<typeof markedBox>>) =>
  `row ${box.top.toFixed(1)}–${(box.top + box.height).toFixed(1)}px in a ${box.room.toFixed(1)}px room, centre off by ${(box.top + box.height / 2 - box.room / 2).toFixed(1)}px`;

/** Every error the page reports, a missing resource's line aside. */
function errorsOf(page: Page, into: string[]): void {
  page.on("pageerror", (error) => into.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    ) {
      into.push(message.text());
    }
  });
}

/** Follows an in-app link to `href`, as the finder's row does. */
const follow = (page: Page, href: string) =>
  page.evaluate((to) => {
    const link = document.createElement("a");
    link.href = to;
    link.textContent = "open at";
    document.body.append(link);
    link.click();
    link.remove();
  }, href);

const spec: Spec = {
  name: "open-at",
  run: async (kit) => {
    const TURN = /probe-turn-(\d+)/g;
    const turnCalls = new Map<string, number>();
    const respond = (request: Seen): Reply => {
      const turn = [...request.all.matchAll(TURN)].at(-1)?.[1];
      if (turn !== undefined && request.tools) {
        const done = turnCalls.get(turn) ?? 0;
        if (done < CALLS) {
          turnCalls.set(turn, done + 1);
          return {
            everyMs: 1,
            words: [],
            tool: {
              name: "Bash",
              input: {
                command: `echo turn-${turn}-call-${done}`,
                description: `Turn ${turn} call ${done}`,
              },
            },
          };
        }
        return {
          everyMs: 2,
          words:
            `Reply to turn ${turn}: the calls ran, and this answer is long enough to take a few lines of the transcript so each turn stands as a block of its own.`
              .split(" ")
              .map((word) => `${word} `),
        };
      }
      return { everyMs: 2, words: ["Noted."] };
    };
    const fleet = await kit.fleet(respond);

    const pagesOf = async (id: string) => {
      const newest = await fleet.api<PageRead>(
        `/api/instances/${id}/transcript`
      );
      const blocks = [...newest.blocks];
      let { cursor } = newest;
      while (cursor) {
        // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
        const older = await fleet.api<PageRead>(
          `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
        );
        blocks.unshift(...older.blocks);
        ({ cursor } = older);
      }
      return { newest, blocks, busy: newest.tail?.busy === true };
    };

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // ── The session: turns enough that turn 3 is pages back.
    const sessionId = await fleet.spawn("claude", "Open-at probe");
    for (let turn = 1; turn <= TURNS; turn += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one turn at a time, each after the last settled
      const before = (await pagesOf(sessionId)).blocks.length;
      await fleet.send(sessionId, `probe-turn-${turn}: run the calls.`);
      await until(
        `turn ${turn} settled`,
        () => pagesOf(sessionId),
        (held) => held.blocks.length > before + CALLS && !held.busy,
        5 * 60_000
      );
    }
    const history = await pagesOf(sessionId);
    const sought = history.blocks.find(
      (block) =>
        block.type === "user" &&
        JSON.stringify(block).includes(`probe-turn-${SOUGHT_TURN}:`)
    );
    if (!sought) {
      throw new Error(`no record of turn ${SOUGHT_TURN}'s message`);
    }
    // The record as the find engine names it: the stored entry's uuid.
    const docId = sought.sdkUuid ?? sought.id;
    const inNewest = history.newest.blocks.some(
      (block) => block.id === docId || block.sdkUuid === docId
    );
    kit.check(
      `turn ${SOUGHT_TURN}'s message is beyond the newest page`,
      !inNewest && history.newest.cursor !== null,
      `${history.blocks.length} records, ${history.newest.blocks.length} in the newest page`
    );

    const base = await fleet.dashboard();
    const errors: string[] = [];

    // ── A session opened at a record pages back.
    const page = await kit.page("desk");
    errorsOf(page, errors);
    const older: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/transcript?") && url.includes("before=")) {
        older.push(url);
      }
    });
    await open(
      page,
      `${base}/session/${sessionId}?at=${encodeURIComponent(docId)}`,
      MARKED,
      120_000
    );
    await settle(page, 300);
    const landed = await markedAtRest(page);
    kit.check(
      "an `at` beyond the first window reads older pages",
      older.length >= 1,
      `${older.length} older-page reads`
    );
    kit.check(
      `the marked row is turn ${SOUGHT_TURN}'s message`,
      landed.text.includes(`probe-turn-${SOUGHT_TURN}:`),
      landed.text.slice(0, 80)
    );
    kit.check(
      "it stands centred in the room above the foot",
      centredIn(landed),
      describe(landed)
    );
    kit.check(
      "it carries the selection tint, settled",
      landed.state === "on" &&
        landed.tint === landed.selection &&
        landed.opacity === 1,
      `${landed.tint} at ${landed.opacity} (selection ${landed.selection})`
    );

    // ── A reply arriving at the tail meanwhile.
    const before = (await pagesOf(sessionId)).blocks.length;
    await fleet.send(sessionId, "probe-live: one more reply, please.");
    await until(
      "the live reply settled",
      () => pagesOf(sessionId),
      (now) => now.blocks.length > before && !now.busy,
      5 * 60_000
    );
    await page.waitForTimeout(1500);
    const after = await page.evaluate(markedBox);
    kit.check(
      "a live message arriving moves neither the view nor the marked row",
      !!after &&
        Math.abs(after.scrollTop - landed.scrollTop) <= 1 &&
        Math.abs(after.top - landed.top) <= 1,
      after
        ? `scrollTop ${landed.scrollTop}→${after.scrollTop}, row top ${landed.top.toFixed(1)}→${after.top.toFixed(1)}`
        : "the mark went"
    );
    kit.check(
      "the mark holds until the reader moves",
      after?.state === "on",
      after?.state
    );
    const area = await page.locator(MARKED).boundingBox();
    if (area) {
      await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    }
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(800);
    kit.check(
      "the reader's wheel lets the mark go",
      (await page.evaluate(markedBox)) === null
    );

    // ── A session opened at an id it does not hold.
    const missing = `not-a-record-${crypto.randomUUID()}`;
    await open(
      page,
      `${base}/session/${sessionId}?at=${missing}`,
      GONE,
      120_000
    );
    await settle(page, 300);
    const gone = await page.evaluate(tailOf);
    kit.check(
      "a missing id opens at the latest row, nothing marked",
      !!gone && gone.fromEnd <= 1 && !gone.marked,
      gone ? `${gone.fromEnd.toFixed(1)}px from the end` : "no scroller"
    );
    kit.check(
      "and says the moment isn't there",
      gone?.note === "That moment isn't in this session any more.",
      gone?.note
    );

    // ── A thread, open at its latest, sent to a message by an in-app link.
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await Bun.$`git init -q -b main && echo probe > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: fleet.env.HOME as string })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Open at",
      machineId: MACHINE,
      cwd: src,
      caw: false,
    });
    const note = (n: number) =>
      Array.from(
        { length: 8 },
        (_, line) =>
          `Note ${n}, paragraph ${line + 1}: words enough to wrap across the thread's column more than once, so that six of these notes stand taller than any view.`
      ).join("\n\n");
    const started = await fleet.api<{
      message: { id: string };
      thread: { id: string };
    }>(`/api/projects/${project.id}/threads`, { body: note(1) });
    const threadId = started.thread.id;
    const noteIds = [started.message.id];
    for (let n = 2; n <= NOTES; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the thread's messages in order
      const said = await fleet.api<{ message: { id: string } }>(
        `/api/projects/${project.id}/threads/${threadId}/messages`,
        { body: note(n) }
      );
      noteIds.push(said.message.id);
    }
    const threadHref = `/session/thread:${threadId}`;
    const threadPage = await kit.page("desk");
    errorsOf(threadPage, errors);
    await open(threadPage, `${base}${threadHref}`, `${SCROLLER} [data-row]`);
    await until(
      "the thread at its latest",
      () => threadPage.evaluate(tailOf),
      (tail) => !!tail && tail.fromEnd <= 1,
      60_000
    );
    await settle(threadPage, 300);
    await follow(
      threadPage,
      `${threadHref}?at=${encodeURIComponent(noteIds[SOUGHT_NOTE - 1] as string)}`
    );
    await threadPage.waitForSelector(MARKED, { timeout: 60_000 });
    await settle(threadPage, 300);
    const inThread = await markedAtRest(threadPage);
    kit.check(
      `the thread's marked row is note ${SOUGHT_NOTE}`,
      inThread.text.includes(`Note ${SOUGHT_NOTE}, paragraph 1`),
      inThread.text.slice(0, 60)
    );
    kit.check(
      "a thread opened at a message stands centred, tinted",
      centredIn(inThread) && inThread.tint === inThread.selection,
      describe(inThread)
    );
    await follow(threadPage, `${threadHref}?at=${missing}`);
    await threadPage.waitForSelector(GONE, { timeout: 60_000 });
    await settle(threadPage, 300);
    const threadGone = await threadPage.evaluate(tailOf);
    kit.check(
      "a thread opened at a missing id is at its latest, nothing marked, and says so",
      !!threadGone &&
        threadGone.fromEnd <= 1 &&
        !threadGone.marked &&
        threadGone.note === "That moment isn't in this thread any more.",
      threadGone
        ? `${threadGone.fromEnd.toFixed(1)}px from the end, "${threadGone.note}"`
        : "no scroller"
    );

    kit.check(
      "no page or console error",
      errors.length === 0,
      errors.slice(0, 4).join(" | ")
    );
  },
};
export default spec;
