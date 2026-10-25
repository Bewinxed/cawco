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
  import { ON_WORDS } from "./classes";
  import { type Ack, midSentence } from "./view.svelte";

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
  /**
   * One short line (WORDS.md's readout register): who has it, said once.
   * A comment's answer stands on the step's thread under its author's
   * name, so the line names no one twice.
   */
  const said = $derived.by(() => {
    if (ack.phase === "sent") {
      return `${told} sent to ${midSentence(ack.to)}`;
    }
    if (ack.phase === "replied" && ack.change === "commented") {
      return "Answered on the thread";
    }
    const also = ack.also ? ` and ${midSentence(ack.also)}` : "";
    return `Seen by ${midSentence(ack.to)}${also}`;
  });
</script>

<!-- In a narrow column (Lanes' steps side by side) the line starts under
     the tile, so a receiver's name and its state keep to one line. -->
<div
  class={[
    ON_WORDS,
    "flex min-w-0 flex-col gap-space-row pb-space-1 type-meta text-ink-muted @max-plan-step/step-row:ps-0",
  ]}
  data-phase={ack.phase}
  data-slot="ack"
>
  <span
    class="mark-line flex min-w-0 items-start gap-space-1 [&_svg]:size-icon-sm"
  >
    <span
      class={[
        "mark-cell",
        (ack.phase === "seen" || ack.phase === "replied") &&
          "text-status-done-glyph",
      ]}
    >
      {#if ack.phase === "sent"}
        <IconClock aria-hidden="true" />
      {:else}
        <IconCheck aria-hidden="true" />
      {/if}
    </span>
    <span class="min-w-0 wrap-anywhere text-balance" data-slot="ack-said"
      ><MorphText text={said} /></span
    >
  </span>
  {#if ack.reply && ack.change !== "commented"}
    <p
      class="m-0 wrap-anywhere text-pretty text-ink-strong"
      in:fade={{ duration: 200 }}
    >
      <span class="font-medium">{ack.to}</span>
      <span>{ack.reply}</span>
    </p>
  {/if}
</div>
