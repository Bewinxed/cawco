/**
 * A Preview of a dev server that is still starting shows the house's
 * Opening… wait until its page draws, never that it "showed nothing within
 * 30 s" (owner, 2026-11-07: a decision page's Preview of a workspace's dev
 * server woken from sleep said "This preview didn't load: its page loaded
 * but showed nothing within 30 s"; opened a moment later, it drew).
 *
 * A dev server woken from sleep answers the document as soon as its port
 * listens, and then compiles the app's modules one by one as the page asks
 * for them: SvelteKit's document loads its app by a dynamic `import()`,
 * which the frame's `load` does not wait for, so the Preview's 30 s ran
 * from that load while the modules were still arriving; and a cold Vite
 * holds every module that imports a dependency until it has scanned and
 * bundled them, so nothing arrives at all for that while (owner, 2026-11-07
 * again, on the dashboard's own dev server, with the first fix). One live
 * server plays each start, each a preview artifact of a session:
 *
 * - `/cold`: its document at once, its app a chain of modules each
 *   answered {@link STEP_MS} after it is asked (a cold compile), the last
 *   drawing {@link COLD_HEADING} well past 30 s from the document's load;
 * - `/late`: its document held until the cold page has drawn, past 30 s
 *   (a server whose port listens late: its install, its first build), then
 *   a page that draws {@link LATE_HEADING} at once.
 *
 * Read from the DOM, on a scratch fleet (real hub, agent and sessiond):
 *
 * - (1) a decision page with a Preview of each, read every half second:
 *   each says Opening… (`decisionsWords.previewOpening`) until its frame
 *   draws its page's heading, and no fault (`embed-cause`) stands in its
 *   place at any read;
 * - (2) the cold page's own tab, opened once the cold Preview drew and
 *   while the late page is still held: the panel's frame draws its heading
 *   with no down notice and no "didn't load" state at any read;
 * - (3) a page that loads, asks its server for data every second and shows
 *   nothing (`/empty`) still says it showed nothing within 30 s: data its
 *   server answers at once is no page arriving;
 * - (4) a page whose server holds what it asks after its load, past 30 s
 *   with nothing arriving meanwhile, each on a decision page of its own,
 *   says Opening… until it draws, with no fault: `/held`, whose app module
 *   the server holds (Vite holding a cold app's modules while it scans and
 *   bundles its dependencies), and `/data`, whose data fetch the server
 *   holds (a route waiting on its data). Both are held from before leg (2)
 *   until leg (3)'s notice stands.
 *
 *   bun scripts/probe-kit/run.ts preview-cold-start
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { decisionsWords } from "../../../packages/core/src/words/decisions";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** How long each module of the cold page's app takes to be answered, and how many there are: 45 s of compile after the document. */
const STEP_MS = 3000;
const MODULES = 15;
const COLD = "/cold";
const LATE = "/late";
const EMPTY = "/empty";
const HELD = "/held";
const DATA = "/data";
const HELD_HEADING = "Find in a conversation, held module";
const DATA_HEADING = "Find in a conversation, held data";
const COLD_HEADING = "Find in a conversation, compiled";
const LATE_HEADING = "Find in a conversation, started late";
/** How long both may take to draw: past the slowest start with room. */
const DRAWN_MS = 120_000;
/** A module of the cold page's app, by its place in the chain. */
const MODULE = /^\/mod\/(\d+)\.js$/u;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const html = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
const js = (code: string) =>
  new Response(code, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/** The app's root, empty until `script` mounts something in it. */
const shell = (title: string, script: string) =>
  html(title, `<div id="app"></div><script type="module">${script}</script>`);
/** A module that mounts `heading` in the app's root. */
const mounts = (heading: string) =>
  js(`document.getElementById("app").innerHTML = "<h1>${heading}</h1>";`);

/** The live server's pages and files, by path: a cold page whose modules compile slowly, a page whose document comes late, an empty page that polls, and pages whose module or data the server holds. */
const routes = (
  lateHeld: Promise<void>,
  held: Promise<void>
): Record<string, () => Promise<Response> | Response> => ({
  // SvelteKit's dev document: its app by a dynamic import, which the
  // frame's load does not wait for; an empty root until it mounts.
  [COLD]: () => shell("Cold", `import("/mod/0.js")`),
  [EMPTY]: () => shell("Empty", `setInterval(() => fetch("/poll"), 1000)`),
  "/poll": () => Response.json([]),
  [HELD]: () => shell("Held", `import("/held/app.js")`),
  "/held/app.js": async () => {
    await held;
    return mounts(HELD_HEADING);
  },
  [DATA]: () =>
    shell(
      "Data",
      `const said = await (await fetch("/data.json")).json(); document.getElementById("app").innerHTML = "<h1>" + said.heading + "</h1>";`
    ),
  "/data.json": async () => {
    await held;
    return Response.json({ heading: DATA_HEADING });
  },
  [LATE]: async () => {
    await lateHeld;
    return html("Late", `<h1>${LATE_HEADING}</h1>`);
  },
});

/** A module of the cold page's app, answered {@link STEP_MS} after it is asked. */
const coldModule = async (index: number) => {
  await Bun.sleep(STEP_MS);
  return index + 1 < MODULES
    ? js(`import "/mod/${index + 1}.js";`)
    : mounts(COLD_HEADING);
};

/** The live server. */
const serve = (lateHeld: Promise<void>, held: Promise<void>) => {
  const pages = routes(lateHeld, held);
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      const at = MODULE.exec(pathname);
      if (at) {
        return coldModule(Number(at[1]));
      }
      return pages[pathname]?.() ?? new Response(null, { status: 404 });
    },
  });
};

/** A preview artifact of session `session` on `port`, at `path`. */
const previewOf = (
  fleet: KitFleet,
  session: string,
  port: number,
  path: string,
  name: string
) =>
  fleet.api((hub) =>
    hub.api.instances({ id: session }).artifacts.post({
      kind: "preview",
      does: "try",
      title: `Probe ${name}`,
      ask: "Try this page and say whether it works",
      name,
      port,
      path,
      machine: MACHINE,
    })
  );

/** The desk's workspace: one tab, session `id`'s, in front. */
const tabAt = (page: Page, id: string) =>
  page.addInitScript((shown) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: {
          t: "l",
          id: "pone",
          tabs: [shown],
          active: shown,
          opened: null,
        },
        focusedLeaf: "pone",
      })
    );
  }, id);

/** One read of the decision page in session `id`'s pane: its Previews' faults, their wait lines, and the heading each embed draws. */
const decisionRead = async (page: Page, id: string) => {
  const handle = await page
    .locator(`[data-slot="pane"][data-pane="${id}"] ${FRAME}`)
    .first()
    .elementHandle()
    .catch(() => null);
  const frame = await handle?.contentFrame();
  const said = (await frame
    ?.evaluate(() => ({
      causes: [...document.querySelectorAll('[data-slot="embed-cause"]')].map(
        (one) => one.textContent?.replace(/\s+/gu, " ").trim() ?? ""
      ),
      waits: [...document.querySelectorAll('[data-slot="wait-row"]')]
        .map((one) => one.textContent?.replace(/\s+/gu, " ").trim() ?? "")
        .filter(Boolean),
    }))
    .catch(() => null)) ?? { causes: [] as string[], waits: [] as string[] };
  const headings: string[] = [];
  for (const one of page.frames()) {
    const { pathname } = new URL(one.url(), "http://x");
    if ([COLD, LATE, HELD, DATA].includes(pathname)) {
      const words = await one
        .locator("h1")
        .first()
        .textContent({ timeout: 200 })
        .catch(() => null);
      if (words) {
        headings.push(words);
      }
    }
  }
  return { ...said, headings };
};

type Read = Awaited<ReturnType<typeof decisionRead>>;

/** What the cold page's own tab shows: its heading in the panel's frame, and any notice that it didn't load. */
const tabRead = async (page: Page) => {
  const notice = await page
    .locator('[data-slot="down"], [data-slot="not-loaded"]')
    .first()
    .isVisible()
    .catch(() => false);
  const heading = await page
    .frameLocator(FRAME)
    .locator("h1")
    .first()
    .textContent({ timeout: 200 })
    .catch(() => null);
  return { notice, heading };
};

/** Leg (4)'s pages: what of each its server holds, and the heading it draws once answered. */
const HELD_PAGES = [
  {
    path: HELD,
    name: "held",
    caption: "Held module",
    held: "app module",
    heading: HELD_HEADING,
  },
  {
    path: DATA,
    name: "data",
    caption: "Held data",
    held: "data fetch",
    heading: DATA_HEADING,
  },
] as const;

/** A decision page of its own with a Preview of `one`, opened in a browser of its own. */
const openHeld = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  port: number,
  one: (typeof HELD_PAGES)[number]
) => {
  const at = await fleet.spawn("claude", `Pick ${one.name}`, fleet.repo);
  const art = await previewOf(fleet, at, port, one.path, one.name);
  await fleet.api((hub) =>
    hub.api.instances({ id: at }).artifacts.post({
      kind: "page",
      does: "pick",
      title: `Probe ${one.name} page`,
      ask: "Pick one option on each card",
      name: `pick-${one.name}`,
      program: `root = Decisions("Pick the page", [which])
which = Decision("which", "Which page ships?", [e, k], "Both are in the app.", [], [], false, null, "behaviour")
e = Option("e", "${one.caption}", "Its server holds what it asks.", true, [a], "Nothing new.")
k = Option("k", "Keep", "As it is.", false, [], "Nothing new.")
a = Preview("${art.id}", "${one.caption}")`,
    })
  );
  const page = await kit.page("desk", { oneProcess: true });
  await tabAt(page, at);
  await page.goto(`${base}/session/${at}`).catch(() => undefined);
  return { ...one, page, session: at, opened: Date.now() };
};

/** Reads a held page's decision page every half second until its Preview draws its heading: every fault said meanwhile, and the last read. */
const drawnOnce = async (one: Awaited<ReturnType<typeof openHeld>>) => {
  const from = Date.now();
  const faults = new Set<string>();
  let read = await decisionRead(one.page, one.session);
  while (Date.now() - from < DRAWN_MS) {
    read = await decisionRead(one.page, one.session);
    for (const cause of read.causes) {
      faults.add(cause);
    }
    if (read.headings.includes(one.heading)) {
      break;
    }
    await Bun.sleep(500);
  }
  return { read, faults: [...faults] };
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-cold-start",
  run: async (kit: Kit) => {
    const { check } = kit;
    const release = Promise.withResolvers<void>();
    const releaseHeld = Promise.withResolvers<void>();
    const app = serve(release.promise, releaseHeld.promise);
    const port = Number(app.port);
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();

    // (1) A decision page's Preview of each start.
    const session = await fleet.spawn("claude", "Pick a start", fleet.repo);
    const cold = await previewOf(fleet, session, port, COLD, "cold");
    const late = await previewOf(fleet, session, port, LATE, "late");
    await fleet.api((hub) =>
      hub.api.instances({ id: session }).artifacts.post({
        kind: "page",
        does: "pick",
        title: "Probe cold starts",
        ask: "Pick one option on each card",
        name: "pick-start",
        program: `root = Decisions("Pick the search", [which])
which = Decision("which", "Which search ships?", [c, l], "Both are served by the app.", [], [], false, null, "look")
c = Option("c", "Compiled cold", "Its modules compile as they are asked for.", true, [a], "Nothing new.")
l = Option("l", "Started late", "Its server listens late.", false, [b], "Nothing new.")
a = Preview("${cold.id}", "Compiled cold")
b = Preview("${late.id}", "Started late")`,
      })
    );
    const page = await kit.page("desk", { oneProcess: true });
    await tabAt(page, session);
    const opened = Date.now();
    await page.goto(`${base}/session/${session}`).catch(() => undefined);
    const opening = [
      decisionsWords.previewOpening("Compiled cold"),
      decisionsWords.previewOpening("Started late"),
    ];
    /** Every fault said at any read, and the waits read before each page drew. */
    const faults = new Set<string>();
    const waitsSeen = new Set<string>();
    /** Reads the decision page every half second until `done` holds of a read, or {@link DRAWN_MS} passes. */
    const watch = async (done: (read: Read) => boolean) => {
      const from = Date.now();
      let read = await decisionRead(page, session);
      while (Date.now() - from < DRAWN_MS) {
        read = await decisionRead(page, session);
        for (const one of read.causes) {
          faults.add(one);
        }
        for (const one of read.waits) {
          waitsSeen.add(one);
        }
        if (done(read)) {
          break;
        }
        await Bun.sleep(500);
      }
      return read;
    };
    const coldDrawn = await watch((read) =>
      read.headings.includes(COLD_HEADING)
    );
    const coldAfter = Date.now() - opened;

    // (4) Opened now: a page whose module, and one whose data, its server holds until leg (3)'s notice stands.
    const heldPages = await Promise.all(
      HELD_PAGES.map((one) => openHeld(kit, fleet, base, port, one))
    );

    // (2) The cold page's own tab, the late page still held on the decision page: drawn in the panel with no notice.
    const tab = await kit.page("desk");
    const started = Date.now();
    await open(tab, `${base}/artifact/${cold.id}`, FRAME);
    let noticed = false;
    let shown = await tabRead(tab);
    const lateWaits = new Set<string>();
    while (Date.now() - started < DRAWN_MS && shown.heading !== COLD_HEADING) {
      shown = await tabRead(tab);
      noticed ||= shown.notice;
      const read = await decisionRead(page, session);
      for (const one of read.causes) {
        faults.add(one);
      }
      for (const one of read.waits) {
        lateWaits.add(one);
      }
      await Bun.sleep(500);
    }
    check(
      "(2) the cold page's own tab draws its page in the panel's frame with no notice that it didn't load",
      shown.heading === COLD_HEADING && !noticed,
      JSON.stringify({ shown, noticed, afterMs: Date.now() - started })
    );
    await tab.close();

    // The late page's server answers now, its document held all this while.
    const heldMs = Date.now() - opened - coldAfter;
    release.resolve();
    const lateDrawn = await watch((read) =>
      read.headings.includes(LATE_HEADING)
    );
    check(
      "(1) a decision page's Preview of a dev server compiling its app for 45 s, and of one whose page is held while the cold page drew in its tab, says Opening… until each draws its page, with no fault at any read",
      coldDrawn.headings.includes(COLD_HEADING) &&
        lateDrawn.headings.includes(COLD_HEADING) &&
        lateDrawn.headings.includes(LATE_HEADING) &&
        opening.every((one) => waitsSeen.has(one)) &&
        lateWaits.has(decisionsWords.previewOpening("Started late")) &&
        heldMs > 30_000 &&
        faults.size === 0,
      JSON.stringify({
        coldDrawnAfterMs: coldAfter,
        lateHeldMs: heldMs,
        headings: lateDrawn.headings,
        waits: [...waitsSeen],
        lateWaits: [...lateWaits],
        faults: [...faults],
      })
    );
    await page.screenshot({ path: join(kit.out, "decision-drawn-desk.png") });
    await page.context().close();

    // (3) A page that stays empty while it polls still says so.
    const emptySession = await fleet.spawn("claude", "Pick empty", fleet.repo);
    const empty = await previewOf(fleet, emptySession, port, EMPTY, "empty");
    await fleet.api((hub) =>
      hub.api.instances({ id: emptySession }).artifacts.post({
        kind: "page",
        does: "pick",
        title: "Probe empty page",
        ask: "Pick one option on each card",
        name: "pick-empty",
        program: `root = Decisions("Pick the page", [which])
which = Decision("which", "Which page ships?", [e, k], "Both are in the app.", [], [], false, null, "behaviour")
e = Option("e", "Empty", "It polls and shows nothing.", true, [a], "Nothing new.")
k = Option("k", "Keep", "As it is.", false, [], "Nothing new.")
a = Preview("${empty.id}", "Empty page")`,
      })
    );
    const blankPage = await kit.page("desk", { oneProcess: true });
    await tabAt(blankPage, emptySession);
    const blankFrom = Date.now();
    await blankPage
      .goto(`${base}/session/${emptySession}`)
      .catch(() => undefined);
    const blank = decisionsWords.previewFailed(decisionsWords.previewBlank(30));
    let blankRead = await decisionRead(blankPage, emptySession);
    while (Date.now() - blankFrom < DRAWN_MS && blankRead.causes.length === 0) {
      await Bun.sleep(500);
      blankRead = await decisionRead(blankPage, emptySession);
    }
    check(
      "(3) a decision page's Preview of a page that polls its server and shows nothing still says it showed nothing within 30 s",
      blankRead.causes.length === 1 && blankRead.causes[0] === blank,
      JSON.stringify({ ...blankRead, afterMs: Date.now() - blankFrom })
    );
    await blankPage.context().close();

    // (4) Its server answers what it held: each page draws, with no fault at any read.
    const heldFor = heldPages.map((one) => Date.now() - one.opened);
    releaseHeld.resolve();
    for (const one of heldPages) {
      const drew = await drawnOnce(one);
      check(
        `(4) a decision page's Preview of a page whose ${one.held} its server held past 30 s after its load draws it once answered, with no fault`,
        drew.read.headings.includes(one.heading) &&
          drew.faults.length === 0 &&
          heldFor.every((ms) => ms > 60_000),
        JSON.stringify({ heldForMs: heldFor, ...drew })
      );
      await one.page.context().close();
    }
    app.stop(true);
  },
};
export default spec;
