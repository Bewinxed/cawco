/**
 * Content that mounts a frame's budget at a time. A drawer is anything that
 * draws in steps — a panel's rows, one message's blocks — and each frame runs
 * steps until the frame has spent `BUDGET_MS`: every step is flushed and laid
 * out on its own, so what it costs to build and to lay out is counted before
 * the next one starts. The newest drawer goes first: a message mounted by a
 * panel's step finishes its blocks before the panel draws its next row, so
 * what is drawn is always a prefix of what will be.
 */
import { flushSync } from "svelte";

export interface Drawer {
  /** Draws one more unit; says whether any remain. */
  step(): boolean;
}

/** What a frame may spend drawing, in ms. */
const BUDGET_MS = 8;

const drawers: Drawer[] = [];
let frame = 0;
let running = false;
/** The drawer whose step is being flushed, while it is. */
let current: Drawer | null = null;

function run(start: number): void {
  frame = 0;
  running = true;
  let drawer = drawers.at(-1);
  while (drawer) {
    let more = false;
    const stepped = drawer;
    current = stepped;
    flushSync(() => {
      more = stepped.step();
    });
    current = null;
    // biome-ignore lint/complexity/noVoid: a layout read, made for its side effect of laying the step out now
    void document.documentElement.offsetHeight;
    // A step can end its own drawer: the flush it ran may have taken down
    // what registered it.
    const index = drawers.indexOf(stepped);
    if (!more && index >= 0) {
      drawers.splice(index, 1);
    }
    if (performance.now() - start >= BUDGET_MS) {
      break;
    }
    drawer = drawers.at(-1);
  }
  running = false;
  if (drawers.length > 0) {
    frame = requestAnimationFrame(run);
  }
}

/** Draw in steps from the next frame on; returns what stops it. */
export function draw(drawer: Drawer): () => void {
  drawers.push(drawer);
  if (frame === 0 && !running) {
    frame = requestAnimationFrame(run);
  }
  return () => {
    const index = drawers.indexOf(drawer);
    if (index >= 0) {
      drawers.splice(index, 1);
    }
  };
}

/** Whether what mounts now is mounted by a step, and so drawn in steps too. */
export function stepping(): boolean {
  return current !== null;
}
