<script lang="ts">
  /**
   * One machine's Update cell: the words `cellFor` gives and the buttons that
   * go with them. A change of row cross-fades the glyph in from the pop scale
   * and morphs the words into place; no row moves.
   */
  import type { BinaryUpdatePolicy } from "@cawco/core/binary-updates";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconClock, IconDownload } from "#lib/icons.js";
  import { type Cell, cellFor, type UpdateMachine } from "./model";
  import { updates } from "./updates.svelte";

  let {
    machine,
    policy,
    onerror,
    cell: given,
  }: {
    machine: UpdateMachine;
    policy: BinaryUpdatePolicy;
    /** Open the machine's whole error. */
    onerror: () => void;
    /** A cell to draw as given, for the states page. */
    cell?: Cell;
  } = $props();

  const cell = $derived(given ?? cellFor(machine, policy));
  const CHIP = "h-auto min-h-6 gap-1.5 whitespace-normal px-2 py-1 text-start";
</script>

<div class="cell" {@attach morph()}>
  {#key cell.row}
    <div class="swap">
      {#if cell.plain}
        <span class="plain">{cell.text}</span>
      {:else if cell.text}
        {#if cell.icon === "spinner"}
          <span class="line">
            <Spinner class="size-4 shrink-0 text-muted-foreground" />
            <span class="words">{cell.text}</span>
          </span>
        {:else}
          <Badge class={CHIP} variant={cell.fail ? "destructive" : "ghost"}>
            {#if cell.fail}
              <span class="size-2 shrink-0 rounded-full bg-error"></span>
            {:else if cell.icon === "clock"}
              <IconClock class="size-4 shrink-0" />
            {:else if cell.icon === "download"}
              <IconDownload class="size-4 shrink-0" />
            {/if}
            {cell.text}
          </Badge>
        {/if}
        {#if cell.meta}
          <span class="meta num">{cell.meta}</span>
        {/if}
        {#each cell.buttons as button (button)}
          {#if button === "retry"}
            <Button
              class="text-muted-foreground"
              label="Retry"
              onclick={() => updates.installNow(machine)}
              size="xs"
              variant="ghost"
            />
          {:else if button === "error"}
            <Button
              class="text-muted-foreground"
              label="Read the error"
              onclick={onerror}
              size="xs"
              variant="ghost"
            />
          {:else if button === "cancel"}
            <Button
              class="text-muted-foreground"
              label="Cancel"
              onclick={() => updates.cancel(machine)}
              size="xs"
              variant="ghost"
            />
          {:else}
            <Button
              label="Install now"
              onclick={() => updates.installNow(machine)}
              size="xs"
              variant="outline"
            />
          {/if}
        {/each}
      {/if}
    </div>
  {/key}
</div>

<style>
  .cell {
    overflow: hidden;
  }
  .swap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-label);
    @media (prefers-reduced-motion: no-preference) {
      animation: swap-in var(--dur-control) var(--ease-out);
    }
    @media (prefers-reduced-motion: reduce) {
      animation: fade-in var(--dur-control) var(--ease-out);
    }
  }
  .line {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .plain,
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @keyframes swap-in {
    from {
      opacity: 0;
      scale: var(--pop-scale);
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
