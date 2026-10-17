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
  import { configureWords } from "@cawco/core";
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
    /**
     * The section's one line under its title; absent or null where the rows
     * say it (core `CONFIG_SECTIONS`, whose `purpose` every section passes).
     */
    purpose?: string | null;
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

<svelte:head><title>{configureWords.documentTitle(title)}</title></svelte:head>

{#snippet fault(text: string)}
  <Alert.Root variant="destructive">
    <IconWarningTriangle />
    <Alert.Description>{text}</Alert.Description>
  </Alert.Root>
{/snippet}

<div
  class="flex min-h-0 min-w-0 flex-auto flex-col overflow-y-auto bg-surface-recess px-space-5 py-space-2"
>
  <!-- literal: 980px -->
  <div
    data-slot="body"
    class="flex max-w-(--body-max) shrink-0 grow basis-auto flex-col gap-space-6 rounded-lg bg-surface-raised px-space-7 py-space-6 min-h-(--card-min)"
    style:--body-max="980px"
    style:--card-min={card === null ? undefined : `${card}px`}
    {@attach morph()}
    {@attach settled ? rememberCard(page.url.pathname) : undefined}
  >
    <!-- literal: 12px -->
    <header
      data-slot="head"
      class="flex flex-wrap items-start justify-between gap-(--head-gap)"
      style:--head-gap="12px"
    >
      <div class="flex min-w-0 flex-col gap-space-1">
        <h1 data-slot="title" class="type-title tracking-title text-ink-strong">
          {title}
        </h1>
        {#if purpose}
          <!-- literal: 8px -->
          <p
            class="flex flex-wrap items-center gap-(--line-gap)"
            style:--line-gap="8px"
          >
            {purpose}
          </p>
        {/if}
      </div>
      {#if actions}
        <!-- literal: 8px -->
        <div
          data-slot="actions"
          class="flex flex-wrap items-center gap-(--line-gap)"
          style:--line-gap="8px"
        >
          {@render actions(down)}
        </div>
      {/if}
    </header>
    {#if !ready && problem}
      {@render fault(problem)}
    {:else}
      <!-- The toolbar acts on the rows, so it arrives with them. -->
      <div
        data-fill={(!ready && card !== null) || undefined}
        class="grid min-w-0 data-fill:min-h-0 data-fill:shrink data-fill:grow data-fill:basis-0 data-fill:grid-rows-1"
      >
        {#if ready}
          <div
            data-slot="slot"
            class="col-start-1 row-start-1 flex min-w-0 flex-col gap-space-5"
            in:appear
            {@attach holding && !settling ? settleThen : undefined}
          >
            {#if toolbar}
              <!-- literal: 8px -->
              <div
                class="flex flex-wrap items-center gap-(--line-gap)"
                style:--line-gap="8px"
              >
                {@render toolbar()}
              </div>
            {/if}
            {#if problem}
              {@render fault(problem)}
            {/if}
            {@render children()}
          </div>
        {:else}
          <div
            data-slot="slot"
            class="col-start-1 row-start-1 flex min-w-0 flex-col gap-space-5"
            out:fade={{ duration: dur("--dur-control"), easing: easeOut }}
          >
            <SkeletonRows fill={card !== null} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
