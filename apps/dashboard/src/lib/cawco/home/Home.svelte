<script lang="ts">
  /**
   * The home: a status line, and the sessions in the one Recent list
   * (RecentList). What needs the operator, and every notice, is Caw's
   * panel's (NeedsCaw); a session waiting on them keeps its place in Recent
   * too, with its mark. The same list is the phone's home page (`page`) and
   * the wide screen's sidebar (`rail`), where the transcripts take the rest
   * of the screen. Fleet on a desk (`wide`) is the hub and the machines
   * alone: the sidebar beside it already lists the sessions.
   *
   * What it never does: claim the fleet is empty while the hub is not live.
   * Then the rows stay as last known and greyed, there is no Caw, and the
   * status line says the hub is gone.
   *
   * A fleet with no project yet is a first run: the phone's home page is the
   * first-run row (FirstRunHere), the steps to a first project, in place of
   * the machines guide and Caw's lone line, and the rail keeps no Caw of its
   * own beside the desk's row.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { page } from "$app/state";
  import MachinesEmpty from "../MachinesEmpty.svelte";
  import MachinesList from "../MachinesList.svelte";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { newSession } from "../spawn/new-session.svelte";
  import UsageMeter from "../UsageMeter.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import Caw from "./Caw.svelte";
  import FirstRunHere from "./FirstRunHere.svelte";
  import { firstRunSteps } from "./first-run.svelte";
  import { home } from "./home-state.svelte";
  import RecentList from "./RecentList.svelte";
  import StatusLine from "./StatusLine.svelte";

  let {
    variant,
    wide = false,
    active,
  }: {
    /** `page` is the phone's home; `rail` is the wide screen's sidebar. */
    variant: "page" | "rail";
    /**
     * Fleet on a desk, beside the rail (SessionSurface): the hub and the
     * machines, each machine with its harnesses and its limits, at the
     * reading measure. No session list: the sidebar holds it.
     */
    wide?: boolean;
    /** The conversation in front, for its Recent row's pill; the page reads it itself. */
    active?: string | null;
  } = $props();

  /** The conversation in front: the rail's own answer, else the page's. */
  const current = $derived.by(() => {
    if (active !== undefined) {
      return active;
    }
    return page.url.pathname.startsWith("/session")
      ? workspace.activeSessionId
      : null;
  }); /**
   * Nothing anywhere yet: the one empty state the home keeps. Asked of the
   * home's `empty`, never of Recent: this home is in the rail on every page,
   * and reading the list here built it — every stored transcript on every
   * machine, mapped and sorted — on every turn that ended anywhere.
   */
  /**
   * No machine registered, or none online: then the board's place guides
   * the reader to one (MachinesEmpty), on the phone's page here and on a
   * wide screen in the detail area (SessionSurface), and Caw's first-run
   * line does not stand in for it.
   */
  const machineless = $derived(
    home.machines === "none" || home.machines === "offline"
  );
  /** A first run: the first-run row stands (FirstRunHere), and no guide or Caw here beside it. */
  const firstRunning = $derived(firstRunSteps() !== null);
  /** The fleet state the page shows, from the moment it is wanted until it has gone. */
  let machinesThere = $state<"none" | "offline" | null>(null);
  const firstRun = $derived(
    !firstRunning &&
      home.ready &&
      home.live &&
      !machineless &&
      machinesThere === null &&
      home.needs.length === 0 &&
      home.empty
  );
  /** Caw is on the page: from a first run until he has faded out. */
  let cawThere = $state(false);
  $effect(() => {
    if (firstRun) {
      cawThere = true;
    }
  });
  /** One Caw at a time: the guide comes once the first-run Caw has gone. */
  const machinesShown = $derived(
    variant === "page" &&
      home.ready &&
      machineless &&
      !cawThere &&
      !firstRunning
  );
  $effect(() => {
    const fleet = home.machines;
    if (machinesShown && (fleet === "none" || fleet === "offline")) {
      machinesThere = fleet;
    }
  });
  /** No machine at all: the page is the guide alone, with nothing to list or start. */
  const noFleet = $derived(machinesThere === "none");
  /**
   * In the rail, the block over the groups with nothing in it: the status
   * line says only that the first read is coming (the hub's connection is
   * the band's, HubBand), so it is silent otherwise. It takes no room then,
   * not its padding either.
   */
  const bare = $derived(variant === "rail" && home.status !== "reading");
  /**
   * What Caw's line says. "No sessions" is a claim, so it waits on the data:
   * while any machine has not answered, the line names who it is waiting
   * for (§8: a cross-fade cannot hide a wrong state).
   */
  const cawLine = $derived.by(() => {
    const [first, ...rest] = home.waitingOn;
    if (first) {
      return rest.length > 0
        ? `Waiting for ${rest.length + 1} machines to answer.`
        : `Waiting for ${machineLabel(first.hostname)} to answer.`;
    }
    return "Your sessions will land here.";
  });
</script>

<!-- Every state change here travels (motion/rows `reflow`): a row arriving
     opens its place while what follows slides down, one leaving (Done)
     closes, and Caw comes and goes by his own clips. With less motion, only
     the fades run. In the rail the home is one box of the rail's own
     reflow, so what is under it slides as it grows. -->
<!-- In the rail it is one block of the rail's own scroller, at its full
     height: the rail scrolls, the home does not shrink into it. -->
<section
  aria-label="Home"
  class={[
    "flex min-h-0 min-w-0 flex-col",
    variant === "page" && "flex-auto overflow-y-auto bg-surface-recess",
    variant === "rail" && "flex-none",
  ]}
  data-home-variant={variant}
  data-flip={variant === "rail" ? "box" : undefined}
  data-regroup-root={variant === "page" || undefined}
  {@attach reflow({ on: ["data-bare"] })}
>
  <!-- Bare, nothing in it: in the rail, live and read with nothing needing
       the reader; on the page, the empty fleet, whose block stands where New
       project's ask does. -->
  <div
    data-slot="top"
    class={[
      "flex flex-col gap-space-2 data-bare:p-0",
      variant === "page" && "px-space-5 pt-space-5 pb-space-3",
      wide && "w-full max-w-c-measure",
      variant === "rail" && "px-space-3 pt-space-2 pb-space-1",
    ]}
    data-bare={bare || machinesThere !== null || undefined}
  >
    <!-- The line every other line on this screen is believed by; live and
         read, it says nothing and takes no room. -->
    <StatusLine />
    {#if variant === "page" && home.limitsShown}
      <!-- The phone has no rail: the rail's usage strip stands here (owner
           pick i), on the home's own ground, while a machine is online
           (home `limitsShown`). Fleet on a desk shows the limits too: the
           hub and the machines are what it is for. -->
      <!-- The strip's card lines up with the status line's text. -->
      <div class="-mx-space-2">
        <UsageMeter variant="home" />
      </div>
    {/if}
  </div>

  <div
    class={[
      "flex flex-col",
      variant === "page" && "gap-space-5 px-space-5 pt-space-2 pb-space-7",
      wide && "w-full max-w-c-measure",
      variant === "rail" && "gap-space-3 px-space-2 pt-space-1 empty:p-0",
    ]}
  >
    {#if wide && !noFleet && !machineless}
      <!-- Fleet on a desk: each machine, its harnesses and its state (its
           menu on right-click), then Add machine. -->
      <section
        aria-label="Machines"
        class="flex flex-col gap-space-2"
        data-flip
      >
        <h2 class="m-0 px-space-2 type-label text-ink-strong">Machines</h2>
        <MachinesList />
      </section>
    {/if}

    {#if machinesThere}
      <!-- Anchored as New project's ask is (its page pads --space-7 on a
           phone): the groups' own top padding and this margin make that. -->
      <div data-slot="machines" class="mx-0 mt-space-5 mb-space-6" data-flip>
        <MachinesEmpty
          fleet={machinesThere}
          ongone={() => {
            machinesThere = null;
          }}
          present={machinesShown}
        />
      </div>
    {/if}

    {#if cawThere}
      <!-- Caw only on a fleet with nothing in it yet, or while a machine
           has not answered: the one empty state then. Nothing is going on,
           so he sleeps; while a machine is awaited he is awake. With sessions
           somewhere, Recent says what it holds itself. He comes in
           by his enter, or by a fade where his status has none, and fades
           out, keeping his place until he has gone. -->
      <figure
        class="mx-0 my-space-4 flex flex-col items-center gap-space-2"
        data-flip
      >
        <Caw
          next={["ready", "sleeping"]}
          ongone={() => {
            cawThere = false;
          }}
          present={firstRun}
          size={variant === "rail" ? 112 : 160}
          status={home.waitingOn.length > 0 ? "ready" : "sleeping"}
        />
        <!-- The line's states share one cell and cross-fade (§8). -->
        <figcaption class="relative type-body text-center text-ink-muted">
          {#if firstRun}
            {#key cawLine}
              <span in:crossIn out:crossOut>{cawLine}</span>
            {/key}
          {/if}
        </figcaption>
      </figure>
    {/if}

    {#if variant === "page" && firstRunning}
      <div data-slot="first-run" class="mx-0 mt-space-5 mb-space-6" data-flip>
        <FirstRunHere />
      </div>
    {/if}
  </div>

  {#if !(wide || noFleet)}
    <!-- The one Recent list: the rail's section, or the phone's page of it. -->
    <div class={[variant === "page" && "px-space-3 pb-space-7"]}>
      <RecentList active={current} {variant} />
    </div>
  {/if}

  {#if variant === "page" && !wide && !noFleet && !machineless}
    <!-- The phone's thumb reaches the bottom; Start session lives there,
         while a machine is online to start one on. -->
    <div
      data-slot="dock"
      class="sticky bottom-0 mt-auto bg-(image:--dock-fade) px-space-5 pt-space-3 pb-(--dock-foot)"
      data-safe-bottom
      style:--dock-fade={"linear-gradient(transparent, var(--surface-recess) var(--space-4))"}
      style:--dock-foot="calc(var(--space-3) + var(--safe-bottom))"
    >
      <Button
        class="w-full"
        onclick={(event: MouseEvent) =>
          newSession(undefined, event.currentTarget as HTMLElement)}
        size="lg"
      >
        <IconPlus />
        <span>Start session</span>
      </Button>
    </div>
  {/if}
</section>
