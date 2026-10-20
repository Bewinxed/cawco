/**
 * DESIGN.md's 24 Pointer Rule at the desk: a 20px control's `.pointer-hit`
 * area reaches 24px, 2px past each edge, on a fine pointer. On the
 * folder-proof bench (the real PaneTabs, no hub), at 1440: the session
 * strip's "+" (New session, 20×20) is what `document.elementsFromPoint`
 * finds 1.5px outside each of its four edges, at the edge's middle, and
 * not 2.5px outside: outside as Blink hit-tests a point, a 1×1 box. The kit pins the desk page's pointer (kit.ts
 * `DESK_POINTER`); without it a host with no mouse drew no area at all.
 *
 *   bun scripts/probe-kit/run.ts web pointer-hit
 */
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/folder-proof?at=1&work=working&theme=light";
const PLUS = '[data-strip="session"] [data-slot="strip-new"] [data-tnew]';

const spec: Spec = {
  name: "pointer-hit",
  run: async (kit: Kit) => {
    const page = await kit.page("desk", { theme: "light" });
    await open(page, `${await kit.bench()}${ROUTE}`, PLUS, 120_000);
    await settle(page, 400);
    const read = await page.evaluate((selector) => {
      const button = document.querySelector<HTMLElement>(selector);
      if (!button) {
        return null;
      }
      const r = button.getBoundingClientRect();
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      const finds = (x: number, y: number) =>
        document.elementsFromPoint(x, y).includes(button);
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
      return {
        size: [r.width, r.height],
        at15: sides(1.5),
        at25: sides(2.5),
      };
    }, PLUS);
    kit.check(
      "the strip's + is drawn 20×20",
      read?.size[0] === 20 && read.size[1] === 20,
      JSON.stringify(read?.size)
    );
    kit.check(
      "1.5px outside each edge of the +, the pointer finds it",
      read !== null && Object.values(read.at15).every(Boolean),
      JSON.stringify(read?.at15)
    );
    kit.check(
      "2.5px outside each edge of the +, the pointer misses it",
      read !== null && !Object.values(read.at25).some(Boolean),
      JSON.stringify(read?.at25)
    );
  },
};

export default spec;
