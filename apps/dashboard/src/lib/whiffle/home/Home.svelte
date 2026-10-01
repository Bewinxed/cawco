<script lang="ts">
  import { machineLabel } from "@whiffle/core";
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
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconPlus } from "$lib/icons";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import { crossIn, crossOut, morphMs } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import NewSessionDialog from "../spawn/NewSessionDialog.svelte";
  import UsageMeter from "../UsageMeter.svelte";
  import Caw from "./Caw.svelte";
  import HomeRecent from "./HomeRecent.svelte";
  import { home } from "./home.svelte";
  import NeedsCard from "./NeedsCard.svelte";
  import StatusLine from "./StatusLine.svelte";
  import WorkTabs from "./WorkTabs.svelte";

  let {
    variant,
    active,
  }: {
    /** `page` is the phone's home; `rail` is the wide screen's sidebar. */
    variant: "page" | "rail";
    /** Whether this home is the one on screen (it answers `?spawn=`). */
    active: boolean;
  } = $props();

  const stale = $derived(!home.live);
  /** Nothing anywhere yet: the one empty state the home keeps. */
  const firstRun = $derived(
    home.live &&
      home.needs.length +
        home.working.length +
        home.finished.length +
        home.recent.length ===
        0
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

  /* ── Start session ──────────────────────────────────────────────────── */

  let spawnOpen = $state(false);
  let spawnPrefill = $state<{ machineId?: string; cwd?: string } | undefined>(
    undefined
  );

  // "Spawn here" from anywhere in the app arrives as `?spawn=<machine>` on
  // `/session`; consumed once and cleared, so a reload is not a second spawn.
  $effect(() => {
    if (!active) {
      return;
    }
    const machineId = page.url.searchParams.get("spawn");
    if (!machineId) {
      return;
    }
    untrack(() => {
      spawnPrefill = {
        machineId,
        cwd: page.url.searchParams.get("cwd") ?? undefined,
      };
      spawnOpen = true;
      const url = new URL(page.url);
      url.searchParams.delete("spawn");
      url.searchParams.delete("cwd");
      // biome-ignore lint/complexity/noVoid: the dialog is already open; the URL cleanup is a courtesy
      void goto(url, { replaceState: true });
    });
  });

  function start() {
    spawnPrefill = undefined;
    spawnOpen = true;
  }
</script>

<!-- Every state change here travels (motion/rows `reflow`): a request
     arriving opens its place while what follows slides down, one leaving
     closes, a session moving from Working to Finished closes in one list
     and its count pops on the other tab, a re-sort slides, a group's box
     follows its height, and Caw fades where the groups were. With less
     motion, only the fades run. In the rail the home is one box of the
     rail's own reflow, so what is under it slides as it grows. -->
<section
  aria-label="Home"
  class="home {variant}"
  data-flip={variant === 'rail' ? 'box' : undefined}
  {@attach reflow()}
>
  <div class="top">
    <!-- The line every other line on this screen is believed by. -->
    <StatusLine />
    {#if variant === 'page'}
      <!-- The phone has no rail: the rail's usage strip stands here, always
           (owner pick i), on the home's own ground. -->
      <div class="usage">
        <UsageMeter />
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
          text={`${home.needs.length} need${home.needs.length === 1 ? 's' : ''} you`}
        />
      </h1>
    {/if}
  </div>

  <!-- The skeleton stands at the list's place until the first read is in,
       then the list cross-fades in over it as it leaves. -->
  {#if !home.ready}
    <div
      aria-busy="true"
      aria-label="Reading the fleet"
      class="loading"
      role="status"
      out:crossOut
    >
      {#each [0, 1, 2, 3] as row (row)}
        <Skeleton class="h-11 w-full" />
      {/each}
    </div>
  {:else}
    <div class="groups" in:crossIn>
      {#if home.needs.length > 0}
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

      <WorkTabs {stale} />

      {#if firstRun}
        <!-- Caw only on a fleet with nothing in it yet, or while a machine
             has not answered: an empty group is otherwise just absent. -->
        <figure class="caw" data-flip in:crossIn out:crossOut>
          <Caw pose="ready" size={variant === 'rail' ? 112 : 160} />
          <!-- The line's states share one cell and cross-fade (§8). -->
          <figcaption>
            {#key cawLine}
              <span in:crossIn out:crossOut>{cawLine}</span>
            {/key}
          </figcaption>
        </figure>
      {/if}

      {#if variant === 'page'}
        <HomeRecent />
      {/if}
    </div>
  {/if}

  {#if variant === 'page'}
    <!-- The phone's thumb reaches the bottom; Start session lives there. -->
    <div class="dock">
      <Button class="w-full" onclick={start} size="lg">
        <IconPlus />
        Start session
      </Button>
    </div>
  {/if}
</section>

<NewSessionDialog
  onclose={() => {
    spawnOpen = false;
  }}
  open={spawnOpen}
  prefill={spawnPrefill}
/>

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
     height: the rail scrolls, the home does not shrink into it. */
  .home.rail {
    flex: none;
    border-bottom: 1px solid var(--seam);
    margin-bottom: var(--space-1);
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
  /* The strip's edges line up with the status line's text. */
  .usage {
    --strip-ground: var(--surface-recess);
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
  .loading,
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .page .loading,
  .page .groups {
    padding: var(--space-2) var(--space-5) var(--space-7);
  }
  .rail .loading,
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
      calc(var(--space-3) + env(safe-area-inset-bottom));
    background: linear-gradient(
      transparent,
      var(--surface-recess) var(--space-4)
    );
  }
</style>
