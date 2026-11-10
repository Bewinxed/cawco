/**
 * The pane's own line: what last went wrong in the frame, and an act of the pane's own the hub refused (a show from the artifacts' menu) with its Try again.
 */
import { z } from "zod";
import { failureClause } from "#lib/platform/hub-read.js";
import { showArtifact } from "../artifact-api";
import { refusals } from "../refusals.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

interface Failure {
  again: "reload" | null;
  message: string;
}
/**
 * An act of the pane's own the hub refused (a show from the artifacts'
 * menu): said on the same line, with Try again, kept through a reload
 * (refusals.svelte.ts), until a try goes.
 */
const PaneActSchema = z.object({
  act: z.literal("show"),
  id: z.string(),
  title: z.string(),
});
export interface PaneNoticeDeps {
  readonly instanceId: () => string;
  readonly paneSubject: PaneSubject;
}
export class PaneNotice {
  readonly #deps: PaneNoticeDeps;

  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame. A page's own send
   * the hub refused, and a field the hub's bounds refused, have no way back
   * here: the page sends again from its own button, and says a field's
   * problem under the field; the band goes once the page is heard from
   * again.
   */
  failure = $state<Failure | null>(null);

  readonly actKey = $derived.by(() => `pane:${this.#deps.instanceId()}`);

  readonly paneRefused = $derived(refusals.get(this.actKey));

  /** The refused act's Try again is running. */
  rerunning = $state(false);

  rerun = async (): Promise<void> => {
    const { data: asked } = PaneActSchema.safeParse(this.paneRefused?.asked);
    if (!asked) {
      return;
    }
    this.rerunning = true;
    try {
      try {
        await showArtifact(this.#deps.instanceId(), asked.id);
        refusals.delete(this.actKey);
      } catch (error) {
        refusals.set(this.actKey, {
          reason: `${asked.title} was not shown: ${failureClause(error)}.`,
          asked,
        });
      }
    } finally {
      this.rerunning = false;
    }
  };

  constructor(deps: PaneNoticeDeps) {
    this.#deps = deps;
  }

  say(next: Failure | null) {
    this.failure = next;
  }
}
