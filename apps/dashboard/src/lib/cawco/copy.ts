/**
 * What a menu item does when it copies something: the toast says what was
 * copied, and the answer tells the item (components/ui/context-menu
 * CopyItem) whether to show its check before the menu closes.
 */
import { toast } from "svelte-sonner";

export async function copyToClipboard(
  what: string,
  text: string
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    // Denied permission, or no clipboard at all over plain http on a LAN address.
    toast.error(`Could not copy the ${what.toLowerCase()}.`);
    return false;
  }
}
