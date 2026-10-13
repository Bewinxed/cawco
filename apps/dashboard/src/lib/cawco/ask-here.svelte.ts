/**
 * A question asked in the page, beside the control that asked it (DESIGN.md,
 * The Open Page Rule): no scrim, no hold, the rest of the page live. It is
 * for a decision nothing elsewhere can break: the person can scroll, read or
 * press something else, and the question waits where it was asked, its
 * named things following the system while it stands.
 *
 *   const asker = new Asker<AskHereRequest>();
 *   await asker.ask({ at: row.id, title: "Remove X?", … });
 *   <AskHere {asker} at={row.id} />
 *
 * `items` names what the action reaches when that is the decision: only for
 * a heavy action that reaches several things (a run's live steps, a
 * machine's sessions, the tasks a stage set strands, the machines holding a
 * skill). It is read live, so a session that ends while the question stands
 * shows it. A single delete names its one thing in words.
 */
import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";
import type { Askable } from "./confirm.svelte";
import type { MarkStatus } from "./TreeMark.svelte";

export interface AskHereRequest extends Askable {
  /** Which control asked: the `<AskHere>` given the same `at` draws it. */
  at: string;
  /** The consequence, in plain words. Several strings are several paragraphs. */
  body?: string | string[];
  cancelLabel?: string;
  /** The confirm button: the verb and its reach ("Remove machine"). */
  confirmLabel: string;
  destructive?: boolean;
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
    | { kind: "session"; place: string; status?: MarkStatus }
    | { kind: "machine"; os: string }
    | { kind: "glyph"; icon: Component<SVGAttributes<SVGSVGElement>> };
  /** The item it hangs under, as a delegate under its lead. */
  parentId?: string | null;
  /** What it is doing now, in a word ("Working", "Idle", "Plan"). */
  status?: string;
  title: string;
}
