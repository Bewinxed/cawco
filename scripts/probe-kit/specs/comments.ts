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
 *    posts one message with both sections and both pins' pictures, after
 *    which N is 0 and every pin and entry has `sentAt`; a second reply
 *    makes N 1.
 * 4. comment_read answers both pins; comment_reply on pin 1 is in its card
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
const SECTION = /^## \d+\. comment on /gm;
const RESOLVED_TAB = /^Resolved/;
const OPEN_TAB = /^Open/;
const ROOT = join(import.meta.dir, "..", "..", "..");

const MOVED_TEXT = "The paragraph, moved down and reworded.";

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
/** Every message the session was sent, as the model read it. */
const heard: string[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request.last);
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
  const message =
    (await until(
      "the pins' message at the model",
      () => heard.slice(before).find((text) => text.includes("## 1.")),
      Boolean,
      60_000
    ).catch(() => "")) ?? "";
  const sections = message.match(SECTION)?.length ?? 0;
  const row = on.page.locator(".turn.you").nth(rows);
  await row.waitFor({ timeout: 30_000 }).catch(() => undefined);
  await settle(on.page, 500);
  const pictures = await row.locator("img").count();
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
    "3: Send 2 posts one message with both pins' sections and pictures; then N is 0 and every pin and entry has sentAt",
    label?.trim() === "Send 2" &&
      sections === 2 &&
      message.includes("src/Hero.svelte:12") &&
      message.includes("Make it bolder.") &&
      message.includes("- Ink: ") &&
      pictures === 2 &&
      after?.trim() === "Send 0" &&
      disabled &&
      Object.values(stamped.pins).every((pin) => !!pin.sentAt),
    `label ${label} → ${after} (disabled ${disabled}); sections ${sections}; pictures ${pictures}; message ${message.slice(0, 600)}`
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
    "4: comment_read answers both pins",
    read.includes(one) && read.includes(two),
    read.slice(read.indexOf("{"), read.indexOf("{") + 300)
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
          win.postMessage(sent, location.origin);
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
