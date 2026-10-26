/**
 * Every machine artifact serves its own content on its own origin, whatever
 * else is open, and a decision card's Preview of a folder shows the folder
 * as it is now (hub server.ts `frameAddress`, `tabTarget`; preview.ts
 * `openEmbed`). The owner: "the comments here were replied to but there was
 * nothing changed"; a browser check: opening one preview's tab loaded
 * another session artifact's and flipped the dashboard to it.
 *
 * On a scratch fleet (real hub, agent and sessiond), one session holds two
 * folder previews, alpha and beta (each folder's page says its own word),
 * and a decision page whose card media is a Preview of alpha; the page is
 * made last, so the session's panel shows it. On Chromium, then WebKit, at
 * the desk, read from the frames' documents and the hub's answers:
 *
 * 1. alpha's own tab and beta's own tab, open at once in one browser: each
 *    frame reads its own folder's word, from an origin of its own; alpha's
 *    still reads alpha once beta's tab has drawn; and the session's panel
 *    still shows the page (opening a tab moves no panel).
 * 2. the page's own tab: the card's Preview reads alpha, from alpha's own
 *    origin, the one its tab loads.
 * 3. alpha's folder is written anew: a reload of the page's tab shows the new
 *    word in the card, and a reload of alpha's tab shows it there.
 * 4. after a hub restart, alpha's tab loads alpha again from the same
 *    origin (its port is kept for the artifact), and beta's from its own.
 *
 *   bun scripts/probe-kit/run.ts preview-own-origin
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine's legs after the other, on one fleet
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, until } from "../../scratch-fleet";
import { type Engine, type Kit, open, type Spec } from "../kit";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** A decision card's Preview of a machine artifact (decisions host Preview.svelte). */
const EMBED = 'iframe[data-slot="embed"]';

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A folder whose page says `word`. */
const folderPage = (word: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${word}</title></head><body><h1 id="word">${word}</h1></body></html>`;

const program = (preview: string) => `root = Decisions("Pick a word", [word])
word = Decision("word", "Which word reads right?", [keep, other], "Drawn live.")
keep = Option("keep", "Keep this word", "The folder's own page.", true, [live], "One more look.")
other = Option("other", "Another word", "A new page.", false, [], "Another round.")
live = Preview("${preview}", "The folder, live")`;

/** What `page`'s artifact frame shows now: its origin and the word its page says. */
const tabReads = async (page: Page) => {
  const src = await page
    .locator(FRAME)
    .first()
    .getAttribute("src", { timeout: 1000 })
    .catch(() => null);
  const word = await page
    .frameLocator(FRAME)
    .first()
    .locator("#word")
    .textContent({ timeout: 1000 })
    .catch(() => null);
  return { origin: src ? new URL(src).origin : null, word };
};

/** What the page tab's card Preview shows now: its origin and the word its page says. */
const cardReads = async (page: Page) => {
  const card = page.frameLocator(FRAME).first();
  const src = await card
    .locator(EMBED)
    .first()
    .getAttribute("src", { timeout: 1000 })
    .catch(() => null);
  const word = await card
    .frameLocator(EMBED)
    .first()
    .locator("#word")
    .textContent({ timeout: 1000 })
    .catch(() => null);
  return { origin: src ? new URL(src).origin : null, word };
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
  let base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Own origins", fleet.repo);

  const folders = {
    alpha: join(kit.out, "alpha"),
    beta: join(kit.out, "beta"),
  };
  for (const [word, dir] of Object.entries(folders)) {
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, "index.html"), folderPage(word));
  }
  const at = `/api/instances/${session}/artifacts`;
  const alpha = await fleet.api<{ id: string }>(at, {
    kind: "preview",
    does: "try",
    ask: "Try the alpha folder",
    name: "alpha",
    dir: folders.alpha,
  });
  const beta = await fleet.api<{ id: string }>(at, {
    kind: "preview",
    does: "try",
    ask: "Try the beta folder",
    name: "beta",
    dir: folders.beta,
  });
  const page = await fleet.api<{ id: string }>(at, {
    kind: "page",
    does: "pick",
    ask: "Pick the word",
    name: "word-page",
    program: program(alpha.id),
  });
  const shownOnHub = async (id: string) =>
    (await fleet.api<{ shown: boolean }>(`/api/artifacts/${id}`)).shown;

  /** An artifact's own tab, its frame drawn. */
  const tab = async (on: Page, id: string) => {
    await open(on, `${base}/artifact/${id}`, FRAME);
  };
  /** `read` once it says `word`, else what it says last. */
  const reading = <T extends { word: string | null }>(
    what: string,
    read: () => Promise<T>,
    word: string
  ) =>
    until(what, read, (now) => now.word === word, 30_000).catch(() => read());

  let alphaOrigin: string | null = null;
  let betaOrigin: string | null = null;
  const engines: Engine[] = ["chromium", "webkit"];
  for (const engine of engines) {
    const check = (name: string, ok: boolean, detail: string) =>
      kit.check(`${engine}: ${name}`, ok, detail);
    const alphaTab = await kit.page("desk", { engine });
    await tab(alphaTab, alpha.id);
    const alphaFirst = await reading(
      "alpha's tab",
      () => tabReads(alphaTab),
      "alpha"
    );
    const betaTab = await alphaTab.context().newPage();
    await tab(betaTab, beta.id);
    const betaNow = await reading(
      "beta's tab",
      () => tabReads(betaTab),
      "beta"
    );
    // Beta's tab has drawn: alpha's, open all along, still holds alpha.
    const alphaAfter = await tabReads(alphaTab);
    const panelOnPage = await shownOnHub(page.id);
    check(
      "1: alpha's and beta's own tabs, open at once, each read their own folder's word from an origin of their own; alpha's still reads alpha once beta's drew, and the session's panel still shows the page",
      alphaFirst.word === "alpha" &&
        betaNow.word === "beta" &&
        alphaAfter.word === "alpha" &&
        alphaAfter.origin === alphaFirst.origin &&
        !!alphaFirst.origin &&
        !!betaNow.origin &&
        alphaFirst.origin !== betaNow.origin &&
        panelOnPage,
      JSON.stringify({ alphaFirst, betaNow, alphaAfter, panelOnPage })
    );
    alphaOrigin = alphaFirst.origin;
    betaOrigin = betaNow.origin;

    // 2. The page's tab: its card's Preview of alpha.
    const pageTab = await alphaTab.context().newPage();
    await tab(pageTab, page.id);
    const card = await reading(
      "the card's Preview",
      () => cardReads(pageTab),
      "alpha"
    );
    check(
      "2: the page's card Preview reads alpha, from the origin alpha's own tab loads",
      card.word === "alpha" && card.origin === alphaFirst.origin,
      JSON.stringify({ card, alphaTab: alphaFirst.origin })
    );

    // 3. Alpha's folder written anew: a reload shows it, in the card and in its tab.
    const fresh = `alpha-${engine}`;
    await Bun.write(join(folders.alpha, "index.html"), folderPage(fresh));
    await pageTab.reload({ waitUntil: "domcontentloaded" });
    const cardFresh = await reading(
      "the card's new word",
      () => cardReads(pageTab),
      fresh
    );
    await alphaTab.reload({ waitUntil: "domcontentloaded" });
    const tabFresh = await reading(
      "alpha's tab's new word",
      () => tabReads(alphaTab),
      fresh
    );
    check(
      `3: alpha's folder written anew: after a reload the card reads ${fresh}, and so does alpha's tab`,
      cardFresh.word === fresh && tabFresh.word === fresh,
      JSON.stringify({ cardFresh, tabFresh })
    );
    await Bun.write(join(folders.alpha, "index.html"), folderPage("alpha"));
    await alphaTab.context().close();
  }

  // 4. The hub restarts: each artifact keeps its origin.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  base = await fleet.dashboard();
  const again = await kit.page("desk");
  await tab(again, alpha.id);
  const alphaBack = await reading(
    "alpha's tab after the restart",
    () => tabReads(again),
    "alpha"
  );
  const betaPage = await again.context().newPage();
  await tab(betaPage, beta.id);
  const betaBack = await reading(
    "beta's tab after the restart",
    () => tabReads(betaPage),
    "beta"
  );
  kit.check(
    "4: after a hub restart alpha's tab reads alpha from the origin it had, and beta's beta from its own",
    alphaBack.word === "alpha" &&
      alphaBack.origin === alphaOrigin &&
      betaBack.word === "beta" &&
      betaBack.origin === betaOrigin,
    JSON.stringify({ alphaBack, alphaOrigin, betaBack, betaOrigin })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-own-origin",
  run,
};
export default spec;
