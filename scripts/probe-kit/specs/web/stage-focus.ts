/**
 * The stage never takes the window's focus on its own: a person typing in
 * a field of the page that frames it keeps the keyboard while the stage
 * works in the background (graph-stage move-chips, r546: the rig's reads
 * and a reach's play called `focus()` in the stage's frame, which made it
 * the window's focused frame; the host's field blurred and the next keys
 * went to the stage). Only his own press in the drawing moves the focus
 * into it (stage-host canvas held-focus.ts).
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws a scratch states file: a field and a button, its story
 * Grabbed focusing the field as it mounts, its story Pressed reached from
 * Rest by a play that clicks the field and throws unless its document's
 * focus is the field. The stage page stands in a frame of a host page on
 * another origin holding a field of its own, at the desk (1440). With the
 * host's field focused and "ab" typed into it, each from the page's own
 * scripts and never a press or key in the frame:
 *
 * 1. The stage reaches Rest, then Grabbed (mounted afresh), then Pressed by
 *    its play, and reads every story again in its rig (a view said, as the
 *    panel says one): the host's focus is still its field, and "cd" typed
 *    next lands there ("abcd").
 * 2. The play saw its field focused in its own document: the reach to
 *    Pressed answered with no failure. A field the page focuses is its
 *    document's `activeElement` and drawn focused (`.cawco-focus`), while
 *    the host keeps the window's focus.
 * 3. A press on the drawing's field is the person's: the window's focus
 *    goes into the frame, onto that field.
 *
 *   bun scripts/probe-kit/run.ts web stage-focus
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { CANVAS_PATH } from "../../../../packages/core/src/stage";
import { until } from "../../../scratch-fleet";
import { APP, STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import { settle } from "../../kit";
import type { Kit, Spec } from "../../spec";

const SCRATCH = "src/lib/cawco/probe-stage-focus";
const FILE = `${SCRATCH}/Field.stories.ts`;

const FIELD = `<script lang="ts">
  let { grab = false }: { grab?: boolean } = $props();
  let field: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (grab) {
      field?.focus();
    }
  });
</script>

<label>Name <input bind:this={field} data-field /></label>
<button type="button">Create routine</button>
`;

const STORIES = `import Field from "./Field.svelte";

export default { component: Field, args: {} };

export const Rest = { parameters: { viewport: 390 } };

export const Grabbed = { args: { grab: true }, parameters: { viewport: 390 } };

export const Pressed = {
  parameters: { viewport: 390 },
  from: "Rest",
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole("textbox");
    await userEvent.click(field);
    if (field.ownerDocument.activeElement !== field) {
      throw new Error("The play's field is not its document's focus.");
    }
  },
};
`;

/** What the stage page answered a reach (core `StageReached`): its ask, and why it failed, if it did. */
interface Reached {
  ask: number;
  failed?: { message: string };
}

/** The stage page reaches `to` (from `from`, playing its move with `play`), asked by the page's own script: what it answered. */
const reach = (
  frame: Frame,
  ask: number,
  to: string,
  from: string | null,
  play: boolean
) =>
  frame.evaluate(
    (asked) =>
      new Promise<Reached>((done) => {
        addEventListener("cawco:stage-reached", (event) => {
          const said = (event as CustomEvent<Reached>).detail;
          if (said.ask === asked.ask) {
            done(said);
          }
        });
        dispatchEvent(
          new CustomEvent("cawco:stage-reach", {
            detail: {
              ask: asked.ask,
              to: { file: asked.file, story: asked.to },
              from: asked.from ? { file: asked.file, story: asked.from } : null,
              play: asked.play,
              still: false,
            },
          })
        );
      }),
    { ask, file: FILE, from, play, to }
  );

/** The host's focus and its field's words. */
const host = (page: Page) =>
  page.evaluate(() => ({
    focus:
      document.activeElement?.id || document.activeElement?.tagName || "none",
    words: (document.getElementById("host-field") as HTMLInputElement).value,
  }));

const run = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Field.svelte"), FIELD);
  writeFileSync(join(APP, FILE), STORIES);
  const stage = await startDecisionStage(new Map(), {});
  const canvas = `http://127.0.0.1:${stage.stagePort}${CANVAS_PATH}?${new URLSearchParams({ file: FILE })}`;
  // Another site than the stage's (127.0.0.1), as the panel and its stage are.
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Host</title></head><body style="margin:0;font:16px system-ui"><p><input id="host-field" aria-label="The host's field"></p><iframe title="Stage" src="${canvas}" style="width:900px;height:600px;border:0"></iframe></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  try {
    const page = await kit.page("desk");
    await page.goto(`http://localhost:${served.port}/`, {
      waitUntil: "load",
      timeout: STAGE_START_MS,
    });
    const frame = (await until(
      "the stage page in its frame",
      async () =>
        (await (
          await page.locator('iframe[title="Stage"]').elementHandle()
        )?.contentFrame()) ?? null,
      Boolean,
      60_000
    )) as Frame;
    await until(
      "the stage's sweep",
      () =>
        frame
          .evaluate(
            () =>
              (
                window as unknown as {
                  __cawcoCanvas?: { swept?: boolean };
                }
              ).__cawcoCanvas?.swept === true
          )
          .catch(() => false),
      Boolean,
      STAGE_START_MS
    );
    await page.locator("#host-field").click();
    await page.keyboard.type("ab");

    // 1. The stage works, from its page's own scripts.
    await reach(frame, 1, "Rest", null, false);
    await reach(frame, 2, "Grabbed", null, false);
    await reach(frame, 3, "Rest", null, false);
    const pressed = await reach(frame, 4, "Pressed", "Rest", true);
    const reports = await frame.evaluate(
      () =>
        (window as unknown as { __cawcoCanvas: { reports: number } })
          .__cawcoCanvas.reports
    );
    await frame.evaluate(() =>
      dispatchEvent(
        new CustomEvent("cawco:canvas-view", { detail: { scheme: "light" } })
      )
    );
    await until(
      "the rig's read again, reported",
      () =>
        frame.evaluate(
          () =>
            (
              window as unknown as {
                __cawcoCanvas: { reports: number; sweepAt: unknown };
              }
            ).__cawcoCanvas.reports
        ),
      (now) => now > reports,
      60_000
    );
    await settle(page);
    const before = await host(page);
    await page.keyboard.type("cd");
    const after = await host(page);
    kit.check(
      "1: the stage reached three states, played a move and read every story again: the host's field keeps the focus and takes the next keys",
      before.focus === "host-field" &&
        after.focus === "host-field" &&
        after.words === "abcd",
      JSON.stringify({ before, after })
    );

    // 2. The play saw its focus; a focus the page asks for is its document's.
    const held = await frame.evaluate(() => {
      const field = document.querySelector<HTMLInputElement>(
        "[data-stage-drawing] [data-field]"
      );
      field?.focus();
      return {
        field: !!field,
        active: !!field && document.activeElement === field,
        drawn: field?.classList.contains("cawco-focus") ?? false,
      };
    });
    const still = await host(page);
    kit.check(
      "2: the play saw its field focused in its own document, and a field the page focuses is its document's focus, drawn focused, while the host keeps the window's focus",
      !pressed.failed &&
        held.field &&
        held.active &&
        held.drawn &&
        still.focus === "host-field",
      JSON.stringify({ pressed, held, host: still })
    );

    // 3. His press in the drawing takes the focus into it.
    await frame.locator("[data-stage-drawing] [data-field]").click();
    const pressedIn = {
      host: await host(page),
      frame: await frame.evaluate(() => {
        const field = document.querySelector(
          "[data-stage-drawing] [data-field]"
        );
        return {
          active: document.activeElement === field,
          focused: field?.matches(":focus") ?? false,
          hasFocus: document.hasFocus(),
        };
      }),
    };
    kit.check(
      "3: a press on the drawing's field takes the window's focus onto it",
      pressedIn.host.focus === "IFRAME" &&
        pressedIn.frame.active &&
        pressedIn.frame.focused &&
        pressedIn.frame.hasFocus,
      JSON.stringify(pressedIn)
    );
    await page.close();
  } finally {
    await served.stop(true);
    await stage.stop();
    rmSync(dir, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "stage-focus",
  run,
};
export default spec;
