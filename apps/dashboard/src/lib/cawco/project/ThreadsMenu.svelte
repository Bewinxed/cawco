<script lang="ts">
  /**
   * Caw's dock's title control (CawDock), on the artifact panel's recipe
   * (ArtifactMenu): the thread on show as a menu button, its glyph, its
   * title and a chevron, listing New thread and then the project's threads,
   * newest first, each with its glyph and how long ago it last moved.
   * Choosing one shows it in the dock; New thread opens an empty one on the
   * hero. With no thread yet the title is the words alone: there is nothing
   * to choose between.
   */
  import type { ThreadSummary } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconChat,
    IconChatAdd,
    IconChevronDown,
    IconNeedsYou,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";

  let {
    threads,
    shown,
    onchoose,
  }: {
    /** The project's threads, newest first (`threadsOf`). */
    threads: ThreadSummary[];
    /** The thread on show; null, a new one. */
    shown: string | null;
    /** A thread chosen; null, New thread. */
    onchoose: (threadId: string | null) => void;
  } = $props();

  const current = $derived(
    shown ? (threads.find((each) => each.id === shown) ?? null) : null
  );
  const title = $derived(current?.title ?? "New thread");
</script>

{#if threads.length === 0}
  <span class="threads-title mark-line">
    <IconChatAdd aria-hidden="true" />
    <span class="threads-name">{title}</span>
  </span>
{:else}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Threads, showing {title}"
      class="threads-trigger mark-line"
    >
      {#if current}
        <IconChat aria-hidden="true" />
      {:else}
        <IconChatAdd aria-hidden="true" />
      {/if}
      <span class="threads-name">{title}</span>
      <IconChevronDown aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="threads-list w-72">
      <DropdownMenu.Item
        aria-current={shown === null || undefined}
        class="thread-row"
        onSelect={() => onchoose(null)}
      >
        <IconChatAdd aria-hidden="true" />
        <span class="row-name">New thread</span>
      </DropdownMenu.Item>
      <DropdownMenu.Separator />
      {#each threads as thread (thread.id)}
        <DropdownMenu.Item
          aria-current={thread.id === shown || undefined}
          class="thread-row"
          onSelect={() => onchoose(thread.id)}
        >
          {#if thread.status === "needs-you"}
            <IconNeedsYou aria-hidden="true" class="row-attn" />
          {:else}
            <IconChat aria-hidden="true" />
          {/if}
          <span class="row-name">{thread.title}</span>
          <span class="row-age">{formatAgeShort(thread.lastAt)}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}

<style>
  /* The head's first control: the name in the label role, the button
     recipe the head gives every control (SideSurface), as the artifact
     panel's title is. */
  :global(.threads-trigger) {
    min-inline-size: 0;
    max-inline-size: 100%;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  /* With nothing to choose the words stand where the trigger's do: its
     inset and its ink, not a control. */
  .threads-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    block-size: 30px;
    padding-inline: var(--space-2);
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .threads-title :global(svg) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .threads-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.threads-list .thread-row[aria-current="true"]) {
    color: var(--ink-strong);
  }
  :global(.threads-list .thread-row .row-attn) {
    color: var(--status-attn-glyph);
  }
  .row-name {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  .row-age {
    flex: none;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }
</style>
