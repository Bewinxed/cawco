<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconSparkles } from "#lib/icons.js";
  import { readRoutine } from "./routine-format";
  import { MOCK_NOW, type Routine } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    now?: number;
    /** Asks Caw to fix this routine, with the words that say what went wrong. */
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    routine: Routine;
    selected?: boolean;
    stale?: boolean;
  }

  let {
    routine,
    selected = false,
    stale = false,
    now = MOCK_NOW,
    onopen,
    onfix,
  }: Props = $props();

  const reading = $derived(readRoutine(routine, now));
</script>

<article
  class={[
    "flex h-full min-w-0 flex-col gap-space-1 rounded-sm px-space-3 pt-space-2 pb-space-3 text-ink-strong shadow-tile transition-[background-color] duration-(--duration-control) ease-out",
    selected ? "bg-selected-bg" : "bg-surface-raised",
  ]}
  data-needs-you={reading.needsYou || undefined}
  data-routine-tile={routine.id}
  data-selected={selected || undefined}
>
  <header class="flex min-h-c-badge-h items-center justify-between gap-space-2">
    <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
      {#if reading.needsYou}
        <span
          aria-label="Needs you"
          class="inline-flex flex-none items-center"
          data-box
          role="img"
          title="Needs you"
        >
          <StatusGlyph glyph="needs-you" tone="attn" />
        </span>
      {/if}
      <h3
        class={[
          "m-0 min-w-0 flex-1 overflow-clip type-label text-ellipsis whitespace-nowrap",
          selected ? "text-selected-ink" : "text-ink-strong",
        ]}
        title={routine.name}
      >
        {routine.name}
      </h3>
    </div>
    <Tip label="Open {routine.name}">
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label="Open {routine.name}"
          data-open-routine={routine.id}
          icon={IconMaximize}
          onclick={() => onopen(routine.id)}
          size="icon-xs"
          tone="quiet"
          variant="ghost"
        />
      {/snippet}
    </Tip>
  </header>

  <p
    class={[
      "mark-line m-0 flex items-start gap-space-2 type-meta",
      reading.needsYou ? "text-ink-strong" : "text-ink-muted",
    ]}
    data-slot="routine-sentence"
    title={reading.sentence}
  >
    {#if reading.running}
      <span class="inline-flex h-lh flex-none items-center" data-box>
        <LiveDot size="row" tone="live" />
      </span>
    {/if}
    <span class="line-clamp-2 min-w-0 text-pretty wrap-anywhere">
      {reading.sentence}
    </span>
  </p>

  {#if reading.needsYou && reading.fixPrompt}
    {@const prompt = reading.fixPrompt}
    <div class="mt-auto pt-space-1">
      <Button
        aria-label="Fix {routine.name} with Caw"
        disabled={stale}
        icon={IconSparkles}
        label="Fix with Caw"
        onclick={() => onfix(prompt)}
        size="xs"
        variant="outline"
      />
    </div>
  {/if}
</article>
