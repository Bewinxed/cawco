/**
 * A long conversation opens, reloads and grows at its latest turn, and a
 * place the reader scrolled up to is kept (the owner, after an update
 * reloaded his page: "why did the chat suddenly jump up to here and see all
 * this random junk", his view thrown far up onto old account-move rows with
 * Jump to latest showing).
 *
 * Then, the same day, "after the compaction spam i see this, seems anything
 * in between was lost until i refresh", and "the pre-compaction content is
 * gone from the transcript ... even after refresh": after a hub restart the
 * list held older pages stitched in and the recent middle dropped, and a
 * fresh load showed nothing older than the latest compaction.
 *
 * A scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with two Claude accounts signed in. One session
 * says 200 turns, each a read and a command and an answer, compacted by
 * Claude Code's own `/compact` three times and moved between the accounts
 * twice along the way, so its history holds hundreds of rows with
 * compaction dividers and account-move rows among them.
 *
 * On Chromium and WebKit, at 1440 and 390, on a fresh page:
 *  1. it opens at its latest turn: the latest row ends inside the view, the
 *     view stands at its end, and Jump to latest is not shown;
 *  2. scrolled up to the start, the list holds every one of the person's
 *     turns the hub's paged walk of the transcript holds, in its order, from
 *     the first; back at the end, it follows again;
 *  3. reloaded as an update reloads it (`location.reload()`), it opens at
 *     its latest turn;
 *  4. a new turn arriving lands in view, the view still following;
 *  5. the hub restarting while a turn streams (an update installing, the
 *     agent coming back on another build), the page left open: it stands at
 *     its latest turn, follows the next, and scrolled up to the start holds
 *     the walk's turns, in order, none missing (Chromium throttled 6x);
 *  6. reloaded while a turn streams its answer, it stands at its latest
 *     row, and follows the answer to its end;
 *  7. scrolled up mid-history by the reader, a new turn arriving leaves the
 *     row at the top of the view where it stood, Jump to latest shown; and
 *     reloaded there, it opens at that row again;
 *  8. no console error on any page, but the browser's own word for the
 *     hub's 502 while it restarts.
 *
 *   bun scripts/probe-kit/run.ts web transcript-latest
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one turn, one leg at a time, as a person takes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../../packages/core/src/claude-dirs";
import { ACCOUNT, until } from "../../../scratch-fleet";
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
const SECOND = "acct-latest-other";
const SECOND_TOKEN = "sk-ant-oat01-fake-scratch-fleet-latest-other";
const TURNS = 200;
/** The file every turn reads. */
const NOTE = "note.txt";
/** A turn asked with this word streams its answer for about 11s. */
const SLOW = "PROBE-STREAM";
/** Every so many turns, a compaction or an account move, in turn. */
const EVENT_EVERY = 40;
/** What marks the summary request of a `/compact`: its focus. */
const FOCUS = "PROBE-COMPACT-FOCUS";
/** The person's words in the hub's walk and in the list, the turns this probe says. */
const SAID =
  /^(turn \d+ of the long conversation|fresh turn|after the restart|later turn)/;

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
  // Each turn works as the owner's agent does: a read and a command, then
  // its answer; a SLOW turn streams its answer for about 11s after them.
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
    if (request.last.includes(SLOW)) {
      return {
        everyMs: 120,
        words: Array.from({ length: 90 }, (_, n) => `word${n} `),
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
        accountUuid: "00000000-0000-4000-8000-000000000093",
        organizationUuid: "00000000-0000-4000-8000-000000000094",
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

interface Place {
  /** The view's distance from its end, px. */
  fromEnd: number;
  jump: boolean;
  /** The latest row ends inside the view. */
  latestInView: boolean;
  latestText: string;
  rows: number;
  /** The row at the top of the view, by its key, and how far it is scrolled past. */
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
    latestText:
      latest?.one.textContent?.replace(/\s+/g, " ").trim().slice(-60) ?? "",
    rows: rows.length,
    top: top
      ? {
          key: top.one.dataset.row ?? "",
          into: Number((view.top - top.box.top).toFixed(1)),
        }
      : null,
  };
}

/** The view, once nothing in it has moved for half a second. */
async function standing(page: Page): Promise<Place | null> {
  let last = "";
  let still = 0;
  for (let tries = 0; tries < 60 && still < 3; tries += 1) {
    await page.waitForTimeout(250);
    const now = JSON.stringify(await page.evaluate(placeNow));
    still = now === last ? still + 1 : 0;
    last = now;
  }
  await settle(page, 200);
  return page.evaluate(placeNow);
}

/** At the latest turn: its row ends in view, Jump to latest not shown, the view at its end. */
const atLatest = (place: Place | null, words: string) =>
  !!place &&
  place.latestInView &&
  !place.jump &&
  place.latestText.includes(words) &&
  place.top !== null;

/** The browser's own line for a request the restarting hub answered 502: not the page's. */
const HUB_DOWN = /status of 502 \(Bad Gateway\)/;

const errorsOf = new WeakMap<Page, string[]>();

async function sessionPage(
  kit: Kit,
  base: string,
  source: string,
  leg: { engine: Engine; view: View }
): Promise<Page> {
  const page = await kit.page(leg.view, { theme: "light", engine: leg.engine });
  const errors: string[] = [];
  errorsOf.set(page, errors);
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !kitsOwnMessage(text) &&
      !HUB_DOWN.test(text)
    ) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
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
  return page;
}

/** The person's turns the hub's paged walk of the transcript holds, oldest first: the walk the owner's hub was read with. */
async function walk(fleet: KitFleet, source: string): Promise<string[]> {
  const said: string[] = [];
  let before: string | null = null;
  for (let pages = 0; pages < 100; pages += 1) {
    const page: {
      blocks: { type?: string; content?: unknown }[];
      cursor: string | null;
    } = await fleet.api(
      `/api/instances/${source}/transcript?limit=200${before ? `&before=${encodeURIComponent(before)}` : ""}`
    );
    said.unshift(
      ...page.blocks.flatMap((block) =>
        block.type === "user" &&
        typeof block.content === "string" &&
        SAID.test(block.content.trim())
          ? [block.content.trim()]
          : []
      )
    );
    if (page.cursor === null) {
      break;
    }
    before = page.cursor;
  }
  return said;
}

/**
 * The person's turns the list holds, oldest first: scrolled to the start
 * until no older page comes in, then read down a view at a time to the end.
 * The view is left at the end.
 */
async function listed(page: Page): Promise<string[]> {
  let still = 0;
  let height = -1;
  for (let tries = 0; tries < 200 && still < 6; tries += 1) {
    const now = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
      if (!scroller) {
        return -1;
      }
      scroller.scrollTop = 0;
      return scroller.scrollHeight;
    });
    await page.waitForTimeout(900);
    still = now === height ? still + 1 : 0;
    height = now;
  }
  const seen: string[] = [];
  for (let steps = 0; steps < 2000; steps += 1) {
    const step = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
      if (!scroller) {
        return { texts: [], end: true };
      }
      // What stands in the view: the list keeps its last rows mounted
      // wherever the view is, and those are read when the view reaches them.
      const view = scroller.getBoundingClientRect();
      const texts = [
        ...scroller.querySelectorAll<HTMLElement>(
          'section[data-slot="turn"][data-you] [data-lift-words]'
        ),
      ]
        .map((one) => ({
          text: one.textContent?.trim() ?? "",
          box: one.getBoundingClientRect(),
        }))
        .filter(({ box }) => box.bottom > view.top && box.top < view.bottom)
        .sort((a, b) => a.box.top - b.box.top)
        .map((one) => one.text);
      const end =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      scroller.scrollTop += Math.round(scroller.clientHeight * 0.6);
      return { texts, end };
    });
    for (const text of step.texts) {
      if (SAID.test(text) && !seen.includes(text)) {
        seen.push(text);
      }
    }
    if (step.end) {
      break;
    }
    await page.waitForTimeout(120);
  }
  return seen;
}

/** The list against the walk: every walked turn held, in the walk's order. */
async function holdsTheWalk(
  kit: Kit,
  fleet: KitFleet,
  source: string,
  page: Page,
  what: string
) {
  const want = await walk(fleet, source);
  // The hub holds every turn said, compactions or not: the walk starts at
  // the first.
  const lost = Array.from(
    { length: TURNS },
    (_, i) => `turn ${i + 1} of the long conversation`
  ).filter((one) => !want.includes(one));
  kit.check(
    `${what}: the hub's paged walk holds all ${TURNS} turns said, from the first, across the compactions`,
    lost.length === 0,
    `${lost.length} lost: ${lost.slice(0, 3).join(" | ")}${lost.length > 3 ? " … " : ""}${lost.slice(-1).join("")}`
  );
  // Read again once if any is missing: an older page still on its way when
  // the first read began is the list's, and in it by the second.
  const first = await listed(page);
  const got = want.every((one) => first.includes(one))
    ? first
    : await listed(page);
  const missing = want.filter((one) => !got.includes(one));
  const order = got.filter((one) => want.includes(one));
  const inOrder = order.every(
    (one, i) =>
      want.indexOf(one) >= (i === 0 ? 0 : want.indexOf(order[i - 1] as string))
  );
  kit.check(
    `${what}: scrolled up to the start, the list holds the ${want.length} turns the hub's walk holds, in its order, from "${want[0]}" (${got.length} read)`,
    want.length > 0 && missing.length === 0 && inOrder,
    JSON.stringify({
      missing: missing.slice(0, 8),
      count: missing.length,
      firstRead: first.length,
      first: got.slice(0, 3),
      last: got.slice(-3),
    })
  );
  // Back at the end, where the reader follows again.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  await page.waitForTimeout(600);
}

/** Reloads the page as an update does, and waits for its list to be drawn. */
async function reload(page: Page) {
  await page.evaluate(() => location.reload());
  const shown = await page
    .waitForSelector("[data-transcript-shown]", { timeout: 60_000 })
    .then(
      () => true,
      () => false
    );
  if (!shown) {
    const state = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
      const listing = document.querySelector<HTMLElement>(
        '[data-slot="listing"]'
      );
      const items = [...(listing?.firstElementChild?.children ?? [])].map(
        (item) => {
          const box = item.getBoundingClientRect();
          return `${Math.round(box.top)}+${Math.round(box.height)}${(item as HTMLElement).style.visibility === "hidden" ? "h" : ""}`;
        }
      );
      return {
        landing: Object.entries(sessionStorage).filter(([key]) =>
          key.startsWith("cawco:landing:")
        ),
        scrollTop: scroller?.scrollTop,
        scrollHeight: scroller?.scrollHeight,
        clientHeight: scroller?.clientHeight,
        view: scroller?.getBoundingClientRect().top,
        items: items.slice(0, 40),
        count: items.length,
      };
    });
    throw new Error(`the list never showed: ${JSON.stringify(state)}`);
  }
}

interface Leg {
  engine: Engine;
  label: string;
  view: View;
}

/** 5. The hub restarts under a streaming turn, the agent back on another build; the page left open. */
async function restartLeg(
  kit: Kit,
  fleet: KitFleet,
  source: string,
  page: Page,
  leg: Leg
) {
  const cdp =
    leg.engine === "chromium" ? await page.context().newCDPSession(page) : null;
  await cdp?.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const during = `${SLOW} stream through a restart for ${leg.label}`;
  await fleet.send(source, during);
  await page.getByText(during, { exact: true }).first().waitFor({
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  // The hub's record of the agent says the build before; the hub restarts
  // while the agent is down and reads the transcript again for its
  // follower; the agent registering on its own build has every transcript
  // of its machine read again (a `reset`).
  fleet.write(
    "UPDATE agents SET build = json_set(build, '$.commit', 'the-build-before')"
  );
  await fleet.stop("agent");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await page.waitForTimeout(4000);
  fleet.launch("agent");
  await fleet.agentUp();
  await until(
    `"${during}" done`,
    () =>
      fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => one?.turn_open_at === null,
    180_000
  );
  const after = `after the restart for ${leg.label}`;
  await say(fleet, source, after);
  await page.getByText(after, { exact: true }).first().waitFor({
    timeout: 90_000,
  });
  const restarted = await standing(page);
  await cdp?.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  kit.check(
    `${leg.label}${cdp ? " (CPU 6x)" : ""}: the hub restarting under a streaming turn leaves the open page at its latest turn, following`,
    atLatest(restarted, LAST),
    JSON.stringify(restarted)
  );
  await holdsTheWalk(
    kit,
    fleet,
    source,
    page,
    `${leg.label}, after the hub restarted, no reload`
  );
}

/** 6. Reloaded while a turn streams its answer, as an update reloads a page whose session is at work. */
async function streamingLeg(
  kit: Kit,
  fleet: KitFleet,
  source: string,
  page: Page,
  leg: Leg
) {
  const streaming = `${SLOW} answer at length for ${leg.label}`;
  const asked = await fleet.send(source, streaming);
  await until(
    `"${streaming}" streaming`,
    () => fleet.sendRow(asked),
    (one) => one?.state === "read",
    120_000
  );
  const live = await page
    .getByText("word3", { exact: false })
    .first()
    .waitFor({ timeout: 60_000 })
    .then(
      () => true,
      () => false
    );
  kit.check(
    `${leg.label}: a turn's answer streams onto the open page as it is written`,
    live,
    JSON.stringify(await page.evaluate(placeNow))
  );
  await reload(page);
  const midTurn = await standing(page);
  kit.check(
    `${leg.label}: reloaded while a turn streams, it stands at its latest row`,
    !!midTurn && midTurn.latestInView && !midTurn.jump && midTurn.top !== null,
    JSON.stringify(midTurn)
  );
  await until(
    `"${streaming}" answered`,
    () =>
      fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => one?.turn_open_at === null,
    120_000
  );
  const streamed = await standing(page);
  kit.check(
    `${leg.label}: the turn streamed to its end in view, the view following`,
    atLatest(streamed, "word89"),
    JSON.stringify(streamed)
  );
}

/** 7. Scrolled up mid-history: kept through a new turn and a reload. */
async function keptLeg(
  kit: Kit,
  fleet: KitFleet,
  source: string,
  page: Page,
  leg: Leg
) {
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-slot="tr"]');
    if (scroller) {
      scroller.scrollTop = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight * 4
      );
    }
  });
  const up = await standing(page);
  await say(fleet, source, `later turn for ${leg.label}`);
  await page.waitForTimeout(1500);
  const kept = await standing(page);
  kit.check(
    `${leg.label}: scrolled up mid-history, a new turn arriving leaves the row at the top where it stood (${up?.top?.key}), Jump to latest shown`,
    !!up?.top &&
      kept?.top?.key === up.top.key &&
      Math.abs((kept?.top?.into ?? 0) - up.top.into) <= 2 &&
      kept?.jump === true,
    JSON.stringify({ up: up?.top, kept: kept?.top, jump: kept?.jump })
  );
  await reload(page);
  const back = await standing(page);
  const landing = await page.evaluate(
    (id) => sessionStorage.getItem(`cawco:landing:${id}`),
    source
  );
  kit.check(
    `${leg.label}: reloaded there, it opens at that row again`,
    !!kept?.top &&
      back?.top?.key === kept.top.key &&
      Math.abs((back?.top?.into ?? 0) - kept.top.into) <= 2,
    JSON.stringify({ kept: kept?.top, back: back?.top, landing })
  );
}

/** One engine and size: every path the person's blocks take into the list. */
async function legOf(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  source: string,
  leg: Leg
): Promise<string[]> {
  const page = await sessionPage(kit, base, source, leg);
  const opened = await standing(page);
  kit.check(
    `${leg.label}: the long conversation opens at its latest turn (${opened?.rows} rows drawn)`,
    atLatest(opened, LAST),
    JSON.stringify(opened)
  );
  await holdsTheWalk(kit, fleet, source, page, `${leg.label}, on a fresh load`);
  const followed = await standing(page);
  kit.check(
    `${leg.label}: back at the end after reading from the start, it stands at its latest turn`,
    atLatest(followed, LAST),
    JSON.stringify(followed)
  );
  await reload(page);
  const reloaded = await standing(page);
  kit.check(
    `${leg.label}: reloaded as an update reloads it, it stands at its latest turn`,
    atLatest(reloaded, LAST),
    JSON.stringify(reloaded)
  );
  const fresh = `fresh turn for ${leg.label}`;
  await say(fleet, source, fresh);
  await page.getByText(fresh, { exact: true }).first().waitFor({
    timeout: 60_000,
  });
  const grew = await standing(page);
  kit.check(
    `${leg.label}: a new turn arriving lands in view, the view still following`,
    atLatest(grew, LAST) && (grew?.fromEnd ?? 99) <= 400,
    JSON.stringify(grew)
  );
  await restartLeg(kit, fleet, source, page, leg);
  await streamingLeg(kit, fleet, source, page, leg);
  await keptLeg(kit, fleet, source, page, leg);
  const errors = (errorsOf.get(page) ?? []).map(
    (one) => `${leg.label}: ${one}`
  );
  await page.close();
  return errors;
}

/** The answer every turn ends on. */
const LAST = "ok";

const spec: Spec = {
  name: "transcript-latest",
  async run(kit) {
    const fleet = await standUp(kit);
    const base = await fleet.dashboard();
    const source = await fleet.spawn("claude", "A long conversation");
    let on = ACCOUNT;
    let compactions = 0;
    for (let turn = 1; turn <= TURNS; turn += 1) {
      await say(fleet, source, `turn ${turn} of the long conversation`);
      if (turn % EVENT_EVERY === 0 && turn < TURNS) {
        if ((turn / EVENT_EVERY) % 2 === 1) {
          compactions += 1;
          await say(fleet, source, `/compact ${FOCUS} ${compactions}`);
        } else {
          on = on === ACCOUNT ? SECOND : ACCOUNT;
          await moveTo(fleet, source, on);
        }
      }
    }
    const boundaries = (await walkAll(fleet, source)).filter(
      (type) => type === "system.compact_boundary"
    ).length;
    kit.check(
      `the conversation holds ${TURNS} turns, ${compactions} compactions (${boundaries} boundaries on the hub) and account moves, on ${on} now`,
      boundaries === compactions &&
        fleet.query<{ account_id: string | null }>(
          "SELECT account_id FROM instances WHERE id = ?",
          source
        )[0]?.account_id === on
    );
    const errors: string[] = [];
    const only = process.env.PROBE_LEGS?.split(",");
    for (const leg of LEGS.filter((one) => !only || only.includes(one.label))) {
      errors.push(...(await legOf(kit, fleet, base, source, leg)));
    }
    kit.check(
      `no console error on any page: ${errors.length}`,
      errors.length === 0,
      errors.slice(0, 6).join(" | ")
    );
  },
};

/** Every block's type the hub's paged walk holds. */
async function walkAll(fleet: KitFleet, source: string): Promise<string[]> {
  const types: string[] = [];
  let before: string | null = null;
  for (let pages = 0; pages < 100; pages += 1) {
    const page: { blocks: { type?: string }[]; cursor: string | null } =
      await fleet.api(
        `/api/instances/${source}/transcript?limit=200${before ? `&before=${encodeURIComponent(before)}` : ""}`
      );
    types.push(...page.blocks.map((block) => block.type ?? ""));
    if (page.cursor === null) {
      break;
    }
    before = page.cursor;
  }
  return types;
}

export default spec;
