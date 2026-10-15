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

<article class="record" id={card.id}>
  {#if card.still}
    <img alt={chosen[0]?.label ?? ""} class="still" src={card.still} />
  {/if}
  <!-- A task filed onto the card arrives as rows do (motion/rows): its row
       is uncovered, each chip pops in, as the hub files it. -->
  <div class="body" {@attach reflow()}>
    <h3 class="question">{card.question}</h3>
    {#if chosen.length > 0}
      {#each chosen as option (option.id)}
        <p class="chosen">
          <span class="kit-chip sel picked">
            <span class="kit-keycap">{option.keycap}</span><span class="label"
              >{option.label}</span
            >
          </span>
          {#if option.line}
            <span class="line">{option.line}</span>
          {/if}
        </p>
      {/each}
    {:else}
      <p class="open-card">Left open</p>
    {/if}
    {#if card.dials.length > 0}
      <p class="dials">
        {#each card.dials as [name, value], index (name)}
          <span class="dial"
            >{index > 0 ? " · " : ""}{name}{" "}<span class="figure"
              >{value}</span
            ></span
          >
        {/each}
      </p>
    {/if}
    {#if card.note}
      <p class="note">
        <span aria-hidden="true" class="mark"><IconUser /></span>
        <span class="words">{card.note}</span>
      </p>
    {/if}
    {#if card.tasks.length > 0}
      <p class="tasks" data-flip>
        {#each card.tasks as id (id)}
          {@const task = taskOf(id)}
          <Badge
            class="task"
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
            <span class="id">{id}</span>
            {#if task}
              <span class="title">{task.title}</span>
            {/if}
          </Badge>
        {/each}
      </p>
    {/if}
    {#if others.length > 0 && card.options.length > 1}
      <div class="fold-row">
        <Button
          aria-controls="{fid}-others"
          aria-expanded={open}
          class="toggle"
          onclick={() => {
            open = !open;
          }}
          size="xs"
          variant="ghost"
        >
          {foldWords}
          <IconChevronDown
            aria-hidden="true"
            class="chev"
            data-icon="inline-end"
          />
        </Button>
      </div>
      <div
        class="fold"
        data-open={open || undefined}
        id="{fid}-others"
        inert={!open}
      >
        <div class="fold-inner">
          <div class="fold-body">
            {#if card.why}
              <p class="why">{card.why}</p>
            {/if}
            {#each others as option (option.id)}
              <p class="other">
                <span class="kit-chip turned">
                  <span class="kit-keycap">{option.keycap}</span><span
                    class="label">{option.label}</span
                  >
                </span>
                {#if option.recommended}
                  <span class="tag">Recommended</span>
                {/if}
                {#if option.line}
                  <span class="line">{option.line}</span>
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
  /* Kit Card: 12px, raised, the tile shadow, 18px rhythm, no border. */
  .record {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    scroll-margin-block-start: var(--space-4);
  }
  /* The still bleeds to the card's top and sides at its corners, 16:10. */
  .still {
    display: block;
    inline-size: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    background: var(--surface-recess);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    min-inline-size: 0;
    padding: var(--space-5);
  }
  .body > * {
    margin: 0;
    max-inline-size: 100%;
  }
  .question {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .chosen,
  .other {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
  }
  /* The kit's picked chip, inert: no hover, no press, no ring. */
  .picked {
    cursor: default;
  }
  .line {
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .open-card {
    font: var(--type-label);
    color: var(--ink-subtle);
  }
  .dials {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .figure {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  /* The person's words, led by their own mark (the transcript's reader mark). */
  .note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--row-mark);
    block-size: var(--row-mark);
    margin-block-start: calc(
      (var(--text-body) * var(--leading-body) - var(--row-mark)) / 2
    );
    border-radius: var(--row-mark-r);
    background: var(--action-surface);
    color: var(--on-action);
    line-height: 0;
  }
  .mark :global(svg) {
    inline-size: var(--row-mark-glyph);
    block-size: var(--row-mark-glyph);
  }
  .words {
    min-inline-size: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .tasks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .tasks :global(.task) {
    max-inline-size: 100%;
  }
  .id {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The fold's toggle hangs into the card's leading inset, as the notice's
     Configure… does: its words line up with the card's text. */
  .fold-row {
    margin-inline-start: calc(-1 * (1px + var(--space-2)));
    margin-block: calc(-1 * var(--space-1));
  }
  .fold-row :global(.chev) {
    transition: transform var(--dur-panel) var(--ease-out);
  }
  .fold-row :global(.chev path) {
    vector-effect: non-scaling-stroke;
  }
  .fold-row :global(.toggle[aria-expanded="true"] .chev) {
    transform: scaleY(-1);
  }
  .fold-row :global(.toggle[aria-expanded="true"]:not(:hover)) {
    background-color: transparent;
  }
  /* The update notice's fold: the grid row is the track, 0fr shut and 1fr
     open; it opens over --dur-panel and shuts over --dur-exit. */
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    margin-block-start: calc(-1 * var(--space-3));
    transition: grid-template-rows var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] {
    grid-template-rows: 1fr;
    transition-duration: var(--dur-panel);
  }
  .fold-inner {
    min-block-size: 0;
    overflow: hidden;
    opacity: 0;
    filter: blur(var(--fold-blur));
    transition:
      opacity var(--dur-exit) var(--ease-out),
      filter var(--dur-exit) var(--ease-out);
  }
  .fold[data-open] > .fold-inner {
    opacity: 1;
    filter: none;
    transition-duration: var(--dur-panel);
  }
  .fold-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block-start: var(--space-3);
  }
  .fold-body > * {
    margin: 0;
  }
  .why {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* An option turned down: the kit's chip at the disabled 50%. */
  .turned {
    opacity: 0.5;
  }
  /* The kit's own Recommended mark (page.css `.dp-tag`). */
  .tag {
    padding: 0 var(--space-1);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .fold,
    .fold-row :global(.chev) {
      transition: none;
    }
    .fold-inner {
      filter: none;
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
</style>
