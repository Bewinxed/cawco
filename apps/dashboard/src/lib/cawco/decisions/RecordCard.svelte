<script lang="ts">
  /**
   * One card of a decided page, settled: the record is the cards the person
   * picked on, nothing restated in a block of its own (the decided record's
   * design). Top to bottom, each part only when it has something: the
   * mockup's still in the chosen state, the question, the chosen option as
   * the kit's picked chip with its line (or `Left open`), the dials, the
   * person's note led by their own mark, the tasks it made (each opening its
   * sheet in place), and a fold with the options turned down, the card's why
   * and the writer's Recommended mark. Nothing shows a card, option or page
   * id.
   */
  import type { RecordCard } from "@cawco/core/decisions";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import type { StageKind } from "#lib/cawco/project-tasks.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown, IconUser } from "#lib/icons.js";

  let {
    card,
    taskOf,
    hrefOf,
    onopentask,
  }: {
    card: RecordCard;
    /** A task the card made, as the board has it; undefined until the list holds it. */
    taskOf: (
      id: string
    ) => { kind: StageKind | null; title: string } | undefined;
    hrefOf: (taskId: string) => string;
    onopentask: (taskId: string) => void;
  } = $props();

  const fid = $props.id();
  let open = $state(false);

  const chosen = $derived(
    card.chosen.flatMap((id) =>
      card.options.filter((option) => option.id === id)
    )
  );
  const others = $derived(
    card.options.filter((option) => !card.chosen.includes(option.id))
  );
  const foldWords = $derived(
    open
      ? "Hide other options"
      : `${others.length} other ${others.length === 1 ? "option" : "options"}`
  );
  /** A task's chip wears its state's hue: done or failed; the sheet says the word. */
  const variantOf = (kind: StageKind | null | undefined) => {
    if (kind === "done") {
      return "done" as const;
    }
    return kind === "dropped" ? ("fail" as const) : ("default" as const);
  };
</script>

<!-- literal: 16 / 10 (the still's ratio) -->
<article
  data-slot="record"
  class="flex min-w-0 scroll-mt-space-4 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  id={card.id}
>
  {#if card.still}
    <img
      alt={chosen[0]?.label ?? ""}
      class="block aspect-(--still-ratio) w-full bg-surface-recess object-cover"
      src={card.still}
      style:--still-ratio="16 / 10"
    />
  {/if}
  <!-- A task filed onto the card arrives as rows do (motion/rows): its row
       is uncovered, each chip pops in, as the hub files it. -->
  <div
    data-slot="body"
    class="flex min-w-0 flex-col items-start gap-space-3 p-space-5"
    {@attach reflow()}
  >
    <h3
      data-slot="question"
      class="type-label max-w-full text-pretty text-ink-strong"
    >
      {card.question}
    </h3>
    {#if chosen.length > 0}
      {#each chosen as option (option.id)}
        <p
          data-slot="chosen"
          class="flex max-w-full min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
        >
          <span data-slot="sel" class="kit-chip sel cursor-default">
            <span class="kit-keycap">{option.keycap}</span><span
              data-slot="record-card-label">{option.label}</span
            >
          </span>
          {#if option.line}
            <span class="type-meta min-w-0 text-ink-muted">{option.line}</span>
          {/if}
        </p>
      {/each}
    {:else}
      <p data-slot="open-card" class="type-label max-w-full text-ink-subtle">
        Left open
      </p>
    {/if}
    {#if card.dials.length > 0}
      <p class="type-meta max-w-full text-ink-muted">
        {#each card.dials as [name, value], index (name)}
          <span
            >{index > 0 ? " · " : ""}{name}{" "}<span
              class="num text-ink-strong">{value}</span
            ></span
          >
        {/each}
      </p>
    {/if}
    {#if card.note}
      <p
        data-slot="note"
        class="mark-line type-body flex max-w-full items-start gap-space-2 text-ink-strong"
      >
        <span aria-hidden="true" class="mark-cell"
          ><span
            data-slot="mark"
            class="flex size-(--row-mark) flex-none items-center justify-center rounded-row-mark bg-action-surface leading-0 text-on-action"
            data-box><IconUser class="size-(--row-mark-glyph)" /></span
          ></span
        >
        <span
          data-slot="words"
          class="min-w-0 wrap-anywhere whitespace-pre-wrap">{card.note}</span
        >
      </p>
    {/if}
    {#if card.tasks.length > 0}
      <p
        data-slot="tasks"
        class="flex max-w-full min-w-0 flex-wrap gap-space-2"
        data-flip
      >
        {#each card.tasks as id (id)}
          {@const task = taskOf(id)}
          <Badge
            class="max-w-full"
            data-flip="pop"
            href={hrefOf(id)}
            onclick={(event: MouseEvent) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) {
                return;
              }
              event.preventDefault();
              onopentask(id);
            }}
            variant={variantOf(task?.kind)}
          >
            <span
              data-slot="id"
              class="num font-(family-name:--font-mono) text-size-meta text-ink-muted"
              >{id}</span
            >
            {#if task}
              <span
                data-slot="title"
                class="min-w-0 overflow-clip text-ellipsis">{task.title}</span
              >
            {/if}
          </Badge>
        {/each}
      </p>
    {/if}
    {#if others.length > 0 && card.options.length > 1}
      <!-- literal: calc(-1 * (1px + var(--space-2))), the toggle's hang into the card's inset -->
      <div
        data-slot="fold-row"
        class="my-(--fold-row-my) ms-(--fold-row-ms) max-w-full"
        style:--fold-row-my="calc(-1 * var(--space-1))"
        style:--fold-row-ms="calc(-1 * (1px + var(--space-2)))"
      >
        <Button
          data-toggle
          aria-controls="{fid}-others"
          aria-expanded={open}
          expanded="unfilled-at-rest"
          onclick={() => {
            open = !open;
          }}
          size="xs"
          variant="ghost"
        >
          <span>{foldWords}</span>
          <IconChevronDown
            data-chev
            aria-hidden="true"
            class="transition-[transform] dur-panel ease-out group-aria-expanded/button:transform-(--chev-flip) motion-reduce:transition-none"
            data-icon="inline-end"
            style="--chev-flip: scaleY(-1)"
          />
        </Button>
      </div>
      <!-- literal: 0fr, 1fr (the fold's track) -->
      <div
        data-slot="fold"
        class="group/fold mt-(--fold-pull) grid max-w-full grid-rows-(--rows-shut) transition-[grid-template-rows] dur-exit ease-out data-open:grid-rows-(--rows-open) data-open:dur-panel motion-reduce:transition-none motion-reduce:data-open:dur-panel"
        data-open={open || undefined}
        id="{fid}-others"
        inert={!open}
        style:--fold-pull="calc(-1 * var(--space-3))"
        style:--rows-open="1fr"
        style:--rows-shut="0fr"
      >
        <div
          data-slot="fold-inner"
          class="min-h-0 overflow-hidden opacity-0 blur-(--fold-blur) transition-fold-fade group-data-open/fold:opacity-100 group-data-open/fold:filter-none motion-safe:group-data-open/fold:dur-panel motion-reduce:filter-none motion-reduce:transition-[opacity] motion-reduce:dur-fade motion-reduce:group-data-open/fold:dur-panel"
        >
          <div class="flex flex-col gap-space-2 pt-space-3">
            {#if card.why}
              <p data-slot="why" class="type-meta text-ink-muted">{card.why}</p>
            {/if}
            {#each others as option (option.id)}
              <p
                data-slot="other"
                class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
              >
                <span class="kit-chip opacity-50">
                  <span class="kit-keycap">{option.keycap}</span><span
                    data-slot="record-card-label">{option.label}</span
                  >
                </span>
                {#if option.recommended}
                  <span
                    data-slot="tag"
                    class="type-meta rounded-xs border border-border-hairline px-space-1 text-ink-muted"
                    >Recommended</span
                  >
                {/if}
                {#if option.line}
                  <span class="type-meta min-w-0 text-ink-muted"
                    >{option.line}</span
                  >
                {/if}
              </p>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  /* residual: foreign-dom */
  [data-slot="fold-row"] :global([data-chev] path) {
    vector-effect: non-scaling-stroke;
  }
</style>
