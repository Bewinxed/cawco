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
 * snapshot's hub tape, its clock held at the recording's moment
 * (hub-tape.ts): the same pictures on every run, in any workspace.
 *
 * A capture that differs from its baseline is written beside it with the
 * whole document as it was taken (`<entry>.dump.json`, surfaces/dump.ts):
 * a picture the style snapshot reads no difference in is one of two the
 * page paints, and the dump says which element differs. `--dump` writes
 * one for every capture, the picture that matched as well.
 *
 * Every layer that has `will-change` is painted again where it stands
 * before its capture (`atRest`). Chromium keeps such a layer's raster from
 * whichever frame of its entrance first painted it: a hanging card's
 * `will-change: translate` (app.css `.kit-pop.kit-hang`, kept for as long
 * as it is mounted for WebKit's sake), a vaul drawer's
 * `will-change: transform`. The same document painted its text at the
 * sub-pixel offset of that frame, so one state gave two or more pictures,
 * each bit-identical when it recurred, with dumps that matched element for
 * element. Six walks each, as taken and after one re-raster: jump open
 * phone dark 2 pictures → 1, tablet dark 4 → 1; usage-relay rest tablet
 * light 2 → 1, tablet dark 3 → 1, phone dark 1 → 1; caw-notices rest desk
 * light 2 → 1.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diff } from "../../diff";
import { player, readTape } from "../../hub-tape";
import { entrySlug, type Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { pageDump } from "../../surfaces/dump";
import { PASSES, Servers, TAPE, walk } from "../../surfaces/walk";

const surfacesArg = process.argv
  .find((arg) => arg.startsWith("--surfaces="))
  ?.slice("--surfaces=".length);
/** Every capture's dump, not only a differing one's. */
const dumpAll = process.argv.includes("--dump");

/**
 * Each layer with `will-change` painted again where it stands: its
 * `will-change` dropped for two of the browser's frames, then put back as
 * it was (an inline one, priority and all), and two frames more. Runs in
 * the page; touches only the layers that have it now.
 */
async function atRest(): Promise<number> {
  const held = [...document.querySelectorAll<HTMLElement>("*")].filter(
    (el) => getComputedStyle(el).willChange !== "auto"
  );
  const before = held.map((el) => ({
    value: el.style.getPropertyValue("will-change"),
    priority: el.style.getPropertyPriority("will-change"),
  }));
  for (const el of held) {
    el.style.setProperty("will-change", "auto", "important");
  }
  await window.__ssReader?.frames(2);
  held.forEach((el, i) => {
    const was = before[i];
    if (was?.value) {
      el.style.setProperty("will-change", was.value, was.priority);
    } else {
      el.style.removeProperty("will-change");
    }
  });
  await window.__ssReader?.frames(2);
  return held.length;
}

const spec: Spec = {
  name: "surfaces",
  async run(kit) {
    const tape = await readTape(TAPE);
    const hub = player(tape);
    const servers = new Servers(kit, hub);
    try {
      const seconds = await walk(
        kit,
        servers,
        tape,
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
          await page.evaluate(atRest);
          // Read before the capture's comparison, as the picture was taken.
          const dump = await page.evaluate(pageDump);
          const differs = await diff(kit, page, entry, { clip });
          if (differs || dumpAll) {
            await writeFile(
              join(kit.out, `${entry}.dump.json`),
              JSON.stringify(dump)
            );
          }
        },
        (what, why) => kit.check(`${what}: opens`, false, why)
      );
      for (const [name, s] of seconds) {
        console.log(`  ${name}: ${s.toFixed(0)}s`);
      }
    } finally {
      await servers.close();
      hub.stop();
    }
  },
};
export default spec;
