/**
 * A session mentioned in a message draws as its chip wherever it lives
 * (session-names.svelte.ts): the owner's report, a mention of a session on
 * another machine, ended days ago and in no list this browser holds,
 * written `@Add image editing to Backlot <bewinxed#d9ba2a7a>`, read as that
 * raw text in the transcript. The hub's names (`GET /api/find`, answered
 * here by the spec as the hub would) hold it; the board does not.
 *
 *   bun scripts/probe-kit/run.ts web session-mention
 *
 * - Composer (the recall bench, Chromium): @ and the title's words offer
 *   the far session; ↵ makes its chip, whose tip says the hub's facts; the
 *   message is sent as `@<title> <handle>`. Put back in a fresh tab (a draft
 *   from another visit) under a label the session no longer has, the chip
 *   is drawn again and told its facts, asked of the hub by its handle.
 * - Transcript (the head-tint bench, the board holding one other session),
 *   on Chromium and WebKit: in the owner's message, the far session's
 *   mention and a board session's (`bench#<id8>`, a short id) draw as their
 *   chips, titled as the hub and the board name them; a handle the hub names
 *   nothing by reads `@<label>`, a machine's mention `@<label>`, and no
 *   `<handle>` is drawn anywhere. In an agent's message the same mention is
 *   the chip, a `cawco:session/<id8>` link is the board session's chip, and
 *   a mention inside a code span stays code. Each chip sits in its line as
 *   a word does (geom.ts `inlineFit`). Pressed, the far session's chip opens
 *   its card: its title, the hub's facts (Stopped, its machine) in its tail
 *   (DelegateTail) where no transcript is waited on, and Open session to it.
 *
 * Every other reader that names the far session by its id draws it from
 * the hub's answer, never "Fleet", "Its session", a bare id or a stand-in
 * word (Chromium):
 * - readers: a delegate's row (it stopped; its harness) and a report's
 *   sender line (a link to it, by its short id).
 * - own page: `/session/<id>`'s document title, its tab's name and its
 *   tab's state (Stopped).
 * - task attempt: a task's attempt on Details, and the session a Review is
 *   from, are named by its title.
 *
 * Its mark wears one hue on the board and off it (session-names.svelte.ts
 * `sessionPlace`): `board row` reads its mark while the board still holds
 * its row (seeded from the row's folder, markHue's rule checked against
 * the fixture's `cwd`), and its chip and card (both engines), its
 * delegate's row and its task attempt on Details and Review, drawn after
 * it aged off, wear that same fill.
 */
import { readFile } from "node:fs/promises";
import type { Page, Route } from "playwright-core";
import type {
  FindAnswer,
  FindConversation,
} from "../../../../packages/core/src/find";
import type { InstancesFrame } from "../../../../packages/core/src/frames";
import type { Envelope } from "../../../../packages/core/src/index";
import { WIRE_PROTOCOL } from "../../../../packages/core/src/stream";
import { commonWords } from "../../../../packages/core/src/words/common";
import { fitsLine, inlineFit } from "../../geom";
import {
  COMPOSER,
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
} from "../../kit";

/** The far session: another machine, another project, ended three days ago. */
const FAR_ID = "d9ba2a7a-5c1e-4b7a-9e2f-3c4d5e6f7a8b";
const FAR_HANDLE = "bewinxed#d9ba2a7a";
const FAR_TITLE = "Add image editing to Backlot";
/** Where it worked: its board row's folder, and the seed of its mark's hue everywhere. */
const FAR_CWD = "/home/bewinxed";
const FAR: FindConversation = {
  kind: "conversation",
  id: FAR_ID,
  instanceId: FAR_ID,
  sessionId: "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b",
  harness: "claude",
  handle: FAR_HANDLE,
  title: FAR_TITLE,
  purpose: null,
  lastReport: null,
  children: { count: 0, needsYou: 0 },
  task: null,
  project: { id: "backlot", name: "backlot" },
  machine: { id: "studio-machine", name: "studio" },
  cwd: FAR_CWD,
  dir: "bewinxed",
  role: "session",
  parent: null,
  state: "ended",
  lastActivity: Date.now() - 3 * 24 * 3_600_000,
  moments: [],
  matched: [],
  score: 1,
};

/** A session the board holds, named by its handle's short id. */
const NEAR_ID = "5e6f7a8b-0000-4000-8000-0000000000aa";
const NEAR_HANDLE = "bench#5e6f7a8b";
const NEAR_TITLE = "Cap the tray chip at its pane";

/** The owner's message, as he sent it, with a board session, an unknown handle and a machine beside it. */
const HIS = `in @${FAR_TITLE} <${FAR_HANDLE}> why is sleecting an acount greyed out? tf? Ask @Cap the tray chip <${NEAR_HANDLE}> too, not @Nobody here <ghost#0badc0de>, and run it on @studio <studio>.`;
/** An agent's answer naming the far session three ways. */
const THEIRS = `Picked up from @${FAR_TITLE} <${FAR_HANDLE}>, beside [the cap work](cawco:session/${NEAR_ID.slice(0, 8)}). The mention as written is \`@${FAR_TITLE} <${FAR_HANDLE}>\`.`;

const SPACES = /\s+/;

/** What the hub's names answer for `q`: the far session for its title's words, its handle or its id. */
function answerFor(q: string): FindAnswer {
  const words = q.toLowerCase();
  const names =
    words.includes("d9ba2a7a") ||
    FAR_TITLE.toLowerCase().startsWith(words.trim()) ||
    words.split(SPACES).every((w) => FAR_TITLE.toLowerCase().includes(w));
  return {
    coverage: { asked: false, machines: [] },
    next: null,
    query: q,
    results: names && words.trim() ? [FAR] : [],
    timing: { namesMs: 1, transcriptsMs: null },
  };
}

/** Answers `GET /api/find` as the hub would, keeping each query asked. */
async function hubNames(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname === "/api/find",
    (route: Route) => {
      const q = new URL(route.request().url()).searchParams.get("q") ?? "";
      asked.push(q);
      return route.fulfill({ json: answerFor(q) });
    }
  );
  return asked;
}

interface Bench {
  draft: { text: string };
  sent: string[];
}

const bench = (page: Page): Promise<{ text: string; sent: string[] }> =>
  page.evaluate(() => {
    const { draft, sent } = (globalThis as unknown as { __recall: Bench })
      .__recall;
    return { text: draft.text, sent: [...sent] };
  });

const CHIP = `${COMPOSER} [data-mention-chip]:not([data-skill-chip])`;

const chipOf = (page: Page) =>
  page.locator(CHIP).evaluateAll((els) =>
    els.map((el) => ({
      label: el.querySelector('[data-slot="label"]')?.textContent?.trim() ?? "",
      handle: (el as HTMLElement).dataset.handle ?? "",
      sends: (el as HTMLElement).dataset.mention ?? "",
      tip: (el as HTMLElement).dataset.tip ?? "",
    }))
  );

async function recallPage(
  kit: Kit,
  base: string
): Promise<{
  page: Page;
  asked: string[];
}> {
  const page = await kit.page("desk", { engine: "chromium" });
  const asked = await hubNames(page);
  await open(page, `${base}/motion/recall`, COMPOSER, 120_000);
  await settle(page, 300);
  return { page, asked };
}

async function composer(kit: Kit, base: string): Promise<void> {
  const { page } = await recallPage(kit, base);
  await page.locator(COMPOSER).click();
  await page.keyboard.type("in @Add image");
  await page.waitForFunction(
    (field) =>
      document
        .querySelector(field)
        ?.getAttribute("aria-activedescendant")
        ?.includes("conversation:") ?? false,
    COMPOSER,
    { timeout: 15_000 }
  );
  await page.keyboard.press("Enter");
  await page.waitForSelector(CHIP, { timeout: 5000 });
  const made = await chipOf(page);
  kit.check(
    "composer: @ and the title's words offer the far session; picked, it is its chip, read as its title, its tip the hub's facts",
    made.length === 1 &&
      made[0]?.label === FAR_TITLE &&
      made[0]?.handle === FAR_HANDLE &&
      made[0]?.tip.includes("Stopped"),
    JSON.stringify(made)
  );
  await page.keyboard.type("why is it greyed out?");
  await page.keyboard.press("Enter");
  await settle(page, 300);
  const { sent } = await bench(page);
  kit.check(
    "composer: the message is sent with the chip as `@<title> <handle>`",
    sent.at(-1) === `in @${FAR_TITLE} <${FAR_HANDLE}> why is it greyed out?`,
    JSON.stringify(sent.at(-1))
  );
  await page.close();

  // A draft from another visit, under a label the session no longer has:
  // this tab made no chip of it, so the hub is asked by its handle.
  const again = await recallPage(kit, base);
  const renamed = `in @Image editing, old name <${FAR_HANDLE}> why is it greyed out?`;
  await again.page.evaluate((words) => {
    (globalThis as unknown as { __recall: Bench }).__recall.draft.text = words;
  }, renamed);
  await again.page.waitForSelector(CHIP, { timeout: 15_000 });
  await again.page.waitForFunction(
    (chip) =>
      (
        document.querySelector(chip) as HTMLElement | null
      )?.dataset.tip?.includes("Stopped") ?? false,
    CHIP,
    { timeout: 15_000 }
  );
  const put = await chipOf(again.page);
  const held = await bench(again.page);
  kit.check(
    "composer: put back in a fresh tab under an old label, the mention is its chip again, told the hub's facts, asked by its handle",
    put.length === 1 &&
      put[0]?.label === "Image editing, old name" &&
      put[0]?.tip.includes("Stopped") &&
      again.asked.includes(FAR_HANDLE) &&
      held.text === renamed,
    JSON.stringify({ put, asked: again.asked, text: held.text })
  );
  await again.page.close();
}

/** The head-tint bench's shown session (`?at=1`). */
const SHOWN = "1a2b3c4d-0000-4000-8000-000000000002";

/** The board as the hub's first frame says it: one session, NEAR, on the bench machine. */
const BOARD: Envelope<InstancesFrame> = {
  verb: "frames",
  machineId: "hub",
  payload: {
    kind: "instances",
    agents: [],
    continuations: [],
    formerIds: {},
    handoffs: {},
    hubBuild: { startedAt: 0, version: "0.0.0" },
    instances: [
      {
        cwd: "/bench",
        harness: "claude",
        id: NEAR_ID,
        kind: "mainline",
        launchDir: "known",
        machineId: "bench",
        sessionId: null,
        status: "running",
        title: NEAR_TITLE,
      },
    ],
    moves: [],
    noticesSeen: [],
    protocol: WIRE_PROTOCOL,
    pulses: {},
  },
};

/** The board while the far session was still on it (it moved within a day): NEAR and FAR. */
const BOARD_WITH_FAR: Envelope<InstancesFrame> = {
  ...BOARD,
  payload: {
    ...BOARD.payload,
    instances: [
      ...BOARD.payload.instances,
      {
        cwd: FAR_CWD,
        harness: "claude",
        id: FAR_ID,
        kind: "mainline",
        launchDir: "known",
        machineId: "studio-machine",
        sessionId: null,
        status: "stopped",
        title: FAR_TITLE,
      },
    ],
  },
};

/**
 * The far session's mark fill on its board row (the rail's SessionRow),
 * read by the `board row` scene while the board held it: every other mark
 * of it, drawn after it aged off, is held to this.
 */
let boardFill: string | null = null;

/** A mark's fill as drawn: a session mark's `--mark-bg`, a tree mark's `--fill`. */
const fillOf = (page: Page, selector: string): Promise<string | null> =>
  page
    .locator(selector)
    .first()
    .evaluate(
      (el) =>
        (el as HTMLElement).style.getPropertyValue("--fill") ||
        (el as HTMLElement).style.getPropertyValue("--mark-bg") ||
        null
    );

/**
 * A mark's hue from its seed, by markHue's rule (dashboard mark.ts, which
 * the spec cannot load: it imports the icon components): the folder a
 * board row seeds from gives the fill every mark of that session wears.
 */
const hueOf = (seed: string): string => {
  let h = 0;
  for (const c of seed) {
    // biome-ignore lint/suspicious/noBitwiseOperators: markHue's 32-bit hash, as mark.ts writes it
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return `var(--mark-${(Math.abs(h) % 8) + 1})`;
};

/**
 * The far session while the board still held its row (it moved within a
 * day): its chip, its mark seeded from its row's folder as its board row
 * (SessionRow) seeds it. The benches draw no board row without a hub (the
 * rail lists projects; Working and Finished need the hub's live frames),
 * so its mark's fill is held to the row's folder by markHue's rule too.
 */
async function boardRow(kit: Kit, base: string): Promise<void> {
  const page = await benchWith(
    kit,
    base,
    [
      {
        id: "mention-held",
        type: "user",
        content: HIS,
        timestamp: new Date().toISOString(),
      },
    ],
    {},
    BOARD_WITH_FAR
  );
  const chip = `[data-pane="${SHOWN}"] [data-session-chip="${FAR_ID}"] [data-slot="mark"]`;
  await page.waitForSelector(chip, { timeout: 15_000 });
  boardFill = await fillOf(page, chip);
  kit.note(
    `board row: the far session's mark on the board is ${boardFill}; its folder ${FAR_CWD} is ${hueOf(FAR_CWD)}`
  );
  kit.check(
    "board row: while the board holds it, the far session's mark is seeded from its row's folder",
    boardFill === hueOf(FAR_CWD),
    JSON.stringify({ drawn: boardFill, folder: hueOf(FAR_CWD) })
  );
  await page.close();
}

/** Checks a mark of the far session drawn off the board wears its board row's fill. */
const sameHue = (kit: Kit, what: string, fill: string | null): void => {
  kit.check(
    `${what}: the far session's mark wears its board row's hue (${boardFill})`,
    boardFill !== null && fill === boardFill,
    JSON.stringify({ board: boardFill, here: fill })
  );
};

/** What one message's box reads: its chips, its words, its links and code. */
const readMessage = (page: Page, holding: string) =>
  page.evaluate(
    ([pane, words]) => {
      const box = [
        ...document.querySelectorAll(`[data-pane="${pane}"] [data-slot="msg"]`),
      ].find((el) => el.textContent?.includes(words));
      return {
        found: !!box,
        chips: [...(box?.querySelectorAll("[data-session-chip]") ?? [])].map(
          (el) => ({
            id: el.getAttribute("data-session-chip"),
            title:
              el.querySelector('[data-slot="label"]')?.textContent?.trim() ??
              "",
          })
        ),
        words: box?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        anchors: box?.querySelectorAll("a").length ?? -1,
        code: [...(box?.querySelectorAll("code") ?? [])].map(
          (el) => el.textContent ?? ""
        ),
      };
    },
    [SHOWN, holding] as const
  );

async function transcript(
  kit: Kit,
  base: string,
  engine: Engine
): Promise<void> {
  const page = await kit.page("desk", { engine });
  const asked = await hubNames(page);
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(BOARD));
    }
  );
  await open(page, `${base}/motion/head-tint`, "[data-head-tint]", 120_000);
  await page.waitForFunction(() => "__ht" in window);
  await page.evaluate(
    ([shown, owner, agent]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              sessions: Record<string, { messages: Record<string, unknown>[] }>;
            };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[shown];
      const at = Date.now();
      session.messages = [
        ...session.messages,
        {
          id: "mention-his",
          instanceId: shown,
          type: "user",
          content: owner,
          timestamp: new Date(at).toISOString(),
        },
        {
          id: "mention-theirs",
          instanceId: shown,
          type: "assistant",
          content: agent,
          timestamp: new Date(at + 1000).toISOString(),
        },
      ];
    },
    [SHOWN, HIS, THEIRS] as const
  );
  const farChip = `[data-pane="${SHOWN}"] [data-session-chip="${FAR_ID}"]`;
  await page.waitForFunction(
    (chip) => document.querySelectorAll(chip).length >= 2,
    farChip,
    { timeout: 15_000 }
  );
  await settle(page, 300);
  const his = await readMessage(page, "greyed out");
  kit.note(`transcript on ${engine}, his message reads: ${his.words}`);
  kit.check(
    `transcript on ${engine}: in his message, the far session (another machine, ended, on no board) and a board session by its short id draw as their chips, titled as the hub and the board name them`,
    his.found &&
      his.chips.length === 2 &&
      his.chips[0]?.id === FAR_ID &&
      his.chips[0]?.title === FAR_TITLE &&
      his.chips[1]?.id === NEAR_ID &&
      his.chips[1]?.title === NEAR_TITLE,
    JSON.stringify(his.chips)
  );
  kit.check(
    `transcript on ${engine}: a handle the hub names nothing by, and a machine's mention, read as @<label>; no <handle> is drawn, and nothing is a link`,
    his.words.includes("not @Nobody here, and run it on @studio.") &&
      !his.words.includes("<") &&
      !his.words.includes("#0badc0de") &&
      his.anchors === 0,
    his.words
  );
  kit.check(
    `transcript on ${engine}: the hub was asked for the far session by its handle`,
    asked.includes(FAR_HANDLE),
    JSON.stringify(asked)
  );
  const theirs = await readMessage(page, "Picked up from");
  kit.check(
    `transcript on ${engine}: in an agent's message, the mention is the far session's chip and a cawco:session/<id8> link the board session's; a mention in a code span stays code`,
    theirs.found &&
      theirs.chips.map((c) => c.id).join(",") === `${FAR_ID},${NEAR_ID}` &&
      theirs.code.includes(`@${FAR_TITLE} <${FAR_HANDLE}>`) &&
      theirs.anchors === 0,
    JSON.stringify({ chips: theirs.chips, code: theirs.code })
  );
  const fit = await page.locator(farChip).first().evaluate(inlineFit);
  kit.note(
    `transcript on ${engine}, the far chip's fit: ${JSON.stringify(fit)}`
  );
  kit.check(
    `transcript on ${engine}: the far chip sits in its line as a word does (label on the baseline within 1px, lines their line-height)`,
    fitsLine(fit),
    JSON.stringify({
      delta: fit.delta,
      pitches: fit.pitches,
      lineHeight: fit.lineHeight,
    })
  );

  await page.locator(farChip).first().click();
  const panelId = await page
    .locator(farChip)
    .first()
    .getAttribute("aria-controls");
  const panel = `[id="${panelId}"]`;
  await page.waitForSelector(panel, { timeout: 5000 });
  await settle(page, 400);
  const card = await page.evaluate((p) => {
    const el = document.querySelector(p);
    const action = el?.querySelector<HTMLAnchorElement>('[data-slot="acts"] a');
    return {
      title:
        el
          ?.querySelector('[data-slot="head"] [data-slot="title"]')
          ?.textContent?.trim() ?? null,
      facts:
        el?.querySelector('[data-slot="facts"]')?.textContent?.trim() ?? null,
      loading: !!el?.querySelector('[aria-label="Loading its transcript"]'),
      href: action?.getAttribute("href") ?? null,
    };
  }, panel);
  kit.check(
    `transcript on ${engine}: pressed, the far chip opens its card: its title, the hub's facts, Open session to it, no transcript waited on`,
    card.title === FAR_TITLE &&
      (card.facts ?? "").includes("Stopped") &&
      (card.facts ?? "").includes("studio") &&
      !card.loading &&
      card.href === `/session/${FAR_ID}`,
    JSON.stringify(card)
  );
  sameHue(
    kit,
    `transcript on ${engine}, its chip`,
    await fillOf(page, `${farChip} [data-slot="mark"]`)
  );
  sameHue(
    kit,
    `transcript on ${engine}, its card`,
    await fillOf(page, `${panel} [data-slot="head"] [data-slot="mark"]`)
  );
  await page.keyboard.press("Escape");
  await page.close();
}

/** The head-tint bench under the board (NEAR only) and the hub's names, its shown transcript given `messages`. */
async function benchWith(
  kit: Kit,
  base: string,
  messages: Record<string, unknown>[],
  answers: Record<string, unknown> = {},
  board: Envelope<InstancesFrame> = BOARD
): Promise<Page> {
  const page = await kit.page("desk", { engine: "chromium" });
  await hubNames(page);
  await page.route(
    (url) => url.pathname in answers,
    (route: Route) =>
      route.fulfill({
        json: answers[new URL(route.request().url()).pathname],
      })
  );
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(board));
    }
  );
  await open(page, `${base}/motion/head-tint`, "[data-head-tint]", 120_000);
  await page.waitForFunction(() => "__ht" in window);
  await page.evaluate(
    ([shown, rows]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              sessions: Record<string, { messages: Record<string, unknown>[] }>;
            };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[shown];
      session.messages = [
        ...session.messages,
        ...rows.map((row) => ({ ...row, instanceId: shown })),
      ];
    },
    [SHOWN, messages] as const
  );
  return page;
}

/**
 * Readers in a transcript that name the far session by its id: a
 * delegate's row (it was this session's delegate, three days ago) and a
 * report's sender line (its short id, as a report names it).
 */
async function readers(kit: Kit, base: string): Promise<void> {
  const at = Date.now();
  const page = await benchWith(kit, base, [
    {
      id: "far-delegate",
      type: "tool.handoff",
      content: "",
      timestamp: new Date(at).toISOString(),
      metadata: {
        handoffKind: "delegate",
        delegateInstanceId: FAR_ID,
        delegateTitle: FAR_TITLE,
        handoffBrief: "Add image editing to the take view.",
        toolName: "mcp__cawco__delegate",
        toolInput: { title: FAR_TITLE },
        toolStatus: "success",
      },
    },
    {
      id: "far-report",
      type: "user.peer",
      content: "Image editing is in the take view.",
      timestamp: new Date(at + 1000).toISOString(),
      metadata: {
        peerSession: FAR_ID.slice(0, 8),
        peerName: FAR_TITLE,
        reportKind: "done",
        reportHeadline: "Image editing is in the take view",
      },
    },
  ]);
  const pane = `[data-pane="${SHOWN}"]`;
  await page.waitForSelector(`${pane} [data-delegate-tone]`, {
    timeout: 15_000,
  });
  // The hub is asked once a reader draws it; its answer lands after.
  await settle(page, 1500);
  const read = await page.evaluate((p) => {
    const head = [...document.querySelectorAll(`${p} [data-slot="head"]`)].find(
      (el) => el.querySelector("[data-delegate-tone]")
    );
    const sender = [
      ...document.querySelectorAll(`${p} [data-slot="name"]`),
    ].find(
      (el) =>
        el.closest("[data-slot]")?.textContent?.includes("Report from") ||
        el.parentElement?.textContent?.includes("Report from")
    );
    return {
      pill:
        head?.querySelector("[data-delegate-tone]")?.textContent?.trim() ??
        null,
      tone:
        head
          ?.querySelector("[data-delegate-tone]")
          ?.getAttribute("data-tone") ?? null,
      meta: [...(head?.querySelectorAll('[data-slot="meta"]') ?? [])].map(
        (el) => el.textContent?.trim() ?? ""
      ),
      sender: sender
        ? {
            tag: sender.tagName.toLowerCase(),
            href: sender.getAttribute("href"),
          }
        : null,
    };
  }, pane);
  kit.note(`readers, as drawn: ${JSON.stringify(read)}`);
  kit.check(
    "readers: a delegate's row for the far session says it stopped and its harness, from the hub's answer",
    (read.pill ?? "").startsWith("stopped") && read.meta.includes("claude"),
    JSON.stringify(read)
  );
  sameHue(
    kit,
    "readers, a delegate's row",
    await fillOf(
      page,
      `${pane} [data-slot="head"]:has([data-delegate-tone]) [data-slot="mark"]`
    )
  );
  kit.check(
    "readers: a report's sender line links the far session by its short id, to its own view",
    read.sender?.tag === "a" && read.sender.href === `/session/${FAR_ID}`,
    JSON.stringify(read.sender)
  );
  await page.close();
}

/**
 * The far session's own page, opened from its chip's "Open session": the
 * document's title, its tab's name and its tab's state, named by the hub's
 * answer (the dev server has no hub: its own reads of the session fail).
 */
async function ownPage(kit: Kit, base: string): Promise<void> {
  const serverSaid = await serverLog(base);
  const page = await kit.page("desk", { engine: "chromium" });
  const asked = await hubNames(page);
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(BOARD));
    }
  );
  await open(
    page,
    `${base}/session/${FAR_ID}`,
    `[data-session-tab="${FAR_ID}"]`,
    120_000
  );
  await settle(page, 1500);
  const read = await page.evaluate((id) => {
    const tab = document.querySelector(`[data-session-tab="${id}"]`);
    const strip = tab?.closest('[data-slot="tab"]');
    return {
      title: document.title,
      tab: strip?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      status:
        strip?.querySelector("[aria-label]")?.getAttribute("aria-label") ??
        null,
    };
  }, FAR_ID);
  kit.note(`own page, as drawn: ${JSON.stringify(read)}`);
  kit.check(
    "own page: the document is titled by the far session's title, not Fleet",
    read.title.startsWith(FAR_TITLE),
    read.title
  );
  kit.check(
    "own page: its tab is named by the far session's title",
    (read.tab ?? "").includes(FAR_TITLE),
    JSON.stringify(read.tab)
  );
  kit.check(
    "own page: its tab says the far session stopped (as the hub has it), not Stored",
    (read.status ?? "").includes("Stopped") &&
      !(read.status ?? "").includes("Stored"),
    JSON.stringify(read.status)
  );
  const naming = (await serverSaid()).filter((line) =>
    line.includes("[cawco] naming")
  );
  kit.check(
    "own page: loaded cold, the server renders it without asking the hub's names (no `[cawco] naming … failed` in its log); the browser asked, by its own origin, and the name arrived",
    naming.length === 0 && asked.includes(FAR_ID),
    JSON.stringify({ naming: naming.slice(0, 3), asked })
  );
  await page.close();
}

/**
 * What the bench's dev server prints to its stderr from now on (kit.ts
 * `serve`: `$TMPDIR/probe-kit/vite-dev-<port>.err.log`), as lines.
 */
async function serverLog(base: string): Promise<() => Promise<string[]>> {
  const file = `${process.env.TMPDIR ?? ".probe"}/probe-kit/vite-dev-${new URL(base).port}.err.log`;
  const read = () => readFile(file).catch(() => Buffer.alloc(0));
  const from = (await read()).length;
  return async () =>
    (await read()).subarray(from).toString("utf8").split("\n").filter(Boolean);
}

/**
 * A task's sheet (TaskPane): its attempt, run by the far session three days
 * ago, is named by that session's title. The project page's reads are
 * answered as the hub would; the page is reached by a client navigation, so
 * its load runs in the browser where they are answered.
 */
async function taskAttempt(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { engine: "chromium" });
  await hubNames(page);
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(BOARD));
    }
  );
  const at = Date.now() - 3 * 24 * 3_600_000;
  const stamp = new Date(at).toISOString();
  const project = {
    id: "backlot",
    name: "backlot",
    caw: false,
    cawHarness: "claude",
    cawModel: null,
    createdAt: stamp,
    lands: "main",
    leadInstanceId: null,
    lfsConnection: null,
    lfsUrl: null,
    places: [
      {
        createdAt: stamp,
        id: "place-1",
        isPrimary: true,
        kind: "checkout",
        machineId: "studio-machine",
        path: "/backlot",
        projectId: "backlot",
      },
    ],
    primaryPlaceId: "place-1",
    remote: null,
    review: false,
    upstreamPosts: null,
  };
  const attempt = {
    endedAt: at,
    endedHow: null,
    headline: "Image editing is in the take view",
    instanceId: FAR_ID,
    result: null,
    startedAt: at - 3_600_000,
    state: "done",
    workItemId: "wi-1",
  };
  const flags = {
    attempts: [attempt],
    blockedBy: [],
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    liveAttempt: false,
    queuedStart: false,
    startProblem: null,
  };
  const summary = {
    ...flags,
    after: [],
    duplicateOf: null,
    fields: {},
    foundIn: null,
    id: "tsk-1",
    kind: "done",
    labels: [],
    needsYou: false,
    number: 1,
    outputs: [],
    parent: null,
    path: "tasks/tsk-1.md",
    problem: null,
    rank: null,
    related: [],
    stage: "done",
    title: "Image editing in the take view",
    todos: { done: 0, total: 0 },
    type: null,
    createdAt: at,
    updatedAt: at,
  };
  const view = {
    ...summary,
    acceptance: "",
    checks: [],
    comments: [],
    description: "Edit a take's frames in place.",
    extra: {},
    hash: "0",
    issue: null,
    lands: null,
    problems: [],
    result: null,
    sections: [],
    todos: [],
  };
  /** A second task, waiting on you in review: its sheet opens on Review (TaskReview). */
  const inReview = {
    ...summary,
    id: "tsk-2",
    number: 2,
    path: "tasks/tsk-2.md",
    stage: "review",
    kind: "you",
    title: "Crop in the take view",
  };
  const history = (id: string) => ({
    events: [],
    id,
    path: `tasks/${id}.md`,
    state: "live",
  });
  const answers: Record<string, unknown> = {
    "/api/projects": [project],
    "/api/agents": [],
    "/api/projects/backlot/tasks": {
      problems: [],
      stagesProblems: [],
      tasks: [summary, inReview],
    },
    "/api/projects/backlot/stages": {
      decisionStarters: [],
      moves: [],
      problems: [],
      routineStarters: [],
      source: "template",
      stages: [
        { name: "review", kind: "you", hooks: {} },
        { name: "done", kind: "done", hooks: {} },
      ],
      starters: [],
      template: null,
      views: [],
    },
    "/api/projects/backlot/tasks/tsk-1": view,
    "/api/projects/backlot/tasks/tsk-1/history": history("tsk-1"),
    "/api/projects/backlot/tasks/tsk-2": { ...view, ...inReview },
    "/api/projects/backlot/tasks/tsk-2/history": history("tsk-2"),
  };
  await page.route(
    (url) => url.pathname in answers,
    (route: Route) =>
      route.fulfill({
        json: answers[new URL(route.request().url()).pathname],
      })
  );
  // Any page of the app, then the project's by a link: SvelteKit takes the
  // click and runs the project page's load here.
  await open(page, `${base}/motion/recall`, COMPOSER, 120_000);
  const sheet = async (task: string, row: string): Promise<string> => {
    await page.evaluate((to) => {
      const link = document.createElement("a");
      link.href = `/project/backlot?task=${to}`;
      link.id = `to-${to}`;
      link.textContent = to;
      link.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647";
      document.body.append(link);
    }, task);
    await page.locator(`#to-${task}`).click();
    await page.waitForSelector(row, { timeout: 30_000 });
    await settle(page, 1500);
    return page
      .locator(row)
      .first()
      .evaluate((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "");
  };
  const attempted = await sheet("tsk-1", '[data-slot="session"]');
  kit.note(`task attempt, the attempt reads: ${attempted}`);
  kit.check(
    "task attempt: on a task's Details, the attempt the far session ran is named by its title, not Its session",
    attempted.includes(FAR_TITLE) &&
      !attempted.includes(commonWords.itsSession),
    attempted
  );
  sameHue(
    kit,
    "task attempt, on Details",
    await fillOf(page, '[data-slot="session"] [data-tree-mark]')
  );
  const review = await sheet(
    "tsk-2",
    `[data-band="result"] [data-session="${FAR_ID}"]`
  );
  kit.note(`task attempt, the review's session reads: ${review}`);
  kit.check(
    "task attempt: on a task's Review, the session it is from (the far session) is named by its title, not Its session",
    review.includes(FAR_TITLE) && !review.includes(commonWords.itsSession),
    review
  );
  sameHue(
    kit,
    "task attempt, on Review",
    await fillOf(
      page,
      `[data-band="result"] [data-session="${FAR_ID}"] [data-tree-mark]`
    )
  );
  await page.close();
}

const spec: Spec = {
  name: "session-mention",
  async run(kit) {
    const base = await kit.bench();
    const scenes: [string, (k: Kit, b: string) => Promise<void>][] = [
      // First: the hue every later mark of the far session is held to.
      ["board row", boardRow],
      ["composer", composer],
      ["transcript on chromium", (k, b) => transcript(k, b, "chromium")],
      ["transcript on webkit", (k, b) => transcript(k, b, "webkit")],
      ["readers", readers],
      ["own page", ownPage],
      ["task attempt", taskAttempt],
    ];
    for (const [name, scene] of scenes) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one scene at a time
        await scene(kit, base);
      } catch (error) {
        kit.check(`${name}: runs`, false, String(error));
      }
    }
  },
};
export default spec;
