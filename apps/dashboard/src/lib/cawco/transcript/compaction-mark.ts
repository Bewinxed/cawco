/**
 * Caw beside "Compacted": the one look he has in a transcript, named once so
 * the divider that shows him, the read that sees a compaction coming and the
 * list that waits for him all mean the same picture.
 */
import { untrack } from "svelte";
import { warmCawMark } from "../home/CawMark.svelte";
import { dur } from "../motion/curves.svelte";

/** His `compacted` file, in an 18px box with 2px of canvas past it. */
export const COMPACTION_MARK = {
  status: "compacted",
  size: 18,
  bleed: 2,
} as const;

/**
 * His picture on its way for a transcript that is waiting to show him: over
 * when it is drawn, or when `--dur-mark-hold` has passed, whichever is first.
 * Null when nothing is on its way.
 */
let coming: Promise<void> | null = null;

/**
 * A read holds a compaction: his rest is drawn now, while the rows it will
 * stand in are still being folded and laid out. Rive's runtime and his file
 * take longer to arrive than a transcript takes to be laid out (about 200ms
 * against 100ms on a cold load), so a list that opens on a compaction holds
 * its reveal for him (`compactionMarkComing`). A transcript with no
 * compaction asks for nothing.
 *
 * Untracked: a read is adopted inside a derivation (the pane's seeded
 * session), and the scheme and the display his look is drawn for are not
 * what that derivation is made of.
 */
export function warmCompactionMark(): void {
  untrack(() => {
    if (coming) {
      return;
    }
    const picture = warmCawMark(
      COMPACTION_MARK.status,
      COMPACTION_MARK.size,
      COMPACTION_MARK.bleed
    );
    if (!picture) {
      return;
    }
    // The hold's own bound: a transcript never hangs on the mascot. Past
    // it the list is shown and he is painted when he arrives.
    const cap = new Promise<void>((over) => {
      setTimeout(over, dur("--dur-mark-hold"));
    });
    const settled = Promise.race([picture, cap]).then(() => {
      if (coming === settled) {
        coming = null;
      }
    });
    coming = settled;
  });
}

/**
 * What a list that opens on a compaction waits for before it is shown: his
 * picture, or the hold's bound. Null when there is nothing to wait for — he
 * is drawn, or the bound has passed.
 */
export function compactionMarkComing(): Promise<void> | null {
  return coming;
}
