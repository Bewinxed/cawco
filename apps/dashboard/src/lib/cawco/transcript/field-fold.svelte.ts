/**
 * The composer field's fold: its one-line height and line height, off its
 * stylesheet, the height its whole text takes (autosize reports it at each
 * fit), and whether it has the focus.
 *
 * A draft of more than one line folds to its first line while the field
 * is not being written in, and opens to its full height, growing upward
 * over the transcript, when the field takes focus. Folding and opening
 * run over --duration-morph (autosize's `data-folding`, on the field while
 * that height change runs); a typed line grows over the field's own
 * --duration-control. A press on the pill's own send or attach leaves the
 * focus in the field (`ctrls`): taken from it as the press went down, the
 * draft folded, the button moved from under the press, its up landed off
 * it, and nothing was sent.
 */

export interface FieldFoldParts {
  field: () => HTMLDivElement | null;
}

export class FieldFold {
  floor = $state(0);
  lineHeight = $state(0);
  natural = $state(0);
  focused = $state(false);
  /** How many lines the draft runs to at the field's width. */
  readonly lines = $derived(
    this.lineHeight > 0
      ? Math.max(
          1,
          Math.round(
            (this.natural - this.floor + this.lineHeight) / this.lineHeight
          )
        )
      : 1
  );
  readonly folds = (whole: number) => !this.focused && whole > this.floor + 0.5;
  readonly folded = $derived(this.folds(this.natural));

  constructor(parts: FieldFoldParts) {
    $effect(() => {
      const field = parts.field();
      if (field) {
        const style = getComputedStyle(field);
        this.floor = Number.parseFloat(style.minHeight);
        this.lineHeight = Number.parseFloat(style.lineHeight);
      }
    });
    // The focus the field has as it comes in, which no focus event will say:
    // given before the page woke, or by a caller on arrival.
    $effect(() => {
      const field = parts.field();
      if (field && document.activeElement === field) {
        this.focused = true;
      }
    });
  }
}
