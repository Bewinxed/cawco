/**
 * A preview whose page can't be drawn says why in CawCo's words, never the
 * browser's broken-frame face (owner, 2026-11-06: an option's Preview whose
 * route had been deleted from its live workspace server drew Chromium's
 * grey sad frame, with no words).
 *
 * Two pages of one live server, each a preview artifact of a session:
 *
 * - a route that isn't there any more, which its server answers 404 with
 *   nothing in it: the machine's listener answers its load with CawCo's own
 *   page in its place (core `errorPageResponse`, `PreviewDown` `error`),
 *   its why the status, while a fetch of the page's own keeps its 404;
 * - a page whose script throws before its load and that shows nothing: its
 *   overlay tells its parent it broke as it loaded (agent preview-overlay
 *   embeds.ts `tellDrawn`, `PreviewDown` `crashed`), what it threw its why.
 *
 * Read from the DOM, on a scratch fleet (real hub, agent and sessiond):
 *
 * - (1) the route's own origin answers its load 404 with the proxy's
 *   `error` page naming "404 Not Found", and a fetch of it a bare 404;
 * - (2) each artifact's own tab, at the desk (1440) and on the phone (390),
 *   draws the panel's down notice (PreviewPane `data-slot="down"`, the
 *   notice a gone workspace draws) with its reason's title and line and
 *   Try again; each kept as a picture in the spec's output folder;
 * - (3) a decision page with a Preview of each draws its fault in the
 *   Preview's place (Preview.svelte `embed-fault`), "This preview didn't
 *   load: " and the reason, never a frame.
 *
 *   bun scripts/probe-kit/run.ts preview-broken
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { downOf } from "../../../packages/core/src/preview-proxy";
import { commonWords } from "../../../packages/core/src/words/common";
import { decisionsWords } from "../../../packages/core/src/words/decisions";
import { previewWords } from "../../../packages/core/src/words/preview";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { passedFetch } from "../preview-pass";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** The route the server no longer has, answered 404 with nothing in it. */
const MISSING = "/find-in-conversation";
/** The page whose script throws before its load, and that shows nothing. */
const CRASH = "/crash";
/** What the crashing page throws. */
const THROWN = "TypeError: the probe's store was never made";
const NOT_FOUND = "404 Not Found";
/** How long a notice may take: the frame's load, and its overlay's word. */
const SAID_MS = 60_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The live server: its root a page, one route gone, one page that breaks as it loads. */
const serve = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === CRASH) {
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Crash</title><script>throw new TypeError(${JSON.stringify(THROWN.replace("TypeError: ", ""))})</script></head><body><div id="app"></div></body></html>`,
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      if (pathname === "/") {
        return new Response(
          '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title></head><body><h1>Home</h1></body></html>',
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
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

/** What the artifact's own origin answers `path`'s load, and a fetch of it. */
const originReads = async (fleet: KitFleet, id: string, path: string) => {
  const { port } = await fleet.api<{ port: number }>(
    hubRequest("POST /api/artifacts/:artifact/preview-address", {
      path: { artifact: id },
    })
  );
  const load = await passedFetch(fleet, `http://127.0.0.1:${port}${path}`, {
    headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" },
  });
  const loaded = downOf(await load.text());
  const fetched = await passedFetch(fleet, `http://127.0.0.1:${port}${path}`, {
    headers: { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
  });
  const fetchedBody = await fetched.text();
  return {
    load: { status: load.status, down: loaded?.down, why: loaded?.why },
    fetch: { status: fetched.status, down: downOf(fetchedBody)?.down ?? null },
  };
};

/** What the tab's down notice says: its reason, its words, and whether Try again stands. */
const noticeReads = async (page: Page) => {
  const state = page.locator('[data-slot="down"]').first();
  const shown = await state.isVisible().catch(() => false);
  return {
    shown,
    down: shown ? await state.getAttribute("data-down") : null,
    text: shown
      ? (await state.innerText().catch(() => "")).replace(/\s+/gu, " ")
      : "",
    tryAgain: shown
      ? await state
          .getByRole("button", { name: commonWords.tryAgain })
          .count()
          .catch(() => 0)
      : 0,
  };
};

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

/** Every Preview fault the decision page in session `id`'s pane says, and how many frames it shows. */
const decisionReads = async (page: Page, id: string) => {
  const handle = await page
    .locator(`[data-slot="pane"][data-pane="${id}"] ${FRAME}`)
    .first()
    .elementHandle()
    .catch(() => null);
  const frame = await handle?.contentFrame();
  const nothing = { causes: [] as string[], frames: -1 };
  if (!frame) {
    return nothing;
  }
  return frame
    .evaluate(() => ({
      causes: [...document.querySelectorAll('[data-slot="embed-cause"]')].map(
        (one) => one.textContent?.replace(/\s+/gu, " ").trim() ?? ""
      ),
      frames: document.querySelectorAll('iframe[data-slot="embed"]').length,
    }))
    .catch(() => nothing);
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-broken",
  run: async (kit: Kit) => {
    const { check } = kit;
    const app = serve();
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
    const missingSession = await fleet.spawn(
      "claude",
      "Missing route",
      fleet.repo
    );
    const crashSession = await fleet.spawn("claude", "Crash", fleet.repo);
    const missing = await previewOf(
      fleet,
      missingSession,
      port,
      MISSING,
      "missing-route"
    );
    const crash = await previewOf(fleet, crashSession, port, CRASH, "crash");

    // (1) The route's load is CawCo's own page; a fetch keeps its 404.
    const origin = await originReads(fleet, missing.id, MISSING);
    check(
      "(1) a route its server answers 404 with nothing in it: its load is the proxy's error page naming 404, a fetch of it a bare 404",
      origin.load.status === 404 &&
        origin.load.down === "error" &&
        origin.load.why === NOT_FOUND &&
        origin.fetch.status === 404 &&
        origin.fetch.down === null,
      JSON.stringify(origin)
    );

    // (2) Each artifact's own tab draws the down notice, with its reason.
    const legs = [
      {
        id: missing.id,
        name: "missing",
        down: "error",
        title: previewWords.errorTitle,
        line: previewWords.errorLine(NOT_FOUND),
      },
      {
        id: crash.id,
        name: "crash",
        down: "crashed",
        title: previewWords.crashedTitle,
        line: previewWords.crashedLine(THROWN),
      },
    ];
    for (const leg of legs) {
      for (const view of ["desk", "phone"] as const) {
        const tab = await kit.page(view);
        await open(tab, `${base}/artifact/${leg.id}`, FRAME);
        const notice = await until(
          `the ${view} tab's ${leg.name} notice`,
          () => noticeReads(tab),
          (now) => now.shown && now.down === leg.down,
          SAID_MS
        ).catch(() => noticeReads(tab));
        await tab
          .waitForFunction(
            () => window.kitRuns().every((run) => run.playState !== "running"),
            null,
            { timeout: 10_000 }
          )
          .catch(() => undefined);
        await tab.screenshot({
          path: join(kit.out, `${leg.name}-${view}.png`),
        });
        check(
          `(2) ${leg.name}: at the ${view === "desk" ? "desk (1440)" : "phone (390)"}, its own tab draws the down notice: "${leg.title}", its line and Try again`,
          notice.shown &&
            notice.down === leg.down &&
            notice.text.includes(leg.title) &&
            notice.text.includes(leg.line) &&
            notice.tryAgain === 1,
          JSON.stringify(notice)
        );
        await tab.close();
      }
    }

    // (3) A decision page's Preview of each draws its fault in its place.
    const decided = await fleet.spawn("claude", "Pick a page", fleet.repo);
    // A page's Previews are of its own session's artifacts.
    const goneHere = await previewOf(
      fleet,
      decided,
      port,
      MISSING,
      "missing-route"
    );
    const crashHere = await previewOf(fleet, decided, port, CRASH, "crash");
    await fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: decided },
        body: {
          kind: "page",
          does: "pick",
          title: "Probe pick artifact",
          ask: "Pick one option on each card",
          name: "pick-page",
          program: `root = Decisions("Pick the page", [which])
which = Decision("which", "Which page stays?", [found, broke], "Both are in the app today.", [], [], false, null, "behaviour")
found = Option("found", "Find in a conversation", "The route as it was.", true, [gone], "Nothing new.")
broke = Option("broke", "The crashing page", "As it runs.", false, [crashed], "A fix first.")
gone = Preview("${goneHere.id}", "Find in a conversation")
crashed = Preview("${crashHere.id}", "The crashing page")`,
        },
      })
    );
    const page = await kit.page("desk", { oneProcess: true });
    await tabAt(page, decided);
    await page.goto(`${base}/session/${decided}`).catch(() => undefined);
    const wanted = [
      decisionsWords.previewFailed(decisionsWords.previewErrored(NOT_FOUND)),
      decisionsWords.previewFailed(decisionsWords.previewCrashed(THROWN)),
    ];
    const said = await until(
      "the decision page's two Preview faults",
      () => decisionReads(page, decided),
      (now) => now.causes.length === 2,
      SAID_MS
    ).catch(() => decisionReads(page, decided));
    await page.screenshot({ path: join(kit.out, "decision-desk.png") });
    check(
      "(3) a decision page's Preview of each draws its fault in its place, why in CawCo's words, and no frame",
      said.causes.length === 2 &&
        wanted.every((one) => said.causes.includes(one)) &&
        said.frames === 0,
      JSON.stringify({ said, wanted })
    );
    await page.context().close();
    app.stop(true);
  },
};
export default spec;
