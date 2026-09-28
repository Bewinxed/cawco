/**
 * One confirmation primitive for the whole app.
 *
 * Destructive actions used to each carry their own `AlertDialog` + open-state +
 * a captured row — duplicated in every component, and skipped entirely in the
 * ones that never got around to it (a bare click that removed an MCP server from
 * every machine, no undo). This replaces all of that: `await confirm({...})`
 * anywhere, one `<ConfirmDialog/>` mounted once in the shell renders it.
 *
 *   await confirm({
 *     title: 'Remove X?',
 *     destructive: true,
 *     pendingLabel: 'Removing…',
 *     run: () => remove(x),
 *   });
 *
 * The confirm button starts `run` and goes pending (spinner, `pendingLabel`)
 * with the dialog left open until the work ends; then the dialog closes and
 * the promise resolves `true`. Cancel or dismiss resolves `false`; work that
 * throws leaves the dialog open. A new ask while one is open cancels the
 * first — there is a single dialog, so there is a single question at a time.
 */

export interface ConfirmRequest {
  /** The consequence, in plain words — what is lost, whether it can be undone. */
  body?: string;
  cancelLabel?: string;
  /** The confirm button's label. Say the verb ('Remove everywhere'), not 'OK'. */
  confirmLabel?: string;
  /** Paints the confirm button as destructive. Defaults on for a delete-shaped verb. */
  destructive?: boolean;
  /** What the confirm button says while `run` runs ("Deleting…"). */
  pendingLabel: string;
  /** The work the confirm button starts. */
  run: () => Promise<unknown>;
  /** The question, as a heading. Name the thing and its blast radius here. */
  title: string;
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let pending = $state<Pending | null>(null);

/** What the single `<ConfirmDialog/>` host reads and answers through. */
export const confirmHost = {
  get pending(): Pending | null {
    return pending;
  },
  /** The reader declined: the question ends unanswered. */
  dismiss(): void {
    const settle = pending?.resolve;
    pending = null;
    settle?.(false);
  },
  /**
   * The reader confirmed: the work runs, and the question ends once it has
   * (unless it was dismissed or replaced meanwhile). Work that throws leaves
   * the question open.
   */
  async accept(): Promise<void> {
    const asked = pending;
    if (!asked) {
      return;
    }
    await asked.run();
    if (pending === asked) {
      pending = null;
      asked.resolve(true);
    }
  },
};

/** Ask the reader to confirm, then run the work. Resolves true once it has run, false if they declined. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { ...request, resolve };
  });
}
