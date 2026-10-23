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
 * And the same popover from the rail's Start session at 1440, the opener
 * every start with no trigger of its own hangs it from: no scrim, the page
 * live beside it, the prompt holding the focus, and Esc closing it, the
 * focus back on Start session. From a `?spawn=` link it opens there too and
 * the prompt keeps the focus through the link's cleanup.
 * The popover at 1440: `c-new-session-pop-w` wide, the narrowest the form's
 * own rows hold one line at; recessed under the form's raised body in both
 * themes; its open and close scrubbed on the clock against The Fast Exit Rule (DESIGN.md).
 * A fork of a row with no mode opens the form on the fork, never the hub's
 * refusal, and forks once a mode is picked; from Fork from here on a stopped
 * session, at that button.
 * A send to a stopped session that has no mode it can wake on (none on its
 * row and none ever chosen for its harness on its machine; or one its
 * machine doesn't take) opens its permission picker where the message is,
 * the row naming why in our words; a pick relaunches it and the message
 * goes.
 * An empty Configure › Hooks (The Empty Starts Work Rule, a fleet surface)
 * opens the same form from its "Ask Claude Code for a hook", the ask's
 * words in the first prompt with the focus, editable, nothing started.
 *
 *   bun scripts/probe-kit/run.ts web strip-new-session
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person takes them
import type { Locator, Page } from "playwright-core";
import { commonWords } from "../../../../packages/core/src/words/common";
import { spawnWords } from "../../../../packages/core/src/words/spawn";
import { transcriptWords } from "../../../../packages/core/src/words/transcript";
import { MACHINE, type Reply, until } from "../../../scratch-fleet";
import { Clock } from "../../anim";
import { type Kit, type KitFleet, open, type Spec, settle } from "../../kit";

const PLUS = '[data-slot="strip-new"] [data-tnew]';
const POPOVER = "[data-ns-popover]";
const SHEET = "[data-session-card][data-vaul-drawer]";
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
        /* The sheet's headers: the kit's (its title, through MorphText),
           and any the form drew of its own. */
        heads: {
          kit:
            card?.querySelectorAll('[data-slot="drawer-header"]').length ?? 0,
          title:
            card
              ?.querySelector('[data-slot="drawer-title"]')
              ?.textContent?.trim() ?? null,
          morphs:
            card?.querySelector(
              '[data-slot="drawer-title"] > [data-slot="morph-text"]'
            ) !== null,
          // The form's own head (its h2 title), not its sections' heads.
          form:
            card?.querySelectorAll(
              '[data-slot="head"] > div > h2[data-slot="title"]'
            ).length ?? 0,
        },
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
    kit.check(
      `${leg.label}: the sheet's one header is the kit's, titled with the form's own name through MorphText (DESIGN.md, The Steady Swap Rule), the form drawing none of its own`,
      opened.heads.kit === 1 &&
        opened.heads.title === commonWords.newSession &&
        opened.heads.morphs &&
        opened.heads.form === 0,
      JSON.stringify(opened.heads)
    );
  }
  kit.check(
    `${leg.label}: Start is disabled, the mode chip saying "Choose a mode", until a mode is picked`,
    opened.startDisabled === true && opened.chip === spawnWords.unchosenMode,
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
    picked.startDisabled === false && picked.chip !== spawnWords.unchosenMode,
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
 * The same popover from the rail's Start session (DESIGN.md, New-session
 * popover; The Open Page Rule): it hangs from the button, no scrim stands and
 * a point on the page beside it is the page's, the prompt holds the focus,
 * and Esc closes it and gives the focus back to Start session.
 */
async function railLeg(kit: Kit, base: string) {
  const page = await kit.page("desk", { theme: "light" });
  await open(page, `${base}/`, RAIL_START, 120_000);
  await settle(page, 400);
  await page.locator(RAIL_START).filter({ visible: true }).first().click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const shown = await page.evaluate(
    ({ popover, start }) => {
      const pop = document.querySelector<HTMLElement>(popover);
      const trigger = [...document.querySelectorAll<HTMLElement>(start)].find(
        (one) => one.getClientRects().length > 0
      );
      const box = pop?.getBoundingClientRect();
      const from = trigger?.getBoundingClientRect();
      // A point on the page beside the popover, past its trailing edge.
      const x = Math.min(innerWidth - 8, (box?.right ?? 0) + 40);
      const hit = document.elementFromPoint(x, innerHeight / 2);
      const prompt = pop?.querySelector('[aria-label="First prompt"]');
      return {
        open: pop !== null && (pop?.getClientRects().length ?? 0) > 0,
        hangs: !!(box && from) && box.top >= from.bottom - 1,
        scrims: document.querySelectorAll(
          '[data-slot="session-scrim"], [data-slot="dialog-overlay"], [data-slot="drawer-overlay"]'
        ).length,
        pageAt: hit
          ? `${hit.localName}${hit.closest("#main-content") ? " in main" : ""}`
          : "none",
        live: !!hit?.closest("#main-content") && !pop?.contains(hit),
        promptFocused:
          prompt !== null &&
          prompt !== undefined &&
          (prompt === document.activeElement ||
            prompt.contains(document.activeElement)),
      };
    },
    { popover: POPOVER, start: RAIL_START }
  );
  kit.check(
    "1440 (fine), the rail's Start session: the popover hangs from it, no scrim stands, the page beside it is live, and the prompt holds the focus",
    shown.open &&
      shown.hangs &&
      shown.scrims === 0 &&
      shown.live &&
      shown.promptFocused,
    JSON.stringify(shown)
  );
  await page.keyboard.press("Escape");
  const gone = await page
    .waitForSelector(POPOVER, { state: "detached", timeout: 15_000 })
    .then(
      () => "detached",
      (error: Error) => error.message
    );
  const back = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null
  );
  kit.check(
    "1440 (fine), the rail's Start session: Esc closes the popover, the focus back on Start session",
    gone === "detached" && back === spawnWords.startSession,
    `${gone}; focus on ${back}`
  );
  await page.close();
}

/** A desk page on `source`'s tab, no mode remembered, with the popover open from "+". */
async function popoverPage(
  kit: Kit,
  base: string,
  source: string,
  theme: "light" | "dark",
  /** Run on the page before it loads (a socket watcher). */
  before?: (page: Page) => void
): Promise<Page> {
  const page = await kit.page("desk", { theme });
  before?.(page);
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
  return page;
}

/**
 * What doesn't hold at the popover's width `w` (as drawn when null): a row
 * of controls that wrapped (a flex row's items on more than one line), a
 * control whose words wrapped, a label cut short. The composer's chips are
 * the one row that wraps by design (spawn/PRESERVE.md: "The composer chips
 * are 30px and wrap"): they hold the person's machine and folder, as long as
 * those run, so they are not counted.
 */
const misfits = (page: Page, w: number | null) =>
  page.evaluate(
    ({ selector, width }) =>
      new Promise<{ rows: string[]; words: string[]; cut: string[] }>(
        (resolve) => {
          const pop = document.querySelector<HTMLElement>(selector);
          if (!pop) {
            resolve({ rows: ["no popover"], words: [], cut: [] });
            return;
          }
          if (width !== null) {
            pop.style.width = `${width}px`;
          }
          const name = (el: Element) =>
            `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}.${[...el.classList].slice(0, 2).join(".")} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
          const shown = (el: Element) => el.getClientRects().length > 0;
          const read = (unsteady: boolean) => {
            const all = [...pop.querySelectorAll<HTMLElement>("*")].filter(
              shown
            );
            const rows = all
              .filter((el) => {
                const style = getComputedStyle(el);
                if (
                  el.matches('[data-slot="chips"]') ||
                  !style.display.includes("flex") ||
                  style.flexWrap !== "wrap" ||
                  style.flexDirection.startsWith("column")
                ) {
                  return false;
                }
                // On one line every item's box overlaps the first's
                // height band, however the row aligns them.
                const boxes = [...el.children]
                  .filter(shown)
                  .map((child) => child.getBoundingClientRect());
                const [first] = boxes;
                return boxes.some(
                  (box) =>
                    first !== undefined &&
                    (box.top >= first.bottom - 1 || box.bottom <= first.top + 1)
                );
              })
              .map(name);
            const words = all
              .filter((el) => el.matches("button, [role='radio']"))
              .filter((el) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const lines = new Set(
                  [...range.getClientRects()]
                    .filter((r) => r.width > 0 && r.height > 0)
                    .map((r) => Math.round(r.bottom))
                );
                return (
                  getComputedStyle(el).whiteSpace === "normal" &&
                  lines.size > 1 &&
                  el.getBoundingClientRect().height > 48
                );
              })
              .map(name);
            const cut = all
              .filter(
                (el) =>
                  getComputedStyle(el).textOverflow === "ellipsis" &&
                  el.scrollWidth > el.clientWidth + 0.5
              )
              .map(name);
            resolve({
              rows: unsteady ? ["the layout never held still", ...rows] : rows,
              words,
              cut,
            });
          };
          // Read once the fonts have loaded and the layout holds still: every
          // box the same across two frames, the popover at the width asked
          // (its size tween, morph(), landed). A layout that never settles
          // says so rather than being read mid-move.
          const boxes = () =>
            [pop, ...pop.querySelectorAll("*")]
              .map((el) => {
                const box = el.getBoundingClientRect();
                return `${box.x},${box.y},${box.width},${box.height}`;
              })
              .join("|");
          let last = "";
          let frame = 0;
          const wait = () => {
            const now = boxes();
            const sized =
              width === null ||
              Math.abs(pop.getBoundingClientRect().width - width) < 0.5;
            if (now === last && sized) {
              read(false);
              return;
            }
            frame += 1;
            if (frame > 600) {
              read(true);
              return;
            }
            last = now;
            requestAnimationFrame(wait);
          };
          // biome-ignore lint/complexity/noVoid: the read resolves the promise
          void document.fonts.ready.then(() => requestAnimationFrame(wait));
        }
      ),
    { selector: POPOVER, width: w }
  );

/** Every misfit, in one line. */
const said = (at: { rows: string[]; words: string[]; cut: string[] }) =>
  [...at.rows, ...at.words, ...at.cut].join("; ");

/**
 * The popover's width: `c-new-session-pop-w` as drawn at 1440, the form
 * holding there, and the narrowest it holds at (4px under it, a row
 * wraps); its foot inside the window, the height capped at the room under
 * "+".
 */
async function sizeLeg(kit: Kit, base: string, source: string) {
  const page = await popoverPage(kit, base, source, "light");
  await plusOf(page).click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const drawn = await page.evaluate((selector) => {
    const pop = document.querySelector<HTMLElement>(selector);
    const box = pop?.getBoundingClientRect();
    return {
      token: getComputedStyle(document.documentElement)
        .getPropertyValue("--c-new-session-pop-w")
        .trim(),
      width: box?.width ?? 0,
      bottom: box?.bottom ?? 0,
      maxHeight: pop ? getComputedStyle(pop).maxHeight : "",
      viewport: window.innerHeight,
    };
  }, POPOVER);
  const width = Number.parseFloat(drawn.token);
  kit.check(
    '1440 (fine): the popover is c-new-session-pop-w wide, its foot inside the window, its height capped at the room under the "+"',
    width > 0 &&
      Math.abs(drawn.width - width) <= 0.5 &&
      drawn.bottom <= drawn.viewport &&
      drawn.maxHeight !== "none",
    JSON.stringify(drawn)
  );
  const there = await misfits(page, null);
  kit.check(
    `1440 (fine): at ${width}px every row of the form holds one line, no control's words wrap, no label is cut`,
    said(there) === "",
    said(there) || "all hold"
  );
  const under = await misfits(page, width - 4);
  kit.check(
    `1440 (fine): ${width}px is the narrowest: at ${width - 4}px a row gives`,
    said(under) !== "",
    said(under) || "nothing gave"
  );
  await page.close();
}

/** A token's colour as the page computes it on a background. */
const tokenBackground = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

/**
 * The Frame Recesses Rule in the popover: the popover (the frame) is
 * `surface-recess`, the form's body on it `surface-raised`, in each theme.
 */
async function depthLeg(
  kit: Kit,
  base: string,
  source: string,
  theme: "light" | "dark"
) {
  const page = await popoverPage(kit, base, source, theme);
  await plusOf(page).click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const backOf = (selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    }, selector);
  const read = {
    frame: await backOf(POPOVER),
    body: await backOf(`${POPOVER} [data-slot="body"]`),
    recess: await tokenBackground(page, "--surface-recess"),
    raised: await tokenBackground(page, "--surface-raised"),
  };
  kit.check(
    `1440 ${theme}: the popover recesses (surface-recess) and the form's body stands raised on it (surface-raised)`,
    read.frame === read.recess &&
      read.body === read.raised &&
      read.recess !== read.raised,
    JSON.stringify(read)
  );
  await page.close();
}

/** A run's length and curve, and the popover's opacity, translate and scale, at each fraction of its clock. */
interface MotionRead {
  at: Record<string, { opacity: string; translate: string; scale: string }>;
  runs: string[];
}

/** The popover's own runs, caught as `action` starts them and read at 0, ½ and 1. */
async function scrub(
  page: Page,
  clock: Clock,
  action: () => Promise<unknown>
): Promise<MotionRead> {
  const node = await popoverNode(page, action, clock);
  const read: MotionRead = {
    runs: clock.runs.map((run) => `${run.name} ${run.end}ms ${run.easing}`),
    at: {},
  };
  for (const fraction of [0, 0.5, 1]) {
    await clock.seek(fraction);
    read.at[String(fraction)] = await page.evaluate((sel) => {
      const pop = document.querySelector(sel);
      const style = pop ? getComputedStyle(pop) : null;
      return {
        opacity: style?.opacity ?? "",
        translate: style?.translate ?? "",
        scale: style?.scale ?? "",
      };
    }, POPOVER);
  }
  await clock.release();
  return read.runs.length > 0 && node ? read : { runs: [], at: {} };
}

/**
 * Catches the runs `action` starts inside the popover and keeps on the clock
 * those on the popover itself (its node, by the DevTools DOM domain): the
 * form inside has runs of its own (its sections' entrance, the height tween).
 */
async function popoverNode(
  page: Page,
  action: () => Promise<unknown>,
  clock: Clock
): Promise<number | null> {
  const runs = await clock.catchRuns(action, POPOVER);
  const cdp = await page.context().newCDPSession(page);
  const { root } = (await cdp.send("DOM.getDocument", { depth: 0 })) as {
    root: { nodeId: number };
  };
  const { nodeId } = (await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: POPOVER,
  })) as { nodeId: number };
  const { node } = (await cdp.send("DOM.describeNode", { nodeId })) as {
    node: { backendNodeId: number };
  };
  await cdp.detach();
  clock.runs = runs.filter((run) => run.node === node.backendNodeId);
  return node.backendNodeId;
}

/**
 * The Fast Exit Rule (DESIGN.md; the motion is in popover-content.svelte's `floatingSurface` doc): the popover opens from its trigger's side over 260ms on
 * the drawer curve, rising 8px and growing from 0.92 as it fades in, and
 * leaves the same way over 160ms. Scrubbed on the clock (the DevTools
 * Animation domain) at 0, ½ and 1 of its own runs.
 */
async function motionLeg(kit: Kit, base: string, source: string) {
  const page = await popoverPage(kit, base, source, "light");
  const expected = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const of = (name: string) => root.getPropertyValue(name).trim();
    return {
      open: of("--dur-pop"),
      close: of("--dur-exit"),
      curve: of("--ease-drawer"),
      rise: of("--pop-rise"),
      scale: of("--pop-scale"),
    };
  });
  const clock = await Clock.on(page);
  const opened = await scrub(page, clock, () => plusOf(page).click());
  await settle(page, 400);
  const closed = await scrub(page, clock, () => page.keyboard.press("Escape"));
  // The built CSS writes its tokens short (".26s", "cubic-bezier(.32, …)"):
  // read as numbers.
  const ms = (value: string) =>
    value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
  const numbers = (value: string) =>
    (value.match(/-?[\d.]+/g) ?? []).map(Number).join(",");
  const lengths = (read: MotionRead, want: number) =>
    read.runs.length === 3 &&
    read.runs.every(
      (run) => Math.abs(Number.parseFloat(run.split(" ")[1] ?? "") - want) < 1
    );
  const curved = (read: MotionRead) =>
    read.runs.every(
      (run) =>
        numbers(run.slice(run.indexOf("cubic-bezier"))) ===
        numbers(expected.curve)
    );
  const rise = `0px -${expected.rise}`;
  const small = (value: string | undefined) =>
    Number(value) === Number(expected.scale);
  kit.check(
    `1440 (fine): the popover opens over ${expected.open} on the drawer curve (${expected.curve}), from the "+"'s side ${expected.rise} off and ${expected.scale} small at 0, on its way at ½, whole at 1`,
    lengths(opened, ms(expected.open)) &&
      curved(opened) &&
      opened.at["0"].opacity === "0" &&
      opened.at["0"].translate === rise &&
      small(opened.at["0"].scale) &&
      Number(opened.at["0.5"].opacity) > 0 &&
      Number(opened.at["0.5"].opacity) < 1 &&
      opened.at["1"].opacity === "1" &&
      opened.at["1"].scale === "none" &&
      opened.at["1"].translate === "none",
    JSON.stringify({ expected, opened })
  );
  kit.check(
    `1440 (fine): the popover leaves the same way over ${expected.close}: whole at 0, toward the "+" at 1`,
    lengths(closed, ms(expected.close)) &&
      curved(closed) &&
      closed.at["0"].opacity === "1" &&
      Number(closed.at["0.5"].opacity) < 1 &&
      closed.at["1"].opacity === "0" &&
      closed.at["1"].translate === rise &&
      small(closed.at["1"].scale),
    JSON.stringify({ expected, closed })
  );
  await page.close();
}

/**
 * The popover from a `?spawn=<machine>` link, hung from the rail's Start
 * session: the URL's cleanup navigation leaves the focus in the prompt
 * (Shell's `goto(…, { reset: false })`), not on <body>.
 */
async function spawnLinkLeg(kit: Kit, base: string, machineId: string) {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${base}/?spawn=${encodeURIComponent(machineId)}`,
    POPOVER,
    120_000
  );
  await page.waitForFunction(() => !location.search.includes("spawn="), null, {
    timeout: 15_000,
  });
  await settle(page, 400);
  const held = await page.evaluate((popover) => {
    const prompt = document.querySelector(
      `${popover} [aria-label="First prompt"]`
    );
    const focus = document.activeElement;
    return {
      inPrompt:
        prompt !== null &&
        focus !== null &&
        (focus === prompt || prompt.contains(focus)),
      focus: focus ? focus.tagName.toLowerCase() : null,
      url: location.pathname + location.search,
    };
  }, POPOVER);
  kit.check(
    "1440 (fine), a ?spawn= link: the popover's prompt holds the focus after the link's cleanup, not <body>",
    held.inPrompt,
    JSON.stringify(held)
  );
  await page.close();
}

/** Sends `text` to `source` and waits for the turn it opens to close. */
async function turn(fleet: KitFleet, source: string, text: string) {
  const uuid = await fleet.send(source, text);
  // Read by the session first: the turn it opens has not opened before it is.
  await until(
    `"${text}" read`,
    () => fleet.sendRow(uuid),
    (one) => one?.state === "read",
    120_000
  );
  await until(
    `"${text}" answered`,
    () =>
      fleet.query<{ session_id: string | null; turn_open_at: number | null }>(
        "SELECT session_id, turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => Boolean(one?.session_id) && one?.turn_open_at === null,
    120_000
  );
}

/**
 * A fork of a session whose row records no mode (its row's mode cleared,
 * as an old row's is, once it has stopped): Fork in its row's menu in the
 * rail opens the New Session form on the fork, the popover hung from the
 * rail's Start session (a menu's item leaves nothing to hang from): "Fork
 * session", Start "Fork" waiting for a
 * mode, never the hub's refusal. With a mode picked, Fork branches the
 * conversation into a new session in that mode, on its source's machine.
 */
async function forkLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  rows: () => { id: string }[]
) {
  // In a project, so its row stands in the rail under it.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Forks",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const source = await fleet.spawn("claude", "Fork source", fleet.repo, {
    projectId: project.id,
  });
  await turn(fleet, source, "hello");
  await turn(fleet, source, "again");
  // Stopped first: a running session's reports write its mode back.
  await fleet.stopSession(source);
  await until(
    "the fork source stopped",
    () => fleet.instance(source),
    (one) => one?.status === "stopped",
    60_000
  );
  fleet.write(
    "UPDATE instances SET permission_mode = NULL WHERE id = ?",
    source
  );
  // On its own page, its project open in the rail.
  const page = await popoverPage(kit, base, source, "light");
  // Its row in the rail, whose menu holds Fork (LiveSessionMenu).
  const row = page
    .locator(`a[data-session-row-row][href*="${source}"]`)
    .filter({ visible: true })
    .first();
  const found = await row.waitFor({ state: "visible", timeout: 30_000 }).then(
    () => "",
    async () =>
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll("[data-session-row-row]")].map(
            (one) =>
              `${one.getAttribute("href")} ${one.getClientRects().length > 0 ? "shown" : "hidden"}`
          )
        )
      )
  );
  if (found) {
    kit.check(
      "1440 (fine): the fork source's row is in the rail",
      false,
      found
    );
    await page.close();
    return;
  }
  await row.hover();
  await row.click({ button: "right" });
  const before = new Set(rows().map((one) => one.id));
  await page.getByRole("menuitem", { name: "Fork", exact: true }).click();
  const shown = await page
    .waitForSelector(POPOVER, { state: "visible", timeout: 15_000 })
    .then(
      () => "",
      (error: Error) => error.message
    );
  await settle(page, 400);
  const form = await page.evaluate(
    ({ card, start }) => {
      const pop = document.querySelector(card);
      const go = pop?.querySelector<HTMLButtonElement>(start);
      return {
        title: pop?.querySelector("h2")?.textContent?.trim() ?? null,
        start: go?.textContent?.trim() ?? null,
        disabled: go?.disabled ?? null,
        chip:
          pop
            ?.querySelector('[aria-label^="Permission mode"]')
            ?.textContent?.trim() ?? null,
        refusal: document.body.textContent?.includes(
          "A permission mode must be chosen"
        ),
      };
    },
    { card: POPOVER, start: START }
  );
  kit.check(
    "1440 (fine): a fork of a row with no mode, from its menu, opens the New Session form on the fork, Start waiting for a mode, never the hub's refusal",
    shown === "" &&
      form.title === spawnWords.forkSession &&
      form.start?.startsWith("Fork") === true &&
      form.disabled === true &&
      form.chip === spawnWords.unchosenMode &&
      !form.refusal,
    JSON.stringify({ shown, ...form })
  );
  const pop = page.locator(POPOVER);
  await pop.locator('[aria-label^="Permission mode"]').first().click();
  const choice = page.locator(`[data-perm="${MODE}"]`).filter({
    visible: true,
  });
  await choice.first().waitFor({ state: "visible", timeout: 10_000 });
  await choice.first().click();
  await page.waitForFunction(
    ({ card, start }) =>
      document.querySelector<HTMLButtonElement>(`${card} ${start}`)
        ?.disabled === false,
    { card: POPOVER, start: START },
    { timeout: 30_000 }
  );
  await pop.locator(START).click();
  const forked = await until(
    "the fork's row",
    () => rows().find((one) => !before.has(one.id))?.id,
    Boolean,
    120_000
  ).catch(() => undefined);
  const made = forked
    ? fleet.query<{
        forked_from: string | null;
        permission_mode: string | null;
        machine_id: string;
      }>(
        "SELECT forked_from, permission_mode, machine_id FROM instances WHERE id = ?",
        forked
      )[0]
    : undefined;
  const [from] = fleet.query<{ machine_id: string }>(
    "SELECT machine_id FROM instances WHERE id = ?",
    source
  );
  kit.check(
    `1440 (fine): Fork, a mode picked, branches the conversation into a new session in ${MODE}, on its source's machine`,
    Boolean(made?.forked_from) &&
      made?.permission_mode === MODE &&
      made?.machine_id === from?.machine_id,
    JSON.stringify({ made, from })
  );
  await page.close();
}

/**
 * A running session idle between turns, its row's menu in the rail: Stop
 * is there, Unarchive never (it ended a turn, not itself, and was never
 * archived).
 */
async function liveMenuLeg(kit: Kit, base: string, fleet: KitFleet) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Live menu",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const live = await fleet.spawn("claude", "Live idle", fleet.repo, {
    projectId: project.id,
  });
  await turn(fleet, live, "hello");
  await until(
    "the live session idle",
    () => fleet.instance(live),
    (one) => one?.status === "running",
    60_000
  );
  const page = await popoverPage(kit, base, live, "light");
  const row = page
    .locator(`a[data-session-row-row][href*="${live}"]`)
    .filter({ visible: true })
    .first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.hover();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).waitFor();
  const names = (await page.getByRole("menuitem").allTextContents()).map(
    (one) => one.trim()
  );
  kit.check(
    "1440 (fine): a live idle session's menu offers Stop and never Unarchive",
    names.some((one) => one.startsWith("Stop")) && !names.includes("Unarchive"),
    JSON.stringify(names)
  );
  await page.close();
}

/** The session's own permission picker (transcript/ModePick), as drawn. */
const MODE_PICK = '[data-ns-pop][aria-label="Permission mode"]';
/** The composer's field, named by its hint (as journeys/j3-spawn names it). */
const COMPOSER = /^Message/;

/**
 * A stopped session with two answered turns whose row records `mode`: none
 * (on a machine where none was ever chosen for Claude Code), or one its
 * machine doesn't take. What a revive, a rewind or a fork of it has to ask
 * for.
 */
async function stoppedSession(
  fleet: KitFleet,
  name: string,
  mode: "dontAsk" | null
): Promise<string> {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const source = await fleet.spawn("claude", `${name} source`, fleet.repo, {
    projectId: project.id,
  });
  await turn(fleet, source, "hello");
  await turn(fleet, source, "again");
  await fleet.stopSession(source);
  await until(
    "the revive source stopped",
    () => fleet.instance(source),
    (one) => one?.status === "stopped",
    60_000
  );
  fleet.write(
    "UPDATE instances SET permission_mode = ? WHERE id = ?",
    mode,
    source
  );
  fleet.write(
    "DELETE FROM chosen_modes WHERE machine_id = ? AND harness = 'claude'",
    MACHINE
  );
  return source;
}

/** Each of the reader's turns on the page, with the controls its actions offer. */
const turnActions = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="turn"][data-you]')].map(
      (one) =>
        `${(one.querySelector('[data-slot="words"]')?.textContent ?? "").trim().slice(0, 24)}: ${[
          ...one.querySelectorAll("[data-slot='actions'] button"),
        ]
          .map(
            (button) =>
              button.getAttribute("aria-label") ??
              (button.textContent ?? "").trim()
          )
          .join(", ")}`
    )
  );

/**
 * Fork from here on a stopped session whose row records no mode: the store
 * has its conversation's key from its row (client `hydrate`: "The row is the
 * authority on the key"), so the transcript offers it, and the New Session
 * form opens at that button as a popover on the fork, Start waiting for a
 * mode. Closed with Esc, the focus goes back to the button.
 */
async function forkHereLeg(kit: Kit, base: string, source: string) {
  const page = await popoverPage(kit, base, source, "light");
  const fork = page
    .getByRole("button", { name: transcriptWords.forkFromHere })
    .filter({ visible: true })
    .last();
  const offered = await fork
    .waitFor({ state: "attached", timeout: 30_000 })
    .then(
      () => "",
      async () => JSON.stringify(await turnActions(page))
    );
  kit.check(
    "1440 (fine): a stopped session's transcript offers Fork from here",
    offered === "",
    offered || "offered"
  );
  if (offered) {
    await page.close();
    return;
  }
  await fork.locator('xpath=ancestor::*[@data-slot="turn"][1]').hover();
  await fork.click();
  const shown = await page
    .waitForSelector(POPOVER, { state: "visible", timeout: 15_000 })
    .then(
      () => "",
      (error: Error) => error.message
    );
  await settle(page, 400);
  const form = await page.evaluate(
    ({ card, start }) => {
      const pop = document.querySelector(card);
      const go = pop?.querySelector<HTMLButtonElement>(start);
      const trigger = [
        ...document.querySelectorAll<HTMLElement>(
          'button[aria-label="Fork from here"]'
        ),
      ].at(-1);
      const box = pop?.getBoundingClientRect();
      const at = trigger?.getBoundingClientRect();
      return {
        title: pop?.querySelector("h2")?.textContent?.trim() ?? null,
        disabled: go?.disabled ?? null,
        chip:
          pop
            ?.querySelector('[aria-label^="Permission mode"]')
            ?.textContent?.trim() ?? null,
        side: pop?.getAttribute("data-side") ?? null,
        gap: box && at ? Math.round(box.top - at.bottom) : null,
        across: box && at ? box.left <= at.left && box.right >= at.right : null,
      };
    },
    { card: POPOVER, start: START }
  );
  kit.check(
    "1440 (fine): Fork from here on that stopped session opens the New Session form at the button, a popover on the fork, Start waiting for a mode",
    shown === "" &&
      form.title === spawnWords.forkSession &&
      form.disabled === true &&
      form.chip === spawnWords.unchosenMode &&
      form.side === "bottom" &&
      form.gap !== null &&
      Math.abs(form.gap - SIDE_OFFSET) <= 1 &&
      form.across === true,
    JSON.stringify({ shown, ...form })
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector(POPOVER, { state: "detached", timeout: 15_000 });
  const back = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null
  );
  kit.check(
    "1440 (fine): Esc closes it, the focus back on Fork from here",
    back === transcriptWords.forkFromHere,
    `focus on ${back}`
  );
  await page.close();
}

/** What a revive leg sends, why its wake asks, and what its row says. */
interface Revive {
  /** The row's line, the dashboard's own words. */
  line: string;
  /** Why it asks, in the check's words. */
  why: string;
  /** What the person sends. */
  words: string;
}

/**
 * A send to a stopped session whose wake has no mode it can run on (none,
 * or one its machine doesn't take): the session's own permission picker
 * opens at the message's Choose a mode, the row says why in the
 * dashboard's words, and the hub's refusal is never shown. A pick
 * relaunches the session in place on it, and the message goes.
 */
async function reviveLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  source: string,
  revive: Revive
) {
  const page = await popoverPage(kit, base, source, "light");
  const field = page
    .getByRole("combobox", { name: COMPOSER })
    .filter({ visible: true })
    .first();
  await field.click();
  await page.keyboard.type(revive.words);
  await page
    .getByRole("button", { name: transcriptWords.sendMessage })
    .filter({ visible: true })
    .first()
    .click();
  const shown = await page
    .waitForSelector(MODE_PICK, { state: "visible", timeout: 30_000 })
    .then(
      () => "",
      (error: Error) => error.message
    );
  await settle(page, 400);
  // The row's Choose a mode, by its accessible name: a kit Button's text
  // holds its pending words too ("Choose a modeStarting it…").
  const chooser = await page
    .locator('[data-slot="turn"][data-you]', { hasText: revive.words })
    .getByRole("button", { name: spawnWords.unchosenMode, exact: true })
    .first()
    .boundingBox()
    .catch(() => null);
  const asked = await page.evaluate(
    ({ pick, sent, line, at, notSent }) => {
      const pop = document.querySelector(pick);
      // The message's own row: its words, and what it says under them.
      const row = [
        ...document.querySelectorAll('[data-slot="turn"][data-you]'),
      ].find((one) => (one.textContent ?? "").includes(sent));
      const box = pop?.getBoundingClientRect();
      const words = `${row?.textContent ?? ""} ${pop?.textContent ?? ""}`;
      return {
        rows: pop?.querySelectorAll("[data-perm]").length ?? 0,
        side: pop?.getAttribute("data-side") ?? null,
        // Against the button on the side it was placed: 6px (NsPopover's
        // sideOffset) under its foot, or over its top.
        gap:
          box && at
            ? Math.round(
                pop?.getAttribute("data-side") === "top"
                  ? at.y - box.bottom
                  : box.top - (at.y + at.height)
              )
            : null,
        line: words.includes(line),
        refusal:
          words.includes("A permission mode must be chosen") ||
          words.includes("Nothing was started"),
        failure: words.includes(notSent),
        said: (
          row?.querySelector("[data-slot='reason']")?.textContent ?? ""
        ).trim(),
      };
    },
    {
      pick: MODE_PICK,
      sent: revive.words,
      line: revive.line,
      at: chooser,
      notSent: transcriptWords.notSent,
    }
  );
  // What the hub hands every screen for the session (its board row).
  const listed = (await (
    await fetch(`${fleet.base}/api/instances`)
  ).json()) as {
    id: string;
    permissionMode?: string | null;
  }[];
  const board = listed.find((one) => one.id === source)?.permissionMode;
  const [refused] = fleet.query<{ state: string; refusal: string | null }>(
    "SELECT state, refusal FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
    source,
    `%${revive.words}%`
  );
  kit.check(
    `1440 (fine): a send that has to wake a session ${revive.why} opens its permission picker against the message's Choose a mode, the row saying why in our words; the hub's refusal is never shown`,
    shown === "" &&
      asked.rows > 0 &&
      asked.gap !== null &&
      Math.abs(asked.gap - 6) <= 1 &&
      asked.line &&
      !asked.refusal &&
      !asked.failure &&
      refused?.refusal?.includes("mode-ask") === true,
    JSON.stringify({ shown, ...asked, refused, board })
  );
  // The hub's words are never shown, at any moment of the relaunch: every
  // change to the page from the pick on is read, and the first that says
  // them is kept with where it stands.
  await page.evaluate(watchRefusal);
  await page.locator(`${MODE_PICK} [data-perm="${MODE}"]`).click();
  const went = await until(
    "the message goes",
    () =>
      fleet
        .query<{ state: string }>(
          "SELECT state FROM sent_messages WHERE instance_id = ? AND body LIKE ? AND state != 'failed'",
          source,
          `%${revive.words}%`
        )
        .at(0),
    Boolean,
    120_000
  ).catch(() => undefined);
  // Until the session has read it, the row's turn of words is still to come.
  await until(
    "the session reads it",
    () =>
      fleet
        .query<{ state: string }>(
          "SELECT state FROM sent_messages WHERE instance_id = ? AND body LIKE ? AND state = 'read'",
          source,
          `%${revive.words}%`
        )
        .at(0),
    Boolean,
    120_000
  ).catch(() => undefined);
  const [after] = fleet.query<{
    status: string;
    permission_mode: string | null;
  }>("SELECT status, permission_mode FROM instances WHERE id = ?", source);
  const shownAfter = await page.evaluate(() => {
    const watch = (
      window as unknown as {
        refusalSeen?: { seen: string | null; stop: () => void };
      }
    ).refusalSeen;
    watch?.stop();
    return watch?.seen ?? false;
  });
  kit.check(
    `1440 (fine): ${revive.why}, picking ${MODE} relaunches the session in place on it, and the message goes`,
    after?.permission_mode === MODE &&
      after.status !== "stopped" &&
      went !== undefined &&
      !shownAfter,
    JSON.stringify({ after, went, refusalShown: shownAfter })
  );
  await page.close();
}

/**
 * In the page: watches every change from now on for the hub's mode
 * refusal in the page's words (`window.refusalSeen`), keeping the first
 * sighting as the innermost element saying it, its slots up and its words.
 */
function watchRefusal() {
  const says = (el: Element) => {
    const text = el.textContent ?? "";
    return (
      text.includes("A permission mode must be chosen") ||
      text.includes("Nothing was started")
    );
  };
  const watch: { seen: string | null; stop: () => void } = {
    seen: null,
    stop: () => undefined,
  };
  const look = () => {
    if (watch.seen !== null || !says(document.body)) {
      return;
    }
    const inner = [...document.body.querySelectorAll("*")]
      .filter(says)
      .find((el) => ![...el.children].some(says));
    const slots: string[] = [];
    for (let at = inner ?? null; at; at = at.parentElement) {
      const slot = at.getAttribute("data-slot");
      if (slot) {
        slots.push(slot);
      }
    }
    watch.seen = `${slots.join(" < ")}: ${inner?.textContent?.trim().slice(0, 240)}`;
  };
  const observer = new MutationObserver(look);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  watch.stop = () => observer.disconnect();
  (window as unknown as { refusalSeen: typeof watch }).refusalSeen = watch;
  look();
}

/** The spawns a page sends on its socket, as sent: whether each names a permission mode. */
function watchSpawns(page: Page): { mode: string | null }[] {
  const spawns: { mode: string | null }[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string" || !payload.includes('"spawn"')) {
        return;
      }
      try {
        const frame = JSON.parse(payload) as {
          verb?: string;
          payload?: { permissionMode?: string };
        };
        if (frame.verb === "spawn") {
          spawns.push({ mode: frame.payload?.permissionMode ?? null });
        }
      } catch {
        // Not one frame of JSON: not a spawn.
      }
    });
  });
  return spawns;
}

/**
 * Ctrl+Enter in the form with no mode picked, once its folder check has
 * landed (so no press is held for it): the key starts exactly when Start
 * would, so no spawn goes out on the socket. With a mode picked, the same
 * key sends one, on that mode: the watcher sees what the page sends.
 */
async function keyStartLeg(kit: Kit, base: string, source: string) {
  let spawns: { mode: string | null }[] = [];
  const page = await popoverPage(kit, base, source, "light", (one) => {
    spawns = watchSpawns(one);
  });
  await plusOf(page).click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  // The folder read: a press then goes or not at once, never held for it.
  await page.waitForFunction(
    (card) => {
      const line = document.querySelector(`${card} [data-slot="reading"]`);
      return line !== null && line.textContent?.trim() !== "Reading…";
    },
    POPOVER,
    { timeout: 30_000 }
  );
  await settle(page, 300);
  const before = await readForm(page, POPOVER);
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(5000);
  const unpicked = {
    startDisabled: before.startDisabled,
    chip: before.chip,
    spawns: spawns.length,
    open: (await readForm(page, POPOVER)).open,
    said: await page
      .locator(`${POPOVER} [data-slot="reading"]`)
      .textContent()
      .then((text) => text?.trim() ?? ""),
  };
  await page
    .locator(POPOVER)
    .locator('[aria-label^="Permission mode"]')
    .first()
    .click();
  await page
    .locator(`[data-perm="${MODE}"]`)
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForFunction(
    ({ card, start }) =>
      document.querySelector<HTMLButtonElement>(`${card} ${start}`)
        ?.disabled === false,
    { card: POPOVER, start: START },
    { timeout: 30_000 }
  );
  await page.locator(POPOVER).locator('[aria-label="First prompt"]').click();
  await page.keyboard.press("Control+Enter");
  const picked = await until(
    "a spawn on the socket",
    () => spawns.at(unpicked.spawns),
    Boolean,
    30_000
  ).catch(() => undefined);
  kit.check(
    "1440 (fine): Ctrl+Enter with no mode picked sends no spawn (the key waits as Start does); with one picked it sends one on it",
    unpicked.startDisabled === true &&
      unpicked.chip === spawnWords.unchosenMode &&
      unpicked.spawns === 0 &&
      unpicked.open &&
      picked?.mode === MODE,
    JSON.stringify({ unpicked, picked })
  );
  await page.close();
}

/** What an empty Configure › Hooks asks a new session for (empty-asks.ts FLEET_ASKS.hooks). */
const HOOK_ASK =
  "Make a CawCo hook for my fleet: look at what my sessions keep doing before or after their work, and have a hook run it for them.";
/** What the person adds to the ask's words, proving them theirs to edit. */
const HOOK_EDIT = " Only for bun projects.";

/**
 * The Empty Starts Work Rule on a fleet surface: Configure › Hooks with no
 * hooks offers "Ask Claude Code for a hook"; pressed, the New Session form
 * opens hanging from it, its first prompt holding the ask's words with the
 * focus in it, nothing started; the words take a keystroke at their end.
 */
async function emptyAskLeg(
  kit: Kit,
  base: string,
  rows: () => { id: string }[]
) {
  const page = await kit.page("desk", { theme: "light" });
  await page.addInitScript(() => {
    localStorage.removeItem("cawco-spawn-prefs");
  });
  const ASK = "[data-empty-ask]";
  await open(page, `${base}/config/hooks`, ASK, 120_000);
  await settle(page, 400);
  const label = (await page.locator(ASK).textContent())?.trim() ?? null;
  const before = rows().length;
  await page.locator(ASK).click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 400);
  const read = () =>
    page.evaluate(
      ({ popover, ask }) => {
        const pop = document.querySelector<HTMLElement>(popover);
        const field = pop?.querySelector<HTMLElement>(
          '[aria-label="First prompt"]'
        );
        const from = document.querySelector<HTMLElement>(ask);
        const box = pop?.getBoundingClientRect();
        const anchor = from?.getBoundingClientRect();
        return {
          open: !!pop && pop.getClientRects().length > 0,
          hangs: !!(box && anchor) && box.top >= anchor.bottom - 1,
          text: field?.innerText.trim() ?? null,
          editable: field?.isContentEditable ?? false,
          focused:
            !!field &&
            (field === document.activeElement ||
              field.contains(document.activeElement)),
        };
      },
      { popover: POPOVER, ask: ASK }
    );
  const opened = await read();
  kit.check(
    '1440 (fine), Configure › Hooks empty: its one action reads "Ask Claude Code for a hook"; pressed, the New Session form opens hanging from it, its first prompt holding the ask\'s words, the focus in it, editable, and no session started',
    label === "Ask Claude Code for a hook" &&
      opened.open &&
      opened.hangs &&
      opened.text === HOOK_ASK &&
      opened.editable &&
      opened.focused &&
      rows().length === before,
    JSON.stringify({ label, opened, before, after: rows().length })
  );
  await page.keyboard.press("Control+End");
  await page.keyboard.type(HOOK_EDIT);
  await settle(page, 200);
  const edited = await read();
  kit.check(
    "1440 (fine), Configure › Hooks empty: the ask's words are the person's to edit (typed at their end, they read back with the edit), still nothing started",
    edited.text === `${HOOK_ASK}${HOOK_EDIT}`.trim() &&
      rows().length === before,
    JSON.stringify({ text: edited.text, after: rows().length })
  );
  await page.keyboard.press("Escape");
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
    await railLeg(kit, base);
    await emptyAskLeg(kit, base, rows);
    await keyStartLeg(kit, base, source);
    await spawnLinkLeg(kit, base, row(source)?.machine_id ?? "");
    await sizeLeg(kit, base, source);
    await depthLeg(kit, base, source, "light");
    await depthLeg(kit, base, source, "dark");
    await motionLeg(kit, base, source);
    await forkLeg(kit, base, fleet, rows);
    await liveMenuLeg(kit, base, fleet);
    const modeless = await stoppedSession(fleet, "Revives", null);
    await forkHereLeg(kit, base, modeless);
    await reviveLeg(kit, base, fleet, modeless, {
      why: "with no mode",
      line: "Choose a permission mode for this session, and the message goes.",
      words: "After the pick.",
    });
    await reviveLeg(
      kit,
      base,
      fleet,
      await stoppedSession(fleet, "Retired", "dontAsk"),
      {
        why: "on a mode its machine no longer takes (dontAsk)",
        line: "doesn't take dontAsk. Choose a mode it takes, and the message goes.",
        words: "After another pick.",
      }
    );
  },
};

export default spec;
