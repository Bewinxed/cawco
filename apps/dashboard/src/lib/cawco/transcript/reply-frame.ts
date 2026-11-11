/**
 * A reply's frame (MessageBody): its words at the measure. Holding an
 * agent's block (`data-block-key`, TranscriptBlock) it is the block's size
 * container, the room a sized Diagram measures (`cqi`); holding a block that
 * needs the room (`data-block-wide`: a `full` Diagram, a Table wider than
 * the measure) it stands the turn's width, its words kept at the measure
 * (app.css).
 */
export const REPLY_FRAME =
  "max-w-c-measure has-[[data-block-key]]:@container has-[[data-block-wide]]:max-w-none";
