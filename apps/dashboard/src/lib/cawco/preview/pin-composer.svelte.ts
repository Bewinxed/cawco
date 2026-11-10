/**
 * The comment being written: its composer beside the pill the press put down, its draft kept per artifact, and the page's answer to Comment.
 */
import { pinProblem } from "@cawco/core/comments/validate";
import { z } from "zod";
import { ComposeTargetSchema } from "#lib/cawco/stored-shapes.js";
import { readJson, writeJson } from "#lib/platform/storage.js";
import { pressOutside } from "../press-outside";
import type { CommentKit } from "./comment-kit.svelte";
import { saidIn } from "./comment-kit.svelte";
import { NEXT_COMMENT } from "./comment-rows";
import type { PaneCanvas } from "./pane-canvas.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import { type ComposeTarget, type PreviewPinAt, previewPinAt } from "./wire";

/**
 * Where the next comment's draft stands, kept on this device per artifact
 * beside its words (the draft store): its target as the page named it,
 * the point on it, and whether its composer is open or parked. A reload
 * brings it back at its target as it was.
 */
const KeptDraftSchema = z.object({
  inkId: z.string().optional(),
  parked: z.boolean(),
  point: z.object({ x: z.number(), y: z.number() }).optional(),
  target: ComposeTargetSchema,
});
type KeptDraft = z.infer<typeof KeptDraftSchema>;
export interface PinComposerDeps {
  readonly commentKit: CommentKit;
  readonly markFocused: (id: string) => void;
  readonly paneCanvas: PaneCanvas;
  readonly paneDoc: PaneDoc;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
}
export class PinComposer {
  readonly #deps: PinComposerDeps;

  /**
   * The comment being written: what the press may stand on (innermost
   * first, out to the whole page), the one chosen, where its hollow pill
   * stands, and its words on their way. Nothing is written until Comment.
   */
  composing = $state<{
    at: PreviewPinAt | null;
    chain: ComposeTarget[];
    chosen: number;
    error: string;
    sending: boolean;
  } | null>(null);

  /** The composer's float, whose outside presses close it. */
  composerFloat = $state<HTMLElement>();

  /** The comment being written was asked for the whole page from the rail's + (its composer then hangs from the rail's glass beside the page). */
  composingPage = $state(false);

  /**
   * To the page the comment being written stands on: a canvas's is its
   * stage's frame (canvas/stage.svelte.ts), which the pane's own frame
   * never is; any other page's, the pane's.
   */
  post = (message: object) => {
    if (this.#deps.paneSubject.isCanvas) {
      this.#deps.paneCanvas.stage?.post(message);
    } else {
      this.#deps.previewFrame.post(message);
    }
  };

  /**
   * The composer closes with nothing written (Esc, a press outside it, a
   * mode switch, a thread opened). Holding words or chips, it is parked
   * (The Work Outlives Its Surface Rule): its hollow pill stays at its
   * target saying it holds a draft, and one press on it opens the composer
   * again with them; its words and chips stay as the next comment's draft,
   * an upload in flight going on. Empty, its pill goes.
   */
  cancelComposer = () => {
    if (!this.composing) {
      return;
    }
    this.composing = null;
    if (this.#deps.commentKit.nextDraft?.hasContent) {
      this.post({ type: "cawco:compose-park" });
      this.keepDraftAt(
        this.keptDraft ? { ...this.keptDraft, parked: true } : null
      );
    } else {
      this.post({ type: "cawco:compose-cancel" });
      this.keepDraftAt(null);
    }
  };

  keptDraft: KeptDraft | null = null;

  readonly draftKey = $derived.by(() =>
    this.#deps.paneSubject.artifactId
      ? `cawco-comment-draft:${this.#deps.paneSubject.artifactId}`
      : null
  );
  constructor(deps: PinComposerDeps) {
    this.#deps = deps;
    $effect(() => {
      if (!this.composing) {
        this.composingPage = false;
      }
    });
    // A press anywhere in the dashboard outside the composer closes it; one in a
    // modal layer or a menu (its target chip's) is that layer's.
    $effect(() => {
      const float = this.composerFloat;
      if (!float) {
        return;
      }
      return pressOutside(float, (event) => {
        if (!(
          event.target instanceof Element &&
          event.target.closest(
            "[aria-modal='true'], dialog[open], [role='menu']"
          )
        )) {
          this.cancelComposer();
        }
      });
    });
  }

  keepDraftAt(next: KeptDraft | null) {
    this.keptDraft = next;
    if (this.draftKey) {
      writeJson(this.draftKey, next);
    }
  }

  /** What the page said of a draft it opened (`cawco:compose`): kept, open. */
  keepComposed(
    said: { chain: ComposeTarget[]; chosen: number },
    message: Record<string, unknown>
  ) {
    const target = said.chain[said.chosen];
    if (!target) {
      return;
    }
    const { point } = message;
    this.keepDraftAt({
      target,
      parked: false,
      ...(typeof point === "object" &&
      point !== null &&
      "x" in point &&
      typeof point.x === "number" &&
      "y" in point &&
      typeof point.y === "number"
        ? { point: { x: point.x, y: point.y } }
        : {}),
      ...(typeof message.inkId === "string" ? { inkId: message.inkId } : {}),
    });
  }

  /** A page loaded again: the draft kept for it comes back at its target, parked or open, once per load. */
  restoreDraft() {
    const key = this.draftKey;
    const kept = key ? readJson(key, KeptDraftSchema.nullable(), null) : null;
    this.keptDraft = kept;
    if (!kept?.target?.anchor || this.composing) {
      return;
    }
    if (!kept.parked) {
      this.#deps.commentKit.loadKit();
    }
    this.#deps.previewFrame.post({
      type: "cawco:compose-restore",
      target: { ...kept.target, point: kept.point, inkId: kept.inkId },
      parked: kept.parked,
    });
  }

  /** Comment: the words and what they carry go to the page, which writes the pin and its first entry at once; `held`, kept to send with the others (core `ThreadEntry.held`). */
  comment(text: string, held = false) {
    if (!(this.composing && this.#deps.commentKit.nextDraft)) {
      return;
    }
    const said = saidIn(this.#deps.commentKit.nextDraft, text);
    this.composing.error = "";
    this.composing.sending = true;
    this.post({ type: "cawco:comment", ...said, held });
  }

  /** The page's answer to Comment: written, the composer goes; refused, the words are back in it with why. */
  heardComment(message: Record<string, unknown>) {
    // Written, it is heard whether or not its composer still stands: an Esc
    // that came before the page's answer closed the composer, not the
    // comment, which the page wrote.
    if (message.ok === true) {
      const { pin } = message;
      const id =
        typeof pin === "object" &&
        pin !== null &&
        "id" in pin &&
        typeof pin.id === "string"
          ? pin.id
          : null;
      const written = id !== null && pinProblem(pin) === null;
      if (
        written &&
        !this.#deps.paneDoc.view?.pins.some((one) => one.id === id)
      ) {
        this.#deps.paneDoc.pageSays(id, pin);
      }
      this.composing = null;
      this.keepDraftAt(null);
      // The newest comment is the one J and K step from.
      if (written) {
        this.#deps.markFocused(id);
      }
      this.#deps.commentKit.drafts?.discard(NEXT_COMMENT);
      return;
    }
    const draft = this.#deps.commentKit.nextDraft;
    if (!(this.composing && draft)) {
      return;
    }
    if (draft.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
    this.composing.sending = false;
    this.composing.error =
      typeof message.error === "string"
        ? message.error
        : "The page didn't keep that comment. Try again.";
  }

  /** The page opened a comment's composer (`cawco:compose`): nothing is written yet. */
  opened(
    said: { chain: ComposeTarget[]; chosen: number },
    message: Record<string, unknown>
  ) {
    this.composing = {
      at: this.composing?.at ?? null,
      chain: said.chain,
      chosen: said.chosen,
      error: "",
      sending: false,
    };
    this.keepComposed(said, message);
  }

  /** The page said where the composer's pill stands (`cawco:compose-at`). */
  heardAt(message: Record<string, unknown>) {
    if (this.composing) {
      this.composing.at = previewPinAt(message);
    }
  }
}
