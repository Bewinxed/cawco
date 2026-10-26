/**
 * The apps keep the commenting their shipped build expects (TestFlight
 * 20261018) while the dashboard runs the composer flow alone (owner's pick,
 * "Keep the old way for the app until the hold lifts"; overlay page.ts
 * `appCommenting`, until tsk-59).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with one session and its page artifact:
 *
 * 1. The app's host: the page loaded top-level as the app's web view loads
 *    it, with the app's own host script (read out of PreviewController.swift
 *    `host`) and a `cawco` message handler standing in for WKWebView's, which
 *    records what the page posts. The spec says the app's `cawco:hello` and
 *    `cawco:mode` through `__cawcoDeliver`, as the app's `deliver` does.
 *    Comment on, a finger's tap on the paragraph writes a pin at once: the
 *    page posts `cawco:pin-open` with the pin's `id`, `made: true` and the
 *    pin, and no composer (`cawco:compose`); the hub keeps the pin, its
 *    thread empty, and delivers nothing of it while it stays empty (core
 *    `pinReady`). The app's `cawco:reply` writes the person's words in it,
 *    answered ok, the hub keeps them, and the session hears them by
 *    themselves. A second tap's pin, its card dismissed unsaid
 *    (`cawco:withdraw`), leaves the page's doc and the hub.
 * 2. The dashboard: in the artifact's tab, Comment on, a click on the
 *    paragraph opens the composer and writes nothing, on the page or on the
 *    hub; words typed and Enter write the pin with them.
 *
 * Each on Chromium and on WebKit (the app's engine).
 *
 *   bun scripts/probe-kit/run.ts app-comment-mode
 */
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import type { Pin } from "../../../packages/core/src/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  pressAt,
  ROOT,
  type Spec,
  settle,
} from "../kit";
import { pagePins } from "../pins";

const NAME = "app-comment";
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>App comment</title></head><body style="margin:0;font:18px/1.6 system-ui"><main style="padding:24px"><h1>App comment</h1><p id="desk-chromium" style="width:70%">The dashboard paragraph on Chromium.</p><p id="desk-webkit" style="width:70%">The dashboard paragraph on WebKit.</p><p id="app-chromium" style="width:70%">The app paragraph on Chromium.</p><p id="app-webkit" style="width:70%">The app paragraph on WebKit.</p><p id="gone-chromium" style="width:70%">The paragraph whose pin is taken back, on Chromium.</p><p id="gone-webkit" style="width:70%">The paragraph whose pin is taken back, on WebKit.</p></main></body></html>';
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const COMPOSE = '[data-slot="pin-composer"]';
/** The comments notice (core injected.ts `artifactCommentsNotice`). */
const NOTICE = /\[CawCo\] The person commented on the page "app-comment"/u;
/** The hub's quiet before a person's comments go (service.ts `COMMENTS_QUIET_MS`, 3 s), and room past it. */
const QUIET_MS = 3000;
const HELD_MS = QUIET_MS * 2 + 1000;
/** How long a delivery may take to reach the model. Our bound. */
const DELIVERY_MS = 15_000;
/** PreviewController.swift's `static let host = """…"""` and `static let viewport = """…"""`: each one's lines, and its closing delimiter's indent. */
const APP_SCRIPTS = {
  host: /static let host = """\n([\s\S]*?)\n( *)"""/u,
  viewport: /static let viewport = """\n([\s\S]*?)\n( *)"""/u,
} as const;
/** A line's first character that is not a space, or its end. */
const FIRST_INK = /\S|$/u;

/** Every request the model was asked with, in order. */
const heard: Seen[] = [];
const respond = (request: Seen): Reply => {
  if (request.tools) {
    heard.push(request);
  }
  return { everyMs: 5, words: [request.tools ? "ok" : "Probe title"] };
};
/** The comments notices the session was sent since request `from` that name pin `pin` (each section names its pin's id). */
const notices = (from: number, pin: string) =>
  heard
    .slice(from)
    .filter(
      (one) => NOTICE.test(one.last) && !one.afterTool && one.last.includes(pin)
    )
    .map((one) => one.last);

/**
 * One of the user scripts the app injects at document start
 * (PreviewController.swift `makeWeb`: `viewport`, the page's width the
 * device's, and `host`, standing in for the dashboard's window): a Swift
 * multi-line string, its closing delimiter's indent taken off each line.
 */
const appScript = async (name: keyof typeof APP_SCRIPTS): Promise<string> => {
  const swift = await Bun.file(
    join(
      ROOT,
      "apps/apple/Packages/CawCoKit/Sources/CawCoScreens/Preview/PreviewController.swift"
    )
  ).text();
  const body = APP_SCRIPTS[name].exec(swift);
  if (!body?.[1]) {
    throw new Error(`PreviewController.swift holds no \`static let ${name}\``);
  }
  const indent = body[2]?.length ?? 0;
  return body[1]
    .split("\n")
    .map((line) => line.slice(Math.min(indent, line.search(FIRST_INK))))
    .join("\n");
};

/**
 * `script` run when WKWebView runs an `.atDocumentStart` user script: "after
 * the creation of the webpage's document element, but before loading any
 * other content" (WKUserScriptInjectionTime). Playwright's init scripts run
 * before the document element exists, where the app's viewport script would
 * find nowhere to put its meta.
 */
const atDocumentElement = (script: string): string => `(() => {
  const run = () => { ${script} };
  if (document.documentElement) { run(); return; }
  const watch = new MutationObserver(() => {
    if (document.documentElement) { watch.disconnect(); run(); }
  });
  watch.observe(document, { childList: true });
})();`;

/** WKWebView's `cawco` message handler, standing in: what the page posts, parsed and kept as `appHeard`. */
function appHandler(): void {
  const heardHere: unknown[] = [];
  Object.defineProperty(window, "appHeard", { value: heardHere });
  const cawco = {
    postMessage: (body: string) => heardHere.push(JSON.parse(body)),
  };
  const own = (window as unknown as { webkit?: { messageHandlers?: object } })
    .webkit;
  if (own?.messageHandlers) {
    Object.defineProperty(own.messageHandlers, "cawco", { value: cawco });
  } else {
    Object.defineProperty(window, "webkit", {
      value: { messageHandlers: { cawco } },
      configurable: true,
    });
  }
}

type Heard = { type?: string } & Record<string, unknown>;
const appHeard = (page: Page): Promise<Heard[]> =>
  page.evaluate(() => (window as unknown as { appHeard: Heard[] }).appHeard);
/** The app's `deliver`: `window.__cawcoDeliver(json)`. */
const deliver = (page: Page, message: object) =>
  page.evaluate(
    (said) =>
      (
        window as unknown as { __cawcoDeliver?: (data: unknown) => void }
      ).__cawcoDeliver?.(said),
    message
  );

interface At {
  base: string;
  fleet: KitFleet;
  id: string;
  kit: Kit;
  session: string;
}

type HubPin = Pin;
const hubPins = async ({ fleet, id, session }: At): Promise<HubPin[]> =>
  (
    await fleet.api<{ artifacts: { id: string; pins: HubPin[] }[] }>(
      `/api/instances/${session}/artifacts/comments?artifact=${id}&filter=all`
    )
  ).artifacts.find((one) => one.id === id)?.pins ?? [];

const commenting = (frame: Frame) =>
  until(
    "the page's Comment mode on",
    () =>
      frame.evaluate(
        () =>
          document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelector(".layer")
            ?.classList.contains("comment") ?? false
      ),
    Boolean,
    5000
  );

/** The middle of `selector` in `frame`, in its page's viewport (the frame's own box added in). */
const centreOf = async (page: Page, frame: Frame, selector: string) => {
  const outer =
    frame === page.mainFrame()
      ? { x: 0, y: 0 }
      : await page.locator(FRAME).boundingBox();
  const inner = await frame.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * 0.4, y: r.y + r.height / 2 };
  });
  if (!outer) {
    throw new Error("the pane's frame has no box");
  }
  return { x: outer.x + inner.x, y: outer.y + inner.y };
};

const errorsOf = (page: Page) => {
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  return said;
};

/** 2. The dashboard's flow: a click writes nothing until words are typed. Answers the preview's address. */
const dashboardLeg = async (at: At, engine: Engine): Promise<string> => {
  const page = await at.kit.page("desk", { engine });
  const said = errorsOf(page);
  await open(
    page,
    `${at.base}/artifact/${at.id}`,
    `${PANE} [data-slot="comments"]`
  );
  const frame = (await until(
    "the page in the pane",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  )) as Frame;
  await frame.waitForSelector(`#desk-${engine}`);
  await until(
    "the overlay joined its doc",
    () =>
      frame.evaluate(
        () =>
          !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
            .cawcoArtifact?.doc
      ),
    Boolean,
    30_000
  );
  await settle(page, 400);
  await page.locator(`${PANE} button[aria-keyshortcuts='C']`).click();
  await commenting(frame);
  const pageBefore = Object.keys(await pagePins(frame)).length;
  const hubBefore = (await hubPins(at)).length;
  const point = await centreOf(page, frame, `#desk-${engine}`);
  await page.mouse.move(point.x, point.y, { steps: 4 });
  await pressAt(frame, point);
  const composed = await page
    .locator(COMPOSE)
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  // Past the hub's quiet: a pin written now would be on the page and the hub.
  await page.waitForTimeout(HELD_MS);
  const pageHeld = Object.keys(await pagePins(frame)).length;
  const hubHeld = (await hubPins(at)).length;
  at.kit.check(
    `2 ${engine}: in the dashboard a click in Comment mode opens the composer and writes nothing, on the page or the hub (composer ${composed}; page pins ${pageBefore} → ${pageHeld}; hub pins ${hubBefore} → ${hubHeld})`,
    composed && pageHeld === pageBefore && hubHeld === hubBefore
  );
  const words = `Typed in the dashboard on ${engine}.`;
  if (composed) {
    await page.locator(COMPOSE).getByRole("combobox").fill(words);
    await page.keyboard.press("Enter");
  }
  const kept = await until(
    "the typed comment on the hub",
    () => hubPins(at),
    (pins) =>
      pins.some((pin) => pin.thread.some((entry) => entry.text === words)),
    10_000
  ).catch(() => [] as HubPin[]);
  const written = kept.find((pin) =>
    pin.thread.some((entry) => entry.text === words)
  );
  at.kit.check(
    `2 ${engine}: words typed and Enter write the pin with them, its first entry the person's (${JSON.stringify(written?.thread.map((entry) => entry.text))})`,
    !!written &&
      written.thread.length === 1 &&
      written.thread[0]?.by === "person"
  );
  at.kit.check(
    `2 ${engine}: the dashboard's pages said no error`,
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
  const url = frame.url();
  await page.close();
  return url;
};

/** 1. The app's host: a tap writes the pin, the app's card opens it, a reply fills it, a withdraw takes one back. */
const appLeg = async (at: At, engine: Engine, preview: string) => {
  const page = await at.kit.page("iphone", {
    engine,
    // The handler WebKit holds before any script runs, then makeWeb's two user scripts in its order.
    init: [
      appHandler,
      { content: await appScript("host") },
      { content: atDocumentElement(await appScript("viewport")) },
    ],
  });
  const said = errorsOf(page);
  await page.goto(preview);
  await page.waitForSelector(`#app-${engine}`);
  await until(
    "the page's `cawco:loaded`",
    () => appHeard(page),
    (all) => all.some((one) => one.type === "cawco:loaded"),
    15_000
  );
  // PreviewController.swift `hello()`, then `ready()`'s mode.
  await deliver(page, {
    type: "cawco:hello",
    artifact: { id: at.id, kind: "page", name: NAME },
    sync: `/__cawco/artifact/${at.id}`,
    theme: "light",
    inset: { top: 0, side: 0 },
  });
  const ready = await until(
    "the overlay's `cawco:ready`",
    () => appHeard(page),
    (all) => all.some((one) => one.type === "cawco:ready"),
    15_000
  ).catch(() => [] as Heard[]);
  at.kit.check(
    `1 ${engine}: the page in the app's host answers the app's hello with cawco:ready`,
    ready.some((one) => one.type === "cawco:ready")
  );
  await until(
    "the overlay joined its doc",
    () =>
      page.evaluate(
        () =>
          !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
            .cawcoArtifact?.doc
      ),
    Boolean,
    15_000
  );
  await deliver(page, { type: "cawco:mode", mode: "comment", place: null });
  await commenting(page.mainFrame());
  const before = (await appHeard(page)).length;
  const heardBefore = heard.length;
  await pressAt(
    page.mainFrame(),
    await centreOf(page, page.mainFrame(), `#app-${engine}`),
    {
      how: "tap",
    }
  );
  const posted = await until(
    "the page's cawco:pin-open",
    async () => (await appHeard(page)).slice(before),
    (all) => all.some((one) => one.type === "cawco:pin-open"),
    5000
  ).catch(() => [] as Heard[]);
  const opened = posted.find((one) => one.type === "cawco:pin-open");
  const id = typeof opened?.id === "string" ? opened.id : null;
  const carried = opened?.pin as Pin | undefined;
  at.kit.check(
    `1 ${engine}: a tap in Comment mode posts cawco:pin-open with the pin's id, made: true and the pin, and no composer (${JSON.stringify(posted.map((one) => one.type))}; id ${id}; made ${String(opened?.made)}; pin ${carried?.id} #${carried?.number})`,
    !!id &&
      opened?.made === true &&
      opened?.via === "pointer" &&
      carried?.id === id &&
      carried.kind === "comment" &&
      carried.thread.length === 0 &&
      !posted.some((one) => one.type === "cawco:compose")
  );
  if (!id) {
    await page.close();
    return;
  }
  const onHub = await until(
    "the tap's pin on the hub",
    () => hubPins(at),
    (pins) => pins.some((pin) => pin.id === id),
    10_000
  ).catch(() => [] as HubPin[]);
  const kept = onHub.find((pin) => pin.id === id);
  const selector =
    kept && "selector" in kept.anchor ? kept.anchor.selector : null;
  const anchored = selector
    ? await page.evaluate(
        (one) => document.querySelector(one)?.id ?? null,
        selector
      )
    : null;
  at.kit.check(
    `1 ${engine}: the hub keeps the tap's pin, the app's card reads it there: a comment on the paragraph, its thread empty (${kept ? `#${kept.number} ${kept.kind} on ${selector} → #${anchored}, thread ${kept.thread.length}` : "none"})`,
    !!kept &&
      kept.kind === "comment" &&
      anchored === `app-${engine}` &&
      kept.thread.length === 0
  );
  // The card stands open while the person writes: nothing of the empty pin goes.
  await page.waitForTimeout(HELD_MS);
  const early = notices(heardBefore, id);
  at.kit.check(
    `1 ${engine}: the empty pin goes nowhere while its card is open, past the hub's ${QUIET_MS} ms quiet (${early.length} notices)`,
    early.length === 0,
    early.map((one) => one.slice(0, 200)).join(" | ") || "none"
  );
  const words = `Said in the app on ${engine}.`;
  const beforeReply = (await appHeard(page)).length;
  await deliver(page, { type: "cawco:reply", pin: id, text: words });
  const answered = await until(
    "the page's cawco:reply-result",
    async () => (await appHeard(page)).slice(beforeReply),
    (all) => all.some((one) => one.type === "cawco:reply-result"),
    10_000
  ).catch(() => [] as Heard[]);
  const result = answered.find((one) => one.type === "cawco:reply-result");
  const replied = await until(
    "the reply on the hub",
    () => hubPins(at),
    (pins) =>
      pins.some(
        (pin) =>
          pin.id === id && pin.thread.some((entry) => entry.text === words)
      ),
    10_000
  ).catch(() => [] as HubPin[]);
  at.kit.check(
    `1 ${engine}: the app's cawco:reply writes the words in the pin, answered ok, and the hub keeps them (${JSON.stringify(result)})`,
    result?.ok === true &&
      result.pin === id &&
      replied.some(
        (pin) =>
          pin.id === id &&
          pin.thread.length === 1 &&
          pin.thread[0]?.text === words &&
          pin.thread[0]?.by === "person"
      )
  );
  const delivered = await until(
    "the session hearing the app's comment",
    async () => notices(heardBefore, id),
    (all) => all.some((one) => one.includes(words)),
    DELIVERY_MS
  ).catch(() => notices(heardBefore, id));
  at.kit.check(
    `1 ${engine}: the session hears the app's comment by itself, once, with its words (${delivered.length} notices name it)`,
    delivered.length === 1 && !!delivered[0]?.includes(words),
    delivered.map((one) => one.slice(0, 200)).join(" | ") || "none"
  );

  // A second tap's pin, dismissed unsaid: the app's `closeCard` posts `cawco:withdraw`.
  const beforeSecond = (await appHeard(page)).length;
  await pressAt(
    page.mainFrame(),
    await centreOf(page, page.mainFrame(), `#gone-${engine}`),
    { how: "tap" }
  );
  const second = (
    await until(
      "the second tap's cawco:pin-open",
      async () => (await appHeard(page)).slice(beforeSecond),
      (all) => all.some((one) => one.type === "cawco:pin-open"),
      5000
    ).catch(() => [] as Heard[])
  ).find((one) => one.type === "cawco:pin-open");
  const secondId = typeof second?.id === "string" ? second.id : null;
  const secondOnHub = secondId
    ? await until(
        "the second pin on the hub",
        () => hubPins(at),
        (pins) => pins.some((pin) => pin.id === secondId),
        10_000
      )
        .then(() => true)
        .catch(() => false)
    : false;
  if (secondId) {
    await deliver(page, { type: "cawco:track-pin", id: null });
    await deliver(page, { type: "cawco:withdraw", pin: secondId });
  }
  const gone = secondId
    ? await until(
        "the withdrawn pin gone from the hub",
        () => hubPins(at),
        (pins) => !pins.some((pin) => pin.id === secondId),
        10_000
      )
        .then(() => true)
        .catch(() => false)
    : false;
  const pagePinsNow = Object.keys(await pagePins(page.mainFrame()));
  at.kit.check(
    `1 ${engine}: a second tap's pin (${secondId}, made ${String(second?.made)}, on the hub ${secondOnHub}), its card dismissed unsaid (cawco:withdraw), leaves the hub and the page's doc, the first standing (page's pins ${JSON.stringify(pagePinsNow)})`,
    !!secondId &&
      second?.made === true &&
      secondOnHub &&
      gone &&
      !pagePinsNow.includes(secondId) &&
      pagePinsNow.includes(id)
  );
  at.kit.check(
    `1 ${engine}: the app's page said no error`,
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
  await page.close();
};

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
  const session = await fleet.spawn("claude", "App comment", fleet.repo);
  const { id } = await fleet.api<{ id: string }>(
    `/api/instances/${session}/artifacts`,
    {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: NAME,
      html: PAGE,
    }
  );
  const base = await fleet.dashboard();
  const at: At = { base, fleet, id, kit, session };
  for (const engine of ["chromium", "webkit"] as const) {
    const preview = await dashboardLeg(at, engine);
    kit.note(`${engine}: the preview's address ${preview}`);
    await appLeg(at, engine, preview);
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "app-comment-mode",
  run,
};
export default spec;
