/**
 * Caw's head on the tab icon's tile: a rounded square of one colour with
 * transparent corners, and Caw drawn over it by Rive from his status's file,
 * seen through a shot's head box (shots.ts). Nothing here draws him: the
 * file's own animation for the loop is applied at the frame asked for, the
 * way assets/mascot/scripts/prove-viewmodel.mjs renders each loop.
 *
 * The technique is a canvas read back as a PNG for the icon's href
 * (css-tricks.com/the-making-of-an-animated-favicon: "once the drawing is
 * done in the canvas, it's quickly translated to a PNG image to be assigned
 * as the favicon").
 */
import type { RuntimeLoader } from "@rive-app/canvas";
import { FPS, HEAD, type Shot } from "./shots";

/** Rive's low-level runtime, the one the dashboard's `Rive` instances run on. */
export type RiveRuntime = Awaited<
  ReturnType<typeof RuntimeLoader.awaitInstance>
>;

/** The files' 592 px artboard and the 512 px still box in it, at (43, 40). */
const ARTBOARD = 592;
const BOX = { x: 43, y: 40 };

/** The side a tab draws its icon at, in CSS px: what `tab-icon-r` is given at. */
export const TAB_ICON = 16;

export interface TileSpec {
  /** The shot's status file's bytes. */
  bytes: ArrayBuffer;
  /** The tile's fill, any CSS colour. */
  colour: string;
  /** The corner radius at `TAB_ICON` px; it scales with `side`. */
  radius: number;
  shot: Shot;
  /** The bitmap's side in px. */
  side: number;
}

export interface Tile {
  close: () => void;
  /** The tile with Caw at `frame` of the shot's loop, as a PNG data URL. */
  draw: (frame: number) => string;
}

export async function openTile(
  rive: RiveRuntime,
  spec: TileSpec
): Promise<Tile> {
  const { shot, side } = spec;
  const file = await rive.load(new Uint8Array(spec.bytes));
  const artboard = file.artboardByName("Caw");
  const animation = (name: string) =>
    new rive.LinearAnimationInstance(artboard.animationByName(name), artboard);
  // The tile is his ground in both schemes, so he is never the night Caw.
  for (const name of ["scheme_light", "motion_full"]) {
    const layer = animation(name);
    layer.apply(1);
    layer.delete();
  }
  const loop = shot.animation ? animation(shot.animation) : undefined;

  // Rive draws him alone on his own canvas; the tile takes him from it.
  const ink = document.createElement("canvas");
  ink.width = side;
  ink.height = side;
  const renderer = rive.makeRenderer(ink);
  const tile = document.createElement("canvas");
  tile.width = side;
  tile.height = side;
  const context = tile.getContext("2d");
  if (!context) {
    throw new Error("The tab icon has no 2D canvas");
  }

  // His head box fills the tile; the rest of him is cut by the tile's edge.
  const scale = side / HEAD;
  const left = BOX.x + shot.at.x - HEAD / 2;
  const top = BOX.y + shot.at.y - HEAD / 2;
  const frame = {
    minX: -left * scale,
    minY: -top * scale,
    maxX: (ARTBOARD - left) * scale,
    maxY: (ARTBOARD - top) * scale,
  };
  const corner = (spec.radius / TAB_ICON) * side;

  return {
    draw(at) {
      if (loop) {
        // Mid-way through the frame, clear of the key on its start.
        loop.time = (at + 0.5) / FPS;
        loop.apply(1);
      }
      artboard.advance(0);
      renderer.clear();
      renderer.save();
      renderer.align(
        rive.Fit.contain,
        rive.Alignment.center,
        frame,
        artboard.bounds
      );
      artboard.draw(renderer);
      renderer.restore();
      renderer.flush();
      rive.resolveAnimationFrame();

      context.clearRect(0, 0, side, side);
      context.save();
      context.beginPath();
      context.roundRect(0, 0, side, side, corner);
      context.clip();
      context.fillStyle = spec.colour;
      context.fillRect(0, 0, side, side);
      context.drawImage(ink, 0, 0);
      context.restore();
      return tile.toDataURL("image/png");
    },
    close() {
      renderer.delete();
      loop?.delete();
      artboard.delete();
      file.unref();
    },
  };
}
