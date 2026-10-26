<script lang="ts">
  /**
   * Caw's lead switch, the project's own (fable-lead-switch.md §1): one
   * component wherever it stands, CawPanel (⋯ › Caw settings…) and the
   * head's details tray (ProjectDetails), so its three ways off come with
   * it. Off, he acts only when you write to him: no event wakes him
   * (Caw on and off).
   *
   * Turning him off (The Stay In Context Rule): nothing he started runs,
   * and it just flips. Only his own turn an event started is in flight: one
   * line under the switch asks whether it finishes or stops, a light choice
   * about one thing. Sessions he started still run: the stop tray
   * (StopTray, its Caw-off job in stop-work.svelte.ts) unfolds under the
   * switch and names each one first, as a forget does: "Let them finish",
   * or stop them and he is off. Put away part-way, the stops go on and are
   * said under the switch while it is drawn, then on the project's row
   * once his settings close (The Work Outlives Its Surface Rule).
   * What runs is read again as you flip, so the choice is about what is true
   * now. The hub's answer is the switch's state: a refusal leaves it where
   * the hub says Caw is, its words under it.
   */
  import type { CawInitiated, CawRunning } from "@cawco/core";
  import { onProjectStop } from "#lib/cawco/client.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import StopParked from "#lib/cawco/StopParked.svelte";
  import StopTray from "#lib/cawco/StopTray.svelte";
  import { cawOffAt, stopWork } from "#lib/cawco/stop-work.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    label = "Caw lead",
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /** The switch's words beside it. */
    label?: string;
  } = $props();

  const on = $derived(lead.on ?? false);

  let turnLine = $state<CawRunning | null>(null);
  /** The turn's stop was asked: the line waits for the hub's word that it stopped. */
  let cutting = $state(false);
  /** The switch's place: the Caw-off tray stands here when asked here. */
  const at = $derived(cawOffAt(projectId));
  /** What he started still runs: the tray's job, asked or parked. */
  const offJob = $derived(stopWork.of("caw-off", projectId));
  // His switch's place can hold his off tray while it is drawn (stop-work `reopen`).
  $effect(() => stopWork.place(at));
  // Turning him off by the tray: the hub's view of him once off is the switch's.
  $effect(() =>
    stopWork.onCawView(projectId, (view) => {
      lead.view = view;
    })
  );

  async function flip(next: boolean): Promise<void> {
    if (turnLine) {
      // The switch again while the line asks: nothing changes.
      turnLine = null;
      return;
    }
    if (offJob?.open && ["none", "list", "armed"].includes(offJob.phase)) {
      // The switch again while the tray asks: nothing changes.
      stopWork.dismiss(offJob);
      return;
    }
    if (next) {
      await lead.configure({ on: true });
      return;
    }
    await lead.read();
    const running = lead.view?.running ?? [];
    if (running.length === 0) {
      await lead.configure({ on: false });
    } else if (running.every((one) => one.kind === "turn")) {
      turnLine = running[0] ?? null;
    } else {
      stopWork.askCawOff({ id: projectId, name: projectName }, at, running);
    }
  }

  /** His own turn finishes or stops as he turns off; a stop's line stays until it has. */
  async function offWithTurn(initiated: CawInitiated): Promise<void> {
    const turn = turnLine;
    if (!turn) {
      return;
    }
    if (initiated === "finish") {
      await lead.configure({ on: false, initiated });
      turnLine = null;
      return;
    }
    cutting = true;
    const unhear = onProjectStop((frame) => {
      if (frame.instanceId === turn.id) {
        unhear();
        cutting = false;
        turnLine = null;
      }
    });
    await lead.configure({ on: false, initiated });
    if (lead.refused) {
      unhear();
      cutting = false;
    }
  }
</script>

<label data-slot="lead-switch" class="flex flex-wrap items-center gap-space-2">
  <Switch
    data-caw-lead-switch
    disabled={lead.moving || lead.on === null || cutting}
    bind:checked={() => on, (next) => flip(next)}
  />
  <span>{label}</span>
</label>
{#if turnLine}
  <div
    class="flex min-h-c-btn-h-sm flex-wrap items-center gap-space-2"
    data-caw-turn-line
    transition:unfold
  >
    <span class="type-meta min-w-0 shrink grow basis-full text-ink-muted"
      >{turnLine.title ?? "Answering an event"}. Off, it can finish or stop now.</span
    >
    <Button
      disabled={cutting || lead.moving}
      label="Let him finish"
      onclick={() => offWithTurn("finish")}
      size="sm"
      variant="outline"
    />
    <Button
      disabled={lead.moving}
      label="Stop now"
      onclick={() => offWithTurn("stop")}
      pending={cutting}
      pendingLabel="Stopping…"
      size="sm"
      variant="outline"
    />
  </div>
{/if}
{#if offJob}
  {#if offJob.at === at}
    <StopTray job={offJob} />
    <!-- Put away here, the stops are said here while his settings stand
         open; closed, on the project's row (ForgetProjectTray). -->
    <StopParked {at} job={offJob} />
  {/if}
{/if}
{#if lead.refused}
  <p data-slot="refused" class="type-meta text-error-11" role="alert">
    {lead.refused}
  </p>
{/if}
