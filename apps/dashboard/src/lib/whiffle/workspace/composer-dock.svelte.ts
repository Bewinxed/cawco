/**
 * A group's one composer, and the conversations that lend it their
 * sessions.
 *
 * The composer is not part of a pane: on every device, a tab switch or a
 * swipe changes the transcript, and the box being typed in stays exactly
 * where it is, focus and keyboard with it. So a pane draws no composer; it
 * publishes what its composer would have been given — its draft, its send,
 * its parked prompts, its controls — under its id, and its group
 * (`PaneLeaf`) draws one composer over whichever id is its active tab.
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
  /** The session whose delegates the composer's tray shows. */
  readonly delegatesOf: string;
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
