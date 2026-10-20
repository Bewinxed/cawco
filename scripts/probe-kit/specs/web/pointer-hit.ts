/**
 * DESIGN.md's 24 Pointer Rule at the desk: a control drawn smaller than
 * 24×24 reaches 24px through `.pointer-hit` on a fine pointer, as far past
 * each edge as it is short of 24. On the pointer-hit bench (the kit's
 * checkbox, 16×16, alone), at 1440: the checkbox is what
 * `document.elementsFromPoint` finds half a pixel inside that reach at
 * each edge's middle, and not half a pixel past it: outside as Blink
 * hit-tests a point, a 1×1 box. The kit pins the desk page's pointer
 * (kit.ts `DESK_POINTER`); without it a host with no mouse drew no area
 * at all.
 *
 *   bun scripts/probe-kit/run.ts web pointer-hit
 */
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/pointer-hit";
const CONTROL = "[data-probe-hit]";
/** The floor every fine-pointer control reaches (`--c-pointer-floor`). */
const FLOOR = 24;

const spec: Spec = {
  name: "pointer-hit",
  run: async (kit: Kit) => {
    const page = await kit.page("desk", { theme: "light" });
    await open(page, `${await kit.bench()}${ROUTE}`, CONTROL, 120_000);
    await settle(page, 400);
    const read = await page.evaluate(
      ([selector, floor]) => {
        const control = document.querySelector<HTMLElement>(selector);
        if (!control) {
          return null;
        }
        const r = control.getBoundingClientRect();
        const midX = r.left + r.width / 2;
        const midY = r.top + r.height / 2;
        const finds = (x: number, y: number) =>
          document.elementsFromPoint(x, y).includes(control);
        // Blink hit-tests a point as the 1×1 box below and right of it
        // (hit_test_location.h `RectForPoint`), so a point names the box's
        // near side `out` past the right and bottom edges, and its far side
        // `out` past the top and left: the box itself stands `out` clear.
        const sides = (out: number) => ({
          top: finds(midX, r.top - out - 1),
          bottom: finds(midX, r.bottom + out),
          left: finds(r.left - out - 1, midY),
          right: finds(r.right + out, midY),
        });
        const reach = (floor - r.width) / 2;
        return {
          size: [r.width, r.height],
          reach,
          inside: sides(reach - 0.5),
          past: sides(reach + 0.5),
        };
      },
      [CONTROL, FLOOR] as const
    );
    kit.check(
      "the checkbox is drawn under the floor, 16×16",
      read?.size[0] === 16 && read.size[1] === 16,
      JSON.stringify(read?.size)
    );
    kit.check(
      "half a pixel inside its 24px reach at each edge, the pointer finds it",
      read !== null && Object.values(read.inside).every(Boolean),
      JSON.stringify(read)
    );
    kit.check(
      "half a pixel past its 24px reach at each edge, the pointer misses it",
      read !== null && !Object.values(read.past).some(Boolean),
      JSON.stringify(read)
    );
  },
};

export default spec;
