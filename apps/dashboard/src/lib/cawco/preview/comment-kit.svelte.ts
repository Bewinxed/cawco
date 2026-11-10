/**
 * The comment kit: the composer, the thread and their drafts, loaded once the page in the pane is up, or as soon as one is asked for.
 */
import type { Pin } from "@cawco/core/comments/model";
import { untrack } from "svelte";
import {
  type MarkdownFleet,
  markdownFleetAbove,
  provideMarkdownFleet,
} from "../markdown-fleet";
import { afterPaint } from "../workspace/warm.svelte";
import type { CommentDrafts } from "./comment-drafts.svelte";
import { commentAttachments, NEXT_COMMENT } from "./comment-rows";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

/** What the person said in a draft just taken by its composer: its words, and its files by reference. */
export const saidIn = (
  draft: {
    unsent: { files: Parameters<typeof commentAttachments>[0] } | null;
  },
  text: string
) => ({ text, attachments: commentAttachments(draft.unsent?.files ?? []) });
export interface CommentKitDeps {
  readonly cardPin: () => Pin | null;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
}
export class CommentKit {
  readonly #deps: CommentKitDeps;

  /**
   * The comment kit: the composer, the thread and their drafts, loaded once
   * the page in the pane is up, or as soon as a composer or a thread is
   * asked for. They are the conversation's code (the chat composer, the
   * transcript's pieces), which an artifact's own tab never loads at first
   * paint (scripts/page-imports-check.ts).
   */
  kit = $state.raw<{
    CommentComposer: typeof import("./CommentComposer.svelte").default;
    PinCard: typeof import("./PinCard.svelte").default;
    commentDrafts: typeof import("./comment-drafts.svelte").commentDrafts;
  } | null>(null);

  kitLoading: Promise<void> | null = null;

  /**
   * What a thread's markdown reads of the fleet (markdown-fleet.ts): the
   * app's, under the app; on an artifact's own tab, the live one, loaded
   * with the kit, so a thread's references draw as they do in the app from
   * its first frame.
   */
  readonly markdownAbove = markdownFleetAbove();

  ownMarkdown = $state.raw<MarkdownFleet | undefined>(undefined);

  loadKit = (): Promise<void> => {
    this.kitLoading ??= Promise.all([
      import("./CommentComposer.svelte"),
      import("./PinCard.svelte"),
      import("./comment-drafts.svelte"),
      this.markdownAbove ? null : import("../markdown-live"),
    ]).then(([composer, card, kept, markdown]) => {
      this.ownMarkdown = markdown?.liveMarkdown;
      this.kit = {
        CommentComposer: composer.default,
        PinCard: card.default,
        commentDrafts: kept.commentDrafts,
      };
    });
    return this.kitLoading;
  };

  /** What the person has half-written: the next comment's, and each thread's reply, kept across a reload. */
  drafts = $state.raw<CommentDrafts | null>(null);

  /** The next comment's draft: its words and chips stay for the next composer. */
  readonly nextDraft = $derived.by(() =>
    this.drafts && this.#deps.paneSubject.artifactId
      ? this.drafts.draft(NEXT_COMMENT)
      : null
  );

  /** The open thread's reply. */
  readonly replyDraft = $derived.by(() => {
    const pin = this.#deps.cardPin();
    return this.drafts && pin ? this.drafts.draft(pin.id) : null;
  });
  constructor(deps: CommentKitDeps) {
    this.#deps = deps;
    if (!this.markdownAbove) {
      provideMarkdownFleet(() => this.ownMarkdown);
    }
    $effect(() => {
      if (this.#deps.previewFrame.connected) {
        return untrack(() => afterPaint(this.loadKit));
      }
    });
    $effect(() => {
      const ready = this.kit;
      if (!ready) {
        return;
      }
      const held = ready.commentDrafts(() => this.#deps.paneSubject.artifactId);
      this.drafts = held;
      return () => {
        held.release();
        this.drafts = null;
      };
    });
  }
}
