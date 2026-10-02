<script lang="ts">
  import {
    type FleetMemoryVersion,
    memoryHistory,
    memoryVersion,
  } from "$lib/cawco/fleet";
  /**
   * What a `manage_memory` call read or wrote, as the document it is. The
   * sentence above already names the action and the path, so none of the raw
   * parameters are repeated here. A failed call never reaches this body — its
   * error is the row's result, shown by ToolGroup like any other failure.
   *
   * A write (`set`, `set_doc`) is a diff like an Edit's: from the version it
   * replaced to what it wrote. A `remove_doc` is the removed document diffed
   * to nothing. The replaced version is the hub's history row for it
   * (`fleet_memory_history`, read through the Configure editor's own routes).
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconChevronRight } from "$lib/icons";
  import DiffView from "../DiffView.svelte";
  import { memoryResult } from "./descriptors";
  import ToolProse from "./ToolProse.svelte";

  let {
    input,
    result,
    at,
  }: {
    input: Record<string, unknown> | undefined;
    result: unknown;
    /** When the call was made, ISO: what a `remove_doc` is matched by. */
    at: string | undefined;
  } = $props();

  const action = $derived(input?.action);
  const parsed = $derived(memoryResult(result));
  const written = $derived(
    typeof input?.content === "string" ? input.content : undefined
  );
  const docPath = $derived(
    typeof input?.path === "string" ? input.path : undefined
  );
  const expectedHash = $derived(
    typeof input?.expectedHash === "string" ? input.expectedHash : undefined
  );
  const writes = $derived(action === "set" || action === "set_doc");
  const removes = $derived(action === "remove_doc");

  /**
   * The hub stamps the replaced version and the saved row in one synchronous
   * handler (`keepReplacedMemory` then `setFleetMemory`), so the row a save
   * recorded sits within this of the save's own `updatedAt`.
   */
  const SAME_SAVE_MS = 1000;

  /** What the diff's old side is, once it is known. */
  type Before =
    | { kind: "loading" }
    | { kind: "version"; content: string }
    /** Nothing stood there before: a first write, against empty like Write. */
    | { kind: "empty" }
    /** The save matched what was already there. */
    | { kind: "unchanged" }
    | { kind: "missing"; why: string };

  /**
   * Which history row this call replaced or removed. `rows` are newest first.
   * A write: the row stamped by the same save (the one `expectedHash` names,
   * when the call sent one); none, and the document had earlier versions, is a
   * save of identical content; none at all is a first write. A removal: the
   * first row this document recorded at or after the call.
   */
  function replaced(
    rows: FleetMemoryVersion[]
  ): FleetMemoryVersion | Exclude<Before, { kind: "loading" | "version" }> {
    if (writes) {
      if (parsed.kind !== "doc" || !parsed.updatedAt) {
        return { kind: "missing", why: "the save did not say when it landed" };
      }
      const saved = Date.parse(parsed.updatedAt);
      const stamped = rows.find((row) => {
        const gap = saved - Date.parse(row.createdAt);
        return (
          gap >= 0 &&
          gap < SAME_SAVE_MS &&
          (expectedHash === undefined || row.hash === expectedHash)
        );
      });
      if (stamped) {
        return stamped;
      }
      return rows.some((row) => Date.parse(row.createdAt) < saved)
        ? { kind: "unchanged" }
        : { kind: "empty" };
    }
    if (!at) {
      return { kind: "missing", why: "the call carries no time to match" };
    }
    const called = Date.parse(at);
    const after = rows.filter((row) => Date.parse(row.createdAt) >= called);
    return (
      after.at(-1) ?? {
        kind: "missing",
        why: "the hub no longer keeps the removed version",
      }
    );
  }

  let before = $state<Before>({ kind: "loading" });

  $effect(() => {
    if (!(writes || removes)) {
      return;
    }
    // A live write has no saved row yet; the diff waits for it.
    if (writes && parsed.kind !== "doc") {
      before = { kind: "loading" };
      return;
    }
    let live = true;
    before = { kind: "loading" };
    const path = action === "set" ? undefined : docPath;
    memoryHistory(path)
      .then(async (rows) => {
        const found = replaced(rows);
        const next: Before =
          "id" in found
            ? {
                kind: "version",
                content: (await memoryVersion(found.id)).content,
              }
            : found;
        if (live) {
          before = next;
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          before = {
            kind: "missing",
            why: caught instanceof Error ? caught.message : String(caught),
          };
        }
      });
    return () => {
      live = false;
    };
  });

  const diffPath = $derived(action === "set" ? "CLAUDE.md" : (docPath ?? ""));

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
  {#if (writes && written !== undefined) || removes}
    {#if before.kind === 'loading'}
      <Skeleton class="h-20 w-full" />
    {:else if before.kind === 'missing'}
      <p class="missing" role="alert">
        The version this {removes ? 'removed' : 'replaced'} can't be shown:
        {before.why}.
      </p>
    {:else if before.kind === 'unchanged'}
      <p class="label">Saved unchanged: the content matched what was there.</p>
    {:else}
      <DiffView
        filePath={diffPath}
        newContent={removes ? '' : (written ?? '')}
        oldContent={before.kind === 'version' ? before.content : ''}
      />
    {/if}
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
          <!-- Folds like the row that holds it: grows open and folds shut
               from the header, which the transcript holds in place. -->
          <Collapsible.Content reveal>
            <div class="doc-body">{@render well(doc.content)}</div>
          </Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Hangs at the row's text column, like the fields well. */
  .memory {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3) var(--x-hang);
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
  .missing {
    font-size: var(--text-label);
    color: var(--ink-muted);
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
