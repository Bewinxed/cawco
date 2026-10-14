/**
 * The delegate tray's row (transcript/DelegateTray), on its bench
 * (/motion/delegate-tray, no hub: the real SessionPane and the composer
 * lent to it, twelve delegates running, starting, waiting on a heavy-run
 * slot and queued behind owned files, a plan of eight steps), on the desk.
 * Owner: "why the delegate chips here show +9 even though there's space
 * for them to show up?", with the open fan's queued chips' state running
 * past their edge.
 *
 *  - the row holds every chip that fits: the chips shown, their gaps and
 *    "+N" stand inside the row's width, and the first folded chip, at its
 *    least (its title cut to eight characters, its state to twelve, the
 *    rest whole), would not fit beside them (geometry);
 *  - every chip's title and state stand inside its chip, before its state
 *    glyph, cut with an ellipsis when they do not fit, in the row and in
 *    what "+N" opens (geometry, engine).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each in-page reading walks the row's chips and parts in order.
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/delegate-tray";
/** The bench's delegates in the order they were made: title and state text. */
const WORK: [string, string][] = [
  ["Restore tab feet, Chrome-style", ""],
  [
    "Bake the decision page kit",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  [
    "Profile the board's first paint",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  ["Port the plan ring to iOS", ""],
  ["Measure transcript pin drift", ""],
  [
    "Restyle the effort chip",
    "queued: owns apps/dashboard/src/lib/cawco/effort/**",
  ],
  ["Sweep stale workspaces", ""],
  [
    "Check the Telegram bridge auth",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  ["Index the delegate events", ""],
  ["Cache the machine list", ""],
  [
    "Split the session card",
    "queued: owns apps/dashboard/src/lib/cawco/card/**",
  ],
  ["Fix the skeleton sweep", ""],
];
/** The least a chip shows of each, in characters, and the least chip. */
const TITLE_LEAST = 8;
const NOTE_LEAST = 12;
const CHIP_LEAST = 120;

/** The row: its width, the chips in it, and the least width of the first folded one. */
const rowNow = (page: Page) =>
  page.evaluate(
    ({ work, titleLeast, noteLeast, chipLeast }) => {
      const row = document.querySelector<HTMLElement>(".tray .row");
      if (!row) {
        return null;
      }
      const chips = [...row.querySelectorAll<HTMLElement>("[data-key]")].filter(
        (chip) =>
          !chip.closest(".fan") &&
          chip.checkVisibility({ opacityProperty: true })
      );
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = chips.map((chip) => chip.getBoundingClientRect().width);
      const used =
        widths.reduce((sum, width) => sum + width, 0) +
        gap * Math.max(0, chips.length - 1);
      const more = chips.find((chip) => chip.dataset.key === "more");
      const delegates = chips.filter((chip) => chip.dataset.key !== "more");
      const folded = more ? Number(more.textContent?.replace("+", "") ?? 0) : 0;

      // Each chip at its least, by the tray's rule, in the shown chips' own
      // faces and spaces.
      const [sample] = delegates;
      const title = document.querySelector<HTMLElement>(".tray .title");
      const note = document.querySelector<HTMLElement>(".tray .note");
      const ruler = document.createElement("canvas").getContext("2d");
      const least = (
        text: string,
        chars: number,
        face: HTMLElement | null
      ): number => {
        if (!(ruler && face && text)) {
          return 0;
        }
        const s = getComputedStyle(face);
        ruler.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const shown = text.length > chars ? `${text.slice(0, chars)}…` : text;
        return Math.ceil(ruler.measureText(shown).width) + 1;
      };
      // Each delegate's chip at its least, by the bench's order.
      const leasts: number[] = [];
      if (sample) {
        const chipStyle = getComputedStyle(sample);
        const words = sample.querySelector<HTMLElement>(".words");
        const wordsGap = words
          ? Number.parseFloat(getComputedStyle(words).columnGap) || 0
          : 0;
        const inner = Number.parseFloat(chipStyle.columnGap) || 0;
        const pad =
          Number.parseFloat(chipStyle.paddingInlineStart) +
          Number.parseFloat(chipStyle.paddingInlineEnd);
        const mark =
          sample.querySelector<HTMLElement>(".mark")?.offsetWidth ?? 0;
        const slot =
          sample.querySelector<HTMLElement>(".slot")?.offsetWidth ?? 0;
        for (const [name, state] of work) {
          const text =
            least(name, titleLeast, title) +
            (state ? wordsGap + least(state, noteLeast, note) : 0);
          leasts.push(
            Math.max(
              chipLeast,
              Math.ceil(pad + mark + inner + text + inner + slot)
            )
          );
        }
      }
      return {
        room: row.clientWidth,
        used,
        gap,
        shown: delegates.length,
        folded,
        moreWidth: more?.getBoundingClientRect().width ?? 0,
        leasts,
        texts: chips.map((chip) =>
          chip.textContent?.replace(/\s+/g, " ").trim()
        ),
      };
    },
    {
      work: WORK,
      titleLeast: TITLE_LEAST,
      noteLeast: NOTE_LEAST,
      chipLeast: CHIP_LEAST,
    }
  );

/** Every drawn chip whose title or state leaves its box, runs under its glyph, or is cut with no ellipsis. */
const spills = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const chip of document.querySelectorAll<HTMLElement>(
      ".tray [data-key]"
    )) {
      if (
        !chip.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const box = chip.getBoundingClientRect();
      const glyph = chip.querySelector(".slot")?.getBoundingClientRect();
      for (const part of chip.querySelectorAll<HTMLElement>(".title, .note")) {
        const text = part.getBoundingClientRect();
        const s = getComputedStyle(part);
        const cut = part.scrollWidth > part.clientWidth + 0.5;
        const inside =
          text.left >= box.left - 0.5 &&
          text.right <= box.right + 0.5 &&
          (!glyph || text.right <= glyph.left + 0.5);
        const ellipsed =
          !cut || (s.overflowX === "hidden" && s.textOverflow === "ellipsis");
        if (!(inside && ellipsed)) {
          bad.push(
            `${chip.dataset.key} .${part.className.split(" ")[0]}: text ${Math.round(text.left)}–${Math.round(text.right)} in chip ${Math.round(box.left)}–${Math.round(box.right)}, glyph at ${glyph ? Math.round(glyph.left) : "-"}, cut ${cut} ellipsis ${ellipsed}`
          );
        }
      }
    }
    return bad;
  });

async function desk(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(
    page,
    `${base}${ROUTE}`,
    () => !!document.querySelector(".tray .row [data-key]")
  );
  await settle(page, 600);
  const row = await rowNow(page);
  kit.check(
    "desk: the chips shown, their gaps and '+N' stand inside the row's width",
    !!row && row.used <= row.room + 0.5,
    JSON.stringify(row)
  );
  // The shown chips and the first folded one, each at its least, with their
  // gaps, and "+N" unless that one was the last folded.
  const withNext = row
    ? row.leasts
        .slice(0, row.shown + 1)
        .reduce((sum, width) => sum + width, 0) +
      row.gap * row.shown +
      (row.folded > 1 ? row.moreWidth + row.gap : 0)
    : 0;
  kit.check(
    "desk: the row holds every chip that fits: one more, every chip at its least, would not",
    !!row && (row.folded === 0 || withNext > row.room),
    `shown ${row?.shown}, +${row?.folded}, room ${row?.room}px, with the next at their least ${withNext}px (${row?.leasts.slice(0, (row?.shown ?? 0) + 1).join(" + ")})`
  );
  kit.check(
    "desk: more than one chip stands in the row",
    !!row && row.shown > 1,
    JSON.stringify(row?.texts)
  );
  const inRow = await spills(page);
  kit.check(
    "desk: every chip's title and state stand inside it, before its glyph, cut with an ellipsis",
    inRow.length === 0,
    inRow.join("; ")
  );
  // What "+N" opens: its chips' text too.
  await page.locator('.tray [data-key="more"]').click();
  await settle(page, 600);
  const opened = await spills(page);
  kit.check(
    "desk: opened from '+N', every chip's text stands inside its chip",
    opened.length === 0,
    opened.join("; ")
  );
}

const spec: Spec = {
  name: "delegate-tray",
  async run(kit) {
    const base = await kit.bench();
    await desk(kit, base);
  },
};
export default spec;
