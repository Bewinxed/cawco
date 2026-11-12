/**
 * What a decision page's Preview (`by=embed`) tells the page holding it
 * (core stage.ts `CANVAS_EMBED_*`; dashboard decisions host Preview.svelte
 * and embed-turns.ts): that its graph arrived, then its column's shape once
 * it has settled, or why it can't draw what the Preview names. The column
 * of drawings is the stage's (stage.ts `bootColumn`); this says its shape.
 *
 * The shape is said once the column has settled: every states file drawn
 * or saying why not, every drawing laid out by a frame, the faces loaded,
 * its arrivals played to their end and its pictures loaded (or failed: a
 * picture that fails stands as what its component draws for one), and a
 * frame gone by in which nothing laid out anew. Its arrivals are waited
 * for, never landed: a
 * framework's transition ends by its own clock (Svelte's runs to its
 * planned end in its frame loop, the Web Animation only drawing it), so
 * landed, RoutineForm's next field still unfolded at the first one's
 * planned end, after its shape was said.
 *
 * Each drawing's own ResizeObserver hears it lay out
 * ({@link EmbedTeller.changed}), made once the drawing has mounted and its
 * effects have run, so it hears after the component's own observers: what
 * their answers lay out anew in the same frame is heard before the column
 * is called settled. Each change costs one frame's callback and the task
 * after that frame, where nothing heard since says it settled: what an
 * observer answered in one frame and wrote in the next's callbacks (the
 * dashboard's frameObserver) is heard in it. Read in the task after the
 * frame the drawings were last heard in instead, a frame sooner, TaskOutput,
 * StopTrayPick, FolderFile and ReportOutputs said one shape and then
 * another (states-mount). On WebKit, whose one main thread draws every
 * frame of a page of Previews, each frame waited for took 240 to 760 ms,
 * and the double-rAF read each height change took held the page of five
 * past its bound (canvas-parallel, 7fc9b5c7e).
 */

import { readWithin } from "@cawco/core/bounded";
import {
  CANVAS_EMBED_FAILED,
  CANVAS_EMBED_FETCHED,
  CANVAS_EMBED_SEEN,
  CANVAS_EMBED_SIZE,
  CANVAS_GRAPH_FETCHED,
  type CanvasGraph,
} from "@cawco/core/stage";

/** What the column answers its teller with. */
export interface EmbedColumn {
  /** What is still arriving in it, each settling once it has: a finite animation a story set off (a Svelte `in:`, a fold; never a loop) at its end, a picture once it loaded or failed. */
  arriving: () => Promise<unknown>[];
  /** The column's element: its height is the shape's. */
  el: HTMLElement;
  /** Why it can't draw what its Preview names, in plain words; null while it draws. */
  failure: () => string | null;
  /** Every states file it draws from has drawn or said why not, and every drawing has been laid out by a frame. */
  ready: () => boolean;
  /** The stories it draws, by name, for a warning. */
  stories: () => string[];
  /** Its widest story's own width; null where none names one. */
  width: () => number | null;
}

export interface EmbedTeller {
  /** A drawing laid out anew (its observer heard it), or the column's states files drew: its shape is read again once it settles. */
  changed: () => void;
  /** A states file's stories mounted afresh (loaded, or loaded again as it was edited): the next shape is theirs at rest, once they settle. */
  mounted: () => void;
}

/**
 * How long an embed in view waits on its stories settling before it says
 * its height anyway: the house's longest motion that ends,
 * `--dur-goo-settle`. A story that starts one animation after another (a
 * ticker, a carousel) never settles, and its Preview would otherwise say it
 * didn't load: the height that held is said, and the canvas warns, naming
 * its stories.
 */
function longMotionMs(): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--dur-goo-settle")
    .trim();
  return value.endsWith("ms")
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000;
}

/**
 * The page holding the embed hears its whole graph arrived
 * (`CANVAS_EMBED_FETCHED`), once its page's preloads have all answered,
 * before it is evaluated and drawn: its modules are the page's now, and the
 * budget they held is free for the embeds still waiting (embed-turns.ts).
 * Every page the stage serves carries its graph (host.ts `closureOf`).
 */
function tellGraphFetched(): void {
  const graph = (window as unknown as { __cawcoGraph: CanvasGraph })
    .__cawcoGraph;
  const tell = () =>
    window.parent.postMessage({ type: CANVAS_EMBED_FETCHED }, "*");
  if (graph.whole) {
    tell();
  } else {
    addEventListener(CANVAS_GRAPH_FETCHED, tell, { once: true });
  }
}

/**
 * The column's shape told the page holding it: `CANVAS_EMBED_SIZE` with
 * its height and its widest story's own width, every drawing at its own
 * size, 1 CSS px per px, never scaled; said again whenever it changes, and
 * `rest` while it is its stories' shape at rest (said before any press or
 * key in it), the one the page keeps for the next Preview's first paint.
 * Said once every states file has drawn or says why it didn't, never of
 * what stands for them: the page holding it ends this embed's turn at its
 * shape (embed-turns.ts). An embed that can't draw what its Preview names
 * says why instead (`CANVAS_EMBED_FAILED`): a shape of nothing drawn stood
 * in its Preview as an empty box.
 *
 * A frame off the page's screen gets no rendering steps (Chromium
 * throttles a cross-origin frame there) until it is scrolled to: its shape
 * waits for its first frame. Once its box has stood in that page's view
 * (`CANVAS_EMBED_SEEN`), it waits on its stories settling at most
 * {@link longMotionMs}, then says the height that held.
 */
export function tellHolder(column: EmbedColumn): EmbedTeller {
  tellGraphFetched();
  let saidShape = "";
  /** A shape has been said since the stories mounted: from then on each change is said as it lays out. */
  let settledOnce = false;
  /** Whether the next shape said is its stories' at rest: none said yet, and no press or key in the embed. */
  let atRest = true;
  for (const input of ["pointerdown", "keydown"] as const) {
    document.addEventListener(
      input,
      () => {
        atRest = false;
      },
      true
    );
  }
  /** When the page holding it said its box stood in its view, by `performance.now()`; null until then. */
  let seenAt: number | null = null;
  const longest = longMotionMs();
  /** How many times a drawing has laid out anew, or the column changed: a settle reads none since its frame's callback. */
  let changes = 0;
  /** A settle is asked for and not yet read. */
  let asked = false;

  /** The shape said, unless it is the one said last. */
  const post = (height: number) => {
    const width = column.width();
    const shape = `${width} ${height}`;
    if (shape === saidShape) {
      return;
    }
    saidShape = shape;
    window.parent.postMessage(
      { type: CANVAS_EMBED_SIZE, height, width, rest: atRest },
      "*"
    );
    atRest = false;
  };

  /** Why it can't draw, said once per why; whether it can't. */
  const failed = (): boolean => {
    const why = column.failure();
    if (why === null) {
      return false;
    }
    if (saidShape !== `failed ${why}`) {
      saidShape = `failed ${why}`;
      window.parent.postMessage({ type: CANVAS_EMBED_FAILED, why }, "*");
    }
    return true;
  };

  /**
   * A settle asked for: in the next frame's callbacks, then in the task
   * after that frame (its observers delivered), read whether anything laid
   * out anew in it; once nothing did, the column has settled.
   */
  function ask(): void {
    if (asked || !column.ready() || failed()) {
      return;
    }
    asked = true;
    requestAnimationFrame(() => {
      const at = changes;
      setTimeout(() => {
        asked = false;
        if (changes === at) {
          readShape();
        } else {
          ask();
        }
      }, 0);
    });
  }

  /** The column read once a frame went by with nothing laid out anew: the faces loaded and its arrivals ended first, then its height said. */
  function readShape(): void {
    if (failed()) {
      return;
    }
    const capped = seenAt !== null && performance.now() - seenAt >= longest;
    if (!(settledOnce || capped)) {
      if (document.fonts.status !== "loaded") {
        document.fonts.ready.then(ask, ask);
        return;
      }
      // Arrived, it lays out (and what follows it starts) in that frame: read again then.
      const arriving = column.arriving();
      if (arriving.length > 0) {
        const ended = () => Promise.allSettled(arriving);
        // It waits on them only for the long motion's time (one paused never
        // ends: a skeleton's fade-in its cover pauses once it is ready), from
        // when it was seen, else from now; then reads which still run.
        readWithin(
          seenAt === null
            ? longest
            : Math.max(0, seenAt + longest - performance.now()),
          ended
        ).then(ask, ask);
        return;
      }
    }
    const height = Math.ceil(column.el.offsetHeight);
    if (capped && !settledOnce) {
      console.warn(
        `[cawco] ${column.stories().join(", ")} still settling ${longest} ms after coming into view: its height is said as it stood, ${height}px.`
      );
    }
    settledOnce = true;
    post(height);
  }

  addEventListener("message", (event) => {
    if (
      event.source === window.parent &&
      (event.data as { type?: unknown } | null)?.type === CANVAS_EMBED_SEEN
    ) {
      seenAt ??= performance.now();
      ask();
    }
  });

  return {
    changed: () => {
      changes += 1;
      ask();
    },
    mounted: () => {
      atRest = true;
      settledOnce = false;
    },
  };
}
