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
 * nothing stored), then reloaded as soon as its frame mounts; read in the
 * page, from its navigation's start to the artifact's frame entering the
 * document:
 *
 * 1. the folder preview's first visit mounts the frame within
 *    FIRST_BUDGET_MS and its reload within RELOAD_BUDGET_MS, and the frame
 *    reads the folder's own page;
 * 2. the decision page's likewise, and the frame draws the page; on the
 *    run's first decision page, the hub answers a read polled all along
 *    within HUB_STALL_MS each.
 *
 * A hub run from source (this fleet's) builds the decision host on the
 * first request for it (core decision-host.ts `bundle`). On the hub's own
 * thread, Svelte's compiler, Tailwind and the house faces' subsetting held
 * its event loop in blocks of up to 900 ms (sampled with bun:jsc), and a
 * reload landing then took 1.2 s; the build now runs on a thread of its
 * own. The released binary serves the host prebuilt (`standalone`).
 *
 * Then the hub's show of a decision page (`POST …/artifacts/<id>/show`, the
 * panel's Show and artifact_show), made with the session's panel on another
 * artifact:
 *
 * 3. with no view open it answers that none is showing the session, within
 *    SHOWN_WAIT_MS and OPEN_BUDGET_MS more: the show's own work (the open,
 *    the publish) costs at most that; with the session's page open in a
 *    browser it answers opened within VIEWED_BUDGET_MS; the hub's journal
 *    names the bare show's shown wait, its artifact and its time (a step
 *    over SLOW_SHOW_STEP_MS), and nothing of the viewed one.
 *
 *   bun scripts/probe-kit/run.ts artifact-tab-cold
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine's legs after the other, on one fleet
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  SHOWN_WAIT_MS,
  SLOW_SHOW_STEP_MS,
} from "../../../packages/hub/src/artifacts/service";
import { type Reply, until } from "../../scratch-fleet";
import { type Engine, type Kit, open, type Spec } from "../kit";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';

/**
 * Navigation start to the frame in the document on a first visit. Our call,
 * from the brief's invariant: well under 2 s on the host; the first visit
 * measured 18,992 ms live, 216-833 ms on this fleet once fixed.
 */
const FIRST_BUDGET_MS = 2000;

/** The same on a reload. Our call: reloads read 121-471 ms on this fleet. */
const RELOAD_BUDGET_MS = 750;

/** A show's own work past its wait for a view. Our call, from the brief: the open and publish read 1-83 ms. */
const OPEN_BUDGET_MS = 300;

/** A show answered by an open view of its session. Our call: it read 95-209 ms. */
const VIEWED_BUDGET_MS = 1000;

/**
 * The longest a read of the hub may wait while the first decision page
 * loads. Our call, from the brief's "about 100 ms": a read on an idle hub
 * answers in under 10 ms; the build on the hub's thread held reads 123-900 ms.
 */
const HUB_STALL_MS = 100;

/** What the decision page's frame draws once its host has loaded. */
const QUESTION = "Which word reads right?";

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

  /**
   * One artifact's tab in a fresh context: its first visit, a reload as soon
   * as its frame mounts, and whether `drawn` then says the frame's page has
   * drawn. The hub's slowest answer to a read polled all along beside it.
   */
  const visit = async (
    engine: Engine,
    id: string,
    drawn: (tab: Page) => Promise<boolean>
  ) => {
    const tab = await kit.page("desk", { engine, init: [recordFrame] });
    const watching = new AbortController();
    let slowest = 0;
    const poll = (async () => {
      while (!watching.signal.aborted) {
        const started = performance.now();
        await fleet.api(`/api/artifacts/${id}`);
        slowest = Math.max(slowest, performance.now() - started);
        await Bun.sleep(10);
      }
    })();
    await tab.goto(`${base}/artifact/${id}`, { waitUntil: "commit" });
    const first = await frameAt(tab);
    await tab.reload({ waitUntil: "commit" });
    const reload = await frameAt(tab);
    const page = await until(
      "the frame's page drawn",
      () => drawn(tab),
      (now) => now,
      30_000
    ).catch(() => false);
    watching.abort();
    await poll;
    return { tab, first, page, reload, slowest: Math.round(slowest) };
  };
  const timely = (first: number | null, reload: number | null) =>
    first !== null &&
    first < FIRST_BUDGET_MS &&
    reload !== null &&
    reload < RELOAD_BUDGET_MS;
  const folderDrawn = async (tab: Page) => (await wordIn(tab)) === "cold";
  const pageDrawn = (tab: Page) =>
    tab
      .frameLocator(FRAME)
      .first()
      .getByText(QUESTION)
      .first()
      .isVisible()
      .catch(() => false);

  const engines: Engine[] = ["chromium", "webkit"];
  let firstPage = true;
  for (const engine of engines) {
    const { folder, page } = await made(engine);
    const cold = await visit(engine, folder.id, folderDrawn);
    kit.check(
      `${engine}: 1: the folder preview's tab mounts its frame within ${FIRST_BUDGET_MS} ms of navigation on a first visit (${cold.first} ms) and within ${RELOAD_BUDGET_MS} ms on reload (${cold.reload} ms), and reads the folder's page`,
      timely(cold.first, cold.reload) && cold.page,
      JSON.stringify(cold, ["first", "reload", "page"])
    );
    await cold.tab.context().close();

    const decision = await visit(engine, page.id, pageDrawn);
    kit.check(
      `${engine}: 2: the decision page's tab mounts its frame within ${FIRST_BUDGET_MS} ms of navigation on a first visit (${decision.first} ms) and within ${RELOAD_BUDGET_MS} ms on reload (${decision.reload} ms), and draws the page`,
      timely(decision.first, decision.reload) && decision.page,
      JSON.stringify(decision, ["first", "reload", "page"])
    );
    if (firstPage) {
      firstPage = false;
      kit.check(
        `${engine}: 2: while the run's first decision page loads (the hub building its host), the hub answers every read within ${HUB_STALL_MS} ms (slowest ${decision.slowest} ms)`,
        decision.slowest < HUB_STALL_MS,
        JSON.stringify({ slowest: decision.slowest })
      );
    }
    await decision.tab.context().close();
  }

  // 3. The hub's show of a decision page, with the panel on another artifact.
  const showPage = async (name: string) => {
    const shownPage = await fleet.api<{ id: string }>(at, {
      kind: "page",
      does: "pick",
      ask: "Pick the word",
      name,
      program: PROGRAM,
    });
    await fleet.api<{ id: string }>(at, {
      kind: "preview",
      does: "try",
      ask: "Try the front folder",
      name: `${name}-front`,
      dir: join(kit.out, "chromium", "front"),
    });
    const started = performance.now();
    const answer = await fleet.api<{ opened: boolean }>(
      `${at}/${shownPage.id}/show`,
      {}
    );
    return {
      id: shownPage.id,
      ms: Math.round(performance.now() - started),
      answer,
    };
  };
  const bare = await showPage("show-bare");
  const viewer = await kit.page("desk");
  await open(viewer, `${base}/session/${session}`, FRAME);
  const viewed = await showPage("show-viewed");
  kit.check(
    `3: a show of a decision page answers within ${SHOWN_WAIT_MS} + ${OPEN_BUDGET_MS} ms with no view open (${bare.ms} ms, not opened), and opened within ${VIEWED_BUDGET_MS} ms with the session's page open (${viewed.ms} ms)`,
    !bare.answer.opened &&
      bare.ms < SHOWN_WAIT_MS + OPEN_BUDGET_MS &&
      viewed.answer.opened &&
      viewed.ms < VIEWED_BUDGET_MS,
    JSON.stringify({ bare, viewed })
  );
  // The bare show's wait outlasted SLOW_SHOW_STEP_MS: the journal names it.
  const steps = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("its show's"));
  const journal = steps.filter(
    (line) =>
      line.includes(`${bare.id} (page`) && line.includes("shown wait took")
  );
  kit.check(
    `3: the hub's journal names the bare show's slow step: its shown wait, the artifact and the time (over ${SLOW_SHOW_STEP_MS} ms), and no step of the viewed show`,
    journal.length > 0 &&
      !steps.some((line) => line.includes(`${viewed.id} (page`)),
    JSON.stringify(journal)
  );
};

const spec: Spec = { name: "artifact-tab-cold", run };
export default spec;
