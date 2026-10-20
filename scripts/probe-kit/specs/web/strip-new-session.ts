/**
 * The session strip's "+" opens the New Session form, never a refusal (the
 * owner, on "Couldn't start a session — No permission mode has been chosen
 * yet…": "lol useless button?", "this should just open a popover with the
 * new session modal stuff"). A scratch fleet (real hub, agent and sessiond
 * against the mock model) with one session open as its group's one tab, the
 * built dashboard, in a browser that remembers no permission mode
 * (`cawco-spawn-prefs` and `cawco-spawn-machine` cleared). At 1440 (a mouse's
 * clicks) and 390 (a finger's real taps, `locator.tap()`):
 *  1. pressing "+" opens the form: the popover at 1440, the bottom sheet at
 *     390; nothing on the "+" says a start was refused, and the prompt, the
 *     form's first field, holds the focus;
 *  2. at 1440 the popover hangs from the "+": below it (`data-side`), its top
 *     the kit's 4px under the "+"'s foot, its span across the "+"'s; at 390
 *     the sheet stands on the viewport's foot, edge to edge;
 *  3. Start is disabled, the mode chip saying "Choose a mode", until a mode
 *     is picked;
 *  4. Esc closes it and the focus is back on the "+";
 *  5. opened again, Accept edits picked and Start pressed: the form closes,
 *     and a session starts on the tab's machine in its folder in that mode
 *     (the hub's row for it).
 * And the same form in its dialog, where an opener has no trigger (the
 * rail's Start session, at 1440): the card holds the focus, and Esc closes
 * it, the focus back on the opener.
 *
 *   bun scripts/probe-kit/run.ts web strip-new-session
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person takes them
import type { Locator, Page } from "playwright-core";
import type { Reply } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const PLUS = '[data-slot="strip-new"] .tnew';
const POPOVER = "[data-ns-popover]";
const SHEET = "[data-session-card][data-vaul-drawer]";
const DIALOG = "[data-session-card]:not([data-vaul-drawer])";
/** The rail's own opener, which has no trigger for the form to hang from. */
const RAIL_START = 'button[aria-label="Start session"]';
const START = "#session-start";
const MODE = "acceptEdits";
/** The kit popover's gap from its trigger (popover-content `sideOffset`). */
const SIDE_OFFSET = 4;

const LEGS = [
  { view: "desk", label: "1440 (fine)", form: POPOVER },
  { view: "phone", label: "390 (coarse)", form: SHEET },
] as const;
type Leg = (typeof LEGS)[number];

/** A press as the device makes it: a finger's tap on the phone, a mouse's click on the desk. */
const press = (locator: Locator, leg: Leg) =>
  leg.view === "phone" ? locator.tap() : locator.click();

/** A workspace of one group holding `tabs`, the first in front, as workspace.svelte.ts stores it. */
const treeOf = (tabs: string[]) =>
  JSON.stringify({
    v: 1,
    root: { t: "l", id: "pone", tabs, active: tabs[0], opened: null },
    focusedLeaf: "pone",
  });

/** The "+" a person sees: the strip's, drawn. */
const plusOf = (page: Page) =>
  page.locator(PLUS).filter({ visible: true }).first();

/** The form as drawn, the "+" it was opened from, and where the focus is. */
const readForm = (page: Page, form: string) =>
  page.evaluate(
    ({ selector, plus }) => {
      const box = (el: Element | null | undefined) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
      };
      const card = document.querySelector<HTMLElement>(selector);
      const add = [...document.querySelectorAll<HTMLElement>(plus)].find(
        (one) => one.getClientRects().length > 0
      );
      const first = card?.querySelector<HTMLElement>(
        '[contenteditable="true"], input, textarea, select'
      );
      const held = document.activeElement as HTMLElement | null;
      const start = card?.querySelector<HTMLButtonElement>("#session-start");
      return {
        open: card !== null && card.getClientRects().length > 0,
        side: card?.dataset.side ?? null,
        card: box(card),
        plus: box(add),
        firstField: first?.getAttribute("aria-label") ?? null,
        focusOnFirst: Boolean(first) && held === first,
        focusOnPlus: Boolean(add) && held === add,
        focused: held
          ? `${held.tagName.toLowerCase()}${held.getAttribute("aria-label") ? `[${held.getAttribute("aria-label")}]` : ""}`
          : null,
        refusal:
          add?.hasAttribute("data-refused") ||
          document.body.textContent?.includes(
            "No permission mode has been chosen"
          ) ||
          false,
        startDisabled: start?.disabled ?? null,
        startLabel: start?.textContent?.trim() ?? null,
        chip:
          card
            ?.querySelector('[aria-label^="Permission mode"]')
            ?.textContent?.trim() ?? null,
        viewport: [window.innerWidth, window.innerHeight],
      };
    },
    { selector: form, plus: PLUS }
  );

async function runLeg(
  kit: Kit,
  base: string,
  source: string,
  leg: Leg,
  rows: () => { id: string }[],
  row: (
    id: string
  ) =>
    | { machine_id: string; cwd: string; permission_mode: string | null }
    | undefined
) {
  const page = await kit.page(leg.view, { theme: "light" });
  await page.addInitScript(
    (tree) => {
      localStorage.setItem("cawco-workspace", tree);
      localStorage.removeItem("cawco-spawn-prefs");
      localStorage.removeItem("cawco-spawn-machine");
    },
    treeOf([source])
  );
  await open(page, `${base}/session/${source}`, PLUS, 120_000);
  await plusOf(page).waitFor({ state: "visible", timeout: 60_000 });
  await settle(page, 400);
  const remembered = await page.evaluate(() =>
    localStorage.getItem("cawco-spawn-prefs")
  );
  kit.check(
    `${leg.label}: the browser remembers no permission mode`,
    remembered === null,
    String(remembered)
  );

  // 1–3: "+" opens the form, anchored, prompt focused, Start waiting for a mode.
  await press(plusOf(page), leg);
  await page.waitForSelector(leg.form, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const opened = await readForm(page, leg.form);
  kit.check(
    `${leg.label}: "+" opens the New Session form (${leg.view === "desk" ? "the popover" : "the bottom sheet"}), no refusal`,
    opened.open && !opened.refusal,
    JSON.stringify({ open: opened.open, refusal: opened.refusal })
  );
  kit.check(
    `${leg.label}: the focus is in the form's first field`,
    opened.focusOnFirst,
    `first field ${opened.firstField}; focus on ${opened.focused}`
  );
  if (leg.view === "desk") {
    const { card, plus } = opened;
    const gap = card && plus ? card.top - plus.bottom : Number.NaN;
    kit.check(
      `${leg.label}: the popover hangs from the "+": below it, ${SIDE_OFFSET}px under its foot, across its span`,
      opened.side === "bottom" &&
        Math.abs(gap - SIDE_OFFSET) <= 1 &&
        card !== null &&
        plus !== null &&
        card.left <= plus.left &&
        card.right >= plus.right,
      JSON.stringify({ side: opened.side, gap, card, plus })
    );
  } else {
    const { card, viewport } = opened;
    kit.check(
      `${leg.label}: the form is the bottom sheet, on the viewport's foot, edge to edge`,
      card !== null &&
        Math.abs(card.bottom - viewport[1]) <= 1 &&
        Math.abs(card.left) <= 1 &&
        Math.abs(card.right - viewport[0]) <= 1,
      JSON.stringify({ card, viewport })
    );
  }
  kit.check(
    `${leg.label}: Start is disabled, the mode chip saying "Choose a mode", until a mode is picked`,
    opened.startDisabled === true && opened.chip === "Choose a mode",
    JSON.stringify({
      startDisabled: opened.startDisabled,
      chip: opened.chip,
      start: opened.startLabel,
    })
  );

  // 4: Esc closes it, the focus back on "+".
  await page.keyboard.press("Escape");
  await page.waitForSelector(leg.form, { state: "detached", timeout: 15_000 });
  await settle(page, 300);
  const closed = await readForm(page, leg.form);
  kit.check(
    `${leg.label}: Esc closes the form and the focus is back on "+"`,
    !closed.open && closed.focusOnPlus,
    `open ${closed.open}; focus on ${closed.focused}`
  );

  // 5: opened again, a mode picked, Start: a session in the tab's place.
  const before = new Set(rows().map((one) => one.id));
  await press(plusOf(page), leg);
  const form = page.locator(leg.form);
  await form.waitFor({ state: "visible", timeout: 15_000 });
  await settle(page, 300);
  await press(form.locator('[aria-label^="Permission mode"]').first(), leg);
  const choice = page.locator(`[data-perm="${MODE}"]`).filter({
    visible: true,
  });
  await choice.first().waitFor({ state: "visible", timeout: 10_000 });
  await press(choice.first(), leg);
  await page.waitForFunction(
    ({ card, start }) =>
      document.querySelector<HTMLButtonElement>(`${card} ${start}`)
        ?.disabled === false,
    { card: leg.form, start: START },
    { timeout: 30_000 }
  );
  const picked = await readForm(page, leg.form);
  kit.check(
    `${leg.label}: a mode picked, Start is live`,
    picked.startDisabled === false && picked.chip !== "Choose a mode",
    JSON.stringify({ startDisabled: picked.startDisabled, chip: picked.chip })
  );
  await press(form.locator(START), leg);
  const deadline = Date.now() + 120_000;
  let started: string | undefined;
  while (Date.now() < deadline && !started) {
    started = rows().find((one) => !before.has(one.id))?.id;
    if (!started) {
      await page.waitForTimeout(250);
    }
  }
  await page.waitForSelector(leg.form, { state: "detached", timeout: 30_000 });
  const theirs = started ? row(started) : undefined;
  const mine = row(source);
  kit.check(
    `${leg.label}: Start starts a session on the tab's machine, in its folder, in ${MODE}, and the form closes`,
    Boolean(theirs && mine) &&
      theirs?.machine_id === mine?.machine_id &&
      theirs?.cwd === mine?.cwd &&
      theirs?.permission_mode === MODE,
    JSON.stringify({ started: theirs, tab: mine })
  );
  await page.close();
}

/**
 * The same form in its dialog, where an opener has no trigger to hang from
 * (the rail's Start session): the card takes the focus as it opens, and Esc
 * closes it and gives the focus back to the opener.
 */
async function dialogLeg(kit: Kit, base: string) {
  const page = await kit.page("desk", { theme: "light" });
  await open(page, `${base}/`, RAIL_START, 120_000);
  await settle(page, 400);
  await page.locator(RAIL_START).filter({ visible: true }).first().click();
  await page.waitForSelector(DIALOG, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const shown = await page.evaluate(
    ({ card, popover }) => {
      const dialog = document.querySelector<HTMLElement>(card);
      return {
        open: dialog !== null && dialog.getClientRects().length > 0,
        focusOnCard: document.activeElement === dialog,
        prompt: Boolean(dialog?.querySelector('[aria-label="First prompt"]')),
        popover: document.querySelector(popover) !== null,
      };
    },
    { card: DIALOG, popover: POPOVER }
  );
  kit.check(
    "1440 (fine), no trigger: the form opens as the dialog, the card holding the focus",
    shown.open && shown.focusOnCard && shown.prompt && !shown.popover,
    JSON.stringify(shown)
  );
  await page.keyboard.press("Escape");
  const gone = await page
    .waitForSelector(DIALOG, { state: "detached", timeout: 15_000 })
    .then(
      () => "detached",
      (error: Error) => error.message
    );
  const back = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null
  );
  kit.check(
    "1440 (fine), no trigger: Esc closes the dialog, the focus back on its opener",
    gone === "detached" && back === "Start session",
    `${gone}; focus on ${back}`
  );
  await page.close();
}

const respond = (): Reply => ({ everyMs: 20, words: ["Ready."] });

const spec: Spec = {
  name: "strip-new-session",
  async run(kit) {
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
    const source = await fleet.spawn("claude", "Strip source");
    const rows = () => fleet.query<{ id: string }>("SELECT id FROM instances");
    const row = (id: string) =>
      fleet.query<{
        machine_id: string;
        cwd: string;
        permission_mode: string | null;
      }>(
        "SELECT machine_id, cwd, permission_mode FROM instances WHERE id = ?",
        id
      )[0];
    for (const each of LEGS) {
      await runLeg(kit, base, source, each, rows, row);
    }
    await dialogLeg(kit, base);
  },
};

export default spec;
