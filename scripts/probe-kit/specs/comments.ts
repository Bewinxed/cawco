/**
 * Comments on any artifact, slice 4b (Projects spec §5.7, §5.10; tsk-3;
 * DESIGN.md, Artifact panel, canvas and ink), on a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, which calls the
 * tools each PROBE-CALL names) and the built dashboard at the desk. Read
 * from the engine: the page's doc (`window.cawcoArtifact.doc`), the pane's
 * DOM, the overlay's shadow root, and what the model was sent.
 *
 * 1. `C` turns Comment on (its segment `aria-selected`, the well's 1px `seam`
 *    edge); a press on a paragraph opens the composer at the element beside
 *    a hollow pill with no number, writing nothing (pick 5); Comment writes
 *    pin 1 and its first entry at once, with its selector, source and text,
 *    its pill hollow (until it reaches the session). A press on the pill opens its thread as the
 *    280px card beside it (pick 2); Esc closes it, Esc again leaves the
 *    mode; a press on the page closes nothing.
 * 2. A pen stroke's radial Comment opens the composer on the ink; Comment
 *    writes pin 2 on it, with the ink's box; the rail shows two rows; J and
 *    K move the focus between the pins and the overlay's outline follows.
 * 3. A reply typed in the thread is in pin 1's thread, by the person. It
 *    goes by itself (the owner's "Go by themselves"): no Send in the head,
 *    no Send bar nor "Unsent" in the rail; one delivery carries pin 1 with
 *    the reply alone, no row of the person's; every pin and entry stamped
 *    `sentAt`, the pills filled. A second reply makes pin 1 hollow until it
 *    goes the same way, alone.
 * 4. comment_read answers both pins, what pin 1 stands on and its reply, and
 *    pin 2's ink box; comment_reply on pin 1 is in its thread within 2 s,
 *    the live dot showing while the agent's turn runs; the thread speaks in
 *    two voices; comment_resolve takes pin 1 off the page and into
 *    Resolved, recessed while its thread is open; Reopen brings it back. A
 *    host that holds no doc (the app) posts `cawco:reply` and
 *    `cawco:resolve` into the page: pin 1's doc takes a person's entry and a
 *    resolve then a reopen, each answered ok, and a gone pin answers the
 *    refusal's sentence.
 * 5. A re-publish that moves and rewords the paragraph re-anchors pin 1 by
 *    its source's file:line, its pill's tail on the moved paragraph; one
 *    that renames it and drops its source, keeping its text, re-anchors it
 *    by text; one that removes it marks pin 1 moved in its own row under
 *    Open, which opens its thread like any other; the thread says the
 *    element is gone, and its Pin it somewhere else with a press pins it
 *    anew.
 * 6. No `selection.md`, `SelectionChip` or `SelectionPopover`, and no
 *    PinList, PinDisc, `withdrawPin`, `pinReady`, `cawco:withdraw`, pin
 *    drafts, Comments popover or `c-pin-card-min`, is left in
 *    apps/dashboard/src or packages.
 *
 * And the owner's report (2026-10-14: the card didn't open on a new pin,
 * no delete, the whole iframe outlined):
 * a. Every press opens its composer with its field focused: the first, the
 *    second, and a third made while the second's thread is open.
 * b. A dev server's preview whose content stands in a same-origin inner
 *    frame: hovering the inner button outlines the button mapped to the top
 *    document; a press opens its composer and Comment stores an anchor with
 *    the frame chain and the button's inner selector; a reload that moves
 *    the button finds the pin on it again; the inner frame's own scroll
 *    moves the pill.
 * b2. A same-origin frame put in with its document opened (no root until it
 *    is written) says no error as the overlay reads it.
 * c. The thread's head holds Resolve, ⋯ and Close beside the name, its foot
 *    the chat composer with Attach and the Reply glyph. Delete comment (its
 *    ⋯), asked in the thread itself: the pin leaves the doc and the page,
 *    its thread closes, the other pins keep their numbers; the app's
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
 * And the empty-pin rule (commenting build spec): a press writes nothing.
 * e. A composer closed by Esc, by a press on the pane's chrome or elsewhere
 *    in the dashboard, by a mode switch or by a press on Reload leaves no pin
 *    in the doc, its half-written draft parked (The Work Outlives Its Surface
 *    Rule); the words typed in one closed unsaid are back in the next; a press
 *    on a pin's pill while a composer stands opens that pin's thread in its
 *    place.
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
 *
 * And the owner's report (2026-10-22, in Comment mode on a decision page
 * whose cards draw live component canvases: "i'm unable to comment on this
 * stupi canvas it selects the whole page"), on a decision page whose card
 * shows a Preview of a two-story canvas on an origin of its own (the hub's
 * embed origin, the overlay running in it):
 * l. Moved across the Preview, the target never names the whole page, and
 *    a story's frame reads by its story ("Story On"); resting on each
 *    story's button washes that button, the target's box the button's
 *    mapped into the page (±1px), at rest, its label the button's own words
 *    and line, so the two read apart; a press opens the composer with the
 *    button chosen (its 1px line, no label); the comment's pin stores the
 *    canvas's id, the story, the button's source and a selector that finds
 *    it in the canvas, and its pill's tail stands on the point pressed
 *    (±2px); its picture, drawn by the embed's own overlay, holds the
 *    button (not one colour inside its box, its most-drawn colour the
 *    button's computed face); comment_read of the page answers it with the
 *    canvas's id, the story and the button.
 *
 * And the owner's pins (2026-10-21: "this line is too tihck and too
 * prominent, why is it so thick?", "why use such thick and solid lines?"),
 * The One Target Rule (DESIGN.md):
 * 7c. In Comment mode, resting on an element tints it (`c-target-tint`)
 *    with no line; the page's root takes a 1px dashed `brand-solid` line
 *    inset `space-1`, no tint, its tag commentWords.wholePage at rest and none once
 *    chosen (its composer open), as any target; a tap chooses the
 *    element: a 1px `brand-solid` line at offset 0, the tint and no label,
 *    its text 4.5:1 under the tint by day and night, the composer opened by
 *    the press with no ring; the
 *    pointer moved elsewhere leaves it the one target. With the composer
 *    open, the frame's every outline, border and box-shadow holds exactly one
 *    coral mark, the target's, 1px. Tab onto the composer's field draws no
 *    ring either (its caret is its focus: The Caret Rule), and the target
 *    keeps its line and its tint. The line's
 *    contrast on the page field and on raised, by day and by night, is read
 *    and said. A bare text element chosen takes its line 2px outside, 2px or
 *    more from its glyphs.
 * 7f. A pin on an element whose id a framework minted (React's `useId`
 *    `:r1:`, Radix's `radix-…`) anchors by its place and words, never that
 *    id; re-rendered with the ids handed round, each pin stays on its own
 *    element.
 *
 * And the commenting redesign's picks (DESIGN.md, Placing a comment, A
 * pin's pill, The Comments rail, A thread beside its pin, How comments
 * reach the session), each a leg:
 * - The 280px card: the composer at the element 280px wide, its field 178px
 *   or wider, the hint commentWords.composeHint.full uncut, its pill one line.
 * - The attachment pill: one pill for every kind, a file's name and size on
 *   one baseline (0.5px), every ✕ centred on its pill (0.5px).
 * - Pick 6: a picture alone sends (`hasContent`), kept by reference, and
 *   goes to the session as an image block with its line.
 * - Pick 3's pill: up-right of its point by its bottom-start tail, turning
 *   at the page's right edge.
 * - The rail beside the page at `c-comments-w`, outside the well's seam;
 *   each hierarchy row's role, weight and ink read computed (The Row Dress
 *   Rule), the speaker's glyph bare with its sr-only "Agent:"/"You:"; pick
 *   7's thumb strip (four 20px thumbs, then "+N"); search; sort; a row's
 *   thread beside its pill, clear of the rail; the toggle's count only
 *   while the rail is shut.
 * - At 390, light and dark: the rail the well's foot sheet (60% at most), a
 *   row's thread the foot sheet with the rail aside, its list scrolled to
 *   its end standing wholly inside the sheet.
 *
 * And the review of the captures (2026-10-21):
 * - A thread's title stands whole: its glyphs no taller than the box that
 *   clips them, at the label role's line-height (desk and 390).
 * - The rail's fixture page reads in both schemes: its top strip's words
 *   4.5:1 or better on its ground, as the page draws in the host's theme.
 * - A thread opening takes every peek down: none stands while it does.
 * - A thread's entries wrap pretty, and a later entry's age stands on its
 *   words' first baseline (0.5px).
 * And pointing and what changed (PRD §5.7, the pin links design of
 * 2026-10-21):
 * - links: comment_reply, comment_resolve, comment_read and the delivery
 *   carry each pin's `[label](cawco:pin/<artifact>/<n>)`; artifact_create
 *   its artifact's and a decision page's every card's; artifact_update the
 *   card it rewrote.
 * - chip: the agent's pin, card and artifact links draw as their chips (a
 *   bare "pin 2" stays words), the pin's with its pill, its label, its
 *   state in its name and the needs-you dot while its answer is unread
 *   (after a reload too); resting on it peeks the thread; a press opens the
 *   panel there (the pin's thread open, `seenAt` written, the dot gone; the
 *   card outlined for a moment; the artifact in front), on the desk and on
 *   the phone's sheet.
 * - changed: a revision's changes in `meta.changes` (a page's elements, a
 *   decision page's cards and redrawn pictures), washed in `c-change-wash`
 *   on their own box, words 4.5:1 through it; the tag steps through them,
 *   each step seen in the doc and its wash fading over `--dur-fade`; seen,
 *   a reload washes nothing.
 * - drafts (The Work Outlives Its Surface Rule): a half-written comment
 *   survives a reload with its composer open at its target; Esc and a press
 *   outside park it as the hollow pill saying it holds a draft; one press
 *   brings the composer back with its words and chip, after a reload too.
 * - tombstones (a deletion is never undone): a pin deleted while the hub's
 *   link is down stays gone through a reload, the link's return and a
 *   reload again, on the page, on the hub and in a fresh browser, though a
 *   revision makes every load write its pin again; the same with the
 *   delete on one desk and the stale load on another.
 * And the phone's invariant (a thread or composer at the well's foot never
 * covers what the comment is about), at 390×844 in Chromium and WebKit:
 * - foot sheet: on a page whose line stands in the frame's bottom third with
 *   room to scroll below it, the composer a tap opens and the thread its
 *   pill opens each stand as the foot sheet with the pill wholly above the
 *   sheet's top and the line inside the frame's viewport; on a page too
 *   short to scroll it there, the same, lifted into room the overlay makes
 *   under the page's foot; each sheet closed, the page's scroll is its own.
 * The captures for the reviewer (light and dark, desk and 390) are written
 * under the run's output folder (`kit.out`/commenting); nothing here opens
 * them.
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame, Locator, Page, WebSocketRoute } from "playwright-core";
import { PNG } from "pngjs";
import { applyUpdate, Doc } from "yjs";
import { readWithin } from "../../../packages/core/src/bounded";
import type { Pin } from "../../../packages/core/src/comments";
import { houseFacePieces } from "../../../packages/core/src/house-faces";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { pinName } from "../../../packages/core/src/pin-name";
import { commentWords } from "../../../packages/core/src/words/comments";
import { commonWords } from "../../../packages/core/src/words/common";
import { shellWords } from "../../../packages/core/src/words/shell";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type BreathRead, readBreath } from "../breath";
import { traceMain } from "../frames";
import {
  COMPOSER,
  type Kit,
  open,
  pressAt as pressFramePoint,
  type Spec,
  settle,
  specOut,
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
const SHOW = "mcp__cawco__artifact_show";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** A message the model answers with the words kept under its number: an agent's line, written as the probe needs it. */
const SAY = /PROBE-SAY:(\d+)/;
const says = new Map<string, string>();
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The person's comments, delivered by themselves (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "[a-z0-9-]+" \(artifact [0-9a-f-]{36}\)\./;
/** How long a delivery may take: the hub's send and the way to the model. */
const DELIVERY_MS = 30_000;
/** The hub's quiet after the person's last mark before it delivers them (artifacts/service.ts `COMMENTS_QUIET_MS`). */
const QUIET_MS = 3000;
/** How long the probe watches for a delivery that should not come. Our call. */
const STILL_MS = 14_000;
/** An image block in a request's body. */
const IMAGE_BLOCK = /"type":"image"/g;
/** An attachment's reference: the hub's file by its hash (core `FILE_REF`). */
const FILE_REF_PATH = /^\/api\/files\/[0-9a-f]{64}$/;
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
/** Calls whose turn the model draws out for half a minute: long enough to read a live dot in both schemes. */
const long = new Set<string>();
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
  const say = SAY.exec(request.last)?.[1];
  if (say && says.has(say) && !request.afterTool) {
    return text(says.get(say) as string);
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      // Its whole answer: a delivery may join at the tool's boundary.
      answered.set(marker, request.final);
      answeredAt.set(marker, Date.now());
    }
    if (long.has(marker)) {
      return {
        everyMs: 600,
        words: ["Working", ...Array.from({ length: 50 }, () => " on"), "."],
      };
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
    asks.set(marker, {
      name: tool,
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      input: { response_format: "detailed", ...input },
    });
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

/** The artifact panel, in a session's split or the artifact's own tab. */
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
/** The Comments rail (DESIGN.md, The Comments rail). */
const RAIL = '[data-slot="comment-rail"]';
/** The composer a press on the page opens beside its hollow pill (DESIGN.md, Placing a comment). */
const COMPOSE = '[data-slot="pin-composer"]';
/** The head's Comments, the rail's toggle. */
const COMMENTS_TOGGLE =
  ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[data-slot="comments"]';

/**
 * The Comments rail, opened from the head's Comments when it is shut: it
 * stands beside the page, which it narrows, so a check that measures the
 * page at its width shuts it first ({@link shutList}).
 */
const rowsOf = async (on: On) => {
  const button = on.page.locator(COMMENTS_TOGGLE);
  const list = on.page.locator(RAIL);
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  await list.waitFor({ timeout: 5000 }).catch(() => undefined);
  // In from the well's end over --dur-panel: read once it stands.
  await settle(on.page, 350);
  return list;
};
const shutList = async (on: On) => {
  const button = on.page.locator(COMMENTS_TOGGLE);
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
    await on.page
      .locator(RAIL)
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
    await settle(on.page, 250);
  }
};

/**
 * A press at the screen's `x`, `y` in Comment mode (DESIGN.md, Placing a
 * comment): its composer opens beside a hollow pill, writing nothing; with
 * `words`, they are typed in its field and Enter comments, the pin and its
 * first entry written at once. Whether the composer opened with its field
 * focused, and whether it went once the comment was written.
 */
const commentAt = async (
  on: On,
  frame: Frame,
  x: number,
  y: number,
  words: string | null = "A comment, written."
) => {
  // The pointer comes to the spot first, as a hand's does: the preview is a
  // frame of its own process, which the browser routes input to by where
  // the pointer last stood.
  await on.page.mouse.move(x, y, { steps: 4 });
  await pressFramePoint(frame, { x, y });
  const composer = on.page.locator(COMPOSE);
  const shown = await composer
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const focused = await until(
    "the composer's field focused",
    () =>
      on.page.evaluate(
        (holder) =>
          !!document.activeElement?.closest(holder) &&
          (document.activeElement as HTMLElement).isContentEditable,
        COMPOSE
      ),
    Boolean,
    3000
  ).catch(() => false);
  let gone = false;
  if (shown && words !== null) {
    await composer.getByRole("combobox").fill(words);
    await on.page.keyboard.press("Enter");
    gone = await composer
      .waitFor({ state: "detached", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
  }
  return { shown, focused, gone };
};

/** Pin `number`'s pill pressed on the page: its thread opens beside it. */
const openThread = async (on: On, frame: Frame, number: number) => {
  const face = frame
    .locator(
      `:is(svg[data-cawco-pins], svg[data-cawco-pins-fixed]) g[data-pin="${number}"] [data-face]`
    )
    .first();
  // The pin in view first, as a person scrolls to it, and only when it is
  // not: a pin whose element the page has scrolled away stands hidden
  // (preview-overlay pins.ts `placeAll`), and a pill the frame's view leaves
  // out is pressed nowhere (kit pressAt says so). One in view stays put, so
  // nothing scrolls under a press that needs none.
  const inView = await face
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight;
    })
    .catch(() => false);
  if (!inView) {
    const anchored = (
      Object.values((await docOf(frame)).pins as Pins).find(
        (pin) => (pin as { number?: number }).number === number
      ) as { anchor?: { selector?: string } } | undefined
    )?.anchor?.selector;
    if (anchored) {
      await frame
        .evaluate(
          (selector) =>
            document
              .querySelector(selector)
              ?.scrollIntoView({ block: "center" }),
          anchored
        )
        .catch(() => undefined);
      await settle(on.page, 300);
    }
  }
  const pill = await face.boundingBox({ timeout: 3000 }).catch(() => null);
  if (pill) {
    await on.page.mouse.move(
      pill.x + pill.width / 2,
      pill.y + pill.height / 2,
      {
        steps: 2,
      }
    );
    await pressFramePoint(frame, {
      x: pill.x + pill.width / 2,
      y: pill.y + pill.height / 2,
    });
  }
  const card = on.page.locator(
    `[data-slot="pin-card"][data-pin-card="${number}"]`
  );
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  return card;
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
  try {
    await runOn(kit, on);
  } finally {
    // Said even when a check throws: the page's error is often why.
    kit.check(
      "the pages said no error",
      on.said.length === 0,
      on.said.slice(0, 6).join(" | ") || "none"
    );
  }
};

const runOn = async (kit: Kit, on: On) => {
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
  await breathChecks(on, frame);
  await hostChecks(on, frame, one);
  await anchorChecks(on, frame, id, one);
  // The Comments panel floats over the page's top-right: each check that
  // presses the page starts with it shut, and opens it for its rows.
  for (const checks of [
    () => tapAndDeleteChecks(on, frame),
    () => frameChecks(on),
    () => embedChecks(on),
    () => scaledFrameChecks(on),
    () => scrollChecks(on, "window"),
    () => scrollChecks(on, "container"),
    () => dismissChecks(on),
    () => roomChecks(on),
    () => wordlessChecks(on),
    () => cornerChecks(on),
    () => targetChecks(on),
    () => documentChecks(on),
    () => mapPressChecks(on),
    () => svgPictureChecks(on),
    () => insertChecks(on),
    () => mintedIdChecks(on),
    () => listChecks(on),
    // Pointing and what changed: the links, their chips, the wash and the dot.
    () => pointChecks(on, { id, made, one, two }),
    () => changedChecks(on),
    // The Work Outlives Its Surface Rule on the composer.
    () => draftChecks(on),
    // A pin stays on its element while a page draws it again.
    () => redrawChecks(on),
    // Comments go by themselves, and why one wasn't sent.
    () => pinSendChecks(on),
    // Delete, one press in the thread's head.
    () => deleteHeadChecks(on),
    // A deletion stays deleted, whatever a stale load or another device writes.
    () => deletedOnOneDevice(on),
    () => deletedOnAnother(on),
    // Changed since you looked, on a canvas.
    () => canvasChangedChecks(on, id),
    // A long name holds its line.
    () => longNameChecks(on),
    // On a phone, the foot sheet never covers what the comment is about.
    () => footSheetChecks(on),
    // Nothing of the person's is lost: a refused write, a hub restart before its delivery.
    () => refusedChecks(on),
    () => restartChecks(on),
    // Last: it loads the desk again, which gives the split its kept width.
    () => keyOpenChecks(on),
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: the checks run in order, one after another
    await shutList(on);
    await checks();
  }
  await cutoverCheck(kit);
};

/** 1. C, a tap, the card at the pin, Esc and Esc. */
const commentChecks = async (on: On, frame: Frame) => {
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  // DESIGN.md, The mode: "Comment and Draw mark the well's edge with a 1px
  // `seam` inside its box": seam, 1px solid, offset -1px.
  const readEdge = () =>
    on.page.evaluate(() => {
      const well = document.querySelector(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-side-well]'
      );
      const probe = document.createElement("span");
      probe.style.color = "var(--seam)";
      document.body.append(probe);
      const seam = getComputedStyle(probe).color;
      probe.remove();
      const style = well ? getComputedStyle(well) : null;
      return {
        color: style?.outlineColor ?? null,
        width: style?.outlineWidth ?? null,
        style: style?.outlineStyle ?? null,
        offset: style?.outlineOffset ?? null,
        seam,
      };
    });
  type Edge = Awaited<ReturnType<typeof readEdge>>;
  const seamEdge = (read: Edge) =>
    read.color === read.seam &&
    read.width === "1px" &&
    read.style === "solid" &&
    read.offset === "-1px";
  // The edge comes in over --dur-control: read once it has.
  await on.page.keyboard.press("d");
  await settle(on.page, 300);
  const drawEdge = await readEdge();
  on.kit.check(
    "1: D turns Draw on: the well's edge is a 1px seam line, solid, inside its box (never 2px brand-solid)",
    seamEdge(drawEdge),
    JSON.stringify(drawEdge)
  );
  await on.page.keyboard.press("c");
  await pageInComment(frame, true);
  await settle(on.page, 300);
  const edge = await readEdge();
  const pressed = await comment.getAttribute("aria-selected");
  on.kit.check(
    "1: C turns Comment on: its segment chosen (aria-selected), the well's edge a 1px seam line, solid, inside its box (never 2px brand-solid)",
    pressed === "true" && seamEdge(edge),
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
  const pressAt = { x: b.x + b.w * 0.3, y: b.y + b.h / 2 };
  // The press alone: the composer opens beside a hollow pill, nothing written.
  const opened = await commentAt(on, frame, pressAt.x, pressAt.y, null);
  await settle(on.page, 400);
  const composer = on.page.locator(COMPOSE);
  const provisional = await frame
    .locator('svg[data-cawco-pins] g[data-pin="new"]')
    .evaluate((g) => ({
      state: g.getAttribute("data-state"),
      figure: g.querySelector("text")?.textContent ?? null,
    }))
    .catch(() => null);
  const written = Object.keys((await docOf(frame)).pins).length;
  const parts = await composer
    .evaluate((el) => ({
      width: Math.round(el.getBoundingClientRect().width),
      chip:
        el
          .querySelector('[data-slot="target-chip"] [data-slot="chip-label"]')
          ?.textContent?.trim() ?? null,
      hint: el.querySelector('[role="combobox"]')?.getAttribute("aria-label"),
      send: el.querySelector('[data-slot="stop"]')?.getAttribute("aria-label"),
      sendOff: (el.querySelector('[data-slot="stop"]') as HTMLButtonElement)
        ?.disabled,
    }))
    .catch(() => null);
  on.kit.check(
    "pick 5, the composer at the element: a press opens the chat composer beside a hollow pill with no number, its field focused, the target chip naming the paragraph, the field saying commentWords.composeHint.full, the send glyph labelled Comment and off while empty; the doc holds no pin",
    opened.shown &&
      opened.focused &&
      provisional?.state === "provisional" &&
      provisional.figure === null &&
      written === 0 &&
      parts?.width === 280 &&
      parts.chip === "Hero · A paragraph to comment on, long enough to tap." &&
      parts.hint === commentWords.composeHint.full &&
      parts.send === "Comment" &&
      parts.sendOff === true,
    `opened ${JSON.stringify(opened)}; pill ${JSON.stringify(provisional)}; pins in the doc ${written}; composer ${JSON.stringify(parts)}`
  );
  await composer.getByRole("combobox").fill("Bolder, perhaps.");
  const sendOn = await composer
    .locator('[data-slot="stop"]')
    .isEnabled()
    .catch(() => false);
  await on.page.keyboard.press("Enter");
  const pins = await until(
    "pin 1 in the doc",
    async () => (await docOf(frame)).pins,
    (all) => !!pinNumbered(all, 1),
    10_000
  ).catch(() => ({}) as Pins);
  const pin = pinNumbered(pins, 1);
  const closed = await composer
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await settle(on.page, 400);
  const pill = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"]')
    .evaluate((g) => ({
      state: g.getAttribute("data-state"),
      figure: g.querySelector("text")?.textContent ?? null,
    }))
    .catch(() => null);
  const railOpen = await on.page.locator(RAIL).count();
  on.kit.check(
    "1: Comment writes pin 1 and its first entry at once, with the paragraph's selector, source and text; the composer goes, the pill takes its number hollow (unsent), and the rail doesn't open",
    sendOn &&
      pin?.kind === "comment" &&
      pin.by === "person" &&
      pin.anchor.selector === "#para" &&
      pin.anchor.source?.file === "src/Hero.svelte" &&
      pin.anchor.source.line === 12 &&
      String(pin.anchor.text).startsWith("A paragraph to comment on") &&
      Array.isArray(pin.thread) &&
      pin.thread.length === 1 &&
      pin.thread[0].by === "person" &&
      pin.thread[0].text === "Bolder, perhaps." &&
      closed &&
      pill?.state === "unsent" &&
      pill.figure === "1" &&
      railOpen === 0,
    `send on ${sendOn}; pin ${JSON.stringify(pin && { kind: pin.kind, anchor: pin.anchor, thread: pin.thread })}; composer gone ${closed}; pill ${JSON.stringify(pill)}; rail ${railOpen}; said ${on.said.slice(0, 3).join(" | ") || "nothing"}`
  );
  if (!pin) {
    return null;
  }
  const card = await openThread(on, frame, 1);
  await settle(on.page, 500);
  const cardBox = await card.boundingBox({ timeout: 2000 }).catch(() => null);
  const mark = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"] [data-face]')
    .boundingBox({ timeout: 2000 })
    .catch(() => null);
  const side = await card.getAttribute("data-side").catch(() => null);
  // `--space-2` (7px) from the pill: its end side, else its start side, else below it.
  const GAP = 7;
  const beside =
    !!cardBox &&
    !!mark &&
    ((side === "end" &&
      Math.abs(cardBox.x - (mark.x + mark.width + GAP)) <= 3) ||
      (side === "start" &&
        Math.abs(cardBox.x + cardBox.width - (mark.x - GAP)) <= 3) ||
      (side === "below" &&
        Math.abs(cardBox.y - (mark.y + mark.height + GAP)) <= 3));
  on.kit.check(
    "pick 2, where a thread opens: a press on pin 1's pill opens its thread as a 280px card beside the pill, --space-2 from it",
    !!cardBox && Math.round(cardBox.width) === 280 && beside,
    `card ${JSON.stringify(cardBox)} on side ${side}; pill ${JSON.stringify(mark)}`
  );
  const head = await headOf(card);
  on.kit.check(
    "1: the thread's head names pin 1 in words, its component and the paragraph's text, never its selector; no chain line for an element the page's root holds; its words drawn under it",
    head.name === "Hero · A paragraph to comment on, long enough to tap." &&
      !head.shown.includes("#para") &&
      head.shown.includes("Bolder, perhaps.") &&
      (await card.locator('[data-slot="chain"]').count()) === 0,
    JSON.stringify(head)
  );
  const title = await titleFits(card);
  on.kit.check(
    "1: the thread's title stands whole: its glyphs no taller than the box that clips them, none cut above or below, at the label role's line-height or more",
    titleWhole(title),
    JSON.stringify(title)
  );

  // Esc unwinds one at a time: the thread, then Comment for Interact.
  await on.page.keyboard.press("Escape");
  const escaped = await card
    .waitFor({ state: "detached", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  await on.page.keyboard.press("Escape");
  const left = await comment.getAttribute("aria-selected");
  const back = await interactTab(on).getAttribute("aria-selected");
  // In Interact a press on the page is the page's, and closes no thread: it closes by its Close or Esc.
  await openThread(on, frame, 1);
  const blank = await screenBox(on, frame, ".tall");
  await pressFramePoint(frame, { x: blank.x + 30, y: blank.y + 30 });
  await settle(on.page, 300);
  const stays = (await card.count()) === 1;
  await card.getByRole("button", { name: "Close", exact: true }).click();
  const shut = await card
    .waitFor({ state: "detached", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  on.kit.check(
    "pick 2's dismissal: Esc closes the thread, and Esc again leaves Comment for Interact; a press on the page leaves the thread open, and its Close closes it",
    escaped && left === "false" && back === "true" && stays && shut,
    `Esc closed it ${escaped}; Comment ${left}, Interact ${back}; stays after a page press ${stays}; Close shut it ${shut}`
  );
  return pin.id;
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
  // The radial's Comment opens the composer on the ink: nothing written until Comment.
  const composer = on.page.locator(COMPOSE);
  const opened = await composer
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const before = Object.keys((await docOf(frame)).pins).length;
  await composer
    .getByRole("combobox")
    .fill("This stroke, thicker.")
    .catch(() => undefined);
  await on.page.keyboard.press("Enter");
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
    "2: the radial menu's Comment opens the composer on the ink, writing nothing; Comment writes pin 2 on the ink, with the ink's box and its words",
    opened &&
      before === 1 &&
      pin?.kind === "comment" &&
      typeof pin.ink === "string" &&
      pin.thread[0]?.text === "This stroke, thicker." &&
      !!box?.w &&
      !!box.h,
    `composer ${opened}; pins before ${before}; pin ${JSON.stringify(pin && { kind: pin.kind, ink: pin.ink, thread: pin.thread })}; box ${JSON.stringify(box)}`
  );
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
      .locator(`${RAIL} [data-slot="pin-row"][data-focused]`)
      .getAttribute("data-pin-row")
      .catch(() => null);
    steps.push({
      current,
      outline: near(await outlineOf(frame), await boxIn(frame, selector), 4),
    });
  }
  on.kit.check(
    "2: the rail shows two rows; J, J, K step to pins 1, 2, 1 and the outline follows",
    rows === 2 &&
      steps.map((step) => step.current).join() === "1,2,1" &&
      steps.every((step) => step.outline),
    `${rows} rows; ${JSON.stringify(steps)}`
  );
  return pin?.id ?? null;
};

/**
 * 3. When the agent hears: by itself, a few seconds after the person writes
 * (the owner's "Go by themselves", 2026-10-23). A reply in the thread goes
 * with no Send: the head offers none and the rail no Send bar nor "Unsent";
 * one delivery carries pin 1 with that reply alone, drawn as a quiet line
 * and no row of the person's, and the pills fill; a second reply turns pin
 * 1 hollow until it goes the same way, alone.
 */
const sendChecks = async (on: On, frame: Frame, one: string) => {
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  const before = heard.length;
  const rows = await on.page
    .locator('[data-slot="turn"][data-you]:not([data-slot="pin-card"] *)')
    .count();
  await card.getByRole("combobox").fill("Make it bolder.");
  await card.getByRole("button", { name: "Reply" }).click();
  const replied = await until(
    "the reply in pin 1's thread",
    async () => (await docOf(frame)).pins[one] as { thread?: unknown[] },
    (pin) => (pin?.thread?.length ?? 0) === 2,
    5000
  ).catch(() => null);
  const entry = (replied?.thread?.[1] ?? null) as {
    by?: string;
    text?: string;
  } | null;
  on.kit.check(
    "3: a reply typed in the thread is in pin 1's thread, by the person, after its first words",
    entry?.by === "person" && entry.text === "Make it bolder.",
    JSON.stringify(replied?.thread)
  );
  await on.page.keyboard.press("Escape");

  const head = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-slot="send"]'
  );
  const headLeft = await head.count();
  const rail = await rowsOf(on);
  const unsentRows = await rail
    .locator('[data-slot="pin-row"] [data-line="back"]', { hasText: "Unsent" })
    .count();
  const barLeft = await on.page.locator('[data-slot="send-bar"]').count();
  const message = await until(
    "the reply's delivery at the model",
    () => heard.slice(before).find((said) => NOTICE.test(said.last)),
    Boolean,
    DELIVERY_MS + QUIET_MS
  ).catch(() => undefined);
  const line = on.page.locator("[data-artifact-responses]");
  await line
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await settle(on.page, 500);
  const ownRows = await on.page
    .locator('[data-slot="turn"][data-you]:not([data-slot="pin-card"] *)')
    .count();
  const stamped = await until(
    "sentAt on every pin and entry",
    () => docOf(frame),
    (doc) =>
      Object.values(doc.pins).every((pin) => {
        const stood = pin as {
          sentAt?: string;
          thread: { by: string; sentAt?: string }[];
        };
        return (
          !!stood.sentAt &&
          stood.thread.every((item) => item.by !== "person" || !!item.sentAt)
        );
      }),
    10_000
  ).catch(() => docOf(frame));
  await settle(on.page, 400);
  const states = await frame.evaluate(() =>
    [...document.querySelectorAll("svg[data-cawco-pins] g[data-pin-id]")].map(
      (g) => g.getAttribute("data-state")
    )
  );
  const words = message?.last ?? "";
  // Exactly once: nothing more comes after it.
  await on.page.waitForTimeout(STILL_MS);
  const deliveries = heard
    .slice(before)
    .filter((said) => NOTICE.test(said.last)).length;
  on.kit.check(
    "3: the reply goes by itself, no Send in the head and no Send bar nor Unsent in the rail: one delivery carrying pin 1 with the reply alone and its id, no row of the person's; every pin and entry stamped sentAt, the pills filled",
    headLeft === 0 &&
      barLeft === 0 &&
      unsentRows === 0 &&
      deliveries === 1 &&
      words.includes("## 1. comment on #para") &&
      words.includes('- I wrote: "Make it bolder."') &&
      !words.includes('- I wrote: "Bolder, perhaps."') &&
      words.includes(`- Pin: ${one}`) &&
      !words.includes("## 2.") &&
      ownRows === rows &&
      Object.values(stamped.pins).every(
        (pin) => !!(pin as { sentAt?: string }).sentAt
      ) &&
      states.length >= 2 &&
      states.every((state) => state === "sent"),
    `head Send ${headLeft}; bar ${barLeft}; Unsent rows ${unsentRows}; deliveries ${deliveries}; person's rows ${rows} → ${ownRows}; pills ${JSON.stringify(states)}; heard ${words.slice(0, 600)}`
  );

  const again = heard.length;
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  await card.getByRole("combobox").fill("And a little larger.");
  await card.getByRole("button", { name: "Reply" }).click();
  await settle(on.page, 600);
  const hollow = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"]')
    .getAttribute("data-state")
    .catch(() => null);
  await on.page.keyboard.press("Escape");
  const second = await until(
    "the second reply's delivery",
    () => heard.slice(again).find((said) => NOTICE.test(said.last)),
    Boolean,
    DELIVERY_MS + QUIET_MS
  ).catch(() => undefined);
  on.kit.check(
    "3: a second reply makes pin 1 hollow until it goes by itself, alone, with that reply",
    hollow === "unsent" &&
      !!second?.last.includes('- I wrote: "And a little larger."') &&
      !second.last.includes('- I wrote: "Make it bolder."') &&
      !second.last.includes("## 2."),
    `pill ${hollow}; ${second?.last.slice(0, 300) ?? "no delivery"}`
  );
};

/**
 * 4b. One breath everywhere (the owner's pick): while the agent's turn runs
 * on a pin, the page's own pill (the overlay's live dot, in the frame) and
 * the rail row's live dot for the same pin each run one breath, `--breath`
 * long on `--ease-in-out`, its opacity 1, the floor and 1 at 0, ½ and 1 of
 * a loop, by day and at night, both begun on the one clock (core breath.ts,
 * the wall clock's multiples of the breath: the two documents keep timelines
 * of their own); and nothing breathes under reduced motion.
 */
const breathChecks = async (on: On, frame: Frame) => {
  const { page: screen } = on;
  // The breath's tokens as the dashboard computes them in its scheme now.
  const tokensNow = () =>
    screen.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.animationDuration = "var(--breath)";
      probe.style.animationTimingFunction = "var(--ease-in-out)";
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const read = {
        ms: Number.parseFloat(style.animationDuration) * 1000,
        easing: style.animationTimingFunction,
        floor: Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--breath-floor")
            .trim()
        ),
      };
      probe.remove();
      return read;
    });
  const rows = await rowsOf(on);
  long.add(String(Number(lastMarker) + 1));
  // The turn runs on for half a minute after the tool answers.
  await on.call(READ, { filter: "all" });
  const liveRow = rows.locator('[data-slot="pin-row"]:has([data-dot="live"])');
  const number = await liveRow
    .first()
    .getAttribute("data-pin-row", { timeout: 10_000 })
    .catch(() => null);
  const rowDot = `${RAIL} [data-slot="pin-row"][data-pin-row="${number}"] [data-dot="live"]`;
  const pillDot = `svg[data-cawco-pins] g[data-pin="${number}"] circle[data-dot="live"]`;
  const flat = (n: number) => Math.round(n * 1000) / 1000;
  const shown = (one: BreathRead | null) =>
    one
      ? `runs ${one.runs}, ${flat(one.length)}ms, ${one.easing}, opacity ${one.opacity.map(flat).join("/")}, ${one.offClock === null ? "no start" : `${flat(one.offClock)}ms off the clock`}`
      : "∅";
  const breathes = (
    one: BreathRead | null,
    tokens: Awaited<ReturnType<typeof tokensNow>>
  ) =>
    !!one &&
    one.runs === 1 &&
    Math.abs(one.length - tokens.ms) <= 1 &&
    one.easing.replaceAll(" ", "") === tokens.easing.replaceAll(" ", "") &&
    Math.abs((one.opacity[0] ?? 0) - 1) <= 0.01 &&
    Math.abs((one.opacity[1] ?? 0) - tokens.floor) <= 0.01 &&
    Math.abs((one.opacity[2] ?? 0) - 1) <= 0.01 &&
    one.offClock !== null &&
    one.offClock <= 1;
  const readBoth = async () => {
    await frame
      .waitForSelector(pillDot, { timeout: 10_000 })
      .catch(() => undefined);
    await screen.waitForTimeout(100);
    return {
      pill: await frame.evaluate(readBreath, pillDot).catch(() => null),
      row: await screen.evaluate(readBreath, rowDot).catch(() => null),
    };
  };
  const both = async (scheme: string) => {
    const tokens = await tokensNow();
    const { pill, row } = await readBoth();
    on.kit.check(
      `4b (${scheme}): while the agent works on pin ${number}, the page's pill and its rail row each breathe one breath, ${tokens.ms}ms on --ease-in-out, opacity 1, the floor (${tokens.floor}) and 1 at 0, ½ and 1 of a loop, both begun on the one clock (equal length, curve and start on the wall clock)`,
      number !== null &&
        breathes(pill, tokens) &&
        breathes(row, tokens) &&
        pill?.length === row?.length &&
        pill?.easing === row?.easing,
      `\n    pill: ${shown(pill)}\n    row:  ${shown(row)}`
    );
  };
  await both("day");
  // Night: the dashboard's own switch, which tells the page its scheme.
  const switchTo = async (to: "dark" | "light") => {
    const label = to === "dark" ? shellWords.lightMode : shellWords.darkMode;
    for (let press = 0; press < 3; press += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one press of the switch at a time
      const dark = await screen.evaluate(() =>
        document.documentElement.classList.contains("dark")
      );
      if (dark === (to === "dark")) {
        return;
      }
      await screen
        .getByRole("button", { name: label })
        .or(screen.getByRole("button", { name: "System" }))
        .first()
        .click({ timeout: 5000 });
      // A plain wait, never `settle`, which holds every loop still at its
      // start: the breath read next is the page's own.
      await screen.waitForTimeout(400);
    }
  };
  await switchTo("dark");
  await both("night");
  // Less motion: nothing breathes, on the page nor in the rail.
  await screen.emulateMedia({ reducedMotion: "reduce" });
  await screen.waitForTimeout(300);
  const still = await readBoth();
  on.kit.check(
    `4b (reduced motion): pin ${number}'s live dot stands still on the page and in its rail row: no breath runs`,
    still.pill?.runs === 0 && still.row?.runs === 0,
    `\n    pill: ${shown(still.pill)}\n    row:  ${shown(still.row)}`
  );
  await screen.emulateMedia({ reducedMotion: "no-preference" });
  await switchTo("light");
  await until(
    "the long turn to end",
    () => screen.locator(`${RAIL} [data-dot="live"]`).count(),
    (count) => count === 0,
    60_000
  ).catch(() => undefined);
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
    if ((await rows.locator('[data-dot="live"]').count()) > 0) {
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
          ':is([data-slot="comment-rail"], [data-slot="pin-card"]) :is([data-dot="live"], [data-slot="working"])'
        )
        .count(),
    (count) => count === 0,
    15_000
  ).catch(() => undefined);
  clearInterval(watch);
  on.kit.check(
    "4: comment_reply on pin 1 is in its thread within 2 s, the pill's live dot showing on its row while the agent's turn runs",
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
    "4: the thread speaks in two voices: the person's entries one well (painted, the first running on, the second grouped under it, no gap), the agent's reply bare under its mark and the session's name",
    voices.people === 3 &&
      voices.personWells.every((color) => !clear(color)) &&
      new Set(voices.personWells).size === 1 &&
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

  // A resolved pin leaves the page; it stands there, recessed, only while its thread is open.
  await card
    .getByRole("button", { name: "Close", exact: true })
    .click()
    .catch(() => undefined);
  await on.call(RESOLVE, { pin: one });
  const left = await until(
    "pin 1 off the page",
    () => frame.locator('svg[data-cawco-pins] g[data-pin="1"]').count(),
    (count) => count === 0,
    5000
  ).catch(() => -1);
  const openRows = await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"]')
    .count();
  await on.page.getByRole("tab", { name: RESOLVED_TAB }).click();
  const resolved = await on.page
    .locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`)
    .count();
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  const pillOne = frame.locator('svg[data-cawco-pins] g[data-pin="1"]');
  const standing = await until(
    "pin 1 recessed while its thread is open",
    async () =>
      (await pillOne.count()) > 0 ? pillOne.getAttribute("data-state") : null,
    (state) => state === "resolved",
    5000
  ).catch(() => null);
  const band = (
    await card
      .locator('[data-slot="resolved"]')
      .textContent()
      .catch(() => null)
  )?.trim();
  const hint = await card
    .getByRole("combobox")
    .getAttribute("aria-label")
    .catch(() => null);
  on.kit.check(
    "4: comment_resolve takes pin 1 off the page and into Resolved; its row opens its thread with the pill recessed on the page, the Resolved band with Reopen, and the field saying Reply to reopen",
    left === 0 &&
      openRows === 1 &&
      resolved === 1 &&
      standing === "resolved" &&
      !!band?.startsWith("Resolved") &&
      hint === commentWords.reopenHint.full,
    `pills left ${left}; open rows ${openRows}; resolved row ${resolved}; pill ${standing}; band ${JSON.stringify(band)}; field ${hint}`
  );

  await card.getByRole("button", { name: "Reopen" }).first().click();
  const reopened = await until(
    "pin 1 reopened",
    async () => (await docOf(frame)).pins[one],
    (pin) => !pin?.resolvedAt,
    5000
  ).catch(() => null);
  // In a pane under 640px the rail is the well's foot sheet, which stands
  // aside while a thread stands: the thread closed, it is back.
  await card
    .getByRole("button", { name: "Close", exact: true })
    .click()
    .catch(() => undefined);
  await card
    .waitFor({ state: "detached", timeout: 3000 })
    .catch(() => undefined);
  const tabbed = await (
    await rowsOf(on)
  )
    .getByRole("tab", { name: OPEN_TAB })
    .click({ timeout: 5000 })
    .then(() => "pressed")
    .catch(
      async (error: Error) =>
        `not pressed (${error.message.split("\n")[0]}; rails ${await on.page.locator(RAIL).count()}; toggle ${await on.page.locator(COMMENTS_TOGGLE).getAttribute("aria-expanded")}; said ${on.said.slice(0, 2).join(" | ") || "nothing"})`
    );
  const back = await on.page
    .locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`)
    .count();
  on.kit.check(
    "4: Reopen brings pin 1 back to Open",
    !!reopened && !reopened.resolvedAt && back === 1,
    `resolvedAt ${String(reopened?.resolvedAt)}; open tab ${tabbed}; open row ${back}`
  );
};

/**
 * 4. A host that holds no doc (the app) posts `cawco:reply` and
 * `cawco:resolve` into the page: the overlay writes them on its own doc and
 * answers each with its result, a gone pin with the refusal's sentence.
 */
/**
 * A message to the page in `screen`'s pane as a host that holds no doc of
 * its own sends it (the app: `cawco:reply`, `cawco:resolve`, `cawco:delete`),
 * and the page's answer of type `type`.
 */
const askPage = async (
  screen: Page,
  frame: Frame,
  message: object,
  type: string
) => {
  const iframe = await frame.frameElement();
  const read = await readWithin(5000, () =>
    screen.evaluate(
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
          win.postMessage(sent, new URL((el as HTMLIFrameElement).src).origin);
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

const hostChecks = async (on: On, frame: Frame, one: string) => {
  const ask = (message: object, type: string) =>
    askPage(on.page, frame, message, type);
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
      .locator('svg[data-cawco-pins] g[data-pin="1"] [data-face]')
      .evaluate((face) => face.getBoundingClientRect().top + scrollY)
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
  const tail = await discAt(frame, 1);
  const onMoved = await boxIn(frame, "#para-moved").catch(() => null);
  on.kit.check(
    "5: a re-publish that moves and rewords the paragraph re-anchors pin 1 by its file:line, its pill moving down with it onto the moved paragraph",
    moved.anchor?.selector === "#para-moved" &&
      moved.anchor.source?.line === 12 &&
      after - before >= 150 &&
      !!tail &&
      !!onMoved &&
      tail.y >= onMoved.y - 2 &&
      tail.y <= onMoved.y + onMoved.h + 2,
    `${JSON.stringify(moved.anchor)}; pill top ${before} → ${after}; tail ${JSON.stringify(tail)} on ${JSON.stringify(onMoved)}`
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
  await notice
    .getByRole("button", { name: commentWords.placeElsewhere })
    .click();
  await pageInComment(frame, true);
  const during = await commentButton.getAttribute("aria-selected");
  const placingSaid =
    (await notice.textContent().catch(() => null))?.trim() ?? null;
  const cancel = await notice.getByRole("button", { name: "Cancel" }).count();
  on.kit.check(
    "5: the gone pin's row opens its card, which says the element is gone; Pin it somewhere else turns Comment on with the card still open, saying where to tap beside Cancel",
    said?.startsWith("Its element is gone from the page") === true &&
      during === "true" &&
      placingSaid?.startsWith(commentWords.placeHere) === true &&
      cancel === 1,
    `said ${JSON.stringify(said)}; Comment ${during}; then ${JSON.stringify(placingSaid)}; Cancel ${cancel}`
  );
  // The tap lands at #third's leading edge, clear of the card at the room's top-right and the panel.
  const b = await screenBox(on, frame, "#third");
  await pressFramePoint(frame, {
    x: b.x + Math.min(24, b.w / 4),
    y: b.y + b.h / 2,
  });
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

/**
 * Where pin `number`'s pill stands on its point in the outer page's
 * viewport: its tail corner (DESIGN.md, A pin's pill); null when it is not
 * drawn.
 */
const discAt = (outer: Frame, number: number) =>
  outer.evaluate((n) => {
    const g = document.querySelector<SVGGElement>(
      `svg[data-cawco-pins] g[data-pin="${n}"]`
    );
    const face = g?.querySelector("[data-face]");
    if (!(g && face)) {
      return null;
    }
    const r = face.getBoundingClientRect();
    const tail = g.getAttribute("data-tail") ?? "bottom-start";
    return {
      x: tail.endsWith("end") ? r.right : r.left,
      y: tail.startsWith("top") ? r.top : r.bottom,
    };
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
  // At rest means its pin already went: its delivery turns the pill filled, a draw of its own.
  await until(
    "the frame page's pins delivered",
    () => docOf(outer),
    (doc) =>
      Object.values(doc.pins).every(
        (pin) => !!(pin as { sentAt?: string }).sentAt
      ),
    DELIVERY_MS + QUIET_MS
  ).catch(() => undefined);
  await settle(on.page, 600);
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
    const press = await commentAt(
      on,
      outer,
      at.x,
      at.y,
      "Run it on a schedule."
    );
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
    on.kit.check(
      "b: a press on it opens its composer with the field focused, and Comment stores an anchor whose frame chain names the frame and whose inner selector ends at the button",
      !!made &&
        made.anchor.frames?.length === 1 &&
        resolves &&
        press.shown &&
        press.focused,
      `anchor ${JSON.stringify(made?.anchor)}; resolves ${resolves}; press ${JSON.stringify(press)}`
    );
    if (!made) {
      return;
    }
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
 * A component canvas as a decision page's Preview draws it (`by=embed`,
 * agent stage-host canvas/runtime.ts): each story a `cawco-frame` section
 * carrying its story, states file, state and the story's place, one under
 * another, the component's own markup in its body, and its height told to
 * the page holding it. Two stories of a toggle, Off and On, each with its
 * button; the toggle's root stamped with its call site, the button with its
 * own line. Served as a dev server's port, so it reaches the page through
 * the hub's embed origin and the machine's preview proxy (which runs the
 * overlay in it) as a component canvas's stage does; a canvas's own stage
 * runs in a boundary no workspace can make.
 */
const EMBED_CANVAS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Toggle</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui; background: #fff; color: #222; }
  .cawco-frame { padding: 20px 28px; }
  .cawco-frame + .cawco-frame { border-top: 1px solid #ddd; }
  .toggle { display: flex; align-items: center; gap: 12px; }
  button { font: inherit; padding: 6px 14px; border: 1px solid #888; border-radius: 8px; background: #f2f2f2; }
</style></head>
<body>${[
  ["Off", 6, "The lamp is dark.", "Turn on"],
  ["On", 10, "The lamp is lit.", "Turn off"],
]
  .map(
    ([story, line, words, label]) =>
      `<section class="cawco-frame" data-cawco-story="${story}" data-cawco-file="src/Toggle.stories.ts" data-cawco-interaction="rest" data-cawco-scheme="page" data-cawco-width="360" data-cawco-source="src/Toggle.stories.ts:${line}:14"><div class="cawco-frame-body"><div class="toggle" data-insp-path="src/Toggle.stories.ts:${line}:3:Toggle"><p>${words}</p><button type="button" data-insp-path="src/Toggle.svelte:9:3">${label}</button></div></div></section>`
  )
  .join("")}
<script>parent.postMessage({ type: "cawco:embed-size", height: document.documentElement.scrollHeight }, "*");</script>
</body></html>`;

/** A decision page whose card shows the canvas `canvas`, live. */
const embedProgram = (
  canvas: string
) => `root = Decisions("Pick how the toggle reads", [look])
look = Decision("look", "Does the toggle read right?", [keep, redo], "Drawn live, off and on.", [live])
keep = Option("keep", "Keep it", "It says its state in words.", true, [], "One more word on the button.")
redo = Option("redo", "Redraw it", "A new look.", false, [], "Another round.")
live = Preview("${canvas}", "The toggle, off and on")`;

/** A pin's crop round its element, px each side (agent preview-overlay pins.ts `CROP_PAD`). */
const PIN_CROP_PAD = 24;
/** The channels of a computed `rgb()` or `rgba()` colour. */
const RGB_PARTS = /\d+(?:\.\d+)?/g;

/**
 * What a pin's picture (base64 PNG) draws inside its element's box `box`,
 * the crop standing {@link PIN_CROP_PAD} round it: how many colours (each
 * channel to 8 levels a step), the most-drawn one and its share, read 2px
 * in from the box's edge so its border is left out.
 */
const elementInPicture = (png: string, box: { h: number; w: number }) => {
  const picture = PNG.sync.read(Buffer.from(png, "base64"));
  const scale = picture.width / (box.w + 2 * PIN_CROP_PAD);
  const x0 = Math.ceil((PIN_CROP_PAD + 2) * scale);
  const x1 = Math.floor((PIN_CROP_PAD + box.w - 2) * scale);
  const y0 = Math.ceil((PIN_CROP_PAD + 2) * scale);
  const y1 = Math.min(
    picture.height,
    Math.floor((PIN_CROP_PAD + box.h - 2) * scale)
  );
  const counts = new Map<string, { n: number; rgb: number[] }>();
  let all = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const at = (y * picture.width + x) * 4;
      const rgb = [0, 1, 2].map((c) => picture.data[at + c] ?? 0);
      const key = rgb.map((c) => Math.floor(c / 8)).join(",");
      const had = counts.get(key);
      counts.set(key, { n: (had?.n ?? 0) + 1, rgb: had?.rgb ?? rgb });
      all += 1;
    }
  }
  const [most] = [...counts.values()].sort((a, b) => b.n - a.n);
  return {
    w: picture.width,
    h: picture.height,
    colours: counts.size,
    most: most?.rgb ?? [],
    share: most && all > 0 ? Math.round((most.n / all) * 100) / 100 : 0,
  };
};

/** The On story, as comment_read writes a pin's sheet. */
const STORY_ON = /"story":\s*"On"/;

/** A card's Preview of another origin's canvas, on the decision page. */
const EMBED_FRAME = "iframe[data-slot=embed]";

/** The overlay's one target over the page, in the frame's viewport: its box, whether it rests (no line), and its label. */
const embedTarget = (frame: Frame) =>
  frame.evaluate(() => {
    const root = document.querySelector("cawco-overlay")?.shadowRoot;
    const rect = root?.querySelector<HTMLElement>(".rect");
    const label = root?.querySelector<HTMLElement>(".label");
    if (!rect || rect.hidden) {
      return null;
    }
    const r = rect.getBoundingClientRect();
    return {
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      rest: rect.hasAttribute("data-rest"),
      line: getComputedStyle(rect).outlineStyle,
      label: label && !label.hidden ? (label.textContent ?? "") : null,
    };
  });

/**
 * (l) A pin's picture on an embed of another origin, as the hub keeps it
 * for the delivery: drawn by the embed's own overlay, the button in it,
 * never a blank frame.
 */
const embedPictureCheck = async (
  on: On,
  embed: Frame,
  pictures: ReturnType<typeof watchPictures>,
  pinId: string,
  onButton: { h: number; w: number; x: number; y: number }
) => {
  const pictured = await until(
    "the pin's picture at the hub",
    () => pictures.posted.find((one) => one.mark === pinId),
    Boolean,
    10_000
  ).catch(() => undefined);
  pictures.stop();
  const face = await embed
    .getByRole("button", { name: "Turn off" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const drawn = pictured ? elementInPicture(pictured.png, onButton) : null;
  const want = (face.match(RGB_PARTS) ?? []).map(Number);
  on.kit.check(
    "l: the pin's picture reaches the hub drawn by the embed: inside the button's box it is not one colour (its words on its face), and its most-drawn colour is the button's face as the embed computes it (±8 a channel)",
    !!drawn &&
      drawn.colours > 1 &&
      want.length >= 3 &&
      drawn.most.every((channel, i) => Math.abs(channel - want[i]) <= 8),
    `picture ${pictured ? `${drawn?.w}×${drawn?.h}` : "none posted"}; inside the button ${JSON.stringify(drawn && { colours: drawn.colours, most: drawn.most, share: drawn.share })}; the face computed ${face}`
  );
};

/**
 * (l) The owner's report (2026-10-22, on a decision page whose cards draw
 * live component canvases: "i'm unable to comment on this stupi canvas it
 * selects the whole page"): Comment mode reaches into a Preview of another
 * origin, element by element.
 */
const embedChecks = async (on: On) => {
  const app = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(EMBED_CANVAS, { headers: { "content-type": "text/html" } }),
  });
  try {
    const made = await on.call(CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try the toggle",
      name: "toggle",
      port: app.port,
    });
    const canvas = made.match(ANSWERED_ID)?.[1];
    const posted = await on.call(CREATE, {
      kind: "page",
      does: "pick",
      ask: "Pick how the toggle reads",
      name: "toggle-pick",
      program: embedProgram(canvas ?? ""),
    });
    const pageId = posted.match(ANSWERED_ID)?.[1];
    if (!(canvas && pageId)) {
      on.kit.check(
        "l: the canvas and its decision page are made",
        false,
        `${made.slice(0, 200)} | ${posted.slice(0, 200)}`
      );
      return;
    }
    const outer = (await until(
      "the decision page's Preview in the pane",
      async () => {
        const frame = await pageFrame(on);
        return (await frame
          .locator(EMBED_FRAME)
          .count()
          .catch(() => 0)) === 1
          ? frame
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
    const embed = (await until(
      "the canvas's two stories in the Preview",
      async () => {
        const handle = await outer
          .locator(EMBED_FRAME)
          .elementHandle()
          .catch(() => null);
        const inner = await handle?.contentFrame();
        return inner && (await inner.locator("button").count()) === 2
          ? inner
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
    await outer.locator(EMBED_FRAME).scrollIntoViewIfNeeded();
    await settle(on.page, 600);
    await paneMode(on, outer, "C");

    const pane = await on.page.locator(FRAME).boundingBox();
    /** A story's button in the page's viewport: the embed's content box plus the button's own box in it. */
    const buttonBox = async (label: string) => {
      const frame = await outer.locator(EMBED_FRAME).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + el.clientLeft, y: r.y + el.clientTop };
      });
      const own = await embed
        .getByRole("button", { name: label })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
      return { x: frame.x + own.x, y: frame.y + own.y, w: own.w, h: own.h };
    };
    const embedBox = await outer.locator(EMBED_FRAME).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!pane) {
      on.kit.check("l: the pane's page has a box", false, "none");
      return;
    }

    // Across the embed, from its top-left corner in to the On story's
    // button, the target read at every step: never the page as a whole.
    const off = await buttonBox("Turn on");
    const onButton = await buttonBox("Turn off");
    const start = { x: pane.x + embedBox.x + 6, y: pane.y + embedBox.y + 6 };
    const end = {
      x: pane.x + onButton.x + onButton.w * 0.4,
      y: pane.y + onButton.y + onButton.h / 2,
    };
    await on.page.mouse.move(pane.x + embedBox.x - 30, start.y);
    const labels: string[] = [];
    const STEPS = 14;
    for (let i = 0; i <= STEPS; i += 1) {
      const t = i / STEPS;
      // biome-ignore lint/performance/noAwaitInLoops: one pointer step at a time, the target read after each
      await on.page.mouse.move(
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t
      );
      await settle(on.page, 60);
      labels.push((await embedTarget(outer))?.label ?? "(none)");
    }
    on.kit.check(
      `l: in Comment mode, moving across a canvas Preview of another origin never names the whole page, and a story's frame reads by its story ("Story Off", "Story On"), never by its section (${STEPS + 1} steps read)`,
      !(
        labels.includes(commentWords.wholePage) ||
        labels.some((one) => one.startsWith("section"))
      ) &&
        labels.includes("Story Off") &&
        labels.includes("Story On"),
      labels.join(" | ")
    );

    // Resting on each story's button washes that button, its box mapped into the page.
    const restOn = async (box: typeof off) => {
      await on.page.mouse.move(
        pane.x + box.x + box.w * 0.4,
        pane.y + box.y + box.h / 2,
        { steps: 3 }
      );
      return await until(
        "the target on the button",
        () => embedTarget(outer),
        (now) => near(now?.box ?? null, box, 1),
        5000
      ).catch(() => embedTarget(outer));
    };
    const washes = (
      now: Awaited<ReturnType<typeof embedTarget>>,
      box: typeof off,
      label: string
    ) => !!now && near(now.box, box, 1) && now.rest && now.label === label;
    const onOff = await restOn(off);
    const onOn = await restOn(onButton);
    on.kit.check(
      `l: resting on the Off story's button, then the On story's, inside the Preview washes each button: the target's box is the button's box mapped into the page (±1px), at rest (no line), its label naming the button by its own words and line (button "Turn on" — src/Toggle.svelte:9, button "Turn off" — …), so the two read apart`,
      washes(onOff, off, 'button "Turn on" — src/Toggle.svelte:9') &&
        washes(onOn, onButton, 'button "Turn off" — src/Toggle.svelte:9'),
      `Off ${JSON.stringify(onOff)} vs ${JSON.stringify(off)}; On ${JSON.stringify(onOn)} vs ${JSON.stringify(onButton)}`
    );

    // A press on it opens the composer there: the button chosen, its line drawn.
    const before = Object.keys((await docOf(outer)).pins).length;
    const pictures = watchPictures(on.page);
    await pressFramePoint(outer, end);
    const composer = on.page.locator(COMPOSE);
    const shown = await composer
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const chosen = await embedTarget(outer);
    on.kit.check(
      "l: a press on the On story's button opens the composer, the button the one target chosen: its box (±1px), its 1px line drawn, no label",
      shown &&
        !!chosen &&
        near(chosen.box, onButton, 1) &&
        !chosen.rest &&
        chosen.line === "solid" &&
        chosen.label === null,
      `composer ${shown}; target ${JSON.stringify(chosen)}`
    );
    if (shown) {
      await composer.getByRole("combobox").fill("Say whether it is on.");
      await on.page.keyboard.press("Enter");
      await composer
        .waitFor({ state: "detached", timeout: 8000 })
        .catch(() => undefined);
    }
    const pins = await until(
      "the embed's pin in the page's doc",
      async () => (await docOf(outer)).pins,
      (all) => Object.keys(all).length > before,
      10_000
    ).catch(() => ({}) as Pins);
    const pin = Object.values(pins).sort(
      (a, b) => Number(b.number) - Number(a.number)
    )[0] as
      | {
          anchor: {
            embed?: { artifact: string };
            frames?: string[];
            selector: string;
            sheet?: { file: string; story: string };
            source?: { file?: string; line?: number };
          };
          id: string;
          number: number;
        }
      | undefined;
    const found = pin
      ? await embed.evaluate(
          (selector) => document.querySelector(selector)?.textContent ?? null,
          pin.anchor.selector
        )
      : null;
    on.kit.check(
      "l: the comment's pin stands on the button in the embed: its anchor names the canvas, the story On of its states file, the button's own source line, the frame it is in, and a selector that finds the button in the canvas",
      !!pin &&
        pin.anchor.embed?.artifact === canvas &&
        pin.anchor.sheet?.story === "On" &&
        pin.anchor.sheet.file === "src/Toggle.stories.ts" &&
        pin.anchor.source?.file === "src/Toggle.svelte" &&
        pin.anchor.frames?.length === 1 &&
        found === "Turn off",
      `anchor ${JSON.stringify(pin?.anchor)}; the selector finds ${JSON.stringify(found)}`
    );
    if (!pin) {
      return;
    }
    const disc = await until(
      "the pin's pill on the button",
      () => discAt(outer, pin.number),
      (now) =>
        !!now &&
        Math.abs(now.x - (end.x - pane.x)) <= 2 &&
        Math.abs(now.y - (end.y - pane.y)) <= 2,
      8000
    ).catch(() => discAt(outer, pin.number));
    on.kit.check(
      "l: its pill's tail stands on the point pressed on the button (±2px)",
      !!disc &&
        Math.abs(disc.x - (end.x - pane.x)) <= 2 &&
        Math.abs(disc.y - (end.y - pane.y)) <= 2,
      `tail ${JSON.stringify(disc)}; pressed ${JSON.stringify({ x: end.x - pane.x, y: end.y - pane.y })}`
    );

    await embedPictureCheck(on, embed, pictures, pin.id, onButton);

    await paneMode(on, outer, "V");
    const read = await on.call(READ, { artifact: pageId, filter: "all" });
    on.kit.check(
      "l: comment_read of the decision page answers the pin with the canvas's id, its story and the button",
      read.includes(pin.id) &&
        new RegExp(`"embed":\\s*\\{\\s*"artifact":\\s*"${canvas}"`).test(
          read
        ) &&
        STORY_ON.test(read) &&
        read.includes("src/Toggle.svelte") &&
        read.includes("Turn off"),
      read.slice(read.indexOf("{"), read.indexOf("{") + 900)
    );
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
    await commentAt(on, outer, tap.x, tap.y, "This desk.");
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
    await on.page.keyboard.press("Escape");
    await settle(on.page, 300);
    const disc = await discAt(outer, made.number);
    const scroll = await outer.evaluate(() => ({ x: scrollX, y: scrollY }));
    const want = inPane(half);
    const at = { x: tap.x - pane.x, y: tap.y - pane.y };
    const { box } = made.anchor;
    on.kit.check(
      "h: a comment pressed on the half-scale transcript stores its box on screen (±1px) under its frame chain, and its pill's tail stands at the pressed point (±2px)",
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
  /** A press on the page at the screen's `x`, `y` in Comment mode, written and commented: the new pin's number, and its composer as it opened. */
  const tapPin = async (x: number, y: number) => {
    const held = Object.keys(await numbersNow()).length;
    const press = await commentAt(on, frame, x, y, "Keep this pin.");
    const now = await until(
      "the tapped pin in the doc",
      numbersNow,
      (pins) => Object.keys(pins).length > held,
      10_000
    ).catch(numbersNow);
    const number = Math.max(...Object.values(now));
    return { number, ...press };
  };
  // The second press of the run, then a third made while the second's thread
  // is open, on the page below that thread.
  const second = await screenBox(on, frame, "#second");
  const tapped = [
    await tapPin(second.x + second.w * 0.7, second.y + second.h / 2),
  ];
  const thread = await openThread(on, frame, tapped[0].number);
  const openCard = await thread.boundingBox().catch(() => null);
  const tall = await screenBox(on, frame, ".tall");
  tapped.push(
    await tapPin(
      tall.x + 20,
      Math.max(tall.y + 10, (openCard?.y ?? 0) + (openCard?.height ?? 0) + 20)
    )
  );
  on.kit.check(
    "a: the second press, and a third made while the second's thread is open, each open their composer with its field focused, and Comment writes the next numbers",
    tapped.length === 2 &&
      tapped[1].number === tapped[0].number + 1 &&
      tapped.every((one) => one.shown && one.focused && one.gone),
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
  // The head holds the name and what acts on the pin (Resolve, Delete, ⋯, Close) on its row; the foot is the chat composer as the reply.
  const parts = await card.evaluate((el) => {
    const head = el.querySelector('[data-slot="head"]');
    const named = [...(head?.querySelectorAll("button[aria-label]") ?? [])].map(
      (button) => button.getAttribute("aria-label") ?? ""
    );
    const tops = [...(head?.querySelectorAll("button[aria-label]") ?? [])].map(
      (button) => Math.round(button.getBoundingClientRect().top)
    );
    const foot = el.querySelector('[data-slot="foot"]');
    return {
      named,
      tops,
      foot: [...(foot?.querySelectorAll("button[aria-label]") ?? [])].map(
        (button) => button.getAttribute("aria-label") ?? ""
      ),
      composer: !!foot?.querySelector(
        '[data-slot="comment-composer"] [data-slot="dock"]'
      ),
    };
  });
  on.kit.check(
    "c: the thread's head holds Resolve, Delete comment, its ⋯ and Close on one row with the name; its foot is the chat composer, Attach and the Reply glyph",
    parts.named[0] === "Resolve" &&
      parts.named[1] === commentWords.deleteComment &&
      parts.named.at(-1) === "Close" &&
      parts.named.length === 4 &&
      new Set(parts.tops).size === 1 &&
      parts.composer &&
      parts.foot.includes("Attach a file or image") &&
      parts.foot.includes("Reply"),
    JSON.stringify(parts)
  );
  await card.locator('[data-slot="head"] [data-slot="delete"]').click();
  const ask = card.locator('[data-ask="delete"]');
  const asked = await ask
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const blocking = await on.page.evaluate(
    () => document.querySelectorAll("dialog[open], [aria-modal='true']").length
  );
  await ask.getByRole("button", { name: commentWords.deleteComment }).click();
  const after = await until(
    "the pin gone from the doc",
    numbersNow,
    (pins) => !!doomed && !(doomed in pins),
    5000
  ).catch(numbersNow);
  const disc = await frame
    .locator(`svg[data-cawco-pins] g[data-pin="${target}"]`)
    .count();
  await card
    .waitFor({ state: "detached", timeout: 3000 })
    .catch(() => undefined);
  const cardLeft = await card.count();
  const kept = Object.entries(before).filter(([id]) => id !== doomed);
  on.kit.check(
    "c: Delete, one press in the head, asks in the thread itself (no blocking dialog); confirming removes the pin from the doc and its pill from the page, closes its thread, and every other pin keeps its number",
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
  const card = await commentAt(
    on,
    frame,
    pane.x + tap.x,
    pane.y + tap.y,
    "This card, not the first."
  );
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
  const pinCard = await openThread(on, frame, pin?.number ?? 0);
  await pinCard.getByRole("combobox").fill("And this one too.");
  await pinCard.getByRole("button", { name: "Reply" }).click();
  const kept = await until(
    "the reply on the card's pin",
    async () =>
      (
        (await docOf(frame)).pins[pin?.id ?? ""] as
          { thread?: unknown[] } | undefined
      )?.thread?.length ?? 0,
    (count) => count === 2,
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
    `d (${scroller}): scrolled to the middle, the hover outline over card ${n} is its box, a press opens its composer focused and Comment pins it, its thread opens from its pill and a reply is kept, and the ${scroller}'s offset never moves (0px) through it all; the outline is still the card's box`,
    near(hovered, box, 1) &&
      !!pin &&
      card.shown &&
      card.focused &&
      card.gone &&
      kept === 2 &&
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
 * (e) Pick 1's "nothing typed means nothing saved", on the cards page the
 * pane shows last: a press opens a composer and writes nothing, so Esc, a
 * press outside it (on the pane's chrome, elsewhere in the dashboard, on
 * the page out of Comment mode), a mode switch and a reload each leave no
 * pin; the words typed stay for the next composer, there when it opens
 * again; a press on a pin's pill opens that pin's thread in the composer's
 * place.
 */
const dismissChecks = async (on: On) => {
  let frame = await pageFrame(on);
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  const composer = on.page.locator(COMPOSE);
  const pinsNow = async () =>
    Object.keys((await docOf(frame)).pins as Pins).length;
  const pressAt = async () => {
    const pane = await on.page.locator(FRAME).boundingBox();
    const box = await boxIn(frame, '.card[data-n="9"]');
    return {
      x: (pane?.x ?? 0) + box.x + box.w * 0.7,
      y: (pane?.y ?? 0) + box.y + box.h * 0.5,
    };
  };
  await frame.evaluate(() =>
    document
      .querySelector('.card[data-n="9"]')
      ?.scrollIntoView({ block: "center" })
  );
  const held = await pinsNow();
  const left: Record<string, { composer: number; pins: number }> = {};
  const after = async (how: string) => {
    await settle(on.page, 300);
    left[how] = {
      composer: await composer.count(),
      pins: (await pinsNow()) - held,
    };
  };
  const openComposer = async () => {
    if ((await comment.getAttribute("aria-selected")) !== "true") {
      await comment.click();
      await pageInComment(frame, true);
    }
    // The card in view each time, as a person scrolls to it: a reload or a
    // mode switch leaves the page at its top, the card below the pane's foot,
    // where a press reaches nothing (kit pressAt says so).
    await frame.evaluate(() =>
      document
        .querySelector('.card[data-n="9"]')
        ?.scrollIntoView({ block: "center" })
    );
    await settle(on.page, 150);
    const at = await pressAt();
    return commentAt(on, frame, at.x, at.y, null);
  };
  // Esc.
  await openComposer();
  await composer
    .getByRole("combobox")
    .fill("Kept for the next one.")
    .catch(() => undefined);
  await on.page.keyboard.press("Escape");
  await after("Esc");
  // The next composer has the words.
  await openComposer();
  const keptWords = (
    await composer
      .getByRole("combobox")
      .textContent()
      .catch(() => null)
  )?.trim();
  // A press on the pane's chrome (its head's name).
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-slot="name-lead"]'
    )
    .first()
    .click({ trial: false })
    .catch(() => undefined);
  await on.page.keyboard.press("Escape").catch(() => undefined);
  await after("a press on the pane's chrome");
  // A press elsewhere in the dashboard.
  await openComposer();
  await on.page.mouse.click(4, 300);
  await after("a press elsewhere in the dashboard");
  // A mode switch.
  await openComposer();
  await on.page
    .locator(
      ":is([data-slot=\"preview-pane\"], [data-side-card=\"preview\"]) [role='tab'][aria-keyshortcuts='D']"
    )
    .click();
  await after("a mode switch");
  // A reload of the page.
  await openComposer();
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-label="Reload"]'
    )
    .click();
  frame = (await until(
    "the page again",
    async () => {
      const now = await pageFrame(on);
      return (await now
        .locator(".card")
        .count()
        .catch(() => 0)) > 0
        ? now
        : null;
    },
    Boolean,
    30_000
  )) as Frame;
  await after("a reload");
  // The Reload press stood outside the composer: its draft parked first, and the reload keeps it parked (The Work Outlives Its Surface Rule).
  const parkedPill = await until(
    "the parked draft after the reload",
    () =>
      frame
        .locator('svg[data-cawco-pins] g[data-pin="new"][data-parked]')
        .count(),
    (count) => count === 1,
    10_000
  ).catch(() => 0);
  on.kit.check(
    "e: a press writes nothing: Esc, a press on the pane's chrome or elsewhere in the dashboard, a mode switch and a press on Reload each close the composer and leave no pin; the half-written draft stands parked after the reload",
    Object.values(left).length === 5 &&
      Object.values(left).every(
        (one) => one.composer === 0 && one.pins === 0
      ) &&
      parkedPill === 1,
    `${JSON.stringify(left)}; parked pills after the reload ${parkedPill}`
  );
  on.kit.check(
    "e: the words typed in a composer closed unsaid are back in the next one",
    keptWords === "Kept for the next one.",
    JSON.stringify(keptWords)
  );
  // A press on a pin's pill while a composer stands opens that pin's thread in its place.
  const someone = Object.values((await docOf(frame)).pins as Pins)[0] as
    { number: number } | undefined;
  await interactTab(on).click();
  await pageInComment(frame, false);
  if (someone) {
    await openComposer();
    await openThread(on, frame, someone.number);
  }
  // The composer goes over `--dur-control` (PinFloat's `out:fade`): it is
  // counted once that fade has had its time, not in the frame the card came.
  const swapped = {
    composer: await until(
      "the composer gone",
      () => composer.count(),
      (count) => count === 0,
      3000
    ).catch(() => composer.count()),
    thread: someone
      ? await on.page
          .locator(`[data-slot="pin-card"][data-pin-card="${someone.number}"]`)
          .count()
      : 0,
  };
  on.kit.check(
    "e: a press on a pin's pill while a composer stands opens that pin's thread in the composer's place",
    !!someone && swapped.composer === 0 && swapped.thread === 1,
    JSON.stringify({ someone, ...swapped })
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
};

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
      field: box(el.querySelector('[role="combobox"]')),
    };
  });
  // The head's Resolve and the foot's Reply by their accessible names: a
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
    resolve: await boxOf("Resolve"),
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
    "f: with a thread longer than the card's cap, only the thread scrolls (its room overflows, the card does not), opened at its newest entry, and Resolve, the Reply glyph and the reply's field stand inside the card's box",
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

  // Squeezed: the card's room cut to 110px, less than its head and foot
  // alone (a phone's keyboard over a short well). The thread keeps its whole
  // height in the card's own scroll, never shrunk to nothing.
  await on.page.evaluate(() => {
    const room = document.querySelector<HTMLElement>('[data-slot="pin-room"]');
    room?.style.setProperty("bottom", "auto");
    room?.style.setProperty("height", "110px");
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

/**
 * A thread's title as drawn: its glyphs' box (the text's own range) against
 * the box that clips it (the name control's padding box), and its
 * line-height against the label role's (a probe set in `type-label`). The
 * head is a mark line, which trims each run of words to its x-height and
 * pads the room back: a run whose padding is taken from it clips its
 * ascenders and descenders.
 */
const titleFits = (card: Locator) =>
  card.evaluate((el) => {
    const name = el.querySelector<HTMLElement>(
      '[data-slot="head"] [data-slot="name"]'
    );
    const text = name?.firstChild;
    if (!(name && text)) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(name);
    const glyphs = range.getBoundingClientRect();
    const clip = name.getBoundingClientRect();
    const probe = document.createElement("span");
    probe.className = "type-label";
    probe.textContent = "x";
    document.body.append(probe);
    const role = Number.parseFloat(getComputedStyle(probe).lineHeight);
    probe.remove();
    const style = getComputedStyle(name);
    return {
      text: name.textContent?.trim() ?? "",
      glyphs: Math.round(glyphs.height * 100) / 100,
      clip: name.clientHeight,
      top: Math.round((glyphs.top - clip.top) * 100) / 100,
      bottom: Math.round((clip.bottom - glyphs.bottom) * 100) / 100,
      lineHeight: Number.parseFloat(style.lineHeight),
      role,
      overflow: style.overflowY,
    };
  });
type TitleRead = Awaited<ReturnType<typeof titleFits>>;
/** The title stands whole in its box: its glyphs inside what clips them, at the label role's line-height or more. */
const titleWhole = (read: TitleRead) =>
  !!read &&
  read.glyphs <= read.clip + 0.5 &&
  read.top >= -0.5 &&
  read.bottom >= -0.5 &&
  read.lineHeight >= read.role - 0.01;

/**
 * Entry `index` of a thread as its words wrap: its words' \`text-wrap\`, its
 * lines (the words' range's line boxes), and the baselines of its first
 * line and of its age (each a zero-size inline mark set at its baseline).
 */
const entryRead = (card: Locator, index: number) =>
  card.evaluate((el, at) => {
    const entry = el.querySelectorAll('[data-slot="entry"]')[at];
    const words = entry?.querySelector(".max-w-c-measure");
    const age = entry?.querySelector('[data-turn-who] [data-slot="when"]');
    if (!(entry && words && age)) {
      return null;
    }
    const baseline = (host: Element, first: boolean) => {
      const mark = document.createElement("span");
      mark.style.cssText =
        "display:inline-block;width:0;height:0;vertical-align:baseline";
      const block = first ? (host.querySelector("p") ?? host) : host;
      if (first) {
        block.prepend(mark);
      } else {
        block.append(mark);
      }
      const y = mark.getBoundingClientRect().top;
      mark.remove();
      return y;
    };
    const firstLine = baseline(words, true);
    const ageLine = baseline(age, false);
    const range = document.createRange();
    range.selectNodeContents(words);
    const tops = [
      ...new Set(
        [...range.getClientRects()]
          .filter((r) => r.width > 0)
          .map((r) => Math.round(r.top))
      ),
    ];
    // The wrap its paragraph takes (the transcript's words keep `stable`).
    const style = getComputedStyle(words.querySelector("p") ?? words);
    const lastLine = [...range.getClientRects()].filter(
      (r) => r.width > 0 && Math.round(r.top) === tops.at(-1)
    );
    return {
      text: words.textContent?.trim() ?? "",
      wrap:
        (style as CSSStyleDeclaration & { textWrapStyle?: string })
          .textWrapStyle ?? style.getPropertyValue("text-wrap"),
      lines: tops.length,
      lastLineWidth: Math.round(lastLine.reduce((sum, r) => sum + r.width, 0)),
      baselines: Math.round(Math.abs(firstLine - ageLine) * 100) / 100,
      age: age.textContent?.trim() ?? "",
    };
  }, index);

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
  await commentAt(on, frame, b.x + b.w / 2, b.y + b.h / 2, null);
  const chip = (
    await on.page
      .locator(`${COMPOSE} [data-slot="target-chip"] [data-slot="chip-label"]`)
      .textContent()
      .catch(() => null)
  )?.trim();
  await on.page
    .locator(COMPOSE)
    .getByRole("combobox")
    .fill("Too pale.")
    .catch(() => undefined);
  await on.page.keyboard.press("Enter");
  await until(
    "the badge's pin in the doc",
    async () => Object.keys((await docOf(frame)).pins).length,
    (count) => count === 1,
    10_000
  ).catch(() => 0);
  await settle(on.page, 300);
  const card = await openThread(on, frame, 1);
  await settle(on.page, 300);
  const head = await headOf(card);
  const selector = String(
    (
      Object.values((await docOf(frame)).pins)[0] as
        { anchor?: { selector?: string } } | undefined
    )?.anchor?.selector ?? "#none"
  );
  on.kit.check(
    "7: a comment on an element with no text is named by its component (StatusBadge.svelte → \"Status badge\"), in the composer's target chip and in its thread's head, never by its selector",
    chip === "Status badge" &&
      head.name === "Status badge" &&
      !head.shown.includes(selector),
    `chip ${JSON.stringify(chip)}; ${JSON.stringify(head)}; selector ${selector}`
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
};

/** Four corners of `px`, as computed styles read them clockwise from the top left. */
const fourCorners = (px: string) => `${px} ${px} ${px} ${px}`;
/** Each element's own corners, and the overlay's over it: its own, or the overlay's `--radius-xs` (5px) for a square block. */
const CORNERS_WANTED: Record<string, { element: string; outline: string }> = {
  "#field": { element: fourCorners("10px"), outline: fourCorners("10px") },
  "#pill": { element: fourCorners("9999px"), outline: fourCorners("9999px") },
  "#block": { element: fourCorners("0px"), outline: fourCorners("5px") },
};

/**
 * 7b. The owner's report (2026-10-21: "non-round selection rectangles? is
 * this 1995?"): Comment mode's mark takes each element's own corners: a 10px
 * field, a pill, and a 0-radius block (the house's smallest radius, never a
 * square); its line sits at offset 0 on the border box (The One Target Rule),
 * so the line's corners are the element's own.
 */
const cornerChecks = async (on: On) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "corners",
    html: `<!doctype html><html><head><style>body { margin: 0; } main { padding: 24px; display: grid; gap: 32px; justify-items: start; }</style></head>
<body><main>
  <input id="field" placeholder="A field" style="width: 240px; height: 40px; border: 1px solid #888; border-radius: 10px">
  <button id="pill" style="padding: 8px 20px; border: 0; border-radius: 9999px; background: #d8d4cc">A pill</button>
  <div id="block" style="width: 200px; height: 80px; background: #d8d4cc">A block</div>
</main></body></html>`,
  });
  const frame = (await until(
    "the corners page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("#block")
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
  for (const selector of ["#field", "#pill", "#block"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one element hovered after the other
    const b = await screenBox(on, frame, selector);
    await on.page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await settle(on.page, 150);
    const seen = await frame.evaluate((sel) => {
      const corners = (of: CSSStyleDeclaration) =>
        [
          of.borderTopLeftRadius,
          of.borderTopRightRadius,
          of.borderBottomRightRadius,
          of.borderBottomLeftRadius,
        ].join(" ");
      const rect = document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector<HTMLElement>(".rect");
      const el = document.querySelector(sel);
      if (!(rect && el) || rect.hidden) {
        return null;
      }
      const drawn = getComputedStyle(rect);
      return {
        element: corners(getComputedStyle(el)),
        outline: corners(drawn),
        offset: drawn.outlineOffset,
      };
    }, selector);
    const { element, outline } = CORNERS_WANTED[selector];
    on.kit.check(
      `7b: hovering ${selector} (corners ${element}) in Comment mode marks it with corners ${outline}, its line's offset 0`,
      seen?.element === element &&
        seen.outline === outline &&
        seen.offset === "0px",
      JSON.stringify(seen)
    );
  }
  await on.page.keyboard.press("Escape");
};

/** The overlay's one target as the frame computes it, with the tokens it should read, resolved in the overlay's own shadow root. */
const targetOf = (frame: Frame) =>
  frame.evaluate(() => {
    const shadow = document.querySelector("cawco-overlay")?.shadowRoot;
    const rect = shadow?.querySelector<HTMLElement>(".rect");
    const label = shadow?.querySelector<HTMLElement>(".label");
    if (!(shadow && rect)) {
      return null;
    }
    const token = (name: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      shadow.append(probe);
      const { color } = getComputedStyle(probe);
      probe.remove();
      return color;
    };
    /** The overlay's tint, `c-target-tint` (the opaque brand-wash would hide the element's words). */
    const tinted = () => {
      const probe = document.createElement("span");
      probe.style.color = "var(--c-target-tint)";
      shadow.append(probe);
      const { color } = getComputedStyle(probe);
      probe.remove();
      return color;
    };
    const drawn = getComputedStyle(rect);
    const r = rect.getBoundingClientRect();
    return {
      shown: !rect.hidden,
      rest: rect.hasAttribute("data-rest"),
      root: rect.hasAttribute("data-root"),
      style: drawn.outlineStyle,
      width: drawn.outlineWidth,
      color: drawn.outlineColor,
      offset: drawn.outlineOffset,
      background: drawn.backgroundColor,
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      label: label && !label.hidden ? label.textContent : null,
      brand: token("--brand-solid"),
      tint: tinted(),
    };
  });

/**
 * Every coral mark in the frame's document and the overlay's shadow root: an
 * outline, a border side or a box-shadow whose colour is coral (hue within
 * 0–40° or past 345°, saturated, mid-light, not clear), with its width.
 */
const coralMarks = (frame: Frame) =>
  frame.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    const rgbOf = (color: string) => {
      paint?.clearRect(0, 0, 1, 1);
      if (paint) {
        paint.fillStyle = "#000";
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
      }
      const [r, g, b, a] = paint?.getImageData(0, 0, 1, 1).data ?? [0, 0, 0, 0];
      return { r: r / 255, g: g / 255, b: b / 255, a };
    };
    const hueOf = (r: number, g: number, b: number, max: number, d: number) => {
      if (max === r) {
        return (360 + 60 * (((g - b) / d) % 6)) % 360;
      }
      return max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    };
    const coral = (color: string): boolean => {
      const { r, g, b, a } = rgbOf(color);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (a === 0 || d === 0) {
        return false;
      }
      const sat = d / (1 - Math.abs(2 * l - 1));
      const hue = hueOf(r, g, b, max, d);
      return (hue <= 40 || hue >= 345) && sat > 0.35 && l > 0.25 && l < 0.85;
    };
    const shadowRoot = document.querySelector("cawco-overlay")?.shadowRoot;
    const all = [
      ...document.querySelectorAll("*"),
      ...(shadowRoot ? shadowRoot.querySelectorAll("*") : []),
    ];
    const marks: { el: string; kind: string; width: number }[] = [];
    const COLOR =
      /(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/gi;
    const nameOf = (el: Element) =>
      [
        el.localName,
        el.id ? `#${el.id}` : "",
        ...[...el.classList].map((c) => `.${c}`),
      ].join("");
    const sides = (style: CSSStyleDeclaration, name: string) => {
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        const width = Number.parseFloat(style[`border${side}Width`]) || 0;
        if (
          style[`border${side}Style`] !== "none" &&
          width > 0 &&
          coral(style[`border${side}Color`])
        ) {
          marks.push({ el: name, kind: `border-${side.toLowerCase()}`, width });
        }
      }
    };
    const marksOf = (el: Element) => {
      const style = getComputedStyle(el);
      const name = nameOf(el);
      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
      if (
        style.outlineStyle !== "none" &&
        outlineWidth > 0 &&
        coral(style.outlineColor)
      ) {
        marks.push({ el: name, kind: "outline", width: outlineWidth });
      }
      sides(style, name);
      if (
        style.boxShadow !== "none" &&
        (style.boxShadow.match(COLOR) ?? []).some(coral)
      ) {
        marks.push({ el: name, kind: "box-shadow", width: Number.NaN });
      }
    };
    for (const el of all) {
      if (!(el instanceof HTMLElement && el.hidden)) {
        marksOf(el);
      }
    }
    return marks;
  });

/**
 * The chosen element's text against its background under the overlay's tint,
 * by day and by night: the tint blended over the element's own background,
 * then WCAG 2 contrast with its text (the page's root drawn in each scheme).
 */
const textUnderTint = (frame: Frame, selector: string) =>
  frame.evaluate((sel) => {
    const shadow = document.querySelector("cawco-overlay")?.shadowRoot;
    const el = document.querySelector(sel);
    const paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (!(shadow && el && paint)) {
      return null;
    }
    const pixel = (...layers: string[]) => {
      paint.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        paint.fillStyle = "#000";
        paint.fillStyle = layer;
        paint.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const root = document.documentElement;
    const was = root.style.colorScheme;
    const out: Record<string, number> = {};
    for (const scheme of ["light", "dark"] as const) {
      root.style.colorScheme = scheme;
      const own = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.colorScheme = scheme;
      probe.style.color = "var(--c-target-tint)";
      shadow.append(probe);
      const { color: tint } = getComputedStyle(probe);
      probe.remove();
      const text = lum(pixel(own.backgroundColor, own.color));
      const ground = lum(pixel(own.backgroundColor, tint));
      out[scheme === "light" ? "day" : "night"] =
        Math.round(
          ((Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)) *
            100
        ) / 100;
    }
    root.style.colorScheme = was;
    return out;
  }, selector);

/** WCAG 2 contrast of `brand-solid` on the page field (`surface-page`) and on raised (`surface-raised`), by day and by night, in the dashboard's own tokens. */
const lineContrast = (on: On) =>
  on.page.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    const rgba = (color: string) => {
      paint?.clearRect(0, 0, 1, 1);
      if (paint) {
        paint.fillStyle = "#000";
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
      }
      const [r, g, b, a] = paint?.getImageData(0, 0, 1, 1).data ?? [0, 0, 0, 0];
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: number, b: number) =>
      Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) /
      100;
    const root = document.documentElement;
    const was = {
      dark: root.classList.contains("dark"),
      scheme: root.style.colorScheme,
    };
    const out: Record<
      string,
      { field: number; raised: number; alphas: number[] }
    > = {};
    for (const scheme of ["light", "dark"] as const) {
      root.classList.toggle("dark", scheme === "dark");
      root.style.colorScheme = scheme;
      const read = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const { color } = getComputedStyle(probe);
        probe.remove();
        return rgba(color);
      };
      const line = read("--brand-solid");
      const field = read("--surface-page");
      const raised = read("--surface-raised");
      out[scheme === "light" ? "day" : "night"] = {
        field: ratio(lum(line), lum(field)),
        raised: ratio(lum(line), lum(raised)),
        alphas: [line.a, field.a, raised.a],
      };
    }
    root.classList.toggle("dark", was.dark);
    root.style.colorScheme = was.scheme;
    return out;
  });

/** 7c. The One Target Rule: rest, the page's root, chosen, the one coral mark, the composer's ring. */
const targetChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "targets",
    html: `<!doctype html><html><head><style>body { margin: 0; font: 16px/1.5 system-ui; } main { padding: 24px; } #bare { width: 320px; margin: 16px 0 0; } #target { width: 320px; margin: 0; padding: 8px 12px; border-radius: 10px; color: light-dark(#1d1b18, #ece8e1); background: light-dark(#f1ede6, #2a2724); } .space { height: 1400px; }</style></head>
<body><main>
  <p id="target">A paragraph to choose as the one target.</p>
  <p id="bare">Bare words, no box of their own.</p>
  <div class="space"></div>
</main></body></html>`,
  });
  const frame = (await until(
    "the targets page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("#target")
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

  const b = await screenBox(on, frame, "#target");
  await on.page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
  await settle(on.page, 150);
  const rest = await targetOf(frame);
  const own = await boxIn(frame, "#target");
  on.kit.check(
    "7c: resting on an element in Comment mode tints it (c-target-tint) and draws no line, its label shown",
    !!rest &&
      rest.shown &&
      rest.rest &&
      !rest.root &&
      rest.style === "none" &&
      rest.background === rest.tint &&
      !!rest.label &&
      near(rest.box, own, 1),
    JSON.stringify(rest)
  );

  const ground = await screenBox(on, frame, ".space");
  await on.page.mouse.move(ground.x + ground.w / 2, ground.y + 300);
  await settle(on.page, 150);
  const root = await targetOf(frame);
  on.kit.check(
    "7c: the page's root takes a 1px dashed brand-solid line, its outer edge 4px (space-1) inside the page's edge (offset -5px), no background",
    !!root &&
      root.shown &&
      root.root &&
      root.style === "dashed" &&
      root.width === "1px" &&
      root.offset === "-5px" &&
      root.color === root.brand &&
      root.background === "rgba(0, 0, 0, 0)",
    JSON.stringify(root)
  );
  on.kit.check(
    "7c: at rest the page's root shows its label, which reads commentWords.wholePage",
    !!root && root.root && root.label === commentWords.wholePage,
    JSON.stringify(root)
  );

  // The page's root chosen: its composer opens on the whole page, its line
  // kept and its label gone, as any target's.
  const rootComposer = await commentAt(
    on,
    frame,
    ground.x + ground.w / 2,
    ground.y + 300,
    null
  );
  const rootChosen = await until(
    "the page's root chosen",
    () => targetOf(frame),
    (seen) => !!seen?.root && seen.label === null,
    5000
  ).catch(() => targetOf(frame));
  on.kit.check(
    "7c: the page's root chosen keeps its dashed line and carries no label",
    rootComposer.shown &&
      !!rootChosen &&
      rootChosen.shown &&
      rootChosen.root &&
      rootChosen.style === "dashed" &&
      rootChosen.width === "1px" &&
      rootChosen.label === null,
    JSON.stringify({ rootComposer, rootChosen })
  );
  await on.page.keyboard.press("Escape");
  await until(
    "the root's composer closed, nothing written",
    () => on.page.locator(COMPOSE).count(),
    (count) => count === 0,
    5000
  ).catch(() => null);

  const opened = await commentAt(on, frame, b.x + b.w / 2, b.y + b.h / 2, null);
  await settle(on.page, 300);
  const chosen = await until(
    "the target chosen",
    () => targetOf(frame),
    (seen) => !!seen && !seen.rest && seen.style === "solid",
    5000
  ).catch(() => targetOf(frame));
  // The one composer or thread open at a time: its field, and the chat
  // composer's pill (`cin`), which draws no ring round its field.
  const field = on.page
    .locator(':is([data-slot="pin-composer"], [data-slot="pin-card"])')
    .getByRole("combobox");
  const readRing = (
    holder = ':is([data-slot="pin-composer"], [data-slot="pin-card"])'
  ) =>
    on.page
      .locator(`${holder} form[data-slot="cin"]`)
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const probe = document.createElement("span");
        probe.style.color = "var(--focus-ring)";
        document.body.append(probe);
        const ring = getComputedStyle(probe).color;
        probe.remove();
        const active = document.activeElement as HTMLElement | null;
        return {
          focused: !!active?.isContentEditable && el.contains(active),
          // The field and its pill: neither draws the focus ring.
          style: style.outlineStyle,
          field: active ? getComputedStyle(active).outlineStyle : null,
          shadow: style.boxShadow.includes(ring),
          color: style.outlineColor,
          ring,
        };
      });
  const pointerRing = await readRing().catch(() => null);
  on.kit.check(
    "7c: a press chooses the element: a 1px brand-solid line at offset 0 on its box, the tint kept, no label, while its composer stands",
    opened.shown &&
      !!chosen &&
      chosen.shown &&
      !chosen.rest &&
      chosen.style === "solid" &&
      chosen.width === "1px" &&
      chosen.offset === "0px" &&
      chosen.color === chosen.brand &&
      chosen.background === chosen.tint &&
      chosen.label === null &&
      near(chosen.box, own, 1),
    JSON.stringify({ opened, chosen })
  );
  on.kit.check(
    "7c: the composer opened by a press shows no ring (its field focused, its caret its focus)",
    !!pointerRing &&
      pointerRing.focused &&
      pointerRing.style === "none" &&
      pointerRing.field === "none" &&
      !pointerRing.shadow,
    JSON.stringify(pointerRing)
  );

  await on.page.mouse.move(ground.x + ground.w / 2, ground.y + 400);
  await settle(on.page, 150);
  const held = await targetOf(frame);
  on.kit.check(
    "7c: one target at a time: with the composer open, the pointer moved elsewhere leaves the chosen element the one mark, no tint under the pointer",
    !!held && held.shown && !held.rest && !held.root && near(held.box, own, 1),
    JSON.stringify(held)
  );

  const legible = await textUnderTint(frame, "#target");
  on.kit.check(
    `7c: under the tint the chosen element's text holds 4.5:1 or better against the blended ground: day ${legible?.day}:1, night ${legible?.night}:1`,
    !!legible && legible.day >= 4.5 && legible.night >= 4.5,
    JSON.stringify(legible)
  );

  const marks = await coralMarks(frame);
  on.kit.check(
    "7c: with the composer open, the frame's outlines, borders and box-shadows hold exactly one coral mark, the target's 1px line, and none wider than 1px",
    marks.length === 1 &&
      marks[0].el.includes("rect") &&
      marks[0].kind === "outline" &&
      marks[0].width === 1,
    JSON.stringify(marks)
  );

  // Keyboard: ⇧Tab to the composer's target chip, Tab back onto the field.
  await on.page.keyboard.press("Shift+Tab");
  await on.page.keyboard.press("Tab");
  const keyRing = await until(
    "the field focused from the keyboard",
    () => readRing(),
    (seen) => seen.focused,
    3000
  ).catch(() => readRing());
  await settle(on.page, 150);
  const kept = await targetOf(frame);
  on.kit.check(
    "7c: Tab onto the composer's field draws no ring on the field or its pill (its caret is its focus)",
    keyRing.focused &&
      keyRing.style === "none" &&
      keyRing.field === "none" &&
      !keyRing.shadow,
    JSON.stringify(keyRing)
  );
  on.kit.check(
    "7c: with the field focused from the keyboard, the target keeps its 1px line and its tint",
    !!kept &&
      kept.shown &&
      !kept.rest &&
      kept.style === "solid" &&
      kept.width === "1px" &&
      kept.background === kept.tint &&
      near(kept.box, own, 1),
    JSON.stringify(kept)
  );

  const contrast = await lineContrast(on);
  on.kit.check(
    `7c: the chosen line's contrast (brand-solid), measured: day ${contrast.day?.field}:1 on the field, ${contrast.day?.raised}:1 on raised; night ${contrast.night?.field}:1 on the field, ${contrast.night?.raised}:1 on raised; each 3:1 or more`,
    [contrast.day, contrast.night].every(
      (one) => !!one && one.field >= 3 && one.raised >= 3
    ),
    JSON.stringify(contrast)
  );

  // A bare element (no border, no background): the line stands c-target-gap (2px) outside, clear of its glyphs.
  await on.page.keyboard.press("Escape");
  const bare = await screenBox(on, frame, "#bare");
  await commentAt(on, frame, bare.x + 20, bare.y + bare.h / 2, null);
  await until(
    "the bare element chosen",
    () => targetOf(frame),
    (seen) => !!seen && !seen.rest && seen.style === "solid",
    5000
  ).catch(() => null);
  const clearance = await frame.evaluate(() => {
    const rect = document
      .querySelector("cawco-overlay")
      ?.shadowRoot?.querySelector<HTMLElement>(".rect");
    const words = document.querySelector("#bare")?.firstChild;
    if (!(rect && words)) {
      return null;
    }
    const drawn = getComputedStyle(rect);
    const offset = Number.parseFloat(drawn.outlineOffset);
    const box = rect.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(words);
    const glyphs = range.getBoundingClientRect();
    // The line's inner edge stands `offset` outside the box.
    const gaps = {
      left: glyphs.left - (box.left - offset),
      top: glyphs.top - (box.top - offset),
      bottom: box.bottom + offset - glyphs.bottom,
    };
    return {
      bare: rect.hasAttribute("data-bare"),
      style: drawn.outlineStyle,
      width: drawn.outlineWidth,
      offset: drawn.outlineOffset,
      gaps,
      least: Math.min(gaps.left, gaps.top, gaps.bottom),
    };
  });
  on.kit.check(
    `7c: a bare text element chosen takes its 1px line 2px outside (c-target-gap), the line's least gap to its glyphs ${clearance?.least}px, 2px or more`,
    !!clearance &&
      clearance.bare &&
      clearance.style === "solid" &&
      clearance.width === "1px" &&
      clearance.offset === "2px" &&
      clearance.least >= 2 - 0.01,
    JSON.stringify(clearance)
  );

  // The bare comment written: its row in the rail.
  await field.fill("Keep this one.");
  await on.page.keyboard.press("Enter");
  await until(
    "the bare comment in the doc",
    async () => Object.keys((await docOf(frame)).pins).length,
    (count) => count === 1,
    5000
  ).catch(() => 0);
  await on.page.keyboard.press("Escape");
  const row = (await rowsOf(on)).locator('[data-slot="pin-row"]').first();
  await row.hover();
  const rowHovered = await until(
    "the row's pin chosen",
    () => targetOf(frame),
    (seen) => !!seen?.shown && !seen.rest && seen.style === "solid",
    3000
  ).catch(() => targetOf(frame));
  const bareBox = await boxIn(frame, "#bare");
  await on.page.mouse.move(2, 2);
  const rowLeft = await until(
    "the row's pin let go",
    () => targetOf(frame),
    (seen) => !seen?.shown || seen.rest,
    3000
  ).catch(() => targetOf(frame));
  on.kit.check(
    "7c: resting on a comment's row in the rail chooses its element on the page (a 1px brand-solid line), and leaving the row lets it go",
    !!rowHovered &&
      rowHovered.shown &&
      !rowHovered.rest &&
      rowHovered.style === "solid" &&
      rowHovered.width === "1px" &&
      near(rowHovered.box, bareBox, 1) &&
      !!rowLeft &&
      (!rowLeft.shown || rowLeft.rest),
    JSON.stringify({ rowHovered, rowLeft })
  );

  // Opened from the keyboard (Enter on its row) or by a press, the card's field takes the focus and draws no ring.
  await row.focus();
  await on.page.keyboard.press("Enter");
  // Read on the thread's own field: a composer still going out is not it.
  const keyOpened = await until(
    "the key-opened card's field",
    () => readRing('[data-slot="pin-card"]'),
    (seen) => seen.focused,
    5000
  ).catch(() => null);
  on.kit.check(
    "7c: a thread opened from the keyboard (Enter on its row) focuses its reply, no ring (its caret is its focus)",
    !!keyOpened &&
      keyOpened.focused &&
      keyOpened.style === "none" &&
      keyOpened.field === "none" &&
      !keyOpened.shadow,
    JSON.stringify(keyOpened)
  );
  await on.page.keyboard.press("Escape");
  await (await rowsOf(on)).locator('[data-slot="pin-row"]').first().click();
  const pressOpened = await until(
    "the press-opened card's field",
    () => readRing('[data-slot="pin-card"]'),
    (seen) => seen.focused,
    5000
  ).catch(() => null);
  on.kit.check(
    "7c: the same thread opened by a press on its row focuses its reply with no ring",
    !!pressOpened &&
      pressOpened.focused &&
      pressOpened.style === "none" &&
      pressOpened.field === "none" &&
      !pressOpened.shadow,
    JSON.stringify(pressOpened)
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
  await shutList(on);
  const id = made.match(ANSWERED_ID)?.[1];
  if (id) {
    await overlayThemeChecks(on, id);
  }
};

/**
 * 7c. The overlay's marks draw in the host's theme, never the OS's: the
 * dashboard at night on a day OS reads night's `brand-solid` in the overlay
 * (its line's colour and its tint), and the reverse.
 */
const overlayThemeChecks = async (on: On, id: string) => {
  const { origin } = new URL(on.page.url());
  for (const [dashboard, system] of [
    ["dark", "light"],
    ["light", "dark"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme at a time, each its own page
    const desk = await on.kit.page("desk", { theme: dashboard });
    await desk.emulateMedia({ colorScheme: system });
    await open(desk, `${origin}/artifact/${id}`, FRAME);
    const frame = (await until(
      `the targets page, dashboard ${dashboard}`,
      async () => {
        const found = await (
          await desk.locator(FRAME).elementHandle()
        )?.contentFrame();
        return found && (await found.locator("#target").count()) === 1
          ? found
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
    const read = await until(
      `the overlay in the ${dashboard} theme`,
      () =>
        frame.evaluate((want) => {
          const overlay = document.querySelector("cawco-overlay");
          const shadow = overlay?.shadowRoot;
          const rect = shadow?.querySelector<HTMLElement>(".rect");
          if (!(overlay && shadow && rect)) {
            return null;
          }
          // Each scheme's brand-solid, read with the scheme said outright.
          const brandIn = (scheme: string) => {
            const probe = document.createElement("span");
            probe.style.cssText = `color-scheme: ${scheme}; color: var(--brand-solid)`;
            shadow.append(probe);
            const { color } = getComputedStyle(probe);
            probe.remove();
            return color;
          };
          const drawn = getComputedStyle(rect);
          const tint = document.createElement("span");
          tint.style.color = "var(--c-target-tint)";
          shadow.append(tint);
          const { color: tinted } = getComputedStyle(tint);
          tint.remove();
          return {
            scheme: getComputedStyle(overlay).colorScheme,
            line: drawn.outlineColor,
            tint: tinted,
            wanted: brandIn(want),
            other: brandIn(want === "dark" ? "light" : "dark"),
          };
        }, dashboard),
      (seen) => !!seen && seen.scheme === dashboard,
      10_000
    ).catch(() => null);
    on.kit.check(
      `7c: the dashboard ${dashboard} on a ${system} OS: the overlay draws in ${dashboard} (its line ${read?.line}, ${dashboard === "dark" ? "night" : "day"}'s brand-solid ${read?.wanted}, not ${read?.other}), its tint the same coral`,
      !!read &&
        read.scheme === dashboard &&
        read.wanted !== read.other &&
        read.line === read.wanted &&
        read.tint.startsWith(read.wanted.replace(")", "")),
      JSON.stringify(read)
    );
    await desk.close();
  }
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
      await pressFramePoint(frame, { x: outer.x + x, y: outer.y + y });
      await on.page.waitForTimeout(2000);
      await mark("press-after");
    });
    // The press opened its composer, writing nothing; Comment writes the pin, and its picture goes to the hub.
    await on.page
      .locator(COMPOSE)
      .getByRole("combobox")
      .fill("This one.")
      .catch(() => undefined);
    await on.page.keyboard.press("Enter");
    await until(
      "the pressed comment in the doc",
      async () =>
        Object.keys((await docOf(frame)).pins).some((one) => !before.has(one)),
      Boolean,
      10_000
    ).catch(() => false);
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
/** (k2)'s face: Figtree as the dashboard ships it (its latin piece, core house-faces.ts), served beside the page. */
const figtreeLatin = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const piece = (await houseFacePieces()).find(
    (one) => one.role === "sans" && one.cut === "latin"
  );
  if (!piece) {
    throw new Error("house faces: no latin piece of the sans face");
  }
  return piece.bytes;
};
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
    await commentAt(
      on,
      frame,
      (outer?.x ?? 0) + svg.x + IN_HULL.x,
      (outer?.y ?? 0) + svg.y + IN_HULL.y,
      "These edges."
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
  const face = await figtreeLatin();
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
/**
 * 7f. A framework's minted id is no element's identity: React's `useId`
 * (`:r1:`) and Radix's (`radix-…`) name whatever element the next render
 * hands them to. A pin on such an element anchors by its next rule (its
 * place and its words), so a re-render that hands the ids round leaves each
 * pin on its own element.
 */
const MINTED_PAGE = (shuffled: boolean) => {
  const [first, second] = shuffled ? [":r2:", ":r1:"] : [":r1:", ":r2:"];
  const [one, two] = shuffled
    ? ["radix-:r6:", "radix-:r5:"]
    : ["radix-:r5:", "radix-:r6:"];
  return `<section><p id="${first}">The first paragraph, which React's useId named.</p><p id="${second}">The second paragraph, named the same way.</p></section><ul role="menu"><li id="${one}" role="menuitem">A Radix item's own words.</li><li id="${two}" role="menuitem">Another Radix item, below it.</li></ul>`;
};
const mintedIdChecks = async (on: On) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "minted-ids",
    html: `<!doctype html><html><head><style>body { margin: 0; font: 16px/1.5 system-ui; } main { padding: 24px; } p, li { margin: 0 0 96px; min-height: 40px; } ul { padding: 0; list-style: none; }</style></head>
<body><main>${MINTED_PAGE(false)}</main></body></html>`,
  });
  const frame = (await until(
    "the minted-ids page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("section p")
        .count()
        .catch(() => 0)) === 2
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
  const pressIn = async (selector: string, words: string) => {
    const b = await screenBox(on, frame, selector);
    return commentAt(on, frame, b.x + 24, b.y + b.h / 2, words);
  };
  const reactSaid = await pressIn('[id=":r1:"]', "Tighten this paragraph.");
  const radixSaid = await pressIn(
    '[id="radix-:r5:"]',
    "This item reads too loud."
  );
  const selectors = await until(
    "both pins in the doc",
    async () =>
      Object.values((await docOf(frame)).pins)
        .sort((a, b) => Number(a.number) - Number(b.number))
        .map((pin) => (pin.anchor as { selector?: string }).selector ?? ""),
    (kept) => kept.length === 2,
    5000
  ).catch(() => [] as string[]);
  on.kit.check(
    "7f: a pin on an element whose id React's useId minted (:r1:), or Radix (radix-…), never anchors by that id",
    reactSaid.gone &&
      radixSaid.gone &&
      selectors.length === 2 &&
      selectors.every(
        (selector) =>
          !(selector.includes("\\:r") || selector.includes("radix-"))
      ),
    `written ${reactSaid.gone}, ${radixSaid.gone}; selectors ${JSON.stringify(selectors)}`
  );

  // The next render hands the ids round: the same elements, their ids swapped.
  await frame.evaluate((html) => {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = html;
    }
  }, MINTED_PAGE(true));
  await settle(on.page, 600);
  const stands = async (pin: number, selector: string) => {
    const tail = await discAt(frame, pin);
    const own = await boxIn(frame, selector).catch(() => null);
    return {
      tail,
      own,
      on: !!tail && !!own && tail.y >= own.y - 2 && tail.y <= own.y + own.h + 2,
    };
  };
  const react = await stands(1, "section p:nth-of-type(1)");
  const radix = await stands(2, "ul li:nth-of-type(1)");
  on.kit.check(
    "7f: re-rendered with the ids shuffled (the first paragraph now :r2:, the first item radix-:r6:), each pin stays on its own element",
    react.on && radix.on,
    `pin 1 tail ${JSON.stringify(react.tail)} on ${JSON.stringify(react.own)}; pin 2 tail ${JSON.stringify(radix.tail)} on ${JSON.stringify(radix.own)}`
  );
  await on.page.keyboard.press("Escape");
};

/**
 * 7g. A thread opened from the keyboard ends with its reply focused (its
 * caret its focus, no ring drawn), whatever the timing: Enter on a rail row is the row's own (the
 * pane's Enter, the pin J and K stand on, only where no control has the
 * focus), a comment whose Esc came before the page's answer is still the
 * one J and K stand on, and the focus request holds until it lands. Read
 * on the opened thread's own field: a comment Esc'd at once, a fresh load
 * (neither the comment kit nor MessageBody loaded) and its first opening,
 * a reopening, and a row other than the pin J and K stand on.
 */
const keyOpenChecks = async (on: On) => {
  await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "key-open",
    html: `<!doctype html><html><head><style>body { margin: 0; font: 16px/1.5 system-ui; } main { padding: 24px; } p { width: 50%; margin: 0 0 48px; }</style></head>
<body><main><p id="one">The first paragraph a comment stands on.</p><p id="two">The second paragraph, commented on and Esc'd at once.</p></main></body></html>`,
  });
  const frameOf = async () =>
    (await until(
      "the key-open page in the pane",
      async () => {
        const shown = await pageFrame(on);
        return (await shown
          .locator("#two")
          .count()
          .catch(() => 0)) === 1
          ? shown
          : null;
      },
      Boolean,
      60_000
    )) as Frame;
  let frame = await frameOf();
  await settle(on.page, 400);
  await shutList(on);
  await on.page.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  const one = await screenBox(on, frame, "#one");
  await commentAt(
    on,
    frame,
    one.x + 40,
    one.y + one.h / 2,
    "The first, written."
  );
  // The second: Comment, and Esc at once, before the page's answer lands.
  const two = await screenBox(on, frame, "#two");
  await commentAt(on, frame, two.x + 40, two.y + two.h / 2, null);
  await on.page
    .locator(COMPOSE)
    .getByRole("combobox")
    .fill("The second, Esc'd at once.");
  await on.page.keyboard.press("Enter");
  await on.page.keyboard.press("Escape");
  const written = await until(
    "both comments in the doc",
    async () => Object.keys((await docOf(frame)).pins).length,
    (count) => count === 2,
    10_000
  ).catch(() => 0);
  await settle(on.page, 600);

  /** Pin `n`'s thread's reply field: focused, and whether any ring draws; null while it isn't drawn. */
  const ringRead = async (n: number) => {
    const shell = on.page.locator(
      `[data-slot="pin-card"][data-pin-card="${n}"] form[data-slot="cin"]`
    );
    try {
      return await shell.evaluate(
        (el) => {
          const style = getComputedStyle(el);
          const probe = document.createElement("span");
          probe.style.color = "var(--focus-ring)";
          document.body.append(probe);
          const ring = getComputedStyle(probe).color;
          probe.remove();
          const active = document.activeElement as HTMLElement | null;
          return {
            focused: !!active?.isContentEditable && el.contains(active),
            ringed:
              style.outlineStyle !== "none" ||
              style.boxShadow.includes(ring) ||
              (!!active && getComputedStyle(active).outlineStyle !== "none"),
          };
        },
        undefined,
        { timeout: 500 }
      );
    } catch {
      return null;
    }
  };
  /** Pin `n`'s thread's reply, once it holds the focus (5 s). */
  const ringOf = (n: number) =>
    until(
      `pin ${n}'s thread's reply focused`,
      () => ringRead(n),
      (seen) => !!seen?.focused,
      5000
    ).catch(() => ringRead(n));
  const keyed = (seen: Awaited<ReturnType<typeof ringOf>>) =>
    !!seen && seen.focused && !seen.ringed;
  /** Enter on pin `n`'s row, the row itself holding the focus. */
  const enterOn = async (n: number) => {
    const row = (await rowsOf(on)).locator(
      `[data-slot="pin-row"][data-pin-row="${n}"]`
    );
    await row.waitFor({ timeout: 10_000 });
    await row.focus();
    await on.page.keyboard.press("Enter");
    return ringOf(n);
  };
  const closeThread = async () => {
    await on.page.keyboard.press("Escape");
    await on.page
      .locator('[data-slot="pin-card"]')
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  };

  // A fresh load: neither the comment kit nor MessageBody is loaded yet.
  await on.page.keyboard.press("Escape");
  await on.page.reload();
  frame = await frameOf();
  const first = await enterOn(2);
  await closeThread();
  const again = await enterOn(2);
  await closeThread();
  // J and K stand on pin 2 (its thread was the last opened); Enter on pin 1's row opens pin 1's.
  const other = await enterOn(1);
  const wrongCard = await on.page
    .locator('[data-slot="pin-card"][data-pin-card="2"]')
    .count();
  await closeThread();
  on.kit.check(
    "7g: a comment Esc'd before the page's answer is written all the same; after a fresh load (the comment kit and MessageBody not loaded), Enter on its row opens its thread with the reply focused, no ring",
    written === 2 && keyed(first),
    JSON.stringify({ written, first })
  );
  on.kit.check(
    "7g: reopened from the keyboard, the thread focuses its reply again, no ring",
    keyed(again),
    JSON.stringify(again)
  );
  on.kit.check(
    "7g: Enter on a row is that row's: pin 1's row opens pin 1's thread, its reply focused, while J and K stand on pin 2",
    keyed(other) && wrongCard === 0,
    JSON.stringify({ other, wrongCard })
  );
  await shutList(on);
};

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
    await commentAt(
      on,
      frame,
      pane.x + box.x,
      pane.y + box.y,
      `This is ${words}.`
    );
    const pins = await until(
      `the pin on "${words}"`,
      async () => (await docOf(frame)).pins,
      (all) => Object.keys(all).some((one) => !held.has(one)),
      10_000
    ).catch(() => ({}) as Pins);
    const id = Object.keys(pins).find((one) => !held.has(one));
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
  // A pin no anchor finds is moved aside once it has stood missing a while (overlay absent.ts, 2 s).
  await until(
    "the reworded card's pin moved aside",
    async () => !!(await docOf(frame)).pins[charlie ?? ""]?.movedAt,
    Boolean,
    6000
  ).catch(() => false);
  await settle(on.page, 300);
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
        // The pill's tail corner, on its point (DESIGN.md, A pin's pill).
        const g = document.querySelector<SVGGElement>(
          `svg[data-cawco-pins] [data-pin-id="${id}"]`
        );
        const face = g?.querySelector("[data-face]")?.getBoundingClientRect();
        const tail = g?.getAttribute("data-tail") ?? "bottom-start";
        let x = Number.NaN;
        let y = Number.NaN;
        if (face) {
          x = tail.endsWith("end") ? face.right : face.left;
          y = tail.startsWith("top") ? face.top : face.bottom;
        }
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
 * The rail's page: a strip at its very top (a pill there stands below its
 * point), a heading, two paragraphs, a block a revision drops, and a button
 * at the page's right edge (a pill there turns up-left).
 */
const RAIL_PAGE = (withDrop: boolean) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  /* Its grounds and inks in both schemes: the overlay draws a page artifact
     in the host's theme (page.ts \`themeRoot\`), its root's color-scheme. */
  #top { height: 18px; background: light-dark(#e8e4dc, #3a3631); color: light-dark(#1f1d1a, #f2efe9); }
  main { padding: 24px; }
  h1 { margin: 0 0 24px; font-size: 28px; }
  p { width: 55%; margin: 0 0 40px; }
  #drop { width: 240px; height: 60px; margin: 0 0 40px; background: light-dark(#d8d4cc, #45413b); color: light-dark(#1f1d1a, #f2efe9); }
  #edge { position: absolute; right: 0; top: 200px; width: 140px; height: 44px; }
  .space { height: 900px; }
</style></head>
<body><div id="top">The page's top strip.</div><main>
  <h1 id="a">A heading the comments stand on</h1>
  <p id="b">A paragraph to carry pictures and a file.</p>
  <p id="c">A paragraph for a picture on its own.</p>
  ${withDrop ? '<div id="drop">A block a revision drops</div>' : ""}
  <div class="space"></div>
</main><button id="edge" type="button">At the edge</button></body></html>`;

/** A small PNG of one colour, `w` by `h`: an attachment's bytes. */
const pngOf = (w: number, h: number, rgb: [number, number, number]) => {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i += 1) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
};

/** A token's colour as the dashboard computes it. */
const inkOf = (screen: Page, token: string) =>
  screen.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  }, token);

/** Where the captures for the separate reviewer go (they don't land). */
const CAPTURES = join(specOut("comments"), "commenting");

/** A capture of `what` on `screen`, kept for the reviewer as `<name>.png`. */
const capture = async (
  screen: Page,
  name: string,
  what: Locator | null = null
) => {
  await mkdir(CAPTURES, { recursive: true });
  const path = join(CAPTURES, `${name}.png`);
  await (
    what
      ? what.screenshot({ path, animations: "disabled" })
      : screen.screenshot({ path, animations: "disabled" })
  ).catch(() => undefined);
};

/** A composer at the element as it stands: its sizes, its hint, its chips' lines. */
const composerRead = (screen: Page) =>
  screen.locator(COMPOSE).evaluate((el) => {
    const box = (part: Element | null) => {
      const r = part?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const field = el.querySelector('[role="combobox"]') as HTMLElement | null;
    const fieldBox = el.querySelector('[data-slot="composer-field"]');
    const style = field ? getComputedStyle(field) : null;
    const hint = field?.getAttribute("data-placeholder") ?? "";
    const canvas = document.createElement("canvas").getContext("2d");
    if (canvas && style) {
      canvas.font = style.font;
    }
    const room = field
      ? field.clientWidth -
        Number.parseFloat(style?.paddingLeft ?? "0") -
        Number.parseFloat(style?.paddingRight ?? "0")
      : 0;
    // Each chip's name and meta on one baseline, and its ✕ centred.
    const chips = [...el.querySelectorAll("[data-atts] > span")].map((chip) => {
      const baseline = (part: Element | null) => {
        if (!part) {
          return null;
        }
        const mark = document.createElement("span");
        mark.style.cssText =
          "display:inline-block;width:0;height:0;vertical-align:baseline";
        part.append(mark);
        const y = mark.getBoundingClientRect().top;
        mark.remove();
        return y;
      };
      const nameAt = baseline(
        chip.querySelector('[data-slot="att-name"] > span:last-child')
      );
      const metaAt = baseline(chip.querySelector('[data-slot="att-meta"]'));
      const remove = chip.querySelector('button[aria-label^="Remove"]');
      const glyph = remove?.querySelector("svg");
      const c = chip.getBoundingClientRect();
      const r = remove?.getBoundingClientRect();
      const g = glyph?.getBoundingClientRect();
      return {
        name: chip.getAttribute("title"),
        baselines:
          nameAt !== null && metaAt !== null ? Math.abs(nameAt - metaAt) : null,
        removeInChip: r
          ? Math.abs(r.y + r.height / 2 - (c.y + c.height / 2))
          : null,
        glyphInRemove:
          r && g
            ? Math.max(
                Math.abs(g.x + g.width / 2 - (r.x + r.width / 2)),
                Math.abs(g.y + g.height / 2 - (r.y + r.height / 2))
              )
            : null,
        height: Math.round(c.height),
      };
    });
    return {
      card: box(el),
      pill: box(el.querySelector(`form[data-slot="cin"]`)),
      field: box(fieldBox),
      hint,
      hintFits: !!canvas && canvas.measureText(hint).width <= room + 0.5,
      send:
        (el.querySelector('[data-slot="stop"]') as HTMLButtonElement | null)
          ?.disabled === false,
      chips,
      attach: el.querySelector("[data-att-btn]")?.getAttribute("aria-label"),
    };
  });

/** The composer's attach picker, given files as the system's picker would. */
const attachFiles = async (
  screen: Page,
  files: { buffer: Buffer; mimeType: string; name: string }[]
) => {
  await screen
    .locator(`${COMPOSE} input[data-slot="hidden-file"]`)
    .setInputFiles(files);
  await until(
    "the attachments uploaded",
    () =>
      screen
        .locator(`${COMPOSE} [data-atts] > span`)
        .evaluateAll((chips) =>
          chips.every((chip) => !chip.hasAttribute("aria-busy"))
        ),
    Boolean,
    15_000
  ).catch(() => false);
  await settle(screen, 300);
};

/** One row's dress per part, read where it is drawn (The Row Dress Rule). */
const rowDress = (screen: Page, number: number) =>
  screen
    .locator(`${RAIL} [data-slot="pin-row"][data-pin-row="${number}"]`)
    .evaluate((row) => {
      const read = (part: Element | null) => {
        if (!part) {
          return null;
        }
        const style = getComputedStyle(part);
        return {
          size: style.fontSize,
          weight: style.fontWeight,
          color: style.color,
          text: (part as HTMLElement).innerText.trim(),
        };
      };
      const back = row.querySelector('[data-line="back"]');
      const glyph = back?.querySelector("[data-speaker]");
      const g = glyph?.getBoundingClientRect();
      return {
        name: read(row.querySelector('[data-slot="title"]')),
        words: read(row.querySelector('[data-line="words"]')),
        age: read(row.querySelector('[data-slot="age"]')),
        ageTabular: row.querySelector('[data-slot="age"]')
          ? getComputedStyle(row.querySelector('[data-slot="age"]') as Element)
              .fontVariantNumeric
          : null,
        back: read(back),
        speaker: glyph
          ? {
              by: glyph.getAttribute("data-speaker"),
              size: g ? Math.round(g.width) : 0,
              color: getComputedStyle(glyph).color,
              hidden: glyph.getAttribute("aria-hidden"),
              said:
                back?.querySelector(".sr-only")?.textContent?.trim() ?? null,
            }
          : null,
        strip: [
          ...row.querySelectorAll("[data-attach-strip] [data-thumb]"),
        ].map((thumb) => Math.round(thumb.getBoundingClientRect().width)),
        more:
          row
            .querySelector('[data-attach-strip] [data-slot="more"]')
            ?.textContent?.trim() ?? null,
      };
    });

/**
 * The picks on a page of their own, at the desk (DESIGN.md, Placing a
 * comment, A pin's pill, The Comments rail, A thread beside its pin,
 * How comments reach the session): the 280px composer and its parts; attachments by
 * reference, their pills on one baseline; a picture alone sending; the
 * pill's tail turning at the page's edges; the rail beside the page, its
 * rows dressed part by part, the thumb strip, search, sort and the toggle's
 * count; a thread from a row standing in the well; the captures for the
 * reviewer, by day and night. The phone after it ({@link phoneRailChecks}).
 */
const listChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "rail",
    html: RAIL_PAGE(true),
  });
  const artifactId = made.match(ANSWERED_ID)?.[1];
  if (!artifactId) {
    on.kit.check("the rail page is made", false, made.slice(0, 300));
    return;
  }
  const frame = (await until(
    "the rail page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("#edge")
        .count()
        .catch(() => 0)) === 1
        ? shown
        : null;
    },
    Boolean,
    60_000
  )) as Frame;
  await settle(on.page, 400);
  await shutList(on);
  const comment = on.page.locator(`${PANE} button[aria-keyshortcuts='C']`);
  await comment.click();
  await pageInComment(frame, true);
  const pinsNow = async () => (await docOf(frame)).pins as Pins;
  const numberOn = async (selector: string) =>
    Number(
      (
        Object.values(await pinsNow()).find(
          (pin) =>
            (pin.anchor as { selector?: string } | undefined)?.selector ===
            selector
        ) as { number?: number } | undefined
      )?.number ?? 0
    );
  const pressOn = async (selector: string, fx = 0.4, fy = 0.5) => {
    const b = await screenBox(on, frame, selector);
    return commentAt(on, frame, b.x + b.w * fx, b.y + b.h * fy, null);
  };
  const submit = async (words: string) => {
    if (words) {
      await on.page.locator(COMPOSE).getByRole("combobox").fill(words);
    }
    const held = Object.keys(await pinsNow()).length;
    await on.page.locator(`${COMPOSE} [data-slot="stop"]`).click();
    await until(
      "the comment in the doc",
      async () => Object.keys(await pinsNow()).length,
      (count) => count > held,
      10_000
    ).catch(() => 0);
    await settle(on.page, 300);
  };

  const rig: RailRig = { frame, numberOn, pinsNow, pressOn, submit };
  await pickChecks(on, rig);
  const { onB, onC, onDrop } = await railSendChecks(on, rig, artifactId);
  const geometry = await hierarchyChecks(on, rig, { onB, onC, onDrop });
  await railUseChecks(on, geometry, onB);

  // The same scenes at night, at the desk and on a phone.
  await railScenes(on, artifactId);
};

/** What the rail page's checks share: its frame, its pins, and a comment written on it. */
interface RailRig {
  frame: Frame;
  numberOn: (selector: string) => Promise<number>;
  pinsNow: () => Promise<Pins>;
  pressOn: (
    selector: string,
    fx?: number,
    fy?: number
  ) => ReturnType<typeof commentAt>;
  submit: (words: string) => Promise<void>;
}
type Box4 = { x: number; y: number; w: number; h: number } | null;

/** The composer's 280px card, the attachment pills, a picture alone, and the pill's tails. */
const pickChecks = async (on: On, rig: RailRig) => {
  const { frame, numberOn, pinsNow, pressOn, submit } = rig;
  // The composer at the element, measured before a word (addendum §3).
  await pressOn("#a");
  await settle(on.page, 300);
  const empty = await composerRead(on.page);
  await capture(on.page, "p4-element-empty-light-desk", on.page.locator(PANE));
  on.kit.check(
    `the 280px card: the composer at the element is ${empty.card?.w}px wide, its field ${empty.field?.w}px (178px or wider), its hint commentWords.composeHint.full uncut, its pill ${empty.pill?.h}px at one line (about 87px), Attach the ghost paperclip`,
    Math.round(empty.card?.w ?? 0) === 280 &&
      (empty.field?.w ?? 0) >= 178 &&
      empty.hint === commentWords.composeHint.full &&
      empty.hintFits &&
      (empty.pill?.h ?? 0) >= 78 &&
      (empty.pill?.h ?? 0) <= 92 &&
      empty.attach === "Attach a file or image" &&
      !empty.send,
    JSON.stringify(empty)
  );
  await on.page
    .locator(COMPOSE)
    .getByRole("combobox")
    .fill("Make this heading a bit bigger");
  await capture(on.page, "p4-element-typed-light-desk", on.page.locator(PANE));
  await submit("");

  // Pictures and a file by reference; their pills on one line each.
  await pressOn("#b");
  await attachFiles(on.page, [
    ...[0, 1, 2, 3].map((n) => ({
      name: `ref-${n + 1}.png`,
      mimeType: "image/png",
      buffer: pngOf(64, 40, [200 - n * 30, 120, 90 + n * 30]),
    })),
    {
      name: "spec.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,size\nheading,28\nparagraph,16\n"),
    },
  ]);
  const carried = await composerRead(on.page);
  await capture(on.page, "decided-attach-light-desk", on.page.locator(COMPOSE));
  const fileChip = carried.chips.find((one) => one.name === "spec.csv");
  on.kit.check(
    `the attachment pill: five chips, each one pill; the file's name and size within 0.5px of one baseline (${fileChip?.baselines}px), every ✕ centred on its pill and its glyph on its box within 0.5px`,
    carried.chips.length === 5 &&
      fileChip?.baselines !== null &&
      (fileChip?.baselines ?? 9) <= 0.5 &&
      carried.chips.every(
        (one) =>
          (one.removeInChip ?? 9) <= 0.5 && (one.glyphInRemove ?? 9) <= 0.5
      ),
    JSON.stringify(carried.chips)
  );
  await submit("These two, side by side.");

  // A picture with no words sends (pick 6).
  await pressOn("#c");
  await attachFiles(on.page, [
    {
      name: "ref.png",
      mimeType: "image/png",
      buffer: pngOf(80, 48, [90, 140, 200]),
    },
  ]);
  const alone = await composerRead(on.page);
  await capture(on.page, "p6-alone-light-desk", on.page.locator(COMPOSE));
  await submit("");
  const pictureOnly = Object.values(await pinsNow()).find(
    (pin) => (pin.anchor as { selector?: string }).selector === "#c"
  ) as
    | {
        thread: {
          attachments?: { kind: string; name: string; ref: string }[];
          text: string;
        }[];
      }
    | undefined;
  on.kit.check(
    "pick 6, a picture with no words: its send glyph is on with no words, and Comment keeps an entry with no words and the picture by reference",
    alone.send &&
      pictureOnly?.thread[0]?.text === "" &&
      pictureOnly.thread[0].attachments?.length === 1 &&
      pictureOnly.thread[0].attachments[0].kind === "image" &&
      FILE_REF_PATH.test(pictureOnly.thread[0].attachments[0].ref),
    JSON.stringify({ send: alone.send, entry: pictureOnly?.thread[0] })
  );

  // The pill's tail turns at the page's edges (pick 3, the marker).
  await pressOn("#edge", 0.97, 0.5);
  await submit("This button, here at the edge.");
  await pressOn("#top", 0.3, 0.5);
  await submit("The strip at the very top.");
  await pressOn("#drop", 0.5, 0.5);
  await submit("This block can go.");
  const tails = await frame.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("svg[data-cawco-pins] g[data-pin-id]")].map(
        (g) => [g.getAttribute("data-pin"), g.getAttribute("data-tail")]
      )
    )
  );
  const [onA, onEdge, onTop] = [
    await numberOn("#a"),
    await numberOn("#edge"),
    await numberOn("#top"),
  ];
  const { edgeFace, pageWidth } = await frame.evaluate((n) => {
    const r = document
      .querySelector(`svg[data-cawco-pins] g[data-pin="${n}"] [data-face]`)
      ?.getBoundingClientRect();
    return {
      edgeFace: r ? { x: r.x, width: r.width } : null,
      pageWidth: document.documentElement.clientWidth,
    };
  }, onEdge);
  on.kit.check(
    "pick 3, the tail-corner pill: up-right of its point by its bottom-start tail; at the page's right edge it turns up-left (bottom-end), never crossing the edge; at the page's very top it stands below (top-start)",
    tails[String(onA)] === "bottom-start" &&
      tails[String(onEdge)] === "bottom-end" &&
      (tails[String(onTop)] ?? "").startsWith("top") &&
      !!edgeFace &&
      edgeFace.x + edgeFace.width <= pageWidth + 1,
    JSON.stringify({ tails, onA, onEdge, onTop, edgeFace, pageWidth })
  );
  await capture(on.page, "p2-tail-panel-light-desk", on.page.locator(PANE));
};

/** The comments with attachments go by themselves, by reference; an answer, a reply and a dropped element after it. */
const railSendChecks = async (on: On, rig: RailRig, artifactId: string) => {
  const { frame, numberOn, pinsNow, pressOn, submit } = rig;
  // No Send: each comment goes by itself, its attachments by reference.
  const onC = await numberOn("#c");
  // This page's deliveries alone: another page's pins share its numbers.
  const delivered = (text: string) =>
    heard.find(
      (request) =>
        NOTICE.test(request.last) &&
        request.last.includes(`id=${artifactId}`) &&
        request.last.includes(text)
    );
  const message = await until(
    "the picture-alone comment's delivery",
    () => delivered(`## ${onC}. comment`),
    Boolean,
    DELIVERY_MS + QUIET_MS
  ).catch(() => undefined);
  const file = await until(
    "the file's delivery",
    () => delivered("- I attached: spec.csv ("),
    Boolean,
    DELIVERY_MS + QUIET_MS
  ).catch(() => undefined);
  const words = message?.last ?? "";
  const images = message?.body.match(IMAGE_BLOCK)?.length ?? 0;
  const cSection = words.slice(
    words.indexOf(`## ${onC}. comment`),
    words.indexOf("- Pin:", words.indexOf(`## ${onC}. comment`))
  );
  on.kit.check(
    'pick 6\'s delivery, by itself: the picture alone goes as an image block with its line ("I attached: ref.png (picture N of this message…") and no "I wrote"; the file goes by its Attached file line',
    cSection.includes("- I attached: ref.png (picture ") &&
      !cSection.includes("I wrote") &&
      images >= 1 &&
      !!file?.last.includes("Attached file:"),
    `images ${images}; section ${JSON.stringify(cSection)}; file ${file?.last.slice(0, 300) ?? "never"}; ${words.slice(0, 500)}`
  );
  await settle(on.page, 600);
  await capture(on.page, "p3-send-sent-light-desk", on.page.locator(PANE));

  // The person's own reply on the paragraph, sent by itself; then the agent answers on the heading (unread); one more comment.
  const pinIdOn = async (selector: string) =>
    String(
      (
        Object.values(await pinsNow()).find(
          (pin) =>
            (pin.anchor as { selector?: string } | undefined)?.selector ===
            selector
        ) as { id?: string } | undefined
      )?.id ?? ""
    );
  const onB = await numberOn("#b");
  const card = await openThread(on, frame, onB);
  await card.getByRole("combobox").fill("And keep them in that order.");
  await card.getByRole("button", { name: "Reply" }).click();
  await settle(on.page, 400);
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await settle(on.page, 1500);
  await on.fleet.api(
    `/api/instances/${on.session}/artifacts/comments/${await pinIdOn("#a")}/reply`,
    { text: "Made it a step larger." }
  );
  await pressOn("#a", 0.8, 0.5);
  await submit("And its weight, too.");
  // A revision drops the block: its comment's element is gone.
  await on.call(UPDATE, { id: artifactId, html: RAIL_PAGE(false) });
  const onDrop = Number(
    (
      Object.values(await pinsNow()).find(
        (pin) => (pin.anchor as { selector?: string }).selector === "#drop"
      ) as { number?: number } | undefined
    )?.number ?? 0
  );
  await until(
    "the dropped block's comment gone",
    async () =>
      Object.values(await pinsNow()).some(
        (pin) => Number(pin.number) === onDrop && !!pin.movedAt
      ),
    Boolean,
    10_000
  ).catch(() => false);
  await interactTab(on).click();
  await pageInComment(frame, false);

  return { onB, onC, onDrop };
};

/** The rail beside the page, its rows dressed part by part (The Row Dress Rule) and the thumb strip. */
const hierarchyChecks = async (
  on: On,
  rig: RailRig,
  { onB, onC, onDrop }: { onB: number; onC: number; onDrop: number }
) => {
  const onA = await rig.numberOn("#a");
  // The rail, beside the page.
  const railNow = await rowsOf(on);
  await railNow
    .locator(`[data-slot="pin-row"][data-pin-row="${onA}"]`)
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
  await settle(on.page, 600);
  const geometry = await on.page.evaluate(
    ({ railSel, pane }) => {
      const box = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      };
      const railEl = document.querySelector(railSel);
      const well = document.querySelector(`${pane} [data-side-well]`);
      return {
        rail: box(railEl),
        well: box(well),
        inWell: !!railEl && !!well?.contains(railEl),
      };
    },
    { railSel: RAIL, pane: PANE }
  );
  on.kit.check(
    `the Comments rail stands beside the page: ${geometry.rail?.w}px wide (c-comments-w, 320), outside the well and its mode's seam, the page narrowed to meet it`,
    Math.round(geometry.rail?.w ?? 0) === 320 &&
      !geometry.inWell &&
      !!geometry.well &&
      !!geometry.rail &&
      geometry.well.x + geometry.well.w <= geometry.rail.x + 1,
    JSON.stringify(geometry)
  );
  const countOpen = await on.page
    .locator(COMMENTS_TOGGLE)
    .locator('[data-slot="count"]')
    .count();
  const ink = {
    row: await inkOf(on.page, "--ink-row"),
    strong: await inkOf(on.page, "--ink-strong"),
    muted: await inkOf(on.page, "--ink-muted"),
    subtle: await inkOf(on.page, "--ink-subtle"),
    brand: await inkOf(on.page, "--brand-ink"),
  };
  const dresses = {
    unread: await rowDress(on.page, onA),
    you: await rowDress(on.page, onB),
    alone: await rowDress(on.page, onC),
    gone: await rowDress(on.page, onDrop),
  };
  const { unread, you, alone: aloneRow, gone } = dresses;
  on.kit.check(
    "hierarchy, line 1: the place is label 13px at 500 in ink-row (Element gone in ink-subtle), its age meta 12px at 400 in ink-muted, tabular",
    unread.name?.size === "13px" &&
      unread.name.weight === "500" &&
      unread.name.color === ink.row &&
      unread.name.text === "A heading the comments stand on" &&
      gone.name?.text === commentWords.elementGone &&
      gone.name.color === ink.subtle &&
      unread.age?.size === "12px" &&
      unread.age.weight === "400" &&
      unread.age.color === ink.muted &&
      (unread.ageTabular ?? "").includes("tabular-nums"),
    JSON.stringify({ ink, unread, gone })
  );
  on.kit.check(
    "hierarchy, line 2: the words are body 14px at 400 in ink-strong; a comment with no words says its attachment's name",
    unread.words?.size === "14px" &&
      unread.words.weight === "400" &&
      unread.words.color === ink.strong &&
      aloneRow.words?.text === "ref.png",
    JSON.stringify({ unread: unread.words, alone: aloneRow.words })
  );
  on.kit.check(
    'hierarchy, line 3: an unread answer is meta in ink-strong after the agent\'s ghost, a bare 12px glyph read out as "Agent:"; the person\'s sent reply in ink-muted after their glyph in brand-ink, read out as "You:"; nothing at 500',
    unread.back?.size === "12px" &&
      unread.back.color === ink.strong &&
      unread.speaker?.by === "agent" &&
      unread.speaker.size === 12 &&
      unread.speaker.hidden === "true" &&
      unread.speaker.said === "Agent:" &&
      you.back?.color === ink.muted &&
      you.speaker?.by === "you" &&
      you.speaker.color === ink.brand &&
      you.speaker.said === "You:" &&
      [unread, you].every(
        (one) =>
          one.words?.weight !== "500" &&
          one.back?.weight !== "500" &&
          one.age?.weight !== "500"
      ),
    JSON.stringify({
      unread: unread.back,
      speaker: unread.speaker,
      you: you.back,
      yourGlyph: you.speaker,
    })
  );
  on.kit.check(
    `pick 7, the thumb strip: a comment carrying five shows four 20px thumbs, then "+1"; the picture alone, one`,
    you.strip.length === 4 &&
      you.strip.every((w) => w === 20) &&
      you.more === "+1" &&
      aloneRow.strip.length === 1 &&
      aloneRow.more === null,
    JSON.stringify({ strip: you.strip, more: you.more, alone: aloneRow.strip })
  );
  await capture(on.page, "decided-rail-light-desk", on.page.locator(PANE));

  return { countOpen, well: geometry.well as Box4 };
};

/** Search, sort, a row's thread in the well, and the toggle's count. */
const railUseChecks = async (
  on: On,
  { countOpen, well }: { countOpen: number; well: Box4 },
  onB: number
) => {
  const railNow = on.page.locator(RAIL);
  const pinsNow = async () => (await docOf(await pageFrame(on))).pins as Pins;
  // Search on Find's engine: the matching words marked; none says so; Esc clears.
  const search = railNow.locator('[data-slot="search"]');
  await search.fill("heading");
  await settle(on.page, 400);
  const found = await railNow.locator('[data-slot="pin-row"]').count();
  const marked = await railNow.locator('[data-slot="pin-row"] mark').count();
  await search.fill("zzzqx");
  await settle(on.page, 400);
  const none = (
    await railNow
      .locator('[data-slot="pin-list-empty"]')
      .textContent()
      .catch(() => null)
  )?.trim();
  await search.press("Escape");
  await settle(on.page, 400);
  const all = await railNow.locator('[data-slot="pin-row"]').count();
  on.kit.check(
    'search: "heading" finds the heading\'s comments, their words marked; "zzzqx" says Nothing matches “zzzqx”; Esc clears it',
    found >= 1 &&
      found < all &&
      marked >= 1 &&
      none === "Nothing matches “zzzqx”" &&
      (await search.inputValue()) === "",
    JSON.stringify({ found, marked, none, all })
  );
  // Sort: Top of page first, by the anchors' boxes.
  await railNow.getByRole("button", { name: "Sort" }).click();
  await on.page
    .getByRole("menuitemradio", { name: commentWords.topOfPageFirst })
    .click();
  await settle(on.page, 300);
  const order = await railNow
    .locator('[data-slot="pin-row"]')
    .evaluateAll((rows) =>
      rows.map((row) => Number(row.getAttribute("data-pin-row")))
    );
  const ys = Object.fromEntries(
    Object.values(await pinsNow()).map((pin) => [
      Number(pin.number),
      Number((pin.anchor as { box?: { y: number } }).box?.y ?? 0),
    ])
  );
  on.kit.check(
    "sort: Top of page first orders the rows by where they stand on the page",
    order.length > 1 &&
      order.every((n, i) => i === 0 || ys[order[i - 1]] <= ys[n]),
    JSON.stringify({ order, ys })
  );
  await railNow.getByRole("button", { name: "Sort" }).click();
  await on.page
    .getByRole("menuitemradio", { name: commentWords.newestFirst })
    .click();

  // The pointer rests on a pill: its peek stands; then a row opens another
  // comment's thread, and no peek stands while it does.
  const peek = on.page.locator('[data-slot="pin-peek"]');
  const pageFrameNow = await pageFrame(on);
  const pill = await pageFrameNow
    .locator("svg[data-cawco-pins] g[data-pin] [data-face]")
    .first()
    .boundingBox()
    .catch(() => null);
  if (pill) {
    await on.page.mouse.move(
      pill.x + pill.width / 2,
      pill.y + pill.height / 2,
      {
        steps: 3,
      }
    );
  }
  const peeked = await peek
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  // A row opens its thread beside its pill, in the well, never under the rail.
  await railNow.locator(`[data-slot="pin-row"][data-pin-row="${onB}"]`).click();
  const thread = on.page.locator(
    `[data-slot="pin-card"][data-pin-card="${onB}"]`
  );
  await thread.waitFor({ timeout: 5000 }).catch(() => undefined);
  await settle(on.page, 600);
  const peeksWithCard = await peek.count();
  on.kit.check(
    "a thread opening takes every peek down: a pill's peek stood under the pointer, and none stands while the thread does",
    peeked && (await thread.count()) === 1 && peeksWithCard === 0,
    JSON.stringify({ peeked, peeksWithCard })
  );
  // The person's second entry ("And keep them in that order."): prose's
  // wrap, no word alone on its last line, its age on its first line's
  // baseline (The Row Dress Rule's meta on its words' line).
  const second = await entryRead(thread, 1);
  on.kit.check(
    "the thread's entries wrap pretty (no word left alone on a last line), and a grouped entry's age stands on its first line's baseline (within 0.5px)",
    !!second &&
      second.text === "And keep them in that order." &&
      second.wrap === "pretty" &&
      (second.lines === 1 || second.lastLineWidth > 60) &&
      second.baselines <= 0.5 &&
      second.age === "now",
    JSON.stringify(second)
  );
  const railTitle = await titleFits(thread);
  on.kit.check(
    "the row's thread's title stands whole, at the label role's line-height or more",
    titleWhole(railTitle),
    JSON.stringify(railTitle)
  );
  const threadBox = await thread.boundingBox().catch(() => null);
  const gallery = await thread
    .locator(
      '[data-slot="chips"] img, [data-slot="chips"] [data-slot="doc-thumb"], [data-slot="chips"] a, [data-slot="chips"] button'
    )
    .count();
  on.kit.check(
    "a row opens its thread as the card beside its pill, inside the well, clear of the rail; the entry's pictures and file in its gallery",
    !!threadBox &&
      !!well &&
      threadBox.x >= well.x &&
      threadBox.x + threadBox.width <= well.x + well.w + 1 &&
      gallery >= 5,
    JSON.stringify({ thread: threadBox, well, gallery })
  );
  await capture(on.page, "p1-card-panel-light-desk", on.page.locator(PANE));
  await capture(on.page, "p1-card-thread-light-desk", thread);
  await thread.getByRole("button", { name: "Close", exact: true }).click();

  await shutList(on);
  const countShut = await on.page
    .locator(COMMENTS_TOGGLE)
    .locator('[data-slot="count"]')
    .count();
  on.kit.check(
    "the Comments toggle says its count only while the rail is shut",
    countOpen === 0 && countShut === 1,
    JSON.stringify({ countOpen, countShut })
  );

  // The same scenes at night, at the desk and on a phone.
};

/** The rail page's frame on `screen`, once it has drawn its edge button; null until then. */
const railFrameOn = async (screen: Page): Promise<Frame | null> => {
  const handle = await screen
    .locator('iframe[title="Preview"]')
    .first()
    .elementHandle({ timeout: 1000 })
    .catch(() => null);
  const inner = await handle?.contentFrame();
  if (!inner) {
    return null;
  }
  const edges = await inner
    .locator("#edge")
    .count()
    .catch(() => 0);
  return edges === 1 ? inner : null;
};

/**
 * The reviewer's captures at night on the desk, and by day and night on a
 * 390 phone, from the artifact's own tab; and on the phone, the rail as the
 * well's foot sheet, a row's thread rising as the foot sheet in its place
 * with the pill clear of it.
 */
const railScenes = async (on: On, artifactId: string) => {
  const { origin } = new URL(on.page.url());
  for (const [view, theme] of [
    ["desk", "dark"],
    ["phone", "light"],
    ["phone", "dark"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one device and theme after another
    const screen = await on.kit.page(view, { theme });
    await open(screen, `${origin}/artifact/${artifactId}`, PANE).catch(
      () => undefined
    );
    const shown = await until(
      `the rail page on the ${view} at ${theme}`,
      () => railFrameOn(screen),
      Boolean,
      30_000
    ).catch(() => null);
    if (!shown) {
      on.kit.check(`the rail page on the ${view} at ${theme}`, false, "none");
      continue;
    }
    await settle(screen, 800);
    // The fixture page reads in both schemes: its top strip's ink on its
    // ground, as the page draws in the host's theme (page.ts `themeRoot`).
    const strip = await shown.evaluate(() => {
      const el = document.querySelector("#top");
      if (!el) {
        return null;
      }
      const paint = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      });
      const rgb = (color: string) => {
        if (!paint) {
          return [0, 0, 0];
        }
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
        return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const lum = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const v = c / 255;
          return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const style = getComputedStyle(el);
      const ink = lum(rgb(style.color));
      const ground = lum(rgb(style.backgroundColor));
      const hi = Math.max(ink, ground);
      const lo = Math.min(ink, ground);
      return {
        scheme: getComputedStyle(document.documentElement).colorScheme,
        ink: style.color,
        ground: style.backgroundColor,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      };
    });
    on.kit.check(
      `the rail page on the ${view} at ${theme}: its top strip reads, its words ${strip?.ratio}:1 on its ground (4.5:1 or better) in the page's ${strip?.scheme} scheme`,
      !!strip && strip.ratio >= 4.5 && strip.scheme === theme,
      JSON.stringify(strip)
    );
    const toggle = screen.locator(COMMENTS_TOGGLE);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    const rail = screen.locator(RAIL);
    await rail.waitFor({ timeout: 5000 }).catch(() => undefined);
    await settle(screen, 600);
    const tag = `${theme}-${view === "phone" ? "390" : "desk"}`;
    await capture(screen, `decided-rail-${tag}`, screen.locator(PANE));
    if (view === "phone") {
      const read = await screen.evaluate(
        ({ railSel, pane }) => {
          const box = (el: Element | null) => {
            const r = el?.getBoundingClientRect();
            return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
          };
          return {
            rail: box(document.querySelector(railSel)),
            well: box(document.querySelector(`${pane} [data-side-well]`)),
          };
        },
        { railSel: RAIL, pane: PANE }
      );
      on.kit.check(
        `phone (${theme}): the rail is the well's foot sheet, edge to edge, at most 60% of the well`,
        !!read.rail &&
          !!read.well &&
          Math.abs(read.rail.y + read.rail.h - (read.well.y + read.well.h)) <=
            2 &&
          read.rail.h <= read.well.h * 0.6 + 1 &&
          Math.abs(read.rail.w - read.well.w) <= 2,
        JSON.stringify(read)
      );
      // Its list scrolls wholly inside the sheet: scrolled to its end, the
      // last row stands whole inside the rows' box, inside the sheet.
      const end = await rail.evaluate((el) => {
        const rows = el.querySelector<HTMLElement>('[data-slot="rows"]');
        if (!rows) {
          return null;
        }
        rows.scrollTop = rows.scrollHeight;
        const last = [...rows.querySelectorAll('[data-slot="pin-row"]')].at(-1);
        const box = (one: Element | null | undefined) => {
          const r = one?.getBoundingClientRect();
          return r ? { top: r.top, bottom: r.bottom } : null;
        };
        return {
          scrolled: rows.scrollTop,
          overflows: rows.scrollHeight > rows.clientHeight,
          rows: box(rows),
          last: box(last),
          sheet: box(el),
        };
      });
      on.kit.check(
        `phone (${theme}): the rail's list scrolls wholly inside its sheet: scrolled to its end, the last row stands whole inside the list, inside the sheet`,
        !!end?.rows &&
          !!end.last &&
          !!end.sheet &&
          end.last.bottom <= end.rows.bottom + 0.5 &&
          end.last.top >= end.rows.top - 0.5 &&
          end.last.bottom <= end.sheet.bottom + 0.5,
        JSON.stringify(end)
      );
      await rail.evaluate((el) => {
        const rows = el.querySelector<HTMLElement>('[data-slot="rows"]');
        if (rows) {
          rows.scrollTop = 0;
        }
      });
      const row = rail.locator('[data-slot="pin-row"]').first();
      const number = Number(await row.getAttribute("data-pin-row"));
      await row.click();
      const card = screen.locator(
        `[data-slot="pin-card"][data-pin-card="${number}"]`
      );
      await card.waitFor({ timeout: 5000 }).catch(() => undefined);
      await settle(screen, 900);
      const sheet = await screen.evaluate(
        ({ railSel, n }) => {
          const el = document.querySelector(
            `[data-slot="pin-card"][data-pin-card="${n}"]`
          );
          const r = el?.getBoundingClientRect();
          return {
            sheet: el?.hasAttribute("data-sheet") ?? false,
            card: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
            rail: document.querySelectorAll(railSel).length,
          };
        },
        { railSel: RAIL, n: number }
      );
      const pill = await shown
        .locator(`svg[data-cawco-pins] g[data-pin="${number}"] [data-face]`)
        .boundingBox()
        .catch(() => null);
      on.kit.check(
        `phone (${theme}): a row's thread rises as the well's foot sheet, the rail standing aside, and its pill stands clear of it`,
        sheet.sheet &&
          sheet.rail === 0 &&
          !!sheet.card &&
          (!pill || pill.y + pill.height <= sheet.card.y + 1),
        JSON.stringify({ ...sheet, pill })
      );
      const sheetTitle = await titleFits(card);
      on.kit.check(
        `phone (${theme}): the thread's title stands whole in its foot sheet, at the label role's line-height or more`,
        titleWhole(sheetTitle),
        JSON.stringify(sheetTitle)
      );
      await capture(screen, `p1-card-thread-${tag}`, screen.locator(PANE));
      await screen.keyboard.press("Escape");
    } else {
      await rail.locator('[data-slot="pin-row"]').first().click();
      await settle(screen, 700);
      await capture(screen, `p1-card-panel-${tag}`, screen.locator(PANE));
      await screen.keyboard.press("Escape");
    }
    await screen.close();
  }
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
  // The commenting redesign's cutover: the old panel, disc, card foot and
  // the write-before-words path are gone with what used them.
  const gone = (
    await Bun.$`git grep -n -e PinList.svelte -e PinDisc -e withdrawPin -e pinReady -e cawco:withdraw -e pin-drafts -e data-pin-list-pop -e c-pin-card-min -- apps/dashboard/src packages`
      .cwd(ROOT)
      .nothrow()
      .quiet()
  ).stdout
    .toString()
    .trim();
  kit.check(
    "6: no PinList, PinDisc, withdrawPin, pinReady, cawco:withdraw, pin drafts, Comments popover or c-pin-card-min is left in apps/dashboard/src or packages",
    gone === "",
    gone.split("\n").slice(0, 4).join(" | ") || "none"
  );
};

/*
 * Pointing and what changed (PRD §5.7, "Pointing and what changed"; the pin
 * links design of 2026-10-21).
 */

/** A decision page of two cards, the second showing a picture, and its revision rewording that card. */
const pointProgram = (
  image: string
) => `root = Decisions("Point at a card", [reach, tone])
reach = Decision("reach", "Which channels carry the launch?", [mail, feed], "Both reach a reader.")
mail = Option("mail", "Newsletter", "Readers who signed up.", true, [], "A week's wait.")
feed = Option("feed", "Blog feed", "Readers who follow us.", false, [], "Slow to spread.")
tone = Decision("tone", "Which tone does it take?", [plain, warm], "One voice.", [shot])
shot = Image("${image}", "The launch line as it reads", "Today's line")
plain = Option("plain", "Plain", "Says it.", true, [], "Reads cold to some.")
warm = Option("warm", "Warm", "Says it kindly.", false, [], "Takes more words.")`;
const POINT_REVISION = `tone = Decision("tone", "Which tone does the launch take?", [plain, warm], "One voice.", [shot])`;

/** A flat PNG of one grey: the picture a decision card shows, drawn again in another. */
const greyPng = (level: number) => {
  const png = new PNG({ width: 48, height: 32 });
  png.data.fill(level);
  return PNG.sync.write(png);
};

/** The artifact the page in a frame holds, by id; null before it joined one. */
const frameArtifact = (frame: Frame) =>
  frame
    .evaluate(() => {
      let held: string | null = null;
      const global = (
        window as unknown as {
          cawcoArtifact?: {
            subscribe: (
              holder: (hold: { ref: { id: string } | null }) => void
            ) => () => void;
          };
        }
      ).cawcoArtifact;
      const stop = global?.subscribe((hold) => {
        held = hold.ref?.id ?? null;
      });
      stop?.();
      return held;
    })
    .catch(() => null);

/** The pane's page on `screen` once it holds artifact `id`; null when it doesn't within 30 s. */
const frameHolding = (screen: Page, id: string, what: string) =>
  until(
    what,
    async () => {
      let handle: Awaited<
        ReturnType<ReturnType<Page["locator"]>["elementHandle"]>
      > | null = null;
      try {
        handle = await screen.locator(FRAME).elementHandle({ timeout: 1000 });
      } catch {
        return null;
      }
      const frame = await handle?.contentFrame();
      return frame && (await frameArtifact(frame)) === id ? frame : null;
    },
    Boolean,
    30_000
  ).catch(() => null) as Promise<Frame | null>;

/** Colours as sRGB bytes, as `screen` paints them. */
const srgbOf = (screen: Page, colors: string[]) =>
  screen.evaluate((list) => {
    const paint = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    return list.map((color) => {
      if (!paint) {
        return [0, 0, 0, 0];
      }
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = color;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data];
    });
  }, colors);

/** A token's colour as the dashboard resolves it now. */
const tokenColor = (screen: Page, token: string) =>
  screen.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.background = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);

const sameRgb = (a: number[] | undefined, b: number[] | undefined, slack = 3) =>
  !!a &&
  !!b &&
  [0, 1, 2].every((i) => Math.abs((a[i] ?? 0) - (b[i] ?? 0)) <= slack);

/** The agent says `words` in the session, as its next message. */
const agentSays = async (on: On, words: string) => {
  const number = String(says.size + 1);
  says.set(number, words);
  await on.fleet.send(on.session, `PROBE-SAY:${number}`);
};

/** The split at rest: a leg before may have left the panel expanded over the transcript, which is inert then; Esc gives it back. */
const restSplit = async (on: On) => {
  for (let tries = 0; tries < 3; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one Esc, then a look, until the split rests
    if ((await on.page.locator("[data-split-expanded]").count()) === 0) {
      return;
    }
    await on.page.keyboard.press("Escape");
    await settle(on.page, 400);
  }
};

/**
 * Links (1–4): every comment_reply and comment_resolve result, comment_read
 * and the pin delivery carry the pin's link ready-made, artifact_create its
 * artifact's and a decision page's every card's, artifact_update's revision
 * the card it rewrote; written by the agent, a pin's, a card's and an
 * artifact's draw as their chips (a bare "pin 2" stays words), and a press
 * opens the panel there: the card scrolled to and outlined for a moment, the
 * pin's artifact with its thread open (on the desk, and on the phone's
 * sheet), the artifact in front. A pin's unread answer wears the needs-you
 * dot on the page, on its chip after a reload, and none once its thread opened.
 */
const pointChecks = async (
  on: On,
  ids: { id: string; made: string; one: string; two: string }
) => {
  const { id, made, one, two } = ids;
  const { origin } = new URL(on.page.url());
  await restSplit(on);
  // The comments page in front again, after the legs before showed their own.
  await on.call(SHOW, { id });
  const frame = await frameHolding(on.page, id, "the comments page again");
  if (!frame) {
    on.kit.check("pointing: the comments page is in front", false, "not shown");
    return;
  }
  const attn = await tokenColor(on.page, "--status-attn-glyph");
  // Pin 2's thread shut, so its answer arrives unread.
  await on.page
    .locator('[data-slot="pin-card"]')
    .getByRole("button", { name: "Close", exact: true })
    .click({ timeout: 2000 })
    .catch(() => undefined);
  const replied = await on.call(REPLY, {
    pin: two,
    text: "Drew the stroke under it thicker.",
  });
  const resolved = await on.call(RESOLVE, { pin: one });
  const read = await on.call(READ, { artifact: id, filter: "all" });
  const delivered = heard.some(
    ({ last }) =>
      last.includes("- Link: [") && last.includes(`(cawco:pin/${id}/1)`)
  );
  const linked = (said: string, number: number) =>
    said.includes('"link":"[') &&
    said.includes(`](cawco:pin/${id}/${number})"`);
  on.kit.check(
    "links: comment_reply and comment_resolve answer the pin's link, comment_read each pin's and its artifact's, the delivery each pin's (`- Link:`), artifact_create its artifact's",
    linked(replied, 2) &&
      linked(resolved, 1) &&
      read.includes(`(cawco:pin/${id}/2)`) &&
      read.includes(`(cawco:artifact/${id})`) &&
      delivered &&
      made.includes(`(cawco:artifact/${id})`),
    `reply ${replied.slice(replied.indexOf("{"), replied.indexOf("{") + 220)}; resolve ${resolved.slice(resolved.indexOf("{"), resolved.indexOf("{") + 200)}; delivered ${delivered}; made ${made.includes(`(cawco:artifact/${id})`)}`
  );

  // The answer unread on the page: the needs-you dot, its echo three loops.
  const dot = await until(
    "pin 2's unread dot on the page",
    () =>
      frame.evaluate(() => {
        const mark = document.querySelector(
          'svg[data-cawco-pins] g[data-pin="2"] circle[data-dot="unread"]'
        );
        const echo = document.querySelector(
          'svg[data-cawco-pins] g[data-pin="2"] [data-echo]'
        );
        return mark
          ? {
              fill: mark.getAttribute("fill") ?? "",
              loops: echo
                ?.getAnimations()
                .map((each) => each.effect?.getTiming().iterations),
            }
          : null;
      }),
    Boolean,
    5000
  ).catch(() => null);
  const [dotRgb, attnRgb] = await srgbOf(on.page, [dot?.fill ?? "", attn]);
  on.kit.check(
    "dot: pin 2's unread answer wears the needs-you dot on the page (status-attn-glyph), its echo three loops",
    !!dot && sameRgb(dotRgb, attnRgb) && dot.loops?.[0] === 3,
    `dot ${JSON.stringify(dot)} ${JSON.stringify(dotRgb)}; attn ${attn} ${JSON.stringify(attnRgb)}`
  );
  const pin2 = pinNumbered((await docOf(frame)).pins, 2) as unknown as Pin;

  // A decision page: its cards' links from artifact_create, the rewritten one's from artifact_update.
  const pictures = join(on.fleet.sandbox, "pointing");
  await mkdir(pictures, { recursive: true });
  const image = join(pictures, "line.png");
  await writeFile(image, greyPng(200));
  const decided = await on.call(CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick for the launch",
    name: "pointing-cards",
    program: pointProgram(image),
  });
  const did = decided.match(ANSWERED_ID)?.[1] ?? "";
  // The picture drawn again before the revision: the revision carries its new bytes.
  await writeFile(image, greyPng(90));
  const revised = await on.call(UPDATE, {
    id: did,
    statements: POINT_REVISION,
  });
  on.kit.check(
    "links: a decision page's artifact_create answers its link and every card's, artifact_update the card it rewrote and no other",
    !!did &&
      decided.includes(`(cawco:artifact/${did})`) &&
      decided.includes(`(cawco:decision/${did}/reach)`) &&
      decided.includes(`(cawco:decision/${did}/tone)`) &&
      revised.includes(`(cawco:decision/${did}/tone)`) &&
      !revised.includes(`(cawco:decision/${did}/reach)`),
    `create ${decided.slice(decided.indexOf("{"), decided.indexOf("{") + 300)}; update ${revised.slice(revised.indexOf("{"), revised.indexOf("{") + 300)}`
  );
  const cards = await frameHolding(
    on.page,
    did,
    "the decision page in the pane"
  );
  const cardChange = cards
    ? await until(
        "the rewritten card washed",
        () =>
          cards.evaluate(() => {
            const meta = (
              window as unknown as {
                cawcoArtifact: {
                  doc: {
                    getMap: (n: string) => { get: (k: string) => unknown };
                  };
                };
              }
            ).cawcoArtifact.doc.getMap("meta");
            return {
              changes: meta.get("changes") as {
                items: { anchor: string; kind: string }[];
              } | null,
              washed: [
                ...document.querySelectorAll(
                  "svg[data-cawco-changes] rect[data-change]"
                ),
              ].map((rect) => rect.getAttribute("data-change")),
            };
          }),
        (now) => now.washed.length > 1,
        15_000
      ).catch(() => null)
    : null;
  const picture = 'img[src$="files/0-line.png"]';
  on.kit.check(
    "changed: a decision page's revision writes the card it rewrote and the picture drawn again into meta.changes, and the page washes those two alone",
    JSON.stringify(
      cardChange?.changes?.items.map((item) => [item.kind, item.anchor])
    ) ===
      JSON.stringify([
        ["card", "#decision-tone"],
        ["element", picture],
      ]) &&
      JSON.stringify(cardChange?.washed) ===
        JSON.stringify(["#decision-tone", picture]),
    JSON.stringify(cardChange)
  );

  // The agent names a pin, the page and a card; a bare number stays words.
  await agentSays(
    on,
    `Answered [When](cawco:pin/${id}/2); pin 2 is bare words here. The page is [Cards](cawco:artifact/${did}), its card [Which channels carry it?](cawco:decision/${did}/reach).`
  );
  const pinChip = on.page.locator(`[data-pin-chip="${id}/2"]`).first();
  await pinChip.waitFor({ timeout: 60_000 }).catch(() => undefined);
  const readChips = () =>
    on.page.evaluate(
      ({ pinId, decisionId, pageId }) => {
        const chip = document.querySelector(`[data-pin-chip="${pinId}"]`);
        const line = chip?.parentElement;
        const dotEl = chip?.querySelector('[data-dot="unread"]');
        return {
          inLine: line ? line.querySelectorAll("[data-pin-chip]").length : 0,
          label:
            chip?.querySelector('[data-slot="label"]')?.textContent?.trim() ??
            null,
          figure: chip?.querySelector("[data-figure]")?.textContent ?? null,
          name: chip?.getAttribute("aria-label") ?? null,
          dot: dotEl ? getComputedStyle(dotEl).backgroundColor : null,
          bare: line?.textContent?.includes("pin 2 is bare words") ?? false,
          cawcoLinks: line
            ? [...line.querySelectorAll("a")].filter((a) =>
                (a.getAttribute("href") ?? "").startsWith("cawco:")
              ).length
            : -1,
          page:
            document
              .querySelector(
                `[data-artifact-chip="${pageId}"] [data-slot="label"]`
              )
              ?.textContent?.trim() ?? null,
          card:
            document
              .querySelector(
                `[data-decision-chip="${decisionId}"] [data-slot="label"]`
              )
              ?.textContent?.trim() ?? null,
        };
      },
      { pinId: `${id}/2`, decisionId: `${did}/reach`, pageId: did }
    );
  const chips = await readChips();
  const [chipDot] = await srgbOf(on.page, [chips.dot ?? ""]);
  const wanted = pinName(pin2);
  on.kit.check(
    "chip: the agent's `[When](cawco:pin/<artifact>/2)` draws as the pin chip: its pill numbered 2, its label what the pin stands on, its name with its state (Pin 2 on …, New answer), the needs-you dot while the answer is unread; a bare \"pin 2\" stays words; the artifact's and the card's links draw as their chips; no cawco: link is an anchor",
    chips.inLine === 1 &&
      chips.figure === "2" &&
      chips.label === wanted &&
      chips.name === `Pin 2 on ${wanted}, New answer` &&
      sameRgb(chipDot, attnRgb) &&
      chips.bare &&
      chips.cawcoLinks === 0 &&
      chips.page === "pointing-cards" &&
      chips.card === "Which channels carry it?",
    `${JSON.stringify(chips)}; wanted ${JSON.stringify(wanted)}; dot ${JSON.stringify(chipDot)}`
  );

  // Resting the pointer on it peeks the thread under it.
  await pinChip.hover();
  const peeked = await until(
    "the pin chip's peek",
    async () => {
      const peek = on.page.locator(
        '[data-slot="pin-chip-peek"] [data-slot="pin-peek"]'
      );
      return (await peek.count()) > 0 ? peek.first().textContent() : null;
    },
    (words) => !!words,
    4000
  ).catch(() => null);
  await on.page.mouse.move(0, 0);
  const peekGone = await on.page
    .locator('[data-slot="pin-chip-peek"]')
    .waitFor({ state: "detached", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  on.kit.check(
    "chip: resting the pointer on the pin chip peeks its thread under it (its first words, the agent's answer); moving off takes it down",
    !!peeked?.includes("This stroke, thicker.") &&
      peeked.includes("Drew the stroke under it thicker.") &&
      peekGone,
    `peek ${JSON.stringify(peeked)}; gone ${peekGone}`
  );

  // A card's chip, its page in front: the card brought into view and outlined for a moment.
  if (cards) {
    await interactTab(on)
      .click()
      .catch(() => undefined);
    await cards.evaluate(() => {
      const rect = document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector<HTMLElement>(".rect");
      const seen: {
        hidden: boolean;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];
      (window as unknown as { probeOutline: typeof seen }).probeOutline = seen;
      if (rect) {
        new MutationObserver(() => {
          const r = rect.getBoundingClientRect();
          seen.push({
            hidden: rect.hidden === true,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
          });
        }).observe(rect, { attributes: true });
      }
    });
    await on.page
      .locator(`[data-decision-chip="${did}/reach"]`)
      .first()
      .click();
    await settle(on.page, 900);
    const card = await boxIn(cards, "#decision-reach").catch(() => null);
    const outlined = await cards.evaluate(
      () =>
        (
          window as unknown as {
            probeOutline: {
              hidden: boolean;
              x: number;
              y: number;
              w: number;
              h: number;
            }[];
          }
        ).probeOutline
    );
    const shown = outlined.filter((each) => !each.hidden);
    on.kit.check(
      "chip: a card's chip, pressed, outlines its card on the page for a moment (the 1px chosen line over it, then none)",
      !!card &&
        shown.some((each) => near(each, card, 6)) &&
        outlined.at(-1)?.hidden === true,
      `card ${JSON.stringify(card)}; outlines ${JSON.stringify(outlined.slice(-4))}`
    );
  }

  // Coming back: the chip still says the answer is unread, from the hub's doc.
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  await pinChip.waitFor({ timeout: 30_000 }).catch(() => undefined);
  const back = await until(
    "the chip's unread dot after a reload",
    () => readChips(),
    (now) => now.dot !== null,
    15_000
  ).catch(() => null);
  await on.page.locator(`[data-pin-chip="${id}/2"]`).first().click();
  const pinned = await frameHolding(on.page, id, "the pin's page in the pane");
  const thread = on.page.locator('[data-slot="pin-card"][data-pin-card="2"]');
  const opened = await thread
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const seen = pinned
    ? await until(
        "pin 2 looked at",
        async () => pinNumbered((await docOf(pinned)).pins, 2),
        (pin) => typeof pin?.seenAt === "string",
        10_000
      ).catch(() => null)
    : null;
  const after = await readChips();
  const pageDot = pinned
    ? await pinned
        .locator('svg[data-cawco-pins] g[data-pin="2"] [data-dot]')
        .count()
    : -1;
  on.kit.check(
    "chip: after a reload the chip still wears the dot; pressed, the panel holds the pin's artifact with pin 2's thread open, pin 2 is looked at (`seenAt`), and the dot is gone from the chip and the page",
    !!back &&
      !!pinned &&
      opened &&
      !!seen &&
      after.dot === null &&
      pageDot === 0,
    `back ${JSON.stringify(back?.dot)}; artifact ${pinned ? id : "not shown"}; thread ${opened}; seenAt ${String(seen?.seenAt)}; chip dot ${after.dot}; page dots ${pageDot}`
  );
  await thread
    .getByRole("button", { name: "Close", exact: true })
    .click()
    .catch(() => undefined);

  // The artifact's chip: it comes to the front.
  await on.page.locator(`[data-artifact-chip="${did}"]`).first().click();
  const front = await frameHolding(on.page, did, "the page the chip names");
  on.kit.check(
    "chip: an artifact's chip, pressed, brings it to the front of the panel",
    !!front,
    front ? "shown" : "not shown"
  );

  // The phone: the sheet put away, the pin's chip opens it on the pin's thread.
  const phone = await on.kit.page("phone");
  await open(phone, `${origin}/session/${on.session}`, COMPOSER);
  await phone
    .locator('[data-side-card="preview"] button[data-slot="close"]')
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await phone
    .locator('[data-side-card="preview"]')
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => undefined);
  await phone
    .locator(`[data-pin-chip="${id}/2"]`)
    .first()
    .click({ timeout: 15_000 });
  const onPhone = await frameHolding(phone, id, "the pin's page on the phone");
  const phoneCard = phone.locator('[data-slot="pin-card"][data-pin-card="2"]');
  const phoneOpen = await phoneCard
    .waitFor({ timeout: 10_000 })
    .then(() => phoneCard.boundingBox())
    .catch(() => null);
  const view = phone.viewportSize();
  on.kit.check(
    "chip (phone): pressed in the transcript, the sheet opens on the pin's artifact with pin 2's thread open, inside the screen",
    !!onPhone &&
      !!phoneOpen &&
      !!view &&
      phoneOpen.y >= 0 &&
      phoneOpen.y + phoneOpen.height <= view.height + 1,
    `artifact ${onPhone ? id : "not shown"}; card ${JSON.stringify(phoneOpen)}; view ${JSON.stringify(view)}`
  );
  await phone.close();
};

/** A page whose revision rewords one paragraph, puts one in and takes one out. */
const changedPage = (revised: boolean) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  p { width: 70%; margin: 0 0 32px; padding: 8px; border-radius: 12px; }
</style></head>
<body><main>
  <p id="a">Alpha stays as it is.</p>
  <p id="b">${revised ? "Beta, written again." : "Beta, as first written."}</p>
  ${revised ? '<p id="c">Delta, new here.</p>' : '<p id="gone">Gamma, soon taken out.</p>'}
  <section id="more">${MORE_LINES}</section>
</main></body></html>`;
/** Words enough that the page scrolls, the same in both revisions: no change. */
const MORE_LINES = Array.from(
  { length: 30 },
  (_, i) =>
    `<p>Line ${i + 1} of the page, words that stand at its top as it scrolls.</p>`
).join("");

/**
 * WCAG 2 contrast of `selector`'s words over its ground with the change
 * wash (`c-change-wash`) laid over both, as the overlay lays it, by day and
 * by night: the ground the nearest painted ancestor's, else the page's
 * canvas.
 */
const textUnderWash = (frame: Frame, selector: string) =>
  frame.evaluate((sel) => {
    const shadow = document.querySelector("cawco-overlay")?.shadowRoot;
    const el = document.querySelector(sel);
    const paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (!(shadow && el && paint)) {
      return null;
    }
    const pixel = (...layers: string[]) => {
      paint.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        paint.fillStyle = layer;
        paint.fillRect(0, 0, 1, 1);
      }
      const [r = 0, g = 0, b = 0] = paint.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const clear = (color: string) =>
      color === "transparent" ||
      color.endsWith(", 0)") ||
      color.endsWith("/ 0)");
    const root = document.documentElement;
    const was = root.style.colorScheme;
    const out: Record<string, number> = {};
    for (const scheme of ["light", "dark"] as const) {
      root.style.colorScheme = scheme;
      let ground = "";
      for (let at: Element | null = el; at && !ground; at = at.parentElement) {
        const color = getComputedStyle(at).backgroundColor;
        if (!clear(color)) {
          ground = color;
        }
      }
      const probe = document.createElement("span");
      probe.style.colorScheme = scheme;
      probe.style.color = "var(--c-change-wash)";
      probe.style.background = "Canvas";
      shadow.append(probe);
      const { color: wash, backgroundColor: canvas } = getComputedStyle(probe);
      probe.remove();
      const base = ground || canvas;
      const text = lum(pixel(base, getComputedStyle(el).color, wash));
      const under = lum(pixel(base, wash));
      out[scheme === "light" ? "day" : "night"] =
        Math.round(
          ((Math.max(text, under) + 0.05) / (Math.min(text, under) + 0.05)) *
            100
        ) / 100;
    }
    root.style.colorScheme = was;
    return out;
  }, selector);

/** What a page's doc says of its latest changes and the person's looks at them, and what its overlay washes. */
const changedRead = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => {
              get: (k: string) => unknown;
              toJSON: () => Record<string, string[]>;
            };
          };
        };
      }
    ).cawcoArtifact;
    const changes = doc.getMap("meta").get("changes") as {
      items: { anchor: string; kind: string; label: string }[];
      revision: number;
    } | null;
    const seen = doc.getMap("seen").toJSON();
    return {
      changes,
      seen: changes ? (seen[String(changes.revision)] ?? []) : [],
      washes: [
        ...document.querySelectorAll<SVGRectElement>(
          "svg[data-cawco-changes] rect[data-change]"
        ),
      ].map((rect) => {
        const anchor = rect.getAttribute("data-change") ?? "";
        const el = document.querySelector(anchor);
        const r = el?.getBoundingClientRect();
        return {
          anchor,
          fill: rect.getAttribute("fill") ?? "",
          rx: Number(rect.getAttribute("rx")),
          box: {
            x: Number(rect.getAttribute("x")),
            y: Number(rect.getAttribute("y")),
            w: Number(rect.getAttribute("width")),
            h: Number(rect.getAttribute("height")),
          },
          element: r
            ? { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }
            : null,
          pointer: getComputedStyle(rect).pointerEvents,
        };
      }),
    };
  });

/**
 * Changed since you looked (5): a revision's changes in `meta.changes`, each
 * changed element washed in the done wash where it stands after the person
 * comes back (a reload), the tag counting them; each step brings one out,
 * marks it seen in the doc and fades its wash off over `--dur-fade`; every
 * stop seen, the tag leaves, and a reload washes nothing.
 */
/** The widths the bar is swept at: a phone, a narrow pane, a desk. */
const SWEEP_WIDTHS = [390, 680, 1440] as const;

/**
 * The page's text boxes in the viewport, in the top page's px (through its
 * frame's offset), each with whether it is the first block's (#a).
 */
const textBoxesOf = async (
  screen: Page,
  frame: Frame
): Promise<
  { first: boolean; x: number; y: number; w: number; h: number }[]
> => {
  const outer = await screen.locator(FRAME).boundingBox();
  if (!outer) {
    return [];
  }
  const inner = await frame.evaluate(() => {
    const first = document.querySelector("#a");
    const out: {
      first: boolean;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      // What the frame shows of each line: a line scrolled half out of it is clipped at its edge, not drawn over what stands beyond.
      for (const r of range.getClientRects()) {
        const top = Math.max(0, r.top);
        const bottom = Math.min(innerHeight, r.bottom);
        const left = Math.max(0, r.left);
        const right = Math.min(innerWidth, r.right);
        if (bottom > top && right > left) {
          out.push({
            first: !!first?.contains(node),
            x: left,
            y: top,
            w: right - left,
            h: bottom - top,
          });
        }
      }
    }
    return out;
  });
  return inner.map((one) => ({
    ...one,
    x: one.x + outer.x,
    y: one.y + outer.y,
  }));
};

/** Whether two boxes share any area. */
const meets = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * One look at the Changed since you looked bar: the page scrolled to its top
 * or its middle, the bar's box against the frame, the page's text and the
 * pane. A new width can lay the panel out again and its frame with it, so
 * each look takes the pane's frame as it stands, and looks again when the
 * frame it read went away under it.
 */
const barLook = async (
  on: On,
  id: string,
  at: string,
  scroll: "top" | "mid"
): Promise<BarLook> => {
  for (let tries = 0; ; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one try, then the next once the frame went away
    const frame = await frameHolding(on.page, id, `the changed page at ${at}`);
    if (!frame) {
      return { ...NO_LOOK, at, bar: "no frame" };
    }
    try {
      return await barLookIn(on, frame, at, scroll);
    } catch (error) {
      if (tries >= 2) {
        return { ...NO_LOOK, at, bar: String(error) };
      }
      await settle(on.page, 400);
    }
  }
};

interface BarLook {
  above: boolean;
  at: string;
  bar: unknown;
  firstOverlaps: number;
  overflows: number;
  overlaps: number;
}

const NO_LOOK = {
  above: false,
  firstOverlaps: -1,
  overlaps: -1,
  overflows: -1,
} as const;

const barLookIn = async (
  on: On,
  frame: Frame,
  at: string,
  scroll: "top" | "mid"
): Promise<BarLook> => {
  await frame.waitForSelector("#a", { timeout: 10_000 });
  await frame.evaluate((where) => {
    const room = document.scrollingElement;
    if (room) {
      room.scrollTop =
        where === "top" ? 0 : (room.scrollHeight - innerHeight) / 2;
    }
  }, scroll);
  await settle(on.page, 200);
  const bar = await on.page
    .locator('[data-slot="changes-bar"]')
    .boundingBox()
    .catch(() => null);
  const outer = await on.page.locator(FRAME).boundingBox();
  const pane = await on.page.locator(PANE).boundingBox();
  const cut = await on.page
    .locator('[data-slot="changes-tag"]')
    .evaluate((tag) => tag.scrollWidth > tag.clientWidth + 1)
    .catch(() => true);
  const texts = await textBoxesOf(on.page, frame);
  const boxed = bar && { x: bar.x, y: bar.y, w: bar.width, h: bar.height };
  const inPane =
    !!(bar && pane) &&
    bar.x >= pane.x - 0.5 &&
    bar.x + bar.width <= pane.x + pane.width + 0.5;
  return {
    at,
    above: !!(bar && outer) && bar.y + bar.height <= outer.y + 0.5,
    firstOverlaps: boxed
      ? texts.filter((one) => one.first && meets(one, boxed)).length
      : -1,
    overlaps: boxed ? texts.filter((one) => meets(one, boxed)).length : -1,
    overflows: inPane && !cut ? 0 : 1,
    bar: boxed as unknown,
  };
};

/**
 * Changed since you looked never stands over the page it describes: its bar
 * takes its own room between the head and the well. At 390, 680 and 1440,
 * scrolled to the page's top and to its middle, the bar ends above the
 * page's frame, no text box of the page (the first block's named) meets it,
 * and it overflows neither the pane nor its own box: the overlap and
 * overflow sweeps total 0.
 */
const changesBarSweep = async (on: On, id: string) => {
  const was = on.page.viewportSize();
  const looks: BarLook[] = [];
  for (const width of SWEEP_WIDTHS) {
    // biome-ignore lint/performance/noAwaitInLoops: one width, then the next
    await on.page.setViewportSize({ width, height: 900 });
    await settle(on.page, 600);
    for (const scroll of ["top", "mid"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one scroll, then the next
      looks.push(await barLook(on, id, `${width} ${scroll}`, scroll));
    }
  }
  if (was) {
    await on.page.setViewportSize(was);
  }
  await settle(on.page, 600);
  const back = await frameHolding(on.page, id, "the changed page, swept");
  await back
    ?.evaluate(() => {
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop = 0;
      }
    })
    .catch(() => undefined);
  const overlapTotal = looks.reduce(
    (n, one) => n + Math.max(0, one.overlaps),
    0
  );
  const overflowTotal = looks.reduce(
    (n, one) => n + Math.max(0, one.overflows),
    0
  );
  on.kit.check(
    "changed: the Changed since you looked bar takes its own room between the head and the well: at 390, 680 and 1440, scrolled to the top and to mid-page, it ends above the page's frame and meets no text box of the page, its first block's included; the overlap and overflow sweeps total 0",
    looks.length === SWEEP_WIDTHS.length * 2 &&
      looks.every(
        (one) => one.above && one.firstOverlaps === 0 && one.overlaps === 0
      ) &&
      overlapTotal === 0 &&
      overflowTotal === 0,
    `overlap total ${overlapTotal}; overflow total ${overflowTotal}; ${JSON.stringify(looks)}`
  );
  return back;
};

const changedChecks = async (on: On) => {
  const { origin } = new URL(on.page.url());
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge what changed",
    name: "changed",
    html: changedPage(false),
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  await frameHolding(on.page, id, "the changed page in the pane");
  await on.call(UPDATE, { id, html: changedPage(true) });
  // Coming back to it.
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const frame = await frameHolding(
    on.page,
    id,
    "the changed page after a reload"
  );
  if (!frame) {
    on.kit.check("changed: the page is in the pane", false, "not shown");
    return;
  }
  await frame.waitForSelector("#c", { timeout: 10_000 }).catch(() => undefined);
  const before = await until(
    "the changed page's washes",
    () => changedRead(frame),
    (read) => read.washes.length === 2,
    15_000
  ).catch(() => null);
  const items = before?.changes?.items ?? [];
  const done = await tokenColor(on.page, "--c-change-wash");
  const coral = await tokenColor(on.page, "--brand-solid");
  const [washRgb, doneRgb, coralRgb] = await srgbOf(on.page, [
    before?.washes[0]?.fill ?? "",
    done,
    coral,
  ]);
  const placed = (before?.washes ?? []).every(
    (wash) =>
      wash.element !== null &&
      near(wash.box, wash.element, 1) &&
      wash.rx === 12 &&
      wash.pointer === "none"
  );
  const tag = on.page.locator(
    '[data-slot="changes-tag"] [data-slot="change-count"]'
  );
  // The wash stands over the element: its words read through it.
  const readable = await textUnderWash(frame, "#b");
  const said = (
    await tag.textContent({ timeout: 5000 }).catch(() => null)
  )?.trim();
  on.kit.check(
    "changed: the revision's changes are in the doc (#b rewritten, #c put in, the gone paragraph a removed stop); coming back, #b and #c wear the done wash (c-change-wash, status-done-bg seen through, never coral) on their own box and radius, taking no press, #b's words 4.5:1 or better through it by day and by night; the tag reads \"3 changed since you looked\"",
    JSON.stringify(
      items.map((item) => [
        item.kind,
        item.anchor.startsWith("removed:") ? "removed" : item.anchor,
      ])
    ) ===
      JSON.stringify([
        ["element", "#b"],
        ["element", "#c"],
        ["removed", "removed"],
      ]) &&
      JSON.stringify(before?.washes.map((wash) => wash.anchor)) ===
        JSON.stringify(["#b", "#c"]) &&
      sameRgb(washRgb, doneRgb) &&
      !sameRgb(washRgb, coralRgb, 10) &&
      placed &&
      said === "3 changed since you looked" &&
      (readable?.day ?? 0) >= 4.5 &&
      (readable?.night ?? 0) >= 4.5,
    `contrast ${JSON.stringify(readable)}; items ${JSON.stringify(items)}; washes ${JSON.stringify(before?.washes)}; wash ${JSON.stringify(washRgb)} done ${JSON.stringify(doneRgb)}; tag ${said}`
  );

  // The sweep lays the panel out at three widths and back: the steps read the frame as it stands after.
  const held = (await changesBarSweep(on, id)) ?? frame;

  // A step: #b brought out and chosen, seen in the doc, its wash fading off over --dur-fade.
  await held.evaluate(() => {
    const leaving: string[] = [];
    (window as unknown as { probeLeaving: string[] }).probeLeaving = leaving;
    new MutationObserver((records) => {
      for (const record of records) {
        const rect = record.target as SVGRectElement;
        if (rect.hasAttribute("data-leaving")) {
          leaving.push(rect.style.transition);
        }
      }
    }).observe(document.querySelector("svg[data-cawco-changes]") as Element, {
      attributes: true,
      attributeFilter: ["data-leaving"],
      subtree: true,
    });
  });
  await on.page.locator('[data-slot="change-next"]').click();
  const stepped = await until(
    "#b looked at",
    () => changedRead(held),
    (read) =>
      read.seen.includes("#b") &&
      !read.washes.some((wash) => wash.anchor === "#b"),
    5000
  ).catch(() => null);
  const leaving = await held.evaluate(
    () => (window as unknown as { probeLeaving: string[] }).probeLeaving
  );
  const chosen = await outlineOf(held);
  const b = await boxIn(held, "#b");
  const counted = (await tag.textContent().catch(() => null))?.trim();
  on.kit.check(
    'changed: a step onto #b chooses it (the outline over it), marks it seen in the doc\'s `seen`, fades its wash off over --dur-fade (200ms), and the tag reads "1 of 3"',
    !!stepped &&
      near(chosen, b, 6) &&
      leaving.some((transition) => transition.includes("200ms")) &&
      counted === "1 of 3",
    `seen ${JSON.stringify(stepped?.seen)}; washes ${JSON.stringify(stepped?.washes.map((w) => w.anchor))}; outline ${JSON.stringify(chosen)} over ${JSON.stringify(b)}; leaving ${JSON.stringify(leaving)}; tag ${counted}`
  );

  await on.page.locator('[data-slot="change-next"]').click();
  await on.page.locator('[data-slot="change-next"]').click();
  const cleared = await until(
    "every change looked at",
    () => changedRead(held),
    (read) => read.seen.length === 3 && read.washes.length === 0,
    5000
  ).catch(() => null);
  const tagGone = await on.page
    .locator('[data-slot="changes-tag"]')
    .waitFor({ state: "detached", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const again = await frameHolding(
    on.page,
    id,
    "the changed page after another reload"
  );
  await settle(on.page, 1500);
  const still = again ? await changedRead(again) : null;
  const tagBack = await on.page.locator('[data-slot="changes-tag"]').count();
  on.kit.check(
    "changed: every stop stepped onto, all three are seen and the tag leaves; coming back again washes nothing and draws no tag",
    !!cleared &&
      tagGone &&
      !!still &&
      still.washes.length === 0 &&
      tagBack === 0,
    `seen ${JSON.stringify(cleared?.seen)}; tag gone ${tagGone}; after reload washes ${JSON.stringify(still?.washes)}, tags ${tagBack}`
  );
};

/** A page with one paragraph to start a comment on. */
const DRAFT_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  p { width: 70%; margin: 0 0 48px; }
</style></head>
<body><main>
  <p id="target">A paragraph a comment is started on and left half-written.</p>
  <p id="elsewhere">Another paragraph, never pressed.</p>
</main></body></html>`;

const DRAFT_WORDS = "Kept through a reload, and through Esc.";

/** The composer as it stands: shown, its words, its chips. */
const composerNow = async (screen: Page) => {
  const composer = screen.locator(COMPOSE);
  if ((await composer.count()) === 0) {
    return null;
  }
  return {
    words: (
      await composer
        .getByRole("combobox")
        .textContent()
        .catch(() => null)
    )?.trim(),
    chips: await composer.locator("[data-atts] > span").count(),
  };
};

/** The draft's pill on the page: where it stands, whether parked, what it says. */
const draftPillOf = (frame: Frame) =>
  frame.evaluate(() => {
    const g = document.querySelector(
      'svg[data-cawco-pins] g[data-pin="new"], svg[data-cawco-pins-fixed] g[data-pin="new"]'
    );
    const face = g?.querySelector("[data-face]")?.getBoundingClientRect();
    const target = document.querySelector("#target")?.getBoundingClientRect();
    return g && face && target
      ? {
          parked: g.hasAttribute("data-parked"),
          says: g.querySelector("title")?.textContent ?? null,
          mark: g.querySelector("text")?.textContent ?? null,
          pressable: getComputedStyle(g).pointerEvents,
          face: { x: face.x, y: face.y, w: face.width, h: face.height },
          onTarget:
            face.x + face.width >= target.x - 30 &&
            face.x <= target.right + 30 &&
            face.y + face.height >= target.y - 40 &&
            face.y <= target.bottom + 30,
        }
      : null;
  });

/**
 * The Work Outlives Its Surface Rule on the composer: a comment half-written
 * survives a reload with its composer open at its target, its words and its
 * chip; Esc and a press outside each park it as the hollow pill at its
 * target, saying it holds a draft, with no pin written; a reload keeps it
 * parked; one press on the pill opens the composer again with the words and
 * the chip.
 */
const draftChecks = async (on: On) => {
  const { origin } = new URL(on.page.url());
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "drafts",
    html: DRAFT_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const frame = await frameHolding(on.page, id, "the drafts page in the pane");
  const pane = await on.page.locator(FRAME).boundingBox();
  if (!(frame && pane)) {
    on.kit.check("drafts: the page is in the pane", false, "not shown");
    return;
  }
  await on.page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    )
    .click();
  await pageInComment(frame, true);
  const target = await boxIn(frame, "#target");
  await commentAt(
    on,
    frame,
    pane.x + target.x + target.w * 0.3,
    pane.y + target.y + target.h / 2,
    null
  );
  await on.page.locator(COMPOSE).getByRole("combobox").fill(DRAFT_WORDS);
  await attachFiles(on.page, [
    {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A note that goes with the draft."),
    },
  ]);
  // The draft store writes at most every 250ms.
  await settle(on.page, 800);

  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const back = await frameHolding(
    on.page,
    id,
    "the drafts page after a reload"
  );
  const reopened = await until(
    "the composer back after a reload",
    () => composerNow(on.page),
    (now) => now?.words === DRAFT_WORDS && now.chips === 1,
    15_000
  ).catch(() => null);
  const pillBack = back ? await draftPillOf(back) : null;
  const pinsAfterReload = back
    ? Object.keys((await docOf(back)).pins).length
    : -1;
  on.kit.check(
    "drafts: a half-written comment survives a reload with its composer open at its target, its words and its chip, its hollow pill on the paragraph, no pin written",
    !!reopened &&
      !!pillBack?.onTarget &&
      !pillBack.parked &&
      pinsAfterReload === 0,
    `composer ${JSON.stringify(reopened)}; pill ${JSON.stringify(pillBack)}; pins ${pinsAfterReload}`
  );
  if (!back) {
    return;
  }

  // Esc parks it.
  await on.page.locator(COMPOSE).getByRole("combobox").focus();
  await on.page.keyboard.press("Escape");
  await on.page
    .locator(COMPOSE)
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  const parked = await until(
    "the parked pill",
    () => draftPillOf(back),
    (pill) => !!pill?.parked,
    5000
  ).catch(() => null);
  on.kit.check(
    'drafts: Esc closes the composer and parks the draft as the hollow pill where it stood (±1px) at its target, saying it holds a draft (… and "Draft comment, not sent"), pressable, with no pin written',
    (await on.page.locator(COMPOSE).count()) === 0 &&
      !!parked?.onTarget &&
      !!pillBack &&
      near(parked.face, pillBack.face, 1) &&
      parked.mark === "…" &&
      parked.says === "Draft comment, not sent" &&
      parked.pressable === "auto" &&
      Object.keys((await docOf(back)).pins).length === 0,
    `parked ${JSON.stringify(parked)}; open ${JSON.stringify(pillBack?.face)}`
  );

  // One press on it brings the composer back; a press outside parks it again.
  const pressPill = async (holding: Frame) => {
    const pill = await draftPillOf(holding);
    if (!pill) {
      return;
    }
    const x = pane.x + pill.face.x + pill.face.w / 2;
    const y = pane.y + pill.face.y + pill.face.h / 2;
    await on.page.mouse.move(x, y, { steps: 2 });
    await pressFramePoint(holding, { x, y });
  };
  await pressPill(back);
  const again = await until(
    "the composer from the parked pill",
    () => composerNow(on.page),
    (now) => now?.words === DRAFT_WORDS && now.chips === 1,
    5000
  ).catch(() => null);
  // A press elsewhere in the dashboard, outside the composer.
  await on.page.mouse.click(4, 300);
  const outside = await until(
    "parked by a press outside",
    () => draftPillOf(back),
    (pill) => !!pill?.parked,
    5000
  ).catch(() => null);
  const closed = await on.page
    .locator(COMPOSE)
    .waitFor({ state: "detached", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  on.kit.check(
    "drafts: one press on the parked pill opens the composer again with the words and the chip; a press outside parks it again",
    !!again && !!outside && closed,
    `composer ${JSON.stringify(again)}; parked ${JSON.stringify(outside)}`
  );

  // Parked through a reload, and one press brings it back.
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const last = await frameHolding(on.page, id, "the drafts page, parked");
  const still = last
    ? await until(
        "the parked pill after a reload",
        () => draftPillOf(last),
        (pill) => !!pill?.parked,
        15_000
      ).catch(() => null)
    : null;
  const noComposer = (await on.page.locator(COMPOSE).count()) === 0;
  if (last) {
    await pressPill(last);
  }
  const fromReload = await until(
    "the composer from the parked pill after a reload",
    () => composerNow(on.page),
    (now) => now?.words === DRAFT_WORDS && now.chips === 1,
    8000
  ).catch(() => null);
  on.kit.check(
    "drafts: a parked draft stays parked through a reload (its pill at its target, no composer), and one press on it opens the composer with the words and the chip",
    !!still?.onTarget && noComposer && !!fromReload,
    `pill ${JSON.stringify(still)}; composer before ${!noComposer}; after ${JSON.stringify(fromReload)}`
  );
  await on.page.keyboard.press("Escape");
};

/**
 * A page that draws its panel again from a template, as the owner's
 * design-graph mockup's app.js rebuilds its panels: emptied, then filled two
 * frames later, every 400 ms. Each row's value reads the same words, so only
 * its place names it. `probeRedraw.stop()` empties it for good; `back()`
 * fills it once.
 */
const REDRAW_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px/1.5 system-ui; }
  main { display: grid; grid-template-columns: 1fr 320px; gap: 24px; padding: 24px; }
  .node { padding: 12px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #ddd; }
</style></head>
<body><main>
  <section id="graph"><div class="node">Routines view</div><div class="node">Create routine form</div></section>
  <aside id="panel"></aside>
</main>
<script>
  const panel = document.getElementById("panel");
  const rows = ["Name", "When", "At", "Time zone"];
  const fill = () => {
    panel.innerHTML = rows
      .map((label) => '<div class="row"><span class="label">' + label + '</span><span class="value">Not set</span></div>')
      .join("");
  };
  const redraw = () => {
    panel.replaceChildren();
    requestAnimationFrame(() => requestAnimationFrame(fill));
  };
  fill();
  const timer = setInterval(redraw, 400);
  window.probeRedraw = {
    stop: () => {
      clearInterval(timer);
      panel.replaceChildren();
    },
    back: () => fill(),
  };
</script>
</body></html>`;
/** The value the redraw leg pins: the second row's, whose words every row's value reads. */
const REDRAWN = "#panel .row:nth-child(2) .value";

/** Whether pin `number`'s pill stands on `selector`'s box now (its tail within it, ±2px); null while either is not drawn. */
const pillOn = (frame: Frame, number: number, selector: string) =>
  frame.evaluate(
    ({ n, sel }) => {
      const g = document.querySelector(
        `svg[data-cawco-pins] g[data-pin="${n}"]`
      );
      const face = g?.querySelector("[data-face]");
      const el = document.querySelector(sel);
      if (!(g && face && el)) {
        return null;
      }
      const r = face.getBoundingClientRect();
      const tail = g.getAttribute("data-tail") ?? "bottom-start";
      const x = tail.endsWith("end") ? r.right : r.left;
      const y = tail.startsWith("top") ? r.top : r.bottom;
      const box = el.getBoundingClientRect();
      return (
        x >= box.left - 2 &&
        x <= box.right + 2 &&
        y >= box.top - 2 &&
        y <= box.bottom + 2
      );
    },
    { n: number, sel: selector }
  );

/**
 * A pin stays on its element while that element is in the page (the
 * owner's "elements i select still dismiss saying element is gone"): on a
 * page that draws its panel again every 400 ms (empty for two frames each
 * time), a comment pressed on a row's value and written over three redraws
 * stands on that row's value, by its place in the panel; through 4 s of
 * redraws it is never moved aside and its pill stands on the value. The
 * panel emptied for good, it is said gone only once it has stood missing a
 * while (2 s), its row commentWords.elementGone; the panel back, the pin is on its
 * element again, out of the tray.
 */
const redrawChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "redraw",
    html: REDRAW_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const frame = await frameHolding(
    on.page,
    id,
    "the redrawing page in the pane"
  );
  if (!frame) {
    on.kit.check("redraw: the page is in the pane", false, made.slice(0, 300));
    return;
  }
  await frame.waitForSelector(REDRAWN);
  await on.page.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  // Pressed while it stands, then written over three of its redraws.
  const value = await until(
    "the second row's value drawn",
    () => screenBox(on, frame, REDRAWN).catch(() => undefined),
    Boolean,
    5000
  );
  await commentAt(
    on,
    frame,
    value.x + value.w * 0.3,
    value.y + value.h / 2,
    null
  );
  await settle(on.page, 1300);
  await on.page
    .locator(COMPOSE)
    .getByRole("combobox")
    .fill("The When row reads wrong.");
  await on.page.keyboard.press("Enter");
  const written = await until(
    "the redraw page's pin",
    async () => pinNumbered((await docOf(frame)).pins, 1),
    Boolean,
    10_000
  ).catch(() => undefined);
  const anchor = written?.anchor as
    { box?: { w: number }; selector?: string; text?: string } | undefined;
  on.kit.check(
    "redraw: a comment pressed on the second row's value and written over three redraws stands on that row's value by its place in the panel (#panel's second row), its box the value's",
    anchor?.selector === "#panel > div:nth-of-type(2) > span:nth-of-type(2)" &&
      anchor.text === "Not set" &&
      (anchor.box?.w ?? 0) > 0,
    JSON.stringify(anchor)
  );
  await on.page.keyboard.press("Escape");

  // 4 s of redraws: never moved aside, and its pill on the value whenever the value stands.
  const watched: { moved: boolean; on: boolean | null }[] = [];
  const until4 = Date.now() + 4000;
  while (Date.now() < until4) {
    // biome-ignore lint/performance/noAwaitInLoops: one read every 150 ms, in order
    const pin = pinNumbered((await docOf(frame)).pins, 1);
    watched.push({
      moved: !!pin?.movedAt,
      on: await pillOn(frame, 1, REDRAWN),
    });
    // On the clock, not a settle: the redraws must go on between reads.
    await on.page.waitForTimeout(150);
  }
  const drawnOn = watched.filter((one) => one.on !== null);
  on.kit.check(
    "redraw: through 4 s of the panel drawn again (empty two frames in every 400 ms) the pin is never moved aside, and whenever its value stands its pill stands on it",
    watched.length > 10 &&
      watched.every((one) => !one.moved) &&
      drawnOn.length > 5 &&
      drawnOn.every((one) => one.on === true),
    `reads ${watched.length}; moved ${watched.filter((one) => one.moved).length}; drawn ${drawnOn.length}, off its value ${drawnOn.filter((one) => one.on === false).length}`
  );

  // Gone for good: said gone only after a while.
  const emptied = Date.now();
  await frame.evaluate(() =>
    (
      window as unknown as { probeRedraw: { stop: () => void } }
    ).probeRedraw.stop()
  );
  const moved = await until(
    "the pin moved aside",
    async () => pinNumbered((await docOf(frame)).pins, 1),
    (pin) => !!pin?.movedAt,
    10_000
  ).catch(() => undefined);
  const after = Date.now() - emptied;
  const row = (await rowsOf(on)).locator(
    '[data-slot="pin-row"][data-pin-row="1"][data-moved]'
  );
  await row.waitFor({ timeout: 5000 }).catch(() => undefined);
  const said = (
    await row
      .locator('[data-slot="title"]')
      .textContent()
      .catch(() => null)
  )?.trim();
  on.kit.check(
    "redraw: the panel emptied for good, the pin is moved aside only once its element has stood missing for 2 s, its row saying Element gone",
    !!moved?.movedAt && after >= 1800 && said === commentWords.elementGone,
    `moved after ${after} ms; row ${JSON.stringify(said)}`
  );

  // Back: the pin is on its element again.
  await frame.evaluate(() =>
    (
      window as unknown as { probeRedraw: { back: () => void } }
    ).probeRedraw.back()
  );
  const back = await until(
    "the pin out of the tray",
    async () => pinNumbered((await docOf(frame)).pins, 1),
    (pin) => !!pin && !pin.movedAt,
    8000
  ).catch(() => undefined);
  await settle(on.page, 300);
  on.kit.check(
    "redraw: its element drawn back, the pin comes out of the moved tray and its pill stands on the value again",
    !!back && !back.movedAt && (await pillOn(frame, 1, REDRAWN)) === true,
    `movedAt ${String(back?.movedAt)}; on ${await pillOn(frame, 1, REDRAWN)}`
  );
  await shutList(on);
};

/** A second session's tool call, as {@link setUp}'s `call` makes the first's: its own numbers, past the first's. */
let callsIn = 90_000;
const callIn = async (
  on: On,
  to: string,
  tool: string,
  input: object
): Promise<string> => {
  callsIn += 1;
  const marker = String(callsIn);
  asks.set(marker, { name: tool, input });
  await on.fleet.send(to, `PROBE-CALL:${marker}`);
  return (await until(
    `the ${tool} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  )) as string;
};

/** A plain page of two paragraphs, its comments going by themselves. */
const SEND_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; font: 18px/1.6 system-ui; } main { padding: 24px; } p { width: 60%; margin: 0 0 48px; }</style></head>
<body><main>
  <p id="one">The first paragraph, which goes on its own.</p>
  <p id="two">The second paragraph, which goes from its thread.</p>
</main></body></html>`;

/**
 * Comments go by themselves (the owner's "Go by themselves", 2026-10-23):
 * two comments written, each reaches the session with no Send, and no row
 * offers a Send nor says Unsent. A writer whose conversation is gone
 * (outside a project, no one to take its marks): its comment's delivery
 * reaches no one, and the pin says why ("Not sent: …") with Try again, in
 * its row and in its thread; its conversation back, Try again sends it and
 * the line goes (the owner's "no option to trigger resend?").
 */
const pinSendChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "pin-send",
    html: SEND_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const frame = await frameHolding(
    on.page,
    id,
    "the pin-send page in the pane"
  );
  if (!frame) {
    on.kit.check(
      "pin send: the page is in the pane",
      false,
      made.slice(0, 300)
    );
    return;
  }
  const heardBefore = heard.length;
  await on.page.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  for (const [selector, words] of [
    ["#one", "This one goes on its own."],
    ["#two", "So does this one."],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one comment, then the next
    const b = await screenBox(on, frame, selector);
    await commentAt(on, frame, b.x + b.w * 0.3, b.y + b.h / 2, words);
  }
  await on.page.keyboard.press("Escape");
  const pinsNow = async () => (await docOf(frame)).pins;
  const rail = await rowsOf(on);
  const offered = await rail
    .locator('[data-slot="pin-send"], [data-slot="pin-retry"]')
    .count();
  const sent = await until(
    "both comments sent by themselves",
    pinsNow,
    (pins) => !!pinNumbered(pins, 1)?.sentAt && !!pinNumbered(pins, 2)?.sentAt,
    DELIVERY_MS + QUIET_MS
  ).catch(pinsNow);
  const told = heard
    .slice(heardBefore)
    .filter((one) => NOTICE.test(one.last) && one.last.includes("pin-send"))
    .map((one) => one.last)
    .join("\n");
  const first = pinNumbered(sent, 1);
  const second = pinNumbered(sent, 2);
  await settle(on.page, 400);
  const unsentRows = await rail
    .locator('[data-slot="pin-row"] [data-line="back"]', { hasText: "Unsent" })
    .count();
  on.kit.check(
    "pin send: two comments, no Send offered on any row nor Unsent said: each reaches the session by itself, stamped sent",
    offered === 0 &&
      unsentRows === 0 &&
      !!first?.sentAt &&
      !!second?.sentAt &&
      told.includes(first.id) &&
      told.includes(second.id),
    `offered ${offered}; Unsent rows ${unsentRows}; pins ${JSON.stringify(Object.values(sent).map((pin) => [pin.number, !!pin.sentAt]))}; told ${told.slice(0, 300)}`
  );
  await shutList(on);
  await pageOnlyChecks(on, id);

  // A writer no one stands behind: its conversation is gone and it is in no project.
  const writer = await on.fleet.spawn("claude", "Gone writer", on.fleet.repo);
  const gonePage = await callIn(on, writer, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "not-sent",
    html: SEND_PAGE,
  });
  // Its answer names the page by its handle alone while no dashboard shows the
  // writer's panel: the hub's own record gives its whole id.
  const goneId =
    gonePage.match(ANSWERED_ID)?.[1] ??
    on.fleet.query<{ id: string }>(
      "SELECT id FROM artifacts WHERE instance_id = ? AND name = ?",
      writer,
      "not-sent"
    )[0]?.id ??
    "";
  const conversation = (gone: boolean) => {
    const db = new Database(on.fleet.env.CAWCO_DB_PATH as string);
    try {
      db.exec("PRAGMA busy_timeout = 15000");
      db.query(
        "UPDATE instances SET last_error = ?, last_error_kind = ? WHERE id = ?"
      ).run(
        gone ? CLAUDE_CONVERSATION_GONE : null,
        gone ? "conversation-gone" : null,
        writer
      );
    } finally {
      db.close();
    }
  };
  conversation(true);
  const { origin } = new URL(on.page.url());
  const tab = await on.kit.page("desk");
  const there: On = { ...on, page: tab, session: writer };
  await open(tab, `${origin}/session/${writer}`, "[data-artifact-trigger]");
  const goneFrame = await frameHolding(tab, goneId, "the gone writer's page");
  if (!goneFrame) {
    on.kit.check(
      "pin send: the gone writer's page is shown",
      false,
      gonePage.slice(0, 300)
    );
    await tab.close();
    return;
  }
  await goneFrame.waitForSelector("#one");
  await tab.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(goneFrame, true);
  const g = await screenBox(there, goneFrame, "#one");
  await commentAt(
    there,
    goneFrame,
    g.x + g.w * 0.3,
    g.y + g.h / 2,
    "Who takes this one?"
  );
  await tab.keyboard.press("Escape");
  const goneRail = await rowsOf(there);
  const goneRow = goneRail.locator(
    'li:has([data-slot="pin-row"][data-pin-row="1"])'
  );
  // No Send: its delivery goes by itself, and reaches no one.
  const failed = await until(
    "the pin saying it wasn't sent",
    async () => pinNumbered((await docOf(goneFrame)).pins, 1),
    (pin) => !!pin?.notSent,
    DELIVERY_MS
  ).catch(() => undefined);
  await settle(tab, 400);
  const rowSays = (
    await goneRow
      .locator("[data-not-sent]")
      .textContent()
      .catch(() => null)
  )?.trim();
  const again = (
    await goneRow
      .locator('[data-slot="pin-retry"]')
      .textContent()
      .catch(() => null)
  )?.trim();
  await goneRow.locator('[data-slot="pin-row"]').click();
  const goneCard = tab.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await goneCard.waitFor({ timeout: 5000 }).catch(() => undefined);
  const cardSays = (
    await goneCard
      .locator("[data-not-sent] p")
      .textContent()
      .catch(() => null)
  )?.trim();
  const why = (failed?.notSent as { why?: string } | undefined)?.why ?? "";
  on.kit.check(
    'pin send: a comment whose delivery no one takes (the writer\'s conversation gone, no project) stays unsent with why on the pin; its row and its thread say "Not sent: …" in words, each with Try again',
    !!why &&
      !failed?.sentAt &&
      rowSays === commentWords.notSent(why) &&
      again === commonWords.tryAgain &&
      cardSays === rowSays &&
      (
        await goneCard.locator('[data-slot="pin-retry"]').textContent()
      )?.trim() === commonWords.tryAgain,
    `why ${JSON.stringify(why)}; row ${JSON.stringify(rowSays)} / ${JSON.stringify(again)}; card ${JSON.stringify(cardSays)}`
  );
  // Its conversation back: Try again sends it, and the line goes.
  conversation(false);
  await goneCard.locator('[data-slot="pin-retry"]').click();
  const resent = await until(
    "the pin sent on Try again",
    async () => pinNumbered((await docOf(goneFrame)).pins, 1),
    (pin) => !!pin?.sentAt && !pin.notSent,
    DELIVERY_MS
  ).catch(() => undefined);
  await settle(tab, 400);
  on.kit.check(
    "pin send: with someone to take it, Try again sends it: stamped sent, its reason cleared, and the thread's line gone",
    !!resent?.sentAt &&
      !resent.notSent &&
      (await goneCard.locator('[data-slot="not-sent"]').count()) === 0,
    `sentAt ${String(resent?.sentAt)}; notSent ${JSON.stringify(resent?.notSent)}`
  );
  await tab.close();
};

/** The page's doc socket on its preview origin (overlay artifact.ts): what a dropped link closes. */
const PAGE_SOCKET = /\/__cawco\/artifact\/[0-9a-f-]{36}/;

/**
 * A comment the hub never got (the owner's two "Unsent" pins with no record
 * at the hub): written while the page's link to the hub is down, it stands
 * only on the page; its row says why it isn't sent, in words, with Try
 * again, and so does its thread; it stays through a reload (kept on the
 * device); with the link back, Try again takes it to the hub, and it goes to
 * the session by itself.
 */
const pageOnlyChecks = async (on: On, id: string) => {
  const { origin } = new URL(on.page.url());
  const tab = await on.kit.page("desk");
  const link: { down: boolean } = { down: true };
  await tab.routeWebSocket(PAGE_SOCKET, (ws) => {
    if (link.down) {
      ws.close({ code: 1011, reason: "The probe dropped the page's link." });
      return;
    }
    ws.connectToServer();
  });
  const there: On = { ...on, page: tab };
  await open(tab, `${origin}/session/${on.session}`, COMPOSER);
  const frame = await frameHolding(tab, id, "the pin-send page, its link down");
  if (!frame) {
    on.kit.check("page only: the page is shown", false, "not shown");
    await tab.close();
    return;
  }
  await frame.waitForSelector("#two");
  await tab.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  const b = await screenBox(there, frame, "#two");
  await commentAt(
    there,
    frame,
    b.x + b.w * 0.6,
    b.y + b.h / 2,
    "Written with the link down."
  );
  await tab.keyboard.press("Escape");
  const rowSays = async () => {
    const rail = await rowsOf(there);
    const row = rail.locator('li:has([data-slot="pin-row"][data-pin-row="3"])');
    return {
      said:
        (
          await row
            .locator("[data-not-sent]")
            .textContent()
            .catch(() => null)
        )?.trim() ?? null,
      send:
        (
          await row
            .locator('[data-slot="pin-retry"]')
            .textContent()
            .catch(() => null)
        )?.trim() ?? null,
    };
  };
  const down = await until(
    "the page-only comment's row saying why",
    rowSays,
    (now) => !!now.said,
    8000
  ).catch(rowSays);
  // What the hub holds, as the desk's own page (its link up) has it.
  const desk = await frameHolding(on.page, id, "the pin-send page on the desk");
  const heldBefore = desk ? !!pinNumbered((await docOf(desk)).pins, 3) : true;
  // Through a reload, still down: kept on the device.
  await open(tab, `${origin}/session/${on.session}`, COMPOSER);
  const again = await frameHolding(tab, id, "the pin-send page after a reload");
  const kept = again
    ? await until(
        "the page-only comment back after a reload",
        async () => pinNumbered((await docOf(again)).pins, 3),
        Boolean,
        10_000
      ).catch(() => undefined)
    : undefined;
  const afterReload = await until(
    "its row after the reload",
    rowSays,
    (now) => !!now.said,
    10_000
  ).catch(rowSays);
  on.kit.check(
    'page only: a comment written while the page\'s link is down stands only on the page; its row says "Not sent: …" why, with Try again, and it stays through a reload',
    !heldBefore &&
      !!down.said?.startsWith(`${commentWords.notSentHead} `) &&
      down.send === commonWords.tryAgain &&
      !!kept &&
      !!afterReload.said?.startsWith(`${commentWords.notSentHead} `) &&
      afterReload.send === commonWords.tryAgain,
    `before ${JSON.stringify(down)}; on the hub ${heldBefore}; after a reload ${JSON.stringify(afterReload)}; kept ${!!kept}`
  );
  // The link back: Try again takes it to the hub, then to the session.
  link.down = false;
  const rail = await rowsOf(there);
  await rail
    .locator(
      'li:has([data-slot="pin-row"][data-pin-row="3"]) [data-slot="pin-retry"]'
    )
    .click();
  const sent = again
    ? await until(
        "the page-only comment sent",
        async () => pinNumbered((await docOf(again)).pins, 3),
        (pin) => !!pin?.sentAt,
        DELIVERY_MS
      ).catch(() => undefined)
    : undefined;
  on.kit.check(
    "page only: with its link back, Try again takes the comment to the hub and sends it",
    !!sent?.sentAt,
    `sentAt ${String(sent?.sentAt)}`
  );
  await tab.close();
};

/** A comment's pin written straight into the page's doc, as a page can: its one entry `text`. */
const writePin = (frame: Frame, number: number, text: string) =>
  frame.evaluate(
    ({ n, words }) => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (name: string) => {
                set: (k: string, v: unknown) => void;
              };
            };
          };
        }
      ).cawcoArtifact;
      const id = `probe-refused-${n}`;
      const at = new Date().toISOString();
      doc.getMap("pins").set(id, {
        id,
        number: n,
        kind: "comment",
        anchor: { selector: "#one", source: null, text: "The first paragraph" },
        at,
        by: "person",
        elements: [],
        thread: [{ id: `${id}-1`, by: "person", text: words, at }],
      });
      return id;
    },
    { n: number, words: text }
  );

/** Pin `n`'s row in the rail: its "Not sent" line and its Try again, as drawn. */
const notSentRow = async (on: On, n: number) => {
  const rail = await rowsOf(on);
  const row = rail.locator(
    `li:has([data-slot="pin-row"][data-pin-row="${n}"])`
  );
  return {
    said:
      (
        await row
          .locator("[data-not-sent]")
          .textContent()
          .catch(() => null)
      )?.trim() ?? null,
    send:
      (
        await row
          .locator('[data-slot="pin-retry"]')
          .textContent()
          .catch(() => null)
      )?.trim() ?? null,
  };
};

/**
 * A refused write keeps the comment (research/pi-durable.md §13.9 C): a
 * comment the hub won't keep (its words past what an entry holds) is never
 * let go when the page starts again from the hub's doc; its row says why in
 * the hub's words with Try again, through a reload; Try again writes it
 * once more, and refused again it is still kept, saying why.
 */
const refusedChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "refused",
    html: SEND_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const frame = await frameHolding(on.page, id, "the refused page in the pane");
  if (!frame) {
    on.kit.check("refused: the page is shown", false, made.slice(0, 300));
    return;
  }
  await frame.waitForSelector("#one");
  const pinId = await writePin(frame, 1, "x".repeat(2001));
  const told = await until(
    "the refused comment's row saying why",
    () => notSentRow(on, 1),
    (now) => !!now.said,
    15_000
  ).catch(() => notSentRow(on, 1));
  const onHub = !!(await docOf(frame)).pins[pinId];
  await shutList(on);
  const { origin } = new URL(on.page.url());
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const back = await frameHolding(
    on.page,
    id,
    "the refused page after a reload"
  );
  const afterReload = back
    ? await until(
        "the refused comment's row after a reload",
        () => notSentRow(on, 1),
        (now) => !!now.said,
        15_000
      ).catch(() => notSentRow(on, 1))
    : { said: null, send: null };
  on.kit.check(
    'refused: a comment the hub refuses is kept on the device, never let go: its row says "Not sent: …" in the hub\'s words with Try again, and still after a reload; the hub holds none of it',
    !onHub &&
      !!told.said?.startsWith(`${commentWords.notSentHead} `) &&
      told.send === commonWords.tryAgain &&
      afterReload.said === told.said &&
      afterReload.send === commonWords.tryAgain,
    `first ${JSON.stringify(told)}; after a reload ${JSON.stringify(afterReload)}; on the hub ${onHub}`
  );
  // Try again: written once more, refused once more, still kept and saying why.
  await (
    await rowsOf(on)
  )
    .locator(
      'li:has([data-slot="pin-row"][data-pin-row="1"]) [data-slot="pin-retry"]'
    )
    .click();
  await settle(on.page, 4000);
  const again = await until(
    "the comment kept after Try again",
    () => notSentRow(on, 1),
    (now) => !!now.said,
    15_000
  ).catch(() => notSentRow(on, 1));
  on.kit.check(
    "refused: Try again writes it once more; refused again, it is still kept with why and Try again",
    !!again.said?.startsWith(`${commentWords.notSentHead} `) &&
      again.send === commonWords.tryAgain,
    JSON.stringify(again)
  );
  // Its thread's Delete lets it go from the device.
  await (
    await rowsOf(on)
  )
    .locator('[data-slot="pin-row"][data-pin-row="1"]')
    .click();
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.locator('[data-slot="delete"]').click();
  await card
    .locator('[data-ask="delete"]')
    .getByRole("button", { name: commentWords.deleteComment })
    .click();
  const left = await until(
    "the refused comment's row gone",
    async () =>
      (await on.page
        .locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`)
        .count()) === 0,
    Boolean,
    8000
  ).catch(() => false);
  const kept = await (
    (await frameHolding(on.page, id, "the refused page after its delete")) ??
    frame
  ).evaluate((aid) => localStorage.getItem(`cawco-refused-pins:${aid}`), id);
  on.kit.check(
    "refused: its thread's Delete lets the refused comment go: its row leaves and the device keeps none of it",
    left && kept === null,
    `row gone ${left}; kept ${String(kept).slice(0, 120)}`
  );
  await shutList(on);
};

/**
 * A hub restart between the marking and the delivery keeps the marks'
 * pictures (research/pi-durable.md §13.9 C). The comment is written while
 * the page's doc link is held down, so the hub can't deliver it before the
 * restart: its picture reaches the hub's disk all the same, over the page's
 * own post (overlay page.ts `postPictures`); the hub stops and starts; with
 * the link let through, the comment reaches the hub and goes to the session
 * by itself, with the picture the hub kept through its restart.
 */
const restartChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "restart-keeps",
    html: SEND_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const { origin } = new URL(on.page.url());
  const tab = await on.kit.page("desk");
  const link: { down: boolean } = { down: true };
  await tab.routeWebSocket(PAGE_SOCKET, (ws) => {
    if (link.down) {
      ws.close({ code: 1011, reason: "The probe held the page's link." });
      return;
    }
    ws.connectToServer();
  });
  const there: On = { ...on, page: tab };
  await open(tab, `${origin}/session/${on.session}`, COMPOSER);
  const frame = await frameHolding(tab, id, "the restart page, its link held");
  if (!frame) {
    on.kit.check("restart: the page is shown", false, made.slice(0, 300));
    await tab.close();
    return;
  }
  await frame.waitForSelector("#one");
  await tab.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  const b = await screenBox(there, frame, "#one");
  const heardBefore = heard.length;
  await commentAt(
    there,
    frame,
    b.x + b.w * 0.3,
    b.y + b.h / 2,
    "Keep my picture through a restart."
  );
  await tab.keyboard.press("Escape");
  const marks = join(
    dirname(on.fleet.env.CAWCO_DB_PATH as string),
    "artifacts",
    id,
    "marks"
  );
  const pin = await until(
    "the comment in the page's doc",
    async () => pinNumbered((await docOf(frame)).pins, 1),
    Boolean,
    10_000
  ).catch(() => undefined);
  const onDisk = await until(
    "its picture on the hub's disk",
    () =>
      existsSync(marks) &&
      readdirSync(marks).some(
        (name) => name === `${encodeURIComponent(pin?.id ?? "")}.png`
      ),
    Boolean,
    15_000
  ).catch(() => false);
  const early = heard
    .slice(heardBefore)
    .filter(
      (one) => NOTICE.test(one.last) && one.last.includes("restart-keeps")
    ).length;
  const saidBefore = on.said.length;
  await on.fleet.stop("hub");
  on.fleet.launch("hub");
  await on.fleet.hubUp();
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  // The hub down a moment, on purpose: the page's failed requests and sockets then are the restart's, not an error of the pages.
  const during = on.said.splice(saidBefore);
  on.said.push(...during.filter((line) => !HUB_DOWN.test(line)));
  // The link let through: the comment reaches the hub, then the session.
  link.down = false;
  const delivered = await until(
    "the delivery after the restart",
    () =>
      heard
        .slice(heardBefore)
        .find(
          (one) => NOTICE.test(one.last) && one.last.includes("restart-keeps")
        ),
    Boolean,
    DELIVERY_MS * 2
  ).catch(() => undefined);
  const pictures = delivered?.body.match(IMAGE_BLOCK)?.length ?? 0;
  // The pane may have drawn its page again over the hub's restart: read the frame it holds now.
  const sent = await until(
    "the comment stamped sent",
    async () => {
      const now = await frameHolding(
        tab,
        id,
        "the restart page, its link back"
      );
      if (!now) {
        return null;
      }
      try {
        return pinNumbered((await docOf(now)).pins, 1);
      } catch {
        // Drawn again while read: the next look reads the new one.
        return null;
      }
    },
    (now) => !!now?.sentAt,
    20_000
  ).catch(() => undefined);
  on.kit.check(
    "restart: written while the page's link is held, a comment's picture is on the hub's disk once the page posts it and nothing is delivered; after the hub stops and starts and the link is let through, the comment goes by itself with its picture",
    !!pin &&
      onDisk &&
      early === 0 &&
      !!delivered?.last.includes("Keep my picture through a restart.") &&
      pictures >= 1 &&
      !!sent?.sentAt,
    `pin ${String(pin?.id)}; on disk ${onDisk}; delivered before the restart ${early}; delivered ${!!delivered}; pictures ${pictures}; sentAt ${String(sent?.sentAt)}`
  );
  await tab.close();
  await shutList(on);
};

/** What a page says while the hub is down for a restart: a failed request or socket to it. */
const HUB_DOWN =
  /status of 502|ERR_CONNECTION_REFUSED|Connection closed before receiving a handshake response|WebSocket is closed before the connection is established/;

/** The thread head's controls by their names, and each one's top. */
const threadHead = (card: Locator) =>
  card.evaluate((el) => {
    const head = el.querySelector('[data-slot="head"]');
    const buttons = [...(head?.querySelectorAll("button[aria-label]") ?? [])];
    return {
      named: buttons.map((button) => button.getAttribute("aria-label") ?? ""),
      tops: buttons.map((button) =>
        Math.round(button.getBoundingClientRect().top)
      ),
    };
  });

/**
 * Delete is one press in the thread's head (the owner's "deleting the
 * thread shouldn't be two clicks hidden"): Resolve, Delete comment, ⋯ and
 * Close stand on the head's row; ⋯ keeps Copy link alone; one press on
 * Delete asks in the card itself ("Delete comment N?", no dialog, DESIGN.md
 * A thread beside its pin), and its confirm deletes the pin. On the desk,
 * and on the phone's foot sheet.
 */
const deleteHeadChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "delete-head",
    html: SEND_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const frame = await frameHolding(on.page, id, "the delete page in the pane");
  if (!frame) {
    on.kit.check("delete: the page is in the pane", false, made.slice(0, 300));
    return;
  }
  await on.page.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  for (const selector of ["#one", "#two"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one comment, then the next
    const b = await screenBox(on, frame, selector);
    await commentAt(on, frame, b.x + b.w * 0.3, b.y + b.h / 2, "Delete me.");
  }
  await on.page.keyboard.press("Escape");
  await on.page.locator(`${PANE} [role='tab'][aria-keyshortcuts='V']`).click();
  await pageInComment(frame, false);
  const pinsNow = async () => (await docOf(frame)).pins;
  /** Pin `n`'s thread, its head read, Delete pressed once, its ask confirmed: what each step showed. */
  const deleteOne = async (screen: Page, where: Frame, n: number) => {
    const card = await openThread({ ...on, page: screen }, where, n);
    const head = await threadHead(card);
    await card
      .locator(`[data-slot="head"] button[aria-label="More for comment ${n}"]`)
      .click()
      .catch(() => undefined);
    const menu = await screen
      .getByRole("menuitem")
      .allTextContents()
      .catch(() => [] as string[]);
    await screen.keyboard.press("Escape");
    await card.locator('[data-slot="delete"]').click();
    const ask = card.locator('[data-ask="delete"]');
    const asked = await ask
      .waitFor({ timeout: 3000 })
      .then(() => ask.textContent())
      .catch(() => null);
    const blocking = await screen.evaluate(
      () =>
        document.querySelectorAll("dialog[open], [aria-modal='true']").length
    );
    const pin = pinNumbered(await pinsNow(), n);
    await ask.getByRole("button", { name: commentWords.deleteComment }).click();
    const left = await until(
      `pin ${n} deleted`,
      pinsNow,
      (pins) => !pinNumbered(pins, n),
      5000
    ).catch(pinsNow);
    return {
      head,
      menu: menu.map((item) => item.trim()),
      asked: asked?.includes(commentWords.deleteTitle(n)) ?? false,
      blocking,
      deleted: !!pin && !pinNumbered(left, n),
    };
  };
  const desk = await deleteOne(on.page, frame, 1);
  on.kit.check(
    'delete (desk): the thread\'s head holds Resolve, Delete comment, ⋯ and Close on one row; ⋯ keeps Copy link alone; one press on Delete asks in the card ("Delete comment 1?", no dialog), and its confirm deletes the pin',
    JSON.stringify(desk.head.named.filter((name) => name !== "")) ===
      JSON.stringify([
        "Resolve",
        commentWords.deleteComment,
        "More for comment 1",
        "Close",
      ]) &&
      new Set(desk.head.tops).size === 1 &&
      JSON.stringify(desk.menu) === JSON.stringify([commonWords.copyLink]) &&
      desk.asked &&
      desk.blocking === 0 &&
      desk.deleted,
    JSON.stringify(desk)
  );

  const phone = await on.kit.page("phone");
  const { origin } = new URL(on.page.url());
  await open(phone, `${origin}/session/${on.session}`, COMPOSER);
  const onPhone = await frameHolding(phone, id, "the delete page on the phone");
  if (!onPhone) {
    on.kit.check(
      "delete (phone): the page is on the phone",
      false,
      "not shown"
    );
    await phone.close();
    return;
  }
  await onPhone.waitForSelector("#two");
  await settle(phone, 600);
  const small = await deleteOne(phone, onPhone, 2);
  const target = await phone
    .locator('[data-slot="pin-card"] [data-slot="delete"]')
    .boundingBox()
    .catch(() => null);
  on.kit.check(
    "delete (phone): the thread's sheet holds Delete comment in its head; one tap asks in the sheet (no dialog), and its confirm deletes the pin",
    small.head.named.includes(commentWords.deleteComment) &&
      JSON.stringify(small.menu) === JSON.stringify([commonWords.copyLink]) &&
      small.asked &&
      small.blocking === 0 &&
      small.deleted,
    `${JSON.stringify(small)}; delete box after ${JSON.stringify(target)}`
  );
  await phone.close();
};

/** The pane's own doc socket on the dashboard's origin (dashboard artifact-doc.ts `joinArtifact`): its other link to the hub. */
const PANE_SOCKET = /\/ws\/artifact\//;

/** The send page revised: its first paragraph under another id, its words kept, so a load finds it by its text and writes its pin again. */
const REVISED_SEND_PAGE = SEND_PAGE.replace('id="one"', 'id="first"');

/** The probe's close of a dropped link. */
const DROPPED = { code: 1011, reason: "The probe dropped the link." };

/**
 * A desk of its own (its own browser context, so its own device copies of
 * the doc) whose links to the hub, the page's doc socket and the pane's,
 * drop at the probe's word and come back at it.
 */
const deviceWithLink = async (on: On) => {
  const tab = await on.kit.page("desk");
  const link: { down: boolean } = { down: false };
  const live = new Set<WebSocketRoute>();
  const route = (ws: WebSocketRoute) => {
    if (link.down) {
      ws.close(DROPPED).catch(() => undefined);
      return;
    }
    live.add(ws);
    ws.connectToServer();
  };
  await tab.routeWebSocket(PAGE_SOCKET, route);
  await tab.routeWebSocket(PANE_SOCKET, route);
  return {
    tab,
    there: { ...on, page: tab } as On,
    down: async () => {
      link.down = true;
      await Promise.all(
        [...live].map((ws) => ws.close(DROPPED).catch(() => undefined))
      );
      live.clear();
    },
    up: () => {
      link.down = false;
    },
  };
};
type Device = Awaited<ReturnType<typeof deviceWithLink>>;

/** What the hub holds of artifact `id`: its update log applied in order, read for its pins and its tombstones. */
const hubHolds = (on: On, id: string) => {
  const doc = new Doc();
  try {
    for (const { update } of on.fleet.query<{ update: Uint8Array }>(
      'SELECT "update" FROM artifact_updates WHERE artifact_id = ? ORDER BY seq',
      id
    )) {
      applyUpdate(doc, update);
    }
    return {
      pins: doc.getMap("pins").toJSON() as Pins,
      gone: doc.getMap("gone").toJSON() as Record<string, string>,
    };
  } finally {
    doc.destroy();
  }
};

/** Whether the page's doc holds pin `pin`, holds its tombstone, and draws its pill. */
const pageHolds = (frame: Frame, pin: string) =>
  frame.evaluate((id) => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (name: string) => { has: (key: string) => boolean } };
        };
      }
    ).cawcoArtifact;
    return {
      pin: doc.getMap("pins").has(id),
      gone: doc.getMap("gone").has(id),
      drawn:
        document.querySelectorAll(
          `:is(svg[data-cawco-pins], svg[data-cawco-pins-fixed]) g[data-pin-id="${CSS.escape(id)}"]`
        ).length > 0,
    };
  }, pin);

/** The page's doc's link to the hub now (overlay artifact.ts `Link`). */
const pageLink = (frame: Frame) =>
  frame.evaluate(() => {
    let state = "";
    const global = (
      window as unknown as {
        cawcoArtifact?: {
          subscribe: (
            holder: (hold: { link: { state: string } }) => void
          ) => () => boolean;
        };
      }
    ).cawcoArtifact;
    global?.subscribe((hold) => {
      ({ state } = hold.link);
    })?.();
    return state;
  });

/** The revised page on `screen` once it is shown and its link has synced: what a load there holds of pin `pin`. */
const loadedHolds = async (
  screen: Page,
  id: string,
  pin: string,
  what: string
) => {
  const frame = await frameHolding(screen, id, what);
  if (!frame) {
    return null;
  }
  await frame.waitForSelector("#first").catch(() => undefined);
  const link = await until(
    `${what}: its link synced`,
    () => pageLink(frame),
    (state) => state === "synced",
    20_000
  ).catch(() => pageLink(frame));
  // Its pins placed again and its device's copy merged: the time a stale load writes in.
  await settle(screen, 1500);
  return { link, ...(await pageHolds(frame, pin)) };
};

/** A fresh browser (no device copy of the doc): what its load of the page holds of pin `pin`. */
const freshHolds = async (on: On, id: string, pin: string, what: string) => {
  const tab = await on.kit.page("desk");
  try {
    const { origin } = new URL(on.page.url());
    await open(tab, `${origin}/session/${on.session}`, COMPOSER);
    return await loadedHolds(tab, id, pin, what);
  } finally {
    await tab.close();
  }
};

/** A page made, shown on a device of its own, and commented on there: the comment's pin once the hub holds it. */
const pinnedOnDevice = async (
  on: On,
  name: string
): Promise<{
  device: Device;
  frame: Frame;
  id: string;
  pin: string;
} | null> => {
  const made = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name,
    html: SEND_PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const device = await deviceWithLink(on);
  const { origin } = new URL(on.page.url());
  await open(device.tab, `${origin}/session/${on.session}`, COMPOSER);
  const frame = await frameHolding(device.tab, id, `the ${name} page`);
  if (!frame) {
    on.kit.check(`${name}: the page is shown`, false, made.slice(0, 300));
    await device.tab.close();
    return null;
  }
  await frame.waitForSelector("#one");
  await device.tab.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await pageInComment(frame, true);
  const b = await screenBox(device.there, frame, "#one");
  await commentAt(
    device.there,
    frame,
    b.x + b.w * 0.3,
    b.y + b.h / 2,
    "Delete me while the link is down."
  );
  await device.tab.keyboard.press("Escape");
  await device.tab
    .locator(`${PANE} [role='tab'][aria-keyshortcuts='V']`)
    .click();
  await pageInComment(frame, false);
  const pin = await until(
    `the ${name} comment on the hub`,
    () => pinNumbered(hubHolds(on, id).pins, 1)?.id,
    Boolean,
    20_000
  ).catch(() => undefined);
  if (!pin) {
    on.kit.check(`${name}: the comment reaches the hub`, false, "not held");
    await device.tab.close();
    return null;
  }
  return { device, frame, id, pin };
};

/** Until the hub holds pin `pin` deleted: gone from its pins, its tombstone kept. */
const hubLetsGo = (on: On, id: string, pin: string) =>
  until(
    "the hub holding the pin deleted",
    () => hubHolds(on, id),
    (held) => !held.pins[pin] && !!held.gone[pin],
    20_000
  ).catch(() => hubHolds(on, id));

/**
 * A deletion stays deleted (the owner's deleted pin that came back), on one
 * device: deleted through the page's own doc (the app's `cawco:delete`) while
 * the page's and the pane's links to the hub are down, it leaves the page and
 * its tombstone stays on the device. The agent revises the page, so a load
 * finds the comment's paragraph by its text under another id and writes its
 * pin again; the page reloaded with the link still down, the hub's embedded
 * copy still holding the pin, it waits for the device's copy and holds and
 * draws none of it. The link back and a reload again: the pin is gone from
 * the page, from the hub (its tombstone kept), and from a second browser.
 */
const deletedOnOneDevice = async (on: On) => {
  const set = await pinnedOnDevice(on, "tombstone-one");
  if (!set) {
    return;
  }
  const { device, id, pin } = set;
  const { origin } = new URL(on.page.url());
  const url = `${origin}/session/${on.session}`;
  await device.down();
  const lost = await until(
    "the page's link down",
    () => pageLink(set.frame),
    (state) => state === "lost",
    20_000
  ).catch(() => pageLink(set.frame));
  const deleted = await askPage(
    device.tab,
    set.frame,
    { type: "cawco:delete", pin },
    "cawco:delete-result"
  );
  const right = await pageHolds(set.frame, pin);
  await on.call(UPDATE, { id, html: REVISED_SEND_PAGE });
  const hubWhileDown = !!hubHolds(on, id).pins[pin];
  await open(device.tab, url, COMPOSER);
  const reloaded = await frameHolding(
    device.tab,
    id,
    "the tombstone page reloaded, its link down"
  );
  await reloaded?.waitForSelector("#first").catch(() => undefined);
  await settle(device.tab, 1500);
  const downLoad = reloaded ? await pageHolds(reloaded, pin) : null;
  on.kit.check(
    "tombstone (one device): deleted through the page's own doc while its links to the hub are down, the pin leaves the page and its tombstone stays; reloaded with the link still down (the hub still holding the pin, the page revised so a load places it again), the page holds and draws none of it",
    lost === "lost" &&
      deleted?.ok === true &&
      !right.pin &&
      right.gone &&
      hubWhileDown &&
      !!downLoad &&
      !downLoad.pin &&
      !downLoad.drawn,
    `link ${lost}; delete ${JSON.stringify(deleted)}; after it ${JSON.stringify(right)}; the hub held it ${hubWhileDown}; after the reload ${JSON.stringify(downLoad)}`
  );
  device.up();
  const onHub = await hubLetsGo(on, id, pin);
  await open(device.tab, url, COMPOSER);
  const upLoad = await loadedHolds(
    device.tab,
    id,
    pin,
    "the tombstone page reloaded, its link back"
  );
  const other = await freshHolds(on, id, pin, "a second browser");
  on.kit.check(
    "tombstone (one device): with the link back and a reload again, the pin stays gone: from the page (none drawn), from the hub (its tombstone kept) and from a second browser's page",
    !onHub.pins[pin] &&
      !!onHub.gone[pin] &&
      upLoad?.link === "synced" &&
      !upLoad.pin &&
      !upLoad.drawn &&
      other?.link === "synced" &&
      !other.pin &&
      !other.drawn,
    `hub pin ${!!onHub.pins[pin]} tombstone ${String(onHub.gone[pin])}; the page ${JSON.stringify(upLoad)}; a second browser ${JSON.stringify(other)}`
  );
  await device.tab.close();
};

/**
 * The same across devices: the person deletes the pin in one desk's thread
 * while that desk's links to the hub are down; the agent revises the page,
 * and another desk, its link up, loads it while the hub still holds the pin,
 * so its load writes the pin again on the hub (the stale "present"). The
 * first desk's link back, its tombstone undoes that write: the pin is gone
 * from the second desk's page as it stands, from the hub (its tombstone
 * kept), from the first desk's page reloaded, and from a third browser.
 */
const deletedOnAnother = async (on: On) => {
  const set = await pinnedOnDevice(on, "tombstone-two");
  if (!set) {
    return;
  }
  const { device: first, id, pin } = set;
  const { origin } = new URL(on.page.url());
  const url = `${origin}/session/${on.session}`;
  await first.down();
  const lost = await until(
    "the first desk's link down",
    () => pageLink(set.frame),
    (state) => state === "lost",
    20_000
  ).catch(() => pageLink(set.frame));
  // Deleted as the person deletes, in its thread: the first desk's pane's doc and its device copy hold the deletion.
  const card = await openThread(first.there, set.frame, 1);
  await card.locator('[data-slot="delete"]').click();
  // The ask's confirm: its action that isn't Cancel (AskHere.svelte).
  await card
    .locator(
      '[data-ask="delete"] [data-slot="actions"] button:not([data-ask-cancel])'
    )
    .click();
  const closed = await card
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await on.call(UPDATE, { id, html: REVISED_SEND_PAGE });
  const second = await on.kit.page("desk");
  await open(second, url, COMPOSER);
  const there = await frameHolding(
    second,
    id,
    "the tombstone page on the second desk"
  );
  const stale = await until(
    "the second desk's load writing the pin again on the hub",
    () => hubHolds(on, id).pins[pin],
    (held) =>
      (held.anchor as { selector?: string } | undefined)?.selector === "#first",
    20_000
  ).catch(() => undefined);
  first.up();
  const onHub = await hubLetsGo(on, id, pin);
  const onSecond = there
    ? await until(
        "the second desk letting the pin go",
        () => pageHolds(there, pin),
        (held) => !(held.pin || held.drawn),
        20_000
      ).catch(() => pageHolds(there, pin))
    : null;
  await open(first.tab, url, COMPOSER);
  const onFirst = await loadedHolds(
    first.tab,
    id,
    pin,
    "the tombstone page on the first desk, reloaded"
  );
  const third = await freshHolds(on, id, pin, "a third browser");
  on.kit.check(
    "tombstone (two devices): deleted in one desk's thread while its links are down, then written again on the hub by another desk's load of the revised page; with the first desk's link back the pin is gone from the second desk's page, from the hub (its tombstone kept), from the first desk's page reloaded and from a third browser",
    lost === "lost" &&
      closed &&
      !!stale &&
      !onHub.pins[pin] &&
      !!onHub.gone[pin] &&
      !!onSecond &&
      !onSecond.pin &&
      !onSecond.drawn &&
      onFirst?.link === "synced" &&
      !onFirst.pin &&
      !onFirst.drawn &&
      third?.link === "synced" &&
      !third.pin &&
      !third.drawn,
    `link ${lost}; thread closed ${closed}; the stale write ${JSON.stringify((stale?.anchor as { selector?: string } | undefined)?.selector)}; hub pin ${!!onHub.pins[pin]} tombstone ${String(onHub.gone[pin])}; second desk ${JSON.stringify(onSecond)}; first desk ${JSON.stringify(onFirst)}; a third browser ${JSON.stringify(third)}`
  );
  await second.close();
  await first.tab.close();
};

/*
 * Changed since you looked, on a canvas: the agent's updates mark their
 * elements under the canvas's scene version; the canvas page washes them in
 * the scene's coordinates and steps through them with the same tag.
 */

/** The canvas in the panel, by its artifact. */
const canvasFrameOf = (screen: Page, id: string, what: string) =>
  until(
    what,
    async () => {
      const sel = `[data-slot="canvas-stage"][data-artifact="${id}"] iframe`;
      if ((await screen.locator(sel).count()) === 0) {
        return null;
      }
      const frame = await (
        await screen.locator(sel).first().elementHandle()
      )?.contentFrame();
      if (!frame) {
        return null;
      }
      let ready = false;
      try {
        ready = await frame.evaluate(
          () =>
            "cawcoCanvasProbe" in window &&
            !!document.querySelector(".canvas-host .excalidraw")
        );
      } catch {
        return null;
      }
      return ready ? frame : null;
    },
    Boolean,
    60_000
  ).catch(() => null) as Promise<Frame | null>;

/** What the canvas's doc says of its changes and the looks at them, its washes in the view's px, its elements' boxes there, and its tag. */
const canvasChangesRead = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => {
              get: (k: string) => unknown;
              toJSON: () => Record<string, string[]>;
            };
          };
        };
      }
    ).cawcoArtifact;
    const probe = (
      window as unknown as {
        cawcoCanvasProbe: {
          api: {
            getAppState: () => {
              scrollX: number;
              scrollY: number;
              selectedElementIds: Record<string, boolean>;
              zoom: { value: number };
            };
            getSceneElements: () => {
              height: number;
              id: string;
              isDeleted?: boolean;
              width: number;
              x: number;
              y: number;
            }[];
          };
        };
      }
    ).cawcoCanvasProbe;
    const changes = doc.getMap("meta").get("changes") as {
      items: { anchor: string; kind: string; label: string }[];
      revision: number;
    } | null;
    const state = probe.api.getAppState();
    const zoom = state.zoom.value;
    const boxes = Object.fromEntries(
      probe.api
        .getSceneElements()
        .filter((el) => !el.isDeleted)
        .map((el) => [
          el.id,
          {
            x: (el.x + state.scrollX) * zoom,
            y: (el.y + state.scrollY) * zoom,
            w: el.width * zoom,
            h: el.height * zoom,
          },
        ])
    );
    const washes = [
      ...document.querySelectorAll("svg[data-canvas-changes] [data-change]"),
    ].map((shape) => ({
      anchor: shape.getAttribute("data-change") ?? "",
      tag: shape.tagName,
      fill: getComputedStyle(shape).fill,
      pointer: getComputedStyle(shape).pointerEvents,
      box: (() => {
        const r = (shape as SVGGraphicsElement).getBBox();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })(),
    }));
    return {
      changes,
      sceneVersion: doc.getMap("meta").get("sceneVersion") as number | null,
      seen: changes
        ? (doc.getMap("seen").toJSON()[String(changes.revision)] ?? [])
        : [],
      washes,
      boxes,
      selected: Object.keys(state.selectedElementIds).filter(
        (key) => state.selectedElementIds[key]
      ),
      tag:
        document
          .querySelector('[data-slot="changes-tag"] [data-slot="change-count"]')
          ?.textContent?.trim() ?? null,
    };
  });

/** WCAG 2 contrast of the canvas's ink over its ground with the change wash over both, by day and by night, in the canvas page's own tokens. */
const canvasInkUnderWash = (frame: Frame) =>
  frame.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (!paint) {
      return null;
    }
    const pixel = (...layers: string[]) => {
      paint.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        paint.fillStyle = layer;
        paint.fillRect(0, 0, 1, 1);
      }
      const [r = 0, g = 0, b = 0] = paint.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const root = document.documentElement;
    const was = root.style.colorScheme;
    const out: Record<string, number> = {};
    for (const scheme of ["light", "dark"] as const) {
      root.style.colorScheme = scheme;
      const probe = document.createElement("span");
      probe.style.color = "var(--ink-strong)";
      probe.style.background = "var(--surface-raised)";
      probe.style.borderColor = "var(--c-change-wash)";
      probe.style.borderStyle = "solid";
      document.body.append(probe);
      const own = getComputedStyle(probe);
      const ink = own.color;
      const ground = own.backgroundColor;
      const wash = own.borderTopColor;
      probe.remove();
      const text = lum(pixel(ground, ink, wash));
      const under = lum(pixel(ground, wash));
      out[scheme === "light" ? "day" : "night"] =
        Math.round(
          ((Math.max(text, under) + 0.05) / (Math.min(text, under) + 0.05)) *
            100
        ) / 100;
    }
    root.style.colorScheme = was;
    return out;
  });

/**
 * Canvas (5, on a canvas): two agent updates (Beta's label rewritten,
 * Delta put in; then Gamma taken out) mark their elements under the scene
 * version, the second carrying what the first marked; coming back, Beta and
 * Delta wear the wash on their own boxes, the ink 4.5:1 through it, and it
 * pans and zooms with the scene; the tag counts three and steps through
 * them, each seen in the doc, a selection a look too, the wash fading over
 * `--dur-fade`; every stop seen, the tag leaves, and a reload washes nothing.
 */
const canvasChangedChecks = async (on: On, pageId: string) => {
  const { origin } = new URL(on.page.url());
  const labelled = (key: string, x: number, y: number, text: string) => ({
    type: "rectangle",
    id: key,
    x,
    y,
    width: 160,
    height: 60,
    label: { text },
  });
  const made = await on.call(CREATE, {
    kind: "canvas",
    does: "draw",
    ask: "Draw on this canvas",
    name: "changed-canvas",
    elements: [
      labelled("a", 40, 40, "Alpha stays"),
      labelled("b", 40, 160, "Beta first"),
      { type: "ellipse", id: "g", x: 280, y: 40, width: 120, height: 80 },
    ],
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  await canvasFrameOf(on.page, id, "the canvas in the panel");
  await on.call(UPDATE, {
    id,
    elements: [
      labelled("b", 40, 160, "Beta again"),
      labelled("c", 40, 280, "Delta new"),
    ],
  });
  await on.call(UPDATE, { id, delete: ["g"] });
  // Coming back to it.
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  await restSplit(on);
  const frame = await canvasFrameOf(on.page, id, "the canvas after a reload");
  if (!frame) {
    on.kit.check("canvas changed: the canvas is in the panel", false, "none");
    return;
  }
  const before = await until(
    "the canvas's washes",
    () => canvasChangesRead(frame),
    (read) => read.washes.length === 2,
    15_000
  ).catch(() => null);
  const items = before?.changes?.items ?? [];
  const placed = (before?.washes ?? []).every((wash) => {
    const el = before?.boxes[wash.anchor];
    return !!el && near(wash.box, el, 1) && wash.pointer === "none";
  });
  const contrast = await canvasInkUnderWash(frame);
  on.kit.check(
    "canvas changed: two agent updates mark Beta, Delta and the gone ellipse under the scene version (2, the second carrying the first's); coming back, Beta and Delta wear the wash (c-change-wash) on their own boxes, taking no press, the ink 4.5:1 or better through it by day and by night; the canvas's tag reads \"3 changed since you looked\"",
    JSON.stringify(
      items.map((item) => [
        item.kind,
        item.anchor.startsWith("removed:") ? "removed" : item.anchor,
      ])
    ) ===
      JSON.stringify([
        ["canvas", "b"],
        ["canvas", "c"],
        ["removed", "removed"],
      ]) &&
      before?.sceneVersion === 2 &&
      before.changes?.revision === 2 &&
      JSON.stringify(before.washes.map((wash) => wash.anchor).sort()) ===
        JSON.stringify(["b", "c"]) &&
      placed &&
      (contrast?.day ?? 0) >= 4.5 &&
      (contrast?.night ?? 0) >= 4.5 &&
      before.tag === "3 changed since you looked",
    `items ${JSON.stringify(items)}; version ${before?.sceneVersion}; washes ${JSON.stringify(before?.washes)}; boxes ${JSON.stringify(before?.boxes)}; contrast ${JSON.stringify(contrast)}; tag ${before?.tag}`
  );

  // Panned and zoomed, the wash stays on its element.
  await frame.evaluate(() => {
    const { api } = (
      window as unknown as {
        cawcoCanvasProbe: {
          api: {
            getAppState: () => { scrollX: number; scrollY: number };
            updateScene: (scene: object) => void;
          };
        };
      }
    ).cawcoCanvasProbe;
    const state = api.getAppState();
    api.updateScene({
      appState: {
        scrollX: state.scrollX + 120,
        scrollY: state.scrollY + 40,
        zoom: { value: 1.5 },
      },
    });
  });
  const moved = await until(
    "the washes after a pan and a zoom",
    () => canvasChangesRead(frame),
    (read) =>
      read.washes.length === 2 &&
      read.washes.every((wash) => {
        const el = read.boxes[wash.anchor];
        return !!el && near(wash.box, el, 1);
      }),
    5000
  ).catch(() => null);
  on.kit.check(
    "canvas changed: panned and zoomed (1.5), each wash stands on its element's box as the view draws it now (±1px)",
    !!moved,
    JSON.stringify(moved?.washes)
  );

  // A step: Beta (the first in reading order) brought out, selected, seen, its wash fading over --dur-fade.
  await frame.evaluate(() => {
    const leaving: string[] = [];
    (window as unknown as { probeLeaving: string[] }).probeLeaving = leaving;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.hasAttribute("data-leaving")) {
            leaving.push(getComputedStyle(node).animationDuration);
          }
        }
      }
    }).observe(document.querySelector("svg[data-canvas-changes]") as Element, {
      childList: true,
    });
  });
  await frame.locator('[data-slot="change-next"]').click();
  const stepped = await until(
    "Beta looked at",
    () => canvasChangesRead(frame),
    (read) => read.seen.includes("b"),
    5000
  ).catch(() => null);
  const leaving = await frame.evaluate(
    () => (window as unknown as { probeLeaving: string[] }).probeLeaving
  );
  on.kit.check(
    'canvas changed: a step onto Beta selects it, marks it seen in the doc\'s seen, fades its wash off over --dur-fade (0.2s), and the tag reads "1 of 3"',
    !!stepped &&
      stepped.selected.includes("b") &&
      !stepped.washes.some((wash) => wash.anchor === "b") &&
      leaving.includes("0.2s") &&
      stepped.tag === "1 of 3",
    `seen ${JSON.stringify(stepped?.seen)}; selected ${JSON.stringify(stepped?.selected)}; washes ${JSON.stringify(stepped?.washes.map((wash) => wash.anchor))}; leaving ${JSON.stringify(leaving)}; tag ${stepped?.tag}`
  );

  // The person selecting Delta has looked at it.
  await frame.evaluate(() => {
    const { api } = (
      window as unknown as {
        cawcoCanvasProbe: { api: { updateScene: (scene: object) => void } };
      }
    ).cawcoCanvasProbe;
    api.updateScene({ appState: { selectedElementIds: { c: true } } });
  });
  const selected = await until(
    "Delta looked at by selecting it",
    () => canvasChangesRead(frame),
    (read) => read.seen.includes("c") && read.washes.length === 0,
    5000
  ).catch(() => null);
  await frame.locator('[data-slot="change-next"]').click();
  await frame.locator('[data-slot="change-next"]').click();
  const cleared = await until(
    "every canvas change looked at",
    () => canvasChangesRead(frame),
    (read) => read.seen.length === 3 && read.tag === null,
    5000
  ).catch(() => null);
  await open(on.page, `${origin}/session/${on.session}`, COMPOSER);
  const again = await canvasFrameOf(on.page, id, "the canvas, all seen");
  await settle(on.page, 1500);
  const still = again ? await canvasChangesRead(again) : null;
  on.kit.check(
    "canvas changed: selecting Delta is a look at it; every stop stepped onto, all three are seen and the tag leaves; coming back washes nothing and draws no tag",
    !!selected &&
      !!cleared &&
      !!still &&
      still.washes.length === 0 &&
      still.tag === null,
    `selected ${JSON.stringify(selected?.seen)}; cleared ${JSON.stringify(cleared?.seen)}; after ${JSON.stringify(still && { washes: still.washes, tag: still.tag })}`
  );
  // A page in front again for the legs after, which read its Comments.
  await on.call(SHOW, { id: pageId });
  await frameHolding(on.page, pageId, "the comments page in front again");
};

/*
 * A long name holds its line: every inline chip's label stops at
 * `c-inline-chip-label` with an ellipsis, its whole name its text.
 */

/** The long card's link in a create's answer. */
const LONG_CARD_LINK = /\[[^\]]*\]\(cawco:decision\/[0-9a-f-]+\/long\)/;
/** Forty words, as a long name runs. */
const FORTY_WORDS = Array.from(
  { length: 40 },
  (_, i) =>
    [
      "launch",
      "page",
      "review",
      "for",
      "the",
      "spring",
      "release",
      "and",
      "its",
      "copy",
    ][i % 10]
).join(" ");
/** The longest name an artifact takes (core `ARTIFACT_NAME`: 63 characters), unbroken. */
const LONGEST_NAME =
  "a-name-that-runs-to-every-character-an-artifact-name-may-hold-x";

/** Each chip in the agent's message on `screen`: its box, its label's, its line's, its name and whether its label is cut. */
const chipsRead = (screen: Page, ids: Record<string, string>) =>
  screen.evaluate((wanted) => {
    const scroller = document.querySelector('[data-slot="transcript"]');
    return {
      chips: Object.fromEntries(
        Object.entries(wanted).map(([kind, selector]) => {
          const chip = [...document.querySelectorAll(selector)].at(-1);
          const label = chip?.querySelector('[data-slot="label"]');
          const line = chip?.closest("p, li");
          const r = chip?.getBoundingClientRect();
          const l = label?.getBoundingClientRect();
          const p = line?.getBoundingClientRect();
          const mark = chip?.querySelector('[data-slot="mark"] svg');
          // The chip in an auto-sized grid track, as a canvas's fixture holds
          // one: its track takes its min-content, which a percentage cap
          // never bounds, and must still fit the line's room.
          let track: { room: number; w: number } | null = null;
          if (chip && line?.parentElement) {
            const grid = document.createElement("div");
            grid.style.display = "grid";
            grid.style.gridTemplateColumns = "auto";
            grid.style.justifyContent = "start";
            grid.append(chip.cloneNode(true));
            line.parentElement.append(grid);
            track = {
              w: grid.firstElementChild?.getBoundingClientRect().width ?? 0,
              room: line.parentElement.clientWidth,
            };
            grid.remove();
          }
          return [
            kind,
            chip && r && l && p && label
              ? {
                  chip: { x: r.x, w: r.width, right: r.right },
                  label: l.width,
                  labelMax: Number.parseFloat(getComputedStyle(label).maxWidth),
                  line: { x: p.x, right: p.right },
                  cut: label.scrollWidth > label.clientWidth + 0.5,
                  mark: mark
                    ? Math.round(mark.getBoundingClientRect().width * 10) / 10
                    : null,
                  track,
                  name:
                    chip.getAttribute("aria-label") ??
                    chip.textContent?.trim() ??
                    "",
                }
              : null,
          ];
        })
      ),
      spills: !!scroller && scroller.scrollWidth > scroller.clientWidth + 1,
      pageSpills:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    };
  }, ids);

/**
 * Chip labels (2): a 40-word decision question, a 40-word session title, a
 * pin on 40 words and the longest artifact name, each named by the agent,
 * at 1440 and at 390: every chip stands inside its line, its label at most
 * `c-inline-chip-max-w` (32ch, an absolute length) and cut with an
 * ellipsis, the chip held to its line's room in an auto-sized grid track
 * too, a card's and an artifact's mark 12px, its whole name its accessible
 * name, and nothing spills.
 */
const longNameChecks = async (on: On) => {
  const { origin } = new URL(on.page.url());
  const decided = await on.call(CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick the long one",
    name: "long-question",
    program: `root = Decisions("A long question", [long])
long = Decision("long", "${FORTY_WORDS}?", [yes, no], "It runs long.")
yes = Option("yes", "Yes", "It holds.", true, [], "Nothing.")
no = Option("no", "No", "It spills.", false, [], "A broken line.")`,
  });
  const did = decided.match(ANSWERED_ID)?.[1] ?? "";
  const cardLink = decided.match(LONG_CARD_LINK)?.[0] ?? "";
  const longPage = await on.call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: LONGEST_NAME,
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:18px/1.6 system-ui}main{padding:24px}</style></head><body><main><p id="long">${FORTY_WORDS}.</p></main></body></html>`,
  });
  const pid = longPage.match(ANSWERED_ID)?.[1] ?? "";
  // A pin on the forty words.
  const frame = await frameHolding(on.page, pid, "the long page in the pane");
  const pane = await on.page.locator(FRAME).boundingBox();
  if (frame && pane) {
    await on.page
      .locator(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
      )
      .click();
    await pageInComment(frame, true);
    const words = await boxIn(frame, "#long");
    await commentAt(
      on,
      frame,
      pane.x + words.x + words.w * 0.3,
      pane.y + words.y + words.h / 2,
      "This runs long."
    );
    await interactTab(on).click();
  }
  const pinned = frame ? pinNumbered((await docOf(frame)).pins, 1) : undefined;
  // The session's own title, forty words, as the owner names it.
  const renamed = await on.page.evaluate(
    async ({ session, title }) =>
      (
        await fetch(`/api/instances/${session}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        })
      ).status,
    { session: on.session, title: FORTY_WORDS }
  );
  await agentSays(
    on,
    `Long names: ${cardLink}, [${LONGEST_NAME}](cawco:artifact/${pid}), [the words](cawco:pin/${pid}/1) and [this session](cawco:session/${on.session}).`
  );
  const selectors = {
    card: `[data-decision-chip="${did}/long"]`,
    artifact: `[data-artifact-chip="${pid}"]`,
    pin: `[data-pin-chip="${pid}/1"]`,
    session: `[data-session-chip="${on.session}"]`,
  };
  const held = (
    read: Awaited<ReturnType<typeof chipsRead>>,
    names: Record<string, string>
  ) =>
    Object.entries(read.chips).every(([kind, chip]) => {
      const name = names[kind] ?? "";
      return (
        !!chip &&
        chip.chip.x >= chip.line.x - 0.5 &&
        chip.chip.right <= chip.line.right + 0.5 &&
        Number.isFinite(chip.labelMax) &&
        chip.label <= chip.labelMax + 0.5 &&
        chip.cut &&
        !!chip.track &&
        chip.track.w <= chip.track.room + 0.5 &&
        (kind === "card" || kind === "artifact" ? chip.mark === 12 : true) &&
        chip.name.includes(name)
      );
    }) &&
    !read.spills &&
    !read.pageSpills;
  const full = {
    card: `${FORTY_WORDS}?`,
    artifact: LONGEST_NAME,
    pin: pinned ? pinName(pinned as unknown as Pin) : "∅",
    session: FORTY_WORDS,
  };
  await on.page
    .locator(selectors.pin)
    .last()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  const desk = await until(
    "the long chips at 1440",
    () => chipsRead(on.page, selectors),
    (read) => Object.values(read.chips).every(Boolean),
    20_000
  ).catch(() => chipsRead(on.page, selectors));
  on.kit.check(
    "chip labels (1440): a 40-word decision question, a 40-word session title, a pin on 40 words and the longest artifact name each draw as a chip inside its line, its label at most c-inline-chip-max-w (32ch) and cut with an ellipsis, held to its line's room in an auto-sized grid track too, the card's and the artifact's mark 12px, its whole name its accessible name; nothing spills",
    renamed === 200 && held(desk, full),
    `rename ${renamed}; ${JSON.stringify(desk)}`
  );
  const phone = await on.kit.page("phone");
  await open(phone, `${origin}/session/${on.session}`, COMPOSER);
  await phone
    .locator('[data-side-card="preview"] button[data-slot="close"]')
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await phone
    .locator(selectors.pin)
    .last()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const small = await until(
    "the long chips at 390",
    () => chipsRead(phone, selectors),
    (read) => Object.values(read.chips).every(Boolean),
    20_000
  ).catch(() => chipsRead(phone, selectors));
  on.kit.check(
    "chip labels (390): the same four chips each stand inside their line and in an auto-sized grid track, labels at most 32ch and cut, the card's and the artifact's mark 12px, whole names their accessible names; nothing spills",
    held(small, full),
    JSON.stringify(small)
  );
  await phone.close();
  // Closing the phone's sheet closed the panel for every view: a page in front again for the legs after.
  await on.call(SHOW, { id: pid });
  await frameHolding(on.page, pid, "the long page in front again");
};

/**
 * A page whose comment target stands low in the frame's bottom third, where
 * a phone's thread and composer sheets both stand over it: `tall`
 * runs on 150vh past it, so a scroll can lift it; otherwise the page is
 * exactly the frame's height, and nothing scrolls.
 */
const footPage = (tall: boolean) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; box-sizing: border-box; ${tall ? "" : "height: 100vh;"} }
  #lead { height: ${tall ? 86 : 84}vh; margin: 0; }
  #mark { margin: 0; padding: 8px; width: 70%; }
  #below { height: 150vh; }
</style></head>
<body><main>
  <p id="lead">The page's lead, which stands above the line.</p>
  <p id="mark" data-insp-path="src/Foot.svelte:9:3">The line near the foot.</p>
  ${tall ? '<div id="below"></div>' : ""}
</main></body></html>`;

/** What a foot-sheet leg reads: the sheet and the pin's pill on the screen, the target in the frame's viewport, and the frame's scroll. */
interface FootRead {
  /** The target, the frame's viewport px. */
  mark: { top: number; bottom: number };
  /** Pin `pill`'s face, the screen's px. */
  pill: { top: number; bottom: number } | null;
  /** How far the frame's page can scroll. */
  room: number;
  scrollY: number;
  /** The sheet's box, the screen's px, and whether it is the well's foot sheet. */
  sheet: { top: number; bottom: number; isSheet: boolean } | null;
  /** The frame's viewport's height. */
  view: number;
}

const footRead = async (
  screen: Page,
  frame: Frame,
  sheet: string,
  pill: string
): Promise<FootRead | null> => {
  const round = (n: number) => Math.round(n * 10) / 10;
  const outer = await screen.evaluate(
    ({ sheetSel, frameSel }) => {
      const el = document.querySelector(sheetSel);
      const framed = document.querySelector<HTMLIFrameElement>(frameSel);
      const r = el?.getBoundingClientRect();
      const f = framed?.getBoundingClientRect();
      return {
        sheet: r
          ? {
              top: r.top,
              bottom: r.bottom,
              isSheet: el?.hasAttribute("data-sheet") ?? false,
            }
          : null,
        top: f && framed ? f.top + framed.clientTop : null,
      };
    },
    { sheetSel: sheet, frameSel: FRAME }
  );
  const inner = await frame
    .evaluate((pillSel) => {
      const face = document
        .querySelector("svg[data-cawco-pins]")
        ?.querySelector(pillSel)
        ?.getBoundingClientRect();
      const mark = document.querySelector("#mark")?.getBoundingClientRect();
      const root = document.scrollingElement ?? document.documentElement;
      return mark
        ? {
            pill: face ? { top: face.top, bottom: face.bottom } : null,
            mark: { top: mark.top, bottom: mark.bottom },
            view: innerHeight,
            scrollY,
            room: root.scrollHeight - root.clientHeight,
          }
        : null;
    }, pill)
    .catch(() => null);
  if (!(inner && outer.top !== null)) {
    return null;
  }
  const { top } = outer;
  return {
    pill: inner.pill
      ? {
          top: round(top + inner.pill.top),
          bottom: round(top + inner.pill.bottom),
        }
      : null,
    sheet: outer.sheet
      ? {
          top: round(outer.sheet.top),
          bottom: round(outer.sheet.bottom),
          isSheet: outer.sheet.isSheet,
        }
      : null,
    mark: { top: round(inner.mark.top), bottom: round(inner.mark.bottom) },
    view: inner.view,
    scrollY: round(inner.scrollY),
    room: round(inner.room),
  };
};

/** The reading once the sheet stands and every scroll it started has ended: the same three reads running. */
const footSettled = async (read: () => Promise<FootRead | null>) => {
  let last = await read();
  let same = 0;
  for (let looks = 0; looks < 40 && same < 3; looks += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the last frame's scroll
    await Bun.sleep(120);
    const next = await read();
    same = JSON.stringify(next) === JSON.stringify(last) ? same + 1 : 0;
    last = next;
  }
  return last;
};

/** Pin above the sheet, the target inside the frame's viewport. */
const clearOfSheet = (read: FootRead | null) =>
  !!read?.pill &&
  !!read.sheet?.isSheet &&
  read.pill.bottom <= read.sheet.top + 0.5 &&
  read.mark.top >= -0.5 &&
  read.mark.bottom <= read.view + 0.5;

/**
 * The phone's invariant: a comment's thread or composer standing at the
 * well's foot never covers the element the comment is about. At 390×844,
 * in Chromium and WebKit, on a page artifact whose line stands in the
 * frame's bottom third with room to scroll below it: (i) a tap on the line
 * opens the composer as the foot sheet, and once it settles the draft's
 * pill stands wholly above the sheet's top and the line inside the frame's
 * viewport; (ii) the comment written, the page scrolled back and its pill
 * tapped, its thread rises as the foot sheet and the pill stands above it
 * the same way. On a page exactly the frame's height, which no scroll of its
 * own can lift (preview-overlay pins.ts `bringOut`), the overlay makes room
 * under the page's foot (ink.ts `insetFoot`) and lifts the pill the same
 * way: the page scrolls past its own height, the pill wholly above the
 * sheet's top. Each time a sheet closes, the page's scroll is its own again.
 */
const footSheetChecks = async (on: On) => {
  const { origin } = new URL(on.page.url());
  for (const engine of ["chromium", "webkit"] as const) {
    const made: Record<"tall" | "short", string | undefined> = {
      tall: undefined,
      short: undefined,
    };
    for (const kind of ["tall", "short"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page after the other, each a call of the session's
      const said = await on.call(CREATE, {
        kind: "page",
        does: "judge",
        ask: "Judge this page: pin anything that reads wrong",
        name: `foot-${kind}-${engine}`,
        html: footPage(kind === "tall"),
      });
      made[kind] = said.match(ANSWERED_ID)?.[1];
    }
    if (!(made.tall && made.short)) {
      on.kit.check(
        `foot sheet (${engine}): the pages are made`,
        false,
        "no id"
      );
      continue;
    }
    const phone = await on.kit.page("phone", { engine });
    const faults: string[] = [];
    phone.on("pageerror", (error) => faults.push(error.message));
    try {
      await footOn(on, phone, engine, origin, made.tall, true);
      await footOn(on, phone, engine, origin, made.short, false);
    } finally {
      on.kit.check(
        `foot sheet (${engine}): the phone's page said no error`,
        faults.length === 0,
        faults.slice(0, 3).join(" | ") || "none"
      );
      await phone.close();
    }
  }
};

/** The phone's head's Comment: its segment where the head has room for the three, else the mode's one button, else More. */
const COMMENT_ITEM = /Comment/;
const commentOnPhone = async (phone: Page) => {
  const tab = phone.locator(`${PANE} [role='tab'][aria-keyshortcuts='C']`);
  if (await tab.isVisible()) {
    if ((await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click();
    }
    return;
  }
  const compact = phone.locator(
    `${PANE} [data-head-item="mode"]:not([hidden]) button`
  );
  await (
    (await compact.isVisible())
      ? compact
      : phone.locator(`${PANE} [data-slot="more"]`)
  ).click();
  await phone
    .getByRole("menuitemradio", { name: COMMENT_ITEM })
    .click({ timeout: 5000 });
};

/** What a foot-sheet leg's steps share: its phone, the page's frame and its top on the screen, and its words. */
interface FootRig {
  frame: Frame;
  frameTop: number;
  on: On;
  phone: Page;
  /** How far the page scrolls of its own, before any sheet stands. */
  room: number;
  tag: string;
  tall: boolean;
}

/** One page of the foot-sheet leg on `phone`: the composer, then the thread. */
const footOn = async (
  on: On,
  phone: Page,
  engine: string,
  origin: string,
  id: string,
  tall: boolean
) => {
  const tag = `foot sheet (${engine}, ${tall ? "tall page" : "short page"})`;
  await open(phone, `${origin}/artifact/${id}`, PANE);
  const frame = await frameHolding(phone, id, `${tag}: the page on the phone`);
  if (!frame) {
    on.kit.check(`${tag}: the page on the phone`, false, "not shown");
    return;
  }
  await frame.waitForSelector("#mark");
  await settle(phone, 600);
  await commentOnPhone(phone);
  await pageInComment(frame, true);
  const frameTop = await phone.evaluate((sel) => {
    const el = document.querySelector<HTMLIFrameElement>(sel);
    return el ? el.getBoundingClientRect().top + el.clientTop : 0;
  }, FRAME);
  const before = await footRead(phone, frame, COMPOSE, DRAFT_FACE);
  if (!before) {
    on.kit.check(`${tag}: the line is read`, false, "none");
    return;
  }
  on.kit.check(
    `${tag}: the line stands in the frame's bottom third, the page ${tall ? "scrolling past it" : "not scrolling"}`,
    before.mark.top >= (before.view * 2) / 3 &&
      before.mark.bottom <= before.view &&
      (tall ? before.room > before.view : before.room <= 0),
    JSON.stringify(before)
  );
  const rig: FootRig = {
    frame,
    frameTop,
    on,
    phone,
    room: before.room,
    tag,
    tall,
  };
  const number = await footCompose(rig, engine);
  if (number) {
    await footThread(rig, number);
  }
};

/** The pill clear of the sheet, said as the page's kind has it: a short page lifted into the room the overlay made under its foot. */
const footClear = (
  rig: FootRig,
  step: string,
  sheet: string,
  read: FootRead | null
) =>
  rig.on.kit.check(
    rig.tall
      ? `${rig.tag} ${step}: ${sheet} stands as the well's foot sheet and the pill stands wholly above its top, the line inside the frame's viewport`
      : `${rig.tag} ${step}: no scroll of the page's own lifts the pill, so the overlay makes room under its foot: the page scrolls past its own height, ${sheet} stands as the well's foot sheet, the pill wholly above its top and the line inside the frame's viewport`,
    clearOfSheet(read) &&
      (rig.tall || (!!read && read.scrollY > 0 && read.room > rig.room)),
    JSON.stringify(read)
  );

/** Once `what` has closed: no sheet stands, and the page scrolls as far as its own height lets it, the room under its foot taken back. */
const footBack = async (rig: FootRig, what: string, sheet: string) => {
  const back = await footSettled(() =>
    footRead(rig.phone, rig.frame, sheet, DRAFT_FACE)
  );
  rig.on.kit.check(
    `${rig.tag}: ${what} closed, the page's scroll is its own again (${rig.room}px, as before any sheet)`,
    !!back && back.sheet === null && Math.abs(back.room - rig.room) <= 0.5,
    JSON.stringify(back)
  );
};

/** (i) A tap on the line: its composer, the foot sheet; then the comment written. Answers its pin's number, 0 when none was written. */
const footCompose = async (rig: FootRig, engine: string) => {
  const { frame, frameTop, on, phone, tag, tall } = rig;
  const outer = await phone.locator(FRAME).boundingBox();
  const mark = await frame.locator("#mark").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * 0.4, y: r.y + r.height / 2 };
  });
  await pressFramePoint(
    frame,
    { x: (outer?.x ?? 0) + mark.x, y: frameTop + mark.y },
    { how: "tap" }
  );
  await phone
    .locator(COMPOSE)
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
  const composing = await footSettled(() =>
    footRead(phone, frame, COMPOSE, DRAFT_FACE)
  );
  footClear(rig, "(i)", "the new comment's composer", composing);
  await phone
    .locator(COMPOSE)
    .getByRole("combobox")
    .fill(`On the line, ${engine}, ${tall ? "tall" : "short"}.`);
  await phone.locator(`${COMPOSE} [data-slot="stop"]`).click();
  await phone
    .locator(COMPOSE)
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => undefined);
  await footBack(rig, "the comment written and its composer", COMPOSE);
  const number = Number(
    (
      Object.values((await docOf(frame)).pins as Pins).find(
        (pin) =>
          (pin.anchor as { selector?: string } | undefined)?.selector ===
          "#mark"
      ) as { number?: number } | undefined
    )?.number ?? 0
  );
  if (!number) {
    on.kit.check(`${tag}: the comment is written`, false, "no pin on #mark");
  }
  return number;
};
/** The comment being written: its hollow pill (preview-overlay pins.ts `drawDraft`). */
const DRAFT_FACE = '[data-pin="new"] [data-face]';

/** (ii) The page back where the line stands in the bottom third, pin `number`'s pill tapped: its thread, the foot sheet. */
const footThread = async (rig: FootRig, number: number) => {
  const { frame, on, phone, tag } = rig;
  await frame.evaluate(() => scrollTo(0, 0));
  await settle(phone, 300);
  const pill = await frame
    .locator(`svg[data-cawco-pins] g[data-pin="${number}"] [data-face]`)
    .boundingBox({ timeout: 5000 })
    .catch(() => null);
  if (!pill) {
    on.kit.check(`${tag}: pin ${number}'s pill on the page`, false, "none");
    return;
  }
  await pressFramePoint(
    frame,
    { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 },
    { how: "tap" }
  );
  const card = `[data-slot="pin-card"][data-pin-card="${number}"]`;
  await phone
    .locator(card)
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
  const reading = await footSettled(() =>
    footRead(phone, frame, card, `g[data-pin="${number}"] [data-face]`)
  );
  footClear(rig, "(ii)", `pin ${number}'s thread`, reading);
  await phone
    .locator(card)
    .getByRole("button", { name: "Close", exact: true })
    .click()
    .catch(() => undefined);
  await phone
    .locator(card)
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => undefined);
  await footBack(rig, `pin ${number}'s thread`, card);
};

const spec: Spec = { name: "comments", run };
export default spec;
