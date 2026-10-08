/**
 * The goodbye a box says once Reload is chosen (the update toast, Home's
 * update card): it turns into Caw, waiting on his `loading`, beside "See
 * you in a bit", and stays so until the tab goes.
 *
 * The box drops what it showed at once and takes its goodbye's height (the
 * toast's `morph`, the card's `reflow` box), while copies of what it showed,
 * pinned where each stood, leave top down on the list switch's exit
 * (motion/list-swap) and the line arrives as a switch's new row does, once
 * the first old row is out. With reduced motion the two cross-fade.
 *
 * Nothing of the notice is kept: the copies are inert DOM, gone once they
 * are out, so whatever the acknowledgement changes upstream can never reach
 * the box again.
 */
import { dur, ease, motionOk } from "../motion/curves.svelte";
import { IN_MS, ListSwap, OUT_MS } from "../motion/list-swap.svelte";

export const GOODBYE = "See you in a bit";

/** The rows of what leaves: a heading, a bullet or a paragraph of the notes. */
const ROWS = "h1, h2, h3, h4, h5, h6, li, p";

/**
 * Copies `leaving` into `layer` (an inert layer over the box, `inset: 0`)
 * where each stands now, and plays the copies out: each row of them, top
 * down, on the list switch's exit stagger. Call it in the same task as the
 * change that drops the originals, before it is written. The layer is
 * emptied once the last copy is out.
 */
export function leaveInPlace(
  leaving: readonly HTMLElement[],
  layer: HTMLElement
): void {
  const base = layer.getBoundingClientRect();
  const copies = leaving.map((element) => {
    const at = element.getBoundingClientRect();
    const copy = element.cloneNode(true) as HTMLElement;
    for (const named of [copy, ...copy.querySelectorAll("[id]")]) {
      named.removeAttribute("id");
    }
    Object.assign(copy.style, {
      position: "absolute",
      margin: "0",
      top: `${at.top - base.top}px`,
      left: `${at.left - base.left}px`,
      width: `${at.width}px`,
      height: `${at.height}px`,
    });
    return { copy, scrolled: element.scrollTop };
  });
  layer.append(...copies.map(({ copy }) => copy));
  for (const { copy, scrolled } of copies) {
    copy.scrollTop = scrolled;
  }

  const empty = () => layer.replaceChildren();
  if (!motionOk.current) {
    layer
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-fade"),
        easing: ease("--ease-out"),
        fill: "forwards",
      })
      .finished.then(empty, empty);
    return;
  }
  const rows = copies
    .flatMap(({ copy }) => {
      const inner = [...copy.querySelectorAll<HTMLElement>(ROWS)];
      return copy.matches(ROWS) || inner.length === 0 ? [copy] : inner;
    })
    .map((row) => ({ row, top: row.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top);
  const outs = rows.map(({ row }, i) =>
    row.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateX(-18px)" },
      ],
      {
        duration: OUT_MS,
        delay: ListSwap.leaveEnd(i) - OUT_MS,
        easing: ease("--ease-out"),
        fill: "both",
      }
    )
  );
  Promise.allSettled(outs.map((out) => out.finished)).then(empty, empty);
}

/**
 * The goodbye's line arriving, as an attachment: a switch's new row, in
 * once the first old row is out; with reduced motion, a fade.
 */
export function arrive(line: HTMLElement): void {
  if (!motionOk.current) {
    line.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: ease("--ease-out"),
      fill: "backwards",
    });
    return;
  }
  line.animate(
    [
      { opacity: 0, transform: "translateX(18px)" },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: IN_MS,
      delay: ListSwap.enterAt(0, ListSwap.leaveEnd(0)),
      easing: ease("--ease-out"),
      fill: "backwards",
    }
  );
}
