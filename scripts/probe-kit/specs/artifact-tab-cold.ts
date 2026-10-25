/**
 * An artifact's own tab mounts its frame on a first visit as fast as on a
 * reload (routes/artifact/[id]/+page.svelte; hub server.ts `tabTarget`).
 * Found live: the comment-card-sizing page's `/artifact/<id>` took 18,992 ms
 * to mount its frame on a fresh browser's first visit and 559 ms on reload.
 * The tab awaited `POST …/artifacts/<id>/show` before it followed its
 * session, and the hub's show waits up to SHOWN_WAIT_MS (10 s) for a view to
 * say it has the artifact on screen: the only view was that tab, which drew
 * nothing until the show answered. A reload skipped the show, the panel then
 * showing it.
 *
 * On a scratch fleet (real hub, agent and sessiond), for each of Chromium
 * and WebKit one session makes a folder preview and a decision page, then a
 * third artifact last, so its panel shows neither of the two. At the desk,
 * each of the two is opened in a browser context of its own (nothing cached,
 * nothing stored), then reloaded; read in the page, from its navigation's
 * start to the artifact's frame entering the document:
 *
 * 1. the folder preview's first visit and its reload each mount the frame
 *    within BUDGET_MS, and the frame reads the folder's own page;
 * 2. the decision page's first visit and its reload each mount the frame
 *    within BUDGET_MS.
 *
 *   bun scripts/probe-kit/run.ts artifact-tab-cold
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine's legs after the other, on one fleet
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, until } from "../../scratch-fleet";
import type { Engine, Kit, Spec } from "../kit";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';

/**
 * Navigation start to the frame in the document, first visit and reload
 * alike. Our call, from the brief's invariant: well under 2 s on the host; a
 * reload measured 559 ms live, the first visit 18,992 ms.
 */
const BUDGET_MS = 2000;

/** How long a leg waits for the frame at all before it reads none. */
const GIVE_UP_MS = 40_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const folderPage = (word: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${word}</title></head><body><h1 id="word">${word}</h1></body></html>`;

const PROGRAM = `root = Decisions("Pick a word", [word])
word = Decision("word", "Which word reads right?", [keep, other], "Read both.")
keep = Option("keep", "Keep this word", "The word as it stands.", true, [], "One more look.")
other = Option("other", "Another word", "A new word.", false, [], "Another round.")`;

/**
 * Installed before the page's own scripts in the top document: the moment,
 * on the navigation's clock, the artifact's frame enters the document.
 */
const recordFrame = () => {
  if (self !== top) {
    return;
  }
  const record = window as unknown as { __frameAt: number | null };
  record.__frameAt = null;
  const observer = new MutationObserver(() => {
    if (document.querySelector('iframe[title="Preview"]')) {
      record.__frameAt = performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true, subtree: true });
};

/** Navigation start to the frame's mount on `page`'s current document, in ms; null when it never mounted. */
const frameAt = async (page: Page): Promise<number | null> => {
  const mounted = await page
    .waitForFunction(
      () =>
        (window as unknown as { __frameAt: number | null }).__frameAt !== null,
      null,
      { timeout: GIVE_UP_MS }
    )
    .then(() => true)
    .catch(() => false);
  if (!mounted) {
    return null;
  }
  const at = await page.evaluate(
    () => (window as unknown as { __frameAt: number }).__frameAt
  );
  return Math.round(at);
};

/** The word the tab's frame's page says; null while it says none. */
const wordIn = (page: Page): Promise<string | null> =>
  page
    .frameLocator(FRAME)
    .first()
    .locator("#word")
    .textContent({ timeout: 1000 })
    .catch(() => null);

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
  const session = await fleet.spawn("claude", "Cold tabs", fleet.repo);

  const at = `/api/instances/${session}/artifacts`;
  const shown = async (id: string) =>
    (await fleet.api<{ shown: boolean }>(`/api/artifacts/${id}`)).shown;

  /**
   * An engine's own folder preview and decision page, then a third artifact
   * made last, so the session's panel shows neither of the two: no first
   * visit before it moved anything.
   */
  const made = async (engine: Engine) => {
    const dirs = {
      cold: join(kit.out, engine, "cold"),
      front: join(kit.out, engine, "front"),
    };
    for (const [word, dir] of Object.entries(dirs)) {
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "index.html"), folderPage(word));
    }
    const folder = await fleet.api<{ id: string }>(at, {
      kind: "preview",
      does: "try",
      ask: "Try the cold folder",
      name: `cold-folder-${engine}`,
      dir: dirs.cold,
    });
    const page = await fleet.api<{ id: string }>(at, {
      kind: "page",
      does: "pick",
      ask: "Pick the word",
      name: `cold-page-${engine}`,
      program: PROGRAM,
    });
    await fleet.api<{ id: string }>(at, {
      kind: "preview",
      does: "try",
      ask: "Try the front folder",
      name: `front-folder-${engine}`,
      dir: dirs.front,
    });
    const unshown = !((await shown(folder.id)) || (await shown(page.id)));
    kit.check(
      `${engine}: the session's panel shows neither artifact under test before their tabs open`,
      unshown,
      JSON.stringify({ unshown })
    );
    return { folder, page };
  };

  /** One artifact's tab in a fresh context: its first visit, then a reload. */
  const visit = async (engine: Engine, id: string) => {
    const tab = await kit.page("desk", { engine, init: [recordFrame] });
    await tab.goto(`${base}/artifact/${id}`, { waitUntil: "commit" });
    const first = await frameAt(tab);
    await tab.reload({ waitUntil: "commit" });
    const reload = await frameAt(tab);
    return { tab, first, reload };
  };
  const within = (ms: number | null) => ms !== null && ms < BUDGET_MS;

  const engines: Engine[] = ["chromium", "webkit"];
  for (const engine of engines) {
    const { folder, page } = await made(engine);
    const cold = await visit(engine, folder.id);
    const word = await until(
      "the folder's word in its tab",
      () => wordIn(cold.tab),
      (now) => now === "cold",
      10_000
    ).catch(() => null);
    kit.check(
      `${engine}: 1: the folder preview's tab mounts its frame within ${BUDGET_MS} ms of navigation on a first visit (${cold.first} ms) and on reload (${cold.reload} ms), and reads the folder's page`,
      within(cold.first) && within(cold.reload) && word === "cold",
      JSON.stringify({ first: cold.first, reload: cold.reload, word })
    );
    await cold.tab.context().close();

    const decision = await visit(engine, page.id);
    kit.check(
      `${engine}: 2: the decision page's tab mounts its frame within ${BUDGET_MS} ms of navigation on a first visit (${decision.first} ms) and on reload (${decision.reload} ms)`,
      within(decision.first) && within(decision.reload),
      JSON.stringify({ first: decision.first, reload: decision.reload })
    );
    await decision.tab.context().close();
  }
};

const spec: Spec = { name: "artifact-tab-cold", run };
export default spec;
