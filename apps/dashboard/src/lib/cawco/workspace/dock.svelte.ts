/**
 * Conversations are mounted ONCE, by `PaneHost`, and docked into whichever
 * group holds them. A group never renders a `SessionPane`; it renders a slot
 * per tab and the host moves the pane's DOM into it.
 *
 * Every tree change used to remount. A split replaces the target leaf with
 * a branch, so both halves are new components; a move takes the conversation
 * out of one leaf's `mounted` and into another's; the phone-to-desk switch
 * swaps the whole grid. Each time the transcript rebuilt every row, virtua
 * re-measured from nothing, the scroll offset and the half-typed message were
 * gone, and for the length of that rebuild the pane was blank. Moving a DOM
 * node between parents keeps the component, its state and its measurements;
 * only the scroll offsets need carrying across, because a scrolling box is
 * destroyed with the layout box and comes back at zero.
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";

/**
 * Each tab's slot, by conversation id: where its pane is docked. Changes only
 * when a slot is registered or goes, never on a switch.
 */
export const slots = new SvelteMap<string, HTMLElement>();

/**
 * Whether each group is showing its tab's pane — on screen or mid-swipe. Kept
 * apart from `slots` and written only when a value changes, so a switch
 * wakes the two panes whose answer changed and nothing else. Stored with
 * the element, every switch handed every slot a new record: each pane's
 * props were evaluated again, and so was everything that read the slots.
 */
export const shownPanes = new SvelteMap<string, boolean>();

/**
 * The conversations whose pane has not drawn its first picture yet: its
 * placeholder still stands over history on its way or a transcript not yet
 * measured. Written by the pane (`SessionPane`, `ThreadPane`).
 *
 * A group lays such a pane out while it is hidden, and skips only those that
 * have drawn (PaneLeaf `.pane-settling`). A transcript draws once every row
 * in view is measured, and a skipped subtree is never measured: built in the
 * background behind `content-visibility: hidden`, a tab's transcript waited
 * for the click that showed it and then drew in front of the reader, over
 * 50-320ms of its skeleton.
 */
export const settling = new SvelteSet<string>();

/** Holds `id` in `settling` for as long as `veiled()` says its pane is still drawing. */
export function settleWhile(id: () => string, veiled: () => boolean): void {
  $effect(() => {
    const pane = id();
    if (!veiled()) {
      return;
    }
    settling.add(pane);
    return () => settling.delete(pane);
  });
}

/** A group's slot for one tab. Registered while the group keeps it mounted. */
export function slot(node: HTMLElement, param: { id: string; shown: boolean }) {
  let { id } = param;
  slots.set(id, node);
  shownPanes.set(id, param.shown);
  const release = () => {
    if (slots.get(id) === node) {
      slots.delete(id);
      shownPanes.delete(id);
    }
  };
  return {
    update(next: { id: string; shown: boolean }) {
      if (next.id !== id) {
        release();
        ({ id } = next);
      }
      if (slots.get(id) !== node) {
        slots.set(id, node);
      }
      if (shownPanes.get(id) !== next.shown) {
        shownPanes.set(id, next.shown);
      }
    },
    destroy: release,
  };
}

/** Within this of the end, a scrolling box is "at the bottom" — the transcript's own threshold. */
const TAIL = 120;

/**
 * The host's wrapper around one pane. Follows its slot wherever it goes.
 *
 * Scroll offsets and focus are recorded as they happen, not read at the
 * move: the old slot is torn out of the DOM before this effect runs, and a
 * detached box reports zero for everything. A box that was at its tail is
 * put back at the tail rather than at the same number, because the new
 * slot may be a different width.
 *
 * The scroll listener reads nothing. It hears every scroll of every box in
 * the pane, and any geometry read there — the offset getters included —
 * laid the page out inside the event, once per scroll event of a streaming
 * transcript. The boxes that scrolled are read together in a task queued
 * behind the frame that scrolled them, where the layout that frame drew is
 * still the page's.
 */
export function dock(node: HTMLElement, id: string) {
  const scrolled = new Map<
    HTMLElement,
    { top: number; left: number; tail: boolean }
  >();
  const unread = new Set<HTMLElement>();
  let reading: ReturnType<typeof setTimeout> | undefined;
  let focused: HTMLElement | null = null;

  const read = () => {
    reading = undefined;
    for (const el of unread) {
      if (el.isConnected) {
        scrolled.set(el, {
          top: el.scrollTop,
          left: el.scrollLeft,
          tail: el.scrollHeight - el.scrollTop - el.clientHeight < TAIL,
        });
      }
    }
    unread.clear();
  };
  const onscroll = (event: Event) => {
    const el = event.target;
    if (!(el instanceof HTMLElement)) {
      return;
    }
    unread.add(el);
    reading ??= setTimeout(read, 0);
  };
  const onfocusin = (event: FocusEvent) => {
    focused = event.target instanceof HTMLElement ? event.target : null;
  };
  const onfocusout = (event: FocusEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      !node.contains(event.relatedTarget)
    ) {
      focused = null;
    }
  };
  node.addEventListener("scroll", onscroll, { capture: true, passive: true });
  node.addEventListener("focusin", onfocusin);
  node.addEventListener("focusout", onfocusout);

  $effect(() => {
    const into = slots.get(id);
    if (!into || into === node.parentElement) {
      return;
    }
    into.appendChild(node);
    for (const [el, at] of scrolled) {
      if (!el.isConnected) {
        scrolled.delete(el);
        continue;
      }
      el.scrollTop = at.tail ? el.scrollHeight : at.top;
      el.scrollLeft = at.left;
    }
    if (focused?.isConnected && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
  });

  return {
    destroy() {
      clearTimeout(reading);
      node.removeEventListener("scroll", onscroll, true);
      node.removeEventListener("focusin", onfocusin);
      node.removeEventListener("focusout", onfocusout);
    },
  };
}
