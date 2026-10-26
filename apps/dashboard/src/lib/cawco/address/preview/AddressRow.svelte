<script lang="ts">
  import { IconLink, IconSuccess } from "#lib/icons.js";
  /**
   * The address's onboarding row in Needs you, in NeedsCard's own recipe
   * (its mark column, the title and its wait, what it wants, the kind and
   * where), the way the tailnet row stands today. Its want line is where
   * the set-up stands while the tray is closed ("Waiting for your sign-in…",
   * with the live dot), so the work it parked is seen here. The whole row
   * opens the tray where the set-up stands; once the address is live it
   * says so by the machine's `name`. Its caller says where the work stands
   * (the kept tray's `rowLine`, the flow's own), so either drawing stands it.
   */
  import RowLine from "../RowLine.svelte";

  let {
    name,
    domain,
    line,
    done = false,
    ref = $bindable(null),
    onopen,
  }: {
    /** The machine the address names, once it is live. */
    name: string;
    /** The network's domain, where it stands: "heron-pike.ts.net". */
    domain: string;
    /** Where the work stands, and whether it waits on something live. */
    line: { text: string; live: boolean };
    /** The address is live: the row's mark ticks. */
    done?: boolean;
    ref?: HTMLElement | null;
    onopen: () => void;
  } = $props();

  const title = $derived(done ? `${name} is live` : "Open CawCo by one word");
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
    aria-label="Open {title}"
    class="press-tint focus-inset absolute inset-0 rounded-inherit hover:bg-surface-hover"
    data-slot="cover"
    onclick={onopen}
    type="button"
  ></button>
  <span
    data-box
    class="pointer-events-none relative col-1 row-1 grid h-c-row-mark w-c-row-lead place-items-center self-center text-ink-muted"
    data-slot="lead"
  >
    {#if done}
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
    data-slot="name">{title}</span
  >
  <span
    class="mark-text pointer-events-none relative col-3 row-1 self-center type-meta num text-ink-muted"
    data-slot="wait">2 min</span
  >
  <RowLine
    data-box
    class="pointer-events-none relative col-start-2 col-end-4 row-2 type-body text-ink-strong"
    data-slot="want"
    {line}
  />
  <span
    class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted"
    data-slot="meta">Onboarding · {domain}</span
  >
</div>
