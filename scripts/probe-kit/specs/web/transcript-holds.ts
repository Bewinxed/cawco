/**
 * A ROW, ONCE SHOWN, STAYS IN ITS PLACE UNDER ITS ID, however the
 * transcript is built or read again, and the reader's place is a block.
 *
 * The owner, reading long conversations all day: "the transcript just jumped
 * ages above, and this is spammed above"; "after the compaction spam i see
 * this, seems anything in between was lost until i refresh"; "the
 * pre-cmpaction content is gone from the transcript … even after refresh".
 * The trace (2740eec9) found the hub's every read again begin each
 * conversation file at its newest compaction, and the tab trust that read
 * over the rows it held, keeping its place by pixel offset.
 *
 * A scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with two Claude accounts. One session says its
 * turns, each a read and a command and an answer: compacted by Claude
 * Code's own `/compact`, moved between the accounts twice before that
 * compaction, continued at another session's ask (its conversation folded
 * into the one it went on in), then compacted again near its end, so the
 * stretch since the last compaction is shorter than a page.
 *
 * Then, on Chromium and WebKit at 1440 and 390, two pages: one scrolled up
 * mid-history (every page read first), one at the tail. After each of a
 * socket drop, the agent registering again, the hub restarting with the
 * agent up, the hub restarting with the agent down first, a new turn, a
 * reload, and (once on each engine) a `/clear` that changes the session's
 * key:
 *  - each page's list holds every row it held (the store, by id);
 *  - the hub's paged walk holds every turn its walk held, and every turn
 *    said, from the first, across the compactions and the continuation;
 *  - no account line stands before the conversation's first turn;
 *  - the page scrolled up has the same row at its top, as far into it
 *    within 2 px; the page at the tail stays at the tail.
 * The /clear draws the same rows live (the page at the tail, the hub's walk)
 * as the hub's read again after a restart, none of them "Unrecognised". The
 * new turn ends with every look refused at the network, as while the hub is
 * down: no console error says so, and the look reaches the hub once the
 * pages are connected again; on Chromium, at 4x CPU throttle and traced, no
 * frame of its reply forces a layout from a row handing its place on
 * (Transcript.svelte `handOn`), and the reads the long frames forced
 * elsewhere at Transcript.svelte are noted. No console error on any page.
 * Once at the end, the idle sweep: the session put to sleep and no page
 * open past the hub's idle time, then opened again: the walk holds every
 * turn, and a page opens at the place it was left.
 *
 *   bun scripts/probe-kit/run.ts web transcript-holds
 *
 * `PROBE_LEGS=chromium 1440,webkit 390` runs those legs alone;
 * `PROBE_IDLE=0` leaves the idle sweep out (it waits eleven minutes).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one turn, one event at a time, as a person takes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page, Route } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../../packages/core/src/claude-dirs";
import { ACCOUNT, until } from "../../../scratch-fleet";
import { traceMain } from "../../frames";
import {
  type Engine,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

/** A second account signed in on the fleet's machine. */
const SECOND = "acct-holds-other";
const SECOND_TOKEN = "sk-ant-oat01-fake-scratch-fleet-holds-other";
/** The file every turn reads. */
const NOTE = "note.txt";
/** What marks the summary request of a `/compact`: its focus. */
const FOCUS = "PROBE-COMPACT-FOCUS";
/** The person's words, as the walk and the list hold them. */
const TURN = (n: number) => `turn ${n} of the long conversation`;
const SAID =
  /^(turn \d+ of the long conversation|fresh turn .*|after clear .*)$/;
/** The conversation's shape: turns said before the continuation, and after it. */
const BEFORE_CONTINUE = 24;
const TURNS = 44;
/** Account moves, by the turn after which they happen (before the first compaction). */
const MOVES = new Set([2, 4]);
/** `/compact` after these turns: one in the first conversation, one near the end. */
const COMPACTS = new Set([8, 38]);

const LEGS: { engine: Engine; view: View; label: string }[] = [
  { engine: "chromium", view: "desk", label: "chromium 1440" },
  { engine: "webkit", view: "desk", label: "webkit 1440" },
  { engine: "chromium", view: "phone", label: "chromium 390" },
  { engine: "webkit", view: "phone", label: "webkit 390" },
];

const treeOf = (tabs: string[]) =>
  JSON.stringify({
    v: 1,
    root: { t: "l", id: "pone", tabs, active: tabs[0], opened: null },
    focusedLeaf: "pone",
  });

/** Sends `text` and waits for the turn it opens to close. */
async function say(fleet: KitFleet, source: string, text: string) {
  const uuid = await fleet.send(source, text);
  await until(
    `"${text}" read`,
    () => fleet.sendRow(uuid),
    (one) => one?.state === "read",
    120_000
  );
  await until(
    `"${text}" answered`,
    () =>
      fleet.query<{ session_id: string | null; turn_open_at: number | null }>(
        "SELECT session_id, turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => Boolean(one?.session_id) && one?.turn_open_at === null,
    120_000
  );
}

/** The fleet, with a second account filed and signed in. */
async function standUp(kit: Kit): Promise<KitFleet> {
  const fleet = await kit.fleet((request) => {
    if (
      request.last.includes(FOCUS) &&
      !request.last.trimStart().startsWith("/compact") &&
      !request.last.includes("<local-command")
    ) {
      return {
        everyMs: 20,
        words: [
          "<summary>",
          "The conversation so far, compacted.",
          "</summary>",
        ],
      };
    }
    if (!request.tools || request.afterTool) {
      return { everyMs: 5, words: ["ok"] };
    }
    return {
      everyMs: 5,
      words: ["Checking first."],
      tools: [
        { name: "Read", input: { file_path: join(fleet.workdir, NOTE) } },
        {
          name: "Bash",
          input: { command: "echo checked", description: "Say checked" },
        },
      ],
    };
  });
  await writeFile(join(fleet.workdir, NOTE), "A note the agent reads.\n");
  const dir = join(fleet.home, ".cawco", "accounts", SECOND, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: SECOND_TOKEN,
        expiresAt: Date.now() + 365 * 24 * 3_600_000,
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
        emailAddress: "other@scratch-fleet.test",
        organizationName: "Other Org",
        accountUuid: "00000000-0000-4000-8000-000000000095",
        organizationUuid: "00000000-0000-4000-8000-000000000096",
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', 'Other', 'green', 1, 0, ?)",
    SECOND,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    `${SECOND} signed in`,
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        SECOND
      )[0],
    (row) => row?.state === "signed-in",
    120_000
  );
  return fleet;
}

/** Moves the session to `to` and waits for the hub's row to name it. */
async function moveTo(fleet: KitFleet, source: string, to: string) {
  await fleet.api(`/api/instances/${source}/account`, { accountId: to });
  await until(
    `the session on ${to}`,
    () =>
      fleet.query<{ account_id: string | null }>(
        "SELECT account_id FROM instances WHERE id = ?",
        source
      )[0]?.account_id,
    (account) => account === to,
    120_000
  );
}

/** Continues `source` at `lead`'s ask, folded into one session: the id it runs under now. */
async function continueAt(
  fleet: KitFleet,
  source: string,
  lead: string
): Promise<string> {
  const { targetInstanceId: to } = await fleet.api<{
    targetInstanceId: string;
  }>(`/api/instances/${source}/continue`, {
    target: {
      harness: "claude",
      model: "claude-haiku-4-5",
      permissionMode: "bypassPermissions",
    },
    asksOnly: true,
    askedBy: lead,
  });
  await until(
    "the continuation started",
    () =>
      fleet.query<{ stage: string }>(
        "SELECT stage FROM continuations WHERE target_instance_id = ?",
        to
      )[0]?.stage,
    (stage) => stage === "started",
    180_000
  );
  await until(
    "the old id is a former id of the continuation",
    () =>
      fleet.query<{ instance_id: string }>(
        "SELECT instance_id FROM instance_aliases WHERE id = ?",
        source
      )[0]?.instance_id,
    (id) => id === to,
    60_000
  );
  await until(
    "the continuation idle",
    () =>
      fleet.query<{ turn_open_at: number | null; session_id: string | null }>(
        "SELECT turn_open_at, session_id FROM instances WHERE id = ?",
        to
      )[0],
    (one) => Boolean(one?.session_id) && one?.turn_open_at === null,
    120_000
  );
  return to;
}

interface Walk {
  /** Every block's id, type, words and note kind, oldest first. */
  blocks: Drawn[];
  /** The person's turns the walk holds, oldest first. */
  said: string[];
}

/** The hub's paged walk of the session's transcript: what a reader paging back gets. */
async function walk(fleet: KitFleet, source: string): Promise<Walk> {
  const blocks: Walk["blocks"] = [];
  let before: string | null = null;
  for (let pages = 0; pages < 200; pages += 1) {
    const page: {
      blocks: {
        id: string;
        type?: string;
        content?: unknown;
        metadata?: { noteKind?: string };
      }[];
      cursor: string | null;
    } = await fleet.api(
      `/api/instances/${source}/transcript?limit=200${before ? `&before=${encodeURIComponent(before)}` : ""}`
    );
    blocks.unshift(
      ...page.blocks.map((block) => ({
        id: block.id,
        type: block.type ?? "",
        kind: block.metadata?.noteKind ?? "",
        text: typeof block.content === "string" ? block.content.trim() : "",
      }))
    );
    if (page.cursor === null) {
      break;
    }
    before = page.cursor;
  }
  return {
    blocks,
    said: blocks.flatMap((block) =>
      block.type === "user" && SAID.test(block.text) ? [block.text] : []
    ),
  };
}

/** Account lines before the conversation's first turn: the pile the owner saw. */
const pileOf = (walked: Walk): number => {
  const first = walked.blocks.findIndex((block) => block.type === "user");
  return walked.blocks
    .slice(0, first < 0 ? walked.blocks.length : first)
    .filter((block) => block.type === "system.account_move").length;
};

interface Place {
  fromEnd: number;
  jump: boolean;
  latestInView: boolean;
  rows: number;
  top: { key: string; into: number } | null;
}

/** Where the transcript's view stands. In the page. */
function placeNow(): Place | null {
  const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
  if (!scroller) {
    return null;
  }
  const view = scroller.getBoundingClientRect();
  const rows = [...scroller.querySelectorAll<HTMLElement>("[data-row]")]
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => ({ one, box: one.getBoundingClientRect() }))
    .sort((a, b) => a.box.top - b.box.top);
  const latest = rows.at(-1);
  const top = rows.find(({ box }) => box.bottom > view.top + 1);
  return {
    fromEnd: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
    jump: !!document.querySelector("[data-latest]"),
    latestInView:
      !!latest &&
      latest.box.bottom <= view.bottom + 1 &&
      latest.box.bottom > view.top,
    rows: rows.length,
    top: top
      ? {
          key: top.one.dataset.row ?? "",
          into: Number((view.top - top.box.top).toFixed(1)),
        }
      : null,
  };
}

/** The view, once nothing in it has moved for three reads a quarter second apart. */
async function standing(page: Page): Promise<Place | null> {
  let last = "";
  let still = 0;
  for (let tries = 0; tries < 80 && still < 3; tries += 1) {
    await page.waitForTimeout(250);
    const now = JSON.stringify(await page.evaluate(placeNow));
    still = now === last ? still + 1 : 0;
    last = now;
  }
  await settle(page, 200);
  return page.evaluate(placeNow);
}

/** The blocks the page's store holds for the session (dev's `__cawcoDebug`): each one's id, type and first words. */
const heldRows = (
  page: Page,
  id: string
): Promise<{ id: string; type: string; text: string }[] | null> =>
  page.evaluate((viewId) => {
    const state = (
      globalThis as unknown as {
        __cawcoDebug?: {
          state?: {
            sessions?: Record<
              string,
              {
                blocks?: {
                  id: string;
                  type: string;
                  content: string;
                  metadata?: { noteKind?: string; noteTitle?: string };
                }[];
              }
            >;
          };
        };
      }
    ).__cawcoDebug?.state;
    return (
      state?.sessions?.[viewId]?.blocks?.map((one, at, all) => ({
        id: one.id,
        type: one.type,
        text: `${one.metadata?.noteKind ?? ""} ${one.metadata?.noteTitle ?? ""} ${String(one.content ?? "").slice(0, 60)}, after ${all[at - 1]?.type ?? "nothing"} ${String(all[at - 1]?.content ?? "").slice(0, 40)}`,
      })) ?? null
    );
  }, id);

/** A row as a list holds it: its id, type, note kind and words. */
interface Drawn {
  id: string;
  kind: string;
  text: string;
  type: string;
}

/** The blocks the page's store holds for the session, as {@link Drawn}. */
const drawnRows = (page: Page, id: string): Promise<Drawn[]> =>
  page.evaluate(
    (viewId) =>
      (
        globalThis as unknown as {
          __cawcoDebug?: {
            state?: {
              sessions?: Record<
                string,
                {
                  blocks?: {
                    id: string;
                    type: string;
                    content: unknown;
                    metadata?: { noteKind?: string };
                  }[];
                }
              >;
            };
          };
        }
      ).__cawcoDebug?.state?.sessions?.[viewId]?.blocks?.map((one) => ({
        id: one.id,
        type: one.type,
        kind: one.metadata?.noteKind ?? "",
        text: typeof one.content === "string" ? one.content.trim() : "",
      })) ?? [],
    id
  );

/** What a /clear drew: the rows after the leg's fresh turn, each as `type id (note kind)`. */
const clearedOf = (rows: Drawn[], fresh: string): string[] =>
  rows
    .slice(rows.findLastIndex((one) => one.text === fresh) + 1)
    .map((one) => `${one.type} ${one.id}${one.kind ? ` (${one.kind})` : ""}`);

/** The ids of the blocks the page's store holds for the session. */
const heldIds = async (page: Page, id: string): Promise<string[] | null> =>
  (await heldRows(page, id))?.map((one) => one.id) ?? null;

/**
 * The browser's own line for a request the restarting hub answered 502 or
 * refused: not the page's. What the page's own code logs while the hub is
 * down is the page's, and counts.
 */
const HUB_DOWN =
  /status of 50[23]|Failed to load resource|WebSocket connection|ERR_CONNECTION_REFUSED|Could not connect/;

/** The module that marks a look seen (home-state.svelte.ts `markOpened`): an error it logs is that. */
const MARKS_SEEN = /home-state\.svelte\.ts/;

/** The dashboard's call that marks a look seen (home-state.svelte.ts `postSeen`). */
const SEEN_ROUTE = "**/api/seen";

/** Whether the hub holds the session seen through its last turn's end. */
const seenOf = (
  fleet: KitFleet,
  id: string
): { seen: boolean; seenAt: number | null; turnEndedAt: number | null } => {
  const [row] = fleet.query<{
    seen_at: number | null;
    turn_ended_at: number | null;
  }>("SELECT seen_at, turn_ended_at FROM instances WHERE id = ?", id);
  const seenAt = row?.seen_at ?? null;
  const turnEndedAt = row?.turn_ended_at ?? null;
  return {
    seen: seenAt !== null && turnEndedAt !== null && seenAt >= turnEndedAt,
    seenAt,
    turnEndedAt,
  };
};

/** A pass script forced: its stack's frames, each `fn@file:line:column` (frames.ts `traceMain`). */
const forcedPass = (pass: { at: string }): boolean => pass.at.includes("@");

/** A frame longer than this is long (headless Chromium's 16.67ms grid, two frames: decision-pages (o)). */
const LONG_FRAME_MS = 33.4;

/** A forced pass whose reading call is Transcript.svelte's own. */
const atTranscript = (pass: { at: string }): boolean =>
  (pass.at.split(" ← ")[0] ?? "").includes("Transcript.svelte");

/** A forced pass read by a row handing its place on (Transcript.svelte `handOn`, be88156f's read). */
const atHandOn = (pass: { at: string }): boolean =>
  (pass.at.split(" ← ")[0] ?? "").startsWith("handOn@");

/**
 * A turn's reply on `page` at 4x CPU throttle, traced (Chromium): its long
 * frames (the page's own frame clock, `requestAnimationFrame`, past
 * {@link LONG_FRAME_MS}), each with the style and layout passes script forced
 * in the tasks that started in it; the passes forced at Transcript.svelte in
 * those frames (`inLong`), and those a row handing its place on forced in
 * any frame of the reply (`handOn`).
 */
async function forcedInTurn(page: Page, act: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let pageAt = 0;
  let frames: number[] = [];
  try {
    const main = await traceMain(
      page,
      async () => {
        pageAt = await page.evaluate(() => {
          const clock: { on: boolean; ticks: number[] } = {
            on: true,
            ticks: [],
          };
          (
            globalThis as unknown as { __turnClock?: typeof clock }
          ).__turnClock = clock;
          const tick = (now: number) => {
            if (clock.on) {
              clock.ticks.push(now);
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
          performance.mark("transcript-turn");
          return performance.now();
        });
        await act();
        frames = await page.evaluate(() => {
          const clock = (
            globalThis as unknown as {
              __turnClock?: { on: boolean; ticks: number[] };
            }
          ).__turnClock;
          if (clock) {
            clock.on = false;
          }
          return clock?.ticks ?? [];
        });
      },
      { passes: true }
    );
    const markAt =
      main.marks.find((one) => one.name === "transcript-turn")?.at ?? 0;
    const traceAt = (ms: number) => markAt + (ms - pageAt) * 1000;
    const said = (
      task: (typeof main.tasks)[number],
      pass: (typeof main.tasks)[number]["passes"][number]
    ) =>
      `${pass.name} ${pass.ms.toFixed(1)}ms at ${pass.at} (in a ${Math.round(task.wall)}ms task, ${task.ran})`;
    const long: string[] = [];
    const inLong: string[] = [];
    for (let at = 1; at < frames.length; at += 1) {
      const span = frames[at] - frames[at - 1];
      if (span <= LONG_FRAME_MS) {
        continue;
      }
      const from = traceAt(frames[at - 1]);
      const to = traceAt(frames[at]);
      const tasks = main.tasks.filter(
        (task) => task.at >= from && task.at < to
      );
      const forced = tasks.flatMap((task) =>
        task.passes.filter(forcedPass).map((pass) => ({ task, pass }))
      );
      inLong.push(
        ...forced
          .filter(({ pass }) => atTranscript(pass) && !atHandOn(pass))
          .map(({ task, pass }) => said(task, pass))
      );
      long.push(
        `${Math.round(span)}ms: ${
          forced
            .map(({ pass }) => `${pass.name} at ${pass.at.split(" ← ")[0]}`)
            .join("; ") || "no forced pass"
        }`
      );
    }
    // The row handoff's reads in any frame of the reply, long or not.
    const handOn = main.tasks.flatMap((task) =>
      task.passes
        .filter((pass) => forcedPass(pass) && atHandOn(pass))
        .map((pass) => said(task, pass))
    );
    return {
      frames: frames.length,
      handOn,
      inLong,
      long,
    };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
}

interface Watched {
  errors: string[];
  page: Page;
}

async function sessionPage(
  kit: Kit,
  base: string,
  source: string,
  leg: { engine: Engine; view: View }
): Promise<Watched> {
  const page = await kit.page(leg.view, { theme: "light", engine: leg.engine });
  const watched: Watched = { page, errors: [] };
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !kitsOwnMessage(text) &&
      !HUB_DOWN.test(text)
    ) {
      watched.errors.push(`${text} (${message.location().url})`);
    }
  });
  page.on("pageerror", (error) => watched.errors.push(String(error)));
  await page.addInitScript(
    (tree) => {
      if (!localStorage.getItem("cawco-workspace")) {
        localStorage.setItem("cawco-workspace", tree);
      }
    },
    treeOf([source])
  );
  await open(
    page,
    `${base}/session/${source}`,
    'section[data-slot="turn"]',
    120_000
  );
  return watched;
}

/** How many newest pages the page's store has taken for the session (`SessionState.reads`). */
const readsOf = (page: Page, id: string): Promise<number> =>
  page.evaluate(
    (viewId) =>
      (
        globalThis as unknown as {
          __cawcoDebug?: {
            state?: { sessions?: Record<string, { reads?: number }> };
          };
        }
      ).__cawcoDebug?.state?.sessions?.[viewId]?.reads ?? 0,
    id
  );

/** Waits for the page's store to take a newest page past `from`; whether it did within `ms`. */
async function readLanded(
  page: Page,
  id: string,
  from: number,
  ms: number
): Promise<boolean> {
  const ends = Date.now() + ms;
  while (Date.now() < ends) {
    if ((await readsOf(page, id)) > from) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

/** Scrolled to the start until no older page comes in: every page read. */
async function readToStart(page: Page): Promise<void> {
  let still = 0;
  let height = -1;
  for (let tries = 0; tries < 200 && still < 5; tries += 1) {
    const now = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
      if (!scroller) {
        return -1;
      }
      scroller.scrollTop = 0;
      return scroller.scrollHeight;
    });
    await page.waitForTimeout(700);
    still = now === height ? still + 1 : 0;
    height = now;
  }
}

/** The view put `fraction` of the way down, as a reader scrolling there. */
async function scrollTo(page: Page, fraction: number): Promise<void> {
  await page.evaluate((at) => {
    const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
    if (scroller) {
      scroller.scrollTop = Math.round(
        (scroller.scrollHeight - scroller.clientHeight) * at
      );
    }
  }, fraction);
  await page.waitForTimeout(400);
}

/**
 * The view put on the person's turn nearest `fraction` of the way down,
 * scrolled partway into it: the row a reload has to find again among the
 * pages before the newest (a send's row, the hub's own id for it).
 */
async function scrollIntoTurn(page: Page, fraction: number): Promise<void> {
  await scrollTo(page, fraction);
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
    if (!scroller) {
      return;
    }
    const view = scroller.getBoundingClientRect();
    const turn = [...scroller.querySelectorAll<HTMLElement>("[data-row]")]
      .filter((one) => one.querySelector('section[data-slot="turn"][data-you]'))
      .map((one) => ({ one, box: one.getBoundingClientRect() }))
      .find(({ box }) => box.top >= view.top && box.height > 40);
    if (turn) {
      scroller.scrollTop += turn.box.top - view.top + 30;
    }
  });
  await page.waitForTimeout(400);
}

/** Reloads the page as an update does; whether its list was drawn. */
async function reload(page: Page): Promise<boolean> {
  await page.evaluate(() => location.reload());
  return page
    .waitForSelector("[data-transcript-shown]", { timeout: 60_000 })
    .then(
      () => true,
      () => false
    );
}

interface Leg {
  engine: Engine;
  label: string;
  view: View;
}

interface Pages {
  /** At the tail. */
  tail: Watched;
  /** Scrolled up mid-history. */
  up: Watched;
}

interface Held {
  tail: string[];
  up: string[];
  upPlace: Place | null;
  walk: Walk;
}

/**
 * One event, and what holds through it: each page's rows by id, the hub's
 * walk, no account line before the first turn, the scrolled-up page's top
 * row and how far into it, the tail page at the tail.
 */
async function through(
  kit: Kit,
  fleet: KitFleet,
  source: () => string,
  pages: Pages,
  leg: Leg,
  what: string,
  act: (reads: { tail: number; up: number }) => Promise<void>
): Promise<void> {
  const id = source();
  const held: Held = {
    up: (await heldIds(pages.up.page, id)) ?? [],
    tail: (await heldIds(pages.tail.page, id)) ?? [],
    upPlace: await standing(pages.up.page),
    walk: await walk(fleet, id),
  };
  await act({
    tail: await readsOf(pages.tail.page, id),
    up: await readsOf(pages.up.page, id),
  });
  const now = source();
  const upPlace = await standing(pages.up.page);
  const tailPlace = await standing(pages.tail.page);
  const walked = await walk(fleet, now);
  for (const [name, before, page] of [
    ["scrolled up", held.up, pages.up.page],
    ["at the tail", held.tail, pages.tail.page],
  ] as const) {
    const after = new Set((await heldIds(page, now)) ?? []);
    const lost = before.filter((one) => !after.has(one));
    kit.check(
      `${leg.label}, ${what}: the page ${name} holds every row it held (${before.length})`,
      before.length > 0 && lost.length === 0,
      `${lost.length} lost of ${before.length}, ${after.size} held now: ${lost.slice(0, 4).join(" ")}`
    );
  }
  const gone = held.walk.said.filter((one) => !walked.said.includes(one));
  const unsaid = Array.from({ length: TURNS }, (_, i) => TURN(i + 1)).filter(
    (one) => !walked.said.includes(one)
  );
  kit.check(
    `${leg.label}, ${what}: the hub's walk holds every turn its walk held (${held.walk.said.length}), and all ${TURNS} said from the first`,
    gone.length === 0 && unsaid.length === 0,
    JSON.stringify({ gone: gone.slice(0, 6), unsaid: unsaid.slice(0, 6) })
  );
  kit.check(
    `${leg.label}, ${what}: no account line stands before the conversation's first turn`,
    pileOf(walked) === 0,
    `${pileOf(walked)} before it`
  );
  const was = held.upPlace?.top;
  kit.check(
    `${leg.label}, ${what}: scrolled up, the same row stands at the top (${was?.key}), as far into it within 2 px`,
    !!was &&
      upPlace?.top?.key === was.key &&
      Math.abs((upPlace?.top?.into ?? 0) - was.into) <= 2,
    JSON.stringify({ was, now: upPlace?.top, jump: upPlace?.jump })
  );
  kit.check(
    `${leg.label}, ${what}: the page at the tail stays at the tail`,
    !!tailPlace && tailPlace.latestInView && !tailPlace.jump,
    JSON.stringify(tailPlace)
  );
}

/** Both pages' reads after a reconnect, landed. */
async function reconnected(
  pages: Pages,
  id: string,
  reads: { tail: number; up: number }
) {
  await readLanded(pages.up.page, id, reads.up, 90_000);
  await readLanded(pages.tail.page, id, reads.tail, 90_000);
}

/** One engine and size: two pages, every event. */
async function legOf(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  source: { id: string },
  leg: Leg,
  first: boolean
): Promise<string[]> {
  const tail = await sessionPage(kit, base, source.id, leg);
  const up = await sessionPage(kit, base, source.id, leg);
  const pages = { tail, up };
  await readToStart(up.page);
  await scrollIntoTurn(up.page, 0.45);
  await scrollTo(tail.page, 1);
  const id = () => source.id;
  await through(kit, fleet, id, pages, leg, "a socket drop", async (marks) => {
    for (const one of [up, tail]) {
      await one.page.evaluate(() =>
        (
          globalThis as unknown as { __cawcoSocket?: WebSocket }
        ).__cawcoSocket?.close()
      );
    }
    await reconnected(pages, source.id, marks);
  });
  await through(
    kit,
    fleet,
    id,
    pages,
    leg,
    "the agent registering again",
    async () => {
      await fleet.stop("agent");
      fleet.launch("agent");
      await fleet.agentUp();
      await up.page.waitForTimeout(3000);
    }
  );
  await through(
    kit,
    fleet,
    id,
    pages,
    leg,
    "the hub restarting, the agent up",
    async (marks) => {
      await fleet.stop("hub");
      fleet.launch("hub");
      await fleet.hubUp();
      await reconnected(pages, source.id, marks);
    }
  );
  await through(
    kit,
    fleet,
    id,
    pages,
    leg,
    "the hub restarting, the agent down first",
    async (marks) => {
      await fleet.stop("agent");
      await fleet.stop("hub");
      fleet.launch("hub");
      await fleet.hubUp();
      await up.page.waitForTimeout(3000);
      fleet.launch("agent");
      await fleet.agentUp();
      await reconnected(pages, source.id, marks);
      await up.page.waitForTimeout(3000);
    }
  );
  const fresh = `fresh turn for ${leg.label}`;
  await through(kit, fleet, id, pages, leg, "a new turn", async () => {
    // The turn ends with the conversation in front of both pages, and no
    // look reaches the hub, as none does while it restarts: each page's
    // look is refused at the network.
    let refused = 0;
    const refuse = async (route: Route) => {
      refused += 1;
      await route.abort("connectionrefused");
    };
    const seenErrors = () =>
      [...up.errors, ...tail.errors].filter((one) => MARKS_SEEN.test(one))
        .length;
    const errorsBefore = seenErrors();
    for (const one of [up, tail]) {
      await one.page.route(SEEN_ROUTE, refuse);
    }
    const turn = async () => {
      await say(fleet, source.id, fresh);
      await tail.page.getByText(fresh, { exact: true }).first().waitFor({
        timeout: 60_000,
      });
      // Its last rows land and their motion runs out.
      await tail.page.waitForTimeout(2000);
    };
    if (leg.engine === "chromium") {
      // The reply as the page at the tail draws it: its rows change hands
      // (the live row settles, a tool's glance lands in its run), and no
      // layout is read after a write from the transcript's own code.
      const read = await forcedInTurn(tail.page, turn);
      kit.check(
        `${leg.label}, a new turn at the tail, 4x CPU throttle: the long-frame check names no forced read at Transcript.svelte's row handoff (handOn), in any frame of the reply (${read.frames} frames, ${read.long.length} past ${LONG_FRAME_MS}ms: ${read.long.join(" | ") || "none"})`,
        read.frames > 0 && read.handOn.length === 0,
        read.handOn.slice(0, 8).join("\n    ")
      );
      if (read.inLong.length > 0) {
        kit.note(
          `${leg.label}, a new turn at the tail: reads forced at Transcript.svelte in its long frames, outside the row handoff: ${read.inLong.slice(0, 12).join(" | ")}`
        );
      }
    } else {
      await turn();
    }
    const unseen = seenOf(fleet, source.id);
    for (const one of [up, tail]) {
      await one.page.unroute(SEEN_ROUTE, refuse);
    }
    // The hub comes back for the pages: each one's socket dropped and made
    // again, as a hub's restart does.
    const reads = {
      tail: await readsOf(tail.page, source.id),
      up: await readsOf(up.page, source.id),
    };
    for (const one of [up, tail]) {
      await one.page.evaluate(() =>
        (
          globalThis as unknown as { __cawcoSocket?: WebSocket }
        ).__cawcoSocket?.close()
      );
    }
    await reconnected(pages, source.id, reads);
    const seen = await until(
      "the look the hub did not take, taken",
      async () => seenOf(fleet, source.id),
      (one) => one.seen,
      30_000
    ).catch(() => seenOf(fleet, source.id));
    kit.check(
      `${leg.label}, a turn ending while the hub takes no look: no console error from marking seen, and the look reaches the hub once it is back (${refused} looks refused)`,
      refused > 0 && !unseen.seen && seenErrors() === errorsBefore && seen.seen,
      JSON.stringify({ errors: seenErrors() - errorsBefore, unseen, seen })
    );
  });
  if (first) {
    await through(
      kit,
      fleet,
      id,
      pages,
      leg,
      "a /clear that changes its key, then the hub restarting",
      async (marks) => {
        const [was] = fleet.query<{ session_id: string | null }>(
          "SELECT session_id FROM instances WHERE id = ?",
          source.id
        );
        const after = `after clear for ${leg.label}`;
        await say(fleet, source.id, "/clear");
        await say(fleet, source.id, after);
        const [now] = fleet.query<{ session_id: string | null }>(
          "SELECT session_id FROM instances WHERE id = ?",
          source.id
        );
        kit.check(
          `${leg.label}: /clear started the session under a new key`,
          !!was?.session_id && now?.session_id !== was.session_id,
          JSON.stringify({ was, now })
        );
        await tail.page.getByText(after, { exact: true }).first().waitFor({
          timeout: 60_000,
        });
        await tail.page.waitForTimeout(2000);
        // What the /clear drew live, on the page at the tail and on the
        // hub's walk, then what the hub reads again once it restarts.
        const live = clearedOf(await drawnRows(tail.page, source.id), fresh);
        const liveWalk = clearedOf(
          (await walk(fleet, source.id)).blocks,
          fresh
        );
        await fleet.stop("hub");
        fleet.launch("hub");
        await fleet.hubUp();
        await reconnected(pages, source.id, marks);
        const reread = clearedOf((await walk(fleet, source.id)).blocks, fresh);
        const unrecognised = [...live, ...liveWalk, ...reread].filter((one) =>
          one.includes("Unrecognised")
        );
        kit.check(
          `${leg.label}: /clear live and re-read draw the same rows (${reread.length}), none of them "Unrecognised"`,
          reread.length > 0 &&
            JSON.stringify(live) === JSON.stringify(reread) &&
            JSON.stringify(liveWalk) === JSON.stringify(reread) &&
            unrecognised.length === 0,
          JSON.stringify({ live, liveWalk, reread })
        );
      }
    );
  }
  // Reloaded as an update reloads it: both pages drawn, the scrolled-up one
  // at its place again, the other at the tail.
  const before = await standing(up.page);
  const heldUpRows = (await heldRows(up.page, source.id)) ?? [];
  // What the hub holds now: a reload reads it. A row only the live stream
  // drew (never stored by the harness) that the tab kept through the hub's
  // restart is not the hub's any more (persisting built blocks, D7, is
  // parked): said, not held to.
  const hubIds = new Set(
    (await walk(fleet, source.id)).blocks.map((b) => b.id)
  );
  const liveOnly = heldUpRows.filter((one) => !hubIds.has(one.id));
  if (liveOnly.length > 0) {
    kit.note(
      `${leg.label}: before the reload, rows only this tab held (drawn live, never stored, the hub restarted since): ${JSON.stringify(liveOnly)}`
    );
  }
  const heldUp = heldUpRows
    .filter((one) => hubIds.has(one.id))
    .map((one) => one.id);
  // Where the page keeps its place, as it keeps it when it goes (`pagehide`).
  const landing = await up.page.evaluate((viewId) => {
    dispatchEvent(new Event("pagehide"));
    return sessionStorage.getItem(`cawco:landing:${viewId}`);
  }, source.id);
  const drawn = await Promise.all([reload(up.page), reload(tail.page)]);
  const back = await standing(up.page);
  const tailBack = await standing(tail.page);
  kit.check(
    `${leg.label}, reloaded while scrolled up: the list is drawn`,
    drawn[0] === true,
    JSON.stringify(back)
  );
  kit.check(
    `${leg.label}, reloaded while scrolled up: it opens at the same row (${before?.top?.key}), as far into it within 2 px`,
    !!before?.top &&
      back?.top?.key === before.top.key &&
      Math.abs((back?.top?.into ?? 0) - before.top.into) <= 2,
    JSON.stringify({ before: before?.top, back: back?.top, landing })
  );
  kit.check(
    `${leg.label}, reloaded at the tail: it opens at the tail`,
    drawn[1] === true && !!tailBack?.latestInView && !tailBack.jump,
    JSON.stringify(tailBack)
  );
  // Read back to where it was: every row it held is the hub's still.
  await readToStart(up.page);
  const reread = new Set((await heldIds(up.page, source.id)) ?? []);
  const lost = heldUpRows.filter(
    (one) => hubIds.has(one.id) && !reread.has(one.id)
  );
  kit.check(
    `${leg.label}, reloaded and read back to the start: the list holds every row it held before that the hub holds (${heldUp.length} of ${heldUpRows.length})`,
    heldUp.length > 0 && lost.length === 0,
    `${lost.length} lost: ${JSON.stringify(lost.slice(0, 4))}`
  );
  const errors = [...up.errors, ...tail.errors].map(
    (one) => `${leg.label}: ${one}`
  );
  await up.page.close();
  await tail.page.close();
  return errors;
}

/** The hub's idle time and its sweep (hub transcripts.ts IDLE_MS, SWEEP_MS), and a minute's room. */
const IDLE_WAIT_MS = 11 * 60_000 + 30_000;

/** Once: put to sleep and unfollowed past the hub's idle time, then opened again. */
async function idleLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  source: string
): Promise<string[]> {
  const leg = LEGS[0] as Leg;
  const page = await sessionPage(kit, base, source, leg);
  await readToStart(page.page);
  await scrollTo(page.page, 0.45);
  const left = await standing(page.page);
  const held = (await heldIds(page.page, source)) ?? [];
  const walked = await walk(fleet, source);
  // Left where it is: the landing is kept as the page goes.
  await page.page.close();
  await fleet.stopSession(source);
  kit.note(
    `idle sweep: the session asleep and no page open for ${IDLE_WAIT_MS / 60_000} min`
  );
  await Bun.sleep(IDLE_WAIT_MS);
  const again = await walk(fleet, source);
  const gone = walked.said.filter((one) => !again.said.includes(one));
  kit.check(
    `idle sweep: opened again after the hub let it go, its walk holds every turn its walk held (${walked.said.length})`,
    walked.said.length > 0 && gone.length === 0,
    JSON.stringify(gone.slice(0, 6))
  );
  kit.check(
    "idle sweep: no account line stands before the conversation's first turn",
    pileOf(again) === 0,
    `${pileOf(again)} before it`
  );
  const reopened = await sessionPage(kit, base, source, leg);
  await readToStart(reopened.page);
  const now = new Set((await heldIds(reopened.page, source)) ?? []);
  const lost = held.filter((one) => !now.has(one));
  kit.check(
    `idle sweep: opened again and read to the start, the list holds every row it held (${held.length})`,
    held.length > 0 && lost.length === 0,
    `${lost.length} lost: ${lost.slice(0, 4).join(" ")}`
  );
  kit.note(`idle sweep: left at ${JSON.stringify(left?.top)}`);
  const errors = reopened.errors.map((one) => `idle sweep: ${one}`);
  await reopened.page.close();
  return errors;
}

const spec: Spec = {
  name: "transcript-holds",
  async run(kit) {
    const fleet = await standUp(kit);
    const base = await fleet.devDashboard();
    const lead = await fleet.spawn("claude", "The lead who asks");
    await say(fleet, lead, "lead's first turn");
    const first = await fleet.spawn("claude", "A long conversation");
    const source = { id: first };
    let on = ACCOUNT;
    let compactions = 0;
    for (let turn = 1; turn <= TURNS; turn += 1) {
      await say(fleet, source.id, TURN(turn));
      if (MOVES.has(turn)) {
        on = on === ACCOUNT ? SECOND : ACCOUNT;
        await moveTo(fleet, source.id, on);
      }
      if (COMPACTS.has(turn)) {
        compactions += 1;
        await say(fleet, source.id, `/compact ${FOCUS} ${compactions}`);
      }
      if (turn === BEFORE_CONTINUE) {
        source.id = await continueAt(fleet, source.id, lead);
      }
    }
    const built = await walk(fleet, source.id);
    const boundaries = built.blocks.filter(
      (block) => block.type === "system.compact_boundary"
    ).length;
    const unsaid = Array.from({ length: TURNS }, (_, i) => TURN(i + 1)).filter(
      (one) => !built.said.includes(one)
    );
    kit.check(
      `the conversation holds all ${TURNS} turns on the hub's walk from the first, ${compactions} compactions (${boundaries} boundaries), continued once (${first.slice(0, 8)} → ${source.id.slice(0, 8)}), no account line before its first turn`,
      unsaid.length === 0 &&
        boundaries === compactions &&
        source.id !== first &&
        pileOf(built) === 0,
      JSON.stringify({ unsaid: unsaid.slice(0, 8), pile: pileOf(built) })
    );
    const errors: string[] = [];
    const only = process.env.PROBE_LEGS?.split(",");
    const legs = LEGS.filter((one) => !only || only.includes(one.label));
    for (const [index, leg] of legs.entries()) {
      // Each engine's first leg runs the /clear too.
      const engineFirst =
        legs.findIndex((one) => one.engine === leg.engine) === index;
      errors.push(...(await legOf(kit, fleet, base, source, leg, engineFirst)));
    }
    if (process.env.PROBE_IDLE !== "0") {
      errors.push(...(await idleLeg(kit, fleet, base, source.id)));
    }
    const seenErrors = errors.filter((one) => MARKS_SEEN.test(one));
    kit.check(
      `no console error from marking seen, through every leg's socket drops, hub restarts, turns, /clear and reloads: ${seenErrors.length}`,
      seenErrors.length === 0,
      seenErrors.slice(0, 4).join(" | ")
    );
    kit.check(
      `no console error on any page: ${errors.length}`,
      errors.length === 0,
      errors.slice(0, 6).join(" | ")
    );
  },
};

export default spec;
