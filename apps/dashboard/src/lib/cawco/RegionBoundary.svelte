<script lang="ts">
  /**
   * One independently failing part of the page (the composer, a transcript,
   * a side panel, a conversation, the sidebar, the tabs, a page, a view,
   * one comment): an error thrown while it renders or runs
   * its effects stops at this boundary, and the part stands as its fault
   * face (fault/), with Try again to build it afresh. Everything outside it
   * keeps working; before this, a duplicate key in the `/` menu replaced
   * the whole dashboard with a 500. Nothing outside it reads the error as
   * the route's: RegionHeld marks it held (region-held.ts).
   *
   * The face, by how much room the part has (`face`):
   * - `panel`, `page`: Caw whole over one headline and one line, Try
   *   again leading (RegionFault), filling the part's body;
   * - `line`: a list or one of its items, as one row in its place
   *   (LineFault); `strip`: a pane's tab row, at the row's height;
   *   `composer`: the line on the composer's pill, where the pill stood.
   * A decision card fails on its page's own renderer (OpenUiRenderer's
   * `fault`, decisions/host/DecisionFault): that page is its own bundle.
   *
   * `chrome` draws the face inside the part's own head, so its switch, its
   * name and its Close outlive the failure (SideSplit's side card, the
   * preview's sheet).
   *
   * Try again rebuilds the part; if the rebuild throws the same way at once,
   * the face turns to Reload page (fault/rebuild).
   *
   * The error is never swallowed: SvelteKit 3 hands every error a boundary
   * holds to the client `handleError` first (kit client.js, `transformError`),
   * which logs it whole, sends it to the hub's error log and answers with
   * its words (hooks.client.ts); what reaches `onerror` is the error
   * SvelteKit made of it, so here the console is told only which part
   * stopped. An error in an event handler or async work is not a render
   * error and is not caught here (svelte.dev/docs/svelte/svelte-boundary):
   * those still reach the window's handlers.
   */
  import {
    type FaultPart,
    regionFaultWords,
  } from "@cawco/core/words/region-fault";
  import type { Snippet } from "svelte";
  import LineFault from "./fault/LineFault.svelte";
  import RegionFault from "./fault/RegionFault.svelte";
  import { detailsOf, Rebuild, reloadPage } from "./fault/rebuild.svelte";
  import RegionHeld from "./RegionHeld.svelte";

  let {
    part,
    face = "panel",
    barOver = false,
    as = "div",
    chrome,
    children,
  }: {
    /** Which part it is: what its face calls it and what it says is safe. */
    part: FaultPart;
    face?: "panel" | "page" | "line" | "strip" | "composer";
    /**
     * A strip in a pane's tab row, which the phone's bar floats over: its
     * line stands under the bar's row, so it never meets the burger or
     * Caw's glass.
     */
    barOver?: boolean;
    /** The element a line face stands in: `li` for an item of a list. */
    as?: "div" | "li";
    /** The part's own head around its face. */
    chrome?: Snippet<[Snippet]>;
    children: Snippet;
  } = $props();

  const words = $derived(regionFaultWords.parts[part]);
  const kept = $derived("kept" in words ? words.kept : undefined);
  const rebuild = new Rebuild();

  function onerror(error: unknown) {
    console.error(`[cawco] ${words.what} stopped after the error above`);
    rebuild.threw(detailsOf(error));
  }
</script>

<svelte:boundary {onerror}>
  <RegionHeld />
  {@render children()}
  {#snippet failed(thrown, reset)}
    {@const details = detailsOf(thrown)}
    {@const retry = () => {
      rebuild.tried();
      reset();
    }}
    {#snippet fault()}
      {#if face === "panel" || face === "page"}
        <RegionFault
          again={rebuild.again}
          {details}
          {kept}
          onreload={reloadPage}
          onretry={retry}
          room={face}
          what={words.what}
        />
      {:else if face === "composer"}
        <!-- On the composer's pill, where the pill stood: the dock's foot,
             its width and its narrow screen's edges (Composer `dock`). -->
        <div
          class="pointer-events-none absolute inset-x-0 bottom-(--dock-foot) flex justify-center"
          style:--dock-foot="calc(var(--space-4) + var(--safe-bottom, 0px))"
        >
          <div
            class="pointer-events-auto w-c-composer-w min-w-0 rounded-lg border border-border-control bg-surface-raised px-space-3 shadow-tile max-desk:mx-space-3 max-desk:w-auto max-desk:flex-1"
          >
            <LineFault
              again={rebuild.again}
              {details}
              onreload={reloadPage}
              onretry={retry}
              what={words.what}
            />
          </div>
        </div>
      {:else if face === "strip"}
        <div
          data-bar-over={barOver || undefined}
          class="relative z-1 flex min-h-c-tab-row-h min-w-0 flex-none items-center bg-surface-shelf px-space-3 max-desk:data-bar-over:pt-(--bar-room)"
          style:--bar-room="calc(var(--c-top-bar-h) + var(--space-3))"
        >
          <div class="min-w-0 flex-1">
            <LineFault
              again={rebuild.again}
              {details}
              onreload={reloadPage}
              onretry={retry}
              strip
              what={words.what}
            />
          </div>
        </div>
      {:else}
        <svelte:element this={as} class="block w-full min-w-0 px-space-2">
          <LineFault
            again={rebuild.again}
            {details}
            onreload={reloadPage}
            onretry={retry}
            what={words.what}
          />
        </svelte:element>
      {/if}
    {/snippet}
    {#if chrome}
      {@render chrome(fault)}
    {:else}
      {@render fault()}
    {/if}
  {/snippet}
</svelte:boundary>
