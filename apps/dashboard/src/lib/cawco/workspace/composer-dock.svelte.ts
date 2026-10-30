/**
 * A group's one composer, and the conversations that lend it their
 * sessions.
 *
 * The composer is not part of a pane: on every device, a tab switch or a
 * swipe changes the transcript, and the box being typed in stays exactly
 * where it is, focus and keyboard with it. So a pane draws no composer; it
 * publishes what its composer would have been given — its draft, its send,
 * its parked ask, its controls — under its id, and its group
 * (`PaneLeaf`) draws one composer over whichever id is its active tab.
 */
import type { AvailableCommand } from "@cawco/core/fleet";
import type { Snippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { SendExtras } from "../client.svelte";
import type { SuggestCandidate } from "../suggest.svelte";
import type { ComposerAsk, ComposerFoot } from "../transcript/Composer.svelte";
import type { ComposerDraft } from "../transcript/composer-draft.svelte";

/** Everything the composer takes from the conversation it is writing to. */
export interface ComposerBinding {
  /** The agent answering here, by name, for what the composer says about it. */
  readonly agentName: string;
  /** The first ask parked here, which the composer grows into; null with none. */
  readonly ask: ComposerAsk | null;
  readonly busy: boolean;
  readonly commands: AvailableCommand[];
  /** The session whose delegates the composer's tray shows. */
  readonly delegatesOf: string;
  readonly draft: ComposerDraft;
  /** What `sendError` says is a failed command: its Try again (Composer `faultAgain`). */
  readonly faultAgain?: () => unknown;
  /** The conversation `@` names others from (Composer `mentionsFrom`); null names nothing. */
  readonly mentionsFrom: string | null;
  /** What the composer stands over the transcript's foot (Composer `ComposerFoot`). */
  readonly onfoot?: (foot: ComposerFoot) => void;
  onmenu: () => void;
  onstop: () => void;
  onsubmit: (text: string, extras: SendExtras, id: string) => void;
  readonly paneVisible: boolean;
  /** The field's hint, where the agent takes no `/` or `@`. */
  readonly placeholder?: string;
  /** The plan's ring, which opens it over the composer's row; none without a plan. */
  readonly planRing?: Snippet;
  /** What stands on the tray row above the composer: an offer to the reader. */
  prompts?: Snippet;
  /** The conversation whose sent messages the composer recalls. */
  readonly recallOf: string;
  /** The failed send never reached the hub and its words are back in the field: Send again stands on its line. */
  readonly sendAgain?: boolean;
  /** Why the last send failed, or the last command; empty when nothing did. */
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
 * What a group's composer takes from the binding it is lent, as Composer's
 * props: every one but the group's own (where it stands, its tray, what it
 * is showing).
 */
export const composerOf = (binding: ComposerBinding) => ({
  agentName: binding.agentName,
  ask: binding.ask,
  busy: binding.busy,
  commands: binding.commands,
  draft: binding.draft,
  faultAgain: binding.faultAgain,
  mentionsFrom: binding.mentionsFrom,
  onfoot: binding.onfoot,
  onmenu: binding.onmenu,
  onstop: binding.onstop,
  onsubmit: binding.onsubmit,
  paneVisible: binding.paneVisible,
  placeholder: binding.placeholder,
  planRing: binding.planRing,
  recallOf: binding.recallOf,
  sendAgain: binding.sendAgain,
  sendError: binding.sendError,
  sending: binding.sending,
  suggest: binding.suggest,
});
