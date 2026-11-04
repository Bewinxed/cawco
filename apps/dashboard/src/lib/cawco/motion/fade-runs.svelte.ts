/**
 * Whether a scroller runs past its box, for the house edge fade to stand
 * only then: `{@attach fadeRuns}` sets `data-fade-runs` on the scroller
 * while its content is taller than it by a pixel or more, read on the
 * scroller and each of its children in the next frame after a change
 * (frameObserver), and `data-fade-watch` saying it is watched: edge-fade.css
 * draws the block fade on a watched scroller only while it runs past.
 *
 * Why: the fade's lengths ride a scroll timeline, and Chromium leaves one
 * whose range has collapsed to nothing (the content shrank to fit, a card
 * that overflowed while it rose) at its end, 100%, "finished", rather than
 * inactive: the top fade then stood in full over a box that does not
 * scroll (measured: scrollTop 0, scrollHeight 715 = clientHeight 715,
 * `--fade-start` 40px; the cold review 78bedc47 measured 101/101 on a
 * question's body). A box that does not run past has no fade to draw.
 */
import type { Attachment } from "svelte/attachments";
import { frameObserver } from "../frame-observer";

export const fadeRuns: Attachment<HTMLElement> = (node) => {
  node.toggleAttribute("data-fade-watch", true);
  const watched = new Set<Element>();
  const read = () => {
    node.toggleAttribute(
      "data-fade-runs",
      node.scrollHeight - node.clientHeight >= 1
    );
  };
  const sizes = frameObserver(() => {
    read();
    // Parts that came since are watched too.
    for (const part of node.children) {
      if (!watched.has(part)) {
        watched.add(part);
        sizes.observe(part);
      }
    }
  });
  sizes.observe(node);
  for (const part of node.children) {
    watched.add(part);
    sizes.observe(part);
  }
  const parts = new MutationObserver(() => read());
  parts.observe(node, { childList: true });
  read();
  return () => {
    sizes.disconnect();
    parts.disconnect();
  };
};
