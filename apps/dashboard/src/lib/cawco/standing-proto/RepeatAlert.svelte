<script lang="ts">
  /**
   * Under a repeating task's title while it needs the person: why, in one
   * sentence (CawCo stopped it, or its newest run failed), and the one act,
   * Fix with Caw, which puts the words that say what went wrong in Caw's
   * composer. Nothing while it doesn't need him.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou, IconSparkles } from "#lib/icons.js";
  import { readRepeat, standingWords } from "./repeat-words";
  import type { Repeat } from "./repeating-data";

  let {
    repeat,
    title,
    onfix,
  }: {
    repeat: Repeat;
    /** The task's title: what it states. */
    title: string;
    /** Puts the words in Caw's composer, his panel open. */
    onfix: (prompt: string) => void;
  } = $props();

  const reading = $derived(readRepeat(title, repeat));
</script>

{#if reading.needsYou}
  <div
    class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
    data-slot="needs-you"
  >
    <IconNeedsYou
      aria-hidden="true"
      class="size-icon-md flex-none text-status-attn-glyph"
      data-box
    />
    <p class="m-0 min-w-0 flex-1 type-body text-pretty text-ink-strong">
      <span class="sr-only">Needs you:</span>
      {standingWords(repeat) ?? reading.sentence}
    </p>
    {#if reading.fixPrompt}
      {@const prompt = reading.fixPrompt}
      <Button
        data-box
        icon={IconSparkles}
        label="Fix with Caw"
        onclick={() => onfix(prompt)}
        size="sm"
        variant="outline"
      />
    {/if}
  </div>
{/if}
