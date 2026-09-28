<script lang="ts">
  /**
   * What a `manage_memory` call read or wrote, as the document it is. The
   * sentence above already names the action and the path, so none of the raw
   * parameters are repeated here. A failed call never reaches this body — its
   * error is the row's result, shown by ToolGroup like any other failure.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { IconChevronRight } from "$lib/icons";
  import { memoryResult } from "./descriptors";
  import ToolProse from "./ToolProse.svelte";

  let {
    input,
    result,
  }: { input: Record<string, unknown> | undefined; result: unknown } = $props();

  const action = $derived(input?.action);
  const parsed = $derived(memoryResult(result));
  const written = $derived(
    typeof input?.content === "string" ? input.content : undefined
  );

  const clock = (iso: string): string =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const lines = (text: string): number => text.split("\n").length;

  /** `saved · d957eef · 03:56` — the parts the result actually carried. */
  const footer = $derived.by(() => {
    if (parsed.kind !== "doc") {
      return;
    }
    const parts = [
      action === "set" || action === "set_doc" ? "saved" : undefined,
      parsed.hash?.slice(0, 7),
      parsed.updatedAt ? clock(parsed.updatedAt) : undefined,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : undefined;
  });
</script>

{#snippet well(source: string)}
  <div class="well"><ToolProse {source} /></div>
{/snippet}

<div class="memory">
  {#if (action === 'set' || action === 'set_doc') && written !== undefined}
    <span class="label">New content</span>
    {@render well(written)}
    {#if footer}
      <span class="foot">{footer}</span>
    {/if}
  {:else if action === 'get' && parsed.kind === 'doc'}
    {@render well(parsed.content)}
    {#if footer}
      <span class="foot">{footer}</span>
    {/if}
  {:else if action === 'list_docs' && parsed.kind === 'docs'}
    <div class="docs">
      {#each parsed.docs as doc (doc.path)}
        <Collapsible.Root>
          <Collapsible.Trigger class="doc">
            <span class="path">{doc.path}</span>
            {#if doc.updatedAt}
              <span class="meta">{day(doc.updatedAt)}</span>
            {/if}
            <span class="meta">{lines(doc.content)} lines</span>
            <span class="chev"><IconChevronRight /></span>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <div class="doc-body">{@render well(doc.content)}</div>
          </Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Hangs under the row's text, past the glyph, like the fields well. */
  .memory {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3) calc(15px + var(--space-2));
    min-width: 0;
  }
  .label {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .well {
    max-height: 420px;
    overflow: auto;
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .foot {
    font: var(--text-meta) var(--font-mono);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .docs {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .docs :global(.doc) {
    width: 100%;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    text-align: left;
    cursor: pointer;
  }
  .docs :global(.doc:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
    border-radius: var(--radius-xs);
  }
  .path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }
  .meta {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    transition: transform var(--dur-control) var(--ease-out);
  }
  .chev :global(svg) {
    width: 12px;
    height: 12px;
    display: block;
  }
  .docs :global(.doc[data-state="open"] .chev) {
    transform: rotate(90deg);
  }
  .doc-body {
    padding: var(--space-1) 0 var(--space-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  @media (pointer: coarse) {
    .docs :global(.doc) {
      min-height: 44px;
    }
  }
</style>
