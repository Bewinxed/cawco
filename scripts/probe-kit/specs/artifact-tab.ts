/**
 * An artifact in a tab of its own (`/artifact/<id>`) is the artifact alone
 * (owner: "if i click to open the preview in a tab, i don't want to see the
 * whole app there just the artifact, makes the page too heavy"). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which calls the hub's MCP tools as each PROBE-CALL message says)
 * and the built dashboard at the desk, read from the DOM, never pixels:
 *
 * 1. A page artifact's tab and a canvas's: no element of the app around it
 *    (rail, top bar, tab strips, session surface, Caw's head, the machines).
 * 2. The tab's column is the viewport, the pane's well spans it, and the
 *    page's frame (or the canvas's stage, over its slot) fills the well
 *    (getBoundingClientRect, ±2px).
 * 3. Hovering a pane control shows its tip (its title) and says no error.
 * 4. A pin's picture, from its card's thumbnail, opens in the lightbox.
 * 5. No console error in either tab.
 * 6. The JS each tab transferred (built dashboard) is within its budget,
 *    against main's reading with the app around it.
 * 7. On the dev server, where each source file is its own URL, neither tab
 *    fetches a module of the app's shell, session surface, fleet store or
 *    transcript (APP_MODULE): none under transcript/ at all.
 * 8. Every request and WebSocket each tab opens, built and dev, is on the
 *    allow-list (ALLOWED): the document and its build's files, the
 *    artifact's own hub routes, its session's socket, and the preview's own
 *    requests and doc socket. The owner: "an artifact shouldn't load
 *    anything that is not needed for the preview/artifact, no unnecessary
 *    connections etc". So no fleet socket and no fleet REST read.
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer: its JSON, or the sentence a canvas no screen shows answers. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"|\(id ([0-9a-f-]{36})\)/;
const idOf = (answer: string) => {
  const found = answer.match(ANSWERED_ID);
  return found?.[1] ?? found?.[2];
};
const FRAME = 'iframe[title="Preview"]';
/** Every element only the app around a page draws (Shell.svelte and what it mounts). */
const APP_PARTS = [
  ".shell",
  "aside.rail",
  "header.top",
  "#main-content",
  ".slot-tabs",
  ".rail-sheet",
  "[data-bar-group]",
  ".tools",
  "[data-leaf]",
  ".glass-face",
  ".kit-pop.glass-card",
  ".skip",
] as const;
const TOLERANCE = 2;
/** The JS each tab transferred on main (94508c8d's parent), with the app around it. */
const MAIN_KB = { page: 1289, canvas: 2728 } as const;
/**
 * What each tab may transfer now: outside the app's group, on its own
 * session socket, with no fleet store (measured 576 and 2015 KB; 649 and
 * 2088 KB with the fleet store).
 */
const BUDGET_KB = { page: 620, canvas: 2060 } as const;
/**
 * A source file only the app around a page uses: the Shell and what it
 * mounts, the session surface and its panes, the fleet store
 * (client.svelte.ts) and the app's upkeep, and anything under transcript/
 * or workspace/.
 */
const APP_MODULE =
  /\/lib\/cawco\/(?:Shell|Sidebar|SessionSurface|SessionPane|ThreadPane|NeedsCaw|MachinesButton|GlassCard|CawPanel|client)\.svelte|\/lib\/cawco\/(?:transcript|workspace|updates|tab-icon)\/|\/lib\/cawco\/motion\/rest\./;

/**
 * What a tab may ask for, by path on the dashboard's origin (`$sid` is the
 * artifact's session, `$id` the artifact):
 * - the document, and its build's files (`/_app/`: JS, CSS, fonts, icon);
 * - the artifact's own hub routes: find it, show it, say it is shown, and
 *   the session's artifacts the menu lists;
 * - its session's socket (the hub's ARTIFACT_SESSION_PATH);
 * - the preview's own (`/preview/$sid/`): its page, its overlay, its doc's
 *   sync socket, its send; and any request a preview frame makes itself.
 * On the dev server, Vite's own module URLs and its HMR socket too.
 */
const BUILD_FILE = /^GET \/_app\//;
const VITE_MODULE =
  /^GET \/(?:@vite\/|@fs\/|@id\/|node_modules\/|src\/|\.svelte-kit\/)/;
const VITE_HMR = /^\/\?token=/;
const NOT_AN_ID = /[^0-9a-f-]/g;
/** A socket's origin as the page's: `ws:`/`wss:` for `http:`/`https:`. */
const WS_SCHEME = /^ws/;
const allowed = (
  sid: string,
  id: string,
  dev: boolean
): { requests: RegExp[]; sockets: RegExp[] } => {
  const s = sid.replace(NOT_AN_ID, "");
  const a = id.replace(NOT_AN_ID, "");
  return {
    requests: [
      new RegExp(`^GET /artifact/${a}$`),
      BUILD_FILE,
      new RegExp(`^GET /api/artifacts/${a}$`),
      new RegExp(`^POST /api/instances/${s}/artifacts/${a}/(?:show|shown)$`),
      new RegExp(`^GET /api/instances/${s}/artifacts$`),
      new RegExp(`^(?:GET|POST) /preview/${s}/`),
      ...(dev ? [VITE_MODULE] : []),
    ],
    sockets: [
      new RegExp(`^/ws/artifact-session/${s}$`),
      new RegExp(`^/preview/${s}/`),
      // Vite's HMR socket, on the dev server alone.
      ...(dev ? [VITE_HMR] : []),
    ],
  };
};

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Alone</title></head>
  <body>
    <h1>A tab of its own</h1>
    <p id="para">Nothing of the app around it.</p>
  </body>
</html>`;

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

/** A tab's errors, the JS it fetched, and every request and socket it opened, kept from its first request. */
const watch = (page: Page) => {
  const errors: string[] = [];
  const scripts: Promise<number>[] = [];
  /** Each request, as `METHOD /path`, and whether a preview frame made it. */
  const requests: { line: string; origin: string; framed: boolean }[] = [];
  /** Each WebSocket, as `/path?query`, and its origin. */
  const sockets: { line: string; origin: string }[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    requests.push({
      line: `${request.method()} ${url.pathname}`,
      origin: url.origin,
      framed: request.frame() !== page.mainFrame(),
    });
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    sockets.push({ line: `${url.pathname}${url.search}`, origin: url.origin });
  });
  page.on("requestfinished", (request) => {
    if (request.resourceType() === "script") {
      scripts.push(
        request.sizes().then((s) => s.responseBodySize + s.responseHeadersSize)
      );
    }
  });
  return {
    errors,
    requests,
    sockets,
    bytes: async () => {
      const sizes = await Promise.all(scripts);
      return {
        files: sizes.length,
        kb: Math.round(sizes.reduce((a, b) => a + b, 0) / 1024),
      };
    },
  };
};

/**
 * Check 8 on one tab: every request its own document made, and every socket
 * it opened, on the allow-list and the dashboard's origin. A preview frame's
 * own requests are the preview's, whatever they are.
 */
const onlyItsOwn = (
  kit: Kit,
  seen: ReturnType<typeof watch>,
  where: { base: string; dev: boolean; id: string; kind: string; sid: string }
): void => {
  const { origin } = new URL(where.base);
  const allow = allowed(where.sid, where.id, where.dev);
  const strayRequests = seen.requests
    .filter(
      (one) =>
        !one.framed &&
        (one.origin !== origin ||
          !allow.requests.some((rule) => rule.test(one.line)))
    )
    .map((one) =>
      one.origin === origin ? one.line : `${one.origin}${one.line}`
    );
  const straySockets = seen.sockets
    .filter(
      (one) =>
        one.origin.replace(WS_SCHEME, "http") !== origin ||
        !allow.sockets.some((rule) => rule.test(one.line))
    )
    .map((one) => `WS ${one.line}`);
  const strays = [...new Set([...strayRequests, ...straySockets])];
  const socketList = [...new Set(seen.sockets.map((one) => one.line))];
  kit.check(
    `8: the ${where.kind} tab (${where.dev ? "dev server" : "built"}) opens only its own requests and sockets`,
    strays.length === 0,
    `${strays.slice(0, 12).join(", ") || "none off the list"}; ${seen.requests.length} requests; sockets: ${socketList.join(", ")}`
  );
};

/** What of the app around the artifact is in the tab. */
const appParts = (page: Page) =>
  page.evaluate(
    (parts) => parts.filter((one) => document.querySelector(one)),
    [...APP_PARTS]
  );

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** The boxes the fill check reads: the tab's column, the pane's well, and what fills it. */
const boxes = (page: Page, filler: string) =>
  page.evaluate((what) => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) {
        return null;
      }
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const well = document.querySelector(".side-well");
    const border = well
      ? Number.parseFloat(getComputedStyle(well).borderTopWidth)
      : 0;
    return {
      viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      tab: box(".artifact-tab"),
      card: box(".side-card"),
      well: box(".side-well"),
      border,
      filler: box(what),
      pad: Number.parseFloat(
        getComputedStyle(
          document.querySelector(".artifact-tab") ?? document.body
        ).paddingLeft
      ),
    };
  }, filler);

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;
const same = (a: Box | null, b: Box | null) =>
  !!a &&
  !!b &&
  near(a.left, b.left) &&
  near(a.top, b.top) &&
  near(a.right, b.right) &&
  near(a.bottom, b.bottom);
/** `outer` shrunk by `by` on every side. */
const inset = (outer: Box | null, by: number): Box | null =>
  outer && {
    left: outer.left + by,
    top: outer.top + by,
    right: outer.right - by,
    bottom: outer.bottom - by,
  };

/** Checks 1, 2 and 5's first half on one tab: nothing of the app, and the artifact filling it. */
const alone = async (
  kit: Kit,
  page: Page,
  kind: string,
  filler: string
): Promise<void> => {
  const found = await appParts(page);
  kit.check(
    `1: the ${kind}'s tab holds nothing of the app around it`,
    found.length === 0,
    found.join(", ") || "none of the shell's parts"
  );
  const b = await boxes(page, filler);
  // The tab's padding and the card's own sit between the viewport and the well.
  const wellSpans =
    !!b.well &&
    b.well.left - b.viewport.left <= b.pad * 2 + TOLERANCE &&
    b.viewport.right - b.well.right <= b.pad * 2 + TOLERANCE &&
    b.viewport.bottom - b.well.bottom <= b.pad * 2 + TOLERANCE;
  kit.check(
    `2: the ${kind}'s tab is the viewport, its well spans it, and ${filler} fills the well (±${TOLERANCE}px)`,
    same(b.tab, b.viewport) &&
      wellSpans &&
      same(b.filler, inset(b.well, b.border)),
    JSON.stringify(b)
  );
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
  const session = await fleet.spawn("claude", "Alone", fleet.repo);

  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };

  const made = await call(CREATE, { kind: "page", name: "alone", html: PAGE });
  const pageId = idOf(made);
  const drawn = await call(CREATE, {
    kind: "canvas",
    name: "alone-sketch",
    mermaid: "flowchart LR; A --> B",
  });
  const canvasId = idOf(drawn);
  if (!(pageId && canvasId)) {
    kit.check("artifact_create answers both ids", false, `${made} | ${drawn}`);
    return;
  }
  const base = await fleet.dashboard();

  // ── The page artifact's tab ───────────────────────────────────────────
  const tab = await kit.page("desk");
  const seen = watch(tab);
  await open(tab, `${base}/artifact/${pageId}`, FRAME);
  const frame = await until(
    "the page in the tab's frame",
    async () =>
      (await (await tab.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  );
  await until(
    "the page's bridge up",
    () =>
      frame?.evaluate(
        () => !!(window as unknown as { cawcoArtifact?: object }).cawcoArtifact
      ) ?? false,
    Boolean,
    30_000
  );
  await settle(tab);
  const pageBytes = await seen.bytes();
  await alone(kit, tab, "page", FRAME);

  // 3. A pane control's tip on hover.
  const reload = tab.getByRole("button", { name: "Reload" });
  await reload.hover();
  await settle(tab, 600);
  const tip = await reload.getAttribute("title");
  kit.check(
    "3: hovering the pane's Reload shows its tip and says no error",
    tip === "Reload" && seen.errors.length === 0,
    `title ${JSON.stringify(tip)}; errors: ${seen.errors.join(" | ") || "none"}`
  );

  // 4. A pin, written by the page's own doc as the overlay writes one; its
  // card's thumbnail opens the lightbox.
  await frame?.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
          };
        };
      }
    ).cawcoArtifact;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    doc.getMap("pins").set(id, {
      id,
      number: 1,
      kind: "comment",
      by: "person",
      at: now,
      anchor: { selector: "h1", source: null, text: "A tab of its own" },
      elements: [],
      thread: [
        { id: crypto.randomUUID(), by: "person", text: "Bigger", at: now },
      ],
    });
  });
  await tab.locator('[data-pin-row="1"]').click({ timeout: 20_000 });
  const thumb = tab.getByRole("button", { name: "Pin 1's picture, full size" });
  await thumb.waitFor({ timeout: 30_000 });
  await thumb.click();
  const lightboxed = await until(
    "the lightbox open on the pin's picture",
    () =>
      tab.evaluate(() => {
        const root = document.querySelector(".cawco-pswp.pswp--open");
        const img = root?.querySelector<HTMLImageElement>(".pswp__img");
        return root && img ? img.src.slice(0, 22) : null;
      }),
    Boolean,
    10_000
  ).catch(() => null);
  kit.check(
    "4: the pin's picture opens in the lightbox",
    lightboxed === "data:image/png;base64,",
    `lightbox image ${JSON.stringify(lightboxed)}`
  );
  await tab.keyboard.press("Escape");
  kit.check(
    "5: the page's tab says no console error",
    seen.errors.length === 0,
    seen.errors.join(" | ") || "none"
  );
  onlyItsOwn(kit, seen, {
    base,
    dev: false,
    id: pageId,
    kind: "page",
    sid: session,
  });

  // ── The canvas's tab ──────────────────────────────────────────────────
  const canvas = await kit.page("desk");
  const heard = watch(canvas);
  const stage = `.canvas-stage[data-artifact="${canvasId}"]`;
  await open(canvas, `${base}/artifact/${canvasId}`, ".canvas-slot");
  await canvas.locator(`${stage} iframe`).waitFor({ timeout: 60_000 });
  await settle(canvas);
  const canvasBytes = await heard.bytes();
  await alone(kit, canvas, "canvas", ".canvas-slot");
  const stageOnSlot = await canvas.evaluate((selector) => {
    const box = (node: Element | null) => {
      const r = node?.getBoundingClientRect();
      return r
        ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        : null;
    };
    return {
      stage: box(document.querySelector(selector)),
      slot: box(document.querySelector(".canvas-slot")),
    };
  }, stage);
  kit.check(
    "2: the canvas's stage stands over its slot (±2px)",
    same(stageOnSlot.stage, stageOnSlot.slot),
    JSON.stringify(stageOnSlot)
  );
  kit.check(
    "5: the canvas's tab says no console error",
    heard.errors.length === 0,
    heard.errors.join(" | ") || "none"
  );
  onlyItsOwn(kit, heard, {
    base,
    dev: false,
    id: canvasId,
    kind: "canvas",
    sid: session,
  });

  // 6. The JS each tab transferred, against main's reading with the app around it.
  kit.check(
    `6: the page tab's JS is at most ${BUDGET_KB.page} KB (main: ${MAIN_KB.page} KB with the app around it)`,
    pageBytes.kb <= BUDGET_KB.page,
    `${pageBytes.kb} KB in ${pageBytes.files} files`
  );
  kit.check(
    `6: the canvas tab's JS is at most ${BUDGET_KB.canvas} KB (main: ${MAIN_KB.canvas} KB with the app around it)`,
    canvasBytes.kb <= BUDGET_KB.canvas,
    `${canvasBytes.kb} KB in ${canvasBytes.files} files`
  );

  // 7. By module, on the dev server, where each source file is its own URL.
  const dev = await fleet.devDashboard();
  for (const [kind, id, ready] of [
    ["page", pageId, FRAME],
    ["canvas", canvasId, `${stage} iframe`],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one tab at a time, each its own list
    const devTab = await kit.page("desk");
    const devSeen = watch(devTab);
    const fetched: string[] = [];
    devTab.on("request", (request) => {
      if (request.resourceType() === "script") {
        fetched.push(new URL(request.url()).pathname);
      }
    });
    await open(devTab, `${dev}/artifact/${id}`, ready, 120_000);
    await settle(devTab);
    const strays = fetched.filter((path) => APP_MODULE.test(path));
    kit.check(
      `7: the ${kind} tab fetches none of the app's shell, session, fleet store or transcript modules`,
      strays.length === 0,
      `${strays.slice(0, 8).join(", ") || "none"} of ${fetched.length} modules`
    );
    onlyItsOwn(kit, devSeen, { base: dev, dev: true, id, kind, sid: session });
  }
};

const spec: Spec = { name: "artifact-tab", run };
export default spec;
