/**
 * Caw beside "Compacted": the one look he has in a transcript, named once so
 * the divider that shows him and the read that sees a compaction coming ask
 * for the same picture.
 */
import { warmCawMark } from "../home/CawMark.svelte";

/** His `compacted` file, in an 18px box with 2px of canvas past it. */
export const COMPACTION_MARK = {
  status: "compacted",
  size: 18,
  bleed: 2,
} as const;

/**
 * A read holds a compaction: his rest is drawn now, while the rows it will
 * stand in are still being folded and laid out, so the frame that shows the
 * list shows him. Rive's runtime and his file take longer to arrive than a
 * transcript takes to be revealed; started at the first divider's mount, his
 * box stood empty for a frame of a cold load. A transcript with no
 * compaction asks for nothing.
 */
export function warmCompactionMark(): void {
  warmCawMark(
    COMPACTION_MARK.status,
    COMPACTION_MARK.size,
    COMPACTION_MARK.bleed
  );
}
