<script lang="ts">
  import type { RecordCard } from "@cawco/core/decisions";
  import type { StageKind } from "@cawco/core/views";
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
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
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
    open ? words.hideOthers : words.others(others.length)
  );
  /** A task's chip wears its state's hue: done or failed; the sheet says the word. */
  const variantOf = (kind: StageKind | null | undefined) => {
    if (kind === "done") {
      return "done" as const;
    }
    return kind === "dropped" ? ("fail" as const) : ("default" as const);
  };
</script>

<article
  data-slot="record"
  class="flex min-w-0 scroll-mt-space-4 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  id={card.id}
>
  {#if card.still}
    <img
      alt={chosen[0]?.label ?? ""}
      class="block aspect-16/10 w-full bg-surface-recess object-cover"
      src={card.still}
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
          <span data-slot="sel" class={chipVariants()} data-chosen>
            <Kbd data-box look="keycap">{option.keycap}</Kbd><span
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
        {words.leftOpen}
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
      <!-- The toggle and its fold stand as one item of the body, so a shut
           fold (a track of nothing) takes no gap of the body's: it opens
           into the body's own air, its inner box's padding. -->
      <div data-slot="fold-wrap" class="flex max-w-full flex-col">
        <!-- The toggle hangs into the card's leading inset: its words line up
             with the card's text. -->
        <div data-slot="fold-row" class="-ms-space-2 -my-space-1 max-w-full">
          <Button
            data-toggle
            aria-controls="{fid}-others"
            aria-expanded={open}
            expanded="unfilled"
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
              class="transition-[scale] duration-(--dur-panel) ease-out group-aria-expanded/button:-scale-y-100 motion-reduce:transition-off *:vector-non-scaling"
              data-icon="inline-end"
            />
          </Button>
        </div>
        <div
          data-slot="fold"
          class="group/fold grid max-w-full grid-rows-shut transition-[grid-template-rows] duration-(--dur-exit) ease-out data-open:grid-rows-open data-open:duration-(--dur-panel) motion-reduce:transition-off motion-reduce:data-open:duration-(--dur-panel)"
          data-open={open || undefined}
          id="{fid}-others"
          inert={!open}
        >
          <div
            data-slot="fold-inner"
            class="fold-item opacity-0 blur-(--fold-blur) transition-fold-fade group-data-open/fold:opacity-100 group-data-open/fold:filter-none motion-safe:group-data-open/fold:duration-(--dur-panel) motion-reduce:filter-none motion-reduce:transition-[opacity] motion-reduce:duration-(--dur-fade) motion-reduce:group-data-open/fold:duration-(--dur-panel)"
          >
            <div class="flex flex-col gap-space-2 pt-space-3">
              {#if card.why}
                <p data-slot="why" class="type-meta text-ink-muted">
                  {card.why}
                </p>
              {/if}
              {#each others as option (option.id)}
                <p
                  data-slot="other"
                  class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
                >
                  <span class={chipVariants({ class: "opacity-50" })}>
                    <Kbd data-box look="keycap">{option.keycap}</Kbd><span
                      data-slot="record-card-label">{option.label}</span
                    >
                  </span>
                  {#if option.recommended}
                    <span
                      data-slot="tag"
                      class="type-meta rounded-xs border border-border-hairline px-space-1 text-ink-muted"
                      >{words.recommended}</span
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
      </div>
    {/if}
  </div>
</article>
