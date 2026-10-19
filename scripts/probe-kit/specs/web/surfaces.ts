/**
 * The surfaces' pixel baseline, the style snapshot's backstop: every
 * surface and open state the snapshot reads (surfaces/catalogue.ts), at
 * desk 1440, tablet 820 and phone 390, light and dark, captured and held to
 * the approved picture (diff.ts, pixelmatch). A state's capture is its root:
 * the viewport for a page, the open layer's box for a menu, sheet or card.
 *
 *   bun scripts/probe-kit/run.ts web surfaces [--surfaces=a,b]
 *   bun scripts/probe-kit/run.ts web surfaces --approve surfaces[:<entry>,…] [--review <dir>]
 *
 * An entry is `<surface>-<state>-<width>-<theme>`. The fleet is the style
 * snapshot's hub tapes, each hub state on its own section (walk.ts
 * `walkTapes`), the clock held at the recording's moment (hub-tape.ts): the
 * same pictures on every run, in any workspace.
 *
 * A capture that differs from its baseline is written beside it with the
 * whole document as it was taken (`<entry>.dump.json`, surfaces/dump.ts):
 * a picture the style snapshot reads no difference in is one of two the
 * page paints, and the dump says which element differs. `--dump` writes
 * one for every capture, the picture that matched as well.
 *
 * Nothing is painted again before a capture: no layer keeps `will-change`
 * past the motion it was set for (a hanging card's slide, hang.ts
 * `slideLayer`; a vaul drawer's drag, app.css `[data-vaul-drawer]`), so
 * each lands painted where it stands, and one state gives one picture.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diff } from "../../diff";
import { entrySlug, type Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { pageDump } from "../../surfaces/dump";
import { PASSES, walkTapes } from "../../surfaces/walk";

const surfacesArg = process.argv
  .find((arg) => arg.startsWith("--surfaces="))
  ?.slice("--surfaces=".length);
/** Every capture's dump, not only a differing one's. */
const dumpAll = process.argv.includes("--dump");

const spec: Spec = {
  name: "surfaces",
  async run(kit) {
    const { misses, seconds } = await walkTapes(
      kit,
      chosen(surfacesArg),
      PASSES.filter((pass) => !pass.reduced),
      async ({ page, pass, state, surface }) => {
        const entry = entrySlug(
          `${surface.name} ${state.name} ${pass.width} ${pass.theme}`
        );
        const vp = page.viewportSize() ?? { width: 0, height: 0 };
        const box =
          state.root === "body"
            ? null
            : await page.evaluate(
                (r) => window.__ssReader?.root(r) ?? null,
                state.root
              );
        // The root's box inside the viewport, whole css px; the viewport for a page.
        const clip = box
          ? (() => {
              const x = Math.max(0, Math.floor(box.x));
              const y = Math.max(0, Math.floor(box.y));
              return {
                x,
                y,
                width: Math.max(
                  1,
                  Math.min(vp.width, Math.ceil(box.x + box.width)) - x
                ),
                height: Math.max(
                  1,
                  Math.min(vp.height, Math.ceil(box.y + box.height)) - y
                ),
              };
            })()
          : undefined;
        // Read before the capture's comparison, as the picture was taken.
        const dump = await page.evaluate(pageDump);
        const differs = await diff(kit, page, entry, {
          clip,
          ...(state.mask ? { mask: state.mask(page) } : {}),
        });
        if (differs || dumpAll) {
          await writeFile(
            join(kit.out, `${entry}.dump.json`),
            JSON.stringify(dump)
          );
        }
      },
      (what, why) => kit.check(`${what}: opens`, false, why)
    );
    if (misses.length > 0) {
      kit.note(
        `the tapes answered ${misses.length} request(s) with "not on the tape": ${misses.slice(0, 8).join("; ")}`
      );
    }
    for (const [name, s] of seconds) {
      console.log(`  ${name}: ${s.toFixed(0)}s`);
    }
  },
};
export default spec;
