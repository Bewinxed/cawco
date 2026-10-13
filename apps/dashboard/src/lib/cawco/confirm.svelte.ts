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
 * throws leaves the dialog open with the error's message under the body, so
 * `run` reports a failure by throwing, not by toasting and returning. A new
 * ask while one is open cancels the
 * first — there is a single dialog, so there is a single question at a time.
 *
 * `from` names what asked (DESIGN.md, The Stay In Context Rule): the dialog
 * opens out of that row or item, so the question is seen to come from the
 * thing it is about.
 *
 * The dialog holds the page (a scrim, focus kept inside). The Open Page Rule
 * keeps that for the rare question that acting elsewhere would make wrong;
 * a question that nothing elsewhere can break is asked in the page, beside
 * its control (`ask-here.svelte.ts`, `AskHere.svelte`), through the same
 * `Asker`.
 */
import { departBox } from "./motion/share.svelte";

/** What any question needs: the work its confirm button starts. */
export interface Askable {
  run: () => Promise<unknown>;
}

export interface ConfirmRequest extends Askable {
  /**
   * The consequence, in plain words — what is lost, whether it can be undone.
   * Several strings are several paragraphs.
   */
  body?: string | string[];
  cancelLabel?: string;
  /** The confirm button's label. Say the verb ('Remove everywhere'), not 'OK'. */
  confirmLabel?: string;
  /** Paints the confirm button as destructive. Defaults on for a delete-shaped verb. */
  destructive?: boolean;
  /**
   * The share key (motion/share) the asking row or item departed under: the
   * dialog flies out of it rather than appearing on its own. The caller
   * departs it (`data-share` on the item clicked, or `departBox` from the
   * row) before asking.
   */
  from?: string;
  /**
   * Paints the confirm button as a consequential grant, shield and warning
   * tint (DESIGN.md, The Consequential Grant Rule): it allows more than a
   * person has allowed so far.
   */
  grant?: boolean;
  /** What the confirm button says while `run` runs ("Deleting…"). */
  pendingLabel: string;
  /** The question, as a heading. Name the thing and its blast radius here. */
  title: string;
}

/**
 * Asks from a row: the row departs under its own confirm key and the
 * question flies out of it. Returns the key `from` names.
 */
export function departRow(row: Element | null | undefined, id: string): string {
  const key = `confirm:${id}`;
  if (row instanceof HTMLElement) {
    departBox(key, row);
  }
  return key;
}

/**
 * One question at a time, and its answer: what a host (the dialog, or a
 * place in the page) reads and answers through. A new ask while one stands
 * declines the first.
 */
export class Asker<R extends Askable> {
  #pending = $state<(R & { resolve: (ok: boolean) => void }) | null>(null);

  get pending(): R | null {
    return this.#pending;
  }

  /** Ask, then run the work. Resolves true once it has run, false if declined. */
  ask(request: R): Promise<boolean> {
    this.#pending?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.#pending = { ...request, resolve };
    });
  }

  /** The reader declined: the question ends unanswered. */
  dismiss(): void {
    const settle = this.#pending?.resolve;
    this.#pending = null;
    settle?.(false);
  }

  /**
   * The reader confirmed: the work runs, and the question ends once it has
   * (unless it was dismissed or replaced meanwhile). Work that throws leaves
   * the question open.
   */
  async accept(): Promise<void> {
    const asked = this.#pending;
    if (!asked) {
      return;
    }
    await asked.run();
    if (this.#pending === asked) {
      this.#pending = null;
      asked.resolve(true);
    }
  }
}

/** What the single `<ConfirmDialog/>` host reads and answers through. */
export const confirmHost = new Asker<ConfirmRequest>();

/** Ask the reader to confirm, then run the work. Resolves true once it has run, false if they declined. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  return confirmHost.ask(request);
}
