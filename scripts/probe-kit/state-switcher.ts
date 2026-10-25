/**
 * The design previews' shared state switcher (design-previews/
 * state-switcher.js), read from the engine on a preview's page: one check a
 * preview's spec runs once per engine.
 *
 * - Its font is the system stack (computed on the list and its buttons),
 *   never the product's.
 * - At a desk width it is a vertical list beside the stage: every group a
 *   `role="group"` whose heading carries the arrow, its buttons one under
 *   another on one left edge, exactly one pressed per axis (its groups
 *   together; one state: one in all), and the select hidden.
 * - At a narrow width the list is gone and a select stands above the stage.
 * - `H` hides it and `H` again shows it.
 *
 * The page is left at the width it was opened at.
 */
import type { Page } from "playwright-core";
import type { Kit } from "./kit";

const SYSTEM = [
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "sans-serif",
];

interface Read {
  buttonFonts: string[];
  font: string;
  groups: {
    arrowed: boolean;
    axis: string;
    buttons: number;
    pressed: number;
    stacked: boolean;
  }[];
  hidden: boolean;
  list: boolean;
  select: { shown: boolean; aboveStage: boolean };
}

function read(): Read {
  const nav = document.querySelector<HTMLElement>("nav.state-switcher");
  const selects = document.querySelector<HTMLElement>(
    ".state-switcher-selects"
  );
  const stage = document.querySelector<HTMLElement>(".state-stage");
  const shown = (el: Element | null | undefined) =>
    Boolean(
      el &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility === "visible"
    );
  const groups = [
    ...(nav?.querySelectorAll<HTMLElement>('[role="group"]') ?? []),
  ].map((group) => {
    const heading = document.getElementById(
      group.getAttribute("aria-labelledby") ?? ""
    );
    const buttons = [
      ...group.querySelectorAll<HTMLElement>("button[data-state]"),
    ];
    const boxes = buttons.map((b) => b.getBoundingClientRect());
    return {
      arrowed: Boolean(
        heading?.classList.contains("state-switcher-heading") &&
        heading.querySelector("svg path")
      ),
      axis: group.dataset.axis ?? "",
      buttons: buttons.length,
      pressed: buttons.filter((b) => b.getAttribute("aria-pressed") === "true")
        .length,
      stacked: boxes.every(
        (box, i) =>
          i === 0 ||
          (box.top >= (boxes[i - 1]?.bottom ?? 0) - 0.5 &&
            Math.abs(box.left - (boxes[0]?.left ?? 0)) < 0.5)
      ),
    };
  });
  const select = selects?.querySelector("select");
  return {
    font: nav ? getComputedStyle(nav).fontFamily : "",
    buttonFonts: [
      ...new Set(
        [...(nav?.querySelectorAll("button") ?? [])].map(
          (b) => getComputedStyle(b).fontFamily
        )
      ),
    ],
    groups,
    list:
      shown(nav) &&
      getComputedStyle(nav as HTMLElement).flexDirection === "column",
    hidden: Boolean(
      nav?.closest(".state-page")?.hasAttribute("data-switcher-hidden") &&
      !shown(nav) &&
      !shown(select)
    ),
    select: {
      shown: shown(select),
      aboveStage: Boolean(
        select &&
        stage &&
        select.getBoundingClientRect().bottom <=
          stage.getBoundingClientRect().top + 0.5
      ),
    },
  };
}

/**
 * Picks a state as a person does: a press on its button in the list, or,
 * where the list gives way to the selects, its option in its group's select.
 * Resolves when the press or pick is made; it waits for nothing after it.
 */
export async function pickState(
  page: Page,
  group: string,
  value: string
): Promise<void> {
  const button = page.locator(
    `nav.state-switcher [data-group="${group}"] button[data-state="${value}"]`
  );
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  // Each option's value is its group and state, `["<group>","<state>"]`.
  const option = JSON.stringify([group, value]);
  await page
    .locator(`.state-switcher-selects select:has(option[value='${option}'])`)
    .selectOption(option);
}

const families = (font: string) =>
  font.split(",").map((one) => one.trim().replace(/^["']|["']$/g, ""));

/**
 * Reads the switcher at `desk` and at `narrow` widths and checks it. `axes`:
 * each group has one pressed state; else exactly one group has one.
 */
export async function checkSwitcher(
  kit: Kit,
  page: Page,
  engine: string,
  {
    axes,
    desk = 1440,
    narrow = 390,
  }: { axes: boolean; desk?: number; narrow?: number }
): Promise<void> {
  const was = page.viewportSize() ?? { width: 1440, height: 900 };
  const at = async (width: number) => {
    await page.setViewportSize({ width, height: was.height });
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    return await page.evaluate(read);
  };
  const wide = await at(desk);
  const fontOk =
    families(wide.font).join("|") === SYSTEM.join("|") &&
    wide.buttonFonts.every(
      (font) => families(font).join("|") === SYSTEM.join("|")
    );
  // Each axis (its groups together; one state: all of them) has one state pressed.
  const byAxis = new Map<string, number>();
  for (const g of wide.groups) {
    byAxis.set(
      axes ? g.axis : "",
      (byAxis.get(axes ? g.axis : "") ?? 0) + g.pressed
    );
  }
  const pressedOk = [...byAxis.values()].every((n) => n === 1);
  kit.check(
    `${engine}: the state switcher's font is the system stack (${wide.font})`,
    fontOk,
    JSON.stringify(wide.buttonFonts)
  );
  kit.check(
    `${engine}: at ${desk} the switcher is a vertical list of ${wide.groups.length} groups, each heading arrowed, its ${wide.groups.map((g) => g.buttons).join("+")} states stacked on one edge, ${axes ? "one pressed per axis" : "one pressed"}, the select hidden`,
    wide.list &&
      wide.groups.length > 0 &&
      wide.groups.every((g) => g.arrowed && g.stacked && g.buttons > 0) &&
      pressedOk &&
      !wide.select.shown,
    JSON.stringify(wide)
  );
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur?.()
  );
  await page.keyboard.press("h");
  const gone = await page.evaluate(read);
  await page.keyboard.press("h");
  const back = await page.evaluate(read);
  kit.check(
    `${engine}: H hides the switcher and H again shows it`,
    gone.hidden && !back.hidden && back.list,
    JSON.stringify({ gone, back })
  );
  const small = await at(narrow);
  kit.check(
    `${engine}: at ${narrow} the list is gone and a select stands above the stage`,
    !small.list && small.select.shown && small.select.aboveStage,
    JSON.stringify(small)
  );
  await page.setViewportSize(was);
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
}
