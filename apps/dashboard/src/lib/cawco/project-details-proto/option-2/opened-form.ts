/**
 * How the view's opened setups and forms stand (the tie's setup, adding a
 * folder, the custom large-file server, a consequential act's say-first):
 * on the page's ground with the rest of the view, bounded as a group by the
 * visible border, so its controls are the only raised surfaces in it; its
 * head in strong ink, its fields far enough apart that each label reads
 * with its own control: a field's label sits a space-2 over its control,
 * the next field a space-5 below.
 */

/** The opened form's surface and its fields' rhythm. */
export const OPENED_FORM =
  "flex min-w-0 flex-col gap-space-5 rounded-md border border-border p-space-4";

/** One field: its label over its control. */
export const FORM_FIELD = "flex min-w-0 flex-col gap-space-2";

/** A field's label, where its control is a group (a radiogroup takes no `<label>`); a text field's is Field's own. */
export const FORM_LABEL = "m-0 type-meta text-ink-muted";
