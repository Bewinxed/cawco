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
 * from that load while the modules were still arriving. One live server
 * here plays both starts, each a preview artifact of a session:
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
 *   nothing (`/empty`) still says it showed nothing within 30 s: its own
 *   data calls are no page arriving.
 *
 *   bun scripts/probe-kit/run.ts preview-cold-start
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
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

/** The live server: a cold page whose modules compile slowly, and a page whose document comes late. */
const serve = (lateHeld: Promise<void>) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === COLD) {
        // SvelteKit's dev document: its app by a dynamic import, which the
        // frame's load does not wait for; an empty root until it mounts.
        return html(
          "Cold",
          `<div id="app"></div><script type="module">import("/mod/0.js")</script>`
        );
      }
      const at = MODULE.exec(pathname);
      if (at) {
        const index = Number(at[1]);
        await Bun.sleep(STEP_MS);
        return js(
          index + 1 < MODULES
            ? `import "/mod/${index + 1}.js";`
            : `document.getElementById("app").innerHTML = "<h1>${COLD_HEADING}</h1>";`
        );
      }
      if (pathname === EMPTY) {
        return html(
          "Empty",
          `<div id="app"></div><script type="module">setInterval(() => fetch("/poll"), 1000)</script>`
        );
      }
      if (pathname === "/poll") {
        return new Response("[]", {
          headers: { "content-type": "application/json" },
        });
      }
      if (pathname === LATE) {
        await lateHeld;
        return html("Late", `<h1>${LATE_HEADING}</h1>`);
      }
      return new Response(null, { status: 404 });
    },
  });

/** A preview artifact of session `session` on `port`, at `path`. */
const previewOf = (
  fleet: KitFleet,
  session: string,
  port: number,
  path: string,
  name: string
) =>
  fleet.api<{ id: string }>(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: session },
      body: {
        kind: "preview",
        does: "try",
        title: `Probe ${name}`,
        ask: "Try this page and say whether it works",
        name,
        port,
        path,
        machine: MACHINE,
      },
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
    if (one.url().includes(COLD) || one.url().includes(LATE)) {
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

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-cold-start",
  run: async (kit: Kit) => {
    const { check } = kit;
    const release = Promise.withResolvers<void>();
    const app = serve(release.promise);
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
    await fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: session },
        body: {
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
        },
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
    await fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: emptySession },
        body: {
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
        },
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
    app.stop(true);
  },
};
export default spec;
