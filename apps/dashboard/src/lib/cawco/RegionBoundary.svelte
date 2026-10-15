<script lang="ts">
  /**
   * One independently failing part of the page (the composer, a transcript,
   * a side panel, a conversation, the sidebar, the tabs, a page): an error
   * thrown while it renders or runs its effects stops at this boundary, and
   * the part stands as one line saying so, with Try again to build it afresh.
   * Everything outside it keeps working; before this, a duplicate key in
   * the `/` menu replaced the whole dashboard with a 500. Nothing outside it
   * reads the error as the route's: RegionHeld marks it held (region-held.ts).
   *
   * The error is never swallowed: SvelteKit 3 hands every error a boundary
   * holds to the client `handleError` first (kit client.js, `transformError`),
   * which logs it whole and sends it to the hub's error log
   * (hooks.client.ts); what reaches `onerror` is the error SvelteKit made of
   * it, so here the console is told only which part stopped. An error in an
   * event handler or async work is not a render error and is not caught here
   * (svelte.dev/docs/svelte/svelte-boundary): those still reach the window's
   * handlers.
   */
  import type { Snippet } from "svelte";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import RegionHeld from "./RegionHeld.svelte";

  let {
    region,
    kept,
    children,
  }: {
    /** What the part is called in its failure line: "composer", "sidebar". */
    region: string;
    /** What the failure leaves safe, said after it ("Your draft is kept."). */
    kept?: string;
    children: Snippet;
  } = $props();

  function onerror() {
    console.error(`[cawco] the ${region} stopped after the error above`);
  }
</script>

<svelte:boundary {onerror}>
  <RegionHeld />
  {@render children()}
  {#snippet failed(_error, reset)}
    <div class="region-failed" data-region-failed={region}>
      <Alert variant="warning">
        <AlertDescription
          >The {region} stopped after an error. {kept ?? ""} The rest of the page
          still works. Try again to rebuild it.</AlertDescription
        >
        <AlertAction>
          <Button
            label="Try again"
            onclick={reset}
            size="xs"
            variant="outline"
          />
        </AlertAction>
      </Alert>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .region-failed {
    flex: 1 1 auto;
    min-inline-size: 0;
    padding: var(--space-3);
  }
</style>
