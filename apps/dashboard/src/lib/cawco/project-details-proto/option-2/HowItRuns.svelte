<script lang="ts">
  /**
   * Option 2 ("How it runs"): the project's settings, mounted inside the
   * project page's pane, which gives it the page's side edges and its
   * scroller as it gives every view. Its peer sections (SettingsSection),
   * each one white card holding its heading and settings, stand in two
   * columns of cards (`COLUMNS`), so every one shows in the first screen:
   * Task sync, Account & usage limits, Repository & Git for a code project,
   * Run environments, and What needs you. A section still reading draws its own
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
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import AccountColumn from "./AccountColumn.svelte";
  import {
    type ChangeKey,
    type PlacesProps,
    SECTION_READS,
    type SectionId,
    type StageId,
    sectionStates,
  } from "./changes";
  import PlacesList from "./PlacesList.svelte";
  import RepoGit from "./RepoGit.svelte";
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

  /**
   * The sections as they stand: two columns, each an independent stack of
   * cards at their own heights, so a card opening in one leaves the other
   * column as it was. Which card stands in which column is chosen so the
   * two end nearly level at rest. Under the two-column width the columns
   * give way and every card stands one under another in this order.
   * Repository & Git only for code.
   */
  /** The columns' row stands at its full width, where each column is as wide as its widest option row (measured with the house's frame observer). */
  let full = $state(false);
  const measureFull = frameSize(
    (node: HTMLElement) =>
      node.clientWidth >=
      Number.parseFloat(getComputedStyle(node).maxWidth) - 1,
    (next: boolean) => {
      full = next;
    }
  );
  const COLUMNS = $derived.by<{ left: SectionId[]; right: SectionId[] }>(() => {
    if (!record.holdsCode) {
      return { left: ["tasks", "places"], right: ["account", "waits"] };
    }
    // At full width the folders sit over What needs you, the account under
    // the repository; narrower, the taller tiles and the roster's one card a
    // row level the columns the other way round.
    return full
      ? { left: ["tasks", "git", "account"], right: ["places", "waits"] }
      : { left: ["tasks", "git", "places"], right: ["account", "waits"] };
  });
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
        size="sm"
        variant="outline"
      />
    </AlertAction>
  </Alert>
{/snippet}

{#snippet waitsActs()}
  <!-- What acts on all of Who decides: the way to the fleet's defaults,
       drawn as a press at rest, at the head's own height (its xs). -->
  <Button
    href={hrefOf("fleetDecides")}
    label={words.waits.fleetDefaults}
    size="xs"
    variant="outline"
  />
{/snippet}

{#snippet repoLink()}
  <!-- The project's repository on the card title's line: a fact that opens
       where it lives, so it takes no row of its own. -->
  {@const [first, ...rest] = record.repos}
  {#if first}
    <a
      class="ms-auto min-w-0 truncate type-meta font-mono liga-none text-ink-muted underline-offset-2 hover:text-ink-strong hover:underline"
      href={first.url}
      rel="noreferrer"
      target="_blank">{first.owner}/{first.name}</a
    >{#if rest.length > 0}<span class="type-meta text-ink-muted">
        +{rest.length}</span
      >{/if}
  {/if}
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

{#snippet card(section: SectionId)}
  {@const state = stateOf(section)}
  {@const failed = failedOf(section)}
  <SettingsSection
    actions={section === "waits" && record.whoDecides.ok
      ? waitsActs
      : undefined}
    fact={section === "git" && record.repos.length > 0 ? repoLink : undefined}
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
      <RepoGit {onchange} {onretry} {pending} {record} {refused} />
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
{/snippet}

<!-- A view of the project page: its pane gives it the page's side edges and its scroller (ProjectPage `viewPane`, pane-inset `PANE_INSET`). -->
<section
  aria-label={words.viewLabel}
  class="@container/work-path flex w-full flex-col pt-space-4 pb-space-6 max-phone:py-space-4"
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

  <!-- Every section's card in the first screen: the two columns side by
       side on the page's edge under the tabs, one gap between cards both
       ways; under the two-column width one card under another. -->
  <div
    class="flex min-w-0 max-w-c-settings-max flex-col gap-space-4 @min-settings-two/work-path:flex-row @min-settings-two/work-path:items-start"
    {@attach measureFull}
  >
    {#each [COLUMNS.left, COLUMNS.right] as column, at (at)}
      <div class="flex min-w-0 flex-1 basis-0 flex-col gap-space-4">
        {#each column as section (section)}
          {@render card(section)}
        {/each}
      </div>
    {/each}
  </div>
</section>
