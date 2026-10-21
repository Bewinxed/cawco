<script lang="ts">
  /**
   * Connect a machine's tray on the component canvas and the motion bench,
   * fed the add as the hub holds it (an `SshJoinJob`) instead of the live
   * stores. Every frame of the canvas shares one page, so the kit's modal
   * (portalled, fixed over the window) can't stand in one: this draws the
   * kit dialog's surface in place, the recess tray (18px radius, 6px
   * padding, overlay shadow) round the raised body (12px radius, 18px
   * padding) over the scrim on the desk, and the drawer's bottom sheet
   * (grabber, one header with Close, the content 16px in) on a phone, with
   * the dialog's own `morph()` tweening its height. JoinTray inside is the
   * dialog's own.
   *
   * `flight` (the done moment's third option) puts a machines list on the
   * page: once joined, the tray closes and the machine's row flies from the
   * card into the list (The One Object Rule's flight, --dur-panel on the
   * drawer curve).
   */
  import type { WaitingMachine } from "@cawco/core/hub-auth";
  import type { JoinAddress, SshJoinJob } from "@cawco/core/join";
  import { untrack } from "svelte";
  import IconClose from "#lib/components/icons/Close.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    dialogBodyVariants,
    dialogContentVariants,
    dialogTrayVariants,
  } from "#lib/components/ui/dialog/dialog-content.svelte";
  import { dialogTitleVariants } from "#lib/components/ui/dialog/dialog-title.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { cn } from "#lib/utils.js";
  import { CURVE, dur, motionOk } from "../../motion/curves.svelte";
  import { morph } from "../../motion/morph.svelte";
  import {
    cardOf,
    type Joined,
    type JoinTaste,
    stepsOf,
    TASTE,
  } from "../join-view";
  import type { JoinWay } from "../ways";
  import { doneJob, JOINED, runningAt, STEPS } from "./join-fixtures";

  /** How long the replay holds the service step before the join. */
  const REPLAY_RUNNING_MS = 1600;

  import JoinTray, { JOIN_DESCRIPTION } from "../JoinTray.svelte";

  let {
    layout = "desk",
    way = "ssh",
    job = null,
    refused = null,
    joined = null,
    stepElapsed = 0,
    passwordTried = false,
    taste = {},
    target = "",
    port = "",
    formAlert = null,
    retry = false,
    waiting = [],
    admitRefused = null,
    addresses = [],
    sshKey = null,
    hubHostname = "obelisk",
    replay = false,
    passwordOpen = false,
  }: {
    layout?: "desk" | "phone";
    way?: JoinWay;
    job?: SshJoinJob | null;
    refused?: string | null;
    joined?: Joined | null;
    /** How long the current step has run as the frame mounts, ms. */
    stepElapsed?: number;
    passwordTried?: boolean;
    taste?: Partial<JoinTaste>;
    target?: string;
    port?: string;
    formAlert?: { text: string; tone: "fail" | "status" } | null;
    retry?: boolean;
    waiting?: WaitingMachine[];
    admitRefused?: string | null;
    addresses?: JoinAddress[];
    sshKey?: string | null;
    hubHostname?: string | null;
    /**
     * Plays the join by itself as it mounts: the service step, then the add
     * done, so a frame shows the moment wherever it is drawn (a decision
     * page's Preview included), then rests on it.
     */
    replay?: boolean;
    /** "Sign in with a password" stands open. */
    passwordOpen?: boolean;
  } = $props();

  /** Whether the replay has reached the join; it plays once per mount, then rests on it. */
  let playedDone = $state(false);
  $effect(() => {
    if (!replay || playedDone) {
      return;
    }
    const timer = setTimeout(() => {
      playedDone = true;
    }, REPLAY_RUNNING_MS);
    return () => clearTimeout(timer);
  });
  const shownJob = $derived.by(() => {
    if (!replay) {
      return job;
    }
    return playedDone ? doneJob() : runningAt(STEPS.length);
  });
  const shownJoined = $derived.by(() => {
    if (!replay) {
      return joined;
    }
    return playedDone ? JOINED : null;
  });

  const phone = $derived(layout === "phone");
  const picks = $derived({ ...TASTE, ...taste });
  let shownWay = $state(untrack(() => way));
  $effect.pre(() => {
    shownWay = way;
  });
  let typedTarget = $state(untrack(() => target));
  let typedPort = $state(untrack(() => port));
  let typedPassword = $state("");
  let hubUrl = $state(untrack(() => addresses[0]?.url ?? ""));

  /** When the step on screen began: the story's elapsed time, then each new step's own. */
  let stepSince = $state(untrack(() => Date.now() - stepElapsed));
  let stepCount = untrack(() =>
    shownJob ? stepsOf(shownJob.lines).length : 0
  );
  $effect.pre(() => {
    const count = shownJob ? stepsOf(shownJob.lines).length : 0;
    if (count !== stepCount) {
      stepCount = count;
      stepSince = Date.now();
    }
  });

  const card = $derived(
    cardOf({
      job: shownJob,
      refused,
      stepSince,
      joined: shownJoined,
      passwordTried,
    })
  );

  const resize = morph();
  const surface = dialogTrayVariants();
  const body = dialogBodyVariants({ closed: true });
  const head = sheetHeadVariants();

  /** The flight: once the join is seen, the tray closes and its row flies into the list. */
  let flown = $state(false);
  let flying = $state(false);
  let wasRunning = untrack(() => shownJob?.state === "running");
  let source = $state<HTMLElement | null>(null);
  let slot = $state<HTMLElement | null>(null);
  $effect(() => {
    const isDone = card?.tone === "done";
    if (!isDone) {
      wasRunning = card?.tone === "running";
      flown = false;
      return;
    }
    if (!(wasRunning && picks.done === "flight")) {
      return;
    }
    wasRunning = false;
    const wait = setTimeout(
      () => {
        flying = true;
        flown = true;
      },
      dur("--dur-pop") * 2
    );
    return () => clearTimeout(wait);
  });
  $effect(() => {
    const from = source;
    const to = slot;
    if (!(flying && from && to)) {
      return;
    }
    const start = from.getBoundingClientRect();
    const end = to.getBoundingClientRect();
    const run = to.animate(
      motionOk.current
        ? [
            {
              transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)`,
            },
            { transform: "none" },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: dur("--dur-panel"), easing: CURVE.drawer, fill: "backwards" }
    );
    run.finished.then(
      () => {
        flying = false;
      },
      () => undefined
    );
    return () => run.cancel();
  });

  const doneName = $derived(
    shownJoined?.sentence.split(" ")[0] ?? "the machine"
  );
</script>

{#snippet tray()}
  <JoinTray
    {addresses}
    arrival={shownJob?.id ?? null}
    {card}
    {formAlert}
    {hubHostname}
    passwordFirstOpen={passwordOpen}
    onway={(next) => {
      shownWay = next;
    }}
    {phone}
    {retry}
    {sshKey}
    taste={picks}
    {waiting}
    {admitRefused}
    way={shownWay}
    bind:target={typedTarget}
    bind:port={typedPort}
    bind:password={typedPassword}
    bind:hubUrl
  />
{/snippet}

<div
  data-slot="join-frame"
  data-layout={layout}
  class="relative flex min-h-full min-w-0 flex-col bg-surface-recess"
>
  <div
    class="flex min-w-0 flex-auto flex-col items-center gap-space-6 bg-scrim data-[layout=phone]:justify-end"
    data-layout={layout}
    data-flight={picks.done === "flight" || undefined}
    class:p-space-6={!phone}
    class:pt-space-6={phone}
  >
    {#if picks.done === "flight"}
      <!-- Where the machine goes: the machines list, on screen. -->
      <section
        aria-label="Machines"
        class={cn(
          "w-full rounded-lg bg-surface-raised p-space-3 shadow-tile",
          dialogContentVariants({ width: "form" })
        )}
        class:mx-space-4={phone}
      >
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          <li class="flex min-w-0 items-center gap-space-3">
            <MachineRow
              hue={machineHue(0, true)}
              icon={machineIcon("linux-x64")}
              meta="Linux · 2 sessions"
              name="obelisk"
              presence="online"
            />
          </li>
          <li class="flex min-w-0 items-center gap-space-3">
            <MachineRow
              hue={machineHue(1, true)}
              icon={machineIcon("darwin-arm64")}
              meta="macOS · idle"
              name="Omars-MacBook-Pro"
              presence="online"
            />
          </li>
          {#if flown}
            <li
              class="flex min-w-0 items-center gap-space-3"
              data-slot="flown"
              bind:this={slot}
            >
              <MachineRow
                hue={machineHue(2, true)}
                icon={machineIcon("linux-x64")}
                meta="Linux · idle"
                name={doneName}
                presence="online"
              />
            </li>
          {/if}
        </ul>
      </section>
    {/if}

    <!-- The kit dialog's own surface (dialog-content.svelte), drawn in
         place: its tray and body by the frame's width, the recess tray past
         the phone line and the flush sheet under it. -->
    <div
      data-slot="join-surface"
      data-closed={flown || undefined}
      class={cn(
        surface.tray(),
        dialogContentVariants({ width: "form" }),
        "static min-w-0 phone:translate-x-0 phone:translate-y-0 transition-[opacity,scale] duration-(--dur-exit) ease-out data-closed:pointer-events-none data-closed:scale-(--leave-scale) data-closed:opacity-0"
      )}
      bind:this={source}
    >
      <div class={cn(surface.body(), body.frame())} {@attach resize}>
        {#if phone}
          <div aria-hidden="true" class={grabberVariants()}></div>
          <!-- mark-line: the kit sheet head's own row (sheet-head.ts), its Close a box at the trailing edge -->
          <div class={head.head()} data-slot="drawer-header">
            <h2 class="m-0 {head.title()}">Connect a machine</h2>
            <button
              aria-label="Close"
              class={head.close()}
              title="Close"
              type="button"><IconClose aria-hidden="true" /></button
            >
          </div>
          <div class="flex min-w-0 flex-col gap-space-6 pt-space-4">
            {#if card === null}
              <p class="m-0 type-body text-ink-muted">{JOIN_DESCRIPTION}</p>
            {/if}
            {@render tray()}
          </div>
        {:else}
          <div class={body.grid()}>
            <Dialog.Header>
              <h2 class="m-0 {dialogTitleVariants()}">Connect a machine</h2>
              {#if card === null}
                <p class="m-0 text-label text-ink-muted">{JOIN_DESCRIPTION}</p>
              {/if}
            </Dialog.Header>
            {@render tray()}
          </div>
          <!-- The kit's Close, where the dialog stands it (dialog-content.svelte `close`). -->
          <span class={surface.close()}>
            <Button size="icon-sm" variant="ghost">
              <IconClose />
              <span class="sr-only">Close</span>
            </Button>
          </span>
        {/if}
      </div>
    </div>
  </div>
</div>
