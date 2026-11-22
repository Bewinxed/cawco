<script lang="ts">
  /**
   * Option 2 ("How it runs"): the whole work-path view mounted inside the
   * project page's pane, which gives it the page's side edges and its
   * scroller as it gives every view. The pane's whole width, a
   * container-query root: one column of stages under the wide line, two
   * side by side from it, drawing the
   * connected step rail across Tasks enter, Sessions start, What waits for
   * you, and (for code projects only) Work lands, with per-stage loading
   * skeletons, read-failure alerts, live announcements, and hub-offline
   * notice.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconCloudCross, IconError, IconRefresh } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import {
    type ChangeKey,
    type SessionsStartProps,
    type StageId,
    type StageState,
    stageStates,
  } from "./changes";
  import RailStage from "./RailStage.svelte";
  import SessionsStart from "./SessionsStart.svelte";
  import TasksEnter from "./TasksEnter.svelte";
  import WhatWaits, { DECIDERS_COLS } from "./WhatWaits.svelte";
  import WorkLands from "./WorkLands.svelte";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    loading = [],
    readFailed = {},
    pending = [],
    refused = {},
    syncing = false,
    movingPlaceId = null,
    onchange,
    onretry,
    onreread,
    onsync,
    onplace,
    onaddplace,
    hrefOf,
  }: Omit<SessionsStartProps, "pending" | "refused" | "movingPlaceId"> & {
    /** Stages still being read: each draws skeleton wells, never a default value. */
    loading?: StageId[];
    /** Stages whose read failed, with the hub's words: an alert with Try again stands in place of the stage's content. */
    readFailed?: Partial<Record<StageId, string>>;
    /** Acts still running (a place being added). A choice is never pending: `record` carries it from the press (changes.ts `withAsked`). */
    pending?: ChangeKey[];
    /** Changes the hub refused, with its words: the hub's value is back, the words under that control with Try again. */
    refused?: Partial<Record<ChangeKey, string>>;
    /** A sync now running (stage 1's node goes live). */
    syncing?: boolean;
    /** The place whose Move is running (stage 2's node goes live, its row says Moving). */
    movingPlaceId?: string | null;
    onreread: (stage: StageId) => void;
    onsync: () => void;
  } = $props();

  const baseStates = $derived(
    stageStates(record, { sync: syncing, movingPlaceId })
  );

  const asOfAge = $derived(formatDistanceToNow(new Date(record.asOf)));

  const stageStateOf = (stage: StageId): StageState => {
    if (loading.includes(stage)) {
      return "settled";
    }
    if (readFailed[stage]) {
      return "fault";
    }
    return baseStates[stage];
  };
  const tasksState = $derived(stageStateOf("tasks"));
  const sessionsState = $derived(stageStateOf("sessions"));
  const waitsState = $derived(stageStateOf("waits"));

  /** Said to a screen reader as a stage starts or stops something; a pick says itself on its own control. */
  const announcementOf = (stage: StageId): string => {
    if (loading.includes(stage)) {
      return words.stageLoading(words.stages[stage]);
    }
    if (readFailed[stage]) {
      return "";
    }
    if (stage === "tasks" && (syncing || record.tie?.sync.kind === "syncing")) {
      return words.tasks.syncing;
    }
    if (stage === "sessions" && movingPlaceId !== null) {
      return words.places.moving;
    }
    return "";
  };
</script>

{#snippet stageReadFailed(stage: StageId, reason: string)}
  <Alert variant="destructive">
    <IconError aria-hidden="true" />
    <AlertTitle>
      {words.readFailedTitle(words.stages[stage])}
    </AlertTitle>
    <AlertDescription
      ><span class="wrap-anywhere">{reason}</span></AlertDescription
    >
    <AlertAction class="row-span-2 self-center">
      <Button
        disabled={!record.hubReachable}
        icon={IconRefresh}
        label={words.tryAgain}
        onclick={() => onreread(stage)}
        size="xs"
        variant="outline"
      />
    </AlertAction>
  </Alert>
{/snippet}

{#snippet stageSkeleton(stage: StageId)}
  <!-- Each stage's own shape, on the ground it stands on: its tiles, its rows, its cards. -->
  <div aria-busy="true" class="min-w-0">
    {#if stage === "sessions"}
      <div
        class="grid min-w-0 grid-cols-1 items-start gap-x-space-6 gap-y-space-5 @setup:grid-cols-5"
      >
        <div class="flex min-w-0 flex-col gap-space-2 @setup:col-span-3">
          <Skeleton line="label" radius="text" width="label" />
          {#each [0, 1, 2] as row (row)}
            <Skeleton class="w-full" height="row" radius="chip" />
          {/each}
        </div>
        <div class="flex min-w-0 flex-col gap-space-2 @setup:col-span-2">
          <Skeleton line="label" radius="text" width="label" />
          <div class="flex flex-wrap gap-space-2">
            <Skeleton height="control-sm" radius="chip" width="name" />
            <Skeleton height="control-sm" radius="chip" width="name" />
            <Skeleton height="control-sm" radius="chip" width="title" />
          </div>
        </div>
      </div>
    {:else if stage === "waits"}
      <!-- The deciders' four cards, on the lines they stand on once read. -->
      <div class="@container/deciders">
        <div class={["grid gap-space-3", DECIDERS_COLS]}>
          {#each [0, 1, 2, 3] as at (at)}
            <Skeleton height="board" radius="card" />
          {/each}
        </div>
      </div>
    {:else}
      <div
        class="grid grid-cols-(--tiles-cols) gap-space-2 max-phone:grid-cols-1"
        style:--tiles-cols="repeat({stage === 'tasks' ? 3 : 2}, minmax(0, 1fr))"
      >
        {#each stage === "tasks" ? [0, 1, 2] : [0, 1, 2, 3] as at (at)}
          <Skeleton class="w-full" height="item" radius="tile" />
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<!-- A view of the project page: its pane gives it the page's side edges and its scroller (ProjectPage `viewPane`, pane-inset `PANE_INSET`). -->
<section
  aria-label={words.viewLabel}
  class="@container flex w-full flex-col pt-space-5 pb-space-6 max-phone:py-space-4"
>
  {#if !record.hubReachable}
    <Alert class="mb-space-5" layout="row" variant="warning">
      <IconCloudCross aria-hidden="true" />
      <AlertDescription>
        {words.hubOutOfReach(asOfAge)}
      </AlertDescription>
    </Alert>
  {/if}

  <!-- The stages in their order on one grid: one column, the rail running
       down it; from the wide line two, side by side in rows (1 and 2, then
       3 and 4), each pair's heads on one line and their bodies on one top
       edge, the rail's connectors put away (RailStage). -->
  <div
    class="grid min-w-0 grid-cols-1 items-start gap-x-space-7 @wide:grid-cols-2"
  >
    <!-- Stage 1: Tasks enter -->
    <RailStage
      announcement={announcementOf("tasks")}
      id="tasks"
      n={1}
      state={tasksState}
      stateWords={words.stageState[tasksState]}
      title={words.stages.tasks}
    >
      {#if loading.includes("tasks")}
        {@render stageSkeleton("tasks")}
      {:else if readFailed.tasks}
        {@render stageReadFailed("tasks", readFailed.tasks)}
      {:else}
        <TasksEnter
          {hrefOf}
          {onchange}
          {onretry}
          {onsync}
          {pending}
          {record}
          {refused}
          {syncing}
        />
      {/if}
    </RailStage>

    <!-- Stage 2: Sessions start -->
    <RailStage
      announcement={announcementOf("sessions")}
      id="sessions"
      n={2}
      state={sessionsState}
      stateWords={words.stageState[sessionsState]}
      title={words.stages.sessions}
    >
      {#if loading.includes("sessions")}
        {@render stageSkeleton("sessions")}
      {:else if readFailed.sessions}
        {@render stageReadFailed("sessions", readFailed.sessions)}
      {:else}
        <SessionsStart
          {hrefOf}
          {movingPlaceId}
          {onaddplace}
          {onchange}
          {onplace}
          {onretry}
          {pending}
          {record}
          {refused}
        />
      {/if}
    </RailStage>

    <!-- Stage 3: What waits for you (ends the rail when the project holds no code) -->
    <RailStage
      announcement={announcementOf("waits")}
      id="waits"
      last={!record.holdsCode}
      n={3}
      state={waitsState}
      stateWords={words.stageState[waitsState]}
      title={words.stages.waits}
    >
      {#if loading.includes("waits")}
        {@render stageSkeleton("waits")}
      {:else if readFailed.waits}
        {@render stageReadFailed("waits", readFailed.waits)}
      {:else}
        <WhatWaits
          {hrefOf}
          {onchange}
          onreread={() => onreread("waits")}
          {onretry}
          {pending}
          {record}
          {refused}
        />
      {/if}
    </RailStage>

    <!-- Stage 4: Work lands (code projects only) -->
    {#if record.holdsCode}
      {@const landsState = stageStateOf("lands")}
      <RailStage
        announcement={announcementOf("lands")}
        id="lands"
        last
        n={4}
        state={landsState}
        stateWords={words.stageState[landsState]}
        title={words.stages.lands}
      >
        {#if loading.includes("lands")}
          {@render stageSkeleton("lands")}
        {:else if readFailed.lands}
          {@render stageReadFailed("lands", readFailed.lands)}
        {:else}
          <WorkLands {onchange} {onretry} {pending} {record} {refused} />
        {/if}
      </RailStage>
    {/if}
  </div>
</section>
