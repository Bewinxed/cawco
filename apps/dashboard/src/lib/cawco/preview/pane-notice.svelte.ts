/**
 * The pane's own line: what last went wrong in the frame, and an act of the pane's own the hub refused (Verify, a show from the title's menu) with its Try again.
 */
import { z } from "zod";
import { failureClause } from "#lib/platform/hub-read.js";
import { toast } from "#lib/platform/toasts.js";
import { showArtifact, verifyArtifact } from "../artifact-api";
import { refusals } from "../refusals.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

interface Failure {
  again: "reload" | "close" | null;
  message: string;
}
/**
 * An act of the pane's own the hub refused (Verify, a show from the
 * title's menu): said on the same line, with Try again, kept through a
 * reload (refusals.svelte.ts), until a try goes.
 */
const PaneActSchema = z.discriminatedUnion("act", [
  z.object({ act: z.literal("verify") }),
  z.object({ act: z.literal("show"), id: z.string(), title: z.string() }),
]);
export type PaneAct = z.infer<typeof PaneActSchema>;
export interface PaneNoticeDeps {
  readonly instanceId: () => string;
  readonly paneSubject: PaneSubject;
}
export class PaneNotice {
  readonly #deps: PaneNoticeDeps;

  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame; a refused close
   * asks again. A page's own send the hub refused, and a field the hub's
   * bounds refused, have no way back here: the page sends again from its
   * own button, and says a field's problem under the field; the band goes
   * once the page is heard from again.
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
      if (asked.act === "verify") {
        await this.verify();
        return;
      }
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

  /** The canvas view's Verify: a design system round on the canvas, its verdict to the session; the hub's sentence says what it did. */
  verifying = $state(false);

  verify = async () => {
    if (!this.#deps.paneSubject.artifact) {
      return;
    }
    this.verifying = true;
    const key = this.actKey;
    try {
      toast.info(
        await verifyArtifact(
          this.#deps.instanceId(),
          this.#deps.paneSubject.artifact.id
        )
      );
      if (
        PaneActSchema.safeParse(refusals.get(key)?.asked).data?.act === "verify"
      ) {
        refusals.delete(key);
      }
    } catch (error) {
      // Said on the pane's own line, with Try again, never a toast
      // (DESIGN.md, The Work Outlives Its Surface Rule).
      refusals.set(key, {
        reason: `${this.#deps.paneSubject.artifact.title} was not verified: ${failureClause(error)}. The canvas stays as it is.`,
        asked: { act: "verify" } satisfies PaneAct,
      });
    } finally {
      this.verifying = false;
    }
  };
  constructor(deps: PaneNoticeDeps) {
    this.#deps = deps;
  }

  say(next: Failure | null) {
    this.failure = next;
  }
}
