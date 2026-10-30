<script lang="ts">
  /**
   * DESIGN DRAWING, not wired: Caw's settings as the project head's `⋯ ›
   * Caw settings…` opens them (CawPanel in its popover on a desk, its sheet
   * on a phone), with the pick-step tray (StopTrayPick) under the switch.
   * It plays the flow without a hub: the switch asks, Cancel leaves Caw on,
   * the confirm stops the checked rows one machine at a time, and the tray
   * folds away once he is off. With nothing running the switch just flips.
   */
  import { untrack } from "svelte";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { cn } from "#lib/utils.js";
  import CawFace from "../home/CawFace.svelte";
  import StopTrayPick, {
    type PickRow,
    type PickStep,
    type PickStop,
  } from "../StopTrayPick.svelte";

  let {
    projectName = "cockpit",
    rows,
    on: onArg = true,
    open: openArg = true,
    step: stepArg = "pick",
    unchecked = [],
    stops: stopsArg = {},
    refusal = null,
  }: {
    projectName?: string;
    /** What Caw started that still runs (hub caw.ts `initiated`). */
    rows: PickRow[];
    /** Caw is on: the switch's state. */
    on?: boolean;
    /** The tray stands under the switch. */
    open?: boolean;
    step?: PickStep;
    /** The rows the person unchecked; every other row stops. */
    unchecked?: string[];
    stops?: Record<string, PickStop>;
    refusal?: string | null;
  } = $props();

  // The story's args set where it starts; the presses move it from there.
  let on = $state(untrack(() => onArg));
  let open = $state(untrack(() => openArg));
  let step = $state<PickStep>(untrack(() => stepArg));
  let checked = $state<string[]>([]);
  let stops = $state<Record<string, PickStop>>({});
  $effect(() => {
    on = onArg;
    open = openArg;
    step = stepArg;
    const off = new Set(unchecked);
    checked = rows.filter((row) => !off.has(row.id)).map((row) => row.id);
    stops = { ...stopsArg };
  });

  /** The landings still to come; the frame going clears them. */
  let pendingTimers: ReturnType<typeof setTimeout>[] = [];
  const after = (ms: number, run: () => void) => {
    pendingTimers.push(setTimeout(run, ms));
  };
  $effect(() => () => pendingTimers.forEach(clearTimeout));

  function flip(next: boolean): void {
    if (next) {
      on = true;
      return;
    }
    if (rows.length === 0) {
      on = false;
      return;
    }
    pendingTimers.forEach(clearTimeout);
    pendingTimers = [];
    step = "pick";
    checked = rows.map((row) => row.id);
    stops = {};
    open = true;
  }

  /** One machine confirms at a time; an away machine's stop is recorded. */
  function confirm(): void {
    const chosen = rows.filter((row) => checked.includes(row.id));
    if (chosen.length === 0) {
      on = false;
      open = false;
      return;
    }
    step = "stopping";
    stops = Object.fromEntries(
      chosen.map((row) => [row.id, row.offline ? "away" : "stopping"])
    );
    on = false;
    const landing = chosen.filter((row) => !row.offline).reverse();
    landing.forEach((row, index) => {
      after(700 * (index + 1), () => {
        stops = { ...stops, [row.id]: "stopped" };
      });
    });
    after(700 * (landing.length + 1), () => {
      step = "off";
    });
    after(700 * (landing.length + 1) + 1600, () => {
      open = false;
    });
  }

  const sentence = $derived(
    on
      ? `Caw answers ${projectName}'s events.`
      : `Caw is off. ${projectName}'s events reach no conversation.`
  );
</script>

<div class="flex justify-end p-space-3 max-phone:p-0">
  <div
    data-slot="host"
    class={cn(
      floatingSurface({ motion: "hang" }),
      "h-fit w-c-panel-w max-w-full max-phone:w-full max-phone:rounded-b-none max-phone:border-x-0 max-phone:border-b-0 max-phone:pb-space-5"
    )}
  >
    <p
      class="m-0 hidden pt-space-1 pb-space-3 text-center type-label font-medium text-ink-strong max-phone:block"
    >
      Caw, {projectName}
    </p>
    <div
      data-slot="caw-panel"
      class="type-label flex flex-col gap-space-2 px-space-1 pt-space-1 pb-space-1 text-ink-strong"
    >
      <div class="mark-line flex flex-wrap items-center gap-space-2">
        <CawFace size={18} status={on ? "ready" : "sleeping"} />
        <span class="min-w-0">{sentence}</span>
      </div>
      <label class="flex flex-wrap items-center gap-space-2">
        <Switch bind:checked={() => on, (next) => flip(next)} />
        <span>Events reach a conversation</span>
      </label>
      {#if open && rows.length > 0}
        <StopTrayPick
          bind:checked
          oncancel={() => {
            open = false;
          }}
          onconfirm={confirm}
          {projectName}
          {refusal}
          {rows}
          {step}
          {stops}
        />
      {/if}
    </div>
  </div>
</div>
