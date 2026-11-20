<script lang="ts">
  /**
   * Option 2 ("How it runs"): the whole work-path view mounted inside the
   * project page's view region. Left-aligned on the page edge up to
   * max-w-table-1102px, acting as a container-query root, drawing the
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
  import { IconAlert, IconCloudCross, IconRefresh } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import {
    type Change,
    type ChangeKey,
    type PlaceAct,
    type StageId,
    type StageState,
    stageStates,
  } from "./changes";
  import RailStage from "./RailStage.svelte";
  import { CHOICE_KINDS, type HowItRunsRecord } from "./records";
  import SessionsStart from "./SessionsStart.svelte";
  import TasksEnter from "./TasksEnter.svelte";
  import WhatWaits from "./WhatWaits.svelte";
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
  }: {
    record: HowItRunsRecord;
    /** Stages still being read: each draws skeleton wells, never a default value. */
    loading?: StageId[];
    /** Stages whose read failed, with the hub's words: an alert with Try again stands in place of the stage's content. */
    readFailed?: Partial<Record<StageId, string>>;
    /** Changes asked and not yet in force: the pressed control shows a spinner; the record still shows the hub's value. */
    pending?: ChangeKey[];
    /** Changes the hub refused, with its words: the record's value stands, the words beside that control with Try again. */
    refused?: Partial<Record<ChangeKey, string>>;
    /** A sync now running (stage 1's node goes live). */
    syncing?: boolean;
    /** The place whose Move is running (stage 2's node goes live, its row says Moving). */
    movingPlaceId?: string | null;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onreread: (stage: StageId) => void;
    onsync: () => void;
    onplace: (act: PlaceAct, placeId: string) => void;
    onaddplace: (machineId: string, path: string) => void;
    /** Configure's pages, reached from the stages (Accounts, Connections, Who decides fleet defaults). */
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
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

  const announcementOf = (stage: StageId): string => {
    if (loading.includes(stage)) {
      return words.stageLoading(words.stages[stage]);
    }
    if (readFailed[stage]) {
      return "";
    }
    if (stage === "tasks") {
      if (syncing || record.tie?.sync.kind === "syncing") {
        return words.tasks.syncing;
      }
      if (pending.includes("taskHome") || pending.includes("sync")) {
        return words.saving;
      }
    } else if (stage === "sessions") {
      if (movingPlaceId !== null) {
        return words.places.movingTip;
      }
      if (
        pending.includes("account") ||
        pending.includes("atLimit") ||
        pending.includes("largeFiles") ||
        pending.includes("addPlace")
      ) {
        return words.saving;
      }
    } else if (stage === "waits") {
      if (
        pending.some((key) => key === "review" || key.startsWith("decides."))
      ) {
        return words.saving;
      }
    } else if (stage === "lands" && pending.includes("landing")) {
      return words.saving;
    }
    return "";
  };
</script>

{#snippet stageReadFailed(stage: StageId, reason: string)}
  <Alert variant="destructive">
    <IconAlert aria-hidden="true" />
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
  <div aria-busy="true" class="min-w-0">
    {#if stage === "tasks"}
      <div
        class="flex flex-col gap-space-2 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
      >
        <div class="grid grid-cols-1 gap-space-2 @setup:grid-cols-3">
          <Skeleton class="w-full" height="item" radius="tile" />
          <Skeleton class="w-full" height="item" radius="tile" />
          <Skeleton class="w-full" height="item" radius="tile" />
        </div>
      </div>
    {:else if stage === "sessions"}
      <div
        class="grid min-w-0 grid-cols-1 items-start gap-space-3 @setup:grid-cols-5"
      >
        <div
          class="flex min-w-0 flex-col gap-space-2 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:col-span-3 @setup:px-space-4"
        >
          <Skeleton line="label" radius="text" width="label" />
          <Skeleton class="w-full" height="control-sm" radius="chip" />
          <Skeleton class="w-full" height="control-sm" radius="chip" />
          <Skeleton class="w-full" height="control-sm" radius="chip" />
        </div>
        <div
          class="flex min-w-0 flex-col gap-space-2 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:col-span-2 @setup:px-space-4"
        >
          <Skeleton line="label" radius="text" width="label" />
          <div class="flex flex-wrap gap-space-2">
            <Skeleton height="control-sm" radius="chip" width="name" />
            <Skeleton height="control-sm" radius="chip" width="name" />
            <Skeleton height="control-sm" radius="chip" width="title" />
          </div>
          <Skeleton line="meta" radius="text" width="title" />
        </div>
      </div>
    {:else if stage === "waits"}
      <div
        class="flex flex-col gap-space-2 rounded-well border border-border-contrast bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
      >
        <div class="flex items-center justify-between gap-space-2">
          <Skeleton line="label" radius="text" width="name" />
          <Skeleton line="meta" radius="text" width="name" />
        </div>
        <div
          class="grid grid-cols-1 gap-y-space-row @wide:grid-cols-2 @wide:gap-x-space-5"
        >
          {#each CHOICE_KINDS as kind (kind)}
            <div class="flex items-center gap-space-2">
              <Skeleton
                class="flex-none"
                line="label"
                radius="text"
                width="label"
              />
              <Skeleton
                class="min-w-0 flex-1"
                height="control-sm"
                radius="chip"
              />
            </div>
          {/each}
        </div>
        <div
          class="flex items-center justify-between gap-space-2 border-t border-border-hairline pt-space-2"
        >
          <Skeleton line="label" radius="text" width="title" />
          <Skeleton height="control-sm" radius="chip" width="title" />
        </div>
      </div>
    {:else}
      <div
        class="flex flex-col gap-space-2 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
      >
        <div
          class="grid grid-cols-1 gap-space-2 @field-group:grid-cols-2 @setup:grid-cols-4"
        >
          <Skeleton class="w-full" height="item" radius="tile" />
          <Skeleton class="w-full" height="item" radius="tile" />
          <Skeleton class="w-full" height="item" radius="tile" />
          <Skeleton class="w-full" height="item" radius="tile" />
        </div>
        <Skeleton line="meta" radius="text" width="title" />
      </div>
    {/if}
  </div>
{/snippet}

<div
  class="h-full min-h-0 w-full overflow-y-auto overscroll-contain px-space-2 py-space-2 phone:max-wide:px-space-3 wide:px-space-5"
  data-slot="page-scroll"
>
  <section
    aria-label={words.viewLabel}
    class="@container flex w-full max-w-table-1102px flex-col"
  >
    {#if !record.hubReachable}
      <Alert class="mb-space-3" layout="row" variant="warning">
        <IconCloudCross aria-hidden="true" />
        <AlertDescription>
          {words.hubOutOfReach(asOfAge)}
        </AlertDescription>
      </Alert>
    {/if}

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
  </section>
</div>
