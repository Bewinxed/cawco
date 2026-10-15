/**
 * The preview pane's modes and its floating Comments panel (owner,
 * 2026-10-15: "on my mac there's so many comments that i can't even view the
 * preview properly, this should be a floating pane"; "there should also be
 * an 'interactive' mode"; "i dont' see any drawing or skethcing tools on the
 * preview tool"). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model, which calls artifact_create) and the built
 * dashboard at the desk, one session shows a page whose elements stand at
 * the page's four corners and in its middle. Every reading is the engine's:
 * boxes, the page's doc (`window.cawcoArtifact.doc`), the overlay's shadow
 * root, the page's own listeners.
 *
 * 1. Interact is the mode at first: a click on the page's button reaches it,
 *    and no pin is made.
 * 2. Comment (its segment): seven clicks pin seven comments, each kept with
 *    its words; the click on the page's button pins it and the page never
 *    hears it.
 * 3. With the seven pins, the preview's frame is the pane's well's height,
 *    the Comments panel shut and open; the panel stands inside the well,
 *    lists the seven, and its rows open their pins.
 * 4. A pin's card at each corner stands inside the preview's frame.
 * 5. Resting on a pin in Interact peeks its first line beside it.
 * 6. A resolved pin leaves the page; opened from the Resolved tab it stands
 *    there while its card is open, and leaves again once it closes.
 * 7. ⇧C hides every pin, and shows them again.
 * 8. Draw (D): a mouse drag adds an ink stroke to the doc, and the page
 *    hears none of it.
 * 9. Interact (V): the same drag reaches the page and inks nothing; the
 *    page's button counts the click.
 * 10. The mode is kept for the session: Comment, then the desk reloads, and
 *     the pane and the page are in Comment.
 *
 *   bun scripts/probe-kit/run.ts preview-modes
 */
import type { Frame } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const FRAME = 'iframe[title="Preview"]';
const RESOLVED_TAB = /^Resolved/;
const OPEN_TAB = /^Open/;
/** The elements pinned, in order: the four corners, the middle two, the page's button. */
const PINNED = ["#tl", "#tr", "#bl", "#br", "#m1", "#m2", "#press"] as const;

const PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; font: 15px/1.4 system-ui; }
  body { position: relative; }
  p { position: absolute; margin: 0; width: 120px; padding: 6px; background: #eee; }
  #tl { left: 4px; top: 4px; } #tr { right: 4px; top: 4px; }
  #bl { left: 4px; bottom: 4px; } #br { right: 4px; bottom: 4px; }
  #m1 { left: 45%; top: 20%; } #m2 { left: 45%; top: 32%; }
  #press { position: absolute; left: 45%; top: 46%; padding: 8px 12px; }
  #pad { position: absolute; left: 12%; top: 58%; width: 60%; height: 22%; background: #f4f4f4; }
</style></head>
<body>
  <p id="tl">Top left corner</p><p id="tr">Top right corner</p>
  <p id="bl">Bottom left corner</p><p id="br">Bottom right corner</p>
  <p id="m1">The first middle line</p><p id="m2">The second middle line</p>
  <button id="press" type="button">Pressed <span id="count">0</span></button>
  <div id="pad"></div>
  <script>
    document.getElementById("press").addEventListener("click", function () {
      var c = document.getElementById("count"); c.textContent = String(Number(c.textContent) + 1);
    });
    window.__heard = [];
    for (var type of ["pointerdown", "pointermove", "pointerup"]) {
      document.addEventListener(type, function (e) { window.__heard.push(e.type); });
    }
  </script>
</body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
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

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}
const inside = (inner: Box | null, outer: Box | null, slack = 1) =>
  !!inner &&
  !!outer &&
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

const overlaps = (a: Box | null, b: Box | null) =>
  !!a &&
  !!b &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

type PinsOf = Awaited<ReturnType<typeof docOf>>["pins"];
const numbered = (pins: PinsOf, number: number) =>
  Object.values(pins).find((pin) => pin.number === number) as
    { id: string; resolvedAt?: string; thread: { text: string }[] } | undefined;

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Modes", fleet.repo);
  asks.set("1", {
    name: CREATE,
    input: { kind: "page", name: "modes", html: PAGE },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  const said: string[] = [];
  desk.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(desk, `${base}/session/${session}`, FRAME);
  const on = { page: desk, kit } as unknown as On;
  let frame = await pageFrame(on);
  await frame.waitForSelector("#press");
  await settle(desk, 500);

  const tab = (name: string) =>
    desk.locator(`.preview-pane [role="tab"][aria-keyshortcuts="${name}"]`);
  const chosen = async () =>
    (
      await Promise.all(
        ["V", "C", "D"].map(async (key) =>
          (await tab(key).getAttribute("aria-selected")) === "true" ? key : ""
        )
      )
    ).join("");
  const layerMode = (inner: Frame) =>
    inner.evaluate(
      () =>
        document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer")?.className ?? "none"
    );
  /** Until the page has heard the pane's mode (the overlay's layer class). */
  const pageIn = (inner: Frame, mode: "comment" | "draw" | "interact") =>
    until(
      `the page in ${mode}`,
      () => layerMode(inner),
      (name) =>
        mode === "interact"
          ? !(name.includes("comment") || name.includes("draw"))
          : name.includes(mode),
      5000
    ).catch(() => undefined);
  const count = () => frame.locator("#count").textContent();
  const pinsNow = async () => (await docOf(frame)).pins;
  /** The frame's height and the well's inside its border: the pane's body the page has. */
  const heights = () =>
    desk.evaluate(() => ({
      frame:
        document
          .querySelector<HTMLIFrameElement>('iframe[title="Preview"]')
          ?.getBoundingClientRect().height ?? -1,
      well:
        document.querySelector(".preview-pane .side-well")?.clientHeight ?? -2,
    }));

  // 1. Interact first.
  const pressBox = await screenBox(on, frame, "#press");
  await desk.mouse.click(
    pressBox.x + pressBox.w / 2,
    pressBox.y + pressBox.h / 2
  );
  await settle(desk, 300);
  kit.check(
    "1: Interact is the mode at first: a click on the page's button reaches it, and no pin is made",
    (await chosen()) === "V" &&
      (await count()) === "1" &&
      Object.keys(await pinsNow()).length === 0,
    `chosen ${await chosen()}; count ${await count()}; pins ${Object.keys(await pinsNow()).length}`
  );

  // 2. Comment: seven pins, each with its words.
  await tab("C").click();
  await pageIn(frame, "comment");
  for (const [index, selector] of PINNED.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one pin at a time, each card closed before the next
    const b = await screenBox(on, frame, selector);
    await desk.mouse.click(b.x + b.w * 0.5, b.y + b.h * 0.5);
    const card = desk.locator(`.pin-card[data-pin-card="${index + 1}"]`);
    await card.waitFor({ timeout: 5000 }).catch(() => undefined);
    await card.getByRole("textbox").fill(`Note ${index + 1}`);
    await card.getByRole("textbox").press("Control+Enter");
    await until(
      `pin ${index + 1}'s words kept`,
      async () => numbered(await pinsNow(), index + 1)?.thread.length,
      (length) => length === 1,
      5000
    ).catch(() => undefined);
    await desk.keyboard.press("Escape");
    await card.waitFor({ state: "detached", timeout: 3000 }).catch(() => {
      // Read below: a card that stayed shows in the count.
    });
  }
  const seven = await pinsNow();
  const kept = PINNED.map(
    (_, index) => numbered(seven, index + 1)?.thread[0]?.text
  );
  kit.check(
    "2: in Comment seven clicks pin seven comments, each kept with its words; the click on the page's button pins it and the page never hears it",
    Object.keys(seven).length === 7 &&
      kept.every((text, index) => text === `Note ${index + 1}`) &&
      (await count()) === "1" &&
      (await chosen()) === "C",
    `pins ${Object.keys(seven).length}; words ${JSON.stringify(kept)}; count ${await count()}; chosen ${await chosen()}`
  );

  // 3. The frame keeps the well's height, the panel shut and open.
  const shut = await heights();
  const comments = desk.locator(".preview-pane button.comments");
  const countShown = (await comments.locator(".count").textContent())?.trim();
  await comments.click();
  const panel = desk.locator(".pin-list-pop");
  await panel.waitFor({ timeout: 5000 }).catch(() => undefined);
  await settle(desk, 400);
  const opened = await heights();
  const panelBox = await panel.boundingBox();
  const wellBox = await desk.locator(".preview-pane .side-well").boundingBox();
  const rows = await panel.locator(".pin-row").count();
  kit.check(
    "3: with seven pins the preview's frame is the well's height with the Comments panel shut and open; the head says 7, and the panel stands inside the well listing all seven",
    shut.frame === shut.well &&
      opened.frame === opened.well &&
      opened.frame === shut.frame &&
      countShown === "7" &&
      rows === 7 &&
      inside(panelBox, wellBox),
    `shut ${JSON.stringify(shut)}; open ${JSON.stringify(opened)}; head count ${countShown}; rows ${rows}; panel ${JSON.stringify(panelBox)}; well ${JSON.stringify(wellBox)}`
  );

  // 4. A card at each corner, inside the frame.
  const frameBox = await desk.locator(FRAME).boundingBox();
  const corners: string[] = [];
  let allInside = true;
  for (const number of [1, 2, 3, 4]) {
    // biome-ignore lint/performance/noAwaitInLoops: one card open at a time
    await panel.locator(`.pin-row[data-pin-row="${number}"]`).click();
    const card = desk.locator(`.pin-card[data-pin-card="${number}"]`);
    await card.waitFor({ timeout: 5000 }).catch(() => undefined);
    await settle(desk, 400);
    const box = await card.boundingBox();
    const ok = inside(box, frameBox) && !overlaps(box, panelBox);
    allInside &&= ok;
    corners.push(
      `${PINNED[number - 1]} ${ok ? "inside" : JSON.stringify(box)}`
    );
  }
  await desk.keyboard.press("Escape");
  kit.check(
    "4: with the Comments panel open, a pin's card at each of the page's corners stands inside the preview's frame and clear of the panel",
    allInside,
    `${corners.join("; ")}; frame ${JSON.stringify(frameBox)}`
  );

  // 5. The peek in Interact.
  await tab("V").click();
  await pageIn(frame, "interact");
  const disc = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"] circle')
    .boundingBox();
  if (disc) {
    await desk.mouse.move(disc.x + disc.width / 2, disc.y + disc.height / 2, {
      steps: 4,
    });
  }
  await settle(desk, 300);
  const peek = await frame.evaluate(() => {
    const node = document
      .querySelector("cawco-overlay")
      ?.shadowRoot?.querySelector<HTMLElement>(".peek");
    return node && !node.hidden ? node.textContent : null;
  });
  const under =
    disc &&
    (await frame.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return `${el?.localName} in pin ${el?.closest("[data-pin]")?.getAttribute("data-pin")}`;
      },
      [
        disc.x + disc.width / 2 - (frameBox?.x ?? 0),
        disc.y + disc.height / 2 - (frameBox?.y ?? 0),
      ] as const
    ));
  await desk.mouse.move(5, 5);
  kit.check(
    "5: in Interact, resting on pin 1 (clear of the panel) peeks its first line beside it",
    peek === "Note 1",
    `peek ${JSON.stringify(peek)}; disc ${JSON.stringify(disc)}; under the pointer ${under}`
  );

  // 6. A resolved pin leaves the page.
  const discOn = (number: number) =>
    frame.locator(`svg[data-cawco-pins] g[data-pin="${number}"]`).count();
  await panel.locator('.pin-row[data-pin-row="6"]').click();
  const six = desk.locator('.pin-card[data-pin-card="6"]');
  await six.getByRole("button", { name: "Resolve pin" }).click();
  await until(
    "pin 6 resolved",
    async () => numbered(await pinsNow(), 6)?.resolvedAt,
    Boolean,
    5000
  ).catch(() => undefined);
  const whileOpen = await discOn(6);
  await desk.keyboard.press("Escape");
  await settle(desk, 300);
  const afterClose = await discOn(6);
  await panel.getByRole("tab", { name: RESOLVED_TAB }).click();
  const resolvedRows = await panel.locator(".pin-row").count();
  await panel.locator('.pin-row[data-pin-row="6"]').click();
  await six.waitFor({ timeout: 5000 }).catch(() => undefined);
  await settle(desk, 300);
  const shownAgain = await discOn(6);
  const dim = await frame
    .locator('svg[data-cawco-pins] g[data-pin="6"]')
    .getAttribute("opacity")
    .catch(() => null);
  const placeholder = await six
    .getByRole("textbox")
    .getAttribute("placeholder");
  await desk.keyboard.press("Escape");
  await settle(desk, 300);
  const goneAgain = await discOn(6);
  await panel.getByRole("tab", { name: OPEN_TAB }).click();
  kit.check(
    '6: a resolved pin leaves the page once its card closes; from the Resolved tab it stands there at 40% with "Reply to reopen" while its card is open, and leaves again after',
    afterClose === 0 &&
      resolvedRows === 1 &&
      shownAgain === 1 &&
      dim === "0.4" &&
      placeholder === "Reply to reopen" &&
      goneAgain === 0,
    `disc while open ${whileOpen}, after close ${afterClose}; resolved rows ${resolvedRows}; shown again ${shownAgain} at ${dim}, placeholder ${placeholder}; after ${goneAgain}`
  );

  // 7. ⇧C.
  await tab("V").focus();
  const shown = () =>
    frame.evaluate(
      () =>
        getComputedStyle(
          document.querySelector("svg[data-cawco-pins]") as Element
        ).display
    );
  await desk.keyboard.press("Shift+C");
  await settle(desk, 200);
  const hidden = await shown();
  await desk.keyboard.press("Shift+C");
  await settle(desk, 200);
  const back = await shown();
  kit.check(
    "7: ⇧C hides every pin, and shows them again",
    hidden === "none" && back !== "none",
    `after ⇧C ${hidden}; after ⇧C again ${back}`
  );

  // 8. Draw: a mouse drag inks; the page hears none of it.
  const drag = async (inner: Frame) => {
    const pad = await screenBox(on, inner, "#pad");
    await desk.mouse.move(pad.x + pad.w * 0.2, pad.y + pad.h * 0.4);
    await desk.mouse.down();
    for (const step of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      // biome-ignore lint/performance/noAwaitInLoops: a stroke's points, in order
      await desk.mouse.move(
        pad.x + pad.w * step,
        pad.y + pad.h * (0.4 + step / 4),
        { steps: 3 }
      );
    }
    await desk.mouse.up();
    await settle(desk, 400);
  };
  const inkCount = async () => Object.keys((await docOf(frame)).ink).length;
  const heardBy = () =>
    frame.evaluate(() => {
      const w = window as unknown as { __heard: string[] };
      const all = w.__heard.slice();
      w.__heard.length = 0;
      return all;
    });
  await tab("V").focus();
  await desk.keyboard.press("d");
  await pageIn(frame, "draw");
  await heardBy();
  const inkBefore = await inkCount();
  await drag(frame);
  const inkDrawn = await inkCount();
  const drawHeard = await heardBy();
  kit.check(
    "8: Draw (D): a mouse drag adds an ink stroke to the doc, and the page hears none of it",
    (await chosen()) === "D" &&
      inkDrawn === inkBefore + 1 &&
      drawHeard.length === 0,
    `chosen ${await chosen()}; ink ${inkBefore} → ${inkDrawn}; the page heard ${drawHeard.length} (${[...new Set(drawHeard)].join(", ")})`
  );

  // 9. Interact: the drag is the page's.
  await desk.keyboard.press("Escape");
  await pageIn(frame, "interact");
  await heardBy();
  await drag(frame);
  const inkAfter = await inkCount();
  const interactHeard = new Set(await heardBy());
  // At the button's left edge: pin 7's disc stands at its middle, and a press there opens the pin.
  const press = await screenBox(on, frame, "#press");
  await desk.mouse.click(press.x + 6, press.y + press.h / 2);
  await settle(desk, 200);
  kit.check(
    "9: Esc goes back to Interact: the same drag reaches the page (pointerdown, move, up) and inks nothing, and the page's button counts the click",
    (await chosen()) === "V" &&
      inkAfter === inkDrawn &&
      ["pointerdown", "pointermove", "pointerup"].every((type) =>
        interactHeard.has(type)
      ) &&
      (await count()) === "2",
    `chosen ${await chosen()}; ink ${inkDrawn} → ${inkAfter}; the page heard ${[...interactHeard].join(", ")}; count ${await count()}`
  );

  // 10. Kept for the session across a reload.
  await tab("C").click();
  await pageIn(frame, "comment");
  await desk.reload({ waitUntil: "domcontentloaded" });
  await desk.locator(FRAME).waitFor({ timeout: 30_000 });
  frame = await pageFrame(on);
  await frame.waitForSelector("#press");
  await pageIn(frame, "comment");
  const kept10 = await chosen();
  const layer = await layerMode(frame);
  const panelKept = await desk.locator(".pin-list-pop").count();
  kit.check(
    "10: the mode and the open Comments panel are kept for the session: after a reload the pane and the page are in Comment, the panel open",
    kept10 === "C" && layer.includes("comment") && panelKept === 1,
    `chosen ${kept10}; layer ${layer}; panel ${panelKept}`
  );
  await tab("V").click();

  kit.check(
    "the desk said no error",
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
};

const spec: Spec = { name: "preview-modes", run };
export default spec;
