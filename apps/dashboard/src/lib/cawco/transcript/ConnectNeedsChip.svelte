<script lang="ts">
  /**
   * The way back to a conversation's open connect card (ConnectCard) once
   * the transcript has moved past it: "1 needs you", the tray row's chip in
   * the brand ink at the row's trailing end, where the plan's ring stands.
   * One press brings the card into view (`connectReveal`); it goes once the
   * card is answered or the hub has signed in.
   */
  import { askWords } from "@cawco/core/words/asks";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconChevronUp } from "#lib/icons.js";
  import { connectReveal } from "./connect-sign-ins.svelte";

  let {
    instanceId,
    asks,
  }: {
    /** The conversation the cards stand in. */
    instanceId: string;
    /** The connect asks standing open there: who asks, for which server. */
    asks: { asker: string; server: string }[];
  } = $props();
</script>

{#if asks.length > 0}
  <button
    data-slot="connect-needs"
    aria-label={`${askWords.connectNeedsYou(asks.length)}: ${askWords.showConnectAsk(asks[0].asker, asks[0].server)}`}
    class={chipVariants({
      variant: "tray",
      class: "touch-hit text-brand-ink before:bg-brand-wash",
    })}
    data-tray-chip
    onclick={() => connectReveal.add(instanceId)}
    type="button"
  >
    <span class="whitespace-nowrap"
      >{askWords.connectNeedsYou(asks.length)}</span
    >
    <IconChevronUp aria-hidden="true" />
  </button>
{/if}
