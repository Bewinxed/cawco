/**
 * Drag to dismiss: a surface that came in from an edge goes back out through
 * it under the finger. The one helper every side sheet uses (ui/sheet), and
 * the one the workspace's and the new-session dialog's sheets adopt.
 *
 *   {@attach dragToDismiss({ edge: "left", dismiss: () => (open = false), fade: () => scrim })}
 *
 * The surface tracks the finger 1:1 along its axis. Dragged the other way,
 * past where it rests, it gives a little and no more (the deck's rubber
 * band). Let go past 30% of its size, or flicked toward its edge faster than
 * 0.3 px/ms, it leaves: the spring every hand-driven surface settles on
 * (motion/spring.ts) carries it the rest of the way at the speed
 * the finger left it, and `dismiss` is called at once, so the surface closes
 * while it travels. Otherwise the same spring puts it back. What `fade`
 * returns (a scrim) follows the share of the surface still on screen.
 *
 * Ownership is decided on the first real movement: along the axis it is the
 * surface's; across it, the content's own scroll keeps it. `touch-action`
 * leaves the cross axis to the browser, so a list inside still scrolls, and
 * a finger that lands on a link and drags is a drag, not a tap. The helper
 * sets it on the surface; the surface's stylesheet sets it on everything
 * inside (`pan-y` for a side sheet, `pan-x` for a top or bottom one), since
 * the browser reads it only from the finger's element up to the nearest
 * scroller, and a scroller inside with `auto` takes the drag for itself
 * (ui/sheet/sheet-content.svelte does this). A mouse is left alone: it has
 * the close button and Escape, and dragging a link is the browser's.
 *
 * CSS owns rest, this owns motion: while the finger holds the surface the
 * handler writes a translate straight onto it, and the settle is handed to
 * the compositor as keyframes. A spring back ends with the inline styles
 * cleared, on the frame its last keyframe already painted. A dismissal keeps
 * its last keyframe (`fill: forwards`), which outranks the surface's own CSS
 * exit, so the close its `dismiss` starts waits out the spring (bits-ui
 * unmounts once every animation on the node has finished) without drawing a
 * second exit over it.
 */
import { motionOk } from "./curves.svelte";
import { integrate, spring } from "./spring";

/** The edge a surface came in from, and leaves through. */
export type Edge = "left" | "right" | "top" | "bottom";

export interface DragToDismiss {
  /** Close the surface. Called once, as the spring that carries it off starts. */
  dismiss: () => void;
  edge: Edge;
  /** What fades out as the surface leaves (a scrim), read when a drag starts. */
  fade?: () => HTMLElement | null;
}

/** Travel before a touch is anything at all. */
const SLOP = 10;
/** Beyond this much cross-axis travel it is a scroll, whatever the axis travel is. */
const SLOPE = 0.7;
/** How far out counts as "meant it", as a fraction of the surface's size. */
const COMMIT = 0.3;
/** A flick: short but fast still counts, in px/ms. */
const FLICK = 0.3;
/** Samples older than this say nothing about the release, in ms. */
const VELOCITY_WINDOW = 80;
/** Past rest, a third of the finger's travel shows, and never more than a quarter of the surface. */
const RESIST = 0.35;
const RESIST_MAX = 0.25;

type Phase = "idle" | "armed" | "dragging" | "gone";

export function dragToDismiss({ edge, dismiss, fade }: DragToDismiss) {
  const horizontal = edge === "left" || edge === "right";
  /** Screen direction of "toward the edge". */
  const sign = edge === "left" || edge === "top" ? -1 : 1;

  return (node: HTMLElement) => {
    node.style.touchAction = horizontal ? "pan-y" : "pan-x";

    let phase: Phase = "idle";
    let pointer = -1;
    let startAlong = 0;
    let startAcross = 0;
    /** Where the surface was when the finger took hold: mid-settle, not 0. */
    let base = 0;
    /** Distance toward the edge, px, before the rubber band. */
    let offset = 0;
    let size = 0;
    let scrim: HTMLElement | null = null;
    let samples: Array<{ at: number; t: number }> = [];
    let settling: Animation[] = [];
    /** A drag just ended: the click it would end in is not a tap. */
    let dragged = false;

    const along = (event: PointerEvent) =>
      horizontal ? event.clientX : event.clientY;
    const across = (event: PointerEvent) =>
      horizontal ? event.clientY : event.clientX;
    /** Drawn distance: past rest, the rubber band. */
    const drawn = (at: number) =>
      at < 0 ? -Math.min(-at * RESIST, size * RESIST_MAX) : at;
    const place = (at: number) =>
      horizontal
        ? `translate3d(${sign * at}px, 0, 0)`
        : `translate3d(0, ${sign * at}px, 0)`;
    const cover = (at: number) =>
      String(1 - Math.min(1, Math.max(0, at / size)));

    const paint = (at: number) => {
      node.style.transform = place(drawn(at));
      if (scrim) {
        scrim.style.opacity = cover(at);
      }
    };

    const clear = () => {
      node.style.transform = "";
      if (scrim) {
        scrim.style.opacity = "";
      }
    };

    /** Where the surface is drawn now (an entrance or a settle may hold it), toward the edge. */
    const current = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return sign * (horizontal ? matrix.m41 : matrix.m42);
    };

    /** Everything moving the surface or its scrim stops where it is. */
    const stopAll = () => {
      for (const animation of [
        ...node.getAnimations(),
        ...(scrim?.getAnimations() ?? []),
      ]) {
        animation.cancel();
      }
      settling = [];
    };

    /** Release velocity toward the edge, px/ms. */
    const velocity = () => {
      const last = samples.at(-1);
      const first = samples.find(
        (sample) => last && last.t - sample.t <= VELOCITY_WINDOW
      );
      if (!(first && last) || last.t === first.t) {
        return 0;
      }
      return (last.at - first.at) / (last.t - first.t);
    };

    /** Spring from where the surface is drawn to `target`, at `v` px/ms. */
    function settle(target: number, v: number) {
      const path = integrate(drawn(offset) - target, v * 1000);
      const targets: Array<{ el: Element; frame: (x: number) => Keyframe }> = [
        { el: node, frame: (x) => ({ transform: place(x + target) }) },
      ];
      if (scrim) {
        targets.push({
          el: scrim,
          frame: (x) => ({ opacity: cover(x + target) }),
        });
      }
      settling = spring(path, targets);
      if (target !== 0) {
        return;
      }
      const [moving] = settling;
      const mine = settling;
      moving.finished.then(
        () => {
          if (settling === mine) {
            for (const animation of mine) {
              animation.cancel();
            }
            settling = [];
            clear();
          }
        },
        () => {
          /* a finger took the surface again mid-settle; it owns it now */
        }
      );
    }

    function release(allowed: boolean) {
      const v = velocity();
      const out = allowed && (offset / size > COMMIT || v > FLICK);
      if (out) {
        phase = "gone";
        if (motionOk.current) {
          settle(size, Math.max(v, 0));
        }
        dismiss();
        return;
      }
      phase = "idle";
      if (motionOk.current) {
        settle(0, v);
      } else {
        clear();
      }
    }

    const onDown = (event: PointerEvent) => {
      dragged = false;
      if (
        phase !== "idle" ||
        event.pointerType === "mouse" ||
        !event.isPrimary
      ) {
        return;
      }
      phase = "armed";
      pointer = event.pointerId;
      startAlong = along(event);
      startAcross = across(event);
    };

    /**
     * The first real movement decides whose touch it is: along the axis, the
     * surface takes hold where it is drawn; across it, the content scrolls.
     */
    const decide = (event: PointerEvent) => {
      const d = Math.abs(along(event) - startAlong);
      const cross = Math.abs(across(event) - startAcross);
      if (d < SLOP && cross < SLOP) {
        return;
      }
      if (cross > d * SLOPE) {
        phase = "idle";
        return;
      }
      phase = "dragging";
      node.setPointerCapture(pointer);
      size = horizontal ? node.offsetWidth : node.offsetHeight;
      scrim = fade?.() ?? null;
      base = current();
      stopAll();
      samples = [];
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      if (phase === "armed") {
        decide(event);
      }
      if (phase !== "dragging") {
        return;
      }
      offset = base + sign * (along(event) - startAlong);
      paint(offset);
      samples.push({ at: offset, t: event.timeStamp });
      while (
        samples.length > 2 &&
        event.timeStamp - samples[0].t > VELOCITY_WINDOW
      ) {
        samples.shift();
      }
    };

    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      pointer = -1;
      if (phase === "dragging") {
        dragged = event.type === "pointerup";
        release(event.type === "pointerup");
      } else if (phase === "armed") {
        phase = "idle";
      }
    };

    const onClick = (event: MouseEvent) => {
      if (dragged) {
        dragged = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    node.addEventListener("pointerdown", onDown);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onEnd);
    node.addEventListener("pointercancel", onEnd);
    node.addEventListener("click", onClick, { capture: true });
    return () => {
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onEnd);
      node.removeEventListener("pointercancel", onEnd);
      node.removeEventListener("click", onClick, { capture: true });
    };
  };
}
