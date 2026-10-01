/**
 * Which composers are on screen, and how tall each stands.
 *
 * A composer is the page's anchor at the foot of a conversation, and
 * anything else that floats at the bottom of the window — the desk's
 * toasts — has to clear it rather than land on its Send button. Each
 * composer reports its measured height while its conversation is showing;
 * the tallest is what a bottom-anchored overlay rises above. No composer on
 * screen (a config page, the fleet board) reads as zero.
 */
import { SvelteMap } from "svelte/reactivity";

const standing = new SvelteMap<object, number>();

/** Reports a composer's height; the returned function takes it back. */
export function stand(composer: object, height: number): () => void {
  standing.set(composer, height);
  return () => {
    standing.delete(composer);
  };
}

/** The tallest composer showing, in px; 0 when none is. */
export function tallestComposer(): number {
  let tallest = 0;
  for (const height of standing.values()) {
    tallest = Math.max(tallest, height);
  }
  return tallest;
}
