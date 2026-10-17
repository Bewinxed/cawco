import { failureWords } from "../hub-read";
import { type RuleRow, removeRule, restoreRule } from "../rules";
import { toast } from "../toasts";
import type { ConfigStore } from "./store.svelte";

/**
 * A rule's delete: one gesture, nothing asked first (JOURNEY.md Flow 5: "an
 * undo affordance after the fact rather than a confirm dialog before it").
 * The hub stops the rule at once and keeps it whole for the window it
 * answers with; the list drops its row, and the house toast offers Undo for
 * as long as it stands. The toast pauses under a pointer and in a hidden
 * tab, so it is closed when the hub's window runs out, never offering an
 * Undo the hub can no longer honour. Undo puts the row back where it stood,
 * marked.
 *
 * `leave` runs once the hub has taken it and before its row goes: the
 * editor goes back to the list there, so the row is seen leaving it. A
 * refused delete throws the hub's sentence and leaves the row standing.
 */
export async function deleteRule(
  store: ConfigStore,
  rule: Pick<RuleRow, "id" | "name">,
  leave?: () => Promise<unknown>
): Promise<void> {
  const restorableForMs = await removeRule(rule.id, rule.name);
  await leave?.();
  if (store.rules.value) {
    store.rules.value = store.rules.value.filter((row) => row.id !== rule.id);
  }
  if (restorableForMs > 0) {
    offerUndo(store, rule, restorableForMs);
  }
}

function offerUndo(
  store: ConfigStore,
  rule: Pick<RuleRow, "id" | "name">,
  windowMs: number
): void {
  const id = `rule-deleted:${rule.id}`;
  const runsOut = setTimeout(() => toast.dismiss(id), windowMs);
  const settled = () => clearTimeout(runsOut);
  toast(`Deleted ${rule.name}`, {
    id,
    action: {
      label: "Undo",
      onClick: () => {
        settled();
        // biome-ignore lint/complexity/noVoid: the undo says its own failure; nothing waits on it
        void undo(store, rule);
      },
    },
    onDismiss: settled,
    onAutoClose: settled,
  });
}

async function undo(
  store: ConfigStore,
  rule: Pick<RuleRow, "id" | "name">
): Promise<void> {
  try {
    const back = await restoreRule(rule.id, rule.name);
    // The list is newest first (the hub's order), so it stands where it stood.
    store.rules.value = [
      ...(store.rules.value ?? []).filter((row) => row.id !== back.id),
      back,
    ].toSorted((a, b) => b.createdAt - a.createdAt);
    store.mark(back.id);
  } catch (error) {
    toast.error(failureWords(error));
  }
}
