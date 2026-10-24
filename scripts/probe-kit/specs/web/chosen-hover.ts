/**
 * A chosen or current item never looks the same as a hovered one, in either
 * scheme. `surface-fill` and `surface-hover` are one step by day, so a
 * control that marked its chosen state with the one and hovered with the
 * other drew both alike in light mode.
 *
 * On the /motion/chosen-hover bench at 1440, light and dark, for each
 * control: the computed background of its chosen item, and of an unchosen
 * item under the pointer, differ (as sRGB through a canvas), and the chosen
 * one is DESIGN.md's recipe for it, resolved in the same page: a list's
 * chosen row the selection wash (`selected-bg`, Colors: Selected; the kit's
 * selection pill), a pressed toggle the kit Toggle's on step
 * (`surface-pressed`). The wash comes with
 * its ink (DESIGN.md Colors: Selected; the kit's selected row,
 * `text-selected-ink`): a washed row's label is `selected-ink`, and every
 * text in the row holds 4.5:1 on the wash.
 *
 * A row in the new-session popovers hovers by the list's ghost
 * (components/ui/highlight), moved by the pointer: there the pointer rests
 * on the unchosen row and the ghost's fill is read. Every other control
 * hovers by `:hover`, forced on the unchosen item through the DevTools
 * protocol (`CSS.forcePseudoState`), the pointer away.
 *
 * The canvas's tool rail (DESIGN.md, The tool rail): its chosen tool is on
 * the kit Toggle's on step, a hovered unchosen tool differs from it, the
 * chosen tool's glyph is `ink-strong` at 4.5:1 or more on that step and an
 * unchosen one's `ink-muted`. Its Shapes menu (DESIGN.md, Menu item): the
 * checked item has no fill, its label and tick in the item's own ink, an
 * unchosen item's tick unseen, and a hovered unchosen item takes
 * `surface-hover`. The canvas host is its own
 * bundle, whose sheet styles html and body, so the rail is drawn on a page of
 * its own from the sheets the host loads: the decision-page kit's tokens as
 * written (host.tsx) and the host.css the hub serves (canvas.css raw would
 * miss what its compile changes: a `light-dark()` Bun once lowered there drew no fill), in
 * the host's scheme (`color-scheme` on the root, as host.tsx sets it). The
 * rail's material is translucent: each
 * ground is painted as it stacks (the canvas's surface-raised, the rail's
 * material, the box), its backdrop's blur and saturation left out, which
 * over the flat raised ground changes nothing measurable.
 *
 * A state stays drawn under the pointer where its utility used to lose to
 * the hover's on weight alone (the house's specificity-trap lint): a chosen
 * option chip that is a button keeps `surface-recess` with `:hover`
 * forced, and the split's handle mid-drag (`data-active`) keeps
 * `ink-muted`. A ringed side well (`data-ringed`) inside a sliding split
 * (`data-split-sliding`) runs the slide's transition, not the ring's (its
 * own comment: "the ring easing in and out except while the split slides").
 *
 * Caw's panel's section rule (DESIGN.md, Caw's panel), on the
 * /motion/caw-notices bench with both sections: solid `brand-solid`, and
 * 3:1 or more against the raised panel (`surface-raised`).
 *
 *   bun scripts/probe-kit/run.ts web chosen-hover
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { buildCanvasHost } from "../../../../packages/core/src/canvas-host";
import type { Kit, Spec } from "../../kit";
import { open, ROOT, settle, THEMES } from "../../kit";

const WASH = "var(--selected-bg)";
const ON_STEP = "var(--surface-pressed)";

interface Control {
  /** The element painting the chosen state's background. */
  chosen: string;
  /** The bench's `?control=`, for a popover that opens on it. */
  control?: string;
  /** How the unchosen item hovers. */
  hover: "ghost" | "force";
  name: string;
  /**
   * On the wash: the chosen row whose every text is read against it, and its
   * label, which takes the wash's paired ink (`selected-ink`), and its glyph,
   * when it draws one, in `selected-icon`.
   */
  onWash?: { icon?: string; label: string; row: string };
  /** The unchosen item. */
  other: string;
  /** Steps that bring the chosen item on screen (the slash menu's `/`). */
  prepare?: (page: Page) => Promise<void>;
  /** Read the background of `::before`, where the control paints it. */
  pseudo?: "::before";
  /** What stands once the bench has drawn the control; the chosen item if unset. */
  ready?: string;
  /** DESIGN's background for the chosen item. */
  recipe: string;
}

const POP = "[data-ns-pop]";
const SLASH = '[data-probe="slash"] .milkdown-slash-menu';

const CONTROLS: Control[] = [
  {
    name: "Session lifetime row",
    control: "lifetime",
    hover: "ghost",
    recipe: WASH,
    chosen: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
    other: "[data-ns-pop] [data-slot='row'][aria-pressed='false']",
    onWash: {
      row: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
      label:
        '[data-ns-pop] [data-slot="row"][aria-pressed="true"] [data-slot="name"]',
    },
  },
  {
    name: "Project row",
    control: "project",
    hover: "ghost",
    recipe: WASH,
    chosen: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
    other: "[data-ns-pop] [data-slot='row'][aria-pressed='false']",
    onWash: {
      row: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
      label:
        '[data-ns-pop] [data-slot="row"][aria-pressed="true"] [data-slot="name"]',
    },
  },
  {
    name: "Machine row",
    control: "machines",
    hover: "ghost",
    recipe: WASH,
    chosen: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
    other: "[data-ns-pop] [data-slot='row'][aria-pressed='false']",
    onWash: {
      row: '[data-ns-pop] [data-slot="row"][aria-pressed="true"]',
      label:
        '[data-ns-pop] [data-slot="row"][aria-pressed="true"] [data-slot="name"]',
    },
  },
  {
    name: "Permission mode row",
    hover: "ghost",
    recipe: WASH,
    chosen: '[data-probe="permission"] [data-slot="fill"]',
    other: '[data-probe="permission"] [role="radio"][aria-checked="false"]',
    onWash: {
      row: '[data-probe="permission"] [role="radio"][aria-checked="true"]',
      label:
        '[data-probe="permission"] [role="radio"][aria-checked="true"] [data-slot="name"]',
    },
  },
  {
    name: "Side panel's pressed head button",
    hover: "force",
    recipe: ON_STEP,
    chosen: '[data-probe="side"] button[aria-pressed="true"]',
    other: '[data-probe="side"] button[aria-pressed="false"]',
  },
  {
    name: "Kit Toggle",
    hover: "force",
    recipe: ON_STEP,
    chosen: '[data-probe="toggle"] button[aria-pressed="true"]',
    other: '[data-probe="toggle"] button[aria-pressed="false"]',
  },
  {
    name: "Plan ring",
    hover: "force",
    recipe: ON_STEP,
    chosen: '[data-probe="plan-ring"] button[aria-pressed="true"]',
    other: '[data-probe="plan-ring"] button[aria-pressed="false"]',
    pseudo: "::before",
  },
  {
    name: "Comments list's current pin",
    hover: "force",
    recipe: WASH,
    chosen: '[data-probe="pins"] [data-slot="pin-row"][aria-current="true"]',
    other: '[data-probe="pins"] [data-slot="pin-row"]:not([aria-current])',
    onWash: {
      row: '[data-probe="pins"] [data-slot="pin-row"][aria-current="true"]',
      label:
        '[data-probe="pins"] [data-slot="pin-row"][aria-current="true"] [data-slot="title"]',
    },
  },
  {
    name: "Model row",
    hover: "ghost",
    recipe: WASH,
    chosen: '[data-probe="model"] [data-slot="list"] > [data-slot="fill"]',
    other: '[data-probe="model"] [role="option"][aria-selected="false"]',
    ready: '[data-probe="model"] [role="option"][aria-selected="true"]',
    onWash: {
      row: '[data-probe="model"] [role="option"][aria-selected="true"]',
      label:
        '[data-probe="model"] [role="option"][aria-selected="true"] [data-slot="name"]',
    },
  },
  {
    name: "Slash menu's group tab",
    hover: "force",
    recipe: WASH,
    chosen: `${SLASH} .tab-group li.selected`,
    other: `${SLASH} .tab-group li:not(.selected)`,
    ready: '[data-probe="slash"] .milkdown .ProseMirror',
    prepare: async (page) => {
      await page.click('[data-probe="slash"] .milkdown .ProseMirror');
      await page.keyboard.type("/");
      await page.waitForSelector(`${SLASH} .tab-group li.selected`, {
        state: "visible",
      });
    },
    onWash: {
      row: `${SLASH} .tab-group li.selected`,
      label: `${SLASH} .tab-group li.selected`,
    },
  },
  {
    name: "A Caw reply's current file chip",
    control: "files",
    hover: "force",
    recipe: WASH,
    ready: '[data-probe="files"] [data-folder-chip][aria-current="page"]',
    chosen: '[data-probe="files"] [data-folder-chip][aria-current="page"]',
    other: '[data-probe="files"] [data-folder-chip]:not([aria-current])',
    onWash: {
      row: '[data-probe="files"] [data-folder-chip][aria-current="page"]',
      label:
        '[data-probe="files"] [data-folder-chip][aria-current="page"] [data-slot="path"]',
      icon: '[data-probe="files"] [data-folder-chip][aria-current="page"] [data-slot="file-icon"]',
    },
  },
];

interface Read {
  color: string;
  rgb: number[];
}

/** An element's computed background (or its pseudo's), and that colour as sRGB bytes. */
function readBackground(
  page: Page,
  selector: string,
  pseudo: string | null
): Promise<Read | null> {
  return page.evaluate(
    ([sel, pse]) => {
      const el = document.querySelector(sel);
      if (!el) {
        return null;
      }
      const color = getComputedStyle(el, pse).backgroundColor;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const pen = canvas.getContext("2d");
      if (!pen) {
        return null;
      }
      pen.fillStyle = color;
      pen.fillRect(0, 0, 1, 1);
      return { color, rgb: [...pen.getImageData(0, 0, 1, 1).data] };
    },
    [selector, pseudo] as const
  );
}

/** A value's background as the page resolves it, from a scratch element in the bench. */
function resolve(page: Page, value: string): Promise<Read | null> {
  return page.evaluate((background) => {
    const probe = document.createElement("div");
    probe.id = "chosen-hover-recipe";
    probe.style.background = background;
    document.querySelector("[data-bench]")?.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const pen = canvas.getContext("2d");
    if (!pen) {
      return null;
    }
    pen.fillStyle = color;
    pen.fillRect(0, 0, 1, 1);
    return { color, rgb: [...pen.getImageData(0, 0, 1, 1).data] };
  }, value);
}

/** Forces `:hover` on the first element `selector` finds; returns the release. */
async function forceHover(
  cdp: CDPSession,
  selector: string
): Promise<() => Promise<void>> {
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  await cdp.send("CSS.forcePseudoState", {
    nodeId,
    forcedPseudoClasses: ["hover"],
  });
  return async () => {
    await cdp.send("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: [],
    });
  };
}

/**
 * The unchosen item's background under the pointer: the list ghost's fill
 * with the pointer resting on the row (and the ghost's opacity), or the
 * item's own with `:hover` forced.
 */
async function readHovered(
  page: Page,
  cdp: CDPSession,
  c: Control
): Promise<{ hovered: Read | null; ghostShown: string | null }> {
  if (c.hover === "force") {
    const release = await forceHover(cdp, c.other);
    await settle(page, 400);
    const hovered = await readBackground(page, c.other, c.pseudo ?? null);
    await release();
    return { hovered, ghostShown: null };
  }
  await page.hover(c.other);
  await settle(page, 400);
  // The ghost of the list the unchosen row stands in.
  const ghostShown = await page.evaluate((other) => {
    const row = document.querySelector(other);
    const list = row?.closest("[data-highlight]");
    const ghost = list?.querySelector(':scope > [data-slot="highlight-ghost"]');
    if (!ghost) {
      return null;
    }
    ghost.setAttribute("data-chosen-hover-ghost", "");
    return getComputedStyle(ghost).opacity;
  }, c.other);
  const hovered = await readBackground(page, "[data-chosen-hover-ghost]", null);
  return { hovered, ghostShown };
}

interface Ink {
  color: string;
  rgb: number[];
  text: string;
}

/**
 * Every text in the chosen row (each element with words of its own) and its
 * label: their computed ink, as sRGB bytes.
 */
function readInks(
  page: Page,
  onWash: { icon?: string; label: string; row: string }
): Promise<{ icon: Ink | null; label: Ink | null; texts: Ink[] }> {
  return page.evaluate(({ icon, label, row }) => {
    const ink = (el: Element): Ink | null => {
      const { color } = getComputedStyle(el);
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const pen = canvas.getContext("2d");
      if (!pen) {
        return null;
      }
      pen.fillStyle = color;
      pen.fillRect(0, 0, 1, 1);
      const own = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      return { color, rgb: [...pen.getImageData(0, 0, 1, 1).data], text: own };
    };
    const root = document.querySelector(row);
    // Words on a ground of their own inside the row (a pin's disc) stand
    // on that ground, not on the wash.
    const onOwnGround = (el: Element): boolean => {
      for (let at: Element | null = el; at && at !== root;) {
        const bg = getComputedStyle(at).backgroundColor;
        if (bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          return true;
        }
        at = at.parentElement;
      }
      return false;
    };
    const texts = root
      ? [root, ...root.querySelectorAll("*")]
          .filter((el) => !onOwnGround(el))
          .map(ink)
          .filter((one): one is Ink => one !== null && one.text.length > 0)
      : [];
    const labelEl = document.querySelector(label);
    const iconEl = icon ? document.querySelector(icon) : null;
    return {
      icon: iconEl ? ink(iconEl) : null,
      label: labelEl ? ink(labelEl) : null,
      texts,
    };
  }, onWash);
}

/** The relative luminance's contrast ratio (WCAG 2) of two sRGB colours. */
function ratio(a: number[], b: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (p: number[]) =>
    0.2126 * lin(p[0] ?? 0) + 0.7152 * lin(p[1] ?? 0) + 0.0722 * lin(p[2] ?? 0);
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The chosen row's words on the wash: its label in `selected-ink`, and every
 * text 4.5:1 or more against the wash.
 */
async function checkInks(
  kit: Kit,
  page: Page,
  theme: string,
  c: Control,
  wash: Read | null
): Promise<void> {
  if (!c.onWash) {
    return;
  }
  const { icon, label, texts } = await readInks(page, c.onWash);
  const paired = await resolve(page, "var(--selected-ink)");
  const iconInk = await resolve(page, "var(--selected-icon)");
  const iconOk =
    !c.onWash.icon ||
    (icon !== null && iconInk !== null && same(icon.rgb, iconInk.rgb));
  const measured = texts.map((one) => ({
    text: one.text.slice(0, 24),
    ink: one.color,
    ratio: wash ? Math.round(ratio(one.rgb, wash.rgb) * 100) / 100 : 0,
  }));
  kit.check(
    `${theme}: ${c.name}: its label takes selected-ink${c.onWash.icon ? ", its glyph selected-icon," : ""} and every text on the wash holds 4.5:1`,
    iconOk &&
      wash !== null &&
      label !== null &&
      paired !== null &&
      same(label.rgb, paired.rgb) &&
      measured.length > 0 &&
      measured.every((one) => one.ratio >= 4.5),
    JSON.stringify({
      label: label?.color,
      selectedInk: paired?.color,
      ...(c.onWash.icon
        ? { icon: icon?.color, selectedIcon: iconInk?.color }
        : {}),
      measured,
    })
  );
}

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((c, i) => Math.abs(c - (b[i] ?? 0)) <= 1);

/**
 * The sheets the canvas host loads, as it loads them: the kit's tokens as
 * written (host.tsx sets them unbundled) and the host's own sheet as
 * Lightning CSS compiles it (canvas-host.ts `buildCanvasHost`, minified at
 * the product's CSS floor, as the hub serves it), never canvas.css raw.
 */
const railSheets = async (): Promise<string[]> => {
  const sheet = (await buildCanvasHost()).get("host.css");
  if (!sheet) {
    throw new Error("the canvas host's bundle has no host.css");
  }
  return [
    readFileSync(
      join(ROOT, "packages/hub/skills/decision-page/kit/tokens.css"),
      "utf8"
    ),
    await sheet.text(),
  ];
};

/**
 * Two tools of the rail's tools group, the first chosen, and two items of a
 * radio menu, the first checked, as rail.tsx draws them.
 */
const RAIL_PAGE = (scheme: string, sheets: string[]) => `<!doctype html>
<html data-canvas-inset style="color-scheme: ${scheme}">
<head>${sheets.map((sheet) => `<style>${sheet}</style>`).join("")}</head>
<body><div id="canvas-root"><div class="canvas-host">
  <div aria-label="Tools" class="rail rail-tools" role="toolbar">
    <button class="rail-box" data-chosen data-probe="chosen" type="button"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 4h16v16H4z" fill="currentColor"/></svg></button>
    <button class="rail-box" data-probe="other" type="button"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 4h16v16H4z" fill="currentColor"/></svg></button>
  </div>
  <div class="rail-menu" role="menu">
    <button aria-checked="true" class="rail-item" data-probe="item-on" role="menuitemradio" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 4h16v16H4z" fill="currentColor"/></svg><span class="rail-item-label">Rectangle</span><span class="rail-item-hint">4</span><span class="rail-item-tick" data-on="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button>
    <button aria-checked="false" class="rail-item" data-probe="item-off" role="menuitemradio" type="button"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 4h16v16H4z" fill="currentColor"/></svg><span class="rail-item-label">Ellipse</span><span class="rail-item-hint">5</span><span class="rail-item-tick" data-on="false"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button>
  </div>
</div></div></body></html>`;

/**
 * The colours of `selectors`' backgrounds (each `null` entry a value to
 * resolve instead) painted one over the next on one pixel, as they stack:
 * the sRGB bytes the eye gets where the last one is.
 */
function paintStack(
  page: Page,
  layers: { selector?: string; value?: string }[]
): Promise<{ colors: string[]; rgb: number[] }> {
  return page.evaluate((stack) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const pen = canvas.getContext("2d");
    const colors: string[] = [];
    for (const layer of stack) {
      let color = "transparent";
      if (layer.selector) {
        const el = document.querySelector(layer.selector);
        color = el ? getComputedStyle(el).backgroundColor : "transparent";
      } else if (layer.value) {
        const probe = document.createElement("div");
        probe.style.background = layer.value;
        document.body.append(probe);
        color = getComputedStyle(probe).backgroundColor;
        probe.remove();
      }
      colors.push(color);
      if (pen) {
        pen.fillStyle = color;
        pen.fillRect(0, 0, 1, 1);
      }
    }
    return {
      colors,
      rgb: pen ? [...pen.getImageData(0, 0, 1, 1).data] : [],
    };
  }, layers);
}

/**
 * The rail's chosen tool: the Toggle's on step, not its hover, its glyph
 * strong on it; and its menu's checked item: no fill, the item's own ink.
 */
async function checkRail(
  kit: Kit,
  theme: string,
  cdp: CDPSession,
  page: Page,
  sheets: string[]
): Promise<void> {
  await page.setContent(RAIL_PAGE(theme, sheets));
  await page.mouse.move(1, 1);
  await settle(page, 400);
  const host = { selector: ".canvas-host" };
  const rail = { selector: ".rail-tools" };
  const chosen = await paintStack(page, [
    host,
    rail,
    { selector: '[data-probe="chosen"]' },
  ]);
  const recipe = await paintStack(page, [host, rail, { value: ON_STEP }]);
  // The glyphs' inks at rest, before any hover moves them.
  const inks = await page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).color : null;
    };
    return {
      chosen: read('[data-probe="chosen"]'),
      other: read('[data-probe="other"]'),
    };
  });
  const release = await forceHover(cdp, '[data-probe="other"]');
  await settle(page, 400);
  const hovered = await paintStack(page, [
    host,
    rail,
    { selector: '[data-probe="other"]' },
  ]);
  await release();
  const strong = await paintStack(page, [{ value: "var(--ink-strong)" }]);
  const muted = await paintStack(page, [{ value: "var(--ink-muted)" }]);
  const chosenInk = inks.chosen
    ? (await paintStack(page, [{ value: inks.chosen }])).rgb
    : [];
  const otherInk = inks.other
    ? (await paintStack(page, [{ value: inks.other }])).rgb
    : [];
  const onFill = Math.round(ratio(chosenInk, chosen.rgb) * 100) / 100;
  kit.check(
    `${theme}: Canvas rail's chosen tool: chosen differs from a hovered unchosen tool and is DESIGN's Toggle on step`,
    same(chosen.rgb, recipe.rgb) && !same(chosen.rgb, hovered.rgb),
    JSON.stringify({
      chosen: chosen.colors.at(-1),
      chosenRgb: chosen.rgb.join(","),
      hovered: hovered.colors.at(-1),
      hoveredRgb: hovered.rgb.join(","),
      recipe: recipe.colors.at(-1),
    })
  );
  kit.check(
    `${theme}: Canvas rail's chosen tool's glyph is ink-strong at 4.5:1 on its fill, an unchosen one's ink-muted`,
    same(chosenInk, strong.rgb) && same(otherInk, muted.rgb) && onFill >= 4.5,
    JSON.stringify({
      chosenGlyph: inks.chosen,
      inkStrong: strong.colors[0],
      otherGlyph: inks.other,
      inkMuted: muted.colors[0],
      chosenRgb: chosen.rgb.join(","),
      glyphOnFill: onFill,
    })
  );

  // The Shapes menu: the checked item and an unchosen one under the pointer.
  const item = await page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) {
        return null;
      }
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        color: style.color,
        opacity: style.opacity,
      };
    };
    return {
      on: read('[data-probe="item-on"]'),
      onLabel: read('[data-probe="item-on"] .rail-item-label'),
      onTick: read('[data-probe="item-on"] .rail-item-tick'),
      onTickSvg: read('[data-probe="item-on"] .rail-item-tick svg'),
      offTick: read('[data-probe="item-off"] .rail-item-tick'),
    };
  });
  const releaseItem = await forceHover(cdp, '[data-probe="item-off"]');
  await settle(page, 400);
  const itemHovered = await paintStack(page, [
    { selector: '[data-probe="item-off"]' },
  ]);
  await releaseItem();
  const hoverStep = await paintStack(page, [{ value: "var(--surface-hover)" }]);
  const clear = (bg: string | undefined) =>
    bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
  kit.check(
    `${theme}: Canvas rail's Shapes menu: the checked item has no fill, its label and tick in the item's own ink; a hovered unchosen item takes surface-hover`,
    item.on !== null &&
      clear(item.on.background) &&
      item.onLabel?.color === item.on.color &&
      item.onTickSvg?.color === item.on.color &&
      item.onTick?.opacity === "1" &&
      item.offTick?.opacity === "0" &&
      same(itemHovered.rgb, hoverStep.rgb),
    JSON.stringify({
      ...item,
      hovered: itemHovered.colors[0],
      surfaceHover: hoverStep.colors[0],
    })
  );
}

/** Caw's panel's section rule: solid brand-solid, 3:1 against the raised panel. */
async function checkCawRule(
  kit: Kit,
  theme: string,
  page: Page,
  bench: string
): Promise<void> {
  const rule =
    ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) [data-slot="section"] + [data-slot="section"]';
  await open(page, `${bench}/motion/caw-notices?fixture=full`, rule);
  await settle(page, 400);
  const read = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return null;
    }
    const style = getComputedStyle(el);
    return {
      color: style.borderBlockStartColor,
      style: style.borderBlockStartStyle,
      width: style.borderBlockStartWidth,
    };
  }, rule);
  const drawn = read
    ? await paintStack(page, [
        { value: "var(--surface-raised)" },
        { value: read.color },
      ])
    : null;
  const brand = await paintStack(page, [{ value: "var(--brand-solid)" }]);
  const raised = await paintStack(page, [{ value: "var(--surface-raised)" }]);
  const contrast = drawn
    ? Math.round(ratio(drawn.rgb, raised.rgb) * 100) / 100
    : 0;
  kit.check(
    `${theme}: Caw's panel's section rule is 1px of solid brand-solid, 3:1 or more on the raised panel`,
    read !== null &&
      drawn !== null &&
      read.style === "solid" &&
      read.width === "1px" &&
      same(drawn.rgb, brand.rgb) &&
      contrast >= 3,
    JSON.stringify({
      rule: read,
      ruleRgb: drawn?.rgb.join(","),
      brandSolid: brand.colors[0],
      raised: raised.colors[0],
      contrast,
    })
  );
}

/** A state held under the pointer: chosen chip, dragged handle; and the ringed well's transition while the split slides. */
async function checkHeld(
  kit: Kit,
  theme: string,
  page: Page,
  cdp: CDPSession,
  bench: string
) {
  await open(
    page,
    `${bench}/motion/chosen-hover`,
    '[data-probe="split"] [data-slot="resizable-handle"]'
  );
  await page.mouse.move(1, 1);
  await settle(page, 400);
  const held = [
    {
      name: "a chosen option chip that is a button keeps surface-recess under the pointer",
      selector: '[data-probe="chip-chosen"] button',
      recipe: "var(--surface-recess)",
      state: null,
    },
    {
      name: "the split's handle mid-drag keeps ink-muted under the pointer",
      selector: '[data-probe="split"] [data-slot="resizable-handle"]',
      recipe: "var(--ink-muted)",
      state: "data-active",
    },
  ];
  for (const one of held) {
    if (one.state) {
      // biome-ignore lint/performance/noAwaitInLoops: one control at a time on one page
      await page.evaluate(
        ([sel, attr]) =>
          document.querySelector(sel)?.setAttribute(attr, "pointer"),
        [one.selector, one.state] as const
      );
    }
    const release = await forceHover(cdp, one.selector);
    await settle(page, 400);
    const read = await readBackground(page, one.selector, null);
    const recipe = await resolve(page, one.recipe);
    await release();
    kit.check(
      `${theme}: ${one.name}`,
      read !== null && recipe !== null && same(read.rgb, recipe.rgb),
      JSON.stringify({ read: read?.color, recipe: recipe?.color })
    );
  }
  const well = '[data-probe="side"] [data-side-well]';
  const transition = (slides: boolean) =>
    page.evaluate(
      ([sel, slide]) => {
        const el = document.querySelector<HTMLElement>(sel);
        const section = el?.closest("[data-probe]");
        if (!(el && section)) {
          return null;
        }
        el.setAttribute("data-ringed", "");
        section.toggleAttribute("data-split-sliding", slide);
        return getComputedStyle(el).transitionProperty;
      },
      [well, slides] as const
    );
  const still = await transition(false);
  const sliding = await transition(true);
  kit.check(
    `${theme}: a ringed side well eases its ring at rest and runs the slide's transition while the split slides`,
    still === "outline-color" &&
      sliding === "padding, border-radius, border-width, box-shadow",
    JSON.stringify({ still, sliding })
  );
}

const HALF = '[data-probe="half"]';

/**
 * A list's ghost and pill cover the whole row they mark, on a row sitting a
 * half pixel in and down (a message well's `ms-(--well-x)`), at device pixel
 * ratios 1 and 2 in Chromium and WebKit: each edge of each layer is the
 * row's edge put outward on the device-pixel grid (at 2 the row's own edge,
 * already on it), within 0.01px, so neither is ever narrower or shorter.
 */
async function checkHalf(kit: Kit, bench: string): Promise<void> {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const scale of [1, 2]) {
      // biome-ignore lint/performance/noAwaitInLoops: one engine and ratio at a time, each its own page
      const page = await kit.page("desk", { engine, scale });
      await open(page, `${bench}/motion/chosen-hover`, `${HALF} button`);
      await page.mouse.move(1, 1);
      await settle(page, 400);
      const other = `${HALF} button[aria-pressed="false"]`;
      const read = (layer: string) =>
        page.evaluate(
          ([row, slot, grid]) => {
            const rowEl = document.querySelector(row);
            const layerEl = document
              .querySelector(`${row.split(" ")[0]} [data-highlight]`)
              ?.querySelector(`:scope > [data-slot="${slot}"]`);
            if (!(rowEl && layerEl)) {
              return null;
            }
            const r = rowEl.getBoundingClientRect();
            const l = layerEl.getBoundingClientRect();
            const start = (v: number) => Math.floor(v * grid + 0.01) / grid;
            const end = (v: number) => Math.ceil(v * grid - 0.01) / grid;
            return {
              row: [r.left, r.top, r.right, r.bottom],
              want: [start(r.left), start(r.top), end(r.right), end(r.bottom)],
              layer: [l.left, l.top, l.right, l.bottom],
              shown: getComputedStyle(layerEl).opacity,
            };
          },
          [
            layer === "highlight-ghost"
              ? other
              : `${HALF} button[aria-pressed="true"]`,
            layer,
            scale,
          ] as const
        );
      const judge = (name: string, got: Awaited<ReturnType<typeof read>>) => {
        const fits =
          got !== null &&
          got.shown === "1" &&
          got.layer.every(
            (edge, i) => Math.abs(edge - (got.want[i] ?? Number.NaN)) <= 0.01
          ) &&
          // and it covers the row: never inside it
          got.layer[0] <= got.row[0] + 0.01 &&
          got.layer[1] <= got.row[1] + 0.01 &&
          got.layer[2] >= got.row[2] - 0.01 &&
          got.layer[3] >= got.row[3] - 0.01;
        kit.check(
          `${engine} at ${scale}x: a ${name} on a row a half pixel in covers it, each edge on the row's own put outward on the device-pixel grid`,
          fits,
          JSON.stringify(got)
        );
      };
      await page.hover(other);
      await settle(page, 400);
      judge("hovered row's ghost", await read("highlight-ghost"));
      await page.click(other);
      await page.mouse.move(1, 1);
      await settle(page, 400);
      judge("chosen row's pill", await read("highlight-pill"));
    }
  }
}

const spec: Spec = {
  name: "chosen-hover",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    await checkHalf(kit, bench);
    const sheets = await railSheets();
    for (const theme of THEMES) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
      const page = await kit.page("desk", { theme });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      for (const c of CONTROLS) {
        const query = c.control ? `?control=${c.control}` : "";
        // biome-ignore lint/performance/noAwaitInLoops: one control at a time on one page
        await open(
          page,
          `${bench}/motion/chosen-hover${query}`,
          c.ready ?? (c.control ? `${POP} [data-slot="row"]` : c.chosen)
        );
        await page.mouse.move(1, 1);
        await c.prepare?.(page);
        await settle(page, 400);
        const chosen = await readBackground(page, c.chosen, c.pseudo ?? null);
        const recipe = await resolve(page, c.recipe);
        await checkInks(kit, page, theme, c, chosen);
        const { hovered, ghostShown } = await readHovered(page, cdp, c);
        const ok =
          chosen !== null &&
          hovered !== null &&
          recipe !== null &&
          (c.hover === "force" || ghostShown === "1") &&
          !same(chosen.rgb, hovered.rgb) &&
          same(chosen.rgb, recipe.rgb);
        kit.check(
          `${theme}: ${c.name}: chosen differs from a hovered unchosen item and is DESIGN's ${c.recipe === WASH ? "selection wash" : "Toggle on step"}`,
          ok,
          JSON.stringify({
            chosen: chosen?.color,
            chosenRgb: chosen?.rgb.join(","),
            hovered: hovered?.color,
            hoveredRgb: hovered?.rgb.join(","),
            recipe: recipe?.color,
            ...(c.hover === "ghost" ? { ghostOpacity: ghostShown } : {}),
          })
        );
      }
      await checkHeld(kit, theme, page, cdp, bench);
      await checkCawRule(kit, theme, page, bench);
      await checkRail(kit, theme, cdp, page, sheets);
    }
  },
};

export default spec;
