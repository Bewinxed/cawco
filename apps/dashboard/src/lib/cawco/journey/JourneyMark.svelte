<script lang="ts">
  /**
   * A journey step's mark, in its one cell on the label's first line: its
   * tick, its failure, a spinner while work runs, or its number with no
   * fill, in the strong ink on the outline button's edge while it stands on
   * the person and in the muted ink on the control edge while it waits, so
   * neither reads as a tick.
   *
   * `swap`: a change of mark is the house's icon swap in its one cell
   * (`icon-swap`, --dur-control), the old mark giving way as the new one
   * arrives, so a tick the hub lands while the card is open is seen landing.
   */
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconError, IconSuccess } from "#lib/icons.js";
  import type { JourneyMark } from "./journey";

  let {
    mark,
    n,
    swap = false,
  }: { mark: JourneyMark; n: number; swap?: boolean } = $props();
</script>

{#snippet number()}
  <!-- A step's number, no fill: in the muted ink on the control edge
       while it waits, in the strong ink on the outline button's edge
       (3:1) while it stands on you, so neither reads as a tick. -->
  <span
    aria-hidden="true"
    class={[
      "box-border grid size-full place-items-center rounded-pill border bg-transparent text-meta leading-none num before:content-data-n",
      mark === "standing"
        ? "border-border-button-outline text-ink-strong"
        : "border-border-control text-ink-muted",
    ]}
    data-n={n}
  ></span>
{/snippet}

<span class="mark-cell">
  {#if swap}
    <span
      class="icon-swap size-icon-md text-ink-muted"
      data-box
      data-mark={mark}
      data-slot="step-mark"
      style:--icon-swap-dur="var(--dur-control)"
    >
      <span data-active={mark === "done"}
        ><IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        /></span
      >
      <span data-active={mark === "failed"}
        ><IconError
          aria-hidden="true"
          class="size-icon-md text-status-fail-ink"
        /></span
      >
      <span data-active={mark === "working"}
        ><Spinner aria-hidden="true" role="none" /></span
      >
      <span
        class="size-icon-md"
        data-active={mark === "standing" || mark === "waiting"}
        >{@render number()}</span
      >
    </span>
  {:else}
    <span
      class="grid size-icon-md place-items-center text-ink-muted"
      data-slot="step-mark"
    >
      {#if mark === "done"}
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        />
      {:else if mark === "failed"}
        <IconError
          aria-hidden="true"
          class="size-icon-md text-status-fail-ink"
        />
      {:else if mark === "working"}
        <Spinner aria-hidden="true" role="none" />
      {:else}
        {@render number()}
      {/if}
    </span>
  {/if}
</span>
