<script lang="ts">
  /**
   * The one section template: a recessed ground holding one raised body. The
   * header carries the title, the section's purpose in one line, and its
   * actions; an optional toolbar row, above the rows, holds the controls
   * that act on them. An error sits above whatever rows were last read.
   *
   * Loading stands the card at the height it settled at last time (cards),
   * with skeleton rows filling it, and the skeleton hands its place to the
   * rows in its reveal (motion/curves `reveal`), in the same place: the card
   * does not move. With no height kept yet, three
   * skeleton rows.
   */
  import { configureWords } from "@cawco/core";
  import { detach } from "@cawco/core/detach";
  import { type Snippet, untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { reveal } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { page } from "$app/state";
  import { cawco } from "../client.svelte";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import { type Cards, rememberCard } from "./cards";
  import { hubDown } from "./hub.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import type { ConfigSection } from "./sections";
  import { configStore } from "./store.svelte";
  import { unrestoredOn } from "./unrestored.svelte";

  let {
    section,
    ready = true,
    problem = null,
    actions,
    toolbar,
    children,
    settling = false,
  }: {
    /**
     * The section it frames (sections.ts): its label is the title, its
     * purpose the one line under it, absent or null where the rows say it.
     */
    section: Pick<ConfigSection, "label"> &
      Partial<Pick<ConfigSection, "purpose">>;
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
    const sizes = frameObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(release, 300);
    });
    sizes.observe(node);
    return () => {
      clearTimeout(timer);
      sizes.disconnect();
    };
  };
  /** The section this page is: `/config/<section>`, its list or an editor under it. */
  const sectionOf = (path: string) => `/config/${path.split("/")[2] ?? ""}`;
  const store = configStore();
  /**
   * This section's refused Undos (unrestored.svelte.ts), kept through a
   * reload. Try again after a reload reads the section's lists again, the
   * Configure store's and a page's own (`cawco:config-restored`).
   */
  const refusedUndos = $derived(
    unrestoredOn(sectionOf(page.url.pathname), () => {
      detach(store.loadAll(), "loadAll");
      window.dispatchEvent(new CustomEvent("cawco:config-restored"));
    })
  );
  // Leaving the section for another page is acting on what it said; a
  // reload is not, and keeps it. A teardown runs in the browser only: on
  // the server there is no leaving, and no page to read after the render.
  $effect(() => {
    const here = untrack(() => sectionOf(page.url.pathname));
    return () =>
      untrack(() => {
        if (sectionOf(page.url.pathname) === here) {
          return;
        }
        for (const said of unrestoredOn(here, () => undefined)) {
          refusals.delete(said.key);
        }
      });
  });
  /** Rows read, nothing wrong, the hub up: the size worth keeping. */
  const settled = $derived(ready && !problem && cawco.hub === "connected");
</script>

<svelte:head><title>{configureWords.documentTitle(section.label)}</title></svelte:head>

{#snippet fault(text: string)}
  <Alert.Root variant="destructive">
    <IconWarningTriangle />
    <Alert.Description>{text}</Alert.Description>
  </Alert.Root>
{/snippet}

<div
  class="flex min-h-0 min-w-0 flex-auto flex-col overflow-y-auto bg-surface-recess px-space-5 py-space-2"
>
  <div
    data-slot="body"
    class="flex max-w-c-config-max-w min-h-(--card-h) shrink-0 grow basis-auto flex-col gap-space-6 rounded-lg bg-surface-raised px-space-7 py-space-6"
    style:--card-h={card === null ? undefined : `${card}px`}
    {@attach morph({ on: ["data-fill"] })}
    {@attach settled ? rememberCard(page.url.pathname) : undefined}
  >
    <!-- The actions stand beside the title and its line, centred on the pair
         (DESIGN.md, Layout), while the pair keeps 9rem beside them: its
         line wraps first; only actions wider than that leave go under it. -->
    <header
      data-slot="head"
      class="flex flex-wrap items-center justify-between gap-space-3"
    >
      <div class="flex min-w-36 grow basis-0 flex-col gap-space-1">
        <h1
          data-slot="title"
          class="type-title tracking-title text-balance text-ink-strong"
        >
          {section.label}
        </h1>
        {#if section.purpose}
          <p class="flex flex-wrap items-center gap-space-2 text-pretty">
            {section.purpose}
          </p>
        {/if}
      </div>
      {#if actions}
        <div
          data-slot="actions"
          class="flex flex-wrap items-center gap-space-2"
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
            in:reveal
            {@attach holding && !settling ? settleThen : undefined}
          >
            {#if toolbar}
              <div class="flex flex-wrap items-center gap-space-2">
                {@render toolbar()}
              </div>
            {/if}
            {#if problem}
              {@render fault(problem)}
            {/if}
            {#each refusedUndos as said (said.key)}
              <RowFault
                again={said.again}
                data-unrestored={said.key}
                reason={said.reason}
              />
            {/each}
            {@render children()}
          </div>
        {:else}
          <div
            data-slot="slot"
            class="col-start-1 row-start-1 flex min-w-0 flex-col gap-space-5"
            out:reveal
          >
            <SkeletonRows fill={card !== null} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
