/**
 * A picture of one state of a component canvas: the one path every picture
 * of a state is taken by (the daemon's render, stage-render.ts).
 *
 * The canvas page stands the component on its stage (stage-host canvas
 * stage.ts): one drawing at a time, at 1:1, laid out at its width, the page
 * scrolling where the drawing is larger than the window. So a picture
 * depends on the window being large enough. The stage answers for its own
 * drawing: which state a story names (`stateNamed`, once its states file
 * has drawn), the drawing stood at it for its picture (`pose`: mounted
 * afresh at rest, its interaction forced; it answers the room the window
 * lacks), whether it has settled (`settled`) and how it stands
 * (`picture`). Here the window is grown by the room the stage lacks, the
 * state is posed again in it and left to settle, and the picture is of the
 * drawing alone, by its own rect, refused unless it stands whole in the
 * window at its own size and the png is its CSS size times the device's
 * scale, the scale written in it (its `pHYs`, core picture-scale.ts).
 */
import { withPngScale } from "@cawco/core/picture-scale";
import type { FramePictureRead, Interaction } from "@cawco/core/stage";
import type { Page } from "playwright-core";
import { holdTimeAnimations } from "./chromium";
import {
  pictureNow,
  poseNow,
  roomHeld,
  settledNow,
  stateNamedNow,
} from "./in-page/page";

/** Why a state's picture can't be taken as it is, in words a tool answers. */
class FramePictureRefusal extends Error {}

/**
 * The key of the state story `name` (`Story`, or `file:Story` where two
 * states files name one story alike) stands at in interaction `interaction`.
 */
export async function findState(
  page: Page,
  name: string,
  interaction: Interaction = "rest"
): Promise<string> {
  const found = await page.evaluate(stateNamedNow, [
    name,
    interaction,
  ] as const);
  if (!found) {
    throw new FramePictureRefusal("The page holds no stage.");
  }
  if ("refused" in found) {
    throw new FramePictureRefusal(found.refused);
  }
  return found.key;
}

/**
 * Stands the stage at state `key` for its picture: the stage's `pose`,
 * which mounts it and answers the room the window lacks to hold it whole at
 * its own size; the window grown by that, and the state posed again in the
 * room; then settled: its fonts loaded, every finite animation in it
 * landed. All before `deadline` (epoch ms): the render's one limit, which
 * every wait of its draw shares.
 */
export async function poseState(
  page: Page,
  key: string,
  deadline: number
): Promise<void> {
  const left = () => Math.max(1, deadline - Date.now());
  const lacks = await page.evaluate(poseNow, key);
  if (!lacks) {
    throw new FramePictureRefusal(`The stage draws no state ${key}.`);
  }
  if (lacks.w > 0 || lacks.h > 0) {
    const view = page.viewportSize() ?? { width: 0, height: 0 };
    const grown = {
      width: view.width + lacks.w,
      height: view.height + lacks.h,
    };
    await page.setViewportSize(grown);
    // The stage lays the drawing out in the window as it stands: it has its room first.
    await page.waitForFunction(roomHeld, key, { timeout: left() }).catch(() => {
      throw new FramePictureRefusal(
        `The stage never had the room for state ${key} at its own size, in a ${grown.width}×${grown.height} window.`
      );
    });
    await page.evaluate(poseNow, key);
  }
  await page.waitForFunction(settledNow, key, { timeout: left() }).catch(() => {
    throw new FramePictureRefusal(
      `State ${key} did not settle within the render's time: its fonts or animations are still going.`
    );
  });
}

/** Lengths that differ by less than this are one length: layout's float noise, never a zoom. */
const SAME = 0.05;

/** A png's size, from its header. */
const pngSize = (png: Buffer) => ({
  w: png.readUInt32BE(16),
  h: png.readUInt32BE(20),
});

/**
 * The picture of state `key`'s drawing, posed (`poseState`): its own rect,
 * time's animations held (a scroller's drawn where its scroller stands), the
 * caret hidden, with the clip it was taken by in page
 * CSS px (its corner on a whole device pixel at or before the body's, so a
 * point of the page stands in the png at `(x − clip.x) × scale`). Refused
 * when the drawing stands scaled or not whole in the window, or when the png is
 * not its CSS size times the device's scale.
 */
export async function statePicture(
  page: Page,
  key: string
): Promise<{
  clip: { x: number; y: number; w: number; h: number };
  png: Buffer;
  read: FramePictureRead;
}> {
  const read = await page.evaluate(pictureNow, key);
  if (!read) {
    throw new FramePictureRefusal(`The stage draws no state ${key}.`);
  }
  const { rect, own, scale } = read;
  // At its own size the box on the page is its layout box; anything else is
  // a zoom or a transform still running over it.
  if (Math.abs(rect.w - own.w) > SAME || Math.abs(rect.h - own.h) > SAME) {
    throw new FramePictureRefusal(
      `State ${key} stands ${rect.w.toFixed(2)}×${rect.h.toFixed(2)} px on the page for its own ${own.w.toFixed(2)}×${own.h.toFixed(2)}, ${read.view}: its picture would be scaled.`
    );
  }
  if (!read.whole) {
    throw new FramePictureRefusal(
      `State ${key} does not stand whole in the window (${JSON.stringify(rect)}, ${read.view}): its picture would be cut.`
    );
  }
  // The clip as the screenshot takes it, so it rounds nothing: its corner on
  // a whole device pixel at or before the box's, and its size in whole CSS
  // pixels (Playwright floors a clip's size to whole CSS pixels before
  // Chromium sees it, `helper.enclosingIntSize`), out to the box's far edge.
  // The picture then holds every pixel the drawing touches.
  const left = Math.floor(rect.x * scale) / scale;
  const top = Math.floor(rect.y * scale) / scale;
  const width = Math.ceil(rect.x + rect.w - left - SAME);
  const height = Math.ceil(rect.y + rect.h - top - SAME);
  await holdTimeAnimations(page);
  const png = await page.screenshot({
    clip: { x: left, y: top, width, height },
    caret: "hide",
  });
  const size = pngSize(png);
  const want = {
    w: Math.round(width * scale),
    h: Math.round(height * scale),
  };
  if (
    size.w !== want.w ||
    size.h !== want.h ||
    size.w < own.w * scale - SAME ||
    size.h < own.h * scale - SAME
  ) {
    throw new FramePictureRefusal(
      `State ${key}'s picture came out ${size.w}×${size.h} px for its own ${own.w.toFixed(2)}×${own.h.toFixed(2)} at ×${scale} (its clip, ${width}×${height} CSS px from (${left}, ${top}), is ${want.w}×${want.h}).`
    );
  }
  // The png records the scale it was taken at (core picture-scale.ts), so a
  // page that shows it draws it at the drawing's own size.
  return {
    clip: { x: left, y: top, w: width, h: height },
    png: Buffer.from(withPngScale(png, scale)),
    read,
  };
}
