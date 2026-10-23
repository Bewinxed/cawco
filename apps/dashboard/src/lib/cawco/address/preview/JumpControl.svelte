<script lang="ts">
  /**
   * The story's own control, outside the tray at the frame's edge: not part
   * of the design. It jumps the live tray to any state, on any network,
   * with any failure cause, and turns the two facts every state reads (a
   * taken name, a dashboard opened over plain http). A jumped state holds
   * still; the tray's own buttons move it on as the person would, and a
   * waiting state moves on by itself a few seconds later, as the hub would.
   * Where the advisor named a pose no file holds yet, it says which pose
   * stands in.
   */
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import {
    type AddressTray,
    CAUSES,
    type Cause,
    type Network,
    VIEWS,
    type ViewId,
    viewsOn,
  } from "../tray.svelte";

  let { tray }: { tray: AddressTray } = $props();

  const ids = $props.id();
  const valid = $derived(viewsOn(tray.network));
  const causes = $derived(
    CAUSES.filter((one) => one.on.includes(tray.network))
  );
</script>

<div
  class="grid gap-space-2 rounded-md border border-dashed border-border-control bg-surface-recess p-space-3"
  data-jump-control
>
  <p
    class="m-0 flex flex-wrap items-baseline justify-between gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
  >
    <span class="type-label text-ink-strong">Story control</span>
    <span class="wrap-anywhere"
      >Not part of the design. The tray's own buttons move it; waiting states
      move on by themselves.</span
    >
  </p>
  <div class="flex flex-wrap items-end gap-x-space-3 gap-y-space-2">
    <label
      class="grid min-w-0 gap-space-1 type-meta text-ink-muted"
      for="{ids}-state"
    >
      State
      <NativeSelect
        id="{ids}-state"
        data-jump="state"
        measure="shrink"
        onchange={(event: Event) =>
          tray.jump((event.currentTarget as HTMLSelectElement).value as ViewId)}
        value={tray.view}
      >
        {#each VIEWS as view (view.id)}
          <NativeSelectOption value={view.id}
            >{view.label}{valid.includes(view.id)
              ? ""
              : " ↷"}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </label>
    <label
      class="grid min-w-0 gap-space-1 type-meta text-ink-muted"
      for="{ids}-network"
    >
      Network
      <NativeSelect
        id="{ids}-network"
        data-jump="network"
        measure="shrink"
        onchange={(event: Event) =>
          tray.switchNetwork(
            (event.currentTarget as HTMLSelectElement).value as Network
          )}
        value={tray.network}
      >
        <NativeSelectOption value="tailscale">Tailscale</NativeSelectOption>
        <NativeSelectOption value="headscale">Headscale</NativeSelectOption>
        <NativeSelectOption value="netbird">NetBird</NativeSelectOption>
      </NativeSelect>
    </label>
    <label
      class="grid min-w-0 gap-space-1 type-meta text-ink-muted"
      for="{ids}-cause"
    >
      Failure cause
      <NativeSelect
        id="{ids}-cause"
        data-jump="cause"
        measure="shrink"
        onchange={(event: Event) =>
          tray.switchCause(
            (event.currentTarget as HTMLSelectElement).value as Cause
          )}
        value={tray.cause}
      >
        {#each causes as cause (cause.id)}
          <NativeSelectOption value={cause.id}>{cause.label}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </label>
    <label
      class="grid min-w-0 gap-space-1 type-meta text-ink-muted"
      for="{ids}-from"
    >
      Opened from
      <NativeSelect
        id="{ids}-from"
        data-jump="from"
        measure="shrink"
        onchange={(event: Event) => {
          tray.park();
          tray.source = (event.currentTarget as HTMLSelectElement).value as
            "needs" | "settings";
          if (tray.step === "unsupported") {
            tray.jump("found");
          }
        }}
        value={tray.source}
      >
        <NativeSelectOption value="needs">Needs you</NativeSelectOption>
        <NativeSelectOption value="settings"
          >Configure › Devices</NativeSelectOption
        >
      </NativeSelect>
    </label>
  </div>
  <div
    class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2 type-meta text-ink-strong"
  >
    <span class="flex items-center gap-space-2">
      <Checkbox
        bind:checked={tray.nameTaken}
        data-jump="taken"
        id="{ids}-taken"
      />
      <label for="{ids}-taken">cawco was taken</label>
    </span>
    <span class="flex items-center gap-space-2">
      <Checkbox
        checked={!tray.overHttps}
        data-jump="http"
        id="{ids}-http"
        onCheckedChange={(on: boolean) => {
          tray.overHttps = !on;
        }}
      />
      <label for="{ids}-http">Dashboard opened at plain http (no Copy)</label>
    </span>
    <span class="flex items-center gap-space-2">
      <Checkbox
        checked={!tray.seesPhone}
        data-jump="phone-unseen"
        id="{ids}-phone"
        onCheckedChange={(on: boolean) => {
          tray.seesPhone = !on;
          if (tray.step === "phone") {
            tray.jump("phone");
          }
        }}
      />
      <label for="{ids}-phone"
        >Hub can't see the phone's first visit (Done is a press)</label
      >
    </span>
    <button
      class="press-tint focus-inset rounded-xs type-meta text-link-ink hover:underline"
      data-jump="restart"
      onclick={() => tray.restart()}
      type="button">Start again from the row</button
    >
  </div>
  {#if tray.pose.toDraw}
    <p class="m-0 type-meta text-ink-muted" data-jump="pose">
      Caw here: <span class="text-ink-strong">{tray.pose.toDraw}</span>, pose to
      be drawn ({tray.pose.standIn} stands in).
    </p>
  {/if}
</div>
