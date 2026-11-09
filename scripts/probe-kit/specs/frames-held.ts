/**
 * What `artifact_read` says a component canvas's frames looked like
 * outlives the stage that drew them. The stage host keeps what a browser
 * drew in memory alone (agent stage-host/host.ts `reports`); a stage that
 * slept (no viewer for core `STAGE_IDLE_MS`), restarted, or whose daemon
 * (a nightly's rollout) or clone was made again answers every frame
 * `unseen`, 0×0, drawn at 1970 (host.ts `reportOf`, `new Date(0)`). Two
 * canvases read that way after a Send on 2026-11-05 at 12:26Z, when
 * nightly 6821 restarted the daemons; no Send, the person's or the hub's
 * (artifacts/service.ts `sendPage`, `sendAnswered`), writes the record.
 *
 * The hub's rule, pure (hub artifacts/component.ts `drawsHeld`), fed the
 * stage's answers as host.ts makes them:
 *
 * - h0. Without it (as main read), the stage's answer after it ended says
 *   every frame unseen, 0×0, at 1970.
 * - h1. A draw kept, then the stage's answer after it ended: every frame
 *   reads as drawn, with its box, at the draw's time and by its drawer.
 * - h2. A states file changed since the draw (its hash differs): its frames
 *   stay unseen until a browser draws them.
 * - h3. The stage's standing problem on the same content (frames `failed`):
 *   it stands, never the old draw.
 * - h4. A newer draw replaces the kept one; a states file the canvas no
 *   longer has leaves the record.
 * - h5. Two states files, one drawn by the stage now and one held: each
 *   section is its own draw, the report's time the newest.
 *
 * End to end, on a scratch fleet (host only): session-sheet's leg 12b reads
 * the npm canvas after a Send and its stage's sleep.
 *
 *   bun scripts/probe-kit/run.ts frames-held
 */

import type { DrawnKept } from "../../../packages/core/src/doc-meta";
import type {
  FrameRender,
  RenderReport,
  SectionRender,
} from "../../../packages/core/src/stage";
import {
  drawsHeld,
  renderSaid,
} from "../../../packages/hub/src/artifacts/component";
import type { Kit, Spec } from "../kit";

const FILE = "src/Card.stories.js";
const OTHER = "src/Other.stories.js";
const DRAWN_AT = "2026-11-05T12:20:00.000Z";
const EPOCH = new Date(0).toISOString();

/** One frame as a browser drew it, or as the stage says one no browser drew. */
const frame = (story: string, state: FrameRender["state"]): FrameRender => {
  const seen = state === "drawn";
  return {
    story,
    label: story,
    form: "fit",
    interaction: "rest",
    scheme: "light",
    width: 0,
    state,
    box: seen ? { x: 0, y: 0, w: 320, h: 48 } : { x: 0, y: 0, w: 0, h: 0 },
    text: seen ? story : "",
    parts: [],
  };
};

/** A section of `file` at content `hash`, its frames in `state`, said drawn at `at` when the stage holds a draw. */
const section = (
  file: string,
  hash: string,
  state: FrameRender["state"],
  at?: string
): SectionRender => ({
  ...(at ? { drawn: { at, by: "stage" as const } } : {}),
  file,
  title: file,
  hash,
  frames: ["One", "Two"].map((story) => frame(story, state)),
  moves: [],
  notForced: [],
});

/** The stage's answer: its newest draw's time, or 1970 when it holds none (host.ts `reportOf`). */
const answer = (at: string, sections: SectionRender[]): RenderReport => ({
  at,
  by: at === EPOCH ? "panel" : "stage",
  page: { errors: [] },
  sections,
  unnamed: [],
});

/** One states file's entry in a kept record, when it has one. */
const keptOf = (
  record: Record<string, DrawnKept>,
  file: string
): DrawnKept | undefined => record[file];

const said = (report: RenderReport) => {
  const render = renderSaid(report);
  return `${render.by} at ${render.at}: ${render.frames
    .map((one) => `${one.story} ${one.state} ${one.box.w}×${one.box.h}`)
    .join(", ")}`;
};

const run = (kit: Kit) => {
  const drawn = answer(DRAWN_AT, [section(FILE, "h1", "drawn", DRAWN_AT)]);
  const ended = answer(EPOCH, [section(FILE, "h1", "unseen")]);

  // h0. What main answered: the stage's answer as it stands.
  const bare = renderSaid(ended);
  kit.check(
    "h0: without the held draw, the stage's answer after it ended says every frame unseen, 0×0, at 1970",
    bare.at === EPOCH &&
      bare.frames.every(
        (one) => one.state === "unseen" && one.box.w === 0 && one.box.h === 0
      ),
    said(ended)
  );

  // h1. The draw kept, then the stage ended.
  const first = drawsHeld(drawn, {});
  const after = drawsHeld(ended, first.kept);
  const read = renderSaid(after.report);
  kit.check(
    "h1: after the stage ended, every frame reads as drawn, with its box, at the draw's time and by its drawer",
    keptOf(first.kept, FILE)?.at === DRAWN_AT &&
      read.at === DRAWN_AT &&
      read.by === "stage" &&
      read.frames.length === 2 &&
      read.frames.every(
        (one) => one.state === "drawn" && one.box.w === 320 && one.box.h === 48
      ) &&
      JSON.stringify(after.kept) === JSON.stringify(first.kept),
    said(after.report)
  );

  // h2. Its states file changed since.
  const edited = drawsHeld(
    answer(EPOCH, [section(FILE, "h2", "unseen")]),
    first.kept
  );
  kit.check(
    "h2: a states file changed since the draw stays unseen, and the kept draw stays kept",
    renderSaid(edited.report).frames.every((one) => one.state === "unseen") &&
      keptOf(edited.kept, FILE)?.section.hash === "h1",
    said(edited.report)
  );

  // h3. The stage's own problem on the same content.
  const failing = drawsHeld(
    answer(EPOCH, [section(FILE, "h1", "failed")]),
    first.kept
  );
  kit.check(
    "h3: the stage's standing problem on the same content stands, never the old draw",
    renderSaid(failing.report).frames.every((one) => one.state === "failed"),
    said(failing.report)
  );

  // h4. A newer draw; a file the canvas dropped.
  const later = "2026-11-05T13:00:00.000Z";
  const withOld: Record<string, DrawnKept> = {
    ...first.kept,
    [OTHER]: keptOf(first.kept, FILE) as DrawnKept,
  };
  const redrawn = drawsHeld(
    answer(later, [section(FILE, "h3", "drawn", later)]),
    withOld
  );
  kit.check(
    "h4: a newer draw replaces the kept one, and a states file the canvas no longer has leaves the record",
    keptOf(redrawn.kept, FILE)?.at === later &&
      keptOf(redrawn.kept, FILE)?.section.hash === "h3" &&
      !(OTHER in redrawn.kept) &&
      !("drawn" in (keptOf(redrawn.kept, FILE)?.section ?? {})),
    JSON.stringify(Object.keys(redrawn.kept))
  );

  // h5. Two states files: one the stage drew since it started, one held.
  const now = "2026-11-05T12:40:00.000Z";
  const both = drawsHeld(
    answer(now, [
      section(FILE, "h1", "unseen"),
      section(OTHER, "o1", "drawn", now),
    ]),
    first.kept
  );
  const { sections } = both.report;
  kit.check(
    "h5: two states files, each its own draw (one held, one the stage's now), the report's time the newest",
    sections[0]?.drawn?.at === DRAWN_AT &&
      sections[1]?.drawn?.at === now &&
      both.report.at === now &&
      renderSaid(both.report).frames.every((one) => one.state === "drawn") &&
      keptOf(both.kept, OTHER)?.at === now,
    said(both.report)
  );
  return Promise.resolve();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "frames-held",
  run,
};
export default spec;
