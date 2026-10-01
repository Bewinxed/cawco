<script lang="ts">
  /**
   * One session in a home group. Status is the glyph alone, its word the
   * glyph's accessible name (ruling R3); the title, then one line under it
   * (what it is doing now, or where it lives), and a time at the end.
   *
   * The row is the session menu's trigger (right-click, long-press, the menu
   * key), as every session row in the app is; a pointer can drag it onto a
   * pane's edge to split, or into a group's tabs. On a wide screen a click
   * opens it in the focused pane.
   */
  import type { NeutralSessionInfo } from "@whiffle/core";
  import { cn } from "$lib/utils";
  import type { InstanceRow } from "../client.svelte";
  import LiveSessionMenu from "../LiveSessionMenu.svelte";
  import StoredSessionMenu from "../StoredSessionMenu.svelte";
  import { dragSession } from "../workspace/dnd.svelte";
  import SessionStatus from "../workspace/SessionStatus.svelte";

  let {
    instance = null,
    info = null,
    machineId,
    title,
    line,
    trail = "",
    href,
    active = false,
    quiet = false,
    stale = false,
  }: {
    instance?: InstanceRow | null;
    info?: NeutralSessionInfo | null;
    machineId: string;
    title: string;
    /** The line under the title. */
    line: string;
    /** The time at the row's end. */
    trail?: string;
    href: string;
    /** It is the conversation in front. */
    active?: boolean;
    /** Neutral ink: a finished turn is news, not a state to read in colour. */
    quiet?: boolean;
    /** The hub is not live: the row is what was last known. */
    stale?: boolean;
  } = $props();

  const sessionId = $derived(instance?.id ?? info?.sessionId ?? "");
</script>

{#snippet body(trigger: Record<string, unknown>)}
  <a
    {...trigger}
    aria-current={active ? 'page' : undefined}
    class={cn('row press-tint focus-inset', trigger.class as string | undefined)}
    data-active={active || undefined}
    data-flip
    data-quiet={quiet || undefined}
    data-share="session:{sessionId}"
    data-stale={stale || undefined}
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
      <span class="line">{line}</span>
    </span>
    {#if trail}
      <span class="num trail">{trail}</span>
    {/if}
  </a>
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
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    text-decoration: none;
    transition: var(--transition-control);
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--surface-hover);
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
    flex: none;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .row[data-active] {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  .row[data-active] .line,
  .row[data-active] .trail {
    color: var(--selected-ink);
  }
  .row[data-stale] {
    opacity: 0.55;
  }
  /* A finished turn reads in neutral ink: the glyph takes the muted ink too. */
  .row[data-quiet] .glyph :global(.session-status) {
    color: var(--ink-muted);
  }
</style>
