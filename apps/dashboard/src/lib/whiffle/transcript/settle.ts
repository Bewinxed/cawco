/**
 * A parked prompt settling into its row.
 *
 * While an ask is parked, its card on the composer IS the call it gates: the
 * transcript leaves that call's row out (rows.ts, `drawnOf`). Once the ask is
 * answered — here, from Telegram, from another tab — the row is drawn again,
 * and the card flies into it: its box travels from where it stood on the
 * composer to the row's box and takes the row's size, fading over
 * --dur-morph on --ease-out while the row fades in under it, so the answer
 * reads as one object moving, never one vanishing while another appears.
 * The box followed is the row's live one, so the transcript pinning its tail
 * mid-flight carries the landing with it.
 *
 * The card's slot in the stack closes at once, and the cards above slide down
 * on the stack's own reflow (`data-flip-anchor` hands this card to the flight
 * instead of to the reflow's copy, as AttentionQueue does for its asks). A row
 * that is not on screen (the reader has scrolled up) is not flown to: the card
 * fades where it stood. With reduced motion the card is simply gone.
 *
 * The card and its row meet on the call's id: the row carries it as
 * `data-call` (ToolGroup's call row, QuestionCard's section).
 */
import { CURVE, dur, easeOut, motionOk } from "../motion/curves.svelte";

/** Frames the transcript gets to draw the row before the card stops waiting for it. */
const PATIENCE = 8;

/** The card as it stands, laid over the page where it stands: what flies. */
function ghostOf(card: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...ghost.querySelectorAll("*")]) {
    node.removeAttribute("data-flip");
    node.removeAttribute("data-share");
    node.removeAttribute("data-key");
    node.removeAttribute("id");
  }
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "40",
  });
  document.body.append(ghost);
  return ghost;
}

/** The call's row where the reader can see it, or why there is none. */
function rowOf(call: string): HTMLElement | "away" | null {
  const rows = document.querySelectorAll<HTMLElement>(
    `[data-call="${CSS.escape(call)}"]`
  );
  if (rows.length === 0) {
    return null;
  }
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const view = (
      row.closest('[role="log"]') ?? document.documentElement
    ).getBoundingClientRect();
    if (box.height > 0 && box.bottom > view.top && box.top < view.bottom) {
      return row;
    }
  }
  return "away";
}

const mix = (from: number, to: number, p: number): number =>
  from + (to - from) * p;

/** The card flying into `call`'s row once the transcript draws it, or fading where it stood. */
function fly(ghost: HTMLElement, from: DOMRect, call: string | undefined) {
  const ms = dur("--dur-morph");
  const gone = () => ghost.remove();
  let waited = 0;
  let row: HTMLElement | null = null;
  let start = 0;
  const frame = (now: number) => {
    if (!row) {
      const found = call ? rowOf(call) : "away";
      if (found === null && waited < PATIENCE) {
        waited += 1;
        requestAnimationFrame(frame);
        return;
      }
      if (found === null || found === "away") {
        ghost
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: ms,
            easing: CURVE.out,
            fill: "forwards",
          })
          .finished.then(gone, gone);
        return;
      }
      row = found;
      start = now;
      row.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: ms,
        easing: CURVE.out,
      });
    }
    const t = Math.min(1, (now - start) / ms);
    const p = easeOut(t);
    const to = row.getBoundingClientRect();
    Object.assign(ghost.style, {
      left: `${mix(from.left, to.left, p)}px`,
      top: `${mix(from.top, to.top, p)}px`,
      width: `${mix(from.width, to.width, p)}px`,
      height: `${mix(from.height, to.height, p)}px`,
      opacity: `${1 - p}`,
    });
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      gone();
    }
  };
  requestAnimationFrame(frame);
}

/**
 * The card's outro (`out:settleInto={toolUseId}`): the card leaves the stack
 * at once and a copy of it flies into the row of the call it gated.
 */
export function settleInto(card: HTMLElement, call: string | undefined) {
  card.setAttribute("data-flip-anchor", "");
  if (motionOk.current) {
    const rect = card.getBoundingClientRect();
    if (rect.height > 0) {
      fly(ghostOf(card, rect), rect, call);
    }
  }
  return { duration: 0 };
}
