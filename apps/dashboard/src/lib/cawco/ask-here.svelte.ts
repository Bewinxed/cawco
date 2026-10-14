/**
 * The app's one way to ask before doing: a question asked in the page,
 * beside the control that asked it (DESIGN.md, The Open Page Rule). No
 * scrim, no hold, the rest of the page live: the person can scroll, read or
 * press something else, and the question waits where it was asked, its
 * named things following the system while it stands.
 *
 *   const asker = new Asker<AskHereRequest>();
 *   await asker.ask({ at: row.id, title: "Remove X?", … });
 *   <AskHere {asker} at={row.id} />
 *
 * The confirm button starts `run` and stays pending until it ends; work that
 * throws keeps the question with its refusal under it, so `run` reports a
 * failure by throwing, not by toasting and returning.
 *
 * `items` names what the action reaches when that is the decision: only for
 * a heavy action that reaches several things (a run's live steps, a
 * machine's sessions, the tasks a stage set strands, the machines holding a
 * skill). It is read live, so a session that ends while the question stands
 * shows it. A single delete names its one thing in words.
 */
import type { ThreadStatus } from "@cawco/core";
import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";
import type { MarkStatus } from "./TreeMark.svelte";

/** What any question needs: the work its confirm button starts. */
export interface Askable {
  run: () => Promise<unknown>;
}

/**
 * One question at a time, and its answer: what a place in the page reads
 * and answers through. A new ask while one stands declines the first.
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

export interface AskHereRequest extends Askable {
  /** Which control asked: the `<AskHere>` given the same `at` draws it. */
  at: string;
  /** The consequence, in plain words. Several strings are several paragraphs. */
  body?: string | string[];
  cancelLabel?: string;
  /** The confirm button: the verb and its reach ("Remove machine"). */
  confirmLabel: string;
  destructive?: boolean;
  /**
   * Paints the confirm button as a consequential grant, shield and warning
   * tint (DESIGN.md, The Consequential Grant Rule): it allows more than a
   * person has allowed so far.
   */
  grant?: boolean;
  /** What the action reaches, named, read live while the question stands. */
  items?: () => AskItem[];
  /** What the confirm button says while `run` runs ("Removing…"). */
  pendingLabel: string;
  /** The question. Name the thing here. */
  title: string;
}

/** One thing a question names as reached by the action. */
export interface AskItem {
  id: string;
  /** How it leads its row: a session's mark, a machine's OS mark, or a glyph. */
  lead:
    | {
        kind: "session";
        place: string;
        status?: MarkStatus;
        /** A thread's Caw status, its face (session-status.ts `cawOf`). */
        caw?: ThreadStatus | null;
      }
    | { kind: "machine"; os: string }
    | { kind: "glyph"; icon: Component<SVGAttributes<SVGSVGElement>> };
  /** The item it hangs under, as a delegate under its lead. */
  parentId?: string | null;
  /** What it is doing now, in a word ("Working", "Idle", "Plan"). */
  status?: string;
  title: string;
}
