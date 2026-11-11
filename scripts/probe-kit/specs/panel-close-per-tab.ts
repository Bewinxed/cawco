/**
 * A session's panel closed in one browser tab stays open in every other tab
 * showing that session (the owner's pick, 2026-11-10, answering a question
 * about two tabs: "Only that tab (Recommended)", whose option read: "Close
 * hides the panel only in the tab where you pressed it. Other tabs and
 * devices keep showing it, and whatever the agent shows next opens again
 * everywhere"). Close once deleted the hub's one show of the session
 * (`DELETE /api/instances/:id/preview`), so every page following it dropped
 * its panel: a twin `/session/<id>` tab went from 1 panel frame to 0 within
 * 1 s of Close in the other. Close is now the tab's own (dashboard
 * preview/closed-here.ts): the tab keeps the closed show's revision in its
 * sessionStorage, and the hub's show stands.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), at the desk, for a folder preview and for a decision page:
 * the session's page is open in two tabs of one browser, A and B, its panel
 * showing the artifact in both. B's panel frame document is marked (a value
 * on its window, which a load of the frame drops), then:
 *
 * 1. A presses the panel's Close: A's panel goes, and B's panel frame is the
 *    same document, read every 250 ms for 3 s;
 * 2. A loads again: its panel stays closed;
 * 3. the session shows the artifact again (the agent's artifact_show): the
 *    panel opens in both tabs.
 *
 * Then, for a page of plain HTML, the owner's word that an edit is no show
 * (2026-11-11: "An agent editing a page it already showed (artifact_update)
 * is not showing something next"): Close in A, then
 *
 * 4. two artifact_updates of its HTML: after each, A stays closed for 3 s
 *    and B's panel draws the new HTML;
 * 5. the preview mode set again (every shown preview published anew,
 *    server.ts `republish`): A stays closed for 3 s, and B keeps its panel;
 * 6. the agent's artifact_show of it: the panel opens in A again.
 *
 *   bun scripts/probe-kit/run.ts panel-close-per-tab
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FrameLocator, Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

/** The artifact panel's frame (PreviewPane). */
const FRAME = 'iframe[title="Preview"]';
/** The side surface's card, the panel itself (SideSurface). */
const CARD = '[data-slot="side-card"]';
/** What the session's page draws with or without a panel (the files control). */
const PAGE_READY = "[data-files-control]";
/** How long B is watched after A's Close, and A after its reload. Our call: the old Close took B's frame within 1 s. */
const WATCH_MS = 3000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const htmlPage = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

const folderPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Folder</title></head><body><h1 id="word">Folder</h1></body></html>`;

const program = `root = Decisions("Pick a word", [word])
word = Decision("word", "Which word reads right?", [keep, other], "Read both.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep this word", "The word as it stands.", true, [], "One more look.")
other = Option("other", "Another word", "A new word.", false, [], "Another round.")`;

const frameOf = (page: Page): FrameLocator => page.frameLocator(FRAME).first();

/** Marks the frame's document: a load of the frame drops it. */
const mark = (page: Page) =>
  frameOf(page)
    .locator("body")
    .evaluate(() => {
      (window as unknown as { __kept: boolean }).__kept = true;
    });

/** Whether the frame is the document {@link mark} marked; null while there is no frame to read. */
const kept = (page: Page): Promise<boolean | null> =>
  frameOf(page)
    .locator("body")
    .evaluate(
      () => (window as unknown as { __kept?: boolean }).__kept === true,
      null,
      { timeout: 1000 }
    )
    .catch(() => null);

/** Reads `read` every 250 ms for {@link WATCH_MS}. */
const watch = async <T>(read: () => Promise<T>): Promise<T[]> => {
  const reads: T[] = [];
  const end = performance.now() + WATCH_MS;
  while (performance.now() < end) {
    reads.push(await read());
    await Bun.sleep(250);
  }
  return reads;
};

/** Whether `page` comes to show its panel within 15 s. */
const panelComes = (page: Page, what: string) =>
  until(
    what,
    () => page.locator(FRAME).count(),
    (count) => count > 0,
    15_000
  )
    .then(() => true)
    .catch(() => false);

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
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Two tabs", fleet.repo);
  const dir = join(kit.out, "folder");
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "index.html"), folderPage);

  const make = (body: Record<string, unknown>) =>
    fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: session },
        body: body as never,
      })
    );
  const kinds = [
    {
      kind: "preview",
      make: () =>
        make({
          kind: "preview",
          does: "try",
          title: "Probe try artifact",
          ask: "Try the folder",
          name: "two-tab-folder",
          dir,
        }),
    },
    {
      kind: "page",
      make: () =>
        make({
          kind: "page",
          does: "pick",
          title: "Probe pick artifact",
          ask: "Pick the word",
          name: "two-tab-page",
          program,
        }),
    },
  ] as const;

  const a = await kit.page("desk");
  for (const { kind, make: made } of kinds) {
    // Made last, so the session's panel shows it.
    const artifact = await made();
    const url = `${base}/session/${session}`;
    await open(a, url, FRAME);
    // A second tab of the same browser: its own sessionStorage.
    const b = await a.context().newPage();
    await open(b, url, FRAME);
    await until(
      "B's panel frame drawn",
      () => kept(b),
      (one) => one !== null,
      30_000
    );
    await mark(b);

    // 1. A's Close.
    await a.bringToFront();
    await a
      .locator(CARD)
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    const aClosed = await until(
      "A's panel gone",
      () => a.locator(CARD).count(),
      (count) => count === 0,
      10_000
    )
      .then(() => true)
      .catch(() => false);
    const bReads = await watch(() => kept(b));
    const bKept = bReads.every((one) => one === true);
    kit.check(
      `${kind}: 1: Close in tab A takes A's panel away, and tab B keeps its panel frame, the same document, read every 250 ms for ${WATCH_MS} ms`,
      aClosed && bKept,
      JSON.stringify({ aClosed, b: bReads.map(String).join(",") })
    );

    // 2. A loads again: closed still.
    await open(a, url, PAGE_READY);
    const aReads = await watch(() => a.locator(CARD).count());
    kit.check(
      `${kind}: 2: tab A loaded again keeps its panel closed for ${WATCH_MS} ms`,
      aReads.every((count) => count === 0),
      JSON.stringify({ a: aReads.join(",") })
    );

    // 3. The agent shows it again: both tabs open it.
    await fleet.api(
      hubRequest("POST /api/instances/:id/artifacts/:artifact/show", {
        path: { id: session, artifact: artifact.id },
        body: {},
      })
    );
    const [aBack, bOpen] = await Promise.all([
      panelComes(a, "A's panel back"),
      panelComes(b, "B's panel open"),
    ]);
    kit.check(
      `${kind}: 3: a new show from the agent opens the panel in both tabs`,
      aBack && bOpen,
      JSON.stringify({ aBack, bOpen })
    );
    await b.close();
  }

  // 4–6. An edit, and a republish, are no show.
  const edited = await make({
    kind: "page",
    does: "judge",
    title: "Probe judge artifact",
    ask: "Judge the heading",
    name: "two-tab-edits",
    html: htmlPage("First"),
  });
  const url = `${base}/session/${session}`;
  await open(a, url, FRAME);
  const b = await a.context().newPage();
  await open(b, url, FRAME);
  /** The heading B's panel draws, or null. */
  const bHeading = () =>
    frameOf(b)
      .locator("h1")
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null);
  await until("B's page drawn", bHeading, (text) => text === "First", 30_000);
  await a.bringToFront();
  await a
    .locator(CARD)
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await until(
    "A's panel gone",
    () => a.locator(CARD).count(),
    (count) => count === 0,
    10_000
  );
  for (const heading of ["Second", "Third"]) {
    await fleet.api(
      hubRequest("PATCH /api/instances/:id/artifacts/:artifact", {
        path: { id: session, artifact: edited.id },
        body: { html: htmlPage(heading) },
      })
    );
    const bDraws = await until(
      `B's panel drawing ${heading}`,
      bHeading,
      (text) => text === heading,
      15_000
    )
      .then(() => true)
      .catch(() => false);
    const aReads = await watch(() => a.locator(CARD).count());
    kit.check(
      `edits: 4: after artifact_update to ${heading}, tab A stays closed for ${WATCH_MS} ms and tab B's panel draws ${heading}`,
      bDraws && aReads.every((count) => count === 0),
      JSON.stringify({ bDraws, a: aReads.join(",") })
    );
  }
  const settings = await fleet.api<{ mode: "port" | "host"; pattern?: string }>(
    hubRequest("GET /api/preview-settings")
  );
  await fleet.api(
    hubRequest("PUT /api/preview-settings", {
      body: {
        mode: settings.mode,
        ...(settings.pattern ? { pattern: settings.pattern } : {}),
      },
    })
  );
  const aRepublished = await watch(() => a.locator(CARD).count());
  const bStays = await panelComes(b, "B's panel after the republish");
  kit.check(
    `edits: 5: the preview mode set again republishes the show: tab A stays closed for ${WATCH_MS} ms, and tab B keeps its panel`,
    bStays && aRepublished.every((count) => count === 0),
    JSON.stringify({ bStays, a: aRepublished.join(",") })
  );
  await fleet.api(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/show", {
      path: { id: session, artifact: edited.id },
      body: {},
    })
  );
  const aShown = await panelComes(a, "A's panel back on the show");
  kit.check(
    "edits: 6: the agent's artifact_show of the edited page opens the panel in tab A again",
    aShown,
    JSON.stringify({ aShown })
  );
  await b.close();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "panel-close-per-tab",
  run,
};
export default spec;
