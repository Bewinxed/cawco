<script lang="ts">
  import type { Stage } from "@cawco/core/task-views";
  /**
   * DESIGN BENCH (decision page `onboarding-design`): a project's page in
   * its first minutes, from Send on New project to the setup page sent,
   * drawn from the product's own parts with the personal PR team's records
   * (pr-team.fixtures.ts). It lays out what the page route lays out (the
   * rail's project row, the head, the board, Caw's docked panel; on a phone
   * the panel as the sheet over the board), so each option of the page's
   * cards stands as a story: what fills Caw's panel through the wait
   * (`wait`), what the board shows before the setup page is sent (`board`),
   * and where a preview, canvas or component of Caw's opens (`artifact`).
   * The route takes the picked options; this bench goes once they are built.
   */
  import Caw from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import ProjectMark from "#lib/cawco/ProjectMark.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import MessageRow from "#lib/cawco/transcript/MessageRow.svelte";
  import ToolGroup from "#lib/cawco/transcript/ToolGroup.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronLeft,
    IconClose,
    IconFolder,
    IconMaximize,
  } from "#lib/icons.js";
  import StepRow from "../home/StepRow.svelte";
  import canvasFrame from "./fixtures/canvas-frame-1440.png";
  import setupPage from "./fixtures/setup-pr-team-380.png";
  import {
    CAW_FIRST,
    CODE_STAGES,
    DRAFTING_TOOLS,
    PR_NAME,
    PR_STAGES,
    SENT,
    SET_UP,
    type SetupAsk,
  } from "./pr-team.fixtures";
  import SetupAskCard from "./SetupAskCard.svelte";

  type Beat = "sent" | "named" | "spoke" | "drafting" | "page" | "set";

  let {
    beat,
    wait = "steps",
    board = "empty",
    artifact,
    asks = [],
    phone = false,
  }: {
    /** Where the wait stands: sent (0 s), named (8 s), Caw's first words (13 s), drafting (60 s), the page open (121 s), the page sent. */
    beat: Beat;
    /** What fills Caw's panel while he drafts (card `the-wait`). */
    wait?: "stream" | "steps" | "line" | "stage" | "asks";
    /** The board before the setup page is sent (card `board-before`). */
    board?: "standin" | "empty" | "draft" | "scene";
    /** `asks`: the questions he has asked so far, as they stand. */
    asks?: SetupAsk[];
    /** A preview, canvas or component of his, opened (card `artifact-open`). */
    artifact?: "panel" | "main" | "session";
    /** The phone's layout: no rail, the panel the sheet over the board. */
    phone?: boolean;
  } = $props();

  const ORDER: Beat[] = ["sent", "named", "spoke", "drafting", "page", "set"];
  const past = (one: Beat) => ORDER.indexOf(beat) >= ORDER.indexOf(one);
  const named = $derived(past("named"));
  const spoke = $derived(past("spoke"));
  const pageOpen = $derived(beat === "page");
  /** The setup page was sent: the board is the project's own. */
  const isSet = $derived(beat === "set");

  /** The setup's steps, read off the conversation's own calls (project_setup, project_name, the page's write and its artifact). */
  const steps = $derived([
    { label: "Read what you wrote", done: past("named") },
    {
      label: named ? `Named it ${PR_NAME}` : "Name it",
      done: past("named"),
    },
    {
      label: "Draft the stages and who does the work",
      done: pageOpen,
      live: past("spoke") && !pageOpen,
    },
    { label: "Open the setup page", done: pageOpen },
  ]);
  /** What the one line says he is on, by beat. */
  const DOING: Record<Beat, string> = {
    sent: "Reading what you wrote…",
    named: "Naming it…",
    spoke: "Drafting the stages…",
    drafting: "Drafting the stages…",
    page: "Drafting the stages…",
    set: "Drafting the stages…",
  };
  /** A question his work waits on, still open. */
  const holding = $derived(asks.find((one) => one.blocks && !one.answered));
  const redo = $derived(asks.find((one) => one.redoing)?.redoing);
  function doingNow(): string {
    if (redo) {
      return redo;
    }
    return holding ? "Drafting the rest while you decide" : DOING[beat];
  }
  const doing = $derived(doingNow());
  /** How many of his calls have landed by each beat (DRAFTING_TOOLS). */
  const CALLS: Record<Beat, number> = {
    sent: 0,
    named: 2,
    spoke: 3,
    drafting: 6,
    page: 6,
    set: 6,
  };
  const calls = $derived(CALLS[beat]);

  /** The board's stages: the stand-in's, or the page's once it is open. */
  function stagesShown(): Stage[] {
    if (board === "standin") {
      return CODE_STAGES;
    }
    return pageOpen || isSet ? PR_STAGES : [];
  }
  const shownStages = $derived(stagesShown());
  /**
   * The page's one live Caw (CawSeat), in one place at a time: in his
   * panel's setup element while he drafts there (`stage`, `asks`); else over
   * a board with nothing on it, on its axis at 80; else in the head at 48.
   */
  const boardEmpty = $derived(
    !artifact &&
      board !== "standin" &&
      !isSet &&
      !(board === "draft" && pageOpen)
  );
  function cawPlace(): "panel" | "board" | "head" | "none" {
    if ((wait === "stage" || wait === "asks") && !pageOpen && !isSet) {
      return "panel";
    }
    if (artifact === "session") {
      return "none";
    }
    return boardEmpty ? "board" : "head";
  }
  const cawAt = $derived(cawPlace());
  /** The questions still open, newest first, as they float. */
  const open = $derived(asks.filter((one) => !one.answered || one.redoing));
  const cawStatus = $derived(pageOpen ? "needs-you" : "working");
  const none = () => undefined;
  const nowhere = () => new Set<string>();
</script>

{#snippet bar(back: string, inset: boolean)}
  <!-- The canvas's own bar: back, its name and kind, Open full size. -->
  <div
    class={[
      "mark-line flex items-center gap-space-2 pb-space-2",
      inset && "px-space-3",
    ]}
  >
    <Button
      aria-label={back}
      icon={IconChevronLeft}
      size="icon-sm"
      variant="ghost"
    />
    <span class="type-label text-ink-strong">New project</span>
    <span class="type-meta text-ink-muted">Components</span>
    <span class="ms-auto" data-box
      ><Button
        aria-label="Open full size"
        icon={IconMaximize}
        size="icon-sm"
        variant="ghost"
      /></span
    >
  </div>
{/snippet}

{#snippet well(inset: boolean)}
  <!-- The canvas as it draws, at its real width, scrolling in its well. -->
  <div
    class={[
      "min-h-0 flex-auto overflow-auto rounded-md border border-border-well bg-surface-well",
      inset && "mx-space-3 mb-space-3",
    ]}
  >
    <img alt="" class="block max-w-none" src={canvasFrame} />
  </div>
{/snippet}

{#snippet head()}
  <div
    data-slot="head"
    class="flex min-h-c-mark items-center gap-space-3 px-space-6 pt-space-4 max-phone:px-space-4"
  >
    <h1
      class={[
        "m-0 min-w-0 type-title",
        named ? "text-ink-strong" : "text-ink-subtle",
      ]}
    >
      <MorphText text={named ? PR_NAME : "New project"} />
    </h1>
    {#if !named}
      <span
        class="mark-line flex items-center gap-space-1 type-meta text-ink-muted"
      >
        <LiveDot /><span>Naming…</span>
      </span>
    {/if}
    {#if cawAt === "head"}
      <span class="ms-auto" data-box><Caw size={48} status={cawStatus} /></span>
    {/if}
  </div>
{/snippet}

{#snippet boardArea()}
  <div
    data-slot="board"
    class="min-h-0 flex-auto overflow-auto px-space-6 pt-space-5 max-phone:px-space-4"
  >
    {#if board === "standin" || isSet}
      <TaskBoard
        allowedFrom={nowhere}
        hrefOf={() => "#"}
        newIn="ready"
        oncreate={async () => undefined}
        onmove={none}
        onopen={none}
        stages={shownStages}
        tasks={[]}
      />
    {:else if board === "draft" && pageOpen}
      <div class="mb-space-3"><Badge><span>Draft</span></Badge></div>
      <TaskBoard
        allowedFrom={nowhere}
        hrefOf={() => "#"}
        newIn={undefined}
        oncreate={async () => undefined}
        onmove={none}
        onopen={none}
        stages={shownStages}
        tasks={[]}
      />
    {:else if board === "scene"}
      <!-- As big as the board: the claim and its action on the axis, his
           live self over them while he is here, and around them his rests
           as pictures (no Rive runs for them), standing on the floor. -->
      <!-- mark-line: Caw stands over the claim on its axis, never beside its words. -->
      <div
        data-slot="scene"
        class="relative flex h-full min-h-c-caw-panel-h flex-col items-center justify-center gap-space-2 pb-space-8"
      >
        {@render asking()}
        {#if cawAt === "board"}
          <Caw size={80} status={cawStatus} />
        {/if}
        <h2 class="m-0 type-title text-center text-ink-strong">
          Not set up yet
        </h2>
        <p class="m-0 type-body text-center text-ink-muted">
          Its stages show here once you set it up.
        </p>
        <div class="mt-space-2">{@render openPage()}</div>
        <div
          aria-hidden="true"
          class="absolute inset-x-0 bottom-0 flex items-end justify-around px-space-8 pb-space-5"
        >
          <CawFace size={56} status="sleeping" />
          <CawFace size={64} status="idle" />
          <CawFace size={48} status="ready" />
          <CawFace size={56} status="done" />
        </div>
      </div>
    {:else}
      {@render asking()}
      <div class="mx-auto max-w-c-measure">
        {#if cawAt === "board"}
          <EmptyState
            actionWidth="fill"
            axis
            line="Its stages show here once you set it up."
            title="Not set up yet"
          >
            {#snippet mark()}
              <div class="mb-space-3 grid justify-items-center">
                <Caw size={80} status={cawStatus} />
              </div>
            {/snippet}
            {#snippet action()}
              {@render openPage()}
            {/snippet}
          </EmptyState>
        {:else}
          <EmptyState
            actionWidth="fill"
            axis
            icon={IconFolder}
            line="Its stages show here once you set it up."
            title="Not set up yet"
          >
            {#snippet action()}
              {@render openPage()}
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet openPage()}
  <!-- The empty board's one action: the setup page, once it is there; while
       Caw drafts it, why it can't open yet over the button, held. -->
  <div class="flex flex-col items-center gap-space-1">
    {#if !pageOpen}
      <span class="type-meta text-ink-muted">Caw is drafting it.</span>
    {/if}
    <Button
      disabled={!pageOpen}
      label="Open the setup page"
      onclick={none}
      variant="outline"
    />
  </div>
{/snippet}

{#snippet setupSteps()}
  <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list), as NeedsCard's steps say. -->
  <ol class="m-0 grid list-none gap-space-2 p-0" role="list">
    {#each steps as one, index (one.label)}
      <StepRow
        done={one.done}
        doneWord="Done:"
        label={one.label}
        live={one.live ?? false}
        n={index + 1}
        step={String(index)}
      />
    {/each}
  </ol>
{/snippet}

{#snippet asking()}
  <!-- His questions, floating in on the board while he drafts: what holds
       him up wears the Needs-you mark, what doesn't says what he goes on
       with. On a phone they stand in his sheet instead. -->
  {#if wait === "asks" && !isSet && !phone && open.length > 0}
    <div
      data-slot="asks"
      class="relative z-1 mx-auto mb-space-5 flex w-full max-w-c-measure flex-col gap-space-3"
    >
      {#each open as ask (ask.id)}
        <SetupAskCard {ask} />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet waitRows()}
  {#if spoke}
    <MessageRow agentName="Caw" message={CAW_FIRST} />
  {/if}
  {#if isSet}
    <MessageRow agentName="Caw" message={SET_UP} />
  {:else if !pageOpen}
    {#if wait === "stream"}
      {#if beat !== "sent"}
        <ToolGroup messages={DRAFTING_TOOLS.slice(0, calls)} />
      {/if}
    {:else if wait === "steps"}
      <!-- The setup's steps, each ticking as his calls land: the same step
           list as the first-run row and the tailnet row. -->
      <div data-slot="setup-steps" class="flex flex-col gap-space-2">
        {@render setupSteps()}
        <Button
          label="Show his work ({calls})"
          onclick={none}
          size="xs"
          variant="ghost"
        />
      </div>
    {:else if wait === "stage" || wait === "asks"}
      {#if phone && wait === "asks" && open.length > 0}
        <SetupAskCard ask={open[0]} count={{ at: 1, of: open.length }} />
      {/if}
      <!-- His setup element: a transcript well holding him, live, on its
           axis, what he is on now under him, and the setup's fixed steps. -->
      <div
        data-slot="setup-stage"
        class="flex flex-col items-center gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
      >
        {#if cawAt === "panel"}
          <Caw size={80} status={cawStatus} />
        {/if}
        <span
          class="mark-line flex items-center gap-space-2 type-label text-ink-strong"
          ><LiveDot /><MorphText text={doing} /></span
        >
        <div class="self-stretch">{@render setupSteps()}</div>
      </div>
    {:else}
      <div
        class="mark-line flex items-center gap-space-2 type-label text-ink-muted"
      >
        <LiveDot /><MorphText text={doing} />
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet panel(wide: boolean)}
  <aside
    data-slot="caw-panel"
    class={[
      "flex min-h-0 flex-col overflow-hidden bg-surface-raised shadow-tile",
      phone
        ? "absolute inset-x-0 bottom-0 h-c-caw-panel-h rounded-t-lg"
        : "m-space-3 ms-0 w-(--panel-w) flex-none rounded-lg",
    ]}
    style:--panel-w={wide ? "calc(var(--c-panel-w) * 2)" : "var(--c-panel-w)"}
  >
    <div
      class="mark-line flex items-center gap-space-2 px-space-4 pt-space-3 pb-space-2"
    >
      <CawFace size={18} status={pageOpen ? "needs-you" : "working"} />
      <span class="type-label text-ink-strong">Caw</span>
      <span class="type-meta text-ink-muted"
        >{pageOpen ? "Needs you" : "Working"}</span
      >
    </div>
    {#if pageOpen && !artifact}
      <!-- The page arrives in the panel: the last step's row becomes it. -->
      <div class="min-h-0 flex-auto overflow-hidden">
        <img
          alt="The setup page for Your PR team"
          class="block w-full"
          src={setupPage}
        />
      </div>
    {:else if artifact === "panel"}
      <div class="flex min-h-0 flex-auto flex-col">
        {@render bar("Back to the conversation", true)}
        {@render well(true)}
      </div>
    {:else}
      <div
        class="flex min-h-0 flex-auto flex-col gap-space-4 overflow-auto px-space-2 pb-space-4"
      >
        <MessageRow agentName="Caw" message={SENT} />
        {@render waitRows()}
        {#if artifact === "main"}
          <MessageRow
            agentName="Caw"
            message={{
              ...CAW_FIRST,
              id: "shown",
              content:
                "The New project canvas is open beside this conversation.",
            }}
          />
        {/if}
      </div>
    {/if}
  </aside>
{/snippet}

<div
  class={[
    "relative flex h-(--scene-h) overflow-hidden bg-surface-recess",
    phone && "flex-col",
  ]}
  style:--scene-h="var(--c-bench-phone-h)"
>
  {#if !phone}
    <!-- The rail's project row: the placeholder, breathing while it is named; then his name, morphed in place. -->
    <nav
      class="flex w-(--rail-w) flex-none flex-col gap-space-1 px-space-2 pt-space-5"
      style:--rail-w="var(--c-sidebar-w)"
    >
      <span class="px-space-2 pb-space-1 type-meta text-ink-muted"
        >Projects</span
      >
      <div
        class="mark-line flex items-center gap-space-2 rounded-md px-space-2 py-space-1"
      >
        <ProjectMark hue={3} name="Cawco-Dev" ontoggle={none} />
        <span class="type-label text-ink-row">Cawco-Dev</span>
      </div>
      <div
        class="mark-line flex items-center gap-space-2 rounded-md bg-selected-bg px-space-2 py-space-1"
      >
        <ProjectMark
          hue={6}
          name={named ? PR_NAME : "New project"}
          ontoggle={none}
        />
        <span
          class={[
            "min-w-0 type-label",
            named ? "text-selected-ink" : "text-ink-subtle",
          ]}><MorphText text={named ? PR_NAME : "New project"} /></span
        >
        {#if !(pageOpen || isSet)}<span class="ms-auto" data-box
            ><LiveDot /></span
          >{/if}
      </div>
    </nav>
  {/if}

  {#if artifact === "session"}
    <!-- His conversation's own page: the transcript, the canvas in its artifact panel. -->
    <section class="flex min-w-0 flex-auto">
      <div
        class="flex w-c-panel-w min-w-0 flex-none flex-col gap-space-4 px-space-4 pt-space-5"
      >
        <MessageRow agentName="Caw" message={SENT} />
        <MessageRow agentName="Caw" message={CAW_FIRST} />
      </div>
      <div
        class="m-space-3 flex min-w-0 flex-auto flex-col rounded-lg bg-surface-raised shadow-tile"
      >
        <div
          class="mark-line flex items-center gap-space-2 px-space-3 py-space-2"
        >
          <span class="type-label text-ink-strong">New project</span>
          <span class="type-meta text-ink-muted">Components</span>
          <span class="ms-auto" data-box
            ><Button
              aria-label="Close"
              icon={IconClose}
              size="icon-sm"
              variant="ghost"
            /></span
          >
        </div>
        {@render well(true)}
      </div>
    </section>
  {:else}
    <section class="relative flex min-w-0 flex-auto flex-col">
      {@render head()}
      {#if artifact === "main"}
        <div
          class="flex min-h-0 flex-auto flex-col px-space-6 pt-space-4 pb-space-3"
        >
          {@render bar("Back to Board", false)}
          {@render well(false)}
        </div>
      {:else}
        {@render boardArea()}
      {/if}
      {#if phone}
        {@render panel(false)}
      {/if}
    </section>
    {#if !phone}
      {@render panel(artifact === "panel")}
    {/if}
  {/if}
</div>
