<script lang="ts">
  /**
   * A project's details as the Standing card holds them (Option 1 of the
   * details' structure): every standing fact with its choices open, the one
   * in force marked, read at a glance and changed where it stands.
   *
   * On a desk it is two columns that share their top edge: Places then
   * Tasks kept on the left, Who decides, Finished work goes, Account and
   * Large files on the right, so the two leading facts (where it lives and
   * who decides) stand side by side at the top. Reading and focus order run
   * down the left column, then the right. Under the desk line it is one
   * column in that order.
   *
   * The control is the reading: a choice's options show with the one the hub
   * says is in force marked, so each fact is stated once. A pick is sent as
   * an event, and the mark moves when the hub answers through the props.
   * Groups and rows exist only where they apply: no repository facts on a
   * project with no code, At its limit only with an account named, the tied
   * lines only while tied.
   */
  import { PROJECT_AT_LIMIT } from "@cawco/core/accounts";
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import {
    TRACKER_NAMES,
    TRACKERS,
    type Tracker,
    type TrackerView,
  } from "@cawco/core/trackers";
  import { decidesWords } from "@cawco/core/words/decides";
  import cawcoIcon from "#lib/assets/brand/cawco-icon.png";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import {
    IconAdd,
    IconArrowUp,
    IconCompare,
    IconError,
    IconExternalLinear,
    IconFork,
    IconMinus,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { AccountChoice, DecidesStanding, PlaceFolder } from "./details";
  import Group from "./Group.svelte";
  import PlaceRow from "./PlaceRow.svelte";
  import { standingWords as words } from "./words";

  type AtLimit = ProjectRow["accountAtLimit"];

  let {
    project,
    machines,
    folders,
    decides,
    tracker,
    accounts,
    onmove,
    onfind,
    ondrop,
    onaddplace,
    onopendecides,
    onreview,
    ontracker,
    onsync,
    onstages,
    onlands,
    onaccount,
    onatlimit,
    onlfs,
  }: {
    project: ProjectRow;
    /** The fleet's machines, which name each place's. */
    machines: Machine[];
    /** What each place's machine says of its folder, by place id. */
    folders: Record<string, PlaceFolder>;
    decides: DecidesStanding;
    tracker: TrackerView;
    /** The fleet's accounts, by the name each carries everywhere. */
    accounts: AccountChoice[];
    onmove: (placeId: string) => void;
    onfind: (placeId: string) => void;
    ondrop: (placeId: string) => void;
    onaddplace: () => void;
    onopendecides: () => void;
    onreview: (on: boolean) => void;
    ontracker: (tracker: Tracker) => void;
    onsync: () => void;
    onstages: () => void;
    onlands: (lands: LandsMode) => void;
    /** An account by id, or null for the fleet's routing. */
    onaccount: (accountId: string | null) => void;
    onatlimit: (atLimit: AtLimit) => void;
    /** One address picked: its form opens under it. Each repository's own: the address is cleared. */
    onlfs: (one: boolean) => void;
  } = $props();

  /** Its checkouts first, where work starts leading, then its folder on the hub. */
  const places = $derived(
    [...project.places].sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        Number(a.kind === "hub") - Number(b.kind === "hub")
    )
  );
  /** It holds code: it links a repository, or has a place on a machine. */
  const holdsCode = $derived(
    project.links.length > 0 ||
      project.places.some((place) => place.kind === "checkout")
  );
  const machineOf = (machineId: string): Machine | null =>
    machines.find((row) => row.machineId === machineId) ?? null;
  const folderOf = (placeId: string): PlaceFolder =>
    folders[placeId] ?? { missing: false, made: false };

  /** A link's `owner/repo`, from its `host/owner/repo`. */
  const repoName = (link: string): string => link.split("/").slice(1).join("/");

  const binding = $derived(tracker.binding);
  const clockAt = (at: number): string =>
    new Date(at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  /** Each landing's glyph: straight up onto main, a fork, two branches compared, none. */
  const LANDS_GLYPH = {
    main: IconArrowUp,
    branch: IconFork,
    pr: IconCompare,
    none: IconMinus,
  } as const;

  const standingLine = $derived.by(() => {
    if (decides.state === "unread") {
      return words.decides.unread;
    }
    if (decides.state === "fleet") {
      return words.decides.fleet;
    }
    return words.decides.own(
      decides.kinds.filter((one) => one.own).length,
      decides.kinds.length
    );
  });

  /** The option a group's pick names, of those it offers; undefined when it names none. */
  const pickOf = <T extends string>(
    offered: readonly T[],
    next: string[]
  ): T | undefined => {
    const [picked] = next;
    return offered.find((one) => one === picked);
  };

  const accountValue = $derived(project.account ?? "fleet");
  const lfsValue = $derived(project.lfsUrl === null ? "each" : "one");
</script>

<div
  class="grid min-w-0 grid-cols-1 gap-x-space-8 gap-y-space-7 p-space-5 desk:grid-cols-2"
  data-standing-card
>
  <div class="flex min-w-0 flex-col gap-space-7">
    <Group title={words.places.title}>
      <ul class="m-0 flex min-w-0 list-none flex-col gap-space-5 p-0">
        {#each places as place (place.id)}
          <PlaceRow
            folder={folderOf(place.id)}
            machine={place.kind === "hub" ? null : machineOf(place.machineId)}
            {ondrop}
            {onfind}
            {onmove}
            {place}
          />
        {/each}
      </ul>
      <div class="flex min-w-0 flex-wrap items-center gap-space-2">
        <Button onclick={onaddplace} size="sm" variant="outline">
          <IconAdd aria-hidden="true" data-box />
          <span>{words.places.add}</span>
        </Button>
        {#each project.links as link (link)}
          <a
            aria-label={words.places.openRepo(repoName(link))}
            class={chipVariants({ variant: "setting" })}
            href={`https://${link}`}
            rel="noreferrer"
            target="_blank"
          >
            <ProviderLogo provider="github" />
            <span data-slot="chip-label">{repoName(link)}</span>
          </a>
        {/each}
      </div>
    </Group>

    <Group title={words.tasks.title}>
      <OptionGroup
        aria-label={words.tasks.title}
        bind:value={
          () => [tracker.tracker],
          (next) => {
            const picked = pickOf(TRACKERS, next);
            if (picked && picked !== tracker.tracker) {
              ontracker(picked);
            }
          }
        }
        layout="tiles"
        style="--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: repeat(3, minmax(0, 1fr))"
      >
        {#each TRACKERS as one (one)}
          <OptionGroupItem value={one}>
            <span class="mark-line flex items-center gap-space-2 type-label">
              {#if one === "cawco"}
                <img
                  alt=""
                  class="size-icon-md rounded-xs"
                  data-box
                  src={cawcoIcon}
                />
              {:else}
                <ProviderLogo provider={one} />
              {/if}
              <span>{TRACKER_NAMES[one]}</span>
            </span>
            <span class="type-meta text-pretty text-ink-muted"
              >{words.tasks.notes[one]}</span
            >
          </OptionGroupItem>
        {/each}
      </OptionGroup>
      {#if binding}
        <div class="flex min-w-0 flex-col gap-space-2">
          <div class="flex min-w-0 items-baseline gap-space-3">
            <a
              class="min-w-0 truncate type-label text-ink-strong underline-offset-4 hover:underline"
              href={binding.targetUrl}
              rel="noreferrer"
              target="_blank">{binding.targetName}</a
            >
            <span class="min-w-0 truncate type-meta text-ink-muted"
              >{binding.connection}</span
            >
            <span
              class="ms-auto flex-none type-meta text-ink-muted tabular-nums"
              >{words.tasks.linked(binding.linked)}</span
            >
          </div>
          <div class="flex min-w-0 items-center gap-space-3">
            <span
              class="mark-line flex min-w-0 flex-auto items-center gap-space-2 type-meta"
            >
              {#if binding.state === "syncing"}
                <LiveDot data-box size="row" />
                <span class="text-ink-strong">{words.tasks.syncing}</span>
              {:else if binding.state === "synced"}
                <IconSuccess
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-status-done-ink"
                  data-box
                />
                <span class="text-ink-strong"
                  >{words.tasks.synced(
                    clockAt(binding.polledAt ?? binding.boundAt)
                  )}</span
                >
              {:else}
                <IconError
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-status-fail-ink"
                  data-box
                />
                <span class="min-w-0 text-pretty text-status-fail-ink"
                  >{words.tasks.refused}: {binding.reason}</span
                >
              {/if}
            </span>
            <Button onclick={onsync} size="xs" variant="outline"
              >{words.tasks.syncNow}</Button
            >
          </div>
          {#if binding.provider === "github"}
            <div class="flex min-w-0 items-center gap-space-3 type-meta">
              {#if binding.githubProject}
                <span class="flex-none text-ink-muted"
                  >{words.tasks.stagesOn}</span
                >
                <a
                  class="mark-line flex min-w-0 items-center gap-space-1 text-ink-strong underline-offset-4 hover:underline"
                  href={binding.githubProject.url}
                  rel="noreferrer"
                  target="_blank"
                  ><span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{binding.githubProject.title}</span
                  >
                  <IconExternalLinear
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-ink-muted"
                    data-box
                  /></a
                >
              {:else}
                <span class="min-w-0 text-pretty text-ink-muted"
                  >{binding.githubProjectReason}</span
                >
              {/if}
              <span class="ms-auto flex-none">
                <Button
                  onclick={onstages}
                  size="xs"
                  tone="quiet"
                  variant="ghost">{words.tasks.change}</Button
                >
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </Group>
  </div>

  <div class="flex min-w-0 flex-col gap-space-7">
    <Group title={words.decides.title}>
      {#snippet act()}
        <Button onclick={onopendecides} size="xs" tone="quiet" variant="ghost"
          >{words.decides.open}</Button
        >
      {/snippet}
      <p class="m-0 type-row text-ink-strong">{standingLine}</p>
      {#if decides.state === "unread"}
        <div
          class="mark-line flex min-w-0 items-center gap-space-2 type-meta text-status-fail-ink"
        >
          <IconWarningTriangle
            aria-hidden="true"
            class="size-icon-sm flex-none"
            data-box
          />
          <span class="min-w-0 text-pretty"
            >{words.decides.unreadWhy} {decides.reason}</span
          >
        </div>
      {:else}
        <!-- Three fixed columns: the kind, who settles it (a sunk chip,
             each starting on one edge), and the project's own mark. -->
        <dl class="m-0 flex min-w-0 flex-col gap-space-1">
          {#each decides.kinds as one (one.kind)}
            <div class="flex min-w-0 items-center gap-space-3">
              <dt
                class="w-40 min-w-0 flex-none truncate type-label text-ink-row"
              >
                {decidesWords.kinds[one.kind].name}
              </dt>
              <dd class="m-0 min-w-0 flex-auto">
                <span
                  class={chipVariants({ variant: "setting" })}
                  data-variant="static"
                  ><span data-slot="chip-label"
                    >{decidesWords[one.by].name}</span
                  ></span
                >
              </dd>
              <dd
                class="m-0 w-space-8 flex-none text-end type-meta text-ink-muted"
              >
                {#if one.own}{words.decides.ownMark}{/if}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
      <label class="flex min-w-0 items-start gap-space-3 pt-space-1">
        <Switch
          checked={project.review}
          onCheckedChange={(on) => onreview(on)}
        />
        <span class="flex min-w-0 flex-col">
          <span class="type-label text-ink-strong">{words.decides.review}</span>
          <span class="type-meta text-ink-muted"
            >{words.decides.reviewNote}</span
          >
        </span>
      </label>
    </Group>

    {#if holdsCode}
      <Group clause={words.lands.when} title={words.lands.title}>
        <OptionGroup
          aria-label={words.lands.title}
          bind:value={
            () => [project.lands],
            (next) => {
              const picked = pickOf(LANDS_MODES, next);
              if (picked && picked !== project.lands) {
                onlands(picked);
              }
            }
          }
          layout="tiles"
          style="--tiles-cols: repeat(4, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
        >
          {#each LANDS_MODES as mode (mode)}
            {@const Glyph = LANDS_GLYPH[mode]}
            <OptionGroupItem value={mode}>
              <span class="mark-line flex items-center gap-space-2 type-label">
                <Glyph
                  aria-hidden="true"
                  class="size-icon-md flex-none text-ink-muted"
                  data-box
                />
                <span>{words.lands.names[mode]}</span>
              </span>
              <span class="type-meta text-pretty text-ink-muted"
                >{words.lands.notes[mode]}</span
              >
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      </Group>
    {/if}

    <Group title={words.account.title}>
      <OptionGroup
        aria-label={words.account.title}
        bind:value={
          () => [accountValue],
          (next) => {
            const [picked] = next;
            if (picked && picked !== accountValue) {
              onaccount(picked === "fleet" ? null : picked);
            }
          }
        }
      >
        <OptionGroupItem value="fleet">
          <span>{words.account.fleet}</span>
        </OptionGroupItem>
        {#each accounts as account (account.id)}
          <OptionGroupItem value={account.id}>
            <span class="mark-line flex min-w-0 items-center gap-space-2">
              <ProviderLogo provider={account.provider} size="meta" />
              <span>{account.name}</span>
              {#if !account.signedIn}
                <IconWarningTriangle
                  aria-label={words.account.signedOut}
                  class="size-icon-sm text-status-fail-ink"
                  data-box
                />
              {/if}
            </span>
          </OptionGroupItem>
        {/each}
      </OptionGroup>
      {#if project.account}
        <div class="flex min-w-0 flex-col gap-space-2">
          <span class="type-meta text-ink-muted">{words.account.atLimit}</span>
          <OptionGroup
            aria-label={words.account.atLimit}
            bind:value={
              () => [project.accountAtLimit],
              (next) => {
                const picked = pickOf(PROJECT_AT_LIMIT, next);
                if (picked && picked !== project.accountAtLimit) {
                  onatlimit(picked);
                }
              }
            }
            layout="tiles"
            style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
          >
            <OptionGroupItem value="wait">
              <span class="type-label">{words.account.wait}</span>
              <span class="type-meta text-pretty text-ink-muted"
                >{words.account.waitNote}</span
              >
            </OptionGroupItem>
            <OptionGroupItem value="move">
              <span class="type-label">{words.account.move}</span>
              <span class="type-meta text-pretty text-ink-muted"
                >{words.account.moveNote}</span
              >
            </OptionGroupItem>
          </OptionGroup>
        </div>
      {/if}
    </Group>

    {#if holdsCode}
      <Group title={words.lfs.title}>
        <OptionGroup
          aria-label={words.lfs.title}
          bind:value={
            () => [lfsValue],
            (next) => {
              const [picked] = next;
              if (picked && picked !== lfsValue) {
                onlfs(picked === "one");
              }
            }
          }
          layout="tiles"
          style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
        >
          <OptionGroupItem value="each">
            <span class="type-label">{words.lfs.each}</span>
            <span class="type-meta text-pretty text-ink-muted"
              >{words.lfs.eachNote}</span
            >
          </OptionGroupItem>
          <OptionGroupItem value="one">
            <span class="type-label">{words.lfs.one}</span>
            <span class="type-meta text-pretty text-ink-muted"
              >{words.lfs.oneNote}</span
            >
          </OptionGroupItem>
        </OptionGroup>
      </Group>
    {/if}
  </div>
</div>
