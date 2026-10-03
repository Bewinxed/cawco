<script lang="ts">
  /**
   * The one section template: a recessed ground holding one raised body. The
   * header carries the title, the section's purpose in one line, and its
   * actions; an optional toolbar row, above the rows, holds the controls
   * that act on them. An error sits above whatever rows were last read.
   *
   * Loading stands the card at the height it settled at last time (cards),
   * with skeleton rows filling it, and the rows fade in over them in the
   * same place: the card does not move. With no height kept yet, three
   * skeleton rows.
   */
  import { type Snippet, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { appear, dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { page } from "$app/state";
  import { cawco } from "../client.svelte";
  import { type Cards, rememberCard } from "./cards";
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
    settling = false,
  }: {
    title: string;
    purpose: string;
    /** False until the section's rows have been read once. */
    ready?: boolean;
    problem?: string | null;
    /** Receives why writes are blocked, or null: the primary is disabled on it
        and says it as its title. */
    actions?: Snippet<[string | null]>;
    toolbar?: Snippet;
    children: Snippet;
    /** Rows are read, and more are still arriving (each machine's, say). */
    settling?: boolean;
  } = $props();

  const down = $derived(hubDown());
  /**
   * The card holds the height it settled at last time from the moment the
   * page loads until its rows have stopped arriving (a section can read in
   * two steps: its own rows, then each machine's), so the card does not dip
   * to a half-built size and grow back. A page whose rows are already there
   * holds nothing.
   */
  let holding = $state(untrack(() => !ready));
  const card = $derived(
    holding && !problem
      ? ((page.data.cards as Cards | undefined)?.[page.url.pathname] ?? null)
      : null
  );
  /** Attachment on the arrived rows, once nothing more is on its way: lets go once they keep still for 300ms. */
  const settleThen = (node: HTMLElement) => {
    const release = () => {
      holding = false;
    };
    let timer = setTimeout(release, 300);
    const sizes = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(release, 300);
    });
    sizes.observe(node);
    return () => {
      clearTimeout(timer);
      sizes.disconnect();
    };
  };
  /** Rows read, nothing wrong, the hub up: the size worth keeping. */
  const settled = $derived(ready && !problem && cawco.hub === "connected");
</script>

<svelte:head><title>{title} · Configure · CawCo</title></svelte:head>

{#snippet fault(text: string)}
  <Alert.Root variant="destructive">
    <IconWarningTriangle />
    <Alert.Description>{text}</Alert.Description>
  </Alert.Root>
{/snippet}

<div class="ground">
  <div
    class="body"
    style:min-height={card === null ? undefined : `${card}px`}
    {@attach morph()}
    {@attach settled ? rememberCard(page.url.pathname) : undefined}
  >
    <header class="head">
      <div class="titles">
        <h1 class="title">{title}</h1>
        <p class="purpose">{purpose}</p>
      </div>
      {#if actions}
        <div class="actions">{@render actions(down)}</div>
      {/if}
    </header>
    {#if !ready && problem}
      {@render fault(problem)}
    {:else}
      <!-- The toolbar acts on the rows, so it arrives with them. -->
      <div class="content" class:fill={!ready && card !== null}>
        {#if ready}
          <div
            class="slot"
            in:appear
            {@attach holding && !settling ? settleThen : undefined}
          >
            {#if toolbar}
              <div class="toolbar">{@render toolbar()}</div>
            {/if}
            {#if problem}
              {@render fault(problem)}
            {/if}
            {@render children()}
          </div>
        {:else}
          <div
            class="slot"
            out:fade={{ duration: dur('--dur-control'), easing: easeOut }}
          >
            <SkeletonRows fill={card !== null} />
          </div>
        {/if}
      </div>
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
  /* The skeleton and the rows share one cell, so the rows fade in where the
     skeleton was. Standing at a kept height, the cell takes the room the
     card has left, and the skeleton fills it. */
  .content {
    display: grid;
    min-width: 0;

    &.fill {
      flex: 1 1 0;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
    }
  }
  .slot {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
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
