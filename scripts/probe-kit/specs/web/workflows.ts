/**
 * The workflows surfaces behave as DESIGN.md says, on the hub tape's
 * catalogue states (surfaces/catalogue.ts `workflows`), at the desk (fine
 * pointer) and the phone (coarse), light:
 *
 * (a) graph: no node's box overlaps another's, and the opening fit stands
 *     where a node's name reads at least 10px (the fit's floor).
 * (b) launch: Run workflow opens the launch form without blocking the page
 *     (The Open Page Rule): on a desk a popover with no scrim and no modal
 *     hold, its own card holding the focus with no ring shown; Escape puts
 *     it away and the focus goes back to Run workflow. On a phone it is the
 *     bottom sheet with its Close.
 * (c) run: the run's page says how it stands in words beside its glyph
 *     (The Glyph, Word, Hue Rule), and its status glyphs wear their status
 *     ink, not the hover card's mark-glyph white.
 *
 *   bun scripts/probe-kit/run.ts web workflows
 */
import type { Page } from "playwright-core";
import type { Kit, Spec } from "../../kit";
import { SURFACES } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

/** The least a node's name reads on screen at the opening fit, in px. */
const READABLE_PX = 10;

const surfaces = SURFACES.filter((s) => s.name === "workflows").map((s) => ({
  ...s,
  states: s.states.filter((st) => ["graph", "launch", "run"].includes(st.name)),
}));

/** The graph's node boxes, their pairwise overlaps, and its names' sizes on screen. */
function graphRead() {
  const boxes = [...document.querySelectorAll(".svelte-flow__node")].map(
    (node) => ({
      id: node.getAttribute("data-id"),
      b: node.getBoundingClientRect(),
    })
  );
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i].b;
      const c = boxes[j].b;
      const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (w > 0 && h > 0) {
        overlaps.push(`${boxes[i].id} × ${boxes[j].id}`);
      }
    }
  }
  const viewport = document.querySelector(".svelte-flow__viewport");
  const zoom = viewport
    ? new DOMMatrix(getComputedStyle(viewport).transform).a
    : 1;
  const names = [
    ...document.querySelectorAll("[data-slot=node-card] header strong"),
  ].map((name) => Number.parseFloat(getComputedStyle(name).fontSize) * zoom);
  return { nodes: boxes.length, overlaps, names };
}

/** The open launch form: a popover or a sheet, and what holds the page. */
function launchRead() {
  const popover = document.querySelector(
    "[data-slot=popover-content][data-state=open]"
  );
  const sheet = document.querySelector(
    "[data-slot=drawer-content][data-state=open]"
  );
  return {
    popover: !!popover,
    sheet: sheet?.getAttribute("data-vaul-drawer-direction") ?? null,
    close: !!sheet?.querySelector(
      '[data-slot=drawer-header] [aria-label="Close"]'
    ),
    scrim: !!document.querySelector(
      "[data-slot=dialog-overlay], [data-slot=drawer-overlay][data-state=open]"
    ),
    modal: popover?.getAttribute("aria-modal") === "true",
    focusOnCard: !!popover && document.activeElement === popover,
    ring: document.querySelectorAll(":focus-visible").length,
  };
}

/** The run's head words and its status glyphs' inks. */
function runRead() {
  const head = document.querySelector(
    "[data-run-view] > header[data-slot=head] [data-slot=session-status]"
  );
  const markGlyph = getComputedStyle(document.documentElement)
    .getPropertyValue("--mark-glyph")
    .trim();
  const probe = document.createElement("i");
  probe.style.color = markGlyph;
  document.body.append(probe);
  const white = getComputedStyle(probe).color;
  probe.remove();
  const glyphs = [
    ...document.querySelectorAll("[data-run-block] [data-slot=mark] svg"),
  ].map((svg) => getComputedStyle(svg).color);
  return {
    word: head?.textContent?.trim() ?? "",
    glyphs,
    markGlyphInk: glyphs.filter((ink) => ink === white).length,
  };
}

async function launchClose(page: Page) {
  await page.keyboard.press("Escape");
  await page
    .locator("[data-slot=popover-content][data-state=open]")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  return page.evaluate(() => ({
    open: !!document.querySelector(
      "[data-slot=popover-content][data-state=open]"
    ),
    focus: document.activeElement?.textContent?.trim() ?? "",
  }));
}

const spec: Spec = {
  name: "workflows",
  async run(kit: Kit) {
    await walkTapes(
      kit,
      surfaces,
      PASSES.filter(
        (pass) =>
          !pass.reduced &&
          pass.theme === "light" &&
          (pass.width === "desk" || pass.width === "phone")
      ),
      async ({ page, pass, state }) => {
        const at = `${state.name} ${pass.width}`;
        if (state.name === "graph") {
          const read = await page.evaluate(graphRead);
          kit.check(
            `${at}: no two of its ${read.nodes} nodes overlap`,
            read.nodes > 1 && read.overlaps.length === 0,
            JSON.stringify(read.overlaps)
          );
          kit.check(
            `${at}: every node's name reads at least ${READABLE_PX}px at the opening fit`,
            read.names.length > 0 &&
              read.names.every((px) => px >= READABLE_PX - 0.05),
            JSON.stringify(read.names)
          );
        } else if (state.name === "launch") {
          const read = await page.evaluate(launchRead);
          if (pass.width === "desk") {
            kit.check(
              `${at}: the launch form is a popover with no scrim and no modal hold`,
              read.popover && !read.scrim && !read.modal,
              JSON.stringify(read)
            );
            kit.check(
              `${at}: its own card holds the focus, and no ring shows`,
              read.focusOnCard && read.ring === 0,
              JSON.stringify(read)
            );
            const closed = await launchClose(page);
            kit.check(
              `${at}: Escape puts it away and the focus goes back to Run workflow`,
              !closed.open && closed.focus === "Run workflow",
              JSON.stringify(closed)
            );
          } else {
            kit.check(
              `${at}: the launch form is the bottom sheet with its Close`,
              read.sheet === "bottom" && read.close,
              JSON.stringify(read)
            );
          }
        } else if (state.name === "run") {
          const read = await page.evaluate(runRead);
          kit.check(
            `${at}: the run's head says how it stands in words ("${read.word}")`,
            read.word.length > 0,
            JSON.stringify(read)
          );
          kit.check(
            `${at}: its status glyphs wear their status ink, none the mark glyph's`,
            read.glyphs.length > 0 && read.markGlyphInk === 0,
            JSON.stringify(read)
          );
        }
      },
      (what, why) => kit.check(`${what} opens`, false, why)
    );
  },
};

export default spec;
