<script lang="ts">
  /**
   * The Comments rail's toggle in the artifact panel's head (the artifact
   * panel's surface brief, The head): a bare symbol of the head's glass, its
   * bubble and the open comments' count (The Earned Count Rule), pressed
   * while the rail stands. The count holds three figures' room, shown or
   * not, and stays as the rail opens, so the button keeps its width and
   * nothing in the head moves. While comments wait on him (To check), the
   * bubble wears the needs-you dot, as a pill does (PinDot), and its name
   * says how many; ⇧C's hidden pins and comments not reaching the agent are
   * said beside the count.
   */
  import { commentWords } from "@cawco/core/words/comments";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconChat, IconEyeClosed, IconWarningTriangle } from "#lib/icons.js";
  import PinDot from "./PinDot.svelte";

  let {
    open,
    count,
    toCheck,
    pinsShown = true,
    down = null,
    label,
    onclick,
  }: {
    /** The rail stands. */
    open: boolean;
    /** Open comments. */
    count: number;
    /** Comments waiting on him (To check). */
    toCheck: number;
    /** ⇧C has not hidden the pins. */
    pinsShown?: boolean;
    /** Why comments aren't reaching the agent, in words; null while they are. */
    down?: string | null;
    /** Its tooltip. */
    label: string;
    onclick: () => void;
  } = $props();

  const name = $derived(
    [
      commentWords.comments,
      count > 0 ? `${count} open` : null,
      toCheck > 0 ? commentWords.toCheckWaiting(toCheck) : null,
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
      {...tip}
      aria-expanded={open}
      aria-label={name}
      class="select-none touch-hit press-tint mark-line aria-expanded:bg-surface-pressed"
      data-bar-item
      data-box
      data-counted
      data-link-down={down ? "" : undefined}
      data-slot="comments"
      {onclick}
      type="button"
    >
      <span class="relative grid" data-box>
        <IconChat aria-hidden="true" data-slot="bar-symbol" />
        {#if toCheck > 0}<PinDot dot="unread" />{/if}
      </span>
      <span class="min-w-c-count-w text-start" data-slot="num"
        >{count > 0 ? count : ""}</span
      >
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
