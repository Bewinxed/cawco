/**
 * Comments on any artifact, slice 4b (Projects spec §5.7, §5.10; tsk-3;
 * DESIGN.md, Artifact panel, canvas and ink), on a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, which calls the
 * tools each PROBE-CALL names) and the built dashboard at the desk. Read
 * from the engine: the page's doc (`window.cawcoArtifact.doc`), the pane's
 * DOM, the overlay's shadow root, and what the model was sent.
 *
 * 1. `C` turns Comment on (its segment `aria-selected`, the well's accent edge); a tap on
 *    a paragraph writes pin 1 with its selector, source and text and opens
 *    its card beside the pin; Esc closes the card, and Esc again leaves the
 *    mode.
 * 2. A pen stroke's radial Comment writes pin 2 on the ink, with the ink's
 *    box; the Comments panel shows two rows; J and K move the focus between the pins
 *    and the overlay's outline follows.
 * 3. A reply typed in the card is in pin 1's thread, by the person; with no
 *    Send it reaches the session by itself once quiet: the comments notice
 *    carrying pin 1, its words and its picture (pin 2, said nothing in yet,
 *    waits), drawn as one quiet line and no row of the person's, pin 1 and
 *    its entry stamped `sentAt`; the pane has no Send control. A second
 *    reply is one more delivery.
 * 4. comment_read answers both pins, what pin 1 stands on and its reply, and
 *    pin 2's ink box; comment_reply on pin 1 is in its card
 *    within 2 s, the live dot showing while the agent's turn runs;
 *    comment_resolve dims pin 1 to 40% and moves it to Resolved; Reopen
 *    brings it back. A host that holds no doc (the app) posts `cawco:reply`
 *    and `cawco:resolve` into the page: pin 1's doc takes a person's entry
 *    and a resolve then a reopen, each answered ok, and a gone pin answers
 *    the refusal's sentence.
 * 5. A re-publish that moves and rewords the paragraph re-anchors pin 1 by
 *    its source's file:line; one that renames it and drops its source,
 *    keeping its text, re-anchors it by text; one that removes it marks pin 1
 *    moved in its own row under Open, which opens its card like any other;
 *    the card says the element is gone, and its Pin it somewhere else with a
 *    tap pins it anew.
 * 6. No `selection.md`, `SelectionChip` or `SelectionPopover` is left in
 *    apps/dashboard/src or packages.
 *
 * And the owner's report (2026-10-14: the card didn't open on a new pin,
 * no delete, the whole iframe outlined):
 * a. Every tapped pin's card opens with its field focused: the first, the
 *    second, and a third tapped while the second's card is open.
 * b. A dev server's preview whose content stands in a same-origin inner
 *    frame: hovering the inner button outlines the button mapped to the top
 *    document; a tap stores an anchor with the frame chain and the button's
 *    inner selector and opens its card; a reload that moves the button finds
 *    the pin on it again; the inner frame's own scroll moves the disc.
 * b2. A same-origin frame put in with its document opened (no root until it
 *    is written) says no error as the overlay reads it.
 * c. The card's head holds Resolve pin, ⋯ and Close, its foot Reply. Delete
 *    pin (its ⋯), asked in the card itself: the pin leaves the doc and the page,
 *    its card closes, the other pins keep their numbers; the app's
 *    `cawco:delete` on a gone pin answers the refusal.
 *
 * And the owner's report (2026-10-14: scrolled down, a tap on a subagent
 * card scrolled the page smoothly to the top and put the pin on the top
 * card): a page of cards all written by one line of markup (one file:line),
 * scrolled by the window, and one scrolled by an inner container (a
 * transcript under a header):
 * d. Scrolled to the middle, the hover outline over a card there is the
 *    card's box (±1px); a tap pins it, its card opens and a reply is kept,
 *    and through all of it the scroller's offset never moves from where it
 *    stood; the pin's anchor names that card, and its disc stands at the
 *    tapped point on it (±2px), after 200px more scroll, and after a reload
 *    scrolled back to the same offset. In the container, neither the disc
 *    nor a pen stroke on the card is drawn while the container has scrolled
 *    the card under its edge, and both are back when it scrolls back. A
 *    revision that moves the card to the list's third place, and a reload:
 *    the pin stands on that card, not on the one now at its old place.
 *
 * And the owner's report (2026-10-14: "if i click away from a comment it
 * needs to dismiss the popover i don't have to keep clicking X"):
 * e. An open card closes on a press outside it: on the pane's chrome,
 *    elsewhere in the dashboard, on the page; and on Esc. A new pin with
 *    nothing written is taken back; one with words keeps them, back in its
 *    field when it opens again and after the desk reloads. A press on
 *    another pin's disc opens that pin's card in its place.
 *
 * And the owner's standing rule ("having the user have to scroll down to
 * even figure out there's stuff below is terrible UX"):
 * f. A pin whose thread runs past the card's cap: the thread scrolls in its
 *    room and the card does not, and Resolve, Reply and the field stand
 *    inside the card's box.
 *
 * And the owner's report (2026-10-16: on test-map, 27,383px of some 2,000
 * cards, his press on the intro text was pinned on `main`, the whole page,
 * "and lagged it"):
 * g. A press on the intro paragraph pins that paragraph; a press in the
 *    page's padding beside it pins it too, the nearest content, never `main`.
 *    Each finishes, its picture drawn, with no main-thread task of the
 *    page's past 50ms, and its picture is the paragraph's box with its 24px
 *    margin, never the page.
 *
 * And the owner's report (2026-10-18: "also when commenting on sth in the
 * preview the slhoettes don't line up?", on a page showing desks as frames
 * drawn smaller than their own size):
 * h. A page holding a frame drawn at half scale by a transform and one at
 *    its own: hovering the transcript in each outlines its box on screen
 *    (±1px), the label on the outline's top-left; a tap on the half-scale
 *    one stores that box under its frame chain and stands its disc at the
 *    tapped point (±2px).
 *
 * And the probe of 2026-10-18 (a merge that put a decision ahead of the
 * pinned one moved the pin onto the new card, and wrote its anchor back):
 * i. On a page of repeated cards with no id and no source, and of decision
 *    cards, a revision that puts a card in ahead of each pinned one: a
 *    plain card's pin stays on it by its words; one whose words the
 *    revision changed waits in the moved tray; a decision card's stays on
 *    it by its choice; a picture's with no words (the same image in each
 *    card) stays on it by its alt; none stands on a card the revision put in.
 *
 * And the owner's report (2026-10-18: "if i open comments and i click one of
 * the comments it opens behind the list ofcomments, not very navigateable"):
 * j. With the Comments panel open, on the desk and on a phone: a pin the
 *    page scrolled under the panel, then one at the page's very top-right,
 *    opened from its row, then J and K: each card and each disc stand clear
 *    of the panel (and on a phone, the disc clear of the card at the foot).
 *
 * And the owner's report (2026-10-21: on a state-machine graph drawn in
 * inline SVG, his pin pictures drew the edges as black filled wedges and the
 * edge labels in a large serif face):
 * k. A pin on an inline `<svg>` whose `<polyline>`s, `<marker>` and `<text>`
 *    the page's stylesheet styles: in its picture, read by pixel, a point
 *    inside the wedge polyline's hull is the page's ground (never black),
 *    the marker's inside is its colour, and the label's ink is as wide as
 *    the page's own rendering of it (an element screenshot), within 3px.
 * k2. The same graph's label set in Figtree by the page's own `@font-face`
 *    (a port's page): the page has the face loaded, and the picture's label
 *    is as wide as the page's, within 3px.
 * k3. The graph in a 0×0 `<svg>` (`overflow: visible`), pinned on a spot
 *    over it: the page draws none of it ("A value of zero disables rendering
 *    of the element", SVG 1.1), and the picture draws as the page does, the
 *    marker's point and the label as the page's, with no part failed (none
 *    of its shapes handed to the library alone).
 * k4. 61 whole parts ahead of the graph in the crop (one past the picture's
 *    60): the picture is drawn with no part failed and the hull not black.
 */
import { join } from "node:path";
import type { Frame, Locator, Page } from "playwright-core";
import { PNG } from "pngjs";
import { readWithin } from "../../../packages/core/src/bounded";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { traceMain } from "../frames";
import {
  buttonNames,
  COMPOSER,
  type Kit,
  open,
  type Spec,
  settle,
} from "../kit";
import {
  docOf,
  dragFromIcon,
  longestIn,
  type On,
  pageFrame,
  paneMode,
  pngSize,
  screenBox,
  strokeOver,
  TEST_MAP,
  tasksOver,
  testMapFrame,
  watchPictures,
} from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const READ = "mcp__cawco__comment_read";
const REPLY = "mcp__cawco__comment_reply";
const RESOLVE = "mcp__cawco__comment_resolve";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The person's comments, delivered by themselves (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "[a-z0-9-]+" \(artifact [0-9a-f-]{36}\)\./;
/** How long a delivery may take: the hub's quiet period (10 s) and the way to the model. */
const DELIVERY_MS = 30_000;
/** An image block in a request's body. */
const IMAGE_BLOCK = /"type":"image"/g;
const RESOLVED_TAB = /^Resolved/;
const OPEN_TAB = /^Open/;
const ROOT = join(import.meta.dir, "..", "..", "..");

const MOVED_TEXT = "The paragraph, moved down and reworded.";
/** The pane's page frame. */
const FRAME = 'iframe[title="Preview"]';

/** The page as each revision has it: first, the paragraph moved, renamed, gone. */
const page = (revision: "first" | "moved" | "renamed" | "gone") => {
  const para = {
    first:
      '<p id="para" data-insp-path="src/Hero.svelte:12:3">A paragraph to comment on, long enough to tap.</p>',
    moved: `<div style="height:200px"></div><p id="para-moved" data-insp-path="src/Hero.svelte:12:3">${MOVED_TEXT}</p>`,
    renamed: `<div style="height:200px"></div><p id="para-renamed">${MOVED_TEXT}</p>`,
    gone: "",
  }[revision];
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  p { width: 70%; margin: 0 0 48px; }
  .tall { height: 1400px; }
</style></head>
<body><main>
  ${para}
  <p id="second" data-insp-path="src/Hero.svelte:20:3">The second paragraph, for a stroke and its comment.</p>
  <p id="third" data-insp-path="src/Hero.svelte:28:3">The third paragraph, where a moved pin is placed again.</p>
  <div class="tall"></div>
</main></body></html>`;
};

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const answeredAt = new Map<string, number>();
/** Calls whose turn the model draws out after the tool's answer: the agent at work. */
const slow = new Set<string>();
/** Every message the session was sent, as the model read it, with the request that carried it. */
const heard: { body: string; last: string }[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push({ last: request.last, body: request.body });
  if (NOTICE.test(request.last) && !request.afterTool) {
    return text("Heard the comments.");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
      answeredAt.set(marker, Date.now());
    }
    return slow.has(marker)
      ? { everyMs: 600, words: ["Working", " on", " it", " now", "."] }
      : text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

let lastMarker = "";
const setUp = async (kit: Kit): Promise<On> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Comments", fleet.repo);
  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    lastMarker = marker;
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  const said: string[] = [];
  desk.on("pageerror", (error) =>
    said.push(
      `pageerror: ${error.message} ${error.stack?.split("\n").slice(1, 4).join(" ← ")}`
    )
  );
  desk.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  await open(desk, `${base}/session/${session}`, COMPOSER);
  const cdp = await desk.context().newCDPSession(desk);
  return { call, cdp, fleet, kit, page: desk, said, session };
};

type Pins = Record<string, Record<string, unknown>>;
const pinNumbered = (pins: Pins, number: number) =>
  Object.values(pins).find((pin) => pin.number === number) as
    | (Record<string, unknown> & {
        anchor: Record<string, unknown> & {
          source?: { file?: string; line?: number };
        };
        id: string;
        thread: { by: string; sentAt?: string; text: string }[];
      })
    | undefined;

/**
 * Until the page has heard the pane's mode: the overlay's layer takes the
 * page's presses in Comment mode. A person's next tap comes long after the
 * message; the probe's comes in the same frame unless it waits.
 */
const pageInComment = (frame: Frame, on: boolean) =>
  until(
    `the page's Comment mode ${on ? "on" : "off"}`,
    () =>
      frame.evaluate(
        () =>
          document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelector(".layer")
            ?.classList.contains("comment") ?? false
      ),
    (mode) => mode === on,
    5000
  );

/**
 * The Comments panel, opened from the head's Comments when it is shut: it
 * floats over the page's top-right, so a check that presses there shuts it
 * first ({@link shutList}).
 */
const rowsOf = async (on: On) => {
  const button = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[data-slot="comments"]'
  );
  const list = on.page.locator('[data-pin-list-pop] [data-slot="pin-list"]');
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  } else if ((await list.count()) === 0) {
    // Stacked, the panel stands aside under an open card: its Close brings the panel back.
    const close = on.page
      .locator('[data-slot="pin-card"]')
      .getByRole("button", { name: "Close", exact: true });
    if ((await close.count()) > 0) {
      await close.click();
    }
  }
  await list.waitFor({ timeout: 5000 }).catch(() => undefined);
  return list;
};
const shutList = async (on: On) => {
  const button = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[data-slot="comments"]'
  );
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
    await on.page
      .locator("[data-pin-list-pop]")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
};
/** The head's Interact: Comment's way back, as the old toggle's second press was. */
const interactTab = (on: On) =>
  on.page.locator(
    ":is([data-slot=\"preview-pane\"], [data-side-card=\"preview\"]) [role='tab'][aria-keyshortcuts='V']"
  );

/** The overlay's outline over the page, in the frame's viewport. */
const outlineOf = (frame: Frame) =>
  frame.evaluate(() => {
    const rect = document
      .querySelector("cawco-overlay")
      ?.shadowRoot?.querySelector<HTMLElement>(".rect");
    if (!rect || rect.hidden) {
      return null;
    }
    const r = rect.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
const boxIn = (frame: Frame, selector: string) =>
  frame.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
const near = (
  a: { x: number; y: number; w: number; h: number } | null,
  b: { x: number; y: number; w: number; h: number },
  slack = 3
) =>
  !!a &&
  Math.abs(a.x - b.x) <= slack &&
  Math.abs(a.y - b.y) <= slack &&
  Math.abs(a.w - b.w) <= slack &&
  Math.abs(a.h - b.h) <= slack;

const run = async (kit: Kit) => {
  const on = await setUp(kit);
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "comments",
    html: page("first"),
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the page is made", false, made.slice(0, 300));
    return;
  }
  const frame = await pageFrame(on);
  await frame.waitForSelector("#para");
  await settle(on.page, 400);

  const one = await commentChecks(on, frame);
  const two = await inkCommentChecks(on, frame);
  if (!(one && two)) {
    return;
  }
  await sendChecks(on, frame, one);
  await agentChecks(on, frame, one, two);
  await hostChecks(on, frame, one);
  await anchorChecks(on, frame, id, one);
  // The Comments panel floats over the page's top-right: each check that
  // presses the page starts with it shut, and opens it for its rows.
  for (const checks of [
    () => tapAndDeleteChecks(on, frame),
    () => frameChecks(on),
    () => scaledFrameChecks(on),
    () => scrollChecks(on, "window"),
    () => scrollChecks(on, "container"),
    () => dismissChecks(on),
    () => roomChecks(on),
    () => wordlessChecks(on),
    () => documentChecks(on),
    () => mapPressChecks(on),
    () => svgPictureChecks(on),
    () => insertChecks(on),
    () => listChecks(on),
    () => panelChecks(on),
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: the checks run in order, one after another
    await shutList(on);
    await checks();
  }
  await cutoverCheck(kit);
  kit.check(
    "the pages said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

/** 1. C, a tap, the card at the pin, Esc and Esc. */
const commentChecks = async (on: On, frame: Frame) => {
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  // DESIGN.md, The mode: "Comment and Draw turn the well's own edge the
  // accent, 2px, inside its box": brand-solid, 2px solid, offset -2px.
  const readEdge = () =>
    on.page.evaluate(() => {
      const well = document.querySelector(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-side-well]'
      );
      const probe = document.createElement("span");
      probe.style.color = "var(--brand-solid)";
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const style = well ? getComputedStyle(well) : null;
      return {
        color: style?.outlineColor ?? null,
        width: style?.outlineWidth ?? null,
        style: style?.outlineStyle ?? null,
        offset: style?.outlineOffset ?? null,
        accent,
      };
    });
  type Edge = Awaited<ReturnType<typeof readEdge>>;
  const accentEdge = (read: Edge) =>
    read.color === read.accent &&
    read.width === "2px" &&
    read.style === "solid" &&
    read.offset === "-2px";
  // The edge comes in over --dur-control: read once it has.
  await on.page.keyboard.press("d");
  await settle(on.page, 300);
  const drawEdge = await readEdge();
  on.kit.check(
    "1: D turns Draw on: the well's edge is the brand accent (brand-solid), 2px, inside its box",
    accentEdge(drawEdge),
    JSON.stringify(drawEdge)
  );
  await on.page.keyboard.press("c");
  await pageInComment(frame, true);
  await settle(on.page, 300);
  const edge = await readEdge();
  const pressed = await comment.getAttribute("aria-selected");
  on.kit.check(
    "1: C turns Comment on: its segment chosen (aria-selected), the well's edge the brand accent (brand-solid), 2px, inside its box",
    pressed === "true" && accentEdge(edge),
    `aria-selected ${pressed}; ${JSON.stringify(edge)}`
  );
  // The mode's segments draw their glyphs alone (TabItem `glyphOnly`): the
  // name is sr-only, still the tab's accessible name.
  const label = await comment.evaluate((tab) => {
    const words = tab.querySelector<HTMLElement>(
      '[data-slot="tab-item-label"]'
    );
    const style = words ? getComputedStyle(words) : null;
    return {
      position: style?.position ?? null,
      width: words?.getBoundingClientRect().width ?? null,
      clip: style?.clipPath ?? null,
      text: words?.textContent?.trim() ?? null,
    };
  });
  const named = await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-slot="modes"]'
    )
    .getByRole("tab", { name: "Comment", exact: true })
    .count();
  on.kit.check(
    "1: the mode's segments draw their glyphs alone: the name sr-only, still the tab's name",
    label.position === "absolute" &&
      label.width === 1 &&
      label.clip === "inset(50%)" &&
      label.text === "Comment" &&
      named === 1,
    JSON.stringify({ label, named })
  );

  const b = await screenBox(on, frame, "#para");
  await on.page.mouse.click(b.x + b.w * 0.3, b.y + b.h / 2);
  const pins = await until(
    "pin 1 in the doc",
    async () => (await docOf(frame)).pins,
    (all) => !!pinNumbered(all, 1),
    10_000
  ).catch(() => ({}) as Pins);
  const pin = pinNumbered(pins, 1);
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  await settle(on.page, 500);
  const disc = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"] circle')
    .boundingBox({ timeout: 2000 })
    .catch(() => null);
  const cardBox = await card.boundingBox({ timeout: 2000 }).catch(() => null);
  // Beside what the pin stands on, the gap `--space-3` (11): its end side,
  // its start side or below it, on the side PinCard says (`data-side`).
  const para = await frame
    .locator("#para")
    .boundingBox({ timeout: 2000 })
    .catch(() => null);
  const side = await card.getAttribute("data-side").catch(() => null);
  const GAP = 11;
  const at = {
    end: (c: Rect, p: Rect) => Math.abs(c.x - (p.x + p.w + GAP)) <= 3,
    start: (c: Rect, p: Rect) => Math.abs(c.x + c.w - (p.x - GAP)) <= 3,
    below: (c: Rect, p: Rect) => Math.abs(c.y - (p.y + p.h + GAP)) <= 3,
  } as const;
  const asRect = (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    ({
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height,
    }) as Rect;
  const beside =
    !!disc &&
    !!cardBox &&
    !!para &&
    (side === "end" || side === "start" || side === "below") &&
    at[side](asRect(cardBox), asRect(para)) &&
    !meets(asRect(cardBox), asRect(para));
  on.kit.check(
    "1: a tap writes pin 1 with the paragraph's selector, source and text, and opens its card beside the paragraph it stands on, never over it",
    pin?.kind === "comment" &&
      pin.by === "person" &&
      pin.anchor.selector === "#para" &&
      pin.anchor.source?.file === "src/Hero.svelte" &&
      pin.anchor.source.line === 12 &&
      String(pin.anchor.text).startsWith("A paragraph to comment on") &&
      Array.isArray(pin.thread) &&
      pin.thread.length === 0 &&
      beside,
    `pin ${JSON.stringify(pin && { kind: pin.kind, anchor: pin.anchor, thread: pin.thread })}; disc ${JSON.stringify(disc)}; paragraph ${JSON.stringify(para)}; card ${JSON.stringify(cardBox)} on side ${side}; said ${on.said.slice(0, 3).join(" | ") || "nothing"}`
  );
  if (!(pin && cardBox)) {
    return null;
  }
  const first = await focusedCard(on, 1);
  on.kit.check(
    "a: the first tapped pin's card is in the pane with its field focused",
    first.shown && first.focused,
    JSON.stringify(first)
  );
  const head = await headOf(card);
  on.kit.check(
    "1: the card's head names pin 1 in words, its component and the paragraph's text, never its selector; the file:line dim under it; the selector only in the tooltip; no picture",
    head.name === "Hero · A paragraph to comment on, long enough to tap." &&
      head.source === "src/Hero.svelte:12" &&
      head.tip === "#para" &&
      !head.shown.includes("#para") &&
      head.pictures === 0,
    JSON.stringify(head)
  );

  // Words in its field, so the card's dismissal keeps the pin (the said reply comes in 3).
  await writeIn(on, 1, "Bolder, perhaps.");
  await on.page.keyboard.press("Escape");
  const closed = (await card.count()) === 0;
  await on.page.keyboard.press("Escape");
  const left = await comment.getAttribute("aria-selected");
  const back = await interactTab(on).getAttribute("aria-selected");
  on.kit.check(
    "1: Esc closes the card, and Esc again leaves Comment for Interact",
    closed && left === "false" && back === "true",
    `card closed ${closed}; Comment aria-selected ${left}, Interact ${back}`
  );
  return pin?.id ?? null;
};

/** 2. The radial's Comment on a stroke, the list's two rows, J and K. */
const inkCommentChecks = async (on: On, frame: Frame) => {
  // What reaches the page past the overlay's capture listeners: a pen the ink took never does.
  await frame.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __pens: string[] }).__pens = seen;
    for (const type of ["pointerdown", "pointerup"]) {
      addEventListener(
        type,
        (event) => {
          const e = event as PointerEvent;
          seen.push(
            `${type} ${e.pointerType} ${(e.target as Element).localName}`
          );
        },
        true
      );
    }
  });
  const { from } = await strokeOver(on, frame, "#second");
  const drawn = Object.keys((await docOf(frame)).ink).length;
  if (drawn === 0) {
    const outer = await on.page
      .locator('iframe[title="Preview"]')
      .boundingBox();
    const state = await frame.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const layer = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer");
        return `hit ${el?.localName}${el?.id ? `#${el.id}` : ""}; layer ${layer?.className}; past the overlay ${(window as unknown as { __pens: string[] }).__pens.join(", ") || "nothing"}`;
      },
      [from.x - (outer?.x ?? 0), from.y - (outer?.y ?? 0)]
    );
    on.kit.note(
      `the stroke over #second kept no group: ${state}; the pane's well ${JSON.stringify(outer)}; said ${on.said.join(" | ") || "nothing"}`
    );
  }
  await dragFromIcon(on, frame, 0, 40);
  const doc = await until(
    "pin 2 in the doc",
    () => docOf(frame),
    (now) => !!pinNumbered(now.pins, 2),
    10_000
  ).catch(() => docOf(frame));
  const pin = pinNumbered(doc.pins, 2);
  const group = pin?.ink ? doc.ink[String(pin.ink)] : undefined;
  const box = group?.page as { w?: number; h?: number } | undefined;
  on.kit.check(
    "2: the radial menu's Comment writes pin 2 on the ink, with the ink's box",
    pin?.kind === "comment" &&
      typeof pin.ink === "string" &&
      !!box?.w &&
      !!box.h,
    `pin ${JSON.stringify(pin && { kind: pin.kind, ink: pin.ink })}; box ${JSON.stringify(box)}`
  );
  await writeIn(on, 2, "This stroke, thicker.");
  await on.page.keyboard.press("Escape");
  const rows = await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"]')
    .count();

  await (await rowsOf(on)).locator('[data-slot="pin-row"]').first().focus();
  const steps: { current: string | null; outline: boolean }[] = [];
  for (const [key, selector] of [
    ["j", "#para"],
    ["j", "#second"],
    ["k", "#para"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time, each read where it lands
    await on.page.keyboard.press(key);
    await settle(on.page, 700);
    const current = await on.page
      .locator(
        '[data-slot="pin-list"] [data-slot="pin-row"][aria-current="true"]'
      )
      .getAttribute("data-pin-row")
      .catch(() => null);
    steps.push({
      current,
      outline: near(await outlineOf(frame), await boxIn(frame, selector), 4),
    });
  }
  on.kit.check(
    "2: the list shows two rows; J, J, K focus pins 1, 2, 1 and the outline follows",
    rows === 2 &&
      steps.map((step) => step.current).join() === "1,2,1" &&
      steps.every((step) => step.outline),
    `${rows} rows; ${JSON.stringify(steps)}`
  );
  return pin?.id ?? null;
};

/** 3. A reply in the card, delivered by itself once quiet; a second reply, one more delivery. */
const sendChecks = async (on: On, frame: Frame, one: string) => {
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  const before = heard.length;
  const rows = await on.page.locator('[data-slot="turn"][data-you]').count();
  await card.getByRole("textbox").fill("Make it bolder.");
  await card.getByRole("button", { name: "Reply" }).click();
  const replied = await until(
    "the reply in pin 1's thread",
    async () => (await docOf(frame)).pins[one] as { thread?: unknown[] },
    (pin) => (pin?.thread?.length ?? 0) === 1,
    5000
  ).catch(() => null);
  const entry = (replied?.thread?.[0] ?? null) as {
    by?: string;
    text?: string;
  } | null;
  on.kit.check(
    "3: a reply typed in the card is in pin 1's thread, by the person",
    entry?.by === "person" && entry.text === "Make it bolder.",
    JSON.stringify(entry)
  );
  await on.page.keyboard.press("Escape");

  const message = await until(
    "the comments' delivery at the model",
    () => heard.slice(before).find((said) => NOTICE.test(said.last)),
    Boolean,
    DELIVERY_MS
  ).catch(() => undefined);
  // The delivery's pictures ride with it: the only images in that request.
  const pictures = message?.body.match(IMAGE_BLOCK)?.length ?? 0;
  const line = on.page.locator("[data-artifact-responses]");
  await line
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await settle(on.page, 500);
  const ownRows = await on.page.locator('[data-slot="turn"][data-you]').count();
  const lines = await line.count();
  const stamped = await until(
    "sentAt on pin 1 and its entry",
    () => docOf(frame),
    (doc) => {
      const pin = doc.pins[one] as
        | { sentAt?: string; thread: { by: string; sentAt?: string }[] }
        | undefined;
      return (
        !!pin?.sentAt &&
        pin.thread.every((said) => said.by !== "person" || !!said.sentAt)
      );
    },
    10_000
  ).catch(() => docOf(frame));
  const sendControls = await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-slot="send"]'
    )
    .count();
  const words = message?.last ?? "";
  on.kit.check(
    "3: with no Send, the reply reaches the session by itself: pin 1 with its words and its picture (pin 2, said nothing in, waits); one quiet line, no row of the person's; pin 1 stamped sentAt; no Send control in the pane",
    words.includes("## 1. comment on #para") &&
      words.includes('- I wrote: "Make it bolder."') &&
      words.includes(`- Pin: ${one}`) &&
      !words.includes("## 2.") &&
      pictures === 1 &&
      lines === 1 &&
      ownRows === rows &&
      sendControls === 0 &&
      !!(stamped.pins[one] as { sentAt?: string } | undefined)?.sentAt,
    `pictures ${pictures}; lines ${lines}; person's rows ${rows} → ${ownRows}; Send controls ${sendControls}; heard ${words.slice(0, 400)}`
  );

  const again = heard.length;
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  await card.getByRole("textbox").fill("And a little larger.");
  await card.getByRole("button", { name: "Reply" }).click();
  const second = await until(
    "the second reply's delivery",
    () => heard.slice(again).find((said) => NOTICE.test(said.last)),
    Boolean,
    DELIVERY_MS
  ).catch(() => undefined);
  on.kit.check(
    "3: a second reply is one more delivery, with that reply",
    !!second?.last.includes('- I wrote: "And a little larger."') &&
      !second.last.includes('- I wrote: "Make it bolder."'),
    second?.last.slice(0, 300) ?? "no delivery"
  );
};

/** 4. comment_read, comment_reply with the live dot, comment_resolve, Reopen. */
const agentChecks = async (on: On, frame: Frame, one: string, two: string) => {
  const read = await on.call(READ, { filter: "all" });
  on.kit.check(
    "4: comment_read answers both pins, pin 1's source and reply, pin 2's ink box, and the page's address",
    read.includes(one) &&
      read.includes(two) &&
      read.includes("src/Hero.svelte") &&
      read.includes("Make it bolder.") &&
      read.includes('"inkBox"') &&
      read.includes('"address"'),
    read.slice(read.indexOf("{"), read.indexOf("{") + 600)
  );

  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  // The live dot stands on the row of the pin the last delivery carried. The
  // rows are read with the panel in view: stacked, the open card stands over
  // it, and rowsOf brings it back with the card's Close.
  const rows = await rowsOf(on);
  let live = false;
  // Polls the list while the agent's turn runs.
  const watch = setInterval(async () => {
    if (
      (await rows
        .locator(
          ':is([data-task-card-live], [data-slot="live"], [data-compaction-divider-live], [data-plan-pane-live], [data-session-hover-tone~="live"], [data-session-status-tone~="live"], [data-delegate-tone~="live"])'
        )
        .count()) > 0
    ) {
      live = true;
    }
  }, 100);
  slow.add(String(Number(lastMarker) + 1));
  await on.call(REPLY, {
    pin: one,
    text: "Made it bolder in `src/Hero.svelte`.",
    files: ["src/Hero.svelte"],
  });
  const done = answeredAt.get(lastMarker) ?? Date.now();
  if ((await card.count()) === 0) {
    // Stacked: pin 1's card opens from its row.
    await rows.locator('[data-slot="pin-row"][data-pin-row="1"]').click();
  }
  const shown = await until(
    "the agent's reply in the card",
    () => card.locator('[data-slot="entry"][data-by="agent"]').count(),
    (count) => count === 1,
    5000
  )
    .then(() => Date.now())
    .catch(() => Number.NaN);
  await until(
    "the agent's turn to end",
    () =>
      on.page
        .locator(
          ':is([data-pin-list-pop], [data-slot="pin-card"]) :is([data-task-card-live], [data-slot="live"], [data-compaction-divider-live], [data-plan-pane-live], [data-session-hover-tone~="live"], [data-session-status-tone~="live"], [data-delegate-tone~="live"])'
        )
        .count(),
    (count) => count === 0,
    15_000
  ).catch(() => undefined);
  clearInterval(watch);
  on.kit.check(
    "4: comment_reply on pin 1 is in its card within 2 s, the live dot showing while the agent's turn runs",
    shown - done <= 2000 && live,
    `in the card ${shown - done} ms after the tool answered; live dot seen ${live}`
  );

  // The thread in the transcript's two voices (MessageRow): the person's two
  // replies one well (the first runs on, the second grouped under it, the
  // well's surface painted under each), the agent's bare under its mark and
  // the session's name.
  const voices = await card.evaluate((el) => {
    const surface = (node: Element | null) =>
      node ? getComputedStyle(node, "::before").backgroundColor : null;
    const people = [
      ...el.querySelectorAll('[data-slot="entry"][data-by="person"]'),
    ];
    const agent = el.querySelector('[data-slot="entry"][data-by="agent"]');
    const wells = people.map((entry) =>
      entry.querySelector('[data-slot="turn"][data-you] [data-slot="well"]')
    );
    const [upper, lower] = wells.map((well) => well?.getBoundingClientRect());
    const agentTurn = agent?.querySelector('[data-slot="turn"]');
    return {
      people: people.length,
      personWells: wells.map(surface),
      runsOn: people[0]
        ?.querySelector('[data-slot="turn"][data-you]')
        ?.matches("[data-runs-on]"),
      grouped: people[1]
        ?.querySelector('[data-slot="turn"][data-you]')
        ?.matches("[data-grouped]"),
      marks: people.filter((entry) =>
        entry.querySelector(
          '[data-turn-who] :is([data-slot="dot"], [data-account-dot-dot])[data-u]'
        )
      ).length,
      seam: upper && lower ? Math.round(lower.top - upper.bottom) : null,
      agentWell: agent?.querySelector('[data-slot="well"]') ? "yes" : "no",
      agentSurface: agentTurn
        ? getComputedStyle(agentTurn).backgroundColor
        : null,
      agentMark: (() => {
        const dot = agent?.querySelector(
          '[data-turn-who] :is([data-slot="dot"], [data-account-dot-dot]):is([data-a], [data-slot="a"])'
        );
        return dot ? getComputedStyle(dot).backgroundColor : null;
      })(),
      agentName:
        agent
          ?.querySelector('[data-turn-who] [data-slot="role"]')
          ?.textContent?.trim() ?? null,
    };
  });
  const clear = (color: string | null | undefined) =>
    !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
  on.kit.check(
    "4: the card's thread speaks in two voices: the person's two replies one well (painted, the first running on, the second grouped, no gap), the agent's reply bare under its mark and the session's name",
    voices.people === 2 &&
      voices.personWells.every((color) => !clear(color)) &&
      voices.personWells[0] === voices.personWells[1] &&
      voices.runsOn === true &&
      voices.grouped === true &&
      voices.marks === 1 &&
      voices.seam !== null &&
      Math.abs(voices.seam) <= 1 &&
      voices.agentWell === "no" &&
      clear(voices.agentSurface) &&
      !clear(voices.agentMark) &&
      !!voices.agentName &&
      voices.agentName !== "Agent",
    JSON.stringify(voices)
  );

  await on.call(RESOLVE, { pin: one });
  const dim = await until(
    "pin 1 dimmed",
    () =>
      frame
        .locator('svg[data-cawco-pins] g[data-pin="1"]')
        .getAttribute("opacity"),
    (opacity) => opacity === "0.4",
    5000
  ).catch(() => null);
  const openRows = await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"]')
    .count();
  await on.page.getByRole("tab", { name: RESOLVED_TAB }).click();
  const resolved = await on.page
    .locator('[data-slot="pin-list"] [data-slot="pin-row"][data-pin-row="1"]')
    .count();
  on.kit.check(
    "4: comment_resolve dims pin 1 to 40% and moves it to Resolved",
    dim === "0.4" && openRows === 1 && resolved === 1,
    `opacity ${dim}; open rows ${openRows}; resolved row ${resolved}`
  );

  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  await card.getByRole("button", { name: "Reopen" }).click();
  const reopened = await until(
    "pin 1 reopened",
    async () => (await docOf(frame)).pins[one],
    (pin) => !pin?.resolvedAt,
    5000
  ).catch(() => null);
  await (await rowsOf(on)).getByRole("tab", { name: OPEN_TAB }).click();
  const back = await on.page
    .locator('[data-slot="pin-list"] [data-slot="pin-row"][data-pin-row="1"]')
    .count();
  on.kit.check(
    "4: Reopen brings pin 1 back to Open",
    !!reopened && !reopened.resolvedAt && back === 1,
    `resolvedAt ${String(reopened?.resolvedAt)}; open row ${back}`
  );
  await on.page.keyboard.press("Escape");
};

/**
 * 4. A host that holds no doc (the app) posts `cawco:reply` and
 * `cawco:resolve` into the page: the overlay writes them on its own doc and
 * answers each with its result, a gone pin with the refusal's sentence.
 */
const hostChecks = async (on: On, frame: Frame, one: string) => {
  const iframe = await frame.frameElement();
  const ask = async (message: object, type: string) => {
    const read = await readWithin(5000, () =>
      on.page.evaluate(
        ([el, sent, answer]) =>
          new Promise<Record<string, unknown> | null>((resolve) => {
            const win = (el as HTMLIFrameElement).contentWindow;
            if (!win) {
              resolve(null);
              return;
            }
            const listen = (event: MessageEvent) => {
              if (event.source === win && event.data?.type === answer) {
                removeEventListener("message", listen);
                resolve(event.data);
              }
            };
            addEventListener("message", listen);
            // The page's own origin: a preview is never the dashboard's.
            win.postMessage(
              sent,
              new URL((el as HTMLIFrameElement).src).origin
            );
          }),
        [iframe, message, type] as const
      )
    );
    switch (read.kind) {
      case "answered":
        return read.value;
      case "unanswered":
        throw new Error(
          `the page did not answer ${type} within ${read.after} ms`
        );
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  };
  type Thread = { by: string; text: string }[];
  const pinNow = async () =>
    ((await docOf(frame)).pins[one] ?? {}) as {
      resolvedAt?: string;
      thread?: Thread;
    };
  const replied = await ask(
    { type: "cawco:reply", pin: one, text: "From the app." },
    "cawco:reply-result"
  );
  const entry = (await pinNow()).thread?.at(-1);
  const resolved = await ask(
    { type: "cawco:resolve", pin: one, resolved: true },
    "cawco:resolve-result"
  );
  const { resolvedAt } = await pinNow();
  const reopened = await ask(
    { type: "cawco:resolve", pin: one, resolved: false },
    "cawco:resolve-result"
  );
  const cleared = !(await pinNow()).resolvedAt;
  const gone = await ask(
    { type: "cawco:reply", pin: "no-such-pin", text: "Lost." },
    "cawco:reply-result"
  );
  const goneDelete = await ask(
    { type: "cawco:delete", pin: "no-such-pin" },
    "cawco:delete-result"
  );
  on.kit.check(
    "c: the host's cawco:delete on a gone pin answers cawco:delete-result with the refusal's sentence",
    goneDelete?.pin === "no-such-pin" &&
      goneDelete.ok === false &&
      goneDelete.error ===
        "This pin is gone from the page already, so there was nothing to delete.",
    JSON.stringify(goneDelete)
  );
  on.kit.check(
    "4: the host's cawco:reply and cawco:resolve write pin 1's doc (a person's entry, resolvedAt set then cleared) and answer ok; a gone pin answers the refusal",
    replied?.pin === one &&
      replied.ok === true &&
      entry?.by === "person" &&
      entry.text === "From the app." &&
      resolved?.ok === true &&
      !!resolvedAt &&
      reopened?.ok === true &&
      cleared &&
      gone?.ok === false &&
      gone.error ===
        "This pin is gone from the page, so the reply wasn't kept.",
    `reply ${JSON.stringify(replied)}; entry ${JSON.stringify(entry)}; resolve ${JSON.stringify(resolved)} at ${String(resolvedAt)}; reopen ${JSON.stringify(reopened)} cleared ${cleared}; gone ${JSON.stringify(gone)}`
  );
};

/** 5. Re-anchoring by file:line, by text, a gone pin's row and its card's Pin it somewhere else. */
const anchorChecks = async (on: On, frame: Frame, id: string, one: string) => {
  const discY = () =>
    frame
      .locator('svg[data-cawco-pins] g[data-pin="1"]')
      .evaluate(
        (g) =>
          (g as SVGGElement).transform.baseVal.consolidate()?.matrix.f ??
          Number.NaN
      )
      .catch(() => Number.NaN);
  const before = await discY();
  const anchorOf = async () =>
    ((await docOf(frame)).pins[one] ?? {}) as {
      anchor?: { selector?: string; source?: { line?: number } | null };
      movedAt?: string;
    };

  await on.call(UPDATE, { id, html: page("moved") });
  const moved = await until(
    "pin 1 found by its file:line",
    anchorOf,
    (pin) => pin.anchor?.selector === "#para-moved",
    10_000
  ).catch(anchorOf);
  await settle(on.page, 300);
  const after = await discY();
  on.kit.check(
    "5: a re-publish that moves and rewords the paragraph re-anchors pin 1 by its file:line",
    moved.anchor?.selector === "#para-moved" &&
      moved.anchor.source?.line === 12 &&
      after - before >= 190,
    `${JSON.stringify(moved.anchor)}; disc y ${before} → ${after}`
  );

  await on.call(UPDATE, { id, html: page("renamed") });
  const renamed = await until(
    "pin 1 found by its text",
    anchorOf,
    (pin) => pin.anchor?.selector === "#para-renamed",
    10_000
  ).catch(anchorOf);
  on.kit.check(
    "5: one that renames it and drops its source, its text kept, re-anchors pin 1 by text",
    renamed.anchor?.selector === "#para-renamed" && !renamed.movedAt,
    JSON.stringify(renamed)
  );

  await on.call(UPDATE, { id, html: page("gone") });
  const gone = await until(
    "pin 1 moved aside",
    anchorOf,
    (pin) => !!pin.movedAt,
    10_000
  ).catch(anchorOf);
  const goneRow = (await rowsOf(on)).locator(
    '[data-slot="pin-row"][data-pin-row="1"][data-moved]'
  );
  await goneRow.waitFor({ timeout: 5000 }).catch(() => undefined);
  const inOpen = await goneRow.count();
  on.kit.check(
    "5: one that removes it marks pin 1 moved, its row under Open",
    !!gone.movedAt && inOpen === 1,
    `movedAt ${String(gone.movedAt)}; moved rows ${inOpen}`
  );

  const commentButton = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  const modeBefore = await commentButton.getAttribute("aria-selected");
  // Its row opens its card like any other; the card says the loss and offers Pin it somewhere else.
  await goneRow.click();
  const card = on.page.locator('[data-pin-card="1"]');
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  const notice = card.locator('[data-slot="gone"]');
  const said = (await notice.textContent().catch(() => null))?.trim() ?? null;
  await notice.getByRole("button", { name: "Pin it somewhere else" }).click();
  await pageInComment(frame, true);
  const during = await commentButton.getAttribute("aria-selected");
  const placingSaid =
    (await notice.textContent().catch(() => null))?.trim() ?? null;
  const cancel = await notice.getByRole("button", { name: "Cancel" }).count();
  on.kit.check(
    "5: the gone pin's row opens its card, which says the element is gone; Pin it somewhere else turns Comment on with the card still open, saying where to tap beside Cancel",
    said?.startsWith("Its element is gone from the page") === true &&
      during === "true" &&
      placingSaid?.startsWith("Tap the page where it goes") === true &&
      cancel === 1,
    `said ${JSON.stringify(said)}; Comment ${during}; then ${JSON.stringify(placingSaid)}; Cancel ${cancel}`
  );
  // The tap lands at #third's leading edge, clear of the card at the room's top-right and the panel.
  const b = await screenBox(on, frame, "#third");
  await on.page.mouse.click(b.x + Math.min(24, b.w / 4), b.y + b.h / 2);
  const placed = await until(
    "pin 1 placed again",
    anchorOf,
    (pin) => !pin.movedAt && pin.anchor?.selector === "#third",
    10_000
  ).catch(anchorOf);
  await settle(on.page, 300);
  const mode = await commentButton.getAttribute("aria-selected");
  on.kit.check(
    "5: the next tap pins it anew, no longer moved, and Comment goes back off",
    modeBefore === "false" &&
      during === "true" &&
      !placed.movedAt &&
      placed.anchor?.selector === "#third" &&
      mode === "false",
    `Comment ${modeBefore} → ${during} → ${mode}; anchor ${JSON.stringify(placed.anchor)}; movedAt ${String(placed.movedAt)}`
  );
};

/**
 * A dev server's app whose content stands in a same-origin inner frame, as
 * the owner's Routines preview does: a header over a framed page, the frame
 * inset and bordered so its offset is no round number, and the inner page
 * tall enough to scroll.
 */
const OUTER_APP = `<!doctype html><html lang="en"><head><title>Routines</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  header { height: 56px; }
  main { padding-left: 37px; }
  iframe { display: block; width: 80%; height: 420px; border: 3px solid #ccc; }
</style></head>
<body><div id="app"><div><header>Routines</header><main><div><iframe src="inner/" title="Routines inner"></iframe></div></main></div></div></body></html>`;
/** The inner page; on every load after the first, a band above moves its button down, so a pin found again is found on the button, not where it was tapped. */
const innerApp = (
  moved: boolean
) => `<!doctype html><html lang="en"><head><title>Inner</title>
<style>
  body { margin: 0; padding: 24px 29px; font: 16px/1.5 system-ui; }
  .band { height: 90px; }
  .tall { height: 1400px; }
</style></head>
<body><p>The routines, inside a frame.</p>${moved ? '<div class="band"></div>' : ""}<button type="button">Run routine</button><p class="tall">Below.</p></body></html>`;

/** Where pin `number`'s disc stands in the outer page's viewport; null when it is not drawn. */
const discAt = (outer: Frame, number: number) =>
  outer.evaluate((n) => {
    const g = document.querySelector<SVGGElement>(
      `svg[data-cawco-pins] g[data-pin="${n}"]`
    );
    const m = g?.transform.baseVal.consolidate()?.matrix;
    return m ? { x: m.e - scrollX, y: m.f - scrollY } : null;
  }, number);

/** The outer page's inner frame, once its document has the button. */
const innerFrameOf = async (outer: Frame): Promise<Frame> =>
  (await until(
    "the inner frame's button",
    async () => {
      const handle = await outer
        .locator('iframe[title="Routines inner"]')
        .elementHandle()
        .catch(() => null);
      const inner = await handle?.contentFrame();
      return inner && (await inner.locator("button").count()) === 1
        ? inner
        : null;
    },
    Boolean,
    30_000
  )) as Frame;

/**
 * The inner frame's own overlay, read through the DevTools protocol. Neither
 * test page runs a script of its own, so every listener on the outer page's
 * window is its overlay's: their script ids name the outer overlay. The inner
 * frame answers whether the script loaded there (its window carries the
 * boot mark), how many `cawco-overlay` elements and overlay globals it holds,
 * and how many listeners on its window and its document's tree come from any
 * script but the outer overlay's (the outer's watch of the inner window is
 * the outer's own).
 */
const innerOverlay = async (on: On, preview: Frame) => {
  // The preview is an origin of its own, in a process of its own (the
  // dashboard sends Origin-Agent-Cluster): its frames are read through its
  // own DevTools session, never the dashboard page's.
  const cdp = await on.page.context().newCDPSession(preview);
  try {
    const { frameTree } = await cdp.send("Page.getFrameTree");
    type Tree = typeof frameTree;
    const find = (
      node: Tree,
      parent: string | null
    ): { inner: string; outer: string | null } | null =>
      node.frame.url.includes("/inner/")
        ? { inner: node.frame.id, outer: parent }
        : ((node.childFrames ?? [])
            .map((child) => find(child, node.frame.id))
            .find(Boolean) ?? null);
    const frames = find(frameTree, null);
    const contexts: { frameId?: string; id: number; isDefault?: boolean }[] =
      [];
    cdp.on("Runtime.executionContextCreated", ({ context }) =>
      contexts.push({
        id: context.id,
        frameId: context.auxData?.frameId,
        isDefault: (context.auxData as { isDefault?: boolean } | undefined)
          ?.isDefault,
      })
    );
    await cdp.send("Runtime.enable");
    const contextOf = (frameId: string | null | undefined) =>
      contexts.find((one) => one.frameId === frameId && one.isDefault)?.id;
    const inner = contextOf(frames?.inner);
    const outer = contextOf(frames?.outer);
    if (!(inner && outer)) {
      return null;
    }
    const listenersOf = async (contextId: number, expression: string) => {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression,
        contextId,
      });
      return (
        await cdp.send("DOMDebugger.getEventListeners", {
          objectId: result.objectId as string,
          depth: -1,
          pierce: true,
        })
      ).listeners;
    };
    const outerScripts = new Set(
      (await listenersOf(outer, "window")).map((one) => one.scriptId)
    );
    const innerListeners = [
      ...(await listenersOf(inner, "window")),
      ...(await listenersOf(inner, "document")),
    ];
    const state = await cdp.send("Runtime.evaluate", {
      expression: `({
        marked: typeof window.__cawcoOverlay === "object",
        elements: document.querySelectorAll("cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins]").length,
        globals: ["cawco", "cawcoArtifact"].filter((name) => name in window).length,
      })`,
      contextId: inner,
      returnByValue: true,
    });
    return {
      ...(state.result.value as {
        elements: number;
        globals: number;
        marked: boolean;
      }),
      outerScripts: outerScripts.size,
      watched: innerListeners.map((one) => one.type).join(","),
      foreign: innerListeners
        .filter((one) => !outerScripts.has(one.scriptId))
        .map((one) => one.type),
    };
  } finally {
    await cdp.detach();
  }
};

/** The inner button's box in the outer page's viewport: the frame's content box plus the button's own. */
const innerButtonBox = (outer: Frame) =>
  outer.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Routines inner"]'
    );
    const button = frame?.contentDocument?.querySelector("button");
    if (!(frame && button)) {
      return null;
    }
    const f = frame.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    return {
      x: f.x + frame.clientLeft + b.x,
      y: f.y + frame.clientTop + b.y,
      w: b.width,
      h: b.height,
    };
  });

/**
 * (b2) A same-origin frame whose document has no root yet when the overlay
 * reads it: a frame put in and its document opened (`document.open()` takes
 * its root away until it is written), as a navigation's new document stands
 * from its commit to its first bytes. The overlay watches that frame's root
 * once it has one, and says no error: main observed `documentElement`
 * whatever it was ("Failed to execute 'observe' on 'ResizeObserver':
 * parameter 1 is not of type 'Element'", seen twice by the probe of
 * 2026-10-18). The error's stack, when there is one, is in the line.
 */
const rootlessFrameCheck = async (on: On, outer: Frame) => {
  const said = await outer.evaluate(async (idleMs) => {
    const errors: string[] = [];
    let phase = "at rest";
    const caught = (event: ErrorEvent) => {
      const where =
        event.currentTarget === window
          ? "page"
          : ((event.currentTarget as Window | null)?.frameElement?.getAttribute(
              "title"
            ) ?? "frame");
      errors.push(
        `[${phase}, ${where}] ${event.message} @ ${event.error?.stack ?? "no stack"}`
      );
    };
    // The page's window and every frame's: a frame's own observer reports there.
    const views = () => [
      window,
      ...[...document.querySelectorAll("iframe")].flatMap((one) =>
        one.contentWindow ? [one.contentWindow] : []
      ),
    ];
    for (const view of views()) {
      view.addEventListener("error", caught);
    }
    // What the page says at rest before the frame comes.
    await new Promise((resolve) => setTimeout(resolve, 300));
    phase = "the frame put in";
    const frame = document.createElement("iframe");
    frame.title = "Rootless";
    document.body.append(frame);
    // Before the overlay's MutationObserver hears the frame come: its document emptied.
    const doc = frame.contentDocument;
    doc?.open();
    const rootless = !!doc && doc.documentElement === null;
    frame.contentWindow?.addEventListener("error", caught);
    await new Promise((resolve) => setTimeout(resolve, 300));
    doc?.write("<!doctype html><p>Written later.</p>");
    doc?.close();
    phase = "written";
    await new Promise((resolve) => setTimeout(resolve, 300));
    phase = "idle after";
    // At rest, a pin standing in the inner frame: the pin layer draws no disc again.
    const layer = document.querySelector("svg[data-cawco-pins]");
    let drawn = 0;
    const watch = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.hasAttribute("data-pin-id")) {
            drawn += 1;
          }
        }
      }
    });
    if (layer) {
      watch.observe(layer, { childList: true });
    }
    const discs = layer?.querySelectorAll("[data-pin-id]").length ?? 0;
    await new Promise((resolve) => setTimeout(resolve, idleMs));
    watch.disconnect();
    for (const view of [...views(), frame.contentWindow]) {
      view?.removeEventListener("error", caught);
    }
    frame.remove();
    return { rootless, errors, discs, drawn };
  }, IDLE_MS);
  on.kit.check(
    "b2: a same-origin frame whose document has no root yet when the overlay reads it: no window says an error, the page's nor a frame's",
    said.rootless && said.errors.length === 0,
    JSON.stringify({
      rootless: said.rootless,
      count: said.errors.length,
      by: Object.entries(
        said.errors.reduce<Record<string, number>>((all, one) => {
          const key = one.slice(0, one.indexOf("]") + 1);
          all[key] = (all[key] ?? 0) + 1;
          return all;
        }, {})
      ),
      first: said.errors.slice(0, 2),
    })
  );
  on.kit.check(
    `b2: at rest with a pin in a same-origin frame, the page draws no disc again over ${IDLE_MS} ms`,
    said.discs > 0 && said.drawn === 0,
    `discs ${said.discs}; drawn again ${said.drawn}`
  );
};

/** How long b2 leaves the page alone while its pin layer is watched, ms. */
const IDLE_MS = 1000;

/** (b) Comment mode reaches into a same-origin inner frame: the outline, the anchor, the card, re-location after a reload. */
const frameChecks = async (on: On) => {
  let innerLoads = 0;
  const app = Bun.serve({
    port: 0,
    fetch: (request) => {
      const inner = new URL(request.url).pathname.includes("/inner");
      if (inner) {
        innerLoads += 1;
      }
      return new Response(inner ? innerApp(innerLoads > 1) : OUTER_APP, {
        headers: { "content-type": "text/html" },
      });
    },
  });
  try {
    await on.call(CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "routines",
      port: app.port,
    });
    const outer = (await until(
      "the preview's outer page in the pane",
      async () => {
        const frame = await pageFrame(on);
        return (await frame
          .locator('iframe[title="Routines inner"]')
          .count()
          .catch(() => 0)) === 1
          ? frame
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
    await innerFrameOf(outer);
    await settle(on.page, 600);
    const standing = await innerOverlay(on, outer);
    const outerHost = await outer.locator("cawco-overlay").count();
    on.kit.check(
      "b: the preview runs one overlay: the inner frame loaded the script (its mark) but holds no cawco-overlay element, layer or global, and every listener on its window and document is the outer overlay's; the outer page holds its own",
      !!standing &&
        standing.marked &&
        standing.elements === 0 &&
        standing.globals === 0 &&
        standing.outerScripts > 0 &&
        standing.foreign.length === 0 &&
        outerHost === 1,
      `inner ${JSON.stringify(standing)}; outer overlay elements ${outerHost}`
    );
    const comment = on.page.locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    );
    await comment.click();
    await pageInComment(outer, true);
    const pane = await on.page.locator(FRAME).boundingBox();
    const button = await innerButtonBox(outer);
    if (!(pane && button)) {
      on.kit.check("b: the inner frame's button has a box", false, "none");
      return;
    }
    const at = {
      x: pane.x + button.x + button.w * 0.4,
      y: pane.y + button.y + button.h / 2,
    };
    await on.page.mouse.move(at.x - 20, at.y - 20);
    await on.page.mouse.move(at.x, at.y, { steps: 4 });
    await settle(on.page, 200);
    const outline = await outlineOf(outer);
    const label = await outer.evaluate(
      () =>
        document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector<HTMLElement>(".label")?.textContent ?? ""
    );
    on.kit.check(
      "b: hovering the inner frame's button outlines the button, mapped to the top document (±1px), not the frame",
      near(outline, button, 1) && label.startsWith("button"),
      `outline ${JSON.stringify(outline)}; button ${JSON.stringify(button)}; label ${JSON.stringify(label)}`
    );

    const before = Object.keys((await docOf(outer)).pins).length;
    await on.page.mouse.click(at.x, at.y);
    const pins = await until(
      "the inner button's pin in the doc",
      async () => (await docOf(outer)).pins,
      (all) => Object.keys(all).length > before,
      10_000
    ).catch(() => ({}) as Pins);
    const made = Object.values(pins).sort(
      (a, b) => Number(b.number) - Number(a.number)
    )[0] as
      | {
          anchor: { frames?: string[]; selector: string };
          id: string;
          number: number;
        }
      | undefined;
    const resolves = made
      ? await outer.evaluate(({ frames, selector }) => {
          let doc: Document | null | undefined = document;
          for (const one of frames ?? []) {
            doc = doc?.querySelector<HTMLIFrameElement>(one)?.contentDocument;
          }
          const el = doc?.querySelector(selector);
          return el?.localName === "button" && el.textContent === "Run routine";
        }, made.anchor)
      : false;
    const card = await focusedCard(on, made?.number);
    on.kit.check(
      "b: a tap on it stores an anchor whose frame chain names the frame and whose inner selector ends at the button, and its card opens with the field focused",
      !!made &&
        made.anchor.frames?.length === 1 &&
        resolves &&
        card.shown &&
        card.focused,
      `anchor ${JSON.stringify(made?.anchor)}; resolves ${resolves}; card ${JSON.stringify(card)}`
    );
    if (!made) {
      return;
    }
    await writeIn(on, made.number, "Run it on a schedule.");
    await on.page.keyboard.press("Escape");
    await on.page.keyboard.press("Escape");

    await on.page
      .locator(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-label="Reload"]'
      )
      .click();
    const reloaded = (await until(
      "the reloaded preview",
      async () => {
        const frame = await pageFrame(on);
        return frame !== outer &&
          (await frame
            .locator('iframe[title="Routines inner"]')
            .count()
            .catch(() => 0)) === 1
          ? frame
          : null;
      },
      Boolean,
      30_000
    )) as Frame;
    const inner = await innerFrameOf(reloaded);
    const box = await innerButtonBox(reloaded);
    const onButton = (centre: { x: number; y: number } | null) =>
      !!centre &&
      !!box &&
      centre.x >= box.x - 1 &&
      centre.x <= box.x + box.w + 1 &&
      centre.y >= box.y - 1 &&
      centre.y <= box.y + box.h + 1;
    const disc = await until(
      "the pin re-placed on the moved button",
      () => discAt(reloaded, made.number),
      onButton,
      10_000
    ).catch(() => discAt(reloaded, made.number));
    on.kit.check(
      "b: after a reload that moves the button 90px down in its frame, the pin is re-located on the same button",
      onButton(disc) && innerLoads >= 2,
      `disc ${JSON.stringify(disc)}; button ${JSON.stringify(box)}; inner loads ${innerLoads}`
    );

    // The inner frame scrolls on its own, the outer page still: the disc follows.
    await inner.evaluate(() => scrollTo(0, 40));
    const scrolled = await until(
      "the disc moved with the frame's scroll",
      () => discAt(reloaded, made.number),
      (now) => !!now && !!disc && Math.abs(disc.y - 40 - now.y) <= 1,
      5000
    ).catch(() => discAt(reloaded, made.number));
    on.kit.check(
      "b: scrolling the inner frame 40px moves the pin's disc up 40px (±1px)",
      !!disc && !!scrolled && Math.abs(disc.y - 40 - scrolled.y) <= 1,
      `disc y ${disc?.y} → ${scrolled?.y}`
    );
    await rootlessFrameCheck(on, reloaded);
  } finally {
    await app.stop(true);
  }
};

/**
 * A page that shows other pages as frames drawn smaller than their own size,
 * as the owner's files preview does (figures holding desks): one frame drawn
 * at half its size by a transform, one at its own; each bordered and padded,
 * so neither offset is a round number.
 */
const SCALED_APP = `<!doctype html><html lang="en"><head><title>Desks</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  header { height: 41px; }
  .desks { padding-left: 19px; }
  figure { margin: 0 0 23px; overflow: hidden; }
  iframe { display: block; border: 3px solid #999; padding: 5px; }
  .half { width: 408px; height: 248px; }
  .half iframe { width: 800px; height: 480px; transform: scale(0.5); transform-origin: 0 0; }
  .whole iframe { width: 300px; height: 240px; }
</style></head>
<body><header>Desks</header><div class="desks"><figure class="half"><iframe src="desk/" title="Desk half"></iframe></figure><figure class="whole"><iframe src="desk/" title="Desk whole"></iframe></figure></div></body></html>`;
const DESK_APP = `<!doctype html><html lang="en"><head><title>Desk</title>
<style>
  body { margin: 0; padding: 24px 29px; font: 16px/1.5 system-ui; }
  .transcript { width: 200px; height: 120px; background: #eee; }
</style></head>
<body><p>A desk.</p><div class="transcript">The transcript.</div></body></html>`;
/** Where a pin is tapped on the scaled desk's transcript, as fractions of its box. */
const SCALED_TAP = { x: 0.3, y: 0.5 };

/**
 * (h) Comment mode in frames drawn at another scale: the hover outline, its
 * label and a placed pin's disc and box stand on the element, at half scale
 * and at its own.
 */
const scaledFrameChecks = async (on: On) => {
  const app = Bun.serve({
    port: 0,
    fetch: (request) =>
      new Response(
        new URL(request.url).pathname.includes("/desk") ? DESK_APP : SCALED_APP,
        { headers: { "content-type": "text/html" } }
      ),
  });
  try {
    await on.call(CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "desks",
      port: app.port,
    });
    const outer = (await until(
      "the desks page in the pane",
      async () => {
        const frame = await pageFrame(on);
        return (await frame
          .locator("iframe[title^='Desk']")
          .count()
          .catch(() => 0)) === 2
          ? frame
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
    /** The transcript in desk `title`, its box on the dashboard's screen (Playwright's, through every frame and transform). */
    const transcriptIn = async (title: string) => {
      const desk = await until(
        `${title}'s transcript`,
        async () => {
          const handle = await outer
            .locator(`iframe[title="${title}"]`)
            .elementHandle()
            .catch(() => null);
          const inner = await handle?.contentFrame();
          return inner && (await inner.locator(".transcript").count()) === 1
            ? inner
            : null;
        },
        Boolean,
        30_000
      );
      const box = await desk?.locator(".transcript").boundingBox();
      return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
    };
    await settle(on.page, 600);
    await on.page
      .locator(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
      )
      .click();
    await pageInComment(outer, true);
    const pane = await on.page.locator(FRAME).boundingBox();
    if (!pane) {
      on.kit.check("h: the pane's frame has a box", false, "none");
      return;
    }
    /** A box on the dashboard's screen, in the preview's viewport. */
    const inPane = (screen: {
      x: number;
      y: number;
      w: number;
      h: number;
    }) => ({
      ...screen,
      x: screen.x - pane.x,
      y: screen.y - pane.y,
    });
    for (const [title, scale] of [
      ["Desk half", 0.5],
      ["Desk whole", 1],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one desk hovered after the other
      const shown = await transcriptIn(title);
      if (!shown) {
        on.kit.check(`h: ${title}'s transcript has a box`, false, "none");
        continue;
      }
      const centre = { x: shown.x + shown.w / 2, y: shown.y + shown.h / 2 };
      await on.page.mouse.move(centre.x - 20, centre.y - 20);
      await on.page.mouse.move(centre.x, centre.y, { steps: 4 });
      await settle(on.page, 200);
      const outline = await outlineOf(outer);
      const label = await outer.evaluate(() => {
        const el = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector<HTMLElement>(".label");
        const r = el?.getBoundingClientRect();
        return el && r
          ? { text: el.textContent ?? "", x: r.x, bottom: r.bottom }
          : null;
      });
      const want = inPane(shown);
      on.kit.check(
        `h: hovering the transcript in a frame drawn at ${scale}: the outline is its box on screen (±1px), and the label stands on the outline's top-left (±1px)`,
        Math.abs(shown.w - 200 * scale) <= 1 &&
          near(outline, want, 1) &&
          !!label &&
          label.text.includes("transcript") &&
          Math.abs(label.x - want.x) <= 1 &&
          Math.abs(label.bottom - want.y) <= 1,
        `on screen ${JSON.stringify(want)}; outline ${JSON.stringify(outline)}; label ${JSON.stringify(label)}`
      );
    }

    const half = await transcriptIn("Desk half");
    if (!half) {
      return;
    }
    const tap = {
      x: half.x + half.w * SCALED_TAP.x,
      y: half.y + half.h * SCALED_TAP.y,
    };
    await on.page.mouse.move(tap.x, tap.y, { steps: 4 });
    const before = Object.keys((await docOf(outer)).pins).length;
    await on.page.mouse.click(tap.x, tap.y);
    const pins = await until(
      "the scaled transcript's pin in the doc",
      async () => (await docOf(outer)).pins,
      (all) => Object.keys(all).length > before,
      10_000
    ).catch(() => ({}) as Pins);
    const made = Object.values(pins).sort(
      (a, b) => Number(b.number) - Number(a.number)
    )[0] as
      | {
          anchor: {
            box?: { h: number; w: number; x: number; y: number };
            frames?: string[];
          };
          number: number;
        }
      | undefined;
    if (!made) {
      on.kit.check("h: a tap pins the scaled transcript", false, "no pin");
      return;
    }
    await writeIn(on, made.number, "This desk.");
    await on.page.keyboard.press("Escape");
    await on.page.keyboard.press("Escape");
    await settle(on.page, 300);
    const disc = await discAt(outer, made.number);
    const scroll = await outer.evaluate(() => ({ x: scrollX, y: scrollY }));
    const want = inPane(half);
    const at = { x: tap.x - pane.x, y: tap.y - pane.y };
    const { box } = made.anchor;
    on.kit.check(
      "h: a pin tapped on the half-scale transcript stores its box on screen (±1px) under its frame chain, and its disc stands at the tapped point (±2px)",
      made.anchor.frames?.length === 1 &&
        near(
          box ? { ...box, x: box.x - scroll.x, y: box.y - scroll.y } : null,
          want,
          1
        ) &&
        !!disc &&
        Math.abs(disc.x - at.x) <= 2 &&
        Math.abs(disc.y - at.y) <= 2,
      `anchor ${JSON.stringify(made.anchor)}; on screen ${JSON.stringify(want)}; disc ${JSON.stringify(disc)}; tapped ${JSON.stringify(at)}`
    );
  } finally {
    await app.stop(true);
  }
};

/**
 * (a) Later taps: a second tapped pin, and a third while the second's card
 * is open, each open their card with the field focused. (c) Delete, asked in
 * the card itself: the pin goes from the doc and its disc from the page, its
 * card closes, and the other pins keep their numbers.
 */
const tapAndDeleteChecks = async (on: On, frame: Frame) => {
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.click();
  await pageInComment(frame, true);
  const numbersNow = async () =>
    Object.fromEntries(
      Object.values((await docOf(frame)).pins).map((pin) => [
        String(pin.id),
        Number(pin.number),
      ])
    );
  /** A tap on the page at the screen's `x`, `y` in Comment mode: the new pin's number, and its card as it opens. */
  const tapPin = async (x: number, y: number) => {
    const held = Object.keys(await numbersNow()).length;
    // The pointer comes to the spot first, as a hand's does: the preview is a
    // frame of its own process, which the browser routes input to by where
    // the pointer last stood.
    await on.page.mouse.move(x, y, { steps: 4 });
    await on.page.mouse.click(x, y);
    const now = await until(
      "the tapped pin in the doc",
      numbersNow,
      (pins) => Object.keys(pins).length > held,
      10_000
    ).catch(numbersNow);
    const number = Math.max(...Object.values(now));
    const card = await focusedCard(on, number);
    // Words in it, so its dismissal keeps the pin.
    await writeIn(on, number, "Keep this pin.");
    return { number, ...card };
  };
  // The second tap of the run, then a third made while the second's card is
  // open, on the page below that card (it stands over the paragraphs).
  const second = await screenBox(on, frame, "#second");
  const tapped = [
    await tapPin(second.x + second.w * 0.7, second.y + second.h / 2),
  ];
  // The card stands beside its pin once the page says where the pin is
  // (`cawco:pin-at`), a message from the preview's own process: it is read
  // once it stands still.
  let openCard = await on.page.locator('[data-slot="pin-card"]').boundingBox();
  for (let reads = 0; reads < 20; reads += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one read every 100 ms until two agree
    await on.page.waitForTimeout(100);
    const now = await on.page.locator('[data-slot="pin-card"]').boundingBox();
    if (JSON.stringify(now) === JSON.stringify(openCard)) {
      break;
    }
    openCard = now;
  }
  const tall = await screenBox(on, frame, ".tall");
  tapped.push(
    await tapPin(
      tall.x + 20,
      Math.max(tall.y + 10, (openCard?.y ?? 0) + (openCard?.height ?? 0) + 20)
    )
  );
  on.kit.check(
    "a: the second tapped pin, and a third tapped while the second's card is open, each open their card with its field focused",
    tapped.length === 2 &&
      tapped[1].number === tapped[0].number + 1 &&
      tapped.every((one) => one.shown && one.focused),
    JSON.stringify(tapped)
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");

  const target = tapped[0].number;
  await (
    await rowsOf(on)
  )
    .locator(`[data-slot="pin-row"][data-pin-row="${target}"]`)
    .click();
  const before = await numbersNow();
  const doomed = Object.entries(before).find(
    ([, number]) => number === target
  )?.[0];
  const card = on.page.locator(`[data-pin-card="${target}"]`);
  // The head holds what acts on the pin (Resolve, ⋯, Close) on its row; the foot holds Reply alone.
  const parts = {
    ...(await card.evaluate((el) => {
      const head = el.querySelector('[data-slot="head"]');
      const named = [...(head?.querySelectorAll("button") ?? [])].map(
        (button) => button.getAttribute("aria-label") ?? ""
      );
      const tops = [...(head?.querySelectorAll("button") ?? [])].map((button) =>
        Math.round(button.getBoundingClientRect().top)
      );
      return { named, tops };
    })),
    // By their accessible names: a kit Button's text holds its pending words too.
    foot: await buttonNames(
      card.locator(':is([data-slot="actions"], [data-actions])').first()
    ).catch(() => [] as string[]),
  };
  on.kit.check(
    "c: the card's head holds Resolve pin, its ⋯ and Close on one row, and its foot Reply alone",
    parts.named[0] === "Resolve pin" &&
      parts.named.at(-1) === "Close" &&
      parts.named.length === 3 &&
      new Set(parts.tops).size === 1 &&
      parts.foot.join() === "Reply",
    JSON.stringify(parts)
  );
  await card.locator('[data-slot="head"] button').nth(1).click();
  await on.page.getByRole("menuitem", { name: "Delete pin" }).click();
  const ask = card.locator('[data-ask="delete"]');
  const asked = await ask
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const blocking = await on.page.evaluate(
    () => document.querySelectorAll("dialog[open], [aria-modal='true']").length
  );
  await ask.getByRole("button", { name: "Delete pin" }).click();
  const after = await until(
    "the pin gone from the doc",
    numbersNow,
    (pins) => !!doomed && !(doomed in pins),
    5000
  ).catch(numbersNow);
  const disc = await frame
    .locator(`svg[data-cawco-pins] g[data-pin="${target}"]`)
    .count();
  const cardLeft = await card.count();
  const kept = Object.entries(before).filter(([id]) => id !== doomed);
  on.kit.check(
    "c: Delete asks in the card itself (no blocking dialog); confirming removes the pin from the doc and its disc from the page, closes its card, and every other pin keeps its number",
    asked &&
      blocking === 0 &&
      !!doomed &&
      !(doomed in after) &&
      disc === 0 &&
      cardLeft === 0 &&
      kept.length === Object.keys(after).length &&
      kept.every(([id, number]) => after[id] === number),
    `asked ${asked}; blocking ${blocking}; before ${JSON.stringify(before)}; after ${JSON.stringify(after)}; disc ${disc}; card ${cardLeft}`
  );
};

type Scroller = "window" | "container";
/** The cards on the owner's page: one per subagent, every one written by the same line of markup. */
const CARDS = 16;
/** The header over the transcript, px: what the container's top edge stands under. */
const HEADER = 48;
/** Where the probe taps a card, as fractions of its box. */
const TAP = { x: 0.3, y: 0.5 } as const;

/**
 * A transcript of subagent cards, each with the one `data-insp-path` its
 * component's line gives it and no id, as a dev server's Svelte list is:
 * scrolled by the window, or by a container under a header; `order` the
 * cards' numbers as the list stands, 1 to {@link CARDS} when none.
 */
const cardsPage = (
  scroller: Scroller,
  order = Array.from({ length: CARDS }, (_, i) => i + 1)
) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  header { height: ${HEADER}px; }
  .card { box-sizing: border-box; height: 96px; margin: 0 24px 24px; padding: 16px; border: 1px solid #ccc; border-radius: 8px; }
  ${scroller === "container" ? `html, body { height: 100%; overflow: hidden; } .transcript { position: absolute; top: ${HEADER}px; right: 0; bottom: 0; left: 0; overflow: auto; }` : ""}
</style></head>
<body data-scroller="${scroller}"><header>Session</header><main class="transcript">
${order
  .map(
    (n) =>
      `<article class="card" data-n="${n}" data-insp-path="src/AgentCard.svelte:7:3">Subagent ${n} ran the probe.</article>`
  )
  .join("\n")}
</main></body></html>`;

/** The page's scroll offset, by its scroller (the window's or the container's), and the window's. */
const offsetsIn = (frame: Frame) =>
  frame.evaluate(() => {
    const el =
      document.body.dataset.scroller === "container"
        ? document.querySelector(".transcript")
        : document.scrollingElement;
    return { top: el?.scrollTop ?? Number.NaN, window: scrollY };
  });
/** Scrolls the page's scroller to `top`. */
const scrollPage = (frame: Frame, top: number) =>
  frame.evaluate((to) => {
    const el =
      document.body.dataset.scroller === "container"
        ? document.querySelector(".transcript")
        : document.scrollingElement;
    if (el) {
      el.scrollTop = to;
    }
  }, top);

/**
 * (d) The owner's scenario: scrolled to the middle of a list of cards one
 * line of markup writes, a tap pins the card under it without moving the
 * page, and the pin stays on that card as it scrolls and after a reload.
 */
const scrollChecks = async (on: On, scroller: Scroller) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: `cards-${scroller}`,
    html: cardsPage(scroller),
  });
  const artifactId = made.match(ANSWERED_ID)?.[1];
  if (!artifactId) {
    on.kit.check(
      `d (${scroller}): the page is made`,
      false,
      made.slice(0, 300)
    );
    return;
  }
  const loaded = async (not?: Frame) =>
    (await until(
      `the ${scroller} cards in the pane`,
      async () => {
        const frame = await pageFrame(on);
        if (frame === not) {
          return null;
        }
        const ready = await frame
          .evaluate(
            ([kind, cards]) =>
              document.body?.dataset.scroller === kind &&
              document.querySelectorAll(".card").length === cards &&
              "cawcoArtifact" in window,
            [scroller, CARDS] as const
          )
          .catch(() => false);
        return ready ? frame : null;
      },
      Boolean,
      60_000
    )) as Frame;
  const frame = await loaded();
  await settle(on.page, 400);

  // The middle of the scroll, and the card standing nearest the middle of the view.
  const middle = await frame.evaluate(() => {
    const el =
      document.body.dataset.scroller === "container"
        ? document.querySelector(".transcript")
        : document.scrollingElement;
    return el ? Math.round((el.scrollHeight - el.clientHeight) / 2) : 0;
  });
  await scrollPage(frame, middle);
  await settle(on.page, 200);
  const start = await offsetsIn(frame);
  const n = await frame.evaluate(() => {
    const mid = innerHeight / 2;
    const away = (one: Element) => {
      const r = one.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - mid);
    };
    const cards = [...document.querySelectorAll<HTMLElement>(".card")];
    const nearest = cards.reduce((a, b) => (away(b) < away(a) ? b : a));
    return Number(nearest.dataset.n);
  });
  const selector = `.card[data-n="${n}"]`;
  // How far the scroller moved from `start`, at any frame or scroll event, from here on.
  await frame.evaluate(
    ([top, y]) => {
      const el =
        document.body.dataset.scroller === "container"
          ? document.querySelector(".transcript")
          : document.scrollingElement;
      const w = window as unknown as { __moved: number; __watching: boolean };
      w.__moved = 0;
      w.__watching = true;
      const look = () => {
        w.__moved = Math.max(
          w.__moved,
          Math.abs((el?.scrollTop ?? top) - top),
          Math.abs(scrollY - y)
        );
      };
      const tick = () => {
        look();
        if (w.__watching) {
          requestAnimationFrame(tick);
        }
      };
      tick();
      addEventListener("scroll", look, { capture: true, passive: true });
    },
    [start.top, start.window] as const
  );

  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.click();
  await pageInComment(frame, true);
  const pane = await on.page.locator(FRAME).boundingBox();
  const box = await boxIn(frame, selector);
  if (!pane) {
    on.kit.check(`d (${scroller}): the pane's frame has a box`, false, "none");
    return;
  }
  const tap = { x: box.x + box.w * TAP.x, y: box.y + box.h * TAP.y };
  await on.page.mouse.move(pane.x + tap.x - 20, pane.y + tap.y - 20);
  await on.page.mouse.move(pane.x + tap.x, pane.y + tap.y, { steps: 4 });
  await settle(on.page, 200);
  const hovered = await outlineOf(frame);
  const held = Object.keys((await docOf(frame)).pins).length;
  await on.page.mouse.click(pane.x + tap.x, pane.y + tap.y);
  const pins = await until(
    "the card's pin in the doc",
    async () => (await docOf(frame)).pins,
    (all) => Object.keys(all).length > held,
    10_000
  ).catch(() => ({}) as Pins);
  const pin = Object.values(pins).sort(
    (a, b) => Number(b.number) - Number(a.number)
  )[0] as
    { anchor: { selector: string }; id: string; number: number } | undefined;
  const card = await focusedCard(on, pin?.number);
  const pinCard = on.page.locator(
    `[data-slot="pin-card"][data-pin-card="${pin?.number}"]`
  );
  await pinCard.getByRole("textbox").fill("This card, not the first.");
  await pinCard.getByRole("button", { name: "Reply" }).click();
  const kept = await until(
    "the reply on the card's pin",
    async () =>
      (
        (await docOf(frame)).pins[pin?.id ?? ""] as
          { thread?: unknown[] } | undefined
      )?.thread?.length ?? 0,
    (count) => count === 1,
    5000
  ).catch(() => 0);
  // A smooth scroll the card's opening set off would land within this.
  await settle(on.page, 900);
  const opened = await outlineOf(frame);
  const moved = await frame.evaluate(() => {
    const w = window as unknown as { __moved: number; __watching: boolean };
    w.__watching = false;
    return w.__moved;
  });
  const end = await offsetsIn(frame);
  const now = await boxIn(frame, selector);
  on.kit.check(
    `d (${scroller}): scrolled to the middle, the hover outline over card ${n} is its box, a tap pins it, its card opens focused and a reply is kept, and the ${scroller}'s offset never moves (0px) through it all; the outline is still the card's box`,
    near(hovered, box, 1) &&
      !!pin &&
      card.shown &&
      card.focused &&
      kept === 1 &&
      moved === 0 &&
      end.top === start.top &&
      end.window === start.window &&
      near(opened, now, 1),
    `card ${n} ${JSON.stringify(box)}; outline ${JSON.stringify(hovered)} → ${JSON.stringify(opened)}; pin ${JSON.stringify(pin?.anchor)}; card ${JSON.stringify(card)}; reply ${kept}; offset ${JSON.stringify(start)} → ${JSON.stringify(end)}, moved at most ${moved}px`
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
  if (!pin) {
    return;
  }

  /** Where the disc stands against where the tap was on card `n`, as the card stands in `at` now. */
  const standing = async (at: Frame) => {
    const disc = await discAt(at, pin.number);
    const r = await boxIn(at, selector);
    const want = { x: r.x + r.w * TAP.x, y: r.y + r.h * TAP.y };
    return {
      disc,
      want,
      on:
        !!disc &&
        Math.abs(disc.x - want.x) <= 2 &&
        Math.abs(disc.y - want.y) <= 2,
    };
  };
  const names = (at: Frame) =>
    at.evaluate(
      (s) => document.querySelector(s)?.getAttribute("data-n") ?? null,
      pin.anchor.selector
    );
  const tapped = await standing(frame);
  const named = await names(frame);
  await scrollPage(frame, start.top + 200);
  await settle(on.page, 300);
  const further = await standing(frame);
  on.kit.check(
    `d (${scroller}): the pin's anchor names card ${n}; its disc stands at the tapped point on it (±2px), and still does after 200px more scroll`,
    named === String(n) && tapped.on && further.on,
    `anchor ${pin.anchor.selector} → card ${named}; disc ${JSON.stringify(tapped)}; after 200px ${JSON.stringify(further)}`
  );

  if (scroller === "container") {
    // A pen stroke across the card's middle, where the pin stands.
    const groups = Object.keys((await docOf(frame)).ink).length;
    await strokeOver(on, frame, selector);
    await until(
      "the stroke on the card in the doc",
      async () => Object.keys((await docOf(frame)).ink).length,
      (count) => count > groups,
      10_000
    ).catch(() => 0);
    await settle(on.page, 300);
    const inkShown = await inkAt(frame);
    // The tapped point scrolled up under the container's top edge, still inside the window.
    const r = await boxIn(frame, selector);
    await scrollPage(frame, start.top + 200 + r.y + r.h * TAP.y - HEADER / 2);
    await settle(on.page, 300);
    const under = await discAt(frame, pin.number);
    const inkUnder = await inkAt(frame);
    await scrollPage(frame, start.top + 200);
    await settle(on.page, 300);
    const back = await standing(frame);
    const inkBack = await inkAt(frame);
    /** The stroke's box lies wholly inside its clip, which is the container's box: drawn. */
    const drawn = (seen: Awaited<ReturnType<typeof inkAt>>) =>
      !!seen?.clip &&
      Math.abs(seen.clip.y - HEADER) <= 1 &&
      seen.stroke.y >= seen.clip.y &&
      seen.stroke.y + seen.stroke.h <= seen.clip.y + seen.clip.h;
    /** The stroke's box lies wholly above its clip's top edge, the container's: not drawn. */
    const hidden = (seen: Awaited<ReturnType<typeof inkAt>>) =>
      !!seen?.clip &&
      Math.abs(seen.clip.y - HEADER) <= 1 &&
      seen.stroke.y + seen.stroke.h <= seen.clip.y;
    on.kit.check(
      "d (container): while the container has scrolled the tapped point under its top edge neither the disc nor the card's ink stroke is drawn (the stroke wholly outside its clip, the container's box); scrolled back, the disc stands on the card and the stroke is wholly inside its clip again",
      under === null &&
        back.on &&
        drawn(inkShown) &&
        hidden(inkUnder) &&
        drawn(inkBack),
      `under the edge disc ${JSON.stringify(under)}, ink ${JSON.stringify(inkUnder)}; before ink ${JSON.stringify(inkShown)}; back ${JSON.stringify(back)}, ink ${JSON.stringify(inkBack)}`
    );
  }

  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-label="Reload"]'
    )
    .click();
  const reloaded = await loaded(frame);
  await scrollPage(reloaded, start.top + 200);
  const after = await until(
    "the pin on the card after the reload",
    () => standing(reloaded),
    (seen) => seen.on,
    10_000
  ).catch(() => standing(reloaded));
  const anchored = ((await docOf(reloaded)).pins[pin.id] ?? {}) as {
    anchor?: { selector?: string };
  };
  const stillNames = anchored.anchor?.selector
    ? await reloaded.evaluate(
        (s) => document.querySelector(s)?.getAttribute("data-n") ?? null,
        anchored.anchor.selector
      )
    : null;
  on.kit.check(
    `d (${scroller}): after a reload scrolled back to the same offset, the pin's anchor still names card ${n} and its disc stands at the tapped point on it (±2px)`,
    after.on && stillNames === String(n),
    `anchor ${anchored.anchor?.selector} → card ${stillNames}; ${JSON.stringify(after)}`
  );

  // The list reorders: card n moves up to the third place, and the card
  // standing at its old place is another written by the same line.
  const order = Array.from({ length: CARDS }, (_, i) => i + 1).filter(
    (one) => one !== n
  );
  order.splice(2, 0, n);
  await on.call(UPDATE, { id: artifactId, html: cardsPage(scroller, order) });
  await until(
    "the reordered list in the page",
    () =>
      reloaded.evaluate(
        () =>
          document.querySelectorAll(".card")[2]?.getAttribute("data-n") ?? null
      ),
    (third) => third === String(n),
    15_000
  ).catch(() => null);
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-label="Reload"]'
    )
    .click();
  const reordered = await loaded(reloaded);
  await reordered.evaluate(
    (s) => document.querySelector(s)?.scrollIntoView({ block: "center" }),
    selector
  );
  const onMoved = await until(
    "the pin on the moved card after the reload",
    () => standing(reordered),
    (seen) => seen.on,
    10_000
  ).catch(() => standing(reordered));
  const keptAnchor = ((await docOf(reordered)).pins[pin.id] ?? {}) as {
    anchor?: { selector?: string };
  };
  const place = keptAnchor.anchor?.selector
    ? await reordered.evaluate((s) => {
        const el = document.querySelector(s);
        return el
          ? {
              n: el.getAttribute("data-n"),
              at: [...document.querySelectorAll(".card")].indexOf(el) + 1,
            }
          : null;
      }, keptAnchor.anchor.selector)
    : null;
  on.kit.check(
    `d (${scroller}): after the list moves card ${n} to the third place and the page reloads, the pin's anchor names card ${n} in its new place and its disc stands at the tapped point on it (±2px), not on the card now at its old place`,
    onMoved.on && place?.n === String(n) && place.at === 3,
    `anchor ${keptAnchor.anchor?.selector} → ${JSON.stringify(place)}; ${JSON.stringify(onMoved)}`
  );
};

/** The first ink group's stroke box and its clip's box, in the page's viewport; null when no group is drawn. */
const inkAt = (frame: Frame) =>
  frame.evaluate(() => {
    const g = document.querySelector<SVGGElement>(
      "svg[data-cawco-ink] g[data-ink-group]"
    );
    if (!g) {
      return null;
    }
    const id = g.getAttribute("clip-path")?.slice("url(#".length, -1);
    const rect = id ? document.getElementById(id)?.querySelector("rect") : null;
    const at = (name: string) => Number(rect?.getAttribute(name));
    const box = g.getBBox();
    return {
      clip: rect
        ? {
            x: at("x") - scrollX,
            y: at("y") - scrollY,
            w: at("width"),
            h: at("height"),
          }
        : null,
      stroke: {
        x: box.x - scrollX,
        y: box.y - scrollY,
        w: box.width,
        h: box.height,
      },
    };
  });

/**
 * (e) The owner's report (2026-10-14: "if i click away from a comment it
 * needs to dismiss the popover i don't have to keep clicking X"), on the
 * cards page the pane shows last: a press outside an open card closes it,
 * on the pane's chrome, elsewhere in the dashboard and on the page; Esc
 * does; a new pin with nothing said is taken back, one with words keeps
 * them, back in its field when it opens again and after the desk reloads;
 * a press on another pin's disc opens that pin.
 */
const dismissChecks = async (on: On) => {
  let frame = await pageFrame(on);
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  const cards = () => on.page.locator('[data-slot="pin-card"]').count();
  const pinsNow = async () => (await docOf(frame)).pins as Pins;
  const field = (number: number) =>
    on.page
      .locator(`[data-slot="pin-card"][data-pin-card="${number}"]`)
      .getByRole("textbox")
      .inputValue({ timeout: 3000 })
      .catch(() => null);
  const shut = () =>
    until("the card closed", cards, (count) => count === 0, 3000).catch(cards);
  /**
   * The card after card 8 (which holds a pin), card 8 in the middle of the
   * view: the new pin stands below the other, so its card, which hangs down
   * from its pin, leaves the other's disc clear to press.
   */
  const n = await frame.evaluate(() => {
    const eight = document.querySelector('.card[data-n="8"]');
    eight?.scrollIntoView({ block: "center" });
    const next = eight?.nextElementSibling as HTMLElement | null | undefined;
    const r = next?.getBoundingClientRect();
    return r && r.bottom <= innerHeight - 60 ? (next?.dataset.n ?? null) : null;
  });
  if (!n) {
    on.kit.check("e: a card of the page in view", false, "none");
    return;
  }
  /** A Comment-mode tap on card `n`: the new pin's number. */
  const tapNew = async () => {
    const held = Object.keys(await pinsNow()).length;
    const pane = await on.page.locator(FRAME).boundingBox();
    const box = await boxIn(frame, `.card[data-n="${n}"]`);
    const at = {
      x: (pane?.x ?? 0) + box.x + box.w * 0.7,
      y: (pane?.y ?? 0) + box.y + box.h * 0.5,
    };
    await on.page.mouse.move(at.x, at.y, { steps: 4 });
    await on.page.mouse.click(at.x, at.y);
    const now = await until(
      "the new pin in the doc",
      pinsNow,
      (all) => Object.keys(all).length > held,
      10_000
    ).catch(pinsNow);
    const number = Math.max(
      ...Object.values(now).map((pin) => Number(pin.number))
    );
    await focusedCard(on, number);
    return { held, number };
  };

  // A new pin, nothing said: a press on the pane's chrome (Interact, which also ends the mode).
  await comment.click();
  await pageInComment(frame, true);
  const empty = await tapNew();
  const openedEmpty = await cards();
  await interactTab(on).click();
  await pageInComment(frame, false);
  const closedEmpty = await shut();
  const takenBack = await until(
    "the empty pin taken back",
    async () => Object.keys(await pinsNow()).length,
    (count) => count === empty.held,
    5000
  ).catch(async () => Object.keys(await pinsNow()).length);
  on.kit.check(
    "e: a new pin's card, nothing written in it, closes on a press on the pane's chrome, and the pin is taken back",
    openedEmpty === 1 && closedEmpty === 0 && takenBack === empty.held,
    `cards ${openedEmpty} → ${closedEmpty}; pins ${empty.held} → ${takenBack}`
  );

  // A new pin with words: a press elsewhere in the dashboard (the composer).
  await comment.click();
  await pageInComment(frame, true);
  const kept = await tapNew();
  await writeIn(on, kept.number, "Draft kept.");
  await on.page.locator(COMPOSER).first().click();
  const closedKept = await shut();
  await interactTab(on).click();
  await pageInComment(frame, false);
  const stays =
    String(kept.number) in
    Object.fromEntries(
      Object.values(await pinsNow()).map((pin) => [String(pin.number), true])
    );
  const row = (await rowsOf(on)).locator(
    `[data-slot="pin-row"][data-pin-row="${kept.number}"]`
  );
  await row.click();
  const reopened = await field(kept.number);
  on.kit.check(
    "e: a new pin's card with words written in it closes on a press elsewhere in the dashboard; the pin stays, and its words are back in its field when it opens again",
    closedKept === 0 && stays && reopened === "Draft kept.",
    `cards after the press ${closedKept}; pin ${kept.number} kept ${stays}; field ${JSON.stringify(reopened)}`
  );

  // A press on the page, outside the card (the page's header, clear of the card).
  const pane = await on.page.locator(FRAME).boundingBox();
  const openBox = await on.page.locator('[data-slot="pin-card"]').boundingBox();
  const spots = [
    { x: (pane?.x ?? 0) + 200, y: (pane?.y ?? 0) + HEADER / 2 },
    { x: (pane?.x ?? 0) + 12, y: (pane?.y ?? 0) + HEADER / 2 },
  ];
  const spot =
    spots.find(
      (one) =>
        !(
          openBox &&
          one.x >= openBox.x &&
          one.x <= openBox.x + openBox.width &&
          one.y >= openBox.y &&
          one.y <= openBox.y + openBox.height
        )
    ) ?? spots[0];
  await on.page.mouse.move(spot.x, spot.y, { steps: 4 });
  await on.page.mouse.click(spot.x, spot.y);
  const closedByPage = await shut();
  await row.click();
  const again = await field(kept.number);
  await on.page.keyboard.press("Escape");
  const closedByEsc = await shut();
  on.kit.check(
    "e: an open card closes on a press on the page outside it, its words still there when it opens again; Esc closes it",
    closedByPage === 0 && again === "Draft kept." && closedByEsc === 0,
    `after the page's press ${closedByPage} cards; field ${JSON.stringify(again)}; after Esc ${closedByEsc} cards`
  );

  // A press on another pin's disc, with this card open, opens that pin.
  const other = Object.values(await pinsNow()).find(
    (pin) => Number(pin.number) !== kept.number
  ) as { number: number } | undefined;
  await frame.evaluate(() =>
    document
      .querySelector('.card[data-n="8"]')
      ?.scrollIntoView({ block: "center" })
  );
  await settle(on.page, 300);
  await row.click();
  // The card stands beside its pin once the page says where it is.
  await settle(on.page, 600);
  const disc = other ? await discAt(frame, other.number) : null;
  if (disc && pane) {
    await on.page.mouse.move(pane.x + disc.x, pane.y + disc.y, { steps: 4 });
    await on.page.mouse.click(pane.x + disc.x, pane.y + disc.y);
  }
  const switched = await until(
    "the other pin's card",
    async () => ({
      cards: await cards(),
      other: await on.page
        .locator(`[data-slot="pin-card"][data-pin-card="${other?.number}"]`)
        .count(),
    }),
    (seen) => seen.cards === 1 && seen.other === 1,
    5000
  ).catch(() => null);
  on.kit.check(
    "e: with a pin's card open, a press on another pin's disc on the page opens that pin's card in its place",
    !!other && !!disc && !!switched,
    `other ${JSON.stringify(other)}; disc ${JSON.stringify(disc)}; cards ${JSON.stringify(switched)}`
  );
  await on.page.keyboard.press("Escape");

  // The desk reloads: the words wait in the draft store.
  await on.page.reload({ waitUntil: "domcontentloaded" });
  frame = await pageFrame(on);
  const back = on.page.locator(
    `[data-slot="pin-list"] [data-slot="pin-row"][data-pin-row="${kept.number}"]`
  );
  await back.waitFor({ timeout: 30_000 }).catch(() => undefined);
  await back.click({ timeout: 5000 }).catch(() => undefined);
  const afterReload = await until(
    "the words back after the reload",
    () => field(kept.number),
    (words) => words === "Draft kept.",
    5000
  ).catch(() => field(kept.number));
  on.kit.check(
    "e: after the desk reloads, the pin's unsaid words are back in its field",
    afterReload === "Draft kept.",
    `field ${JSON.stringify(afterReload)}`
  );
  await on.page.keyboard.press("Escape");
};

/** Types `words` into pin `number`'s open card, unsaid: its draft. */
/**
 * (f) A thread longer than the card's cap: the agent answers pin 1 twenty
 * times; its card, opened from its row, keeps its head and its foot whole
 * and scrolls the thread alone.
 */
const roomChecks = async (on: On) => {
  const frame = await pageFrame(on);
  const pin = Object.values((await docOf(frame)).pins).find(
    (one) => Number(one.number) === 1
  ) as { id: string } | undefined;
  if (!pin) {
    on.kit.check("f: pin 1 on the page", false, "none");
    return;
  }
  const replies = 20;
  for (let n = 1; n <= replies; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the replies land in order, each a thread entry
    await on.fleet.api(
      `/api/instances/${on.session}/artifacts/comments/${pin.id}/reply`,
      {
        text: `Reply ${n} of ${replies}: made the card's spacing tighter, and this line runs long enough to wrap.`,
      }
    );
  }
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await until(
    "the seeded replies in pin 1's card",
    () => card.locator('[data-slot="entry"]').count(),
    (count) => count > replies,
    15_000
  ).catch(() => 0);
  await settle(on.page, 400);
  const read = await card.evaluate((el) => {
    const box = (part: Element | null) => {
      const r = part?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const room = el.querySelector("[data-pin-room]");
    return {
      card: box(el),
      cardScrolls: el.scrollHeight > el.clientHeight + 1,
      room: room
        ? {
            scroll: room.scrollHeight,
            height: room.clientHeight,
            atEnd: room.scrollTop + room.clientHeight >= room.scrollHeight - 1,
          }
        : null,
      entries: el.querySelectorAll('[data-slot="entry"]').length,
      field: box(el.querySelector("textarea")),
    };
  });
  // The head's Resolve pin and the foot's Reply by their accessible names: a
  // kit Button's text holds its pending words too.
  const boxOf = async (name: string) => {
    const r = await card
      .getByRole("button", { name, exact: true })
      .first()
      .boundingBox()
      .catch(() => null);
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  };
  const seen = {
    ...read,
    resolve: await boxOf("Resolve pin"),
    reply: await boxOf("Reply"),
  };
  const inside = (part: typeof seen.resolve) =>
    !!part &&
    !!seen.card &&
    part.x >= seen.card.x - 1 &&
    part.y >= seen.card.y - 1 &&
    part.x + part.w <= seen.card.x + seen.card.w + 1 &&
    part.y + part.h <= seen.card.y + seen.card.h + 1;
  on.kit.check(
    "f: with a thread longer than the card's cap, only the thread scrolls (its room overflows, the card does not), opened at its newest entry, and Resolve, Reply and the field stand inside the card's box",
    seen.entries > replies &&
      !!seen.room &&
      seen.room.scroll > seen.room.height &&
      seen.room.atEnd &&
      !seen.cardScrolls &&
      inside(seen.resolve) &&
      inside(seen.reply) &&
      inside(seen.field),
    JSON.stringify(seen)
  );

  // Squeezed: the card's room cut to 150px, less than its head and foot
  // alone (a phone's keyboard over a short well). The thread keeps its whole
  // height in the card's own scroll, never shrunk to nothing.
  await on.page.evaluate(() => {
    const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
    room?.style.setProperty("bottom", "auto");
    room?.style.setProperty("height", "150px");
  });
  await settle(on.page, 400);
  const squeezed = await card.evaluate((el) => {
    const room = el.querySelector("[data-pin-room]");
    return {
      whole: room?.matches(':is([data-slot="whole"], [data-whole])') ?? false,
      room: room
        ? { scroll: room.scrollHeight, height: room.clientHeight }
        : null,
      cardScrolls: el.scrollHeight > el.clientHeight + 1,
    };
  });
  await on.page.evaluate(() => {
    const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
    room?.style.removeProperty("bottom");
    room?.style.removeProperty("height");
  });
  await settle(on.page, 400);
  const unsqueezed = await card.evaluate(
    (el) =>
      el
        .querySelector("[data-pin-room]")
        ?.matches(':is([data-slot="whole"], [data-whole])') ?? true
  );
  on.kit.check(
    "f: squeezed below its head and foot, the card keeps the thread whole (none of it clipped) and scrolls itself; with its room back, the thread scrolls alone again",
    squeezed.whole &&
      !!squeezed.room &&
      squeezed.room.height >= squeezed.room.scroll - 1 &&
      squeezed.cardScrolls &&
      !unsqueezed,
    `${JSON.stringify(squeezed)}; after, whole ${unsqueezed}`
  );
  await on.page.keyboard.press("Escape");
};

const writeIn = (on: On, number: number, words: string) =>
  on.page
    .locator(`[data-slot="pin-card"][data-pin-card="${number}"]`)
    .getByRole("textbox")
    .fill(words);

/**
 * A card's head as it reads: the name, the file:line under it, the tooltip,
 * the words a reader sees in the whole card, and the pictures it draws.
 */
const headOf = (card: Locator) =>
  card
    .evaluate((el) => ({
      name:
        el
          .querySelector(
            '[data-slot="head"] :is([data-slot="name"], [data-transcript-skeleton-name])'
          )
          ?.textContent?.trim() ?? null,
      source:
        el
          .querySelector('[data-slot="head"] [data-slot="source"]')
          ?.textContent?.trim() ?? null,
      tip:
        el
          .querySelector('[data-slot="head"] [data-slot="anchor"]')
          ?.getAttribute("title") ?? null,
      shown: (el as HTMLElement).innerText,
      pictures: el.querySelectorAll(
        'img, :is([data-slot="thumb"], [data-thumb])'
      ).length,
    }))
    .catch(() => ({
      name: null,
      source: null,
      tip: null,
      shown: "",
      pictures: -1,
    }));

/**
 * 7. A pin on an element with no text, written in a component: its card's
 * head names it by the component, its selector only in the tooltip.
 */
const wordlessChecks = async (on: On) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "wordless",
    html: `<!doctype html><html><head><style>body { margin: 0; } main { padding: 24px; }</style></head>
<body><main><div data-insp-path="src/StatusBadge.svelte:4:3" style="width: 200px; height: 80px; background: #d8d4cc"></div></main></body></html>`,
  });
  const frame = (await until(
    "the wordless page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("[data-insp-path]")
        .count()
        .catch(() => 0)) === 1
        ? shown
        : null;
    },
    Boolean,
    60_000
  )) as Frame;
  await settle(on.page, 400);
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    )
    .click();
  await pageInComment(frame, true);
  const b = await screenBox(on, frame, "[data-insp-path]");
  await on.page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await settle(on.page, 300);
  const head = await headOf(card);
  on.kit.check(
    '7: a pin on an element with no text is named by its component (StatusBadge.svelte → "Status badge"), the file:line under it, its selector only in the tooltip, no picture',
    head.name === "Status badge" &&
      head.source === "src/StatusBadge.svelte:4" &&
      !!head.tip &&
      !head.shown.includes(head.tip) &&
      head.pictures === 0,
    JSON.stringify(head)
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
};

/**
 * 8. A markdown document opens in the lightbox with its words set as
 * markdown: the lightbox loads them (MessageBody) when a document first
 * needs them. Attached in the composer and opened from its chip; never sent.
 */
const documentChecks = async (on: On) => {
  await on.page
    .locator('input[data-slot="hidden-file"]')
    .first()
    .setInputFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Notes heading\n\nSome **bold** words."),
    });
  const chip = on.page.getByRole("button", { name: "Open notes.md" }).first();
  await chip.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await chip.click().catch(() => undefined);
  const doc = await until(
    "the document's markdown in the lightbox",
    () =>
      on.page.evaluate(() => {
        const body = document.querySelector('[data-slot="doc-body"]');
        const heading = body?.querySelector("h1, h2")?.textContent?.trim();
        const strong = body?.querySelector("strong")?.textContent?.trim();
        return heading && strong ? { heading, strong } : null;
      }),
    Boolean,
    10_000
  ).catch(() => null);
  on.kit.check(
    "8: a markdown document opens in the lightbox with its words set as markdown (its heading a heading, its bold strong)",
    doc?.heading === "Notes heading" && doc.strong === "bold",
    JSON.stringify(doc)
  );
  await on.page.keyboard.press("Escape");
  await on.page
    .getByRole("button", { name: "Remove notes.md" })
    .first()
    .click()
    .catch(() => undefined);
};

/** A main-thread task the person feels as a stall, ms (the long task's bound). */
const LONG_TASK_MS = 50;
/** A mark's crop margin (pins.ts `CROP_PAD`), px. */
const CROP_PAD = 24;

/** (g) Presses on test-map: on its intro paragraph, and in the page's padding beside it. */
const mapPressChecks = async (on: On) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "test-map",
    html: TEST_MAP,
  });
  const frame = await testMapFrame(on);
  await settle(on.page, 600);
  await frame.evaluate(() => scrollTo(0, 0));
  await paneMode(on, frame, "C");
  const pictures = watchPictures(on.page);
  const outer = await on.page.locator(FRAME).boundingBox();
  const intro = await frame.evaluate(() => {
    const p = document.querySelector("main > h1 + p");
    const r = p?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  if (!(outer && intro)) {
    on.kit.check("g: test-map has its intro paragraph", false, "none");
    return;
  }
  /** A press at the frame's `x`, `y`, traced to its picture; the pin it made, what it names, its picture. */
  const press = async (x: number, y: number) => {
    const before = new Set(Object.keys((await docOf(frame)).pins));
    const mark = (name: string) =>
      frame.evaluate((n) => performance.mark(n), name);
    const main = await traceMain(on.page, async () => {
      await mark("press");
      await on.page.mouse.click(outer.x + x, outer.y + y);
      await on.page.waitForTimeout(2000);
      await mark("press-after");
    });
    const { pins } = await docOf(frame);
    const id = Object.keys(pins).find((one) => !before.has(one));
    const pin = id
      ? (pins[id] as { anchor: { selector: string }; number: number })
      : undefined;
    const names: { intro: boolean; tag: string } = pin
      ? await frame.evaluate((selector) => {
          const el = document.querySelector(selector);
          return {
            intro: el === document.querySelector("main > h1 + p"),
            tag: el?.localName ?? "none",
          };
        }, pin.anchor.selector)
      : { intro: false, tag: "none" };
    const at = (name: string) =>
      main.marks.find((one) => one.name === name)?.at ?? 0;
    // Words in it, so its card's going keeps it, and its picture goes to the hub.
    if (pin) {
      await writeIn(on, pin.number, "This one.");
    }
    await on.page.keyboard.press("Escape");
    const posted = await until(
      "the pin's picture at the hub",
      () => pictures.posted.find((one) => one.mark === id),
      Boolean,
      5000
    ).catch(() => undefined);
    return {
      names,
      selector: pin?.anchor.selector,
      over: tasksOver(main.tasks, at("press"), at("press-after"), LONG_TASK_MS),
      longest: longestIn(main.tasks, at("press"), at("press-after")),
      size: posted ? pngSize(posted.png) : null,
    };
  };
  try {
    const onText = await press(intro.x + intro.w * 0.3, intro.y + intro.h / 2);
    const inPadding = await press(
      Math.max(2, intro.x - 6),
      intro.y + intro.h / 2
    );
    on.kit.check(
      "g: a press on test-map's intro paragraph pins that paragraph, and one in the page's padding beside it pins it too, never main",
      onText.names.intro && inPadding.names.intro,
      `on the text: ${onText.names.tag} ${onText.selector}; in the padding: ${inPadding.names.tag} ${inPadding.selector}`
    );
    on.kit.check(
      `g: each press finishes, its picture drawn, with no task of the page's past ${LONG_TASK_MS}ms`,
      onText.over.length === 0 && inPadding.over.length === 0,
      `longest ${onText.longest.toFixed(1)}ms and ${inPadding.longest.toFixed(1)}ms; over: ${[...onText.over, ...inPadding.over].join(", ") || "none"}`
    );
    const crop = {
      w: intro.w + 2 * CROP_PAD,
      h: intro.h + 2 * CROP_PAD,
    };
    const scale = onText.size ? onText.size.w / crop.w : 0;
    on.kit.check(
      "g: the pin's picture is the paragraph's box with its 24px margin (±2px at its scale, at most 2×), never the page",
      !!onText.size &&
        scale > 0 &&
        scale <= 2.01 &&
        Math.abs(onText.size.h / scale - crop.h) <= 2,
      `picture ${JSON.stringify(onText.size)}; crop ${JSON.stringify(crop)} at ${scale.toFixed(3)}×`
    );
  } finally {
    pictures.stop();
    await on.page.keyboard.press("Escape");
  }
};

/** (k)'s colours, as the page's stylesheet gives them: its ground, the edges, the label, the marker. */
const SVG_GROUND = [255, 255, 255];
const SVG_MARKER = [200, 40, 40];
/** How far (k)'s label ink in the picture may stand from the page's own, px. Our call: 0.5px measured on Chromium at 1× (DejaVu Sans 309.0 against 309.5, Figtree 275.0 against 275.5); the face Figtree fell to was 13.5px off, the default serif more. */
const LABEL_SLACK = 2;
/** A pixel as ink: any channel under it. Our call: the label's colour is 90, the ground 255. */
const INK_BELOW = 200;
/** (k2)'s face: Figtree as the dashboard ships it (its latin file), served beside the page. */
const FIGTREE = join(
  ROOT,
  "apps/dashboard/node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"
);
/** One more whole part than a picture draws (picture.ts `PARTS_MAX`, 60). */
const PAST_PARTS = 61;

/** How (k)'s page varies: the label's face, an `<svg>` with no area, parts ahead of the graph. */
interface SvgPage {
  /** The `<svg>` sized 0×0, its shapes standing out of it (`overflow: visible`), under a pinnable spot of its size. */
  arealess?: boolean;
  /** Figtree from the page's own `@font-face`, not a system face. */
  figtree?: boolean;
  /** Small boxes ahead of the graph inside the crop, each a whole part. */
  parts?: number;
}

/**
 * (k)'s page: a graph as the mockup draws it, an inline `<svg>` whose shapes
 * the stylesheet alone styles, standing in a world wider than any pin's crop,
 * so the `<svg>` is the picture's part and not the world round it. The
 * `<svg>`'s user space is its px (its viewBox its own size, or none).
 */
const svgPage = ({ arealess, figtree, parts = 0 }: SvgPage) => {
  const size = arealess
    ? 'width="0" height="0"'
    : 'width="480" height="260" viewBox="0 0 480 260"';
  const boxes = Array.from(
    { length: parts },
    (_, i) => `<i style="left: ${60 + i * 6}px"></i>`
  ).join("");
  return `<!doctype html><html><head><style>
  ${figtree ? '@font-face { font-family: "Figtree"; src: url("/figtree.woff2") format("woff2"); font-weight: 300 900; }' : ""}
  :root { --border-contrast: rgb(40, 110, 200); --ink-muted: rgb(90, 90, 90); --edge-head: rgb(${SVG_MARKER.join(", ")}); --font-sans: ${figtree ? '"Figtree"' : '"DejaVu Sans"'}; }
  body { margin: 0; background: rgb(${SVG_GROUND.join(", ")}); }
  .world { position: relative; width: 1400px; height: 900px; }
  .world svg { position: absolute; left: 40px; top: 40px; overflow: visible; }
  .world svg polyline { fill: none; stroke: var(--border-contrast); stroke-width: 1.5; }
  .world svg text { font: 500 11px var(--font-sans), system-ui, sans-serif; fill: var(--ink-muted); }
  .world i { position: absolute; top: 46px; width: 4px; height: 4px; background: rgb(220, 220, 220); }
  #spot { position: absolute; left: 40px; top: 40px; width: 480px; height: 260px; z-index: 1; }
</style></head><body><div class="world">${boxes}<svg id="graph" ${size}>
  <defs><marker id="head" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="20" markerHeight="20" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--edge-head)"/></marker></defs>
  <polyline id="wedge" points="40,40 240,170 440,40"/>
  <polyline id="edge" points="60,220 300,220" marker-end="url(#head)"/>
  <text id="label" x="20" y="250">Waiting to scanning, scanning to done, done to waiting</text>
</svg>${arealess ? '<div id="spot" data-insp-path="src/Graph.svelte:3:3"></div>' : ""}</div></body></html>`;
};
/** (k)'s points in the `<svg>`'s px: inside the wedge's hull, inside the marker's triangle (its scale 20/10 × the 1.5 stroke, 6px off the edge's stroke). */
const IN_HULL = { x: 240, y: 90 };
const IN_MARKER = { x: 280, y: 213 };

/** (k)'s graph's area, px: its `<svg>`'s size, or the spot over an arealess one. */
const GRAPH = { w: 480, h: 260 };

/** `png`'s colour at a point of its px, null outside it. */
const sample = (png: PNG, x: number, y: number) => {
  const px = Math.round(x);
  const py = Math.round(y);
  const i = (py * png.width + px) * 4;
  return px >= 0 && py >= 0 && px < png.width && py < png.height
    ? [png.data[i], png.data[i + 1], png.data[i + 2]]
    : null;
};

/** The columns of `png` in rows `top`..`bottom` and from column `from` on holding ink: the first and the last, -1 for none. */
const inkSpan = (png: PNG, top: number, bottom: number, from: number) => {
  let first = -1;
  let last = -1;
  for (let x = Math.max(0, from); x < png.width; x += 1) {
    for (
      let y = Math.max(0, top);
      y <= Math.min(png.height - 1, bottom);
      y += 1
    ) {
      const at = (y * png.width + x) * 4;
      if (
        Math.min(png.data[at], png.data[at + 1], png.data[at + 2]) < INK_BELOW
      ) {
        if (first < 0) {
          first = x;
        }
        last = x;
        break;
      }
    }
  }
  return { first, last };
};

/** A box in the page's px, its window's scroll added. */
interface PageBox {
  h: number;
  w: number;
  x: number;
  y: number;
}
const pageBoxIn = (frame: Frame, selector: string) =>
  frame.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r
      ? { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }
      : null;
  }, selector);

/** A (k) page's picture as read: a pixel at a point of the `<svg>`'s px, the label's ink width beside the page's own, the parts that failed. */
interface SvgPicture {
  at: (x: number, y: number) => number[] | null;
  failed: string[];
  label: { drawn: number; own: number };
  /** The page's own rendering at a point of the `<svg>`'s px. */
  page: (x: number, y: number) => number[] | null;
  where: string;
}

/** The `cawco:error`s the desk hears from the page's overlay from now on: a part not drawn says so there. */
const watchPageErrors = (desk: Page) =>
  desk.evaluate(() => {
    const errors: string[] = [];
    (window as unknown as { probeErrors: string[] }).probeErrors = errors;
    addEventListener("message", (event) => {
      const data = event.data as { message?: string; type?: string } | null;
      if (data?.type === "cawco:error") {
        errors.push(data.message ?? "");
      }
    });
  });

/**
 * (k)'s press and read on `frame`'s graph: a press at the wedge's hull (on
 * the spot over an arealess `<svg>`), the pin's words, its picture as the
 * hub took it, read where the crop (pins.ts `padded`, picture.ts `onPage`)
 * puts the `<svg>`'s points. Null, its failure checked, when any step fails.
 */
const readSvgPicture = async (
  on: On,
  frame: Frame,
  leg: string
): Promise<SvgPicture | null> => {
  await settle(on.page, 400);
  await frame.evaluate(() => scrollTo(0, 0));
  // The page's own rendering of the label, before any of the overlay's layers stand over it.
  const ownLabel = PNG.sync.read(await frame.locator("#label").screenshot());
  const own = inkSpan(ownLabel, 0, ownLabel.height - 1, 0);
  const svg = await pageBoxIn(frame, "#graph");
  const label = await pageBoxIn(frame, "#label");
  if (!(svg && label)) {
    on.kit.check(`${leg}: the page has its graph`, false, "none");
    return null;
  }
  const outer = await on.page.locator(FRAME).boundingBox();
  // The page's own rendering of the graph's area, as the desk shows it.
  const ownGraph = PNG.sync.read(
    await on.page.screenshot({
      clip: {
        x: (outer?.x ?? 0) + svg.x,
        y: (outer?.y ?? 0) + svg.y,
        width: GRAPH.w,
        height: GRAPH.h,
      },
    })
  );
  const pageAt = (x: number, y: number) =>
    sample(
      ownGraph,
      x * (ownGraph.width / GRAPH.w),
      y * (ownGraph.width / GRAPH.w)
    );
  await paneMode(on, frame, "C");
  await watchPageErrors(on.page);
  const pictures = watchPictures(on.page);
  try {
    const before = new Set(Object.keys((await docOf(frame)).pins));
    await on.page.mouse.click(
      (outer?.x ?? 0) + svg.x + IN_HULL.x,
      (outer?.y ?? 0) + svg.y + IN_HULL.y
    );
    const pin = await until(
      `the pin on ${leg}'s graph`,
      async () => {
        const { pins } = await docOf(frame);
        const id = Object.keys(pins).find((one) => !before.has(one));
        return id
          ? {
              id,
              ...(pins[id] as { anchor: { selector: string }; number: number }),
            }
          : null;
      },
      Boolean,
      5000
    ).catch(() => null);
    if (!pin) {
      on.kit.check(`${leg}: a press on the graph makes a pin`, false, "none");
      return null;
    }
    await writeIn(on, pin.number, "These edges.");
    await on.page.keyboard.press("Escape");
    const posted = await until(
      `${leg}'s pin picture at the hub`,
      () => pictures.posted.find((one) => one.mark === pin.id),
      Boolean,
      10_000
    ).catch(() => undefined);
    const anchor: PageBox | null = await pageBoxIn(frame, pin.anchor.selector);
    if (!(posted && anchor)) {
      on.kit.check(
        `${leg}: the graph pin's picture reaches the hub`,
        false,
        `picture ${Boolean(posted)}; anchor ${pin.anchor.selector} ${JSON.stringify(anchor)}`
      );
      return null;
    }
    const png = PNG.sync.read(Buffer.from(posted.png, "base64"));
    const crop = {
      x: Math.max(0, anchor.x - CROP_PAD),
      y: Math.max(0, anchor.y - CROP_PAD),
    };
    const scale = png.width / (anchor.x + anchor.w + CROP_PAD - crop.x);
    const at = (x: number, y: number) =>
      sample(png, (svg.x + x - crop.x) * scale, (svg.y + y - crop.y) * scale);
    // The label's band in the picture, its ink read from its own left edge on.
    const drawn = inkSpan(
      png,
      Math.floor((label.y - crop.y) * scale) - 2,
      Math.ceil((label.y + label.h - crop.y) * scale) + 2,
      Math.floor((label.x - crop.x) * scale) - 2
    );
    const failed = await on.page.evaluate(
      () => (window as unknown as { probeErrors: string[] }).probeErrors
    );
    return {
      at,
      failed,
      page: pageAt,
      label: {
        drawn: drawn.first < 0 ? 0 : (drawn.last - drawn.first + 1) / scale,
        own:
          own.first < 0
            ? 0
            : (own.last - own.first + 1) / (ownLabel.width / label.w),
      },
      where: `anchor ${pin.anchor.selector}; picture ${png.width}×${png.height} at ${scale.toFixed(3)}×; parts not drawn: ${failed.join(" | ") || "none"}`,
    };
  } finally {
    pictures.stop();
    await on.page.keyboard.press("Escape");
  }
};

const nearColour = (rgb: number[] | null, want: number[], slack: number) =>
  !!rgb && rgb.every((c, i) => Math.abs(c - want[i]) <= slack);

/** (k)'s check that a picture's label is set as the page sets it. */
const labelCheck = (on: On, leg: string, face: string, read: SvgPicture) =>
  on.kit.check(
    `${leg}: the CSS-styled <text>'s ink in the picture is as wide as the page's own rendering of it (within ${LABEL_SLACK}px): ${face}`,
    read.label.own > 0 &&
      read.label.drawn > 0 &&
      Math.abs(read.label.drawn - read.label.own) <= LABEL_SLACK,
    `picture ${read.label.drawn.toFixed(1)}px, page ${read.label.own.toFixed(1)}px; ${read.where}`
  );

/** (k)'s page as a page artifact, shown in the pane. */
const showSvgPage = async (on: On, name: string, shape: SvgPage) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name,
    html: svgPage(shape),
  });
  return await graphFrame(on, name);
};

/** The pane's page once it shows `name`'s graph. */
const graphFrame = async (on: On, name: string) =>
  (await until(
    `the ${name} page in the pane`,
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("#graph")
        .count()
        .catch(() => 0)) === 1
        ? shown
        : null;
    },
    Boolean,
    60_000
  )) as Frame;

/** (k) A pin on an inline SVG styled by the page's stylesheet: its picture, read by pixel, in each of the ways a graph stands. */
const svgPictureChecks = async (on: On) => {
  const plain = await readSvgPicture(
    on,
    await showSvgPage(on, "svg-graph", {}),
    "k"
  );
  if (plain) {
    on.kit.check(
      "k: in a pin's picture over an inline SVG, a point inside the CSS-styled polyline's hull is the page's ground, never black (fill: none kept)",
      nearColour(plain.at(IN_HULL.x, IN_HULL.y), SVG_GROUND, 8),
      `hull ${JSON.stringify(plain.at(IN_HULL.x, IN_HULL.y))}; ${plain.where}`
    );
    on.kit.check(
      "k: the marker the stylesheet colours through a var() is drawn in its colour",
      nearColour(plain.at(IN_MARKER.x, IN_MARKER.y), SVG_MARKER, 24),
      `marker ${JSON.stringify(plain.at(IN_MARKER.x, IN_MARKER.y))}, wanted ${JSON.stringify(SVG_MARKER)}; ${plain.where}`
    );
    labelCheck(on, "k", "its 11px sans face, never the default serif", plain);
  }
  await figtreeChecks(on);
  const arealess = await readSvgPicture(
    on,
    await showSvgPage(on, "svg-arealess", { arealess: true }),
    "k3"
  );
  if (arealess) {
    const shown = arealess.page(IN_MARKER.x, IN_MARKER.y);
    const drawn = arealess.at(IN_MARKER.x, IN_MARKER.y);
    on.kit.check(
      "k3: a 0×0 <svg> (overflow: visible), which the page draws nothing of, is drawn in the picture as the page draws it: its marker's point and its label as the page's, no part failed (no lone shape handed to the library)",
      !!shown &&
        nearColour(drawn, shown, 8) &&
        arealess.label.drawn === arealess.label.own &&
        arealess.failed.length === 0,
      `marker's point: picture ${JSON.stringify(drawn)}, page ${JSON.stringify(shown)}; label: picture ${arealess.label.drawn.toFixed(1)}px, page ${arealess.label.own.toFixed(1)}px; ${arealess.where}`
    );
  }
  const crowded = await readSvgPicture(
    on,
    await showSvgPage(on, "svg-crowded", { parts: PAST_PARTS }),
    "k4"
  );
  if (crowded) {
    on.kit.check(
      `k4: with ${PAST_PARTS} whole parts ahead of the graph in the crop (past PARTS_MAX), the picture is drawn with no part failed and nothing of the graph in black: no shape of it is a part`,
      crowded.failed.length === 0 &&
        nearColour(crowded.at(IN_HULL.x, IN_HULL.y), SVG_GROUND, 8),
      `hull ${JSON.stringify(crowded.at(IN_HULL.x, IN_HULL.y))}; ${crowded.where}`
    );
  }
};

/** (k2) The graph's label in Figtree, the page's own `@font-face`, served beside it: a preview of a port, as a dev server's page is. */
const figtreeChecks = async (on: On) => {
  const face = await Bun.file(FIGTREE).arrayBuffer();
  const app = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/figtree.woff2"
        ? new Response(face, { headers: { "content-type": "font/woff2" } })
        : new Response(svgPage({ figtree: true }), {
            headers: { "content-type": "text/html" },
          }),
  });
  try {
    await on.call(CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "svg-figtree",
      port: app.port,
    });
    const frame = await graphFrame(on, "svg-figtree");
    const loaded = await until(
      "Figtree loaded on the page",
      () =>
        frame.evaluate(async () => {
          await document.fonts.load('500 11px "Figtree"');
          return document.fonts.check('500 11px "Figtree"');
        }),
      Boolean,
      10_000
    ).catch(() => false);
    const read = await readSvgPicture(on, frame, "k2");
    if (read) {
      on.kit.check(
        "k2: the page draws its label in Figtree, from its own @font-face",
        loaded,
        `document.fonts.check('500 11px "Figtree"') ${loaded}`
      );
      labelCheck(
        on,
        "k2",
        "the page's web font (Figtree, its @font-face embedded), never the face it would fall to",
        read
      );
    }
  } finally {
    app.stop(true);
  }
};

/** (i)'s decision cards: each one's choice and its question. */
const DECISIONS = [
  ["auth", "How do people sign in?"],
  ["db", "Which database holds it?"],
  ["deploy", "How does it ship?"],
] as const;
/** The plain card and the decision card (i)'s revision puts in ahead of the pinned ones. */
const INSERTED = "Inserted ahead";
const INSERTED_DECISION = ["region", "Where does it run?"] as const;
const REWORDED = "Delta, once Charlie";
/** Each plain card's picture: the same image in every card, told apart by its alt alone. */
const PICTURE = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='#ccc'/></svg>")}`;
const pictureOf = (words: string) => `Picture of ${words}`;

/**
 * (i)'s page: plain cards a list repeats, no id, no source, each told apart
 * by its words alone, and decision cards, each by its choice. `revised`: a
 * card put in ahead of Bravo, Charlie reworded, a decision put in ahead of
 * the second.
 */
const repeatedPage = (revised: boolean) => {
  const plain = revised
    ? ["Alpha", INSERTED, "Bravo", REWORDED]
    : ["Alpha", "Bravo", "Charlie"];
  const decisions = revised
    ? [DECISIONS[0], INSERTED_DECISION, ...DECISIONS.slice(1)]
    : DECISIONS;
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  .card { margin: 0 24px 16px; padding: 12px 16px; border: 1px solid #ccc; border-radius: 8px; }
  h2 { margin: 0; font-size: 18px; width: 60%; }
</style></head>
<body><main>
<div class="plain">${plain.map((words) => `<section class="card"><h2>${words}</h2><img alt="${pictureOf(words)}" width="48" height="48" src="${PICTURE}"><p>One of the cards the list repeats.</p></section>`).join("")}</div>
<div class="decisions">${decisions.map(([choice, question]) => `<section class="card" data-cawco-choice="${choice}"><h2>${question}</h2><button data-option="a">A</button> <button data-option="b">B</button></section>`).join("")}</div>
</main></body></html>`;
};

/**
 * (i) The probe of 2026-10-18: a merge that put a decision ahead of the
 * pinned one moved its pin onto the new card, and wrote that card's anchor
 * back. On a page of repeated cards, three pins (a plain card, a plain card
 * whose words the revision changes, a decision card), then a revision that
 * puts a card in ahead of each: each pin stands on its own card, or waits
 * in the moved tray, and none stands on a card the revision put in.
 */
const insertChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "repeated-cards",
    html: repeatedPage(false),
  });
  const artifactId = made.match(ANSWERED_ID)?.[1];
  if (!artifactId) {
    on.kit.check("i: the page is made", false, made.slice(0, 300));
    return;
  }
  const frame = (await until(
    "the repeated cards in the pane",
    async () => {
      const one = await pageFrame(on);
      const ready = await one
        .evaluate(
          () =>
            document.querySelectorAll(".plain .card").length === 3 &&
            "cawcoArtifact" in window
        )
        .catch(() => false);
      return ready ? one : null;
    },
    Boolean,
    60_000
  )) as Frame;
  await settle(on.page, 400);
  const pane = await on.page.locator(FRAME).boundingBox();
  if (!pane) {
    on.kit.check("i: the pane's frame has a box", false, "none");
    return;
  }
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    )
    .click();
  await pageInComment(frame, true);
  /** A tap on the heading reading `words` (or the picture by that alt), and a reply that keeps its pin; the pin's id. */
  const pinOn = async (words: string) => {
    const box = await frame.evaluate((text) => {
      const mark = [...document.querySelectorAll<HTMLElement>("h2, img")].find(
        (one) =>
          (one instanceof HTMLImageElement ? one.alt : one.textContent) === text
      );
      const r = mark?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, words);
    if (!box) {
      return null;
    }
    const held = new Set(Object.keys((await docOf(frame)).pins));
    await on.page.mouse.click(pane.x + box.x, pane.y + box.y);
    const pins = await until(
      `the pin on "${words}"`,
      async () => (await docOf(frame)).pins,
      (all) => Object.keys(all).some((one) => !held.has(one)),
      10_000
    ).catch(() => ({}) as Pins);
    const id = Object.keys(pins).find((one) => !held.has(one));
    const number = id ? Number(pins[id]?.number) : undefined;
    const card = on.page.locator(
      `[data-slot="pin-card"][data-pin-card="${number}"]`
    );
    await card.getByRole("textbox").fill(`This is ${words}.`);
    await card.getByRole("button", { name: "Reply" }).click();
    await until(
      `the reply on "${words}"`,
      async () =>
        (
          (await docOf(frame)).pins[id ?? ""] as
            { thread?: unknown[] } | undefined
        )?.thread?.length ?? 0,
      (count) => count === 1,
      5000
    ).catch(() => 0);
    return id ?? null;
  };
  const bravo = await pinOn("Bravo");
  const charlie = await pinOn("Charlie");
  const db = await pinOn(DECISIONS[1][1]);
  const picture = await pinOn(pictureOf("Bravo"));
  await on.page.keyboard.press("Escape");
  await interactTab(on).click();
  await pageInComment(frame, false);
  const anchorsBefore = Object.fromEntries(
    Object.entries((await docOf(frame)).pins).map(([id, pin]) => [
      id,
      (pin.anchor as { selector?: string }).selector,
    ])
  );

  await on.call(UPDATE, { id: artifactId, html: repeatedPage(true) });
  await until(
    "the revision in the page",
    () =>
      frame.evaluate(
        (words) =>
          [...document.querySelectorAll("h2")].some(
            (one) => one.textContent === words
          ),
        INSERTED
      ),
    Boolean,
    15_000
  ).catch(() => false);
  await settle(on.page, 1000);
  /** Where each pin stands now: the heading its disc is on, or moved, as the page and its doc have it. */
  const standsOn = await frame.evaluate(
    (ids) => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (n: string) => {
                get: (id: string) => { movedAt?: string } | undefined;
              };
            };
          };
        }
      ).cawcoArtifact;
      const pins = doc.getMap("pins");
      const marks = [...document.querySelectorAll<HTMLElement>("h2, img")];
      return ids.map((id) => {
        // The disc's centre in the page: its group's translate.
        const at = document
          .querySelector<SVGGElement>(
            `svg[data-cawco-pins] [data-pin-id="${id}"]`
          )
          ?.transform.baseVal.consolidate()?.matrix;
        const x = at ? at.e - scrollX : Number.NaN;
        const y = at ? at.f - scrollY : Number.NaN;
        const mark = marks.find((one) => {
          const r = one.getBoundingClientRect();
          return (
            x >= r.left - 2 &&
            x <= r.right + 2 &&
            y >= r.top - 2 &&
            y <= r.bottom + 2
          );
        });
        return {
          id,
          on:
            (mark instanceof HTMLImageElement ? mark.alt : mark?.textContent) ??
            null,
          moved: !!pins.get(id)?.movedAt,
        };
      });
    },
    [bravo ?? "", charlie ?? "", db ?? "", picture ?? ""]
  );
  const [onBravo, onCharlie, onDb, onPicture] = standsOn;
  const putIn = new Set([INSERTED, pictureOf(INSERTED), INSERTED_DECISION[1]]);
  const said = JSON.stringify({ before: anchorsBefore, after: standsOn });
  on.kit.check(
    "i: a card put in ahead of a pinned plain card (no id, no source): the pin stays on its card, never on the one put in",
    !!bravo && onBravo?.on === "Bravo" && !onBravo.moved,
    said
  );
  on.kit.check(
    "i: a pinned plain card reworded as a card is put in ahead of it: its pin waits in the moved tray, never on the card now at its place",
    !!charlie && !!onCharlie?.moved && onCharlie.on === null,
    said
  );
  on.kit.check(
    "i: a decision put in ahead of a pinned decision card: the pin stays on its card by its choice",
    !!db && onDb?.on === DECISIONS[1][1] && !onDb.moved,
    said
  );
  on.kit.check(
    "i: a card put in ahead of a pinned picture with no words (the same image in every card, its alt its own): the pin stays on that picture",
    !!picture && onPicture?.on === pictureOf("Bravo") && !onPicture.moved,
    said
  );
  on.kit.check(
    "i: no pin stands on a card the revision put in",
    standsOn.every((one) => !(one.on && putIn.has(one.on))),
    said
  );
};

/**
 * (j)'s page: words at its very top-right, under where the Comments panel
 * hangs and above any scroll; words far down its right side; words on its
 * left. Tall enough to scroll.
 */
const LISTED_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px/1.5 system-ui; height: 2400px; position: relative; }
  p { position: absolute; width: 150px; margin: 0; }
  #corner { top: 16px; right: 16px; }
  #low { top: 1200px; right: 16px; }
  #left { top: 600px; left: 16px; }
</style></head>
<body><p id="corner">Words in the top-right corner.</p><p id="low">Words far down the right side.</p><p id="left">Words on the left.</p></body></html>`;

interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}
const meets = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The Comments panel's, the open card's and pin `id`'s disc's boxes in the dashboard's viewport; null for one not on screen. The disc is read in the page's own frame (another origin), its frame's offset added. */
const listedBoxes = async (screen: Page, frame: Frame, id: string) => {
  const chrome = await screen.evaluate(() => {
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0
        ? { x: r.x, y: r.y, w: r.width, h: r.height }
        : null;
    };
    const holder = [
      ...document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Preview"]'
      ),
    ].find((one) => one.checkVisibility());
    const at = holder?.getBoundingClientRect();
    return {
      list: box(document.querySelector("[data-pin-list-pop]")),
      card: box(document.querySelector('[data-slot="pin-card"]')),
      offset:
        at && holder
          ? { x: at.x + holder.clientLeft, y: at.y + holder.clientTop }
          : null,
    };
  });
  const disc = await frame
    .evaluate((pin) => {
      const r = document
        .querySelector(`svg[data-cawco-pins] [data-pin-id="${pin}"] circle`)
        ?.getBoundingClientRect();
      return r && r.width > 0
        ? { x: r.x, y: r.y, w: r.width, h: r.height }
        : null;
    }, id)
    .catch(() => null);
  return {
    list: chrome.list,
    card: chrome.card,
    disc:
      disc && chrome.offset
        ? { ...disc, x: disc.x + chrome.offset.x, y: disc.y + chrome.offset.y }
        : null,
  };
};

/**
 * (j) The owner's report (2026-10-18: "if i open comments and i click one
 * of the comments it opens behind the list ofcomments, not very
 * navigateable"), as Figma's comments list keeps a chosen comment's pin and
 * card both on the part of the page the list leaves free: with the
 * Comments panel open, a pin opened from its row, then by J and by K,
 * stands with its card beside the panel, neither under it. A pin the page
 * has scrolled under the panel is scrolled out; one at the page's very top
 * (no scroll can) has the panel make room for it. On the desk, and on a
 * phone, where the card stands at the well's foot and the pin clear of it
 * too.
 */
const listChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "listed",
    html: LISTED_PAGE,
  });
  const artifactId = made.match(ANSWERED_ID)?.[1];
  if (!artifactId) {
    on.kit.check("j: the page is made", false, made.slice(0, 300));
    return;
  }
  const frame = (await until(
    "the listed page in the pane",
    async () => {
      const one = await pageFrame(on);
      const ready = await one
        .evaluate(
          () => !!document.querySelector("#corner") && "cawcoArtifact" in window
        )
        .catch(() => false);
      return ready ? one : null;
    },
    Boolean,
    60_000
  )) as Frame;
  await settle(on.page, 400);
  const pane = await on.page.locator(FRAME).boundingBox();
  if (!pane) {
    on.kit.check("j: the pane's frame has a box", false, "none");
    return;
  }
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    )
    .click();
  await pageInComment(frame, true);
  /** A tap on `selector`, scrolled into view, and a reply that keeps its pin: its id and number. */
  const pinOn = async (selector: string) => {
    const box = await frame.evaluate((s) => {
      const el = document.querySelector(s);
      el?.scrollIntoView({ block: "center" });
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, selector);
    if (!box) {
      return null;
    }
    const held = new Set(Object.keys((await docOf(frame)).pins));
    await on.page.mouse.click(pane.x + box.x, pane.y + box.y);
    const pins = await until(
      `the pin on ${selector}`,
      async () => (await docOf(frame)).pins,
      (all) => Object.keys(all).some((one) => !held.has(one)),
      10_000
    ).catch(() => ({}) as Pins);
    const id = Object.keys(pins).find((one) => !held.has(one));
    const number = id ? Number(pins[id]?.number) : Number.NaN;
    await writeIn(on, number, `About ${selector}.`);
    return id ? { id, number } : null;
  };
  const low = await pinOn("#low");
  const corner = await pinOn("#corner");
  const left = await pinOn("#left");
  await on.page.keyboard.press("Escape");
  await interactTab(on).click();
  await pageInComment(frame, false);
  if (!(low && corner && left)) {
    on.kit.check(
      "j: three pins made",
      false,
      JSON.stringify({ low, corner, left })
    );
    return;
  }
  await listLeg(on.kit, on.page, frame, "desk", { low, corner, left });

  // The same on a phone, where the pane is the sheet over the conversation.
  const phone = await on.kit.page("phone");
  await open(
    phone,
    `${await on.fleet.dashboard()}/session/${on.session}`,
    COMPOSER
  );
  /** The phone's page frame, once it shows the listed page. */
  const listedOn = async (): Promise<Frame | null> => {
    try {
      const handle = await phone
        .locator('iframe[title="Preview"]')
        .first()
        .elementHandle({ timeout: 1000 });
      const inner = await handle?.contentFrame();
      return (await inner?.evaluate(() => !!document.querySelector("#corner")))
        ? (inner ?? null)
        : null;
    } catch {
      return null;
    }
  };
  const shown = await until(
    "the listed page on the phone",
    listedOn,
    Boolean,
    60_000
  ).catch(() => null);
  if (!shown) {
    on.kit.check(
      "j (phone): the listed page in the phone's pane",
      false,
      "not shown"
    );
    return;
  }
  await settle(phone, 600);
  await listLeg(on.kit, phone, shown, "phone", { low, corner, left });
  await phone.close();
};

/** (j) on one view: the panel open, pins opened from its rows, then J and K; each card and disc beside the panel. */
const listLeg = async (
  kit: Kit,
  screen: Page,
  frame: Frame,
  view: "desk" | "phone",
  pins: Record<"low" | "corner" | "left", { id: string; number: number }>
) => {
  // #low scrolled to where the panel will hang.
  await frame.evaluate(() => {
    const low = document.querySelector("#low");
    if (low) {
      scrollTo(0, low.getBoundingClientRect().top + scrollY - 40);
    }
  });
  await settle(screen, 300);
  const button = screen.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[data-slot="comments"]'
  );
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const list = screen.locator('[data-pin-list-pop] [data-slot="pin-list"]');
  await list.waitFor({ timeout: 5000 }).catch(() => undefined);
  const row = (number: number) =>
    list.locator(`[data-slot="pin-row"][data-pin-row="${number}"]`);
  // Beside, the card and the disc stand clear of the panel; stacked (a
  // phone, a desk well under the beside threshold), the card is the foot
  // sheet, the panel stands aside, and the disc stands clear of the card.
  const clear = (seen: Awaited<ReturnType<typeof listedBoxes>>) =>
    !!seen.card &&
    !!seen.disc &&
    (seen.list
      ? view === "desk" &&
        !meets(seen.card, seen.list) &&
        !meets(seen.disc, seen.list)
      : !meets(seen.disc, seen.card));
  const opened = async (pin: { id: string; number: number }) => {
    await settle(screen, 1200);
    return listedBoxes(screen, frame, pin.id);
  };
  const cardClose = screen
    .locator('[data-slot="pin-card"]')
    .getByRole("button", { name: "Close", exact: true });
  /** Stacked, the panel stands aside under the open card: its Close brings the panel back for the next row. */
  const shutCard = async () => {
    if (!(await list.isVisible())) {
      await cardClose.click();
      await settle(screen, 400);
    }
  };
  await row(pins.low.number).click();
  const fromRow = await opened(pins.low);
  kit.check(
    `j (${view}): a pin the page scrolled under the open Comments panel, opened from its row: its card and its disc stand clear of the panel`,
    clear(fromRow),
    JSON.stringify(fromRow)
  );
  await shutCard();
  await row(pins.corner.number).click();
  const atTop = await opened(pins.corner);
  kit.check(
    `j (${view}): a pin at the page's very top-right, under the panel, opened from its row: its card and its disc stand clear of the panel`,
    clear(atTop),
    JSON.stringify(atTop)
  );
  if (view === "phone") {
    // A phone has no J and K.
    await shutCard();
    if ((await button.getAttribute("aria-expanded")) === "true") {
      await button.click();
    }
    return;
  }
  // J and K, its card open: the next pin, then back. Beside, from the
  // panel's rows; stacked, the panel aside, from the card.
  const stepped: {
    key: string;
    seen: Awaited<ReturnType<typeof listedBoxes>>;
  }[] = [];
  for (const [key, pin] of [
    ["j", pins.left],
    ["k", pins.corner],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time, each read where it lands
    if (await list.isVisible()) {
      await row(
        pin === pins.left ? pins.corner.number : pins.left.number
      ).focus();
    } else {
      await cardClose.focus();
    }
    await screen.keyboard.press(key);
    stepped.push({ key, seen: await opened(pin) });
  }
  kit.check(
    `j (${view}): J and K with the panel open: each pin's card and disc stand clear of the panel`,
    stepped.length === 2 && stepped.every((one) => clear(one.seen)),
    JSON.stringify(stepped)
  );
  await screen.keyboard.press("Escape");
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
  }
};

const PANEL_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; padding: 24px; font: 16px/1.5 system-ui; }</style></head>
<body><h1 id="a">A heading the comments stand on</h1><p id="b">A paragraph under it.</p></body></html>`;
/** A comment of 48 words: the row cuts it at four lines. */
const LONG_COMMENT =
  "This heading reads too heavy for the page it opens, and the paragraph under it starts before the eye has settled, so the whole block feels crowded; give the heading more room above, set the paragraph a step lighter, and check that the spacing still holds at a phone's width.";
/** A comment of six words: one line at the panel's floor. */
const SHORT_COMMENT = "Make this heading a bit bigger";
const PANE_SEL = ':is([data-slot="preview-pane"], [data-side-card="preview"])';

/** A colour drawn fully clear, as getComputedStyle writes it: `rgba(…, 0)` or `oklch(… / 0)`. */
const CLEAR_COLOUR = /(,|\/)\s*0\)$/;

/** Until the panel's own entrance has ended (it scales the panel): read at rest. Its infinite pulses are not waited on. */
const still = (screen: Page) =>
  screen
    .waitForFunction(
      () =>
        !document
          .querySelector("[data-pin-list-pop]")
          ?.getAnimations({ subtree: true })
          .some(
            (a) =>
              a.playState === "running" &&
              a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY &&
              (a.effect?.getComputedTiming().progress ?? 1) < 1
          ),
      undefined,
      { timeout: 2000 }
    )
    // A panel still moving after 2 s is read as it stands; the spill read says so.
    .catch(() => undefined);

/** Every box in the panel that stands past its row or the panel side to side, and every text box whose words run past its edge. */
const panelSpills = (screen: Page) =>
  screen.evaluate(() => {
    const pop = document.querySelector<HTMLElement>("[data-pin-list-pop]");
    const popBox = pop?.getBoundingClientRect();
    if (!(pop && popBox)) {
      return [];
    }
    const within = (r: DOMRect, outer: DOMRect) =>
      r.left >= outer.left - 0.5 && r.right <= outer.right + 0.5;
    // A text box's words past its edge; a control's touch area reaching past its drawn box is the 44 Touch Rule, not a spill.
    const spillsText = (el: HTMLElement) =>
      [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()
      ) &&
      getComputedStyle(el).overflowX === "visible" &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + 1;
    return [...pop.querySelectorAll<HTMLElement>("*")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const row = el.closest("[data-pin-row]")?.getBoundingClientRect();
        return (
          r.width > 0 &&
          (!within(r, popBox) || (row && !within(r, row)) || spillsText(el))
        );
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.localName}[${el.dataset.slot ?? ""}] ${Math.round(r.left)}–${Math.round(r.right)} in panel ${Math.round(popBox.left)}–${Math.round(popBox.right)}`;
      });
  });

/** Each row of the panel: whether it is one button, its title's lines, cut and one-line width, its text column, its last line. */
const panelRows = (screen: Page) =>
  screen.evaluate(() => {
    /** The title's lines, its clamp, whether it is cut, and its words laid on one line (a Range over its text; NaN once they wrap). */
    const titleOf = (title: HTMLElement | null) => {
      if (!title) {
        return { lines: 0, clamp: null, cut: false, natural: Number.NaN };
      }
      const t = getComputedStyle(title);
      const range = document.createRange();
      range.selectNodeContents(title);
      const rects = [...range.getClientRects()];
      return {
        lines: Math.round(title.clientHeight / Number.parseFloat(t.lineHeight)),
        clamp: t.webkitLineClamp,
        cut: title.scrollHeight > title.clientHeight + 1,
        natural: rects.length === 1 ? (rects[0]?.width ?? 0) : Number.NaN,
      };
    };
    return [
      ...document.querySelectorAll<HTMLElement>(
        "[data-pin-list-pop] [data-pin-row]"
      ),
    ].map((row) => ({
      n: Number(row.dataset.pinRow),
      button: row.localName === "button",
      inside: row.querySelectorAll("button").length,
      h: Math.round(row.getBoundingClientRect().height * 10) / 10,
      ...titleOf(row.querySelector<HTMLElement>('[data-slot="title"]')),
      column:
        row.querySelector('[data-slot="words"]')?.getBoundingClientRect()
          .width ?? 0,
      last: !!row.querySelector('[data-slot="last"]'),
    }));
  });

/** The buttons in the panel and the open card, each by its variant as drawn: primary (the kit's fill), outline (a drawn edge on no fill) or ghost. */
const panelButtons = (screen: Page) =>
  screen.evaluate(() => {
    const kind = (b: HTMLElement) => {
      if (b.classList.contains("bg-action-solid")) {
        return "primary";
      }
      const s = getComputedStyle(b);
      const clear =
        s.borderTopColor === "transparent" ||
        s.borderTopColor.endsWith(", 0)") ||
        s.borderTopColor.endsWith("/ 0)");
      return Number.parseFloat(s.borderTopWidth) > 0 && !clear
        ? "outline"
        : "ghost";
    };
    const of = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(`${selector} button`)]
        .filter((b) => !b.hasAttribute("data-pin-row") && b.role !== "tab")
        .map((b) => ({
          name: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
          kind: kind(b),
        }));
    return {
      panel: of("[data-pin-list-pop]"),
      card: of('[data-slot="pin-card"]'),
    };
  });

/** The Comments panel and the open card as the engine lays them out: boxes, surface, tab, scroll and the width tokens. */
const panelRead = async (screen: Page) => {
  const laid = await screen.evaluate(() => {
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const root = getComputedStyle(document.documentElement);
    const px = (name: string) => Number.parseFloat(root.getPropertyValue(name));
    const pop = document.querySelector<HTMLElement>("[data-pin-list-pop]");
    const card = document.querySelector<HTMLElement>('[data-slot="pin-card"]');
    const popStyle = pop ? getComputedStyle(pop) : null;
    const scroller = pop?.querySelector<HTMLElement>('[data-slot="rows"]');
    return {
      tokens: {
        min: px("--c-pin-list-min"),
        max: px("--c-pin-list-max"),
        share: px("--c-pin-list-share"),
        card: px("--c-pin-card-min"),
      },
      room: box(document.querySelector('[data-slot="pin-room"]')),
      pop: box(pop),
      surface: popStyle
        ? {
            fill: popStyle.backgroundColor,
            edge: `${popStyle.borderTopWidth} ${popStyle.borderTopColor}`,
            shadow: popStyle.boxShadow,
            padding: popStyle.paddingTop,
          }
        : null,
      away: !pop,
      tab:
        pop
          ?.querySelector('[role="tab"][aria-selected="true"]')
          ?.textContent?.trim() ?? null,
      scrollTop: scroller?.scrollTop ?? null,
      scrolls: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
      card: card
        ? {
            box: box(card),
            sheet: card.hasAttribute("data-sheet"),
            gone: !!card.querySelector('[data-slot="gone"]'),
          }
        : null,
    };
  });
  const buttons = await panelButtons(screen);
  return {
    ...laid,
    card: laid.card ? { ...laid.card, buttons: buttons.card } : null,
    panelButtons: buttons.panel,
  };
};

type PanelCheck = (what: string, ok: boolean, detail: unknown) => void;

/** The panel at rest on Open: its width beside or stacked, its rows, its cut, nothing spilling, its surface and buttons. Answers whether it stacks. */
const panelRestChecks = async (
  screen: Page,
  check: PanelCheck,
  layout: "stacked" | "beside"
) => {
  await still(screen);
  const rest = await panelRead(screen);
  const rows = await panelRows(screen);
  const spills = await panelSpills(screen);
  const { min } = rest.tokens;
  const p = rest.pop;
  const r = rest.room;
  // Stacked, the panel spans the well less its two gutters; beside, it hangs
  // at the well's right and leaves the room beside it to the card.
  const stands =
    !!(p && r) &&
    Math.abs(p.x + p.w - (r.x + r.w - 8)) <= 1 &&
    (layout === "stacked" ? Math.abs(p.x - (r.x + 8)) <= 1 : p.x > r.x + 8 + 1);
  check(
    layout === "stacked"
      ? "stacked: the panel spans the well less its two gutters"
      : "beside: the panel hangs at the well's right, the room beside it left to the card",
    stands,
    { panel: p, well: r }
  );
  check(
    "every row is one button holding none, a gone pin's too",
    rows.length === 3 &&
      rows.every((one) => one.button && one.inside === 0) &&
      rows.some((one) => one.n === 3),
    rows
  );
  const longRow = rows.find((one) => one.n === 1);
  const shortRow = rows.find((one) => one.n === 2);
  // The text column the panel's floor gives: this column less what the panel is past its floor.
  const floorColumn =
    shortRow && rest.pop ? shortRow.column - (rest.pop.w - min) : 0;
  check(
    `the 48-word comment wraps to at most four lines under line-clamp 4; the six-word one stands on one line here and fits the floor's ${Math.round(floorColumn * 10) / 10}px column, the thread's last line under it`,
    !!longRow &&
      longRow.clamp === "4" &&
      longRow.lines <= 4 &&
      !longRow.last &&
      !!shortRow &&
      shortRow.lines === 1 &&
      shortRow.natural <= floorColumn &&
      shortRow.last,
    { long: longRow, short: shortRow, panel: rest.pop?.w, floorColumn }
  );
  check("no box spills its row or the panel", spills.length === 0, spills);
  check(
    "the panel is the kit's floating surface: a raised fill, a 1px edge, a shadow",
    !!rest.surface &&
      !CLEAR_COLOUR.test(rest.surface.fill) &&
      rest.surface.edge.startsWith("1px") &&
      rest.surface.shadow !== "none",
    rest.surface
  );
  check(
    "the panel holds no outline button",
    rest.panelButtons.every((b) => b.kind !== "outline"),
    rest.panelButtons
  );
};

const closeCard = async (screen: Page, wait: number) => {
  await screen
    .locator('[data-slot="pin-card"]')
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await settle(screen, wait);
};

/** A gone pin's row opens its card: one primary, Reply; beside at the narrowed room's top-right, or stacked as the foot sheet. */
const goneCardChecks = async (
  screen: Page,
  list: Locator,
  stacked: boolean,
  check: PanelCheck
) => {
  await list.locator('[data-pin-row="3"]').click();
  await settle(screen, 800);
  const gone = await panelRead(screen);
  const primaries = gone.card?.buttons.filter((b) => b.kind === "primary");
  check(
    "the card holds one primary, Reply, and nothing outline",
    primaries?.length === 1 &&
      primaries[0]?.name === "Reply" &&
      !!gone.card?.buttons.every((b) => b.kind !== "outline"),
    gone.card?.buttons
  );
  // Reply with nothing written is disabled for real (shadcn's and the HIG's
  // pattern), the kit's disabled opacity over its own fill; a word enables it.
  const cardEl = screen.locator('[data-slot="pin-card"]');
  const reply = cardEl.getByRole("button", { name: "Reply", exact: true });
  const replyState = () =>
    reply.evaluate((b) => ({
      disabled: (b as HTMLButtonElement).disabled,
      opacity: getComputedStyle(b).opacity,
      fill: getComputedStyle(b).backgroundColor,
    }));
  const field = cardEl
    .locator("textarea[data-field]")
    .filter({ visible: true })
    .first();
  const empty = await replyState();
  await field.fill("A word");
  const filled = await replyState();
  await field.fill("");
  check(
    "Reply is disabled while the field is empty (the kit's disabled opacity over its own fill), enabled at full opacity once a word is written",
    empty.disabled &&
      !filled.disabled &&
      filled.opacity === "1" &&
      empty.fill === filled.fill,
    { empty, filled }
  );
  // The head's words wrap to two lines and are cut there, never cut on one.
  const name = await cardEl.locator('[data-slot="name"]').evaluate((el) => ({
    clamp: getComputedStyle(el).webkitLineClamp,
    wrap: getComputedStyle(el).whiteSpace,
    lines: Math.round(
      el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight)
    ),
  }));
  check(
    "the card's head words wrap, cut at two lines",
    name.clamp === "2" && name.wrap !== "nowrap" && name.lines <= 2,
    name
  );
  const c = gone.card?.box;
  const p = gone.pop;
  const r = gone.room;
  if (stacked) {
    check(
      "stacked: the gone pin's card is the foot sheet, saying the loss, and the panel stands aside",
      !!gone.card?.sheet && gone.card.gone && gone.away,
      { card: gone.card, away: gone.away }
    );
  } else {
    check(
      "beside: the gone pin's card says the loss and stands at the narrowed room's top-right, clear of the panel",
      !!(c && p && r) &&
        !gone.card?.sheet &&
        !!gone.card?.gone &&
        !meets(c, p) &&
        Math.abs(c.x + c.w - (p.x - 8)) <= 1.5 &&
        Math.abs(c.y - (r.y + 8)) <= 1.5,
      { card: c, panel: p, room: r }
    );
  }
  await closeCard(screen, 400);
};

/** Resolved, scrolled, a row's card: beside, clear of the panel; stacked, the foot sheet, and its Close brings the panel back on its tab at its scroll. */
const resolvedCardChecks = async (
  screen: Page,
  list: Locator,
  stacked: boolean,
  check: PanelCheck
) => {
  await list.locator('[role="tab"]', { hasText: "Resolved" }).click();
  await settle(screen, 400);
  await list.locator('[data-slot="rows"]').evaluate((el) => {
    el.scrollTop = 60;
  });
  await settle(screen, 200);
  const fifth = list.locator('[data-pin-row="5"]');
  await fifth.scrollIntoViewIfNeeded();
  const before = await panelRead(screen);
  await fifth.click();
  await settle(screen, 800);
  const opened = await panelRead(screen);
  await closeCard(screen, 600);
  const back = await panelRead(screen);
  if (!stacked) {
    check(
      "beside: a resolved row's card stands clear of the panel",
      !!(opened.card?.box && opened.pop) &&
        !opened.card.sheet &&
        !meets(opened.card.box, opened.pop),
      { card: opened.card?.box, panel: opened.pop }
    );
    return;
  }
  check(
    "stacked: a row's card is the foot sheet while the panel stands aside; its Close brings the panel back on the same tab at the same scroll",
    !!opened.card?.sheet &&
      opened.away &&
      !back.away &&
      back.tab === before.tab &&
      back.tab?.startsWith("Resolved") === true &&
      back.scrollTop === before.scrollTop,
    {
      before: {
        tab: before.tab,
        scrollTop: before.scrollTop,
        scrolls: before.scrolls,
      },
      opened: { sheet: opened.card?.sheet, away: opened.away },
      back: { away: back.away, tab: back.tab, scrollTop: back.scrollTop },
    }
  );
};

/** One size: the panel opened and read on Open, a gone pin's card, a resolved pin's card from a scrolled Resolved. */
/**
 * Pin 1's card, opened from its row: it stands beside the heading the pin
 * stands on where the well allows (its end side, its start side, below it),
 * never over it; as the foot sheet where the well stacks. Both rects on the
 * dashboard's screen, the heading's read in the page's own frame.
 */
const pinnedCardChecks = async (
  screen: Page,
  frame: Frame,
  list: Locator,
  check: PanelCheck
) => {
  await list.locator('[data-pin-row="1"]').click();
  await settle(screen, 800);
  // Beside, the card stands once the page has said where its pin stands (`cawco:pin-at`).
  await until(
    "pin 1's card placed",
    () =>
      screen
        .locator('[data-slot="pin-card"]')
        .evaluate(
          (el) => el.hasAttribute("data-sheet") || el.dataset.side !== "room"
        ),
    Boolean,
    3000
  ).catch(() => undefined);
  const card = await screen.locator('[data-slot="pin-card"]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      side: el.getAttribute("data-side") ?? "sheet",
    };
  });
  const offset = await screen
    .locator(FRAME)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + el.clientLeft, y: r.y + el.clientTop };
    });
  const inPage = await frame.locator("#a").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const heading = { ...inPage, x: inPage.x + offset.x, y: inPage.y + offset.y };
  check(
    `pin 1's card stands clear of the heading it pins (side: ${card.side})`,
    !meets(card.rect, heading),
    { card: card.rect, side: card.side, heading }
  );
  await closeCard(screen, 400);
};

/**
 * A row under the pointer, then held down: press takes the step past hover
 * (`surface-pressed`), never the hover's own fill. A row under the
 * keyboard's focus: the house's one focus indicator (app.css), a 2px
 * `--focus-ring` outline inset on the row, no box-shadow ring, and no other
 * element drawing focus beside it.
 */
const rowStateChecks = async (
  on: On,
  screen: Page,
  list: Locator,
  name: string
) => {
  const row = list.locator('[data-pin-row="2"]');
  const fill = () => row.evaluate((el) => getComputedStyle(el).backgroundColor);
  await row.hover();
  await settle(screen, 300);
  const hover = await fill();
  await screen.mouse.down();
  await settle(screen, 300);
  const press = await fill();
  // Let go away from the row, so the press never becomes a click.
  await screen.mouse.move(0, 0);
  await screen.mouse.up();
  on.kit.check(
    `k (${name}): a row held down takes a step past its hover`,
    hover !== press,
    JSON.stringify({ hover, press })
  );
  await list.locator('[role="tab"][aria-selected="true"]').focus();
  await screen.keyboard.press("Tab");
  await settle(screen, 300);
  const ring = await screen.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const s = el ? getComputedStyle(el) : null;
    return {
      on: el?.dataset.slot ?? el?.localName ?? null,
      outline: s
        ? `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`
        : null,
      offset: s?.outlineOffset ?? null,
      shadow: s?.boxShadow ?? null,
      ring: getComputedStyle(document.documentElement)
        .getPropertyValue("--focus-ring")
        .trim(),
      drawn: document.querySelectorAll(":focus-visible").length,
    };
  });
  on.kit.check(
    `k (${name}): a focused row draws the one focus indicator: a 2px outline inset on the row, no box-shadow ring, nothing else focused`,
    ring.on === "pin-row" &&
      ring.outline?.startsWith("2px solid") === true &&
      ring.offset === "-2px" &&
      (ring.shadow === "none" || ring.shadow === "") &&
      ring.drawn === 1,
    JSON.stringify(ring)
  );
};

const panelLeg = async (
  on: On,
  screen: Page,
  frame: Frame,
  name: string,
  layout: "stacked" | "beside"
) => {
  const check: PanelCheck = (what, ok, detail) =>
    on.kit.check(`k (${name}): ${what}`, ok, JSON.stringify(detail));
  const comments = screen.locator(`${PANE_SEL} button[data-slot="comments"]`);
  if ((await comments.getAttribute("aria-expanded")) !== "true") {
    await comments.click();
  }
  const list = screen.locator('[data-pin-list-pop] [data-slot="pin-list"]');
  await list.waitFor({ timeout: 5000 }).catch(() => undefined);
  await list.locator('[role="tab"]', { hasText: "Open" }).click();
  // The pane holds the hub's copy of the pins, a beat after the page wrote them.
  await list
    .locator('[data-pin-row="3"]')
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await settle(screen, 600);
  await panelRestChecks(screen, check, layout);
  const stacked = layout === "stacked";
  if (name === "1440 default split") {
    await rowStateChecks(on, screen, list, `${name}, light`);
  }
  await pinnedCardChecks(screen, frame, list, check);
  await goneCardChecks(screen, list, stacked, check);
  await resolvedCardChecks(screen, list, stacked, check);
  if ((await comments.getAttribute("aria-expanded")) === "true") {
    await comments.click();
  }
};

/** The page in a device's pane once it shows the panel page; null while it does not. */
const panelFrameOn = async (screen: Page): Promise<Frame | null> => {
  try {
    const handle = await screen
      .locator('iframe[title="Preview"]')
      .first()
      .elementHandle({ timeout: 1000 });
    const inner = await handle?.contentFrame();
    return (await inner?.evaluate(() => !!document.querySelector("#b")))
      ? (inner ?? null)
      : null;
  } catch {
    return null;
  }
};

/** The pins as the overlay writes them, in the page's own doc. */
const writePanelPins = (frame: Frame) =>
  frame.evaluate(
    ({ long, short }) => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (n: string) => { set: (k: string, v: object) => void };
              transact: (f: () => void) => void;
            };
          };
        }
      ).cawcoArtifact;
      const now = new Date().toISOString();
      const pin = (
        number: number,
        selector: string,
        thread: [string, string][],
        resolved = false
      ) => ({
        // A pin's id as the overlay makes one (wire.ts `PIN_ID`, 36 of hex and dashes).
        id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
        number,
        kind: "comment",
        // The words it stood on at pin time: a gone pin's head names them.
        anchor: {
          selector,
          text:
            selector === "#nowhere-on-this-page"
              ? "A card the page dropped"
              : "",
        },
        at: now,
        by: "person",
        elements: [],
        point: { x: 0.5, y: 0.5 },
        ...(resolved ? { resolvedAt: now } : {}),
        thread: thread.map(([by, text], i) => ({
          id: `panel-entry-${number}-${i}`,
          by,
          text,
          at: now,
        })),
      });
      doc.transact(() => {
        const pins = doc.getMap("pins");
        pins.set(
          "00000000-0000-4000-8000-000000000001",
          pin(1, "#a", [["person", long]])
        );
        pins.set(
          "00000000-0000-4000-8000-000000000002",
          pin(2, "#b", [
            ["person", short],
            ["person", "And keep its weight as it is."],
          ])
        );
        pins.set(
          "00000000-0000-4000-8000-000000000003",
          pin(3, "#nowhere-on-this-page", [["person", "On a card it dropped"]])
        );
        for (let n = 4; n <= 9; n += 1) {
          pins.set(
            `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
            pin(n, "#b", [["person", long]], true)
          );
        }
      });
    },
    { long: LONG_COMMENT, short: SHORT_COMMENT }
  );

/**
 * The Comments panel (owner, 2026-10-20: "what is this "place again"
 * pattern … ur also misuisng primary/seconday buttons and why i can't click
 * a comment to view the thread? … such a small panel that most coments are
 * trimmed"), at 1440 in the default split, 1440 expanded, 820 by touch and
 * 390: the panel is its share of the well between its floor and ceiling, or
 * stacked the well less two gutters; every row, a gone pin's too, is one
 * button holding none and opens its card; a 48-word comment is cut at four
 * lines and a six-word one stands on one; nothing spills its row or the
 * panel. Beside, the card and the panel don't meet, a gone pin's card at the
 * narrowed room's top-right; stacked, the card is the foot sheet, the panel
 * stands aside, and the card's Close brings it back on its tab at its
 * scroll. The card holds one primary, Reply; nothing in either is outline.
 */
const panelChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "panel",
    html: PANEL_PAGE,
  });
  if (!made.match(ANSWERED_ID)) {
    on.kit.check("k: the page is made", false, made.slice(0, 300));
    return;
  }
  const frame = (await until(
    "the panel page in the pane",
    async () => {
      const one = await pageFrame(on);
      const ready = await one
        .evaluate(
          () =>
            !!document.querySelector("#b") &&
            !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
              .cawcoArtifact?.doc
        )
        .catch(() => false);
      return ready ? one : null;
    },
    Boolean,
    60_000
  )) as Frame;
  // The pins as the overlay writes them (the agent's entries are
  // comment_reply's, never the page's): 1 the long comment, 2 the short one
  // and a second word of the person's, 3 on an element the page doesn't have
  // (the overlay moves it aside), 4 to 9 long and resolved, so Resolved scrolls.
  await writePanelPins(frame);
  await until(
    "pin 3 moved aside by the overlay",
    async () =>
      (await docOf(frame)).pins["00000000-0000-4000-8000-000000000003"] as {
        movedAt?: string;
      },
    (pin) => !!pin?.movedAt,
    10_000
  ).catch(() => undefined);

  await settle(on.page, 600);
  // The default split: an earlier leg may have left the pane expanded, its head's Expand become the way back (Esc).
  const collapse = on.page
    .locator(PANE_SEL)
    .locator('button[aria-keyshortcuts="Escape"][aria-label^="Back to"]');
  if ((await collapse.count()) === 1) {
    await collapse.click();
    await settle(on.page, 800);
  }
  // The default split's well is under beside's room: the card rises as the foot sheet.
  await panelLeg(on, on.page, frame, "1440 default split", "stacked");
  const expand = on.page
    .locator(PANE_SEL)
    .getByRole("button", { name: "Expand", exact: true });
  if ((await expand.count()) === 1) {
    await expand.click();
    await settle(on.page, 800);
    await panelLeg(on, on.page, frame, "1440 expanded", "beside");
    await on.page.keyboard.press("Escape");
    await settle(on.page, 600);
  } else {
    on.kit.check(
      "k (1440 expanded): the head's Expand",
      false,
      "no Expand in the pane's head"
    );
  }

  const base = await on.fleet.dashboard();
  // The same row states in the dark.
  const dark = await on.kit.page("desk", { theme: "dark" });
  await open(dark, `${base}/session/${on.session}`, COMPOSER);
  if (
    await until(
      "the panel page in the dark",
      () => panelFrameOn(dark),
      Boolean,
      60_000
    ).catch(() => null)
  ) {
    await settle(dark, 600);
    const toggle = dark.locator(`${PANE_SEL} button[data-slot="comments"]`);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    const darkList = dark.locator('[data-pin-list-pop] [data-slot="pin-list"]');
    await darkList
      .locator('[data-pin-row="2"]')
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    await rowStateChecks(on, dark, darkList, "1440 default split, dark");
  } else {
    on.kit.check(
      "k (1440 dark): the panel page in the pane",
      false,
      "not shown"
    );
  }
  await dark.close();
  for (const [view, name, size] of [
    ["tablet", "820 touch", { width: 820, height: 1180 }],
    ["phone", "390", null],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one device after another, each read where it lands
    const screen = await on.kit.page(view);
    if (size) {
      await screen.setViewportSize(size);
    }
    await open(screen, `${base}/session/${on.session}`, COMPOSER);
    const shown = await until(
      `the panel page at ${name}`,
      () => panelFrameOn(screen),
      Boolean,
      60_000
    ).catch(() => null);
    if (shown) {
      await settle(screen, 600);
      await panelLeg(on, screen, shown, name, "stacked");
    } else {
      on.kit.check(
        `k (${name}): the panel page in the pane`,
        false,
        "not shown"
      );
    }
    await screen.close();
  }
};

/** Pin `number`'s card in the pane, and whether its field has the keyboard. */
const focusedCard = async (on: On, number: number | undefined) => {
  if (number === undefined) {
    return { shown: false, focused: false };
  }
  const shown = await until(
    `pin ${number}'s card`,
    () => on.page.locator(`[data-pin-card="${number}"]`).count(),
    (count) => count === 1,
    5000
  )
    .then(() => true)
    .catch(() => false);
  const focused = await until(
    `pin ${number}'s field focused`,
    () =>
      on.page.evaluate(
        (n) =>
          !!document.activeElement &&
          document.activeElement.localName === "textarea" &&
          !!document.activeElement.closest(`[data-pin-card="${n}"]`),
        number
      ),
    Boolean,
    3000
  ).catch(() => false);
  return { shown, focused };
};

/** 6. Select's chip, popover and selection.md are gone from the code. */
const cutoverCheck = async (kit: Kit) => {
  const found = (
    await Bun.$`git grep -n -e selection.md -e SelectionChip -e SelectionPopover -- apps/dashboard/src packages`
      .cwd(ROOT)
      .nothrow()
      .quiet()
  ).stdout
    .toString()
    .trim();
  kit.check(
    "6: no selection.md, SelectionChip or SelectionPopover is left in apps/dashboard/src or packages",
    found === "",
    found.split("\n").slice(0, 4).join(" | ") || "none"
  );
};

const spec: Spec = { name: "comments", run };
export default spec;
