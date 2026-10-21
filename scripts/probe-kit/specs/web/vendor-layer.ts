/**
 * The libraries' sheets in the `vendor` layer (app.css), read on the
 * surfaces walk's tapes: each house rule that restyles a library's DOM wins
 * on the element, and a kit part's own utility wins over the house recipe
 * around it.
 *
 *   bun scripts/probe-kit/run.ts web vendor-layer
 *
 * - Event Calendar (views/week-page): its palette is loaded, in `vendor`;
 *   ViewCalendar's `--ec-*` from the tokens are what `.ec` computes, light
 *   and dark.
 * - Milkdown Crepe (config-memory/editor): the `crepe-host` rules
 *   (components) are what the editor computes over Crepe's own sheet.
 * - vaul (new-session/open on a phone, the kit drawer the new-session card
 *   stands in): with reduced motion the
 *   drawer's own `motion-reduce:sheet-fade` (a utility, no `!`) is the
 *   animation it runs, over vaul's slide.
 * - The bar's machines (home/rest, desk): the glyph's tone tint (a utility)
 *   wins over the bar-group recipe's muted ink (components), at its symbol
 *   size.
 *
 * A value is compared with what a probe span computes for the token it
 * should be, placed in the same element, so the check reads the cascade and
 * not a copy of a value.
 */
import type { Page } from "playwright-core";
import type { Kit, Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

/** The states read, `surface/state`: only these are opened. */
const READ = new Set([
  "views/week-page",
  "config-memory/editor",
  "new-session/open",
  "home/rest",
]);

async function calendar(kit: Kit, page: Page, pass: string): Promise<void> {
  const read = await page.evaluate(() => {
    const ec = document.querySelector(".ec");
    if (!ec) {
      return null;
    }
    const cs = getComputedStyle(ec);
    return [
      ["--ec-color-400", "--border-control"],
      ["--ec-bg-color", "--surface-raised"],
      ["--ec-border-color", "--border-hairline"],
    ].map(([lib = "", token = ""]) => ({
      lib,
      got: cs.getPropertyValue(lib).trim(),
      want: cs.getPropertyValue(token).trim(),
    }));
  });
  kit.check(
    `calendar ${pass}: .ec computes ViewCalendar's --ec-* from the tokens, not Event Calendar's palette`,
    !!read && read.every((r) => r.got !== "" && r.got === r.want),
    `\n    ${JSON.stringify(read)}`
  );
}

async function crepe(kit: Kit, page: Page, pass: string): Promise<void> {
  const read = await page.evaluate(() => {
    const editor = document.querySelector('[data-slot="crepe-host"] .milkdown');
    if (!editor) {
      return null;
    }
    const probe = (prop: string, value: string) => {
      const span = document.createElement("span");
      span.style.setProperty("position", "absolute");
      span.style.setProperty(prop, value);
      editor.append(span);
      const got = getComputedStyle(span).getPropertyValue(prop);
      span.remove();
      return got;
    };
    const cs = getComputedStyle(editor);
    // app.css's crepe-host rule: its host field draws the frame, so the
    // editor draws none (transparent, no padding) over Crepe's own fill
    // and padding.
    return {
      background: cs.backgroundColor,
      backgroundWant: probe("background-color", "transparent"),
      padding: cs.paddingTop,
      paddingWant: "0px",
      surface: cs.getPropertyValue("--crepe-color-surface").trim(),
      surfaceWant: cs.getPropertyValue("--surface-raised").trim(),
    };
  });
  kit.check(
    `crepe ${pass}: the editor computes the crepe-host rules over Crepe's own sheet`,
    !!read &&
      read.background === read.backgroundWant &&
      read.padding === read.paddingWant &&
      read.surface !== "" &&
      read.surface === read.surfaceWant,
    `\n    ${JSON.stringify(read)}`
  );
}

async function drawer(kit: Kit, page: Page, pass: string): Promise<void> {
  const sheet = '[data-slot="drawer-content"][data-state="open"]';
  if ((await page.locator(sheet).count()) === 0) {
    kit.check(`drawer ${pass}: a kit drawer stands open`, false);
    return;
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const read = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el).animationName : null;
  }, sheet);
  await page.emulateMedia({ reducedMotion: null });
  kit.check(
    `drawer ${pass}: with reduced motion the kit drawer fades (sheet-fade, no !) over vaul's slide`,
    read === "kit-fade-in",
    `\n    animation-name ${JSON.stringify(read)}`
  );
}

async function machines(kit: Kit, page: Page, pass: string): Promise<void> {
  const read = await page.evaluate(() => {
    const item = document.querySelector("[data-machines]");
    const symbol = item?.querySelector('[data-slot="bar-symbol"]');
    if (!(item && symbol)) {
      return null;
    }
    const probe = (prop: string, value: string) => {
      const span = document.createElement("span");
      span.style.setProperty("position", "absolute");
      span.style.setProperty(prop, value);
      item.append(span);
      const got = getComputedStyle(span).getPropertyValue(prop);
      span.remove();
      return got;
    };
    const tone = item.getAttribute("data-tone");
    const cs = getComputedStyle(symbol);
    return {
      tone,
      color: cs.color,
      colorWant: probe(
        "color",
        tone ? `var(--status-${tone}-glyph)` : "var(--ink-muted)"
      ),
      width: cs.width,
      widthWant: probe("width", "var(--c-bar-symbol)"),
    };
  });
  kit.check(
    `machines ${pass}: the bar glyph wears its tone (${read?.tone ?? "none"}) over the group's muted ink, at the symbol size`,
    !!read && read.color === read.colorWant && read.width === read.widthWant,
    `\n    ${JSON.stringify(read)}`
  );
}

const spec: Spec = {
  name: "vendor-layer",
  async run(kit) {
    const surfaces = chosen("views,config-memory,new-session,home").map(
      (surface) => ({
        ...surface,
        states: surface.states.filter((state) =>
          READ.has(`${surface.name}/${state.name}`)
        ),
      })
    );
    await walkTapes(
      kit,
      surfaces,
      PASSES.filter((pass) => !pass.reduced),
      async ({ page, pass, state, surface }) => {
        const at = `${surface.name}/${state.name}`;
        if (at === "views/week-page") {
          await calendar(kit, page, pass.name);
        } else if (at === "config-memory/editor") {
          await crepe(kit, page, pass.name);
        } else if (at === "new-session/open" && pass.width === "phone") {
          await drawer(kit, page, pass.name);
        } else if (at === "home/rest" && pass.width === "desk") {
          await machines(kit, page, pass.name);
        }
      }
    );
  },
};
export default spec;
