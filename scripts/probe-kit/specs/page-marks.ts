/**
 * Each state a rule reads on the document's root, its body or a floating
 * wrapper is an attribute the component holding it writes (page-marks.ts),
 * not a `:has()` asked of the page: a `:has()` there restyled its subject
 * for every element put in under it (tab-return 2d, a morph's letters:
 * "Affected by :has() on HTML 86x").
 *
 *   bun scripts/probe-kit/run.ts page-marks
 *
 * The attribute holds exactly when the `:has()` it replaced would match. On
 * a scratch fleet with two sessions in one pane, through the flows that make
 * each state (the desk's bar hosting the tabs and a tab's hanging card
 * gliding to its neighbour; the phone's floating bar, its sidebar sheet, and
 * the new-session sheet rising and leaving with its scrim and its pickers),
 * every animation frame asks each replaced selector and its attribute of the
 * root, the body and every floating wrapper, and the two must agree in every
 * frame. Asserted per pair: no frame where they differ; and that the flows
 * made the state at all, for each pair a flow here makes (the lightbox's
 * needs a picture in a turn, and is read from the code instead).
 *
 * At each checkpoint it writes what those rules set (the edges' properties
 * on the root, the body's presses, the strips, each wrapper's cut, layer
 * and glide, the sheet's scrim exit) to `computed.json`, to compare with
 * the same run on a tree that still asks with `:has()`.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import type { Reply, Seen } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import { startsWith } from "../words";

/** A replaced selector and the attribute that says the same, on one kind of element. */
interface Pair {
  /** A flow here makes the state: the pair must have matched in some frame. */
  made: boolean;
  name: string;
  now: string;
  old: string;
  on: "root" | "body" | "wrapper";
}

const WRAPPER = "[data-bits-floating-content-wrapper]";
/** The kit's scrims, each marking the root with `scrimMark` (cawco/page-marks). */
const SCRIM =
  ':is([data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"], [data-slot="drawer-overlay"], [data-slot="sheet-overlay"])';
const NEW_SESSION = /^(New session|Start session)$/;
const PROJECT_CHIP = /^Project:/;
const PERMISSION_MODE = startsWith(spawnWords.permissionModeHead);
const PAIRS: Pair[] = [
  {
    name: "bar floating",
    on: "root",
    old: ':root:has(> body > div > [data-slot="shell"] > [data-slot="shell-main"] > [data-slot="top"][data-floating])',
    now: ':root[data-bar~="floating"]',
    made: true,
  },
  {
    name: "bar hosting",
    on: "root",
    old: ':root:has(> body > div > [data-slot="shell"] > [data-slot="shell-main"] > [data-slot="top"][data-hosting])',
    now: ':root[data-bar~="hosting"]',
    made: true,
  },
  {
    name: "scrim open",
    on: "root",
    old: `:root:has(> body > ${SCRIM}[data-state="open"])`,
    now: ':root[data-scrim~="open"]',
    made: true,
  },
  {
    name: "scrim closed",
    on: "root",
    old: `:root:has(> body > ${SCRIM}[data-state="closed"])`,
    now: ':root[data-scrim~="closed"]',
    made: true,
  },
  {
    name: "lightbox open",
    on: "root",
    old: ":root:has(> body > .cawco-pswp.pswp--open)",
    now: ':root[data-scrim~="lightbox"]',
    made: false,
  },
  {
    name: "bottom sheet",
    on: "root",
    old: ':root:has(> body > [data-slot="drawer-content"][data-placed][data-vaul-drawer-direction="bottom"])',
    now: ':root[data-kit-sheet~="bottom"]',
    made: true,
  },
  {
    name: "side sheet",
    on: "root",
    old: ':root:has(> body > [data-slot="sheet-content"]:is([data-side="left"], [data-side="right"])[data-state="open"])',
    now: ':root[data-kit-sheet~="side"]',
    made: true,
  },
  {
    name: "sidebar sheet",
    on: "root",
    old: ':root:has(> body > [data-slot="sheet-content"][data-rail-sheet][data-state="open"])',
    now: ':root[data-kit-sheet~="rail"]',
    made: true,
  },
  {
    name: "drawer closing",
    on: "body",
    old: 'body:has(> [data-slot="drawer-content"][data-state="closed"])',
    now: 'body[data-drawer~="closed"]',
    made: true,
  },
  {
    name: "session card",
    on: "wrapper",
    old: `${WRAPPER}:has(> [data-session-details-popover])`,
    now: `${WRAPPER}[data-session-details]`,
    made: true,
  },
  {
    name: "session card glide",
    on: "wrapper",
    old: `${WRAPPER}:has(> [data-session-details-popover][data-morph])`,
    now: `${WRAPPER}[data-details-morph]`,
    made: true,
  },
  {
    name: "picker glide",
    on: "wrapper",
    old: `${WRAPPER}:has(> [data-ns-pop][data-morph])`,
    now: `${WRAPPER}[data-ns-morph]`,
    made: true,
  },
];

/** What each pair read over the frames: how often each side matched, and the frames they differed. */
interface Tally {
  differed: string[];
  frames: number;
  now: number;
  old: number;
}

/** Starts the frame sampler: every animation frame asks each pair of its elements. */
const watch = (page: Page) =>
  page.evaluate(
    ({ pairs, wrapper }) => {
      const w = window as unknown as {
        __marks: Record<
          string,
          { differed: string[]; frames: number; now: number; old: number }
        >;
        __marksAt: string;
      };
      w.__marksAt = "start";
      w.__marks = Object.fromEntries(
        pairs.map((pair) => [
          pair.name,
          { differed: [], frames: 0, now: 0, old: 0 },
        ])
      );
      const subjects = (on: string): Element[] => {
        if (on === "root") {
          return [document.documentElement];
        }
        if (on === "body") {
          return [document.body];
        }
        return [...document.querySelectorAll(wrapper)];
      };
      const ask = (pair: (typeof pairs)[number], el: Element) => {
        const tally = w.__marks[pair.name];
        const old = el.matches(pair.old);
        const now = el.matches(pair.now);
        tally.old += old ? 1 : 0;
        tally.now += now ? 1 : 0;
        if (old !== now && tally.differed.length < 8) {
          tally.differed.push(
            `${w.__marksAt}: ${pair.old} ${old}, ${pair.now} ${now} on ${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`
          );
        }
      };
      const sample = () => {
        for (const pair of pairs) {
          w.__marks[pair.name].frames += 1;
          for (const el of subjects(pair.on)) {
            ask(pair, el);
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { pairs: PAIRS, wrapper: WRAPPER }
  );

const at = (page: Page, step: string) =>
  page.evaluate((name) => {
    (window as unknown as { __marksAt: string }).__marksAt = name;
  }, step);

const tallies = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __marks: Record<string, Tally> }).__marks
  );

/** What the swapped rules set, read where they land. */
const computed = (page: Page) =>
  page.evaluate((wrapper) => {
    const read = (el: Element | null, props: string[]) => {
      if (!el) {
        return null;
      }
      const style = getComputedStyle(el);
      return Object.fromEntries(
        props.map((prop) => [prop, style.getPropertyValue(prop).trim()])
      );
    };
    const edge = [
      "--edge-top-under",
      "--edge-bottom-under",
      "--edge-top-background",
      "--edge-bottom-background",
      "--edge-top-fade",
      "--edge-bottom-fade",
      "--edge-shown",
      "--edge-show-fade",
      "background-color",
    ];
    const strip = ["background-color", "opacity", "transition"];
    const wrappers = [...document.querySelectorAll(wrapper)].map((el) => ({
      holds: el.firstElementChild?.className.toString() ?? "",
      style: read(el, ["clip-path", "will-change", "transition"]),
    }));
    return {
      root: read(document.documentElement, edge),
      body: read(document.body, ["pointer-events", "background-color"]),
      top: read(document.querySelector('[data-slot="edge-top"]'), strip),
      bottom: read(document.querySelector('[data-slot="edge-bottom"]'), strip),
      wrappers,
      overlays: [...document.querySelectorAll("[data-vaul-overlay]")].map(
        (el) =>
          read(el, [
            "animation-name",
            "animation-duration",
            "animation-timing-function",
          ])
      ),
    };
  }, WRAPPER);

const respond = (request: Seen): Reply =>
  request.tools
    ? { everyMs: 5, words: ["Done."] }
    : { everyMs: 1, words: ["Page marks"] };

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
  const alpha = await fleet.spawn("claude", "Alpha");
  await fleet.send(alpha, "hello");
  const beta = await fleet.spawn("claude", "Beta");
  await fleet.send(beta, "hello");
  const base = await fleet.dashboard();

  const checkpoints: Record<string, unknown> = {};
  const all: Record<string, Tally> = Object.fromEntries(
    PAIRS.map((pair) => [
      pair.name,
      { differed: [], frames: 0, now: 0, old: 0 },
    ])
  );
  const keep = async (page: Page, name: string) => {
    await settle(page);
    await page.waitForTimeout(400);
    checkpoints[name] = await computed(page);
  };
  const gather = async (page: Page) => {
    for (const [name, tally] of Object.entries(await tallies(page))) {
      const into = all[name];
      into.frames += tally.frames;
      into.old += tally.old;
      into.now += tally.now;
      into.differed.push(...tally.differed);
    }
  };
  /** A page on `view` with both sessions in its one pane, `shown` in front. */
  const pane = async (view: "desk" | "phone", shown: string) => {
    const page = await kit.page(view);
    await page.addInitScript(
      ([tabs, active]) => {
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: { t: "l", id: "pone", tabs, active, opened: null },
            focusedLeaf: "pone",
          })
        );
      },
      [[alpha, beta], shown] as const
    );
    await open(page, `${base}/session/${shown}`, "[data-session-tab]", 120_000);
    await watch(page);
    return page;
  };

  // The desk: the bar hosts the tabs; a tab's card hangs from it and glides
  // to its neighbour.
  const desk = await pane("desk", alpha);
  await at(desk, "desk session");
  await keep(desk, "desk session");
  const tab = (page: Page, id: string) =>
    page
      .locator(`[data-session-tab="${id}"]`)
      .filter({ visible: true })
      .first();
  await at(desk, "desk card");
  await tab(desk, beta).hover();
  await desk.waitForSelector("[data-session-details-popover]", {
    timeout: 10_000,
  });
  await keep(desk, "desk card");
  await at(desk, "desk card glide");
  await tab(desk, alpha).hover();
  await desk.waitForTimeout(800);
  await keep(desk, "desk card moved");
  await at(desk, "desk card away");
  await desk.mouse.move(700, 600);
  await desk.keyboard.press("Escape");
  await desk.waitForTimeout(800);
  await keep(desk, "desk card gone");
  await gather(desk);
  await desk.close();

  // The phone: the floating bar, the sidebar's sheet, and the new-session
  // sheet with its pickers, each in and out.
  const phone = await pane("phone", alpha);
  await at(phone, "phone session");
  await keep(phone, "phone session");
  await at(phone, "phone sidebar");
  await phone
    .getByRole("button", { name: sidebarWords.openNavigation })
    .click();
  await phone.waitForSelector('[data-rail-sheet][data-state="open"]');
  await keep(phone, "phone sidebar");
  await at(phone, "phone sidebar leaving");
  await phone.keyboard.press("Escape");
  await phone.waitForTimeout(1000);
  await keep(phone, "phone sidebar gone");
  await gather(phone);
  await phone.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
  await watch(phone);
  await at(phone, "phone new session");
  await phone
    .getByRole("button", { name: NEW_SESSION })
    .filter({ visible: true })
    .first()
    .click();
  const card = phone.getByRole("dialog", { name: "New Session" });
  await card.waitFor();
  await keep(phone, "phone new session");
  await at(phone, "phone pickers");
  await card.getByRole("button", { name: PROJECT_CHIP }).click();
  await phone.waitForTimeout(500);
  await card
    .getByRole("button", { name: PERMISSION_MODE })
    .click({ force: true });
  await phone.waitForTimeout(800);
  await keep(phone, "phone pickers");
  await phone.keyboard.press("Escape");
  await phone.waitForTimeout(500);
  await at(phone, "phone sheet leaving");
  await phone.keyboard.press("Escape");
  await phone.waitForTimeout(1200);
  await keep(phone, "phone sheet gone");
  await gather(phone);

  await writeFile(
    join(kit.out, "computed.json"),
    `${JSON.stringify(checkpoints, null, 2)}\n`
  );
  for (const pair of PAIRS) {
    const tally = all[pair.name];
    kit.check(
      `${pair.name}: ${pair.now} holds in every frame ${pair.old} matches, and in no other`,
      tally.differed.length === 0,
      `${tally.frames} frames, the selector matched ${tally.old} times, the attribute ${tally.now}${tally.differed.length ? `; ${tally.differed.join("; ")}` : ""}`
    );
    if (pair.made) {
      kit.check(
        `${pair.name}: the flows made the state`,
        tally.old > 0,
        `${tally.old} matches of ${pair.old}`
      );
    }
  }
};

const spec: Spec = { name: "page-marks", run };
export default spec;
