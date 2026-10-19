<script lang="ts">
  /**
   * THE ACKNOWLEDGEMENT (proposal): after the person changes a step or
   * comments on it, the line under its words says who conducts it and where
   * the change stands: sent, then seen (the double tick), then their reply.
   * A delegate's step names the delegate and that this session hears it too.
   * The words change in place through MorphText (The Steady Swap Rule); the
   * reply arrives under them.
   */
  import { fade } from "svelte/transition";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconCheck, IconClock } from "#lib/icons.js";
  import type { Ack } from "./view.svelte";

  let { ack }: { ack: Ack } = $props();

  const told = $derived(
    {
      reworded: "Rewording",
      moved: "Move",
      removed: "Removal",
      added: "New step",
      ticked: "Tick",
      commented: "Comment",
    }[ack.change]
  );
  /** A receiver's name mid-sentence: "this session" in lower case. */
  const named = (who: string) =>
    who === "This session" ? "this session" : who;
  const said = $derived.by(() => {
    const also = ack.also ? ` · ${ack.also.toLowerCase()} heard it` : "";
    return ack.phase === "sent"
      ? `${told} sent to ${named(ack.to)}`
      : `Seen by ${named(ack.to)}${also}`;
  });
</script>

<div class="ack" data-phase={ack.phase} data-slot="ack">
  <span class="line mark-line">
    <span class="mark-cell">
      {#if ack.phase === "sent"}
        <IconClock aria-hidden="true" />
      {:else}
        <IconCheck aria-hidden="true" />
      {/if}
    </span>
    <span class="said"><MorphText text={said} /></span>
  </span>
  {#if ack.reply}
    <p class="reply" in:fade={{ duration: 200 }}>
      <span class="who">{ack.to}</span>
      <span>{ack.reply}</span>
    </p>
  {/if}
</div>

<style>
  .ack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-inline-start: calc(
      var(--lead-w, var(--pv-tile, 18px)) + var(--space-2)
    );
    padding-block-end: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line {
    display: flex;
    align-items: start;
    gap: var(--space-1);
    min-inline-size: 0;

    & :global(svg) {
      inline-size: 12px;
      block-size: 1lh;
    }
  }
  .ack[data-phase="seen"] .mark-cell,
  .ack[data-phase="replied"] .mark-cell {
    color: var(--status-done-glyph);
  }
  .said {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .reply {
    margin: 0;
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .who {
    font-weight: var(--weight-strong);

    &::after {
      content: " ";
    }
  }
</style>
