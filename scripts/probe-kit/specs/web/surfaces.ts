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
 */
import { diff } from "../../diff";
import { player, readTape } from "../../hub-tape";
import { entrySlug, type Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, Servers, TAPE, walk } from "../../surfaces/walk";

const surfacesArg = process.argv
  .find((arg) => arg.startsWith("--surfaces="))
  ?.slice("--surfaces=".length);

const spec: Spec = {
  name: "surfaces",
  async run(kit) {
    const tape = await readTape(TAPE);
    const hub = player(tape);
    const servers = new Servers(kit, hub.base);
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
          await diff(kit, page, entry, { clip });
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
