/**
 * Whether each house edge-fade scroller (`.kit-edge-fade` across,
 * `.kit-edge-fade-block` down) runs past its box, so the fade stands only
 * then: one watch over the document (`watchEdgeFades`, from the app's root
 * and the decision host), which sets `data-fade-runs` on a scroller while
 * its content is longer than it along its axis by a pixel or more.
 * edge-fade.css draws no fade on a scroller without it.
 *
 * Why: the fade's lengths ride a scroll timeline, and Chromium leaves one
 * whose range has collapsed to nothing (the content shrank to fit, a card
 * that overflowed while it rose) at its end, 100%, "finished", rather than
 * inactive: the start fade then stood in full over a box that does not
 * scroll (measured: scrollTop 0, scrollHeight 715 = clientHeight 715,
 * `--fade-start` 40px; a question's body at 101/101). A box that does not
 * run past has no fade to draw.
 *
 * A scroller is read when it or one of its parts changes size (one
 * ResizeObserver, frameObserver), and when anything is put in or taken out
 * inside it (one MutationObserver over the document, each change read on
 * its nearest scroller), in the next frame.
 */
import { frameObserver } from "../frame-observer";

const FADES = ".kit-edge-fade, .kit-edge-fade-block";

/** Whether a scroller runs past its box along its fade's axis. */
const runs = (node: Element): boolean =>
  node.classList.contains("kit-edge-fade-block")
    ? node.scrollHeight - node.clientHeight >= 1
    : node.scrollWidth - node.clientWidth >= 1;

/** Starts the watch over `root`; hands back its stop. */
export function watchEdgeFades(root: ParentNode = document): () => void {
  const watched = new Set<Element>();
  const due = new Set<Element>();
  let frame = 0;
  const read = () => {
    frame = 0;
    for (const node of due) {
      if (node.isConnected) {
        node.toggleAttribute("data-fade-runs", runs(node));
      }
    }
    due.clear();
  };
  const soon = (node: Element) => {
    due.add(node);
    frame ||= requestAnimationFrame(read);
  };
  const sizes = frameObserver((changed) => {
    for (const node of changed) {
      const scroller = watched.has(node) ? node : node.parentElement;
      if (scroller && watched.has(scroller)) {
        soon(scroller);
      }
    }
  });
  const watch = (node: Element) => {
    if (watched.has(node)) {
      return;
    }
    watched.add(node);
    sizes.observe(node);
    for (const part of node.children) {
      sizes.observe(part);
    }
    soon(node);
  };
  /**
   * Every scroller at or under `node`. The document (or a shadow root) is no Element:
   * the first sweep over it (`found(root)`, the root layout's mount, which
   * runs after the page under it has mounted) must still read the scrollers
   * already standing, or one that grows without a node put into it (a list
   * drawn whole at its first render) is never read.
   */
  const found = (node: Node) => {
    if (node instanceof Element && node.matches(FADES)) {
      watch(node);
    }
    if (
      node instanceof Element ||
      node instanceof Document ||
      node instanceof DocumentFragment
    ) {
      for (const inner of node.querySelectorAll(FADES)) {
        watch(inner);
      }
    }
  };
  /** Parts put into a watched scroller: watched for their size from now on, and the scroller read again. */
  const grew = (record: MutationRecord) => {
    const target = record.target instanceof Element ? record.target : null;
    const scroller = target?.closest(FADES);
    if (!(scroller && watched.has(scroller))) {
      return;
    }
    for (const added of record.addedNodes) {
      if (added instanceof Element && added.parentElement === scroller) {
        sizes.observe(added);
      }
    }
    soon(scroller);
  };
  const changes = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        found(record.target);
        continue;
      }
      for (const added of record.addedNodes) {
        found(added);
      }
      grew(record);
    }
    for (const node of watched) {
      if (!node.isConnected) {
        watched.delete(node);
      }
    }
  });
  changes.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  found(root as Node);
  return () => {
    changes.disconnect();
    sizes.disconnect();
    cancelAnimationFrame(frame);
  };
}
