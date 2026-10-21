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
 *   its card: its title, the hub's facts (Stopped, its machine), and Open
 *   session to it.
 */
import type { Page, Route } from "playwright-core";
import type {
  FindAnswer,
  FindConversation,
} from "../../../../packages/core/src/find";
import type { InstancesFrame } from "../../../../packages/core/src/frames";
import type { Envelope } from "../../../../packages/core/src/index";
import { WIRE_PROTOCOL } from "../../../../packages/core/src/stream";
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
  await page.keyboard.press("Escape");
  await page.close();
}

const spec: Spec = {
  name: "session-mention",
  async run(kit) {
    const base = await kit.bench();
    const scenes: [string, (k: Kit, b: string) => Promise<void>][] = [
      ["composer", composer],
      ["transcript on chromium", (k, b) => transcript(k, b, "chromium")],
      ["transcript on webkit", (k, b) => transcript(k, b, "webkit")],
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
