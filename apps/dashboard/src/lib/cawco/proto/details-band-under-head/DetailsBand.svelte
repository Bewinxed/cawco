<script lang="ts">
  /**
   * A project's details as a band in the page, under its head (Option 2,
   * "Band under the head"): the board moves down and stays whole and live.
   * Three columns answer the person's three questions, each group keeping
   * its own name and no column a heading: where it lives (Places, the
   * widest, for whole paths, standing under the head's place mark); who
   * settles and runs it (Who decides, then Account); where its work is kept
   * and sent (Tasks kept, Finished work goes, Large files). Reading and
   * focus order run down the first column, then the second, then the third,
   * so a phone's one column reads in the same order.
   *
   * The columns follow the band's own width, three from 640px and one
   * below it (a container query: with Caw's panel docked at 1440 the page
   * is about 810 and the band lays out as it does at 1024). A group applies
   * only where it holds: no repository facts, landing or large files on a
   * project without code.
   *
   * Every fact is the hub's: a pick is asked through its event, and the
   * mark moves when the hub says so. Close stands at the band's end, on
   * its first line.
   */
  import type { ProjectAtLimit } from "@cawco/core/accounts";
  import type { DecidesTable } from "@cawco/core/decides";
  import type { LandsMode } from "@cawco/core/injected";
  import type { Tracker, TrackerView } from "@cawco/core/trackers";
  import type { ProjectPlace, ProjectRow } from "#lib/cawco/projects.js";
  import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose } from "#lib/icons.js";
  import AccountGroup from "./AccountGroup.svelte";
  import type { MoveUnderWay, PlaceStanding } from "./band-model";
  import LandingGroup from "./LandingGroup.svelte";
  import LargeFilesGroup from "./LargeFilesGroup.svelte";
  import PlacesGroup from "./PlacesGroup.svelte";
  import TasksKeptGroup from "./TasksKeptGroup.svelte";
  import WhoDecidesGroup from "./WhoDecidesGroup.svelte";
  import { bandWords } from "./words";

  let {
    project,
    machines,
    accounts,
    tracker,
    decides,
    standings,
    move = null,
    syncing = false,
    onclose,
    onmove = () => undefined,
    onfind = () => undefined,
    ondrop = () => undefined,
    onreopen = () => undefined,
    onadd = () => undefined,
    onreview = () => undefined,
    onaccount = () => undefined,
    onatlimit = () => undefined,
    ontracker = () => undefined,
    onsync = () => undefined,
    onchangestages = () => undefined,
    onlands = () => undefined,
    onlfs = () => undefined,
  }: {
    project: ProjectRow;
    machines: Machine[];
    accounts: AccountsView;
    tracker: TrackerView;
    decides: DecidesTable;
    standings: Record<string, PlaceStanding>;
    move?: MoveUnderWay | null;
    syncing?: boolean;
    onclose: () => void;
    onmove?: (place: ProjectPlace) => void;
    onfind?: (place: ProjectPlace) => void;
    ondrop?: (place: ProjectPlace) => void;
    onreopen?: (move: MoveUnderWay) => void;
    onadd?: () => void;
    onreview?: (on: boolean) => void;
    onaccount?: (account: string | null) => void;
    onatlimit?: (atLimit: ProjectAtLimit) => void;
    ontracker?: (tracker: Tracker) => void;
    onsync?: () => void;
    onchangestages?: () => void;
    onlands?: (lands: LandsMode) => void;
    onlfs?: (own: boolean) => void;
  } = $props();

  /** A project with a repository holds code: landing and large files apply. */
  const code = $derived(project.links.length > 0);
</script>

<section
  aria-label={bandWords.region}
  class="@container relative me-space-6 mb-space-4 ms-space-7 rounded-lg border border-border-hairline bg-surface-raised p-space-5 shadow-tile max-desk:mx-space-5"
  data-project-details
  data-slot="details-band"
>
  <!-- Close, on the groups' first line at the band's end. -->
  <Button
    aria-label={bandWords.close}
    class="absolute end-space-3 top-space-4"
    icon={IconClose}
    onclick={onclose}
    size="icon-xs"
    variant="ghost"
  />
  <div
    class="grid grid-cols-1 gap-space-7 @min-[40rem]:grid-cols-(--band-cols) @min-[40rem]:gap-x-space-8 @min-[40rem]:pe-space-5"
    data-slot="columns"
    style:--band-cols="minmax(0, 3.8fr) minmax(0, 3.4fr) minmax(0, 5fr)"
  >
    <div class="flex min-w-0 flex-col gap-space-7" data-slot="where">
      <PlacesGroup
        {machines}
        {move}
        {onadd}
        {ondrop}
        {onfind}
        {onmove}
        {onreopen}
        {project}
        {standings}
      />
    </div>
    <div class="flex min-w-0 flex-col gap-space-7" data-slot="who">
      <WhoDecidesGroup
        {decides}
        {onreview}
        review={project.review}
        ruleHref="/project/{project.id}/decides"
      />
      <AccountGroup
        account={project.account}
        {accounts}
        atLimit={project.accountAtLimit}
        {onaccount}
        {onatlimit}
      />
    </div>
    <div class="flex min-w-0 flex-col gap-space-7" data-slot="work">
      <TasksKeptGroup
        {onchangestages}
        {onsync}
        {ontracker}
        {syncing}
        {tracker}
      />
      {#if code}
        <LandingGroup lands={project.lands} {onlands} />
        <LargeFilesGroup onpick={onlfs} url={project.lfsUrl} />
      {/if}
    </div>
  </div>
</section>
