/**
 * What the delegate tray above the composer knows beyond the work items
 * themselves: whether each delegate's card is on screen, which delegates
 * have already entered the tray, and how each one did.
 *
 * The owner's rule: a delegate's chip enters the tray the FIRST time its card
 * in the transcript leaves the view, its mark flying from the card to the
 * chip. From then on the chip stays (until its work is done, or its failure
 * dismissed) and never flies again, even with the card back on screen. A
 * delegate whose card was never on screen when it started simply appears in
 * the tray, and one already running when the page loads is just there.
 *
 * Kept at module level, not in the tray: the tray is one per composer, and a
 * composer is handed from conversation to conversation, but "has this chip
 * entered yet" is a fact about the delegate.
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { whiffle } from "../client.svelte";
import { departBox } from "../motion/share.svelte";

/** How a chip entered the tray: its mark flew in, it faded in, or it was simply there. */
export type Entry = "fly" | "fade" | "none";

/** The flight's key: the chip's mark lands what the card's mark departed. */
export const flightKey = (instanceId: string) => `tray:${instanceId}`;

/** Chips that have entered the tray, by delegate instance id. */
export const entered = new SvelteMap<string, Entry>();

/** Work items whose chip has had its time on screen as done or cancelled, and left. */
export const left = new SvelteSet<string>();

/** Each registered card's visibility, by delegate instance id. */
const cards = new SvelteMap<string, "visible" | "hidden">();

/** Whether a delegate may enter the tray now: live work, or a failure not yet dismissed. */
function admissible(instanceId: string): boolean {
  const item = whiffle.workItemFor(instanceId);
  return (
    !!item &&
    (item.state === "starting" ||
      item.state === "running" ||
      (item.state === "failed" && item.dismissedAt === null))
  );
}

/** Admissions in one burst go 50ms apart, so several chips never land as one block. */
let burst: { at: number; count: number } = { at: 0, count: 0 };
function stagger(run: () => void): void {
  const now = performance.now();
  burst =
    now - burst.at < 50
      ? { at: now, count: burst.count + 1 }
      : { at: now, count: 0 };
  if (burst.count === 0) {
    run();
  } else {
    setTimeout(run, burst.count * 50);
  }
}

/** A chip enters without flying: faded in, or (on load) simply there. */
export function admit(instanceId: string, entry: "fade" | "none"): void {
  if (entered.has(instanceId)) {
    return;
  }
  if (entry === "none") {
    entered.set(instanceId, entry);
    return;
  }
  stagger(() => {
    if (!entered.has(instanceId)) {
      entered.set(instanceId, entry);
    }
  });
}

/** Whether a delegate's card is on screen right now. */
export const cardVisible = (instanceId: string): boolean =>
  cards.get(instanceId) === "visible";

/**
 * On a delegate card's mark: watches whether the card is in view, and the
 * first time it leaves while the delegate may enter the tray, its mark
 * departs for the chip and the chip enters.
 */
export function trayCard(instanceId: () => string | null) {
  return (mark: HTMLElement) => {
    const id = instanceId();
    if (!id) {
      return;
    }
    // The mark flies from where it was last drawn; the chip it flies to
    // enters in its turn in a burst.
    const leave = (from: DOMRect) => {
      if (entered.has(id) || !admissible(id)) {
        return;
      }
      departBox(flightKey(id), mark, true, from);
      stagger(() => {
        if (!entered.has(id)) {
          entered.set(id, "fly");
        }
      });
    };
    // While the card is on screen, every scroll notes where its mark is now.
    // Heard in the capture phase, before the transcript's own handler, which
    // may unmount the row in that same scroll: the note is where it went.
    let last: DOMRect | null = null;
    const note = () => {
      last = mark.getBoundingClientRect();
    };
    const opts = { capture: true, passive: true };
    const seen = new IntersectionObserver(([change]) => {
      const was = cards.get(id);
      const now = change.isIntersecting ? "visible" : "hidden";
      cards.set(id, now);
      if (now === "visible") {
        note();
        document.addEventListener("scroll", note, opts);
      } else {
        document.removeEventListener("scroll", note, opts);
      }
      if (was === "visible" && now === "hidden") {
        leave(mark.getBoundingClientRect());
      }
    });
    seen.observe(mark);
    return () => {
      seen.disconnect();
      document.removeEventListener("scroll", note, opts);
      // A long transcript unmounts a row it has scrolled well past, often in
      // the same frame the row left the view: that is the card leaving too.
      if (cards.get(id) === "visible" && last) {
        leave(last);
      }
      cards.delete(id);
    };
  };
}

/**
 * What the tray says out loud, for the transcript's live regions to read:
 * one polite and one assertive line per parent, each replaced by the next.
 */
export const trayNews = new SvelteMap<
  string,
  { polite: string; assertive: string; at: number }
>();
