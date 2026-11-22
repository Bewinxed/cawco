<script lang="ts">
  /**
   * Option 2 ("How it runs"): the project's settings, mounted inside the
   * project page's pane, which gives it the page's side edges and its
   * scroller as it gives every view. Its peer sections (SettingsSection),
   * each one white card holding its heading and settings, stand on one grid
   * (`AREAS`), so every one shows in the first screen: Task sync, Account &
   * usage limits, Run environments, Repository & Git for a code project,
   * and What needs you. A section still reading draws its own
   * skeleton, one whose read failed its alert with Try again, and the
   * hub's being out of reach stands over them all.
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
  import AccountColumn from "./AccountColumn.svelte";
  import {
    type ChangeKey,
    ownKinds,
    type PlacesProps,
    SECTION_READS,
    type SectionId,
    type StageId,
    sectionStates,
  } from "./changes";
  import PlacesList from "./PlacesList.svelte";
  import RepoGit from "./RepoGit.svelte";
  import ResetDefaults from "./ResetDefaults.svelte";
  import SettingsSection from "./SettingsSection.svelte";
  import TasksEnter from "./TasksEnter.svelte";
  import WhatWaits, { DECIDERS_COLS } from "./WhatWaits.svelte";
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
  }: Omit<PlacesProps, "pending" | "refused" | "movingPlaceId"> & {
    /** Stages still being read: each draws skeleton wells, never a default value. */
    loading?: StageId[];
    /** Stages whose read failed, with the hub's words: an alert with Try again stands in place of each section that reads them. */
    readFailed?: Partial<Record<StageId, string>>;
    /** Acts still running (a place being added). A choice is never pending: `record` carries it from the press (changes.ts `withAsked`). */
    pending?: ChangeKey[];
    /** Changes the hub refused, with its words: the hub's value is back, the words under that control with Try again. */
    refused?: Partial<Record<ChangeKey, string>>;
    /** A sync now running (Task sync's heading goes live). */
    syncing?: boolean;
    /** The place whose Move is running (Run environments' heading goes live, its row says Moving). */
    movingPlaceId?: string | null;
    onreread: (stage: StageId) => void;
    onsync: () => void;
  } = $props();

  const baseStates = $derived(
    sectionStates(record, { sync: syncing, movingPlaceId })
  );

  const asOfAge = $derived(formatDistanceToNow(new Date(record.asOf)));
  /** The kinds this project set itself: the reset arrow stands while there are any. */
  const own = $derived(ownKinds(record));

  /** A section's stage still being read, if any: its skeleton stands. */
  const loadingOf = (section: SectionId): boolean =>
    SECTION_READS[section].some((stage) => loading.includes(stage));
  /** A section's stage whose read failed, with the hub's words: its alert stands. */
  const failedOf = (
    section: SectionId
  ): { stage: StageId; reason: string } | null => {
    for (const stage of SECTION_READS[section]) {
      const reason = readFailed[stage];
      if (reason) {
        return { stage, reason };
      }
    }
    return null;
  };
  const stateOf = (section: SectionId) => {
    if (loadingOf(section)) {
      return "settled";
    }
    return failedOf(section) ? "fault" : baseStates[section];
  };

  /** Said to a screen reader as a section starts or stops something; a pick says itself on its own control. */
  const announcementOf = (section: SectionId): string => {
    if (loadingOf(section)) {
      return words.sectionLoading(words.sections[section]);
    }
    if (failedOf(section)) {
      return "";
    }
    if (
      section === "tasks" &&
      (syncing || record.tie?.sync.kind === "syncing")
    ) {
      return words.tasks.syncing;
    }
    if (section === "places" && movingPlaceId !== null) {
      return words.places.moving;
    }
    return "";
  };

  /** The sections in their reading order, row by row: Repository & Git only for code. */
  const SECTIONS = $derived<SectionId[]>(
    record.holdsCode
      ? ["tasks", "account", "places", "git", "waits"]
      : ["tasks", "account", "places", "waits"]
  );

  /**
   * Where each section's card stands (SettingsSection names its area by its
   * id), at the view's three widths. Full width: two columns each as wide as
   * the widest option row (--spacing-c-settings-col), Task sync beside the
   * account, the places beside Repository & Git, What needs you across both,
   * each row's cards sharing its edges and height. Two narrower columns:
   * every card still in the first screen at 1024, the left column Task sync,
   * the places and What needs you, the right the account and Repository &
   * Git, each spanning the rows that level the two columns' feet. One column
   * (a phone): one card under another, in reading order.
   */
  const AREAS = $derived(
    record.holdsCode
      ? {
          one: '"tasks" "account" "places" "git" "waits"',
          two: '"tasks account" "places account" "places git" "waits git"',
          pair: '"tasks account" "places git" "waits waits"',
        }
      : {
          one: '"tasks" "account" "places" "waits"',
          two: '"tasks account" "places waits"',
          pair: '"tasks account" "places waits"',
        }
  );
</script>

{#snippet sectionReadFailed(section: SectionId, stage: StageId, reason: string)}
  <Alert variant="destructive">
    <IconError aria-hidden="true" />
    <AlertTitle>
      {words.readFailedTitle(words.sections[section])}
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

{#snippet waitsActs()}
  <!-- What acts on all of Who decides: the reset arrow while a kind is
       custom (ResetDefaults), then the fleet's defaults. -->
  {#if own.length > 0}
    <ResetDefaults
      disabled={!record.hubReachable}
      kinds={own}
      onreset={() => {
        for (const kind of own) {
          onchange({ key: "decidesReset", kind });
        }
      }}
    />
  {/if}
  <Button
    href={hrefOf("fleetDecides")}
    label={words.waits.fleetDefaults}
    size="xs"
    tone="quiet"
    variant="ghost"
  />
{/snippet}

{#snippet sectionSkeleton(section: SectionId)}
  <!-- Each section's own shape inside its card: its rows, its field, its cards, its tiles. -->
  <div aria-busy="true" class="flex min-w-0 flex-col gap-space-2">
    {#if section === "places" || section === "git"}
      {#each [0, 1, 2] as row (row)}
        <Skeleton class="w-full" height="row" radius="chip" />
      {/each}
    {:else if section === "account"}
      <Skeleton line="label" radius="text" width="label" />
      <Skeleton class="w-full" height="control-sm" radius="chip" />
    {:else if section === "waits"}
      <!-- The deciders' four cards, on the lines they stand on once read. -->
      <div class="@container/deciders">
        <div class={["grid gap-space-3", DECIDERS_COLS]}>
          {#each [0, 1, 2, 3] as at (at)}
            <Skeleton height="board" radius="card" />
          {/each}
        </div>
      </div>
    {:else}
      {#each [0, 1, 2] as at (at)}
        <Skeleton class="w-full" height="item" radius="tile" />
      {/each}
    {/if}
  </div>
{/snippet}

<!-- A view of the project page: its pane gives it the page's side edges and its scroller (ProjectPage `viewPane`, pane-inset `PANE_INSET`). -->
<section
  aria-label={words.viewLabel}
  class="@container flex w-full flex-col pt-space-4 pb-space-6 max-phone:py-space-4"
>
  {#if !record.hubReachable}
    <Alert
      class="mb-space-4 max-w-c-settings-max"
      layout="row"
      variant="warning"
    >
      <IconCloudCross aria-hidden="true" />
      <AlertDescription>
        {words.hubOutOfReach(asOfAge)}
      </AlertDescription>
    </Alert>
  {/if}

  <!-- Every section's card in the first screen, on the grid AREAS draws:
       one gap between cards both ways, a row's cards stretched to its
       height, the pair left on the page's edge under the tabs. -->
  <div
    class="grid min-w-0 max-w-c-settings-max grid-cols-1 grid-areas-(--areas-one) gap-space-4 @min-settings-two:@max-settings-pair:grid-cols-2 @min-settings-two:@max-settings-pair:grid-areas-(--areas-two) @min-settings-pair:grid-cols-(--pair-cols) @min-settings-pair:grid-areas-(--areas-pair)"
    style:--areas-one={AREAS.one}
    style:--areas-pair={AREAS.pair}
    style:--areas-two={AREAS.two}
    style:--pair-cols="repeat(2, var(--spacing-c-settings-col))"
  >
    {#each SECTIONS as section (section)}
      {@const state = stateOf(section)}
      {@const failed = failedOf(section)}
      <SettingsSection
        actions={section === "waits" && record.whoDecides.ok
          ? waitsActs
          : undefined}
        announcement={announcementOf(section)}
        id={section}
        {state}
        stateWords={words.stageState[state]}
        title={words.sections[section]}
      >
        {#if loadingOf(section)}
          {@render sectionSkeleton(section)}
        {:else if failed}
          {@render sectionReadFailed(section, failed.stage, failed.reason)}
        {:else if section === "tasks"}
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
        {:else if section === "places"}
          <PlacesList
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
        {:else if section === "git"}
          <RepoGit {hrefOf} {onchange} {onretry} {pending} {record} {refused} />
        {:else if section === "account"}
          <AccountColumn
            {hrefOf}
            {onchange}
            {onretry}
            {pending}
            {record}
            {refused}
          />
        {:else}
          <WhatWaits
            {onchange}
            onreread={() => onreread("waits")}
            {onretry}
            {pending}
            {record}
            {refused}
          />
        {/if}
      </SettingsSection>
    {/each}
  </div>
</section>
