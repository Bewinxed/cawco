import type { Deleted } from "@cawco/core";
import { failureReason, failureWords, hubFailure } from "../hub-read";
import { toast } from "../toasts";

export type { Deleted } from "@cawco/core";

/**
 * Undo, for every config delete: the hub's trash puts the item back whole
 * (hub db/trash.ts) and answers it as its list reads it.
 */
async function restoreDeleted<T>(deleted: Deleted): Promise<T> {
  const response = await fetch(`/api/trash/${deleted.restore}/restore`, {
    method: "POST",
  });
  if (!response.ok) {
    // The hub says why in a sentence: its window ran out, or its name is taken.
    throw new Error(`${failureReason(await hubFailure(response))}.`);
  }
  return ((await response.json()) as { row: T }).row;
}

/**
 * The toast after a config item's delete, which goes through at once, with
 * nothing asked first (JOURNEY.md Flow 5: "an undo affordance after the fact
 * rather than a confirm dialog before it"): the house toast with Undo for as
 * long as it stands. The toast pauses under a pointer and in a hidden tab,
 * so it is closed when the hub's window runs out, never offering an Undo
 * the hub can no longer honour. Undo puts the item back and hands it to
 * `land`, which puts its row back where it stood; a failed Undo says why in
 * a toast of its own.
 */
export function offerUndo<T>(
  id: string,
  words: string,
  deleted: Deleted,
  land: (row: T) => void
): void {
  const runsOut = setTimeout(() => toast.dismiss(id), deleted.restorableForMs);
  const settled = () => clearTimeout(runsOut);
  toast(words, {
    id,
    action: {
      label: "Undo",
      onClick: () => {
        settled();
        restoreDeleted<T>(deleted)
          .then(land)
          .catch((error: unknown) => toast.error(failureWords(error)));
      },
    },
    onDismiss: settled,
    onAutoClose: settled,
  });
}
