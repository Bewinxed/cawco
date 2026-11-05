<script lang="ts">
  /**
   * The Comments rail's toggle in the artifact panel's head (the artifact
   * panel's surface brief, The head): a bare symbol of the head's glass, its
   * bubble, pressed while the rail stands. The open comments' count is a
   * badge at the bubble's top-trailing corner, as Apple badges a toolbar
   * item (SwiftUI badge: "Badges appear in list rows, tab bars, toolbar
   * items, and menus"), only above 0 (The Earned Count Rule); the button is
   * the symbol's own width, so a count growing moves nothing in the head.
   * While comments wait on him (To check) the badge takes the needs-you
   * pair and its name says how many; while he holds comments to send
   * together it is hollow, a held pill's own look, and its name says how
   * many are unsent; ⇧C's hidden pins and comments not reaching the agent
   * are said beside the bubble.
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { mergeProps } from "bits-ui";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconChat, IconEyeClosed, IconWarningTriangle } from "#lib/icons.js";

  let {
    open,
    count,
    toCheck,
    held = 0,
    pinsShown = true,
    down = null,
    label,
    onclick,
    props = {},
  }: {
    /** The rail stands. */
    open: boolean;
    /** Open comments. */
    count: number;
    /** Comments waiting on him (To check). */
    toCheck: number;
    /** Comments he holds to send together. */
    held?: number;
    /** ⇧C has not hidden the pins. */
    pinsShown?: boolean;
    /** Why comments aren't reaching the agent, in words; null while they are. */
    down?: string | null;
    /** Its tooltip. */
    label: string;
    onclick?: () => void;
    /** A primitive's trigger props (a card hung from it), merged in. */
    props?: Record<string, unknown>;
  } = $props();
  /** How the badge is dressed: what waits on him, what he holds, or the count alone. */
  const badge = $derived.by(() => {
    if (toCheck > 0) {
      return "check";
    }
    if (held > 0) {
      return "held";
    }
    return count > 0 ? "count" : null;
  });

  const name = $derived(
    [
      commentWords.comments,
      count > 0 ? `${count} open` : null,
      toCheck > 0 ? commentWords.toCheckWaiting(toCheck) : null,
      held > 0 ? commentWords.heldWaiting(held) : null,
      pinsShown ? null : "pins hidden",
      down,
    ]
      .filter(Boolean)
      .join(", ")
  );
</script>

<Tip {label}>
  {#snippet children(tip)}
    <button
      {...mergeProps(tip, props, { onclick })}
      aria-expanded={open}
      aria-label={name}
      class="select-none touch-hit press-tint mark-line pe-space-6 aria-expanded:bg-surface-pressed"
      data-bar-item
      data-box
      data-link-down={down ? "" : undefined}
      data-slot="comments"
      type="button"
    >
      <!-- mark-line: the badge is a mark on the symbol's corner, not words set beside it -->
      <span class="relative grid" data-box>
        <IconChat aria-hidden="true" data-slot="bar-symbol" />
        {#if badge}
          <!-- The badge: a plain capsule, no ring or shadow, its leading
               half-circle centred on the bubble's top-trailing corner so the
               bubble reads and a longer count grows outward, into the room
               the button keeps after the symbol (`pe-space-6`, three
               figures' worth, so nothing moves as the count grows). -->
          <span aria-hidden="true" class="absolute end-0 top-0 size-0">
            <span
              class="absolute -start-c-count-badge-inset -top-c-count-badge-inset grid h-c-count-badge-h min-w-c-count-badge-h place-items-center rounded-pill px-space-1 type-meta num leading-none data-[badge=count]:bg-ink-solid data-[badge=count]:text-on-ink data-[badge=check]:bg-status-attn-bg data-[badge=check]:text-status-attn-ink data-[badge=held]:border data-[badge=held]:border-ink-muted data-[badge=held]:bg-surface-raised data-[badge=held]:text-ink-strong"
              data-badge={badge}
              data-slot="badge">{count > 0 ? count : held}</span
            >
          </span>
        {/if}
      </span>
      {#if !pinsShown}
        <!-- ⇧C hid the pins: said where the person looks for them. -->
        <IconEyeClosed aria-hidden="true" class="size-icon-sm" />
      {/if}
      {#if down}
        <!-- The comments aren't reaching the agent: said where the person looks for them, why in the panel. -->
        <IconWarningTriangle
          aria-hidden="true"
          class="size-icon-sm text-data-bad"
        />
      {/if}
    </button>
  {/snippet}
</Tip>
