/**
 * One Caw on the tab icon's tile: a rounded square of one colour with
 * transparent corners, and Caw drawn over it by Rive from his status's file.
 * Nothing here draws him: the file's `CawStates` machine plays his loops and
 * its `Caw` view model holds him still (assets/mascot/README.md).
 *
 * The technique is a canvas read back as a PNG for the icon's href
 * (css-tricks.com/the-making-of-an-animated-favicon: "once the drawing is
 * done in the canvas, it's quickly translated to a PNG image to be assigned
 * as the favicon"). Each drawing is asked for with the time since the last
 * one, so Caw keeps his own pace however rarely he is drawn (same page:
 * "detect how much time has actually passed between each frame").
 */
import type { RuntimeLoader } from "@rive-app/canvas";

/** Rive's low-level runtime, the one the dashboard's `Rive` instances run on. */
export type RiveRuntime = Awaited<
  ReturnType<typeof RuntimeLoader.awaitInstance>
>;

/** The files' 592 px artboard and the 512 px still box in it, at (43, 40). */
const ARTBOARD = 592;
const BOX = { x: 43, y: 40, side: 512 };

/** The side a tab draws its icon at, in CSS px: what `tab-icon-r` is given at. */
export const TAB_ICON = 16;

export interface TileSpec {
  /** His status file's bytes. */
  bytes: ArrayBuffer;
  /** The tile's fill, any CSS colour. */
  colour: string;
  /** The corner radius at `TAB_ICON` px; it scales with `side`. */
  radius: number;
  /** The bitmap's side in px. */
  side: number;
  /** Held on his status's still, as Reduced Motion asks. */
  still: boolean;
}

export interface Tile {
  close: () => void;
  /** Moves Caw on by `seconds` and returns the tile as a PNG data URL. */
  draw: (seconds: number) => string;
}

export async function openTile(
  rive: RiveRuntime,
  spec: TileSpec
): Promise<Tile> {
  const { side } = spec;
  const file = await rive.load(new Uint8Array(spec.bytes));
  const artboard = file.artboardByName("Caw");
  const machine = new rive.StateMachineInstance(
    artboard.stateMachineByName("CawStates"),
    artboard
  );
  const caw = file.defaultArtboardViewModel(artboard).defaultInstance();
  // The tile is his ground in both schemes, so he is never the night Caw.
  caw.boolean("dark").value = false;
  caw.boolean("reducedMotion").value = spec.still;
  machine.bindViewModelInstance(caw);
  artboard.bindViewModelInstance(caw);
  machine.advanceAndApply(0);

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

  // His still box fills the tile; his acting past it is cut by the tile's edge.
  const scale = side / BOX.side;
  const frame = {
    minX: -BOX.x * scale,
    minY: -BOX.y * scale,
    maxX: (ARTBOARD - BOX.x) * scale,
    maxY: (ARTBOARD - BOX.y) * scale,
  };
  const corner = (spec.radius / TAB_ICON) * side;

  return {
    draw(seconds) {
      machine.advanceAndApply(seconds);
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
      machine.delete();
      caw.delete();
      artboard.delete();
      file.unref();
    },
  };
}
