<script lang="ts" module>
  import { cawOffAt, stopWork } from "#lib/cawco/stop-work.svelte.js";
  import type { CawLead } from "./caw-lead.svelte";

  /** What the switch reads and asks of the page's Caw. */
  export type SwitchedLead = Pick<
    CawLead,
    "configure" | "moving" | "on" | "read" | "refused" | "view"
  >;

  /**
   * Caw on or off, as his switch asks it: on just flips; off with what he
   * started still running asks first, the Caw-off confirm growing out of
   * the switch, every row checked; asked again while that confirm asks,
   * nothing changes and the confirm goes.
   */
  export async function flipCaw(
    lead: SwitchedLead,
    project: { id: string; name: string },
    next: boolean
  ): Promise<void> {
    const offJob = stopWork.of("caw-off", project.id);
    if (offJob?.open && ["none", "list", "armed"].includes(offJob.phase)) {
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
    } else {
      stopWork.askCawOff(project, cawOffAt(project.id), running);
    }
  }
</script>

<script lang="ts">
  import { cawOffWords } from "@cawco/core/words/caw-off";
  import { untrack } from "svelte";
  /**
   * Whether the project's events reach a conversation, the project's own
   * switch (fable-lead-switch.md §1): one component wherever it stands,
   * CawPanel (⋯ › Caw settings…) and a member's setup (MemberSetup), so its
   * ways off come with it. Off, no event starts or reaches a conversation.
   *
   * Turning it off (The Stay In Context Rule): nothing the project's
   * conversation started runs, and it just flips. Sessions it started still
   * run: the confirm grows out of the switch in the house's anchored
   * popover (CawOffTray, its Caw-off job in stop-work.svelte.ts) listing
   * each one, every row checked; you uncheck what should keep running, and
   * one confirm stops the checked ones and turns him off, the popover
   * closing as it is pressed. The stops go on, said under the switch while
   * it is drawn, then on the project's row once his settings close (The
   * Work Outlives Its Surface Rule).
   * What runs is read again as you flip, so the choice is about what is true
   * now. The hub's answer is the switch's state: a refusal leaves it where
   * the hub says Caw is, its words under it.
   */
  import CawOffTray from "#lib/cawco/CawOffTray.svelte";
  import StopParked from "#lib/cawco/StopParked.svelte";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import { BarCard } from "#lib/components/ui/bar-glass/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";

  let {
    lead,
    projectId,
    projectName,
    label = "Events reach a conversation",
    part = "all",
    disabled = false,
    hang = false,
  }: {
    lead: SwitchedLead;
    projectId: string;
    projectName: string;
    /** The switch's words beside it. */
    label?: string;
    /**
     * Which of it this place draws: all of it, or the switch (with the
     * confirm it grows) alone and, in another place, what it says after
     * it (the stops parked there, a refusal): a switch standing on a
     * picture, its words under the picture (Caw's settings' hero).
     */
    part?: "all" | "switch" | "after";
    /** No change can be asked now (the hub is away): the switch is sunk. */
    disabled?: boolean;
    /**
     * It stands in a bar's glass (BarGlass): its confirm is a card hung
     * from that glass as one shape with it (BarCard), coming down out of
     * the capsule and going back up into it, rather than a popover beside.
     */
    hang?: boolean;
  } = $props();

  const on = $derived(lead.on ?? false);
  /** The switch, which the confirm grows out of. */
  let anchor = $state<HTMLElement | null>(null);

  /** The switch's place: the Caw-off tray stands here when asked here. */
  const at = $derived(cawOffAt(projectId));
  /** What he started still runs: the tray's job, asked or parked. */
  const offJob = $derived(stopWork.of("caw-off", projectId));
  /** The tray stands open here: asked, or reopened from where it parked. */
  const standing = $derived(offJob?.open === true && offJob.at === at);
  /** The confirm stands asked here: open, not yet pressed. */
  const asking = $derived(
    offJob?.open === true &&
      offJob.at === at &&
      ["none", "list", "armed"].includes(offJob.phase)
  );
  // His switch's place can hold his off tray while it is drawn (stop-work `reopen`).
  $effect(() => stopWork.place(at));
  // The confirm pressed: the popover closes and the stops go on parked
  // under the switch, where they are said as they land. Only on the press:
  // a tray reopened from there stands in the popover until put away.
  let wasAsking = false;
  $effect(() => {
    const job = offJob;
    const now = asking;
    const pressed = wasAsking && !now && job?.open === true && job.at === at;
    wasAsking = now;
    if (pressed && job && ["stopping", "ending"].includes(job.phase)) {
      untrack(() => stopWork.dismiss(job));
    }
  });
  // Turning him off by the tray: the hub's view of him once off is the switch's.
  $effect(() =>
    stopWork.onCawView(projectId, (view) => {
      lead.view = view;
    })
  );
</script>

{#if part !== "after"}
  <label
    data-slot="lead-switch"
    class={[
      "flex items-center gap-space-2",
      hang ? "whitespace-nowrap" : "flex-wrap",
    ]}
    bind:this={anchor}
  >
    <Switch
      data-caw-lead-switch
      disabled={disabled || lead.moving || lead.on === null}
      bind:checked={
        () => on,
        (next) => flipCaw(lead, { id: projectId, name: projectName }, next)
      }
    />
    <span>{label}</span>
  </label>
  {#if offJob && hang}
    <!-- The confirm comes down out of the glass the switch stands in, one
         shape with it (BarCard, the house's card from a glass), and goes
         back up into it: Cancel, Escape or a press outside drops the ask
         and he stays on; the confirm closes it, the stops going on parked
         under the switch. -->
    <Popover.Root
      onOpenChange={(next) => {
        if (!next && offJob) {
          stopWork.dismiss(offJob);
        }
      }}
      open={standing}
    >
      <BarCard
        class="w-c-panel-w"
        frame="settings"
        label={cawOffWords.ask(projectName)}
      >
        <!-- The card's own inset: the settings frame draws none. -->
        <div class="p-c-floating-pad">
          <CawOffTray job={offJob} look="card" />
        </div>
      </BarCard>
    </Popover.Root>
  {:else if offJob && anchor}
    <!-- Outside a glass, the confirm grows out of the switch in the house's
         anchored popover (NsPopover), closing the same ways. -->
    <NsPopover
      {anchor}
      id={`caw-off-${projectId}`}
      label={cawOffWords.ask(projectName)}
      onchange={(next) => {
        if (!next && offJob) {
          stopWork.dismiss(offJob);
        }
      }}
      open={standing}
      width={400}
    >
      <CawOffTray job={offJob} look="card" />
    </NsPopover>
  {/if}
{/if}
{#if part !== "switch"}
  {#if offJob && offJob.at === at}
    <!-- Put away here, the stops are said here while his settings stand
         open; closed, on the project's row (ProjectEndTray). -->
    <StopParked {at} job={offJob} />
  {/if}
  {#if lead.refused}
    <p data-slot="refused" class="type-meta text-error-11" role="alert">
      {lead.refused}
    </p>
  {/if}
{/if}
