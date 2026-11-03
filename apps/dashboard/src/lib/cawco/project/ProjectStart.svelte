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
    IconMaximize,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
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
  } from "./pr-team.fixtures";

  type Beat = "sent" | "named" | "spoke" | "drafting" | "page" | "set";

  let {
    beat,
    wait = "steps",
    board = "empty",
    artifact,
    phone = false,
  }: {
    /** Where the wait stands: sent (0 s), named (8 s), Caw's first words (13 s), drafting (60 s), the page open (121 s), the page sent. */
    beat: Beat;
    /** What fills Caw's panel while he drafts (card `the-wait`). */
    wait?: "stream" | "steps" | "line";
    /** The board before the setup page is sent (card `board-before`). */
    board?: "standin" | "empty" | "draft";
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
  const doing = $derived(DOING[beat]);
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
  const none = () => undefined;
  const nowhere = () => new Set<string>();
</script>

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
    <span class="ms-auto" data-box
      ><Caw size={48} status={pageOpen ? "needs-you" : "working"} /></span
    >
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
      <div class="mb-space-3 flex flex-wrap items-center gap-space-2">
        <Badge><span>Draft</span></Badge>
        <span class="type-meta text-ink-muted"
          >From the setup page as it stands. Nothing is written until you set it
          up.</span
        >
      </div>
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
    {:else}
      <div class="mx-auto max-w-c-measure">
        <EmptyState
          axis
          line={pageOpen
            ? "Its stages show here once you set it up on the setup page. Nothing is written before that."
            : "Caw is drafting how it runs from what you wrote. Its stages show here once you send the setup page."}
          title="Not set up yet"
        >
          {#snippet mark()}
            <div class="mb-space-3 grid justify-items-center">
              <CawFace size={48} status={pageOpen ? "needs-you" : "working"} />
            </div>
          {/snippet}
          {#snippet action()}
            {#if pageOpen}
              <Button
                label="Open the setup page"
                onclick={none}
                variant="outline"
              />
            {/if}
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  </div>
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
        <span class="type-label text-ink-strong"
          >Setting up {named ? PR_NAME : "the project"}</span
        >
        <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list), as NeedsCard's steps say. -->
        <ol class="m-0 grid list-none gap-space-2 p-0" role="list">
          {#each steps as one (one.label)}
            <li
              class="mark-line grid grid-cols-(--step-cols) items-box-start gap-x-space-2 type-label"
              style:--step-cols="var(--icon-md) minmax(0, 1fr)"
            >
              <span class="mark-cell"
                ><span class="grid size-icon-md place-items-center">
                  {#if one.done}
                    <IconSuccess
                      aria-hidden="true"
                      class="size-icon-md text-status-done-ink"
                    />
                  {:else if one.live}
                    <LiveDot />
                  {:else}
                    <IconNotYet
                      aria-hidden="true"
                      class="size-icon-md text-ink-subtle"
                    />
                  {/if}
                </span></span
              >
              <span class={one.done ? "text-ink-muted" : "text-ink-strong"}
                >{one.label}</span
              >
            </li>
          {/each}
        </ol>
        <Button
          label="Show his work ({calls})"
          onclick={none}
          size="xs"
          variant="ghost"
        />
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
        <div
          class="mark-line flex items-center gap-space-2 px-space-3 pb-space-2"
        >
          <Button
            aria-label="Back to the conversation"
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
          <div class="mark-line flex items-center gap-space-2 pb-space-2">
            <Button
              aria-label="Back to Board"
              icon={IconChevronLeft}
              size="icon-sm"
              variant="ghost"
            />
            <span class="type-label text-ink-strong">New project</span>
            <span class="type-meta text-ink-muted">Components · from Caw</span>
            <span class="ms-auto" data-box
              ><Button
                aria-label="Open full size"
                icon={IconMaximize}
                size="icon-sm"
                variant="ghost"
              /></span
            >
          </div>
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
