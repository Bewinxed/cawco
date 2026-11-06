<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What the session waits on the person for, as the tray row's chip that
   * opens its list over the row (WaitingCard), and shuts it again: the
   * delegate chips' and the plan ring's own recipe (ui/chip, `tray`), so
   * the row is one height on one line.
   *
   * While anything waits on him it wears the needs-you hand and says how
   * many ("3 need you"); once all are answered and some not yet taken up,
   * the tick and how many ("2 answered"), in muted ink. At none it is gone
   * (DESIGN.md, The Earned Count Rule). Where the tray row is narrower than
   * a phone's (its `tray` container: a phone, Caw's panel) the words fold
   * away and the glyph and the figure stand, so a folded question's bar
   * beside it keeps the room to say what it asks; the aria-label says it
   * whole.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconNeedsYou, IconTick } from "#lib/icons.js";

  let {
    open: waiting,
    answered,
    shown,
    onopen,
  }: {
    /** How many wait on him. */
    open: number;
    /** How many he answered that the agent has not taken up. */
    answered: number;
    /** The list stands open over the row. */
    shown: boolean;
    onopen: () => void;
  } = $props();
</script>

{#if waiting > 0 || answered > 0}
  <button
    data-slot="waiting-chip"
    aria-label={waitingWords.triggerLabel(waiting, answered)}
    aria-pressed={shown}
    class={chipVariants({
      variant: "tray",
      class:
        "touch-hit text-ink-muted aria-pressed:text-ink-strong aria-pressed:before:bg-surface-pressed data-waiting:text-ink-strong",
    })}
    data-tray-chip
    data-waiting={waiting > 0 ? "" : undefined}
    onclick={onopen}
    type="button"
  >
    {#if waiting > 0}
      <IconNeedsYou aria-hidden="true" class="text-status-attn-glyph" />
      <span aria-hidden="true" class="num whitespace-nowrap"
        >{waiting}<span class="@max-phone/tray:hidden"
          >{` ${waitingWords.needYouWord(waiting)}`}</span
        ></span
      >
    {:else}
      <IconTick aria-hidden="true" />
      <span aria-hidden="true" class="num whitespace-nowrap"
        >{answered}<span class="@max-phone/tray:hidden"
          >{` ${waitingWords.answeredWord}`}</span
        ></span
      >
    {/if}
  </button>
{/if}
