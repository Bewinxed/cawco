/**
 * The Comments rail's bar keeps "Comments" in its centre (the owner's pin 5
 * on the artifact panel, 2026-11-06: Close leading, the title centred, the
 * confirming action trailing, HIG Sheets). On the artifact panel's bench
 * (`/dev/artifact-panel`), in Chromium at the desk (1440, the rail beside
 * the page) and the phone (390, the Comments sheet):
 *
 * 1. With nothing held (`state=rail`), the title's centre stands within
 *    1.5px of the bar's, and Search, + and Sort stand trailing.
 * 2. With comments held (`state=held`), Send all stands trailing, the three
 *    fold into More leading, and the title's centre still stands within
 *    1.5px of the bar's (Send beside the three once pushed it 66px off on
 *    the desk and 98px on the phone).
 *
 *   bun scripts/probe-kit/run.ts web rail-title
 */
import { open, settle } from "../../kit";
import type { Kit, Spec } from "../../spec";

const BENCH = "/dev/artifact-panel";
const RAIL = '[data-slot="comment-rail"]';
/** Within this many px of the bar's centre. */
const CENTRED = 1.5;

interface BarRead {
  /** The title's centre less the bar's, px. */
  off: number;
  /** What stands in the bar, by `data-slot`. */
  slots: string[];
}

/** The rail's bar: where its title stands, and what stands in it. */
function readBar(rail: string): BarRead | null {
  const title = document.querySelector(`${rail} header h2[data-slot="title"]`);
  const bar = title?.parentElement;
  if (!(title && bar)) {
    return null;
  }
  const t = title.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  return {
    off: Math.round((t.left + t.width / 2 - (b.left + b.width / 2)) * 10) / 10,
    slots: [...bar.querySelectorAll("[data-slot]")]
      .map((one) => one.getAttribute("data-slot") ?? "")
      .filter((slot) => ["more", "sort", "send-held", "close"].includes(slot)),
  };
}

async function leg(kit: Kit, bench: string, view: "desk" | "phone") {
  const page = await kit.page(view);
  for (const state of ["rail", "held"] as const) {
    await open(page, `${bench}${BENCH}?state=${state}`, `${RAIL} header`);
    await settle(page);
    const read = await page.evaluate(readBar, RAIL);
    const at = `${view} ${state}`;
    const held = state === "held";
    kit.check(
      `${at}: "Comments" stands in the bar's centre (${read?.off}px off)`,
      !!read && Math.abs(read.off) <= CENTRED,
      JSON.stringify(read)
    );
    kit.check(
      `${at}: ${held ? "Send all trails and the three fold into More" : "Search, + and Sort trail, no More"}`,
      !!read &&
        read.slots.includes("send-held") === held &&
        read.slots.includes("more") === held &&
        read.slots.includes("sort") === !held &&
        read.slots.includes("close") === (view === "phone"),
      JSON.stringify(read?.slots)
    );
  }
  await page.context().close();
}

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "rail-title",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    await leg(kit, bench, "desk");
    await leg(kit, bench, "phone");
  },
};

export default spec;
