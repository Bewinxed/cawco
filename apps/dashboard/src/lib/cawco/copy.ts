/**
 * What a control does when it copies something: the toast says what was
 * copied, and the answer tells the control (components/ui/context-menu
 * CopyItem, a copy button) whether to show its check. A copy the browser
 * refuses is never a toast (DESIGN.md, The Work Outlives Its Surface
 * Rule): the control says {@link copyRefused} on its own line (RowFault),
 * with Try again and the text itself under Show details to copy by hand.
 */
import { toast } from "./toasts";

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
    return false;
  }
}

/** A copy the browser refused, in the error formula, for the control's own line. */
export const copyRefused = (
  what: string,
  byHand = "from Show details"
): string =>
  `The browser didn't allow copying the ${what.toLowerCase()}. Try again, or copy it by hand ${byHand}.`;
