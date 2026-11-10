/**
 * Every session that runs in a workspace of its own offers Archive workspace
 * in its row's menu, not only one whose workspace record is damaged. The
 * menu knows the workspace from the board's row (core
 * `InstanceRow.workspaceId`, which the hub reads off the session's work
 * item: hub db `boardColumns.workspaceId`), and the item asks the same
 * confirm as a damaged one (dashboard LiveSessionMenu `askArchiveWorkspace`).
 *
 * On a scratch fleet (real hub, agent and sessiond), the fleet's dashboard
 * is shown by its port as a session's board preview. One session is a
 * delegate: a work item in a workspace of its own, written to the hub's
 * database as `delegate` writes them. The other has neither. In the
 * preview's frame, at 1440 and at 390, each menu opened from the keyboard
 * (the row focused, Shift+F10): in the kit's Chromium a right-click over
 * the frame reached the artifact tab's own document, the iframe its
 * target, and never the frame's.
 *
 * 1. The delegate's row menu offers Archive workspace.
 * 2. The other session's row menu does not.
 * 3. Archive workspace asks first: "Archive this workspace?" and what goes,
 *    with no damaged-record line; Cancel closes it and the workspace stays
 *    active on the hub. The menu and the confirm are kept as pictures in
 *    the spec's output folder.
 *
 *   bun scripts/probe-kit/run.ts session-archive-menu
 */
import { join } from "node:path";
import type { FrameLocator, Page } from "playwright-core";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { answerText, hubAt } from "../hub";
import { open } from "../kit";
import type { Kit, Spec, View } from "../spec";
import { shaped } from "../words";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** The session with a workspace of its own, by the title the board draws. */
const DELEGATE = "Wren survey";
/** The session with none. */
const PLAIN = "Heron ledger";
/** The menu item and its confirm's words (LiveSessionMenu). */
const ARCHIVE = sidebarWords.archiveWorkspace;
const ASKED = sidebarWords.archiveWorkspaceTitle;
const GOES = shaped(sidebarWords.archiveWorkspaceGoes);
const DAMAGED = shaped(sidebarWords.archiveWorkspaceDamaged);
/** How long the frame has to draw the board: a cold preview starts its listener first. */
const DRAWN_MS = 60_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** Session `id`'s row link in the preview's rail (SessionRow). */
const rowOf = (doc: FrameLocator, id: string) =>
  doc.locator(`a[data-hover-session="${id}"]`).first();

/**
 * Opens session `id`'s row menu from the keyboard, as a person can (the
 * row is a Tab stop; ContextMenu.Lazy builds its menu as the focus reaches
 * it, and Shift+F10 opens it), and reads its items. The menu stays open.
 */
const menuOf = async (
  page: Page,
  doc: FrameLocator,
  id: string
): Promise<string[]> => {
  await rowOf(doc, id).focus();
  await page.waitForTimeout(300);
  await page.keyboard.press("Shift+F10");
  const menu = doc.getByRole("menu").first();
  const opened = await menu
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    return [];
  }
  return (await menu.getByRole("menuitem").allTextContents()).map((text) =>
    text.replace(/\s+/gu, " ").trim()
  );
};

/** Whether every session in `ids` has its row drawn in the preview's rail. */
const rowsShown = async (doc: FrameLocator, ids: string[]) => {
  for (const id of ids) {
    if (!(await rowOf(doc, id).isVisible())) {
      return false;
    }
  }
  return true;
};

/** Closes an open menu and waits until none stands. */
const closeMenu = async (page: Page, doc: FrameLocator) => {
  await page.keyboard.press("Escape");
  await doc
    .getByRole("menu")
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => undefined);
};

/** Waits out the menu's and the confirm's entrances, so a picture holds neither half drawn. */
const settled = async (page: Page) => {
  await page.waitForTimeout(400);
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
  const port = Number(new URL(base).port);
  const plain = await fleet.spawn("claude", PLAIN, fleet.repo);
  const delegate = await fleet.spawn("claude", `${DELEGATE} (new)`, fleet.repo);

  // The delegate: a work item in a workspace of its own, as `delegate`
  // writes them, the plain session its parent.
  const workspace = crypto.randomUUID();
  const item = crypto.randomUUID();
  const now = Date.now();
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    workspace,
    MACHINE,
    fleet.repo,
    join(fleet.sandbox, `ws-${workspace.slice(0, 8)}`),
    `ws/${workspace.slice(0, 8)}`,
    plain,
    now
  );
  fleet.write(
    "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'done', ?)",
    item,
    workspace,
    plain,
    delegate,
    "Survey the wren counts.",
    DELEGATE,
    now
  );
  fleet.write(
    "UPDATE instances SET work_item_id = ? WHERE id = ?",
    item,
    delegate
  );
  // Rows written behind the hub's back: the board reads a session's row
  // again when the hub changes it (board.ts `refreshBoard`), so the
  // delegate is renamed through the hub, as the person renames one.
  const renamed = await hubAt(fleet.base)
    .api.instances({ id: delegate })
    .patch({ title: DELEGATE });
  kit.check(
    "setup: the delegate's work item and workspace are written, and the hub reads its row again",
    renamed.error === null,
    `${renamed.status} ${answerText(renamed).slice(0, 300)}`
  );
  const workspaceState = () =>
    fleet.query<{ state: string }>(
      "SELECT state FROM workspaces WHERE id = ?",
      workspace
    )[0]?.state ?? "none";

  const board = await fleet.api((hub) =>
    hub.api.instances({ id: plain }).artifacts.post({
      kind: "preview",
      does: "try",
      title: "Probe try artifact",
      ask: "Try the board",
      name: "board",
      port,
      path: "/",
    })
  );

  const views: View[] = ["desk", "phone"];
  for (const view of views) {
    const size = view === "desk" ? "1440" : "390";
    const page = await kit.page(view);
    await open(page, `${base}/artifact/${board.id}`, FRAME);
    const doc = page.frameLocator(FRAME).first();
    // Sessions in no project stand in the rail's Recent, closed at first.
    const recent = doc
      .locator('[data-slot="recent"] [data-slot="disclosure"]')
      .first();
    await recent.waitFor({ timeout: DRAWN_MS }).catch(() => undefined);
    if (
      (await recent.getAttribute("aria-expanded").catch(() => null)) === "false"
    ) {
      await recent.focus();
      await page.keyboard.press("Enter");
    }
    await until(
      "the preview's board rows",
      () => rowsShown(doc, [delegate, plain]),
      Boolean,
      DRAWN_MS
    ).catch(() => undefined);

    const plainItems = await menuOf(page, doc, plain);
    await closeMenu(page, doc);
    const delegateItems = await menuOf(page, doc, delegate);
    await settled(page);
    await page.screenshot({ path: join(kit.out, `menu-${view}.png`) });
    kit.check(
      `${size}: 1, 2: the delegate's row menu offers ${ARCHIVE}; the session with no workspace of its own does not`,
      delegateItems.includes(ARCHIVE) &&
        plainItems.length > 0 &&
        !plainItems.includes(ARCHIVE),
      JSON.stringify({ delegateItems, plainItems })
    );

    await doc
      .getByRole("menuitem", { name: ARCHIVE })
      .first()
      .focus()
      .catch(() => undefined);
    await page.keyboard.press("Enter");
    // The confirm unfolds under the row it was asked at (AskHere).
    const ask = doc.locator(`section[data-ask="${delegate}"]`).first();
    const asked = await ask
      .waitFor({ timeout: 10_000 })
      .then(async () => await ask.innerText())
      .catch(() => "");
    await settled(page);
    await page.screenshot({ path: join(kit.out, `confirm-${view}.png`) });
    await ask
      .locator("[data-ask-cancel]")
      .focus()
      .catch(() => undefined);
    await page.keyboard.press("Enter");
    const closed = await ask
      .waitFor({ state: "hidden", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    kit.check(
      `${size}: 3: ${ARCHIVE} asks "${ASKED}" naming what goes, with no damaged-record line; Cancel closes it and the workspace stays active`,
      asked.includes(ASKED) &&
        GOES.test(asked) &&
        !DAMAGED.test(asked) &&
        closed &&
        workspaceState() === "active",
      JSON.stringify({ asked, closed, workspace: workspaceState() })
    );
    await page.context().close();
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "session-archive-menu",
  run,
};
export default spec;
