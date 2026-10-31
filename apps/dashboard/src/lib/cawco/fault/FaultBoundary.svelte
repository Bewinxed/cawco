<script lang="ts">
  /**
   * One independently failing part (a panel, a page, a list's item, a
   * strip, the composer, an OpenUI element on a decision page or in a
   * view): an error thrown while it renders or runs its effects stops at
   * this boundary, and the part stands as its fault face, with Try again to
   * build it afresh; everything outside it keeps working. Nothing outside
   * it reads the error as the route's: RegionHeld marks it held
   * (region-held.ts). The dashboard's parts reach it through RegionBoundary,
   * a decision page's and a view's elements through OpenUiRenderer.
   *
   * It imports nothing a bundle can't build (the dashboard's Vite build and
   * a decision page's Bun build alike): Caw is handed in (`caw`,
   * fault/caw.ts), the one part of a face that differs between them.
   *
   * The face, by how much room the part has (`face`):
   * - `panel`, `page`: Caw whole over one headline and one line, Try again
   *   leading (RegionFault), filling the part's body; `card`: the same on a
   *   decision card's shell, its question named;
   * - `line`: a list's item or an element in a page, as one row in its
   *   place (LineFault); `strip`: a pane's tab row, at the row's height;
   *   `composer`: the line on the composer's pill, where the pill stood.
   *
   * `chrome` draws the face inside the part's own head, so its switch, its
   * name and its Close outlive the failure (SideSplit's side card, the
   * preview's sheet).
   *
   * Try again rebuilds the part; if the rebuild throws the same way at once,
   * the face turns to Reload page (rebuild.svelte.ts).
   *
   * The error is never swallowed: under SvelteKit every error a boundary
   * holds goes to the client `handleError` first (kit client.js,
   * `transformError`), which logs it whole, sends it to the hub's error log
   * and answers with its words (hooks.client.ts); a decision page's host
   * logs and reports its own (OpenUiRenderer `logThrown`). Here the console
   * is told only which part stopped. An error in an event handler or async
   * work is not a render error and is not caught here
   * (svelte.dev/docs/svelte/svelte-boundary).
   */
  import type { Snippet } from "svelte";
  import RegionHeld from "../RegionHeld.svelte";
  import type { FaultCaw } from "./caw";
  import LineFault from "./LineFault.svelte";
  import RegionFault from "./RegionFault.svelte";
  import { detailsOf, Rebuild, reloadPage } from "./rebuild.svelte";

  let {
    what,
    kept,
    question,
    face = "panel",
    barOver = false,
    as = "div",
    caw,
    chrome,
    onerror: heard,
    children,
  }: {
    /** The part, as its face's sentence names it: "the preview", "this comment". */
    what: string;
    /** What is safe, where the person would fear for it. */
    kept?: string;
    /** A decision card's question, which outlives what threw. */
    question?: string;
    face?: "panel" | "page" | "card" | "line" | "strip" | "composer";
    /**
     * A strip in a pane's tab row, which the phone's bar floats over: its
     * line stands under the bar's row, so it never meets the burger or
     * Caw's glass.
     */
    barOver?: boolean;
    /** The element a line face stands in: `li` for an item of a list. */
    as?: "div" | "li";
    /** Caw as this bundle draws him. */
    caw: FaultCaw;
    /** The part's own head around its face. */
    chrome?: Snippet<[Snippet]>;
    /** The host hears the throw too (OpenUiRenderer's own log and retries). */
    onerror?: (error: unknown, reset: () => void) => void;
    children: Snippet;
  } = $props();

  const rebuild = new Rebuild();

  function onerror(error: unknown, reset: () => void) {
    console.error(`[cawco] ${what} stopped after the error above`);
    rebuild.threw(detailsOf(error));
    heard?.(error, reset);
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
      {#if face === "panel" || face === "page" || face === "card"}
        <RegionFault
          again={rebuild.again}
          {details}
          {kept}
          {question}
          onreload={reloadPage}
          onretry={retry}
          {caw}
          room={face}
          {what}
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
              {caw}
              {what}
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
              {caw}
              {what}
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
            {caw}
            {what}
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
