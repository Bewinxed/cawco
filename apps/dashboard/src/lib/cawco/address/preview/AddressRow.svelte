<script lang="ts">
  /**
   * The address's onboarding row in Needs you, in NeedsCard's own recipe
   * (its mark column, the title and its wait, what it wants, the kind and
   * where), the way the tailnet row stands today. Its want line is where
   * the set-up stands while the tray is closed ("Waiting for your sign-in…",
   * with the live dot), so the work it parked is seen here. The whole row
   * opens the tray where the set-up stands.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconLink, IconSuccess } from "#lib/icons.js";
  import type { AddressTray } from "../tray.svelte";
  import { rowLine } from "../words";

  let {
    tray,
    ref = $bindable(null),
    onopen,
  }: {
    tray: AddressTray;
    ref?: HTMLElement | null;
    onopen: () => void;
  } = $props();

  const line = $derived(rowLine(tray));
  const live = $derived(tray.step === "live");
</script>

<div
  bind:this={ref}
  class="group/row mark-line relative grid min-h-c-row-h grid-cols-(--row-cols) items-baseline gap-x-space-3 rounded-sm px-space-3 py-space-2"
  data-address-row
  data-kind="address"
  style:--row-cols="auto minmax(0, 1fr) auto"
>
  <button
    data-box
    aria-label="Open {live ? `${tray.name} is live` : 'Open CawCo by one word'}"
    class="press-tint focus-inset absolute inset-0 rounded-inherit hover:bg-surface-hover"
    data-slot="cover"
    onclick={onopen}
    type="button"
  ></button>
  <span
    class="pointer-events-none relative col-1 row-1 grid h-c-row-mark w-c-row-lead place-items-center self-center text-ink-muted"
    data-slot="lead"
  >
    {#if live}
      <IconSuccess
        aria-hidden="true"
        class="size-icon-md text-status-done-ink"
      />
    {:else}
      <IconLink aria-hidden="true" class="size-icon-md" />
    {/if}
  </span>
  <span
    class="mark-text pointer-events-none relative col-2 row-1 min-w-0 self-center overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong"
    data-slot="name"
    >{live ? `${tray.name} is live` : "Open CawCo by one word"}</span
  >
  <span
    class="mark-text pointer-events-none relative col-3 row-1 self-center type-meta num text-ink-muted"
    data-slot="wait">2 min</span
  >
  <span
    data-box
    class="mark-line pointer-events-none relative col-start-2 col-end-4 row-2 flex min-w-0 items-start gap-space-2 type-body wrap-anywhere text-ink-strong"
    data-slot="want"
  >
    {#if line.live}
      <span class="mark-cell"><LiveDot /></span>
    {/if}
    <span class="mark-text min-w-0">{line.text}</span>
  </span>
  <span
    class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted"
    data-slot="meta">Onboarding · {tray.facts.domain}</span
  >
</div>
