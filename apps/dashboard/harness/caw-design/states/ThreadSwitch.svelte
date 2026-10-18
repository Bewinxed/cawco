<script lang="ts">
  /**
   * PROPOSED (head, A): the thread's name as the switcher, the kit dropdown
   * of the project's threads, most recent first, each with its age.
   *
   * - `line` (A1): the head's second line, "Caw" over it: the two lines
   *   are one menu button, the thread's name in the meta role with a linear
   *   chevron, stepping to `ink-strong` under the pointer.
   * - `row` (A2): the conversation's first line, not a second toolbar: a
   *   16px glyph, the thread's name and its chevron beside it, as wide as
   *   its words on the prose's text column, with no seam under it; the
   *   hover ghost round it; it scrolls away with the thread.
   *
   * With one thread there is nothing to switch to: the name stands as text.
   */
  import type { ThreadSummary } from "@cawco/core";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { clock } from "#lib/cawco/home/home-state.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChat, IconCheck, IconChevronDown } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";

  let {
    threads,
    current,
    look,
  }: {
    threads: ThreadSummary[];
    /** The thread on show; "" for a new thread not yet started. */
    current: string;
    look: "line" | "row";
  } = $props();

  const on = $derived(threads.find((one) => one.id === current) ?? null);
  const title = $derived(on?.title ?? "New thread");
</script>

{#snippet words()}
  {#if look === "line"}
    <span class="mark" data-design-head-mark
      ><CawFace size={28} status="ready" /></span
    >
    <span class="lines">
      <span class="who">Caw</span>
      <span class="which"
        ><span class="name">{title}</span
        >{#if threads.length > 1}<IconChevronDown
            aria-hidden="true"
            class="chev"
          />{/if}</span
      >
    </span>
  {:else}
    <span class="glyph mark-cell"><IconChat aria-hidden="true" /></span>
    <span class="name row-name">{title}</span>
    {#if threads.length > 1}<IconChevronDown
        aria-hidden="true"
        class="chev"
      />{/if}
  {/if}
{/snippet}

{#if threads.length > 1}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label="{title}, switch thread"
          class={["switch", look, "touch-hit"]}
          data-design-thread-switch={look}
          type="button"
        >
          {@render words()}
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="w-[min(20rem,calc(100vw-24px))]">
      {#each threads as one (one.id)}
        <DropdownMenu.Item class="min-w-0 gap-(--space-2)">
          <span class="grid size-(--icon-md) shrink-0 place-items-center">
            {#if one.id === on?.id}<IconCheck aria-hidden="true" />{/if}
          </span>
          <span class="min-w-0 flex-1 truncate">{one.title}</span>
          <span class="shrink-0 text-[var(--ink-subtle)] text-meta"
            >{formatAgeShort(one.lastAt, clock.now)}</span
          >
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <div class={["switch", look, "still"]} data-design-thread-switch={look}>
    {@render words()}
  </div>
{/if}

<style>
  /* One grid for both looks: the 28px lead column, the words on the text
     column --space-3 after it (DESIGN.md, Caw's panel: every row stands on
     one grid). */
  .switch {
    display: grid;
    grid-template-columns: var(--lead-col) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }
  button.switch {
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .mark {
    display: grid;
    place-items: center;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .who {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .which {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);

    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--dur-control) var(--ease-out);
    }
  }
  .name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .switch :global(.chev) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  @media (hover: hover) and (pointer: fine) {
    button.line:hover .which {
      color: var(--ink-strong);
    }
  }
  button.switch[aria-expanded="true"] .which {
    color: var(--ink-strong);
  }

  /* A2: the conversation's first line: as wide as its words, its glyph on
     the prose's text column (the ghost's own inset taken back), the
     chevron beside the name, the hover ghost round it, no seam. */
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    max-inline-size: 100%;
    min-block-size: var(--c-btn-h-sm);
    margin-inline-start: calc(var(--space-3) - var(--space-2));
    padding-inline: var(--space-2);
  }
  button.row {
    @media (prefers-reduced-motion: no-preference) {
      transition: background-color var(--dur-control) var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
  }
  .glyph {
    color: var(--ink-muted);
  }
  .glyph :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .glyph :global(svg [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }
  .row-name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .row :global(.chev) {
    color: var(--ink-muted);
  }
</style>
