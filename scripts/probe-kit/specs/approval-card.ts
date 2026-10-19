/**
 * The approval card (transcript/Prompt.svelte), as the owner picks it on its
 * canvas: every story of Prompt.stories.ts drawn live by the dashboard's own
 * stage (stage-host/host.ts, bundled and started in apps/dashboard as the
 * daemon starts it, minus the workspace boundary), at 390, 680 and 1440 in
 * light and dark, read from the stage's render report and the frames' own
 * DOM, never from pixels:
 *
 * 0. As the owner's panel opens it (no width asked, each frame at its
 *    story's own form), every states file the decision page shows (the
 *    sheet, each option's, today's card and today's tool row): no error;
 *    every frame drawn at its story's width, none failed; every card's
 *    content box at least 340 wide in its 390 frame; no text wrapping onto
 *    a second line in a box narrower than 120px; and each card drawn as a
 *    story with no form draws it (its frame body at its own width) still
 *    at least 340 wide. The card once reached his screen 24 px wide
 *    (`drawn 24×7206`), a sentence a word a line: it was an inline-size
 *    container (`container: ask / inline-size`), and size containment
 *    gives a box no width of its own, so in a frame that sets its child at
 *    its own width the card stood at the frame body's 24px floor.
 * 1. The canvas page logs no error and its report none.
 * 2. Every story is drawn, none empty, in every width and scheme.
 * 3. The card's content box is at least 340 wide at 390, and the card as
 *    wide as its column at 1440.
 * 4. The head's chips, the grant line, the reason and the count line never
 *    overlap one another, and stand inside the card.
 * 5. Nothing spills past the card at 390, 680 or 1440, light or dark: every
 *    box that is not clipped on purpose stands inside it (a sum, zero).
 * 6. Each story's words are the ones core's `presentPermission` gives its
 *    ask: the grant line, the reason, the count line, each setting's before
 *    and after, each consequence and the bound line.
 * 7. The link chips go where report 1's table says.
 * 8. The decided foot comes in over the answer row on the engine's clock:
 *    the move McpWaiting → McpApproved fires the row's fade out on
 *    --dur-exit and the decided mark's fade in on --dur-fade, both on
 *    --ease-out.
 * 9. Undo on an approved removal: pressed, the card says Restored; left
 *    alone, it leaves once the hub's minute is out.
 * 10. On a scratch fleet (real hub, agent and sessiond; Claude Code against
 *    the mock model): an MCP server removal asked for and approved puts the
 *    server in the hub's trash; the trash's restore (the call Undo makes)
 *    brings it back whole within the window; a second removal's restore
 *    after the window is refused, in words.
 *
 * One capture per story at 390 and 1440, light and dark, the frame alone,
 * go to the clone's `caps/approval-card/`; this spec never reads them.
 *
 *   bun scripts/probe-kit/run.ts approval-card
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  ASKS,
  type AskFixture,
  contextOf,
} from "../../../apps/dashboard/src/lib/cawco/transcript/prompt-fixtures";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import {
  countWords,
  type PermissionPresentation,
  presentPermission,
} from "../../../packages/core/src/permission-presentation";
import type {
  FrameRender,
  RenderReport,
} from "../../../packages/core/src/stage";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const FILE = "src/lib/cawco/transcript/Prompt.stories.ts";
const WIDTHS = [390, 680, 1440] as const;
const SCHEMES = ["light", "dark"] as const;
const SPACES = /\s+/g;
const RESTORE = /\\?"restore\\?":\s*(\d+)/;
const CAPS = join(ROOT, "caps/approval-card");

/** Each story's ask, and the chips its card should link (report 1, "Where each chip goes"). */
const STORIES: Record<
  string,
  { ask: AskFixture; decided?: boolean; links: string[] }
> = {
  McpWaiting: {
    ask: ASKS.mcpEdit,
    links: ["/session/s-mobbin", "/project/p-mobbin", "/config/mcp/mobbin-web"],
  },
  McpPending: {
    ask: ASKS.mcpEdit,
    links: ["/session/s-mobbin", "/project/p-mobbin", "/config/mcp/mobbin-web"],
  },
  McpRefused: {
    ask: ASKS.mcpEdit,
    links: ["/session/s-mobbin", "/project/p-mobbin", "/config/mcp/mobbin-web"],
  },
  McpOffline: {
    ask: ASKS.mcpEdit,
    links: ["/session/s-mobbin", "/project/p-mobbin", "/config/mcp/mobbin-web"],
  },
  McpApproved: { ask: ASKS.mcpEdit, decided: true, links: [] },
  McpDenied: { ask: ASKS.mcpEdit, decided: true, links: [] },
  McpWithdrawn: { ask: ASKS.mcpEdit, decided: true, links: [] },
  MemoryWaiting: { ask: ASKS.memory, links: ["/project/p-cawco"] },
  MemoryApproved: { ask: ASKS.memory, decided: true, links: [] },
  ShellWaiting: { ask: ASKS.shell, links: ["/project/p-cockpit"] },
  ShellWiden: { ask: ASKS.shellWiden, links: ["/project/p-cockpit"] },
  ManyFields: {
    ask: ASKS.manyFields,
    links: [
      "/session/s-caw",
      "/project/p-cockpit",
      "/config/delegate-types/researcher",
    ],
  },
  LongTarget: {
    ask: ASKS.longTarget,
    links: [
      "/session/s-caw",
      "/project/p-cockpit",
      "/config/memory/projects/better-mobbin-mcp/handover/oauth-proxy-for-every-machine.md",
    ],
  },
  NoProject: { ask: ASKS.noProject, links: [] },
  Proposer: { ask: ASKS.proposer, links: ["/project/p-cockpit"] },
  RemoveWaiting: {
    ask: ASKS.remove,
    links: ["/project/p-cockpit", "/config/mcp/mobbin-stdio"],
  },
  RemoveApproved: { ask: ASKS.remove, decided: true, links: [] },
  RemoveRestored: { ask: ASKS.remove, decided: true, links: [] },
  InstallWaiting: {
    ask: ASKS.install,
    links: [
      "/project/p-cockpit",
      "/config/skills",
      "https://github.com/interfaces/skills",
    ],
  },
};

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** Console errors, page errors and refused loads a page logged, kept as it runs: a refused load by its address and the server's first words. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n")[0] ?? "");
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      response
        .text()
        .catch(() => "")
        .then((body) =>
          errors.push(
            `${response.status()} ${response.url()}: ${body.replace(SPACES, " ").slice(0, 400)}`
          )
        );
    }
  });
  return errors;
}

/** The page's newest report once every section has its frames, after the page went quiet. */
async function reportOn(page: Page): Promise<RenderReport> {
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as { __cawcoCanvas?: { report: RenderReport | null } }
      ).__cawcoCanvas;
      return (
        !!state?.report &&
        state.report.sections.length > 0 &&
        state.report.sections.every((one) =>
          one.frames.every((frame) => frame.state !== "unseen")
        )
      );
    },
    null,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(4000);
  return page.evaluate(
    () =>
      (window as unknown as { __cawcoCanvas: { report: RenderReport } })
        .__cawcoCanvas.report
  );
}

/** What one frame's card shows, read from its DOM. */
interface CardRead {
  bound: string | null;
  cardWidth: number;
  columnWidth: number;
  consequences: string[];
  /** The card's content box, inside its padding. */
  content: number;
  count: string | null;
  grant: string | null;
  links: string[];
  overlaps: string[];
  reason: string | null;
  spills: string[];
  well: string[];
}

/** The body of the frame of `story` at `width` in `scheme`, at rest. */
const frameOf = (story: string, width: number, scheme: string) =>
  `.cawco-frame[data-cawco-story="${story}"][data-cawco-width="${width}"][data-cawco-scheme="${scheme}"][data-cawco-interaction="rest"] .cawco-frame-body`;

/** The card's words and widths, in the page. */
function cardFacts(frame: string) {
  const card = document.querySelector<HTMLElement>(
    `${frame} [data-slot="hitl"]`
  );
  if (!card) {
    return null;
  }
  const words = (el: Element | null) =>
    el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : null;
  const all = (selector: string) =>
    [...card.querySelectorAll(selector)].map((el) => words(el) ?? "");
  return {
    bound: words(card.querySelector('[data-slot="bound"]')),
    cardWidth: card.offsetWidth,
    content:
      card.clientWidth -
      Number.parseFloat(getComputedStyle(card).paddingInlineStart) -
      Number.parseFloat(getComputedStyle(card).paddingInlineEnd),
    columnWidth: (card.parentElement as HTMLElement).clientWidth,
    consequences: all('[data-slot="consequence"] .consequence-words'),
    count: words(card.querySelector('[data-slot="count"]')),
    grant: words(card.querySelector('[data-slot="grant-words"]')),
    links: [...card.querySelectorAll("a[href]")].map(
      (a) => a.getAttribute("href") ?? ""
    ),
    reason: words(card.querySelector('[data-slot="reason"]')),
    well: all('[data-slot="well"] [data-slot="prompt-field"]'),
  };
}

/** The head's chips, the grant line, the reason and the count line: any two that overlap, or any outside the card, in the page. */
function cardOverlaps(frame: string): string[] {
  const card = document.querySelector<HTMLElement>(
    `${frame} [data-slot="hitl"]`
  );
  if (!card) {
    return ["no card"];
  }
  const box = card.getBoundingClientRect();
  // The canvas may draw the world scaled: say lengths in the card's own units.
  const scale = box.width / card.offsetWidth || 1;
  const edge = 0.5 * scale;
  const named = [
    ...[...card.querySelectorAll('[data-slot="head"] [data-slot="chip"]')].map(
      (el, at) => ({ name: `chip${at}`, rect: el.getBoundingClientRect() })
    ),
    ...["grant", "reason", "count"].flatMap((slot) => {
      const el = card.querySelector(`[data-slot="${slot}"]`);
      return el ? [{ name: slot, rect: el.getBoundingClientRect() }] : [];
    }),
  ];
  const outside = named
    .filter(
      ({ rect }) =>
        rect.left < box.left - edge ||
        rect.right > box.right + edge ||
        rect.top < box.top - edge
    )
    .map(({ name }) => `${name} outside the card`);
  const crossed = named.flatMap((a, at) =>
    named.slice(at + 1).flatMap((b) => {
      const x =
        Math.min(a.rect.right, b.rect.right) -
        Math.max(a.rect.left, b.rect.left);
      const y =
        Math.min(a.rect.bottom, b.rect.bottom) -
        Math.max(a.rect.top, b.rect.top);
      return x > edge && y > edge
        ? [
            `${a.name} × ${b.name} by ${(x / scale).toFixed(1)}×${(y / scale).toFixed(1)}`,
          ]
        : [];
    })
  );
  return [...outside, ...crossed];
}

/** Every box past the card's sides that no box inside the card clips on purpose, in the page. */
function cardSpills(frame: string): string[] {
  const card = document.querySelector<HTMLElement>(
    `${frame} [data-slot="hitl"]`
  );
  if (!card) {
    return ["no card"];
  }
  const box = card.getBoundingClientRect();
  const scale = box.width / card.offsetWidth || 1;
  const edge = 0.5 * scale;
  const clipped = (el: Element): boolean => {
    const up = el.parentElement;
    if (!up || up === card) {
      return false;
    }
    return getComputedStyle(up).overflowX !== "visible" || clipped(up);
  };
  const sideways =
    card.scrollWidth > card.clientWidth + 1
      ? [`card scrolls sideways ${card.scrollWidth} > ${card.clientWidth}`]
      : [];
  return [
    ...sideways,
    ...[...card.querySelectorAll("*")].flatMap((el) => {
      const rect = el.getBoundingClientRect();
      const past = rect.left < box.left - edge || rect.right > box.right + edge;
      return rect.width > 0 && past && !clipped(el)
        ? [
            `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${((rect.right - box.right) / scale).toFixed(1)}px`,
          ]
        : [];
    }),
  ];
}

/** Reads the card in the frame of `story` at `width` in `scheme`, at rest. */
const readCard = async (
  page: Page,
  story: string,
  width: number,
  scheme: string
): Promise<CardRead | null> => {
  const frame = frameOf(story, width, scheme);
  const facts = await page.evaluate(cardFacts, frame);
  if (!facts) {
    return null;
  }
  return {
    ...facts,
    overlaps: await page.evaluate(cardOverlaps, frame),
    spills: await page.evaluate(cardSpills, frame),
  };
};

/** What the card should say, from core's own reading of the story's ask. */
const expected = (shown: PermissionPresentation) => ({
  grant: shown.summary,
  reason: shown.reason ?? null,
  count: shown.count.length > 0 ? countWords(shown.count) : null,
  well: [
    ...shown.changed.map(
      (one) =>
        `${one.key} ${one.before === undefined ? "" : `${one.before}→becomes`}${one.after}`
    ),
    ...shown.fields.map((one) => `${one.key} ${one.value}`),
  ].map((line) => line.replace(SPACES, " ").trim()),
  consequences: shown.consequences.map((one) => one.text),
});

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** A token's value, as the page's root resolves it. */
const token = (page: Page, name: string) =>
  page.evaluate(
    (one) =>
      getComputedStyle(document.documentElement).getPropertyValue(one).trim(),
    name
  );
const ms = (value: string) =>
  value.endsWith("ms")
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000;

/** Legs 1 and 2: the page's errors and every frame drawn, from the report. */
function drawnLegs(kit: Kit, report: RenderReport, errors: string[]): void {
  const frames: FrameRender[] = report.sections.flatMap((one) => one.frames);
  const rest = frames.filter((one) => one.interaction === "rest");
  kit.check(
    "1: the canvas page logs no error, and its report none",
    errors.length === 0 && report.page.errors.length === 0,
    JSON.stringify({ console: errors, report: report.page.errors }).slice(
      0,
      1200
    )
  );
  const stories = Object.keys(STORIES);
  const missing = stories.flatMap((story) =>
    WIDTHS.flatMap((width) =>
      SCHEMES.filter(
        (scheme) =>
          !rest.some(
            (one) =>
              one.story === story &&
              one.width === width &&
              one.scheme === scheme &&
              one.state === "drawn"
          )
      ).map((scheme) => `${story}@${width}/${scheme}`)
    )
  );
  const notDrawn = frames.filter((one) => one.state !== "drawn");
  kit.check(
    `2: every story is drawn, none empty: ${stories.length} stories × 3 widths × 2 schemes`,
    missing.length === 0 &&
      notDrawn.length === 0 &&
      report.unnamed.length === 0,
    `${rest.length} rest frames of ${frames.length}; missing ${missing.join(", ") || "none"}; not drawn ${notDrawn.map((one) => `${one.story}/${one.interaction}/${one.width}/${one.scheme} ${one.state} ${one.error?.message ?? ""}`).join("; ") || "none"}; unnamed ${report.unnamed.join(", ") || "none"}`
  );
}

/** What one frame's card got wrong, by leg: its width (3), overlaps (4), spills (5), words (6), links (7). */
interface Faults {
  links: string[];
  narrow: string[];
  overlaps: string[];
  spills: string[];
  words: string[];
}

/** One frame's card held to legs 3–7. */
function judge(
  at: string,
  width: number,
  read: CardRead,
  story: { decided?: boolean; links: string[] },
  shown: PermissionPresentation
): Faults {
  const say = expected(shown);
  const got = {
    grant: read.grant,
    reason: read.reason,
    count: say.count === null ? null : read.count,
    well: read.well,
    consequences: read.consequences,
  };
  const wanted = {
    grant: say.grant,
    reason: say.reason,
    count: say.count,
    well: say.well,
    consequences: say.consequences,
  };
  const narrow =
    (width === 390 && read.content < 340) ||
    (width === 1440 && read.cardWidth !== read.columnWidth);
  const boundOk = story.decided || read.bound === shown.bound;
  return {
    narrow: narrow
      ? [
          `${at}: card ${read.cardWidth}px (content ${read.content}px) of ${read.columnWidth}px`,
        ]
      : [],
    overlaps: read.overlaps.map((one) => `${at}: ${one}`),
    spills: read.spills.map((one) => `${at}: ${one}`),
    words: [
      ...(same(got, wanted)
        ? []
        : [`${at}: drew ${JSON.stringify(got)} for ${JSON.stringify(wanted)}`]),
      ...(boundOk ? [] : [`${at}: bound "${read.bound}" for "${shown.bound}"`]),
    ],
    links: same([...read.links].sort(), [...story.links].sort())
      ? []
      : [
          `${at}: ${JSON.stringify(read.links)} for ${JSON.stringify(story.links)}`,
        ],
  };
}

/** Legs 3–7: every story's card at every width and scheme, against core's words. */
async function cardLegs(kit: Kit, page: Page): Promise<void> {
  const faults: Faults = {
    links: [],
    narrow: [],
    overlaps: [],
    spills: [],
    words: [],
  };
  for (const [story, want] of Object.entries(STORIES)) {
    const shown = presentPermission(
      want.ask.toolName,
      want.ask.input,
      contextOf(want.ask)
    );
    for (const width of WIDTHS) {
      for (const scheme of SCHEMES) {
        const at = `${story}@${width}/${scheme}`;
        // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, from one page
        const read = await readCard(page, story, width, scheme);
        const found = read
          ? judge(at, width, read, want, shown)
          : { ...faults, narrow: [`${at}: no card`] };
        for (const key of Object.keys(faults) as (keyof Faults)[]) {
          faults[key].push(...found[key]);
        }
      }
    }
  }
  kit.check(
    "3: the card's content box is at least 340 wide at 390, and the card its column's width at 1440",
    faults.narrow.length === 0,
    faults.narrow.join("; ") || "every card"
  );
  kit.check(
    "4: head chips, grant line, reason and count line overlap nothing and stand inside the card",
    faults.overlaps.length === 0,
    faults.overlaps.slice(0, 20).join("; ") || "none"
  );
  kit.check(
    `5: the overflow sweep at ${WIDTHS.join(", ")}, light and dark, totals zero`,
    faults.spills.length === 0,
    `${faults.spills.length}: ${faults.spills.slice(0, 20).join("; ")}`
  );
  kit.check(
    "6: each story's words are core presentPermission's for its ask",
    faults.words.length === 0,
    faults.words.slice(0, 6).join("\n") || "every frame"
  );
  kit.check(
    "7: the link chips go where report 1's table says",
    faults.links.length === 0,
    faults.links.slice(0, 6).join("\n") || "every frame"
  );
}

/** Leg 8: the decided foot, on the engine's clock. */
async function moveLeg(kit: Kit, page: Page): Promise<void> {
  const fade = ms(await token(page, "--dur-fade"));
  const exit = ms(await token(page, "--dur-exit"));
  const easeOut = (await token(page, "--ease-out")).replace(SPACES, " ");
  // A section's moves are played off screen after its frames: the report says them once they have run.
  const moves = await until(
    "the report's moves",
    () =>
      page.evaluate(() =>
        (
          window as unknown as { __cawcoCanvas: { report: RenderReport } }
        ).__cawcoCanvas.report.sections.flatMap((one) => one.moves)
      ),
    (all) => all.length > 0,
    60_000
  ).catch(() => []);
  const move = moves.find(
    (one) => one.from === "McpWaiting" && one.to === "McpApproved"
  );
  const fired = (duration: number) =>
    !!move?.animations.some(
      (one) =>
        one.property.includes("opacity") &&
        one.duration === duration &&
        one.easing.replace(SPACES, " ") === easeOut
    );
  kit.check(
    `8: McpWaiting → McpApproved fades the answer row out over --dur-exit (${exit}ms) and the decided mark in over --dur-fade (${fade}ms), both on --ease-out`,
    !move?.error && fired(exit) && fired(fade),
    JSON.stringify(move ?? moves)
  );
}

/** Leg 9: Undo on the approved removal, pressed, and left alone. */
async function undoLeg(kit: Kit, page: Page): Promise<void> {
  const removal = (scheme: string) => frameOf("RemoveApproved", 390, scheme);
  const undo = page.locator(`${removal("light")} [data-slot="undo"]`);
  const before = await undo.count();
  await undo.click();
  const restored = await until(
    "Restored on the card",
    () =>
      page.locator(`${removal("light")} [data-slot="decided"]`).textContent(),
    (text) => (text ?? "").includes("Restored"),
    5000
  ).catch(() => null);
  const after = await page
    .locator(`${removal("light")} [data-slot="undo"]`)
    .count();
  kit.check(
    "9a: Undo on an approved removal, pressed: the card says Restored and Undo leaves",
    before === 1 && (restored ?? "").includes("Restored") && after === 0,
    `undo before ${before}; decided now "${restored}"`
  );
  // The stories file opens the window as it loads: a minute, the hub's.
  const waited = Date.now();
  const stood = await page
    .locator(`${removal("dark")} [data-slot="undo"]`)
    .count();
  const left = await until(
    "Undo leaving the untouched removal",
    () => page.locator(`${removal("dark")} [data-slot="undo"]`).count(),
    (count) => count === 0,
    70_000
  ).catch(() => 1);
  const foot = await page
    .locator(`${removal("dark")} [data-slot="decided"]`)
    .textContent();
  kit.check(
    "9b: left alone, Undo stands, then leaves once the hub's minute is out, the card still saying Removed",
    stood === 1 && left === 0 && (foot ?? "").includes("Removed"),
    `Undo stood ${stood}; gone after ${Math.round((Date.now() - waited) / 1000)} s; foot "${foot?.replace(SPACES, " ").trim()}"`
  );
}

/** Each story at 390 and 1440, light and dark, the frame alone, for a reviewer. */
async function captures(kit: Kit, page: Page): Promise<void> {
  mkdirSync(CAPS, { recursive: true });
  const shots = Object.keys(STORIES).flatMap((story) =>
    [390, 1440].flatMap((width) =>
      SCHEMES.map((scheme) => ({ story, width, scheme }))
    )
  );
  for (const { story, width, scheme } of shots) {
    const body = page.locator(frameOf(story, width, scheme));
    // biome-ignore lint/performance/noAwaitInLoops: one capture at a time
    await body.scrollIntoViewIfNeeded();
    await body.screenshot({
      path: join(CAPS, `${story}-${width}-${scheme}.png`),
      animations: "disabled",
    });
  }
  kit.note(`captures: ${shots.length} in ${CAPS}`);
}

/** Legs 1–9, on the dashboard's stage. */
async function canvasLegs(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  const errors = errorsOf(page);
  await page.goto(
    `${base}/@cawco/canvas?file=${encodeURIComponent(FILE)}&width=${WIDTHS.join(",")}&scheme=both`,
    { waitUntil: "load" }
  );
  drawnLegs(kit, await reportOn(page), errors);
  await cardLegs(kit, page);
  await moveLeg(kit, page);
  await undoLeg(kit, page);
  await captures(kit, page);
}

/** The dashboard's stage, started as the daemon starts it; stopped by the returned function. */
async function stageUp(): Promise<{ base: string; stop: () => void }> {
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let said = "";
  stage.stdout.on("data", (chunk: Buffer) => {
    said += chunk.toString("utf8");
  });
  stage.stderr.on("data", (chunk: Buffer) => {
    said += chunk.toString("utf8");
  });
  await until(
    "the stage's ready",
    () => said,
    (text) => text.includes('"cawco":"ready"'),
    90_000
  );
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => {
      stage.kill("SIGTERM");
      rmSync(join(APP, ".cawco"), { recursive: true, force: true });
    },
  };
}

interface Ask {
  instanceId: string;
  machineId: string;
  payload: { toolName: string };
  requestId: string;
}

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

/** Leg 10: approve a removal, then the trash's restore inside and past the window. */
async function trashLeg(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const place = join(fleet.sandbox, "approval-place");
  await mkdir(place, { recursive: true });
  await writeFile(join(place, "README.md"), "The probe's place.\n");
  const session = await fleet.spawn("claude", "Approval card", place);
  const credential = await Bun.file(
    `/proc/${await fleet.sessionPid(session)}/environ`
  )
    .text()
    .then(
      (environ) =>
        environ
          .split("\0")
          .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
          ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? ""
    );
  const call = async (name: string, args: object): Promise<string> => {
    const response = await fetch(
      `${fleet.base}/api/delegation/call/${session}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      }
    );
    return response.text();
  };
  const answered = new Set<string>();
  /** An admin write: parked, approved with the dashboard's own command, and what the call said. */
  const approved = async (args: object): Promise<string> => {
    const said = call("admin_mcp_servers_write", args);
    const ask = await until(
      "the removal's ask",
      async () =>
        (await fleet.api<Ask[]>("/api/pending")).find(
          (one) =>
            one.payload.toolName === "mcp__cawco__admin_mcp_servers_write" &&
            !answered.has(one.requestId)
        ),
      Boolean,
      60_000
    );
    if (!ask) {
      return said;
    }
    answered.add(ask.requestId);
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: ask.machineId ?? MACHINE,
      sessionId: ask.instanceId,
      payload: {
        requestId: ask.requestId,
        args: [ask.requestId, { behavior: "allow", updatedInput: {} }],
      },
    });
    return said;
  };
  /** The fleet's MCP servers as the hub lists them, by name. */
  const servers = async (): Promise<{ config: unknown; name: string }[]> => {
    const { mcp } = (
      await fleet.api<{ config: { mcp: unknown } }>("/api/fleet")
    ).config;
    return Array.isArray(mcp)
      ? (mcp as { config: unknown; name: string }[])
      : Object.entries(mcp as Record<string, object>).map(([name, one]) => ({
          name,
          config: (one as { config?: unknown }).config ?? one,
        }));
  };
  /** The trash's restore, as the dashboard's Undo calls it: null when it put the item back, else the hub's words. */
  const restoreBy = (id: number): Promise<string | null> =>
    fleet
      .api(`/api/trash/${id}/restore`, {})
      .then(() => null)
      .catch((error: unknown) => String(error));
  const NAME = "probe-stdio";
  const config = { command: "echo", args: ["probe"] };
  const reason = "The probe proves the approval card's Undo.";
  await approved({ action: "put", name: NAME, config, reason });
  const kept = (await servers()).find((one) => one.name === NAME);
  const restoreOf = (said: string) =>
    Number(RESTORE.exec(said)?.[1] ?? Number.NaN);
  const removed = await approved({ action: "remove", name: NAME, reason });
  const restore = restoreOf(removed);
  const gone = !(await servers()).some((one) => one.name === NAME);
  const back = await restoreBy(restore);
  const after = (await servers()).find((one) => one.name === NAME);
  kit.check(
    "10a: an approved removal goes into the hub's trash, and the restore Undo makes brings it back whole within the window",
    !!kept &&
      Number.isFinite(restore) &&
      gone &&
      back === null &&
      same(after?.config, kept.config),
    `kept ${JSON.stringify(kept)}; removal said ${removed.slice(0, 300)}; gone ${gone}; restore ${back ?? "ok"}; back ${JSON.stringify(after)}`
  );
  const again = restoreOf(
    await approved({ action: "remove", name: NAME, reason })
  );
  await Bun.sleep(61_000);
  const late = await restoreBy(again);
  kit.check(
    "10b: past the window the restore is refused, in words, and the server stays gone",
    Number.isFinite(again) &&
      late !== null &&
      !(await servers()).some((one) => one.name === NAME),
    `restore ${again}: ${late}`
  );
}

/** Every approval-card states file the decision page shows: the sheet, each option's, today's. */
const PANEL_FILES = [
  FILE,
  "src/lib/cawco/transcript/PromptRemoval.stories.ts",
  "src/lib/cawco/transcript/PromptGated.stories.ts",
  "src/lib/cawco/transcript/PromptAnswered.stories.ts",
  "src/lib/cawco/transcript/today/Prompt.stories.ts",
  "src/lib/cawco/transcript/today/ToolRow.stories.ts",
];
/** The narrowest a run of words may wrap in: below it a sentence stands a word a line. */
const WRAP_FLOOR = 120;

/** Each rest frame as drawn: its root's content box, and every text that wraps in a box under the floor, in the page. */
function panelFrames(floor: number) {
  const inner = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return (
      el.clientWidth -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd)
    );
  };
  // The box a run of words wraps in: its nearest ancestor that lays out
  // lines (an inline span has no width of its own to wrap in).
  const lineBox = (from: Element): HTMLElement => {
    let at: Element | null = from;
    while (at && ["inline", "contents"].includes(getComputedStyle(at).display)) {
      at = at.parentElement;
    }
    return (at ?? from) as HTMLElement;
  };
  /** A text's wrap, when it takes more than one line in a box under the floor. */
  const wrapOf = (node: Node): string | null => {
    const parent = node.parentElement;
    const words = (node.textContent ?? "").trim();
    if (!(parent && words)) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    // Lines, not fragments: an ellipsis or a trimmed edge shares its line's top.
    const lines = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 0)
        .map((rect) => Math.round(rect.top))
    ).size;
    const box = lineBox(parent);
    const room = box.clientWidth > 0 ? inner(box) : 0;
    return lines > 1 && room < floor
      ? `"${words.slice(0, 40)}" wraps to ${lines} lines in ${Math.round(room)}px (${box.tagName.toLowerCase()}.${[...box.classList].join(".")})`
      : null;
  };
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].map((frame) => {
    const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
    const root =
      body?.querySelector<HTMLElement>('[data-slot="hitl"]') ??
      (body?.firstElementChild as HTMLElement | null);
    const narrow: string[] = [];
    const walker = body
      ? document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
      : null;
    for (let node = walker?.nextNode(); node; node = walker?.nextNode()) {
      const wrap = wrapOf(node);
      if (wrap) {
        narrow.push(wrap);
      }
    }
    return {
      key: `${frame.dataset.cawcoFile}:${frame.dataset.cawcoStory}/${frame.dataset.cawcoScheme}`,
      content: root ? inner(root) : 0,
      narrow,
    };
  });
}

/**
 * Each card as the canvas draws a story that names no form (runtime.ts
 * `dress`: the frame's body without a width, in its frame's column that
 * sets each child at its own width): the card's content box and the body's
 * width, then every body put back as it was. In the page.
 */
async function fitFrames() {
  const bodies = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] > .cawco-frame-body'
    ),
  ].filter((body) => body.querySelector('[data-slot="hitl"]'));
  const kept = bodies.map((body) => body.style.width);
  for (const body of bodies) {
    body.style.width = "";
  }
  await new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))
  );
  const read = bodies.map((body) => {
    const frame = body.closest<HTMLElement>(".cawco-frame");
    const card = body.querySelector<HTMLElement>('[data-slot="hitl"]');
    const style = card ? getComputedStyle(card) : null;
    return {
      key: `${frame?.dataset.cawcoFile}:${frame?.dataset.cawcoStory}/${frame?.dataset.cawcoScheme}`,
      body: body.offsetWidth,
      content:
        card && style
          ? card.clientWidth -
            Number.parseFloat(style.paddingInlineStart) -
            Number.parseFloat(style.paddingInlineEnd)
          : 0,
    };
  });
  bodies.forEach((body, at) => {
    body.style.width = kept[at] ?? "";
  });
  return read;
}

/** One states file as the panel opens it: its report's frames, what each drew, and the page's errors. */
async function panelFile(page: Page, base: string, file: string) {
  const errors = errorsOf(page);
  await page.goto(`${base}/@cawco/canvas?file=${encodeURIComponent(file)}`, {
    waitUntil: "load",
  });
  const report = await reportOn(page);
  return {
    errors: [...errors, ...report.page.errors.map((one) => one.message)].map(
      (one) => `${file}: ${one}`
    ),
    frames: report.sections.flatMap((one) =>
      one.frames.map((frame) => ({ ...frame, file: one.file }))
    ),
    drawn: await page.evaluate(panelFrames, WRAP_FLOOR),
    fit: await page.evaluate(fitFrames),
  };
}

/**
 * Leg 0: the canvas as the panel opens it, no width asked: every frame takes
 * its story's own form, as the owner's panel draws it; then each card as a
 * story with no form draws it, where the owner saw every card 24 px wide
 * (`drawn 24×7206`). The canvas loads one states file at a time as it comes
 * into view, so each file is opened on its own.
 */
async function panelLeg(kit: Kit, base: string): Promise<void> {
  const reads: Awaited<ReturnType<typeof panelFile>>[] = [];
  for (const file of PANEL_FILES) {
    // biome-ignore lint/performance/noAwaitInLoops: one states file a page, as the panel loads them
    const page = await kit.page("desk");
    reads.push(await panelFile(page, base, file));
    await page.close();
  }
  const errors = reads.flatMap((one) => one.errors);
  const frames = reads.flatMap((one) => one.frames);
  const drawn = reads.flatMap((one) => one.drawn);
  kit.check(
    `0a: as the panel opens each of ${PANEL_FILES.length} states files, no error`,
    errors.length === 0,
    errors.slice(0, 6).join("; ") || "none"
  );
  const short = frames.filter(
    (one) => one.state !== "drawn" || !(one.width > 0) || one.box.w < one.width
  );
  const files = new Set(frames.map((one) => one.file));
  kit.check(
    "0b: as the panel opens them, every frame is drawn at its story's own width, none failed, none under its viewport's",
    files.size === PANEL_FILES.length && short.length === 0,
    `${frames.length} frames in ${files.size} files; short ${
      short
        .slice(0, 8)
        .map(
          (one) =>
            `${one.file} ${one.story}/${one.interaction} ${one.state} drawn ${one.box.w}×${one.box.h} of ${one.width}`
        )
        .join("; ") || "none"
    }`
  );
  const thin = drawn.filter((one) => one.content < 340);
  kit.check(
    "0c: as the panel opens them, every card's content box is at least 340 wide in its 390 frame",
    drawn.length > 0 && thin.length === 0,
    `${drawn.length} rest frames; under 340: ${
      thin
        .slice(0, 8)
        .map((one) => `${one.key} ${one.content}px`)
        .join("; ") || "none"
    }`
  );
  const wraps = drawn.flatMap((one) =>
    one.narrow.map((line) => `${one.key}: ${line}`)
  );
  kit.check(
    `0d: as the panel opens them, no text wraps in a box narrower than ${WRAP_FLOOR}px`,
    wraps.length === 0,
    `${wraps.length}: ${wraps.slice(0, 8).join("; ")}`
  );
  const fit = reads.flatMap((one) => one.fit);
  const collapsed = fit.filter((one) => one.content < 340);
  kit.check(
    "0e: drawn as a story with no form (its frame setting it at its own width), every card stands at least 340 wide, never at the frame's 24px floor",
    fit.length > 0 && collapsed.length === 0,
    `${fit.length} cards; under 340: ${
      collapsed
        .slice(0, 8)
        .map((one) => `${one.key} card ${one.content}px in a ${one.body}px body`)
        .join("; ") || "none"
    }`
  );
}

const run = async (kit: Kit): Promise<void> => {
  const stage = await stageUp();
  try {
    await panelLeg(kit, stage.base);
    await canvasLegs(kit, stage.base);
  } finally {
    stage.stop();
  }
  await trashLeg(kit);
};

const spec: Spec = { name: "approval-card", run };
export default spec;
