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
 * inside it (a MutationObserver over its own subtree), inside the next
 * delivery, and written in the frame after. The watch over the document
 * only finds scrollers: each element put in is looked through for them, and
 * an element whose class changed is one or not by its own class. What
 * changes outside every scroller (a transcript's rows, a streamed record)
 * is looked at no further: read on its nearest scroller from one
 * MutationObserver over the whole document, every change on the page walked
 * up its ancestors (`closest`), a fling through find's 2,009 places spent
 * 86ms there at 4x.
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
  /** Scrollers to read in the next delivery. */
  const due = new Set<Element>();
  /** What the delivery read, written in the next frame. */
  const verdicts = new Map<Element, boolean>();
  /**
   * Read inside the delivery, on the layout the frame has just done; written
   * in the next frame (frameObserver `read`). Read in a frame callback of
   * its own instead, a second frame after the resize, every scroller's
   * `scrollHeight` laid the page out there under the frame's other writes
   * (a rail drag on nightly 7148: 2ms a frame).
   */
  const sizes = frameObserver(
    () => {
      for (const [node, runsPast] of verdicts) {
        if (
          node.isConnected &&
          node.hasAttribute("data-fade-runs") !== runsPast
        ) {
          node.toggleAttribute("data-fade-runs", runsPast);
        }
      }
      verdicts.clear();
    },
    {
      read: (entries) => {
        for (const { target } of entries) {
          const scroller = watched.has(target) ? target : target.parentElement;
          if (scroller && watched.has(scroller)) {
            due.add(scroller);
          }
        }
        for (const node of due) {
          if (node.isConnected) {
            verdicts.set(node, runs(node));
          }
        }
        due.clear();
      },
    }
  );
  /** A scroller read in the next delivery, though nothing in it resized (a part put in or taken out). */
  const soon = (node: Element) => {
    due.add(node);
    sizes.readNext();
  };
  /**
   * The scroller a change inside one is read on: the nearest watched one
   * round it (a scroller inside another is read for its own).
   */
  const scrollerOf = (record: MutationRecord): Element | null => {
    for (let at: Node | null = record.target; at; at = at.parentNode) {
      if (at instanceof Element && watched.has(at)) {
        return at;
      }
    }
    return null;
  };
  /**
   * Parts put into a scroller, at any depth: the scroller read again, and
   * those put in as its own children watched for their size from now on.
   */
  const inside = new MutationObserver((records) => {
    const grown = new Set<Element>();
    for (const record of records) {
      const scroller = scrollerOf(record);
      if (!scroller) {
        continue;
      }
      grown.add(scroller);
      for (const added of record.addedNodes) {
        if (added instanceof Element && added.parentElement === scroller) {
          sizes.observe(added);
        }
      }
    }
    for (const scroller of grown) {
      soon(scroller);
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
    inside.observe(node, { childList: true, subtree: true });
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
  /** The scrollers a change in the document made: what it put in, or the element whose class it set. */
  const discover = (record: MutationRecord) => {
    if (record.type === "attributes") {
      // A class makes only its own element a scroller.
      if (record.target instanceof Element && record.target.matches(FADES)) {
        watch(record.target);
      }
      return;
    }
    for (const added of record.addedNodes) {
      if (added instanceof Element) {
        found(added);
      }
    }
  };
  const changes = new MutationObserver((records) => {
    for (const record of records) {
      discover(record);
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
  found(root);
  return () => {
    changes.disconnect();
    inside.disconnect();
    sizes.disconnect();
  };
}
