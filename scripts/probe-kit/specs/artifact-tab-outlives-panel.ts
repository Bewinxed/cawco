/**
 * An artifact's own tab keeps working whatever its session's panel does in
 * the page it was opened from (the owner, 2026-11-10: "if i open a session
 * in an external tab, then close the sheet in the original page, the
 * external page stops working"). The tab once took the panel's show as its
 * own while the panel showed its artifact (hub server.ts `tabTarget`), so
 * the panel's Close, and any show of it there again, moved the tab's
 * revision: its frame (PreviewPane `frameKey`) loaded again, and whatever
 * the person had done in it was gone.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), at the desk, for a folder preview and for a decision page:
 * the session's page shows the artifact in its panel, and "Open in new
 * tab"'s address (`/artifact/<id>`) opens in a second tab of the same
 * browser. The tab's frame's document is marked (a value on its window,
 * which a load of the frame drops), then:
 *
 * 1. the session's page presses the panel's Close: the panel goes there,
 *    and for 3 s after, the tab's frame is the same document, its page
 *    still drawn;
 * 2. the session shows the artifact in its panel again (the agent's
 *    artifact_show): the panel opens there, and the tab's frame is still
 *    the same document;
 * 3. the decision page's HTML is written anew (artifact_create again): its
 *    tab's frame morphs to it in place, as the panel's does, the same
 *    document drawing the new question.
 *
 *   bun scripts/probe-kit/run.ts artifact-tab-outlives-panel
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FrameLocator, Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

/** The artifact panel's frame (PreviewPane), in the panel and in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** How long the tab is watched after each act. Our call: the close's frame reload landed within 1 s. */
const WATCH_MS = 3000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const folderPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Folder</title></head><body><h1 id="word">Folder</h1></body></html>`;

const program = (question: string) => `root = Decisions("Pick a word", [word])
word = Decision("word", "${question}", [keep, other], "Read both.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep this word", "The word as it stands.", true, [], "One more look.")
other = Option("other", "Another word", "A new word.", false, [], "Another round.")`;

/** The decision page's question, as made and as written anew. */
const FIRST = "Which word reads right?";
const SECOND = "Which word reads better?";

const frameOf = (page: Page): FrameLocator => page.frameLocator(FRAME).first();

/** Whether the tab's frame draws the decision page asking `question`. */
const asks = (page: Page, question: string): Promise<boolean> =>
  frameOf(page)
    .getByText(question)
    .first()
    .isVisible()
    .catch(() => false);

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

/** The tab's frame, read every 250 ms for {@link WATCH_MS}: whether it stayed the marked document throughout, its page drawn. */
const stayed = async (tab: Page, drawn: () => Promise<boolean>) => {
  const reads: (boolean | null)[] = [];
  const end = performance.now() + WATCH_MS;
  while (performance.now() < end) {
    reads.push(await kept(tab));
    await Bun.sleep(250);
  }
  const ok = reads.every((one) => one === true) && (await drawn());
  return { ok, reads: reads.map((one) => String(one)).join(",") };
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
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Own tabs", fleet.repo);
  const dir = join(kit.out, "folder");
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "index.html"), folderPage);

  const page = (question: string) =>
    fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: session },
        body: {
          kind: "page",
          does: "pick",
          title: "Probe pick artifact",
          ask: "Pick the word",
          name: "own-tab-page",
          program: program(question),
        },
      })
    );
  const kinds = [
    {
      kind: "preview",
      make: () =>
        fleet.api<{ id: string }>(
          hubRequest("POST /api/instances/:id/artifacts", {
            path: { id: session },
            body: {
              kind: "preview",
              does: "try",
              title: "Probe try artifact",
              ask: "Try the folder",
              name: "own-tab-folder",
              dir,
            },
          })
        ),
      drawn: (tab: Page) =>
        frameOf(tab)
          .locator("#word")
          .textContent({ timeout: 1000 })
          .then((word) => word === "Folder")
          .catch(() => false),
    },
    {
      kind: "page",
      make: () => page(FIRST),
      drawn: (tab: Page) => asks(tab, FIRST),
    },
  ] as const;

  const origin = await kit.page("desk");
  for (const { kind, make, drawn } of kinds) {
    // Made last, so the session's panel shows it.
    const artifact = await make();
    await open(origin, `${base}/session/${session}`, FRAME);
    // "Open in new tab"'s address, in a tab of the same browser.
    const tab = await origin.context().newPage();
    await open(tab, `${base}/artifact/${artifact.id}`, FRAME);
    await until("the tab's page drawn", () => drawn(tab), Boolean, 30_000);
    await mark(tab);

    // 1. The panel's Close, in the page the tab was opened from.
    await origin.bringToFront();
    await origin
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    const panelGone = await until(
      "the panel gone from the session's page",
      () => origin.locator(FRAME).count(),
      (count) => count === 0,
      10_000
    )
      .then(() => true)
      .catch(() => false);
    const afterClose = await stayed(tab, () => drawn(tab));
    kit.check(
      `${kind}: 1: the session's page's Close takes its panel away, and the artifact's own tab keeps its frame, the same document, its page drawn, for ${WATCH_MS} ms after`,
      panelGone && afterClose.ok,
      JSON.stringify({ panelGone, reads: afterClose.reads })
    );

    // 2. The session shows it in its panel again.
    await fleet.api(
      hubRequest("POST /api/instances/:id/artifacts/:artifact/show", {
        path: { id: session, artifact: artifact.id },
        body: {},
      })
    );
    const panelBack = await until(
      "the panel back on the session's page",
      () => origin.locator(FRAME).count(),
      (count) => count > 0,
      10_000
    )
      .then(() => true)
      .catch(() => false);
    const afterShow = await stayed(tab, () => drawn(tab));
    kit.check(
      `${kind}: 2: a show of it in the session's panel again opens the panel there, and the artifact's own tab keeps its frame, the same document`,
      panelBack && afterShow.ok,
      JSON.stringify({ panelBack, reads: afterShow.reads })
    );

    // 3. A page's new HTML morphs into its tab, as into the panel.
    if (kind === "page") {
      await mark(tab);
      await page(SECOND);
      const morphed = await until(
        "the tab's page drawing the new question",
        () => asks(tab, SECOND),
        Boolean,
        15_000
      )
        .then(() => true)
        .catch(() => false);
      const same = await kept(tab);
      kit.check(
        "page: 3: the page's HTML written anew morphs into its own tab in place: the same document draws the new question",
        morphed && same === true,
        JSON.stringify({ morphed, same })
      );
    }
    await tab.close();
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "artifact-tab-outlives-panel",
  run,
};
export default spec;
