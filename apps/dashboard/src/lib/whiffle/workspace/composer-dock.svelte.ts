/**
 * The phone's one composer, and the conversations that lend it their
 * sessions.
 *
 * On a desk every pane draws its own composer. On the deck the composer is
 * not part of a pane at all: a swipe between chats moves the transcripts,
 * and the box being typed in stays exactly where it is, keyboard up. So a
 * pane on the deck draws no composer; it publishes what its composer would
 * have been given — its draft, its send, its parked prompts, its controls —
 * under its id, and the deck draws one composer over whichever id is in
 * front.
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
  oninterruptsend: (text: string, extras: SendExtras) => void;
  onmenu: () => void;
  onstop: () => void;
  onsubmit: (text: string, extras: SendExtras) => void;
  readonly paneVisible: boolean;
  readonly previewPhone: boolean;
  prompts: Snippet;
  readonly sending: boolean;
  readonly suggest: { candidates: SuggestCandidate[] };
  /**
   * How much of the pane's width, from its leading edge, the transcript
   * holds: 1, unless a side preview has the rest. The composer is centred
   * over the transcript, never over the preview beside it.
   */
  readonly transcriptShare: number;
}

/** The conversations on the deck that can be written to, by id. */
export const composerBindings = new SvelteMap<string, ComposerBinding>();

/**
 * The one composer's measured height. Every pane on the deck reserves it at
 * the foot of its transcript, so the last row is never under the box.
 */
export const dockedComposer = $state({ height: 0 });
