import { configureWords, type Deleted } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { toast } from "../toasts";
import { restore } from "./unrestored.svelte";

export type { Deleted } from "@cawco/core";

/**
 * The toast after a config item's delete, which goes through at once, with
 * nothing asked first (JOURNEY.md Flow 5: "an undo affordance after the fact
 * rather than a confirm dialog before it"): the house toast with Undo for as
 * long as it stands. The toast pauses under a pointer and in a hidden tab,
 * so it is closed when the hub's window runs out, never offering an Undo
 * the hub can no longer honour. Undo puts the item back and hands it to
 * `land`, which puts its row back where it stood. A refused Undo is never
 * a toast: it is said on `where.section`, the list the row stood in
 * (SectionFrame, unrestored.svelte.ts), with Try again, through a reload.
 */
export function offerUndo<T>(
  id: string,
  words: string,
  deleted: Deleted,
  land: (row: T) => void,
  where: { section: string; name: string }
): void {
  const runsOut = setTimeout(() => toast.dismiss(id), deleted.restorableForMs);
  const settled = () => clearTimeout(runsOut);
  // The one toast the dashboard keeps (DESIGN.md, The Work Outlives Its
  // Surface Rule): it carries no failure, only the Undo of a delete that
  // went through, and a refused Undo is said on the section.
  toast(words, {
    id,
    action: {
      label: configureWords.undo,
      onClick: () => {
        settled();
        detach(restore(id, deleted, where, land), "restore");
      },
    },
    onDismiss: settled,
    onAutoClose: settled,
  });
}
