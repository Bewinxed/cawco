<script lang="ts">
  /**
   * One machine's Update cell: the words `cellFor` gives and the buttons that
   * go with them. A change of row cross-fades the glyph in from the pop scale
   * and morphs the words into place; no row moves.
   */
  import type { BinaryUpdatePolicy } from "@cawco/core/binary-updates";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconClock, IconDownload } from "#lib/icons.js";
  import { type Cell, cellFor, type UpdateMachine } from "./model";
  import { updates } from "./updates.svelte";

  let {
    machine,
    policy,
    cell: given,
  }: {
    machine: UpdateMachine;
    policy: BinaryUpdatePolicy;
    /** A cell to draw as given, for the states page. */
    cell?: Cell;
  } = $props();

  const cell = $derived(given ?? cellFor(machine, policy));
  /** The machine's whole error, unfolded in place under the cell. */
  let reading = $state(false);
  const refused = $derived(updates.refused.get(machine.machineId));
</script>

<div class="overflow-hidden" {@attach morph()}>
  {#key cell.row}
    <div
      data-slot="swap"
      class="flex flex-wrap items-center gap-space-2 type-label motion-safe:animate-cell-swap motion-reduce:animate-cell-fade"
    >
      {#if cell.plain}
        <span class="type-meta text-ink-muted">{cell.text}</span>
      {:else if cell.text}
        {#if cell.icon === "spinner"}
          <span class="mark-line inline-flex items-center gap-space-2">
            <Spinner class="shrink-0" tone="muted" />
            <span data-slot="words">{cell.text}</span>
          </span>
        {:else}
          <Badge
            size="cell-tall"
            variant={cell.fail ? "destructive" : "ghost"}
          >
            {#if cell.fail}
              <span
                class="size-(--status-dot-size) shrink-0 rounded-pill bg-error-9"
                data-box
              ></span>
            {:else if cell.icon === "clock"}
              <IconClock class="size-icon-md shrink-0" />
            {:else if cell.icon === "download"}
              <IconDownload class="size-icon-md shrink-0" />
            {/if}
            <span>{cell.text}</span>
          </Badge>
        {/if}
        {#if cell.meta}
          <span data-num data-slot="meta" class="num type-meta text-ink-muted"
            >{cell.meta}</span
          >
        {/if}
        {#each cell.buttons as button (button)}
          {#if button === "retry"}
            <Button
              tone="muted"
              label="Retry"
              onclick={() => updates.installNow(machine)}
              size="xs"
              variant="ghost"
            />
          {:else if button === "error"}
            <Button
              aria-expanded={reading}
              tone="muted"
              label={reading ? "Hide the error" : "Read the error"}
              onclick={() => {
                reading = !reading;
              }}
              size="xs"
              variant="ghost"
            />
          {:else if button === "cancel"}
            <Button
              tone="muted"
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
  {#if reading && cell.buttons.includes("error")}
    <pre
      class="mt-space-2 max-h-c-update-said-h overflow-auto rounded-xs border border-border-well bg-surface-well p-space-2 type-code wrap-anywhere whitespace-pre-wrap text-ink-strong"
      transition:unfold>{machine.binaryUpdate?.error ??
        "The machine did not say why."}</pre>
  {/if}
  <RowFault again={refused?.again} reason={refused?.reason} />
</div>
