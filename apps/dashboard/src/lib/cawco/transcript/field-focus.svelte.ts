/**
 * The words put back from outside (Edit on a failed send, a starter) land
 * with focus and the caret after them, and fade up in the field over
 * --dur-control rather than replacing what was there in one frame. Their
 * attachments come back with them, and the row that holds those folds
 * open above the field. The caret waits for the tick: the field draws the
 * words in its own effect, and drawing them drops any selection.
 *
 * The request holds until the focus has landed: asked before the field is
 * drawn, it waits for it; refused (the field not yet focusable as its
 * card comes in), it asks again each frame, a few frames at most.
 */
import { tick } from "svelte";
import { dur, ease } from "#lib/platform/motion/curves.svelte.js";
import type MentionField from "../find/MentionField.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";

/** How many frames a focus request asks again before it lets go. */
const FOCUS_TRIES = 10;

export interface FieldFocusParts {
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  /** The field has the keys, or not: what its fold rule reads. */
  focused: (focused: boolean) => void;
  mentionField: () => ReturnType<typeof MentionField> | undefined;
}

export function landFocusRequests(parts: FieldFocusParts): void {
  $effect(() => {
    const el = parts.field();
    if (!(parts.draft().focusWanted && el)) {
      return;
    }
    let frame = 0;
    let tries = 0;
    const land = () => {
      // Never scrolled to: a comment's card took the focus as it opened and
      // the browser scrolled what held the pane, moving the card under the
      // eye after its first frame (the owner: "it jumps between them before
      // it settles"). The field stands where its surface puts it.
      el.focus({ preventScroll: true });
      if (
        document.activeElement !== el &&
        el.isConnected &&
        tries < FOCUS_TRIES
      ) {
        tries += 1;
        frame = requestAnimationFrame(land);
        return;
      }
      // A field that already held the focus fires no focus event as it is
      // asked for it again: what it holds is read here, so its fold rule
      // knows the person is in it.
      parts.focused(document.activeElement === el);
      tick().then(() =>
        parts.mentionField()?.select(parts.draft().text.length)
      );
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
      parts.draft().focusWanted = false;
    };
    land();
    return () => cancelAnimationFrame(frame);
  });
}
