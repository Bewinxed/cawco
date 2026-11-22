<script lang="ts">
  /**
   * The project's outcomes, one row each: a fact it depends on or what its
   * recurring work delivers, in the person's words; its answer now as a word
   * read down one column, beside one sentence of what was found or
   * delivered; and, only where it needs him, the Needs you mark and Fix with
   * Caw. The open button at the row's end opens the routine behind it beside
   * the list, where its name, schedule and runs are.
   *
   * Those that need him lead, then the rest in the order they were made.
   * Under a 640px list each row is one card: the outcome, the mark when it
   * needs him and the open button, with the answer under them; the fix is in
   * the opened routine.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconSparkles } from "#lib/icons.js";
  import { readOutcome } from "./routine-format";
  import type { Routine } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    headerAction?: Snippet;
    /** Asks Caw to fix a routine, with the words that say what went wrong. */
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    routines: Routine[];
    selectedRoutineId: string | null;
    stale?: boolean;
  }

  let {
    routines,
    selectedRoutineId,
    stale = false,
    headerAction,
    onopen,
    onfix,
  }: Props = $props();

  /** Those that need him first, then the order they were made in. */
  const rows = $derived(
    routines
      .map((routine) => ({ reading: readOutcome(routine), routine }))
      .sort((a, b) => Number(b.reading.needsYou) - Number(a.reading.needsYou))
  );

  /** Each fixed column's width, its head's and its cells' alike; Now takes the rest. */
  const COL_W = {
    open: "calc(var(--spacing) * 6 + 2 * var(--spacing-space-3))",
    outcome: "calc(var(--spacing) * 68)",
    state:
      "calc(var(--spacing-icon-md) + var(--spacing-space-2) + var(--spacing) * 28 + 2 * var(--spacing-space-3))",
  };
</script>

<div class="flex flex-col gap-space-3" data-slot="outcome-list-view">
  <header
    class="flex flex-wrap items-center justify-between gap-space-2"
    data-slot="routines-header"
  >
    <h2 class="m-0 type-label text-ink-strong">Routines</h2>
    {@render headerAction?.()}
  </header>

  <div
    class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
    data-slot="ledger"
    style:--card-cols="minmax(0, 1fr) auto auto"
    style:--answer-cols="calc(var(--spacing) * 26) minmax(0, 1fr)"
  >
    <Table.Root
      data-outcomes
      ghostRows="tbody tr"
      layout="ledger"
      stacks="phone"
    >
      <Table.Header>
        <Table.Row variant="band">
          <Table.Head
            class="w-(--col-w)"
            style="--col-w: {COL_W.outcome}"
            variant="band">Outcome</Table.Head
          >
          <Table.Head variant="band">Now</Table.Head>
          <Table.Head
            class="w-(--col-w)"
            style="--col-w: {COL_W.state}"
            variant="band"><span class="sr-only">Needs you</span></Table.Head
          >
          <Table.Head
            class="w-(--col-w)"
            style="--col-w: {COL_W.open}"
            variant="band"><span class="sr-only">Open</span></Table.Head
          >
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each rows as { routine, reading } (routine.id)}
          {@const picked = selectedRoutineId === routine.id}
          <Table.Row
            class="group/row"
            data-needs-you={reading.needsYou || undefined}
            data-outcome-row={routine.id}
            data-picked={picked || undefined}
            variant="picks-stacks"
          >
            <Table.Cell
              class="w-(--col-w)"
              data-outcome-col="outcome"
              style="--col-w: {COL_W.outcome}"
              variant="ledger-picks-stacks-lead"
            >
              <span
                class={[
                  "line-clamp-2 min-w-0 type-label text-pretty",
                  picked ? "text-selected-ink" : "text-ink-row",
                ]}>{reading.says}</span
              >
            </Table.Cell>
            <Table.Cell
              class="@max-phone/table:col-span-3 @max-phone/table:row-start-2"
              data-outcome-col="now"
              variant="ledger-picks-stacks-lead"
            >
              <p
                class="m-0 grid min-w-0 grid-cols-(--answer-cols) items-baseline gap-x-space-3 @max-phone/table:flex @max-phone/table:gap-x-space-2"
                data-slot="outcome-answer"
                title={reading.sentence}
              >
                <span
                  class={[
                    "type-label",
                    reading.needsYou ? "text-ink-strong" : "text-ink-row",
                  ]}
                  data-slot="answer-word">{reading.answer}</span
                >
                <span
                  class={[
                    "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere",
                    reading.needsYou ? "text-ink-strong" : "text-ink-muted",
                  ]}>{reading.sentence}</span
                >
              </p>
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-2 @max-phone/table:row-start-1"
              data-outcome-col="state"
              inCard="drops-empty"
              style="--col-w: {COL_W.state}"
              variant="ledger-picks-stacks"
            >
              {#if reading.needsYou}
                <span class="flex items-center gap-space-2">
                  <span
                    aria-label="Needs you"
                    class="inline-flex flex-none items-center"
                    data-box
                    role="img"
                    title="Needs you"
                  >
                    <StatusGlyph glyph="needs-you" tone="attn" />
                  </span>
                  {#if reading.fixPrompt}
                    {@const prompt = reading.fixPrompt}
                    <!-- The opened routine holds it on a phone. -->
                    <span class="@max-phone/table:hidden">
                      <Button
                        aria-label="Fix with Caw: {reading.says}"
                        disabled={stale}
                        icon={IconSparkles}
                        label="Fix with Caw"
                        onclick={() => onfix(prompt)}
                        size="xs"
                        variant="outline"
                      />
                    </span>
                  {/if}
                </span>
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-3 @max-phone/table:row-start-1"
              data-outcome-col="open"
              edge="end"
              style="--col-w: {COL_W.open}"
              variant="ledger-picks-stacks"
            >
              <!-- The routine behind it opens only here, as everywhere in the dashboard. -->
              <Tip label="Open">
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label="Open the routine behind {reading.says}"
                    data-open-routine={routine.id}
                    icon={IconMaximize}
                    onclick={() => onopen(routine.id)}
                    size="icon-xs"
                    tone="muted"
                    variant="ghost"
                  />
                {/snippet}
              </Tip>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
