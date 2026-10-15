<script lang="ts">
  /**
   * PREVIEW ONLY: the three choices still open, a small fixed control outside
   * the product UI. Each is one segmented control with a line saying what it
   * changes, defaulting to the recommended option. A change takes you to
   * where it shows: S1 to Routines where it now lives, T5 to the board.
   */
  import { MediaQuery } from "svelte/reactivity";
  import Choice from "#lib/cawco/config/Choice.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { goto } from "$app/navigation";
  import { type PreviewPicks, pick, picks } from "./preview.svelte";

  let { projectId }: { projectId: string } = $props();

  const phone = new MediaQuery("(max-width: 639px)");
  let open = $state(!phone.current);

  interface Switch {
    key: keyof PreviewPicks;
    label: string;
    options: { value: string; label: string }[];
    says: string;
  }

  const SWITCHES: Switch[] = [
    {
      key: "place",
      label: "S1 Where Routines lives",
      says: "A tab after Pipeline, or a page of its own from a Routines button in the project head.",
      options: [
        { value: "tab", label: "Fourth tab" },
        { value: "page", label: "Own page" },
      ],
    },
    {
      key: "layout",
      label: "S5 How the page holds its parts",
      says: "Routines, Event sources and Approved actions: a bento of the three, tiles across the top that are its tabs, or a tab row over one.",
      options: [
        { value: "bento", label: "Bento" },
        { value: "strip", label: "Tiles" },
        { value: "tabs", label: "Tabs" },
      ],
    },
    {
      key: "archived",
      label: "T5 Archived tasks",
      says: "Dimmed in their columns while the strip's Archived is on, or folded into an Archive rail after the last column.",
      options: [
        { value: "dim", label: "Dimmed in place" },
        { value: "rail", label: "Archive rail" },
      ],
    },
  ];

  /** Where a change shows. */
  function change(key: keyof PreviewPicks, next: string) {
    pick(key, next as never);
    const base = `/project/${projectId}`;
    if (key === "place") {
      goto(next === "page" ? `${base}/routines` : `${base}?view=routines`);
    } else if (key === "archived") {
      goto(base);
    } else if (picks.place === "tab") {
      goto(`${base}?view=routines`);
    } else {
      goto(`${base}/routines`);
    }
  }
</script>

<aside
  aria-label="Preview switches"
  class="switches"
  data-open={open ? "" : undefined}
>
  <div class="top">
    <span class="title">Preview</span>
    <Button
      aria-expanded={open}
      onclick={() => {
        open = !open;
      }}
      size="xs"
      variant="ghost">{open ? "Hide" : "Show"}</Button
    >
  </div>
  {#if open}
    {#each SWITCHES as each (each.key)}
      <div class="group">
        <span class="label">{each.label}</span>
        <Choice
          label={each.label}
          onchange={(next) => change(each.key, next)}
          options={each.options}
          value={picks[each.key]}
        />
        <p class="says">{each.says}</p>
      </div>
    {/each}
  {/if}
</aside>

<style>
  .switches {
    position: fixed;
    inset-block-end: var(--space-3);
    inset-inline-start: var(--space-3);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-inline-size: min(21rem, calc(100vw - var(--space-6)));
    /* PREVIEW: on a desk it stands over the sidebar only, clear of the page. */
    @media (min-width: 900px) {
      inline-size: 13rem;
    }
    max-block-size: calc(100dvh - var(--space-8));
    overflow-y: auto;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
  .switches[data-open] {
    padding-block-end: var(--space-3);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .says {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
