<script lang="ts">
  /**
   * The one section template: a recessed ground holding one raised body. The
   * header carries the title, the section's purpose in one line, and its
   * actions; an optional toolbar row holds the controls a section already
   * had. Loading shows three skeleton rows; an error sits inside the body
   * above whatever rows were last read.
   */
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "$lib/components/ui/alert";
  import { IconWarningTriangle } from "$lib/icons";
  import { morph } from "$lib/whiffle/motion/morph.svelte";
  import { hubDown } from "./hub.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";

  let {
    title,
    purpose,
    ready = true,
    problem = null,
    actions,
    toolbar,
    children,
  }: {
    title: string;
    purpose: string;
    /** False until the section's rows have been read once. */
    ready?: boolean;
    problem?: string | null;
    /** Receives whether writes are blocked, to disable the primary with. */
    actions?: Snippet<[boolean]>;
    toolbar?: Snippet;
    children: Snippet;
  } = $props();

  const down = $derived(hubDown());
</script>

<svelte:head><title>{title} · Configure · Whiffle</title></svelte:head>

<div class="ground">
  <div class="body" {@attach morph()}>
    <header class="head">
      <div class="titles">
        <h1 class="title">{title}</h1>
        <p class="purpose">{purpose}</p>
        {#if down}
          <p class="down">{down}</p>
        {/if}
      </div>
      {#if actions}
        <div class="actions">{@render actions(down !== null)}</div>
      {/if}
    </header>
    {#if toolbar}
      <div class="toolbar">{@render toolbar()}</div>
    {/if}
    {#if problem}
      <Alert.Root variant="destructive">
        <IconWarningTriangle />
        <Alert.Description>{problem}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if ready}
      {@render children()}
    {:else if !problem}
      <SkeletonRows />
    {/if}
  </div>
</div>

<style>
  .ground {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 7px 21px;
    background: var(--surface-recess);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 980px;
    padding: 18px 18px 20px;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .title {
    font: var(--type-title);
    letter-spacing: -0.01em;
    color: var(--ink-strong);
  }
  .purpose,
  .down {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .down {
    color: var(--status-attn-ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  @media (max-width: 900px) {
    .ground {
      padding: 7px;
    }
  }
</style>
