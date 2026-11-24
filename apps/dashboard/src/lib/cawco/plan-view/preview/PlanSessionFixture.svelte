<script lang="ts">
  /**
   * A session's screen as the person meets it, for the design graph to draw
   * its plan in each direction: the session's tab and the bar's glass over
   * the conversation, its turns as the transcript draws them (Turn, Who,
   * MessageBody), and the real composer (Composer) with its delegate tray
   * and, at its tray row's end, the chip of what waits on the person
   * (WaitingChip) and the plan's chip (PlanChip). The plan's chip opens the
   * plan over the row (PlanLayer), read one way or the other (`direction`);
   * the list of what waits (WaitingCard) takes the same layer, so either
   * opening shuts the other, and a held task's "Waiting on you" opens it.
   *
   * The composer, the tray, the chips, the cards and the rows are the
   * product's; the plan's rows are read from the hub's plan shape
   * (plan-view.ts `planRows`). The delegate tray reads the work items the
   * states file seeds for ORCHESTRATOR.
   */
  import { untrack } from "svelte";
  import { provideHub } from "#lib/cawco/hub-seam.js";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import SessionShelfFrame from "#lib/cawco/transcript/session-shelf-frame.svelte";
  import Turn from "#lib/cawco/turn/Turn.svelte";
  import Who from "#lib/cawco/turn/Who.svelte";
  import WaitingCard from "#lib/cawco/waiting/WaitingCard.svelte";
  import WaitingChip from "#lib/cawco/waiting/WaitingChip.svelte";
  import { hubThrough } from "#lib/platform/hub.js";
  import PlanByWho from "../PlanByWho.svelte";
  import PlanChip from "../PlanChip.svelte";
  import PlanInOrder from "../PlanInOrder.svelte";
  import PlanLayer from "../PlanLayer.svelte";
  import { planCount, planRows } from "../plan-view";
  import {
    GONE_PLAN,
    LONG_PLAN,
    ORCHESTRATOR,
    PLAN,
    WAITING,
    WORKERS,
    WORKERS_ALL_WORKING,
  } from "./plan-fixtures";

  let {
    direction,
    plan: shape = "Eleven tasks",
    working = "One delegate idle",
    opened = true,
    height = 820,
  }: {
    /** How the open plan reads: in its own order, or by who is on each task. */
    direction: "order" | "who";
    /** Which plan: today's eleven tasks, a long one of thirty-eight, or today's with a task gone from the board. */
    plan?: "Eleven tasks" | "Thirty-eight tasks" | "A task gone from the board";
    /** Whether the delegate between turns is working one now too. */
    working?: "One delegate idle" | "Everyone working";
    /** The plan stands open as the frame opens. */
    opened?: boolean;
    /** The frame's height, px. */
    height?: number;
  } = $props();

  /** Each frame's own pane, so each frame's composer layer is its own. */
  const frame = $props.id();
  const SESSION = `${ORCHESTRATOR}-${frame}`;

  // A story's args are the live instance's inputs: a press flips its own copy, and a new arg resets it.
  let planShown = $state(false);
  let waitShown = $state(false);
  $effect.pre(() => {
    const open = opened;
    untrack(() => {
      planShown = open;
      waitShown = false;
    });
  });

  provideHub({
    state: "connected",
    client: hubThrough(
      new Proxy(fetch, {
        apply: () => Promise.reject(new Error("The canvas reaches no hub.")),
      })
    ),
  });

  const nothing = () => undefined;
  const draft = new ComposerDraft();

  const PLANS = {
    "Eleven tasks": PLAN,
    "Thirty-eight tasks": LONG_PLAN,
    "A task gone from the board": GONE_PLAN,
  };
  const workers = $derived(
    working === "Everyone working" ? WORKERS_ALL_WORKING : WORKERS
  );
  const rows = $derived(planRows(PLANS[shape], workers));
  const count = $derived(planCount(rows));

  const TURNS = [
    "The Liquid Glass title bars are on main. Tonight's nightly is held on your pick: ship it with the bars, or wait for the two host checks.",
    "I've put the Comments rail and the delegate tray at 390 on two delegates and taken the sign-in move for stored transcripts myself. I'm writing the sign-in under the account's id now.",
  ];
</script>

{#snippet trailing()}
  <WaitingChip
    onopen={() => {
      waitShown = !waitShown;
    }}
    open={WAITING.length}
    shown={waitShown}
  />
  {#if waitShown}
    <WaitingCard
      onclose={() => {
        waitShown = false;
      }}
      onopen={nothing}
      paneId={SESSION}
      rows={WAITING}
    />
  {/if}
  <PlanChip
    done={count.done}
    moving={count.moving}
    onopen={() => {
      planShown = !planShown;
    }}
    shown={planShown}
    total={count.total}
  />
  {#if planShown}
    <PlanLayer
      done={count.done}
      onclose={() => {
        planShown = false;
      }}
      paneId={SESSION}
      total={count.total}
    >
      {#if direction === "who"}
        <PlanByWho
          onwaiting={() => {
            waitShown = true;
          }}
          {rows}
          {workers}
        />
      {:else}
        <PlanInOrder
          onwaiting={() => {
            waitShown = true;
          }}
          {rows}
        />
      {/if}
    </PlanLayer>
  {/if}
{/snippet}

<div
  class="relative isolate flex h-(--fixture-h) flex-col overflow-clip bg-surface-shelf text-ink-strong"
  data-slot="session-fixture"
  style:--fixture-h="{height}px"
>
  <SessionShelfFrame needsYou title="Continue CawCo open tasks" />
  <div
    class="relative flex min-h-0 flex-auto flex-col bg-surface-raised"
    data-slot="pane"
  >
    <div
      class="min-h-0 flex-auto overflow-hidden px-space-7 max-desk:px-space-5"
    >
      <div class="mx-auto max-w-c-measure">
        {#each TURNS as turn, n (n)}
          <Turn>
            <Who name="Claude Code" />
            <MessageBody source={turn} wrap="pretty" />
          </Turn>
        {/each}
      </div>
    </div>
    <div class="pointer-events-none absolute inset-0 z-1">
      <Composer
        agentName="Claude Code"
        {draft}
        fleet={composerFleet}
        onstop={nothing}
        onsubmit={nothing}
        planRing={trailing}
        showing={SESSION}
        trayRows={[{ delegatesOf: ORCHESTRATOR, id: SESSION }]}
      />
    </div>
  </div>
</div>
