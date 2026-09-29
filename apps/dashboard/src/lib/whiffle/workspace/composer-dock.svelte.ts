/**
 * A group's one composer, and the conversations that lend it their
 * sessions.
 *
 * Under a cursor every pane draws its own composer. Wherever a finger can
 * swipe between a group's conversations — the phone's deck, a tablet's
 * grid — the composer is not part of a pane at all: the swipe moves the
 * transcripts, and the box being typed in stays exactly where it is,
 * keyboard up. So such a pane draws no composer; it publishes what its
 * composer would have been given — its draft, its send, its parked
 * prompts, its controls — under its id, and its group (`PaneLeaf`) draws
 * one composer over whichever id is its active tab.
 */
import type { AvailableCommand } from "@whiffle/core";
import type { Snippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { SendExtras } from "../client.svelte";
import type { SuggestCandidate } from "../suggest.svelte";
import type { Mention } from "../transcript/Composer.svelte";
import type { ComposerDraft } from "../transcript/composer-draft.svelte";

/** Everything the composer takes from the conversation it is writing to. */
export interface ComposerBinding {
  readonly busy: boolean;
  readonly commands: AvailableCommand[];
  readonly draft: ComposerDraft;
  leading: Snippet;
  readonly mentions: Mention[];
  oninterruptsend: (text: string, extras: SendExtras, id: string) => void;
  onmenu: () => void;
  onstop: () => void;
  onsubmit: (text: string, extras: SendExtras, id: string) => void;
  readonly paneVisible: boolean;
  readonly previewPhone: boolean;
  prompts: Snippet;
  /** Why the last send failed; empty when it did not. */
  readonly sendError: string;
  readonly sending: boolean;
  readonly suggest: { candidates: SuggestCandidate[] };
  /**
   * How much of the pane's width, from its leading edge, the transcript
   * holds: 1, unless a side preview has the rest. The composer is centred
   * over the transcript, never over the preview beside it.
   */
  readonly transcriptShare: number;
}

/** The conversations drawn by their group's composer that can be written to, by id. */
export const composerBindings = new SvelteMap<string, ComposerBinding>();

/**
 * Each group's composer height, by group id. Every pane in the group
 * reserves it at the foot of its transcript, so the last row is never under
 * the box. A group drawing no composer has no entry.
 */
export const groupComposerHeights = new SvelteMap<string, number>();
