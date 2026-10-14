/**
 * Comments on any artifact, slice 4b (Projects spec §5.7, §5.10; tsk-3;
 * DESIGN.md, Artifact panel, canvas and ink), on a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, which calls the
 * tools each PROBE-CALL names) and the built dashboard at the desk. Read
 * from the engine: the page's doc (`window.cawcoArtifact.doc`), the pane's
 * DOM, the overlay's shadow root, and what the model was sent.
 *
 * 1. `C` turns Comment on (`aria-pressed`, the well's accent edge); a tap on
 *    a paragraph writes pin 1 with its selector, source and text and opens
 *    its card beside the pin; Esc closes the card, and Esc again leaves the
 *    mode.
 * 2. A pen stroke's radial Comment writes pin 2 on the ink, with the ink's
 *    box; the list shows two rows; J and K move the focus between the pins
 *    and the overlay's outline follows.
 * 3. A reply typed in the card is in pin 1's thread, by the person; "Send 2"
 *    tells the session it has responses to read (pins with comment_read),
 *    both pins' pictures with it, drawn as one quiet line and no row of the
 *    person's, after which N is 0 and every pin and entry has `sentAt`; a
 *    second reply makes N 1.
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
 * c. Delete, asked in the card itself: the pin leaves the doc and the page,
 *    its card closes, the other pins keep their numbers; the app's
 *    `cawco:delete` on a gone pin answers the refusal.
 */
import { join } from "node:path";
import type { Frame } from "playwright-core";
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
/** The responses notice a Send puts to the session (core injected.ts `artifactResponsesNotice`). */
const NOTICE = /\[CawCo\] The page "[a-z0-9-]+" has new responses since \d+\./;
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

const sendLabel = (on: On) =>
  on.page.locator(".preview-pane .send .send-label").textContent();

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
  await tapAndDeleteChecks(on, frame);
  await frameChecks(on);
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
  const pressed = await comment.getAttribute("aria-pressed");
  on.kit.check(
    "1: C turns Comment on: aria-pressed, the well's accent edge",
    pressed === "true" && edge.outline === edge.accent,
    `aria-pressed ${pressed}; outline ${edge.outline}, accent ${edge.accent}`
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

  await on.page.keyboard.press("Escape");
  const closed = (await card.count()) === 0;
  await on.page.keyboard.press("Escape");
  const left = await comment.getAttribute("aria-pressed");
  on.kit.check(
    "1: Esc closes the card, and Esc again leaves Comment mode",
    closed && left === "false",
    `card closed ${closed}; aria-pressed ${left}`
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
  await on.page.keyboard.press("Escape");
  const rows = await on.page.locator(".pin-list .pin-row").count();

  await on.page.locator(".pin-list .pin-row").first().focus();
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

/** 3. A reply in the card, Send 2, N back to 0, a second reply makes it 1. */
const sendChecks = async (on: On, frame: Frame, one: string) => {
  await on.page.locator('.pin-list .pin-row[data-pin-row="1"]').click();
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
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

  const label = await sendLabel(on);
  const before = heard.length;
  const rows = await on.page.locator(".turn.you").count();
  await on.page.locator(".preview-pane .send").click();
  const message = await until(
    "the responses event at the model",
    () => heard.slice(before).find((said) => NOTICE.test(said.last)),
    Boolean,
    60_000
  ).catch(() => undefined);
  // The event's pictures ride with it: the only images in that request.
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
    "sentAt on every pin and entry",
    () => docOf(frame),
    (doc) =>
      Object.values(doc.pins).every(
        (pin) =>
          !!pin.sentAt &&
          (pin.thread as { by: string; sentAt?: string }[]).every(
            (said) => said.by !== "person" || !!said.sentAt
          )
      ),
    10_000
  ).catch(() => docOf(frame));
  const after = await sendLabel(on);
  const disabled = await on.page.locator(".preview-pane .send").isDisabled();
  on.kit.check(
    "3: Send 2 tells the session it has responses to read, pins with comment_read, with both pins' pictures; one quiet line, no row of the person's; then N is 0 and every pin and entry has sentAt",
    label?.trim() === "Send 2" &&
      !!message?.last.includes("and its pins with comment_read") &&
      pictures === 2 &&
      lines === 1 &&
      ownRows === rows &&
      after?.trim() === "Send 0" &&
      disabled &&
      Object.values(stamped.pins).every((pin) => !!pin.sentAt),
    `label ${label} → ${after} (disabled ${disabled}); pictures ${pictures}; lines ${lines}; person's rows ${rows} → ${ownRows}; heard ${message?.last.slice(0, 300)}`
  );

  await card.getByRole("textbox").fill("And a little larger.");
  await card.getByRole("button", { name: "Reply" }).click();
  await settle(on.page, 400);
  const again = await sendLabel(on);
  on.kit.check(
    "3: a second reply makes N 1",
    again?.trim() === "Send 1",
    String(again)
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
    if ((await on.page.locator(".pin-list .live").count()) > 0) {
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
    () => on.page.locator(".pin-list .live").count(),
    (count) => count === 0,
    15_000
  ).catch(() => undefined);
  clearInterval(watch);
  on.kit.check(
    "4: comment_reply on pin 1 is in its card within 2 s, the live dot showing while the agent's turn runs",
    shown - done <= 2000 && live,
    `in the card ${shown - done} ms after the tool answered; live dot seen ${live}`
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
  const openRows = await on.page.locator(".pin-list .pin-row").count();
  await on.page.getByRole("tab", { name: RESOLVED_TAB }).click();
  const resolved = await on.page
    .locator('.pin-list .pin-row[data-pin-row="1"]')
    .count();
  on.kit.check(
    "4: comment_resolve dims pin 1 to 40% and moves it to Resolved",
    dim === "0.4" && openRows === 1 && resolved === 1,
    `opacity ${dim}; open rows ${openRows}; resolved row ${resolved}`
  );

  await on.page.locator('.pin-list .pin-row[data-pin-row="1"]').click();
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
  const tray = on.page.locator('.pin-list .moved-row[data-moved-row="1"]');
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
  const modeBefore = await commentButton.getAttribute("aria-pressed");
  await tray.getByRole("button", { name: "Place again" }).click();
  await pageInComment(frame, true);
  const during = await commentButton.getAttribute("aria-pressed");
  const b = await screenBox(on, frame, "#third");
  await on.page.mouse.click(b.x + b.w * 0.5, b.y + b.h / 2);
  const placed = await until(
    "pin 1 placed again",
    anchorOf,
    (pin) => !pin.movedAt && pin.anchor?.selector === "#third",
    10_000
  ).catch(anchorOf);
  await settle(on.page, 300);
  const mode = await commentButton.getAttribute("aria-pressed");
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
    await on.page.keyboard.press("Escape");
    await on.page.keyboard.press("Escape");
    if (!made) {
      return;
    }

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
    return { number, ...(await focusedCard(on, number)) };
  };
  // The second tap of the run, then a third made while the second's card is
  // open, on the page below that card (it stands over the paragraphs).
  const second = await screenBox(on, frame, "#second");
  const tapped = [
    await tapPin(second.x + second.w * 0.7, second.y + second.h / 2),
  ];
  const openCard = await on.page.locator(".pin-card").boundingBox();
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
  await on.page.locator(`.pin-list .pin-row[data-pin-row="${target}"]`).click();
  const before = await numbersNow();
  const doomed = Object.entries(before).find(
    ([, number]) => number === target
  )?.[0];
  const card = on.page.locator(`[data-pin-card="${target}"]`);
  // The footer holds Delete at its start and Resolve and Reply at its end, on one row.
  const footer = await card.locator(".actions").evaluate((row) => {
    // The card's 11px padding and 1px edge stand before the footer's first button.
    const holder = row.closest(".pin-card")?.getBoundingClientRect();
    const boxes = [...row.children].map((child) =>
      child.getBoundingClientRect()
    );
    return {
      tops: boxes.map((box) => Math.round(box.top)),
      deleteAtStart:
        !!holder && Math.abs(boxes[0].left - holder.left - 12) <= 1,
      labels: [...row.children].map((child) => child.textContent?.trim()),
    };
  });
  on.kit.check(
    "c: the card's footer has Delete at its start and Resolve and Reply at its end, on one row",
    footer.deleteAtStart &&
      new Set(footer.tops).size === 1 &&
      footer.labels.join() === "Delete,Resolve,Reply",
    JSON.stringify(footer)
  );
  await card.getByRole("button", { name: "Delete", exact: true }).click();
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
