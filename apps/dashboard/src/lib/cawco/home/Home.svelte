<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * The home: a status line, a headline, and the sessions grouped by what
   * they want from the operator — Needs you, then Working and Finished as
   * two tabs, then (on the phone) Recent. The same list is the phone's home
   * page (`page`) and the wide screen's sidebar (`rail`), where the
   * transcripts take the rest of the screen and Recent sits under Projects.
   *
   * What it never does: claim nothing needs you while the hub is not live.
   * Then the rows stay as last known and greyed, there is no headline and
   * no Caw, and the status line says the hub is gone.
   */
  import { untrack } from "svelte";
  import { TextMorph } from "torph/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus } from "#lib/icons.js";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import { movedLogins } from "../accounts/model.svelte";
  import { cawco } from "../client.svelte";
  import MachinesEmpty from "../MachinesEmpty.svelte";
  import { crossIn, crossOut, morphMs } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { notices } from "../notices.svelte";
  import { newerBuild } from "../served-build.svelte";
  import { newSession } from "../spawn/new-session.svelte";
  import UsageMeter from "../UsageMeter.svelte";
  import { reloadId, unseenLandings, updatedNotice } from "../updates/model";
  import { reloadAcknowledging } from "../updates/update-notice.svelte";
  import { updates } from "../updates/updates.svelte";
  import Caw from "./Caw.svelte";
  import HomeRecent from "./HomeRecent.svelte";
  import { home } from "./home-state.svelte";
  import MovedLogins from "./MovedLogins.svelte";
  import NeedsCard from "./NeedsCard.svelte";
  import StatusLine from "./StatusLine.svelte";
  import UpdateCard from "./UpdateCard.svelte";
  import WorkTabs from "./WorkTabs.svelte";

  let {
    variant,
    markedElsewhere,
  }: {
    /** `page` is the phone's home; `rail` is the wide screen's sidebar. */
    variant: "page" | "rail";
    /** In the rail: the open conversation's row is the project tree's to mark. */
    markedElsewhere?: (id: string) => boolean;
  } = $props();

  const stale = $derived(!home.live);
  /** Logins moved into CawCo that nobody has dismissed yet. */
  const moved = $derived(notices.known ? movedLogins(notices.seen) : []);
  /** The landing nobody has acknowledged, until it is dismissed. */
  const updated = $derived(
    variant === "page" && notices.known
      ? updatedNotice(unseenLandings(cawco.machines, notices.seen))
      : null
  );
  /**
   * Reload was chosen, or the tab is reloading by itself (idle) while the
   * card is up: the card says its goodbye until the tab goes, also once
   * acknowledging has dropped the landing from `updated`.
   */
  let reloading = $state(false);
  $effect(() => {
    if (updates.goodbye && updated !== null) {
      reloading = true;
    }
  });
  const card = $derived(updated !== null || reloading);
  // While the card is on screen it is the landing's one surface: the toast stands aside.
  $effect(() => {
    if (!card) {
      return;
    }
    // Untracked: the count is written here, never followed.
    untrack(() => {
      updates.cards += 1;
    });
    return () => {
      untrack(() => {
        updates.cards -= 1;
      });
    };
  });
  function dismissUpdate(): void {
    // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
    void notices.acknowledge(updated?.acks ?? []);
  }
  function reloadForUpdate(): void {
    if (reloading) {
      return;
    }
    reloading = true;
    const build = newerBuild();
    // biome-ignore lint/complexity/noVoid: the tab goes once the acknowledgement is in
    void reloadAcknowledging([
      ...(updated?.acks ?? []),
      ...(build ? [reloadId(build)] : []),
    ]);
  }
  /**
   * The tabs are changing their rows and driving the list's height
   * themselves (WorkTabs `relaying`): the home is not the rail's reflow's
   * box to move until they are done.
   */
  let relaying = $state(false);
  /**
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
  /** The fleet state the page shows, from the moment it is wanted until it has gone. */
  let machinesThere = $state<"none" | "offline" | null>(null);
  const firstRun = $derived(
    home.ready &&
      home.live &&
      !machineless &&
      machinesThere === null &&
      home.needs.length + home.working.length + home.finished.length === 0 &&
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
    variant === "page" && home.ready && machineless && !cawThere
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
   * In the rail, the block over the groups with nothing in it: the hub is
   * live and read (no status line) and nothing needs the reader (no
   * headline). It takes no room then, not its padding either.
   */
  const bare = $derived(
    variant === "rail" && home.status === "connected" && home.needs.length === 0
  );
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

<!-- Every state change here travels (motion/rows `reflow`): a request
     arriving opens its place while what follows slides down, one leaving
     closes, a session moving from Working to Finished closes in one list
     and its count pops on the other tab, a re-sort slides, a group's box
     follows its height, and Caw comes and goes by his own clips. With less
     motion, only the fades run. In the rail the home is one box of the
     rail's own reflow, so what is under it slides as it grows. -->
<section
  aria-label="Home"
  class="home {variant}"
  data-flip={variant === "rail" && !relaying ? "box" : undefined}
  {@attach reflow()}
>
  <div
    class="top"
    class:bare={bare || (machinesThere !== null && home.needs.length === 0)}
  >
    <!-- The line every other line on this screen is believed by; live and
         read, it says nothing and takes no room. -->
    <StatusLine />
    {#if variant === "page" && home.limitsShown}
      <!-- The phone has no rail: the rail's usage strip stands here (owner
           pick i), on the home's own ground, while a machine is online
           (home `limitsShown`). -->
      <div class="usage">
        <UsageMeter variant="home" />
      </div>
    {/if}
    <!-- Only when something does: an empty claim is clutter. It enters and
         leaves as one block of the reflow, never a snap. -->
    {#if home.ready && home.live && home.needs.length > 0}
      <h1 class="headline" data-flip in:crossIn out:crossOut>
        <span aria-hidden="true" class="spark"><Attention /></span>
        <TextMorph
          as="span"
          duration={morphMs()}
          text={`${home.needs.length} need${home.needs.length === 1 ? "s" : ""} you`}
        />
      </h1>
    {/if}
  </div>

  <!-- The groups stand from the first frame. Until the first read is in,
       the Working and Finished tabs stand over rows that wait (WorkTabs
       `waiting`), so the tab row is where it will be and the list
       cross-fades in under it; nothing else here is claimed before then. -->
  <div class="groups">
    {#if card}
      <!-- An update nobody has seen stays here until it is dismissed. -->
      <section
        aria-label="Update"
        class="group"
        data-flip="box"
        in:crossIn
        out:crossOut
      >
        <UpdateCard
          notice={updated}
          ondismiss={dismissUpdate}
          onreload={newerBuild() ? reloadForUpdate : undefined}
        />
      </section>
    {/if}

    {#if moved.length > 0}
      <!-- Logins moved into CawCo stay here until the ✕ acknowledges them. -->
      <section
        aria-label="Logins moved"
        class="group"
        data-flip="box"
        in:crossIn
        out:crossOut
      >
        <MovedLogins
          {moved}
          ondismiss={() => {
            // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
            void notices.acknowledge(moved.map((one) => one.id));
          }}
        />
      </section>
    {/if}

    {#if home.ready && home.needs.length > 0}
      <!-- The headline above names this group and counts it; a header
           here would say the same twice. -->
      <section
        aria-label="Needs you"
        class="group"
        data-flip="box"
        in:crossIn
        out:crossOut
      >
        <div class="cards">
          {#each home.needs as item (item.key)}
            <NeedsCard {item} {stale} />
          {/each}
        </div>
      </section>
    {/if}

    {#if !noFleet}
      <WorkTabs
        {markedElsewhere}
        onstart={() => newSession()}
        {stale}
        {variant}
        waiting={!home.ready}
        bind:relaying
      />
    {/if}

    {#if machinesThere}
      <div class="machines" data-flip>
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
           somewhere, a tab with none says so itself (WorkTabs). He comes in
           by his enter, or by a fade where his status has none, and fades
           out, keeping his place until he has gone. -->
      <figure class="caw" data-flip>
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
        <figcaption>
          {#if firstRun}
            {#key cawLine}
              <span in:crossIn out:crossOut>{cawLine}</span>
            {/key}
          {/if}
        </figcaption>
      </figure>
    {/if}

    {#if variant === "page" && !noFleet}
      <HomeRecent />
    {/if}
  </div>

  {#if variant === "page" && !noFleet && !machineless}
    <!-- The phone's thumb reaches the bottom; Start session lives there,
         while a machine is online to start one on. -->
    <div class="dock">
      <Button class="w-full" onclick={() => newSession()} size="lg">
        <IconPlus />
        Start session
      </Button>
    </div>
  {/if}
</section>

<style>
  .home {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .home.page {
    flex: 1 1 auto;
    overflow-y: auto;
    background: var(--surface-recess);
  }
  /* In the rail it is one block of the rail's own scroller, at its full
     height: the rail scrolls, the home does not shrink into it. Nothing is
     ruled under it: the rail parts its sections with space alone (the
     groups' own padding, the footer with no border), and the tabs' rule is
     the one seam in this block. */
  .home.rail {
    flex: none;
  }
  .top {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .page .top {
    padding: var(--space-5) var(--space-5) var(--space-3);
  }
  .rail .top {
    padding: var(--space-2) var(--space-3) var(--space-1);
  }
  /* Nothing in it: in the rail, live and read with nothing needing the
     reader; on the page, the empty fleet, whose block stands where New
     project's ask does. */
  .top.bare {
    padding: 0;
  }
  /* The strip's card lines up with the status line's text. */
  .usage {
    margin-inline: -8px;
  }
  .headline {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
  }
  .rail .headline {
    font: var(--type-label);
    font-size: var(--text-body);
  }
  /* The one spark on the screen: needs you is the loudest thing here. */
  .spark {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--radius-sm);
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .rail .spark {
    inline-size: 22px;
    block-size: 22px;
    border-radius: var(--radius-xs);
  }
  .spark :global(svg) {
    width: 16px;
    height: 16px;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .page .groups {
    padding: var(--space-2) var(--space-5) var(--space-7);
  }
  .rail .groups {
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2) var(--space-2);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .caw {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-4) 0;
  }
  /* Anchored as New project's ask is (its page pads --space-7 on a phone):
     the groups' own top padding and this margin make that. */
  .machines {
    margin: var(--space-5) 0 var(--space-6);
  }
  .caw figcaption {
    position: relative;
    font: var(--type-body);
    color: var(--ink-muted);
    text-align: center;
  }
  .dock {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: var(--space-3) var(--space-5)
      calc(var(--space-3) + var(--safe-bottom));
    background: linear-gradient(
      transparent,
      var(--surface-recess) var(--space-4)
    );
  }
</style>
