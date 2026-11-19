/**
 * A reply's frame (MessageBody): its words at the measure. Holding an
 * agent's block (`data-block-key`, TranscriptBlock) it is the block's size
 * container, the room a sized Diagram measures (`cqi`); holding a block that
 * needs the room (`data-block-wide`: a `full` Diagram, a Table wider than
 * the measure) it stands the turn's width, and hands its words the measure
 * (`--words-measure`, which app.css caps them at). Said by the frame's own
 * `:has()`, the frame alone is its anchor.
 */
export const REPLY_FRAME =
  "max-w-c-measure has-[[data-block-key]]:@container has-[[data-block-wide]]:max-w-none has-[[data-block-wide]]:[--words-measure:var(--spacing-c-measure)]";
