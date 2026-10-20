/**
 * A picture of one frame of a component canvas: the one path every picture
 * of a frame is taken by, the daemon's render (stage-render.ts) and the
 * probe kit's captures (scripts/probe-kit/canvas-shots.ts) alike.
 *
 * The canvas draws its frames in one world that pans and zooms by a single
 * transform, inside a box that clips it (stage-host canvas runtime.ts). So
 * where a frame stands on the page, and at what size, depends on the view
 * and the window: a frame scrolled "into view" can stand outside the
 * canvas's box, and a window as narrow as a phone's shows a frame zoomed to
 * fit, so a 390 frame's picture came out 272 px wide. A picture depends on
 * neither. The canvas answers for its own frames: which frame a story names
 * (`frameNamed`, waking its section if the stage's sweep took it down),
 * where it stands for its picture (`pose`: zoom 1, in the middle, whatever
 * the window's width, held there; it answers the room the window lacks),
 * whether it has settled (`settled`) and how its body stands (`picture`).
 * Here the window is grown by the room the canvas lacks, the frame is posed
 * again in it and left to settle, and the picture is of its body alone, by
 * its own rect, refused unless the body stands whole in the canvas at its
 * own size and the png is its CSS size times the device's scale.
 */
import type { FramePictureRead, Interaction } from "@cawco/core/stage";
import type { Page } from "playwright-core";

/** Why a frame's picture can't be taken as it is, in words a tool answers. */
export class FramePictureRefusal extends Error {}

/** What the canvas answers for its frames' pictures (runtime.ts `CanvasState`). */
interface Pictures {
  __cawcoCanvas?: {
    frameNamed: (
      name: string,
      interaction?: Interaction
    ) => Promise<{ key: string } | { refused: string }>;
    lacks: (key: string) => { h: number; w: number } | null;
    picture: (key: string) => FramePictureRead | null;
    pose: (key: string) => { h: number; w: number } | null;
    settled: (key: string) => boolean;
  };
}

/**
 * The key of the frame story `name` (`Story`, or `file:Story` where two
 * states files name one story alike) draws in state `interaction`.
 */
export async function findFrame(
  page: Page,
  name: string,
  interaction: Interaction = "rest"
): Promise<string> {
  const found = await page.evaluate(
    ([story, state]) =>
      (globalThis as unknown as Pictures).__cawcoCanvas?.frameNamed(
        story,
        state
      ) ?? null,
    [name, interaction] as const
  );
  if (!found) {
    throw new FramePictureRefusal("The page holds no canvas.");
  }
  if ("refused" in found) {
    throw new FramePictureRefusal(found.refused);
  }
  return found.key;
}

/**
 * Places frame `key` for its picture: the canvas's `pose`, which shows it
 * (on a phone a frame not shown has no box to measure) and answers the room
 * the window lacks to hold it whole at its own size; the window grown by
 * that, and the frame posed again in the room; then settled: its fonts
 * loaded, every finite animation on it, in it or on what holds it (the
 * world's move) landed. All within `timeout` ms.
 */
export async function poseFrame(
  page: Page,
  key: string,
  timeout: number
): Promise<void> {
  const pose = (one: string) =>
    (globalThis as unknown as Pictures).__cawcoCanvas?.pose(one) ?? null;
  const lacks = await page.evaluate(pose, key);
  if (!lacks) {
    throw new FramePictureRefusal(`The canvas draws no frame ${key}.`);
  }
  if (lacks.w > 0 || lacks.h > 0) {
    const view = page.viewportSize() ?? { width: 0, height: 0 };
    const grown = {
      width: view.width + lacks.w,
      height: view.height + lacks.h,
    };
    await page.setViewportSize(grown);
    // `pose` centres the frame in the canvas as it stands when called: the
    // canvas has its room first, or the frame is centred in the old one.
    await page
      .waitForFunction(
        (one) => {
          const room = (globalThis as unknown as Pictures).__cawcoCanvas?.lacks(
            one
          );
          return !!room && room.w === 0 && room.h === 0;
        },
        key,
        { timeout }
      )
      .catch(() => {
        throw new FramePictureRefusal(
          `The canvas never had the room for frame ${key} at its own size, in a ${grown.width}×${grown.height} window.`
        );
      });
    await page.evaluate(pose, key);
  }
  await page
    .waitForFunction(
      (one) =>
        (globalThis as unknown as Pictures).__cawcoCanvas?.settled(one) ??
        false,
      key,
      { timeout }
    )
    .catch(() => {
      throw new FramePictureRefusal(
        `Frame ${key} did not settle within ${timeout} ms: its fonts or animations are still going.`
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
 * The picture of frame `key`'s body, posed (`poseFrame`): its own rect,
 * animations held, the caret hidden, with the clip it was taken by in page
 * CSS px (its corner on a whole device pixel at or before the body's, so a
 * point of the page stands in the png at `(x − clip.x) × scale`). Refused
 * when the body stands scaled or not whole in the canvas, or when the png is
 * not its CSS size times the device's scale.
 */
export async function framePicture(
  page: Page,
  key: string
): Promise<{
  clip: { x: number; y: number; w: number; h: number };
  png: Buffer;
  read: FramePictureRead;
}> {
  const read = await page.evaluate(
    (one) =>
      (globalThis as unknown as Pictures).__cawcoCanvas?.picture(one) ?? null,
    key
  );
  if (!read) {
    throw new FramePictureRefusal(`The canvas draws no frame ${key}.`);
  }
  const { rect, own, scale } = read;
  // At its own size the box on the page is its layout box; anything else is
  // a zoom or a transform still running over it.
  if (Math.abs(rect.w - own.w) > SAME || Math.abs(rect.h - own.h) > SAME) {
    throw new FramePictureRefusal(
      `Frame ${key} stands ${rect.w.toFixed(2)}×${rect.h.toFixed(2)} px on the page for its own ${own.w.toFixed(2)}×${own.h.toFixed(2)}, ${read.view}: its picture would be scaled.`
    );
  }
  if (!read.whole) {
    throw new FramePictureRefusal(
      `Frame ${key} does not stand whole in the canvas (${JSON.stringify(rect)}, ${read.view}): its picture would be cut.`
    );
  }
  // The clip as the screenshot takes it, so it rounds nothing: its corner on
  // a whole device pixel at or before the box's, and its size in whole CSS
  // pixels (Playwright floors a clip's size to whole CSS pixels before
  // Chromium sees it, `helper.enclosingIntSize`), out to the box's far edge.
  // The picture then holds every pixel the frame touches.
  const left = Math.floor(rect.x * scale) / scale;
  const top = Math.floor(rect.y * scale) / scale;
  const width = Math.ceil(rect.x + rect.w - left - SAME);
  const height = Math.ceil(rect.y + rect.h - top - SAME);
  const png = await page.screenshot({
    clip: { x: left, y: top, width, height },
    animations: "disabled",
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
      `Frame ${key}'s picture came out ${size.w}×${size.h} px for its own ${own.w.toFixed(2)}×${own.h.toFixed(2)} at ×${scale} (its clip, ${width}×${height} CSS px from (${left}, ${top}), is ${want.w}×${want.h}).`
    );
  }
  return { clip: { x: left, y: top, w: width, h: height }, png, read };
}
