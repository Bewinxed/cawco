<script lang="ts">
  /**
   * One session in a home group. Status is the glyph alone, its word the
   * glyph's accessible name (ruling R3); the title, and at the end the age or
   * what it is doing now. Where it runs is said once by the machine header
   * above it, never per row; only a flat list (Recent) adds a line under.
   *
   * The row is the session menu's trigger (right-click, long-press, the menu
   * key), as every session row in the app is; a pointer can drag it onto a
   * pane's edge to split, or into a group's tabs. On a wide screen a click
   * opens it in the focused pane.
   */
  import type { NeutralSessionInfo } from "@whiffle/core";
  import { IconMaximize } from "$lib/icons";
  import { cn } from "$lib/utils";
  import type { InstanceRow } from "../client.svelte";
  import LiveSessionMenu from "../LiveSessionMenu.svelte";
  import StoredSessionMenu from "../StoredSessionMenu.svelte";
  import { dragSession } from "../workspace/dnd.svelte";
  import SessionStatus from "../workspace/SessionStatus.svelte";
  import { openPeek } from "./peek.svelte";

  let {
    instance = null,
    info = null,
    machineId,
    title,
    line = "",
    trail = "",
    href,
    active = false,
    stale = false,
  }: {
    instance?: InstanceRow | null;
    info?: NeutralSessionInfo | null;
    machineId: string;
    title: string;
    /** A line under the title, where a flat list needs to say where (Recent). */
    line?: string;
    /** The time at the row's end. */
    trail?: string;
    href: string;
    /** It is the conversation in front. */
    active?: boolean;
    /** The hub is not live: the row is what was last known. */
    stale?: boolean;
  } = $props();

  const sessionId = $derived(instance?.id ?? info?.sessionId ?? "");
</script>

{#snippet body(trigger: Record<string, unknown>)}
  <div
    class="item"
    data-active={active || undefined}
    data-flip
    data-stale={stale || undefined}
  >
    <a
      {...trigger}
      aria-current={active ? 'page' : undefined}
      class={cn('row press-tint focus-inset', trigger.class as string | undefined)}
      data-share="session:{sessionId}"
      {href}
      use:dragSession={{
      sessionId,
      from: null,
      ctx: () =>
        info
          ? { machine: machineId, cwd: info.cwd ?? '', harness: info.harness ?? 'claude' }
          : null,
    }}
    >
      <span class="glyph"><SessionStatus compact {sessionId} /></span>
      <span class="text">
        <span class="title">{title}</span>
        {#if line}
          <span class="line">{line}</span>
        {/if}
      </span>
      {#if trail}
        <span class="num trail">{trail}</span>
      {/if}
    </a>
    {#if instance}
      {@const live = instance}
      <!-- Glance → peek → dive: the tail of this one, without leaving home. -->
      <button
        aria-label="Peek {title}"
        class="peek touch-hit focus-inset"
        onclick={() => openPeek({ viewId: live.id, href, title })}
        title="Peek"
        type="button"
      >
        <IconMaximize aria-hidden="true" />
      </button>
    {/if}
  </div>
{/snippet}

{#if instance}
  <LiveSessionMenu {instance}>
    {#snippet children(trigger)}
      {@render body(trigger)}
    {/snippet}
  </LiveSessionMenu>
{:else if info}
  <StoredSessionMenu {info} {machineId}> {@render body({})} </StoredSessionMenu>
{/if}

<style>
  .item {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    transition: var(--transition-control);
  }
  .row {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    /* Compact at a desk; a finger keeps its 44px. */
    min-height: var(--space-8);
    padding: var(--space-1) var(--space-3);
    border-radius: inherit;
    color: inherit;
    text-decoration: none;
  }
  @media (pointer: coarse) {
    .row {
      min-height: 44px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .item:hover {
      background: var(--surface-hover);
    }
  }
  /* The peek sits at the row's end. A fine pointer finds it on hover or
     focus; a touch screen always shows it, since there is no hover. */
  .peek {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-right: var(--space-2);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .peek :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* At a desk it takes no room until wanted: it rises over the row's end. */
  @media (hover: hover) and (pointer: fine) {
    .peek {
      position: absolute;
      right: var(--space-1);
      margin: 0;
      background: var(--surface-hover);
      opacity: 0;
    }
    .item[data-active] .peek {
      background: var(--selected-bg);
    }
    .item:hover .peek,
    .item:focus-within .peek {
      opacity: 1;
    }
    .peek:hover {
      background: var(--surface-fill);
      color: var(--ink-strong);
    }
  }
  .glyph {
    display: inline-flex;
    flex: none;
  }
  .text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }
  .title,
  .line {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font: var(--type-label);
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .trail {
    flex: 0 1 auto;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .item[data-active] {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  .item[data-active] .line,
  .item[data-active] .trail,
  .item[data-active] .peek {
    color: var(--selected-ink);
  }
  .item[data-stale] {
    opacity: 0.55;
  }
</style>
