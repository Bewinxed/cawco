<script lang="ts">
  /**
   * One session in a home group. It leads with its project's mark, the
   * folder tile the rail's projects list draws, coloured by the session's
   * status; the status word is read out with the title, so colour is never
   * the only signal. Under the title, the project and what it is doing now;
   * at the end, the age. Where it runs is said once by the machine header
   * above it, never per row; only a flat list (Recent) names the machine.
   *
   * The row is the session menu's trigger (right-click, long-press, the menu
   * key), as every session row in the app is; a pointer can drag it onto a
   * pane's edge to split, or into a group's tabs. On a wide screen a click
   * opens it in the focused pane.
   */
  import type { NeutralSessionInfo } from "@whiffle/core";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "$lib/icons";
  import { cn } from "$lib/utils";
  import {
    type InstanceRow,
    isFailed,
    isStale,
    whiffle,
  } from "../client.svelte";
  import LiveSessionMenu from "../LiveSessionMenu.svelte";
  import ProjectMark, {
    type MarkStatus,
    STATUS_WORD,
  } from "../ProjectMark.svelte";
  import StoredSessionMenu from "../StoredSessionMenu.svelte";
  import { dragSession } from "../workspace/dnd.svelte";
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
    done = false,
  }: {
    instance?: InstanceRow | null;
    info?: NeutralSessionInfo | null;
    machineId: string;
    title: string;
    /** The meta line under the title: the project, then what adds to it. */
    line?: string;
    /** The time at the row's end. */
    trail?: string;
    href: string;
    /** It is the conversation in front. */
    active?: boolean;
    /** The hub is not live: the row is what was last known. */
    stale?: boolean;
    /** It is listed as finished: an idle session here is done, not idle. */
    done?: boolean;
  } = $props();

  const sessionId = $derived(instance?.id ?? info?.sessionId ?? "");
  const status = $derived.by<MarkStatus>(() => {
    if (!instance) {
      return "idle";
    }
    if (isFailed(instance)) {
      return "fail";
    }
    if (
      isStale(instance) ||
      instance.status === "sleeping" ||
      instance.status === "stopped"
    ) {
      return "idle";
    }
    const activity = whiffle.activityOf(instance.id);
    if (activity === "blocked") {
      return "attn";
    }
    if (activity === "working") {
      return "live";
    }
    return done ? "done" : "idle";
  });
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
      <ProjectMark {status} />
      <span class="text">
        <span class="title"
          ><span class="sr-only">{STATUS_WORD[status]}: </span>{title}</span
        >
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
      <Tip label="Peek">
        {#snippet children(tip)}
          <button
            {...tip}
            aria-label="Peek {title}"
            class="peek touch-hit focus-inset"
            onclick={() => openPeek({ viewId: live.id, href, title })}
            type="button"
          >
            <IconMaximize aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
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
