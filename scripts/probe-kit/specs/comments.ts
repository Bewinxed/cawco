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
 *    keeping its text, re-anchors it by text; one that removes it puts pin 1
 *    in the moved tray, and Place again with a tap pins it anew.
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
 */
import { join } from "node:path";
import type { Frame, Locator } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import {
  docOf,
  dragFromIcon,
  type On,
  pageFrame,
  screenBox,
  strokeOver,
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
  await open(desk, `${base}/session/${session}`, "textarea");
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
  const button = on.page.locator(".preview-pane button.comments");
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const list = on.page.locator(".pin-list-pop .pin-list");
  await list.waitFor({ timeout: 5000 }).catch(() => undefined);
  return list;
};
const shutList = async (on: On) => {
  const button = on.page.locator(".preview-pane button.comments");
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
    await on.page
      .locator(".pin-list-pop")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
};
/** The head's Interact: Comment's way back, as the old toggle's second press was. */
const interactTab = (on: On) =>
  on.page.locator(".preview-pane [role='tab'][aria-keyshortcuts='V']");

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
    () => scrollChecks(on, "window"),
    () => scrollChecks(on, "container"),
    () => dismissChecks(on),
    () => roomChecks(on),
    () => wordlessChecks(on),
    () => documentChecks(on),
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
    ".preview-pane button[aria-keyshortcuts='C']"
  );
  await comment.focus();
  await on.page.keyboard.press("c");
  await pageInComment(frame, true);
  // The edge comes in over --dur-control: read once it has.
  await settle(on.page, 300);
  const edge = await on.page.evaluate(() => {
    const well = document.querySelector(".preview-pane .side-well");
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      outline: well ? getComputedStyle(well).outlineColor : null,
      accent,
    };
  });
  const pressed = await comment.getAttribute("aria-selected");
  on.kit.check(
    "1: C turns Comment on: its segment chosen (aria-selected), the well's accent edge",
    pressed === "true" && edge.outline === edge.accent,
    `aria-selected ${pressed}; outline ${edge.outline}, accent ${edge.accent}`
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
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  await settle(on.page, 500);
  const disc = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"] circle')
    .boundingBox({ timeout: 2000 })
    .catch(() => null);
  const cardBox = await card.boundingBox({ timeout: 2000 }).catch(() => null);
  const beside =
    !!disc &&
    !!cardBox &&
    (Math.abs(cardBox.x - (disc.x + disc.width + 12)) <= 3 ||
      Math.abs(cardBox.x + cardBox.width - (disc.x - 12)) <= 3) &&
    Math.abs(cardBox.y - disc.y) <= 3;
  on.kit.check(
    "1: a tap writes pin 1 with the paragraph's selector, source and text, and opens its card beside the pin",
    pin?.kind === "comment" &&
      pin.by === "person" &&
      pin.anchor.selector === "#para" &&
      pin.anchor.source?.file === "src/Hero.svelte" &&
      pin.anchor.source.line === 12 &&
      String(pin.anchor.text).startsWith("A paragraph to comment on") &&
      Array.isArray(pin.thread) &&
      pin.thread.length === 0 &&
      beside,
    `pin ${JSON.stringify(pin && { kind: pin.kind, anchor: pin.anchor, thread: pin.thread })}; disc ${JSON.stringify(disc)}; card ${JSON.stringify(cardBox)}; said ${on.said.slice(0, 3).join(" | ") || "nothing"}`
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
  const rows = await (await rowsOf(on)).locator(".pin-row").count();

  await (await rowsOf(on)).locator(".pin-row").first().focus();
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
      .locator('.pin-list .pin-row[aria-current="true"]')
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
  await (await rowsOf(on)).locator('.pin-row[data-pin-row="1"]').click();
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
  const before = heard.length;
  const rows = await on.page.locator(".turn.you").count();
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
  const ownRows = await on.page.locator(".turn.you").count();
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
  const sendControls = await on.page.locator(".preview-pane .send").count();
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
  await (await rowsOf(on)).locator('.pin-row[data-pin-row="1"]').click();
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

  const card = on.page.locator('.pin-card[data-pin-card="1"]');
  let live = false;
  // Polls the list while the agent's turn runs.
  const watch = setInterval(async () => {
    if ((await (await rowsOf(on)).locator(".live").count()) > 0) {
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
  const shown = await until(
    "the agent's reply in the card",
    () => card.locator('.entry[data-by="agent"]').count(),
    (count) => count === 1,
    5000
  )
    .then(() => Date.now())
    .catch(() => Number.NaN);
  await until(
    "the agent's turn to end",
    () => on.page.locator(".pin-list-pop .live").count(),
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
    const people = [...el.querySelectorAll('.entry[data-by="person"]')];
    const agent = el.querySelector('.entry[data-by="agent"]');
    const wells = people.map((entry) => entry.querySelector(".turn.you .well"));
    const [upper, lower] = wells.map((well) => well?.getBoundingClientRect());
    const agentTurn = agent?.querySelector(".turn");
    return {
      people: people.length,
      personWells: wells.map(surface),
      runsOn: people[0]
        ?.querySelector(".turn.you")
        ?.classList.contains("runs-on"),
      grouped: people[1]
        ?.querySelector(".turn.you")
        ?.classList.contains("grouped"),
      marks: people.filter((entry) => entry.querySelector(".who .dot.u"))
        .length,
      seam: upper && lower ? Math.round(lower.top - upper.bottom) : null,
      agentWell: agent?.querySelector(".well") ? "yes" : "no",
      agentSurface: agentTurn
        ? getComputedStyle(agentTurn).backgroundColor
        : null,
      agentMark: (() => {
        const dot = agent?.querySelector(".who .dot.a");
        return dot ? getComputedStyle(dot).backgroundColor : null;
      })(),
      agentName:
        agent?.querySelector(".who .role")?.textContent?.trim() ?? null,
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
  const openRows = await (await rowsOf(on)).locator(".pin-row").count();
  await on.page.getByRole("tab", { name: RESOLVED_TAB }).click();
  const resolved = await on.page
    .locator('.pin-list .pin-row[data-pin-row="1"]')
    .count();
  on.kit.check(
    "4: comment_resolve dims pin 1 to 40% and moves it to Resolved",
    dim === "0.4" && openRows === 1 && resolved === 1,
    `opacity ${dim}; open rows ${openRows}; resolved row ${resolved}`
  );

  await (await rowsOf(on)).locator('.pin-row[data-pin-row="1"]').click();
  await card.getByRole("button", { name: "Reopen" }).click();
  const reopened = await until(
    "pin 1 reopened",
    async () => (await docOf(frame)).pins[one],
    (pin) => !pin?.resolvedAt,
    5000
  ).catch(() => null);
  await on.page.getByRole("tab", { name: OPEN_TAB }).click();
  const back = await on.page
    .locator('.pin-list .pin-row[data-pin-row="1"]')
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
  const ask = (message: object, type: string) =>
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
          win.postMessage(sent, new URL((el as HTMLIFrameElement).src).origin);
          setTimeout(() => resolve(null), 5000);
        }),
      [iframe, message, type] as const
    );
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

/** 5. Re-anchoring by file:line, by text, the moved tray and Place again. */
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
  const tray = (await rowsOf(on)).locator('.moved-row[data-moved-row="1"]');
  await tray.waitFor({ timeout: 5000 }).catch(() => undefined);
  const inTray = await tray.count();
  on.kit.check(
    "5: one that removes it puts pin 1 in the moved tray",
    !!gone.movedAt && inTray === 1,
    `movedAt ${String(gone.movedAt)}; tray rows ${inTray}`
  );

  const commentButton = on.page.locator(
    ".preview-pane button[aria-keyshortcuts='C']"
  );
  const modeBefore = await commentButton.getAttribute("aria-selected");
  await tray.getByRole("button", { name: "Place again" }).click();
  await pageInComment(frame, true);
  const during = await commentButton.getAttribute("aria-selected");
  const b = await screenBox(on, frame, "#third");
  await on.page.mouse.click(b.x + b.w * 0.5, b.y + b.h / 2);
  const placed = await until(
    "pin 1 placed again",
    anchorOf,
    (pin) => !pin.movedAt && pin.anchor?.selector === "#third",
    10_000
  ).catch(anchorOf);
  await settle(on.page, 300);
  const mode = await commentButton.getAttribute("aria-selected");
  on.kit.check(
    "5: Place again turns Comment on for one tap, which pins it anew out of the tray, and Comment goes back off",
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
      ".preview-pane button[aria-keyshortcuts='C']"
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

    await on.page.locator('.preview-pane button[aria-label="Reload"]').click();
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
    ".preview-pane button[aria-keyshortcuts='C']"
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
  let openCard = await on.page.locator(".pin-card").boundingBox();
  for (let reads = 0; reads < 20; reads += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one read every 100 ms until two agree
    await on.page.waitForTimeout(100);
    const now = await on.page.locator(".pin-card").boundingBox();
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
    .locator(`.pin-row[data-pin-row="${target}"]`)
    .click();
  const before = await numbersNow();
  const doomed = Object.entries(before).find(
    ([, number]) => number === target
  )?.[0];
  const card = on.page.locator(`[data-pin-card="${target}"]`);
  // The head holds what acts on the pin (Resolve, ⋯, Close) on its row; the foot holds Reply alone.
  const parts = await card.evaluate((el) => {
    const head = el.querySelector(".head");
    const named = [...(head?.querySelectorAll("button") ?? [])].map(
      (button) => button.getAttribute("aria-label") ?? ""
    );
    const tops = [...(head?.querySelectorAll("button") ?? [])].map((button) =>
      Math.round(button.getBoundingClientRect().top)
    );
    const foot = [...el.querySelectorAll(".actions button")].map((button) =>
      button.textContent?.trim()
    );
    return { named, tops, foot };
  });
  on.kit.check(
    "c: the card's head holds Resolve pin, its ⋯ and Close on one row, and its foot Reply alone",
    parts.named[0] === "Resolve pin" &&
      parts.named.at(-1) === "Close" &&
      parts.named.length === 3 &&
      new Set(parts.tops).size === 1 &&
      parts.foot.join() === "Reply",
    JSON.stringify(parts)
  );
  await card.locator(".head button").nth(1).click();
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
    ".preview-pane button[aria-keyshortcuts='C']"
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
  const pinCard = on.page.locator(`.pin-card[data-pin-card="${pin?.number}"]`);
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

  await on.page.locator('.preview-pane button[aria-label="Reload"]').click();
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
  await on.page.locator('.preview-pane button[aria-label="Reload"]').click();
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
    ".preview-pane button[aria-keyshortcuts='C']"
  );
  const cards = () => on.page.locator(".pin-card").count();
  const pinsNow = async () => (await docOf(frame)).pins as Pins;
  const field = (number: number) =>
    on.page
      .locator(`.pin-card[data-pin-card="${number}"]`)
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
  await on.page.locator("textarea:not(.pin-card textarea)").first().click();
  const closedKept = await shut();
  await interactTab(on).click();
  await pageInComment(frame, false);
  const stays =
    String(kept.number) in
    Object.fromEntries(
      Object.values(await pinsNow()).map((pin) => [String(pin.number), true])
    );
  const row = (await rowsOf(on)).locator(
    `.pin-row[data-pin-row="${kept.number}"]`
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
  const openBox = await on.page.locator(".pin-card").boundingBox();
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
        .locator(`.pin-card[data-pin-card="${other?.number}"]`)
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
    `.pin-list .pin-row[data-pin-row="${kept.number}"]`
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
  await (await rowsOf(on)).locator('.pin-row[data-pin-row="1"]').click();
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
  await until(
    "the seeded replies in pin 1's card",
    () => card.locator(".entry").count(),
    (count) => count > replies,
    15_000
  ).catch(() => 0);
  await settle(on.page, 400);
  const seen = await card.evaluate((el) => {
    const box = (part: Element | null) => {
      const r = part?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    const room = el.querySelector("[data-pin-room]");
    // By its words, or its name when it is a glyph (the head's Resolve pin).
    const button = (name: string) =>
      [...el.querySelectorAll("button")].find(
        (one) =>
          one.textContent?.trim() === name ||
          one.getAttribute("aria-label") === name
      ) ?? null;
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
      entries: el.querySelectorAll(".entry").length,
      resolve: box(button("Resolve pin")),
      reply: box(button("Reply")),
      field: box(el.querySelector("textarea")),
    };
  });
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
    const room = document.querySelector<HTMLElement>(".pin-room");
    room?.style.setProperty("bottom", "auto");
    room?.style.setProperty("height", "150px");
  });
  await settle(on.page, 400);
  const squeezed = await card.evaluate((el) => {
    const room = el.querySelector("[data-pin-room]");
    return {
      whole: room?.classList.contains("whole") ?? false,
      room: room
        ? { scroll: room.scrollHeight, height: room.clientHeight }
        : null,
      cardScrolls: el.scrollHeight > el.clientHeight + 1,
    };
  });
  await on.page.evaluate(() => {
    const room = document.querySelector<HTMLElement>(".pin-room");
    room?.style.removeProperty("bottom");
    room?.style.removeProperty("height");
  });
  await settle(on.page, 400);
  const unsqueezed = await card.evaluate(
    (el) =>
      el.querySelector("[data-pin-room]")?.classList.contains("whole") ?? true
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
    .locator(`.pin-card[data-pin-card="${number}"]`)
    .getByRole("textbox")
    .fill(words);

/**
 * A card's head as it reads: the name, the file:line under it, the tooltip,
 * the words a reader sees in the whole card, and the pictures it draws.
 */
const headOf = (card: Locator) =>
  card
    .evaluate((el) => ({
      name: el.querySelector(".head .name")?.textContent?.trim() ?? null,
      source: el.querySelector(".head .source")?.textContent?.trim() ?? null,
      tip: el.querySelector(".head .anchor")?.getAttribute("title") ?? null,
      shown: (el as HTMLElement).innerText,
      pictures: el.querySelectorAll("img, .thumb").length,
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
  await on.page.locator(".preview-pane button[aria-keyshortcuts='C']").click();
  await pageInComment(frame, true);
  const b = await screenBox(on, frame, "[data-insp-path]");
  await on.page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
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
    .locator("input.hidden-file")
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
        const body = document.querySelector(".doc-body");
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
