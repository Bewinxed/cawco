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
 * (`light-dark(surface-fill-strong, surface-fill)`). The wash comes with
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
 *   bun scripts/probe-kit/run.ts web chosen-hover
 */
import type { CDPSession, Page } from "playwright-core";
import type { Kit, Spec } from "../../kit";
import { open, settle, THEMES } from "../../kit";

const WASH = "var(--selected-bg)";
const ON_STEP = "light-dark(var(--surface-fill-strong), var(--surface-fill))";

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
   * label, which takes the wash's paired ink (`selected-ink`).
   */
  onWash?: { label: string; row: string };
  /** The unchosen item. */
  other: string;
  /** Read the background of `::before`, where the control paints it. */
  pseudo?: "::before";
  /** DESIGN's background for the chosen item. */
  recipe: string;
}

const POP = ".ns-pop";

const CONTROLS: Control[] = [
  {
    name: "Session lifetime row",
    control: "lifetime",
    hover: "ghost",
    recipe: WASH,
    chosen: ".ns-pop .row.on",
    other: ".ns-pop .row[aria-pressed='false']",
    onWash: {
      row: ".ns-pop .row.on",
      label: ".ns-pop .row.on .name",
    },
  },
  {
    name: "Project row",
    control: "project",
    hover: "ghost",
    recipe: WASH,
    chosen: ".ns-pop .row.on",
    other: ".ns-pop .row[aria-pressed='false']",
    onWash: {
      row: ".ns-pop .row.on",
      label: ".ns-pop .row.on .name",
    },
  },
  {
    name: "Machine row",
    control: "machines",
    hover: "ghost",
    recipe: WASH,
    chosen: ".ns-pop .row.on",
    other: ".ns-pop .row[aria-pressed='false']",
    onWash: {
      row: ".ns-pop .row.on",
      label: '.ns-pop .row.on [data-slot="name"]',
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
        '[data-probe="permission"] [role="radio"][aria-checked="true"] .name',
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
    chosen: '[data-probe="pins"] .pin-row[aria-current="true"]',
    other: '[data-probe="pins"] .pin-row:not([aria-current])',
    onWash: {
      row: '[data-probe="pins"] .pin-row[aria-current="true"]',
      label: '[data-probe="pins"] .pin-row[aria-current="true"] .name',
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
    const list = row?.closest(".kit-highlight");
    const ghost = list?.querySelector(":scope > .kit-ghost");
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
  onWash: { label: string; row: string }
): Promise<{ label: Ink | null; texts: Ink[] }> {
  return page.evaluate(({ label, row }) => {
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
    return { label: labelEl ? ink(labelEl) : null, texts };
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
  const { label, texts } = await readInks(page, c.onWash);
  const paired = await resolve(page, "var(--selected-ink)");
  const measured = texts.map((one) => ({
    text: one.text.slice(0, 24),
    ink: one.color,
    ratio: wash ? Math.round(ratio(one.rgb, wash.rgb) * 100) / 100 : 0,
  }));
  kit.check(
    `${theme}: ${c.name}: its label takes selected-ink and every text on the wash holds 4.5:1`,
    wash !== null &&
      label !== null &&
      paired !== null &&
      same(label.rgb, paired.rgb) &&
      measured.length > 0 &&
      measured.every((one) => one.ratio >= 4.5),
    JSON.stringify({
      label: label?.color,
      selectedInk: paired?.color,
      measured,
    })
  );
}

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((c, i) => Math.abs(c - (b[i] ?? 0)) <= 1);

const spec: Spec = {
  name: "chosen-hover",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
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
          c.control ? `${POP} .row` : c.chosen
        );
        await page.mouse.move(1, 1);
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
    }
  },
};

export default spec;
