/**
 * Text selection stays on everywhere and is off on controls (mobile-native
 * rule 8: `select-none` in each control's own classes). On a scratch fleet in
 * the built dashboard, at 1440, a conversation with one reply:
 *
 *  1. the sidebar's grip (`Resize sidebar`, Shell) computes `user-select:
 *     none`;
 *  2. a click in the reply's words, then a Shift-press on the grip, selects
 *     nothing: the browser extended the selection from the caret to the grip
 *     before (3,020 characters in the coral tint, the owner's "red lines");
 *  3. the same press with the grip's `select-none` lifted does extend it, so
 *     check 2 is one the bug fails;
 *  4. a drag across the reply's words still selects them: content stays
 *     selectable;
 *  5. a plain `<button>` with no role is a control too: New Session's dashed
 *     custom-model row (ModelSection) computes `user-select: none`.
 *
 *   bun scripts/probe-kit/run.ts web control-select
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { COMPOSER, type Kit, open, type Spec, settle } from "../../kit";

const GRIP = '[aria-label="Resize sidebar"]';
const REPLY = "Selection stays on for every word of this reply";
/** New Session's opener, as the sidebar and the empty board name it. */
const STARTER = /^(New session|Start session)$/;
/** A model id no catalog holds: ModelSection offers it as the dashed custom row. */
const CUSTOM_MODEL = "probe-custom-model-id";
/** The custom row's name. */
const CUSTOM_ROW = /Use custom model id/;

const respond = (request: Seen): Reply =>
  request.tools
    ? {
        everyMs: 5,
        words: REPLY.split(" ").map((word, i, all) =>
          i < all.length - 1 ? `${word} ` : word
        ),
      }
    : { everyMs: 5, words: ["Probe title"] };

/** The selection as the page holds it. */
const selection = (page: Page) =>
  page.evaluate(() => {
    const now = getSelection();
    return {
      collapsed: now?.isCollapsed ?? true,
      length: now?.toString().length ?? 0,
      text: now?.toString().slice(0, 80) ?? "",
    };
  });

/** Clicks in the reply's words, then presses the grip with Shift held. */
async function shiftPressGrip(page: Page) {
  const words = page.getByText(REPLY, { exact: true }).last();
  const box = await words.boundingBox();
  const grip = await page.locator(GRIP).boundingBox();
  if (!(box && grip)) {
    throw new Error(`no box: words ${String(box)}, grip ${String(grip)}`);
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.keyboard.down("Shift");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await settle(page);
  return selection(page);
}

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
  const id = await fleet.spawn("claude", "Probe selection", fleet.workdir);
  await fleet.send(id, "hello");
  await until(
    "the first turn ended",
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null,
    120_000
  );

  const page = await kit.page("desk", { theme: "light" });
  await open(page, `${base}/session/${id}`, COMPOSER, 90_000);
  await page
    .getByText(REPLY, { exact: true })
    .last()
    .waitFor({ timeout: 60_000 });
  await settle(page, 400);

  // 1. The grip computes unselectable.
  const computed = await page.evaluate((selector) => {
    const grip = document.querySelector(selector);
    return grip ? getComputedStyle(grip).userSelect : null;
  }, GRIP);
  kit.check(
    "the sidebar's grip computes user-select: none",
    computed === "none",
    String(computed)
  );

  // 2. A Shift-press on the grip extends no selection from the caret.
  const pressed = await shiftPressGrip(page);
  kit.check(
    "a click in the reply, then a Shift-press on the grip: the selection stays collapsed",
    pressed.collapsed && pressed.length === 0,
    JSON.stringify(pressed)
  );

  // 3. Lifted, the same press selects across the page: check 2 bites.
  await page.addStyleTag({
    content: `${GRIP} { user-select: auto !important; -webkit-user-select: auto !important; }`,
  });
  const lifted = await shiftPressGrip(page);
  kit.check(
    "with the grip's select-none lifted, the same press extends the selection (the bug)",
    !lifted.collapsed && lifted.length > 0,
    JSON.stringify({ ...lifted, text: undefined })
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await open(page, `${base}/session/${id}`, COMPOSER, 90_000);
  await page
    .getByText(REPLY, { exact: true })
    .last()
    .waitFor({ timeout: 60_000 });
  await settle(page, 400);

  // 4. A drag across the reply's words selects them.
  const box = await page.getByText(REPLY, { exact: true }).last().boundingBox();
  if (!box) {
    throw new Error("the reply has no box");
  }
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 8 });
  await page.mouse.move(box.x + box.width - 2, y, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  const dragged = await selection(page);
  kit.check(
    "a drag across the reply's words selects them",
    !dragged.collapsed && dragged.text.includes("stays on for every word"),
    JSON.stringify(dragged)
  );

  // 5. A plain <button> is a control too: New Session's dashed custom-model row.
  await open(page, `${base}/session`, "body");
  const starter = page
    .getByRole("button", { name: STARTER })
    .filter({ visible: true })
    .first();
  await starter.waitFor({ timeout: 30_000 });
  await starter.click();
  const dialog = page.getByRole("dialog", { name: "New Session" });
  await dialog.waitFor({ timeout: 30_000 });
  await dialog
    .getByRole("textbox", { name: "Search models" })
    .fill(CUSTOM_MODEL);
  const custom = dialog.getByRole("button", { name: CUSTOM_ROW });
  await custom.waitFor({ timeout: 15_000 });
  const customSelect = await custom.evaluate(
    (button) => getComputedStyle(button).userSelect
  );
  kit.check(
    "New Session's dashed custom-model button computes user-select: none",
    customSelect === "none",
    customSelect
  );
};

export default { name: "control-select", run } satisfies Spec;
