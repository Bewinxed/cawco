<script lang="ts">
  /**
   * A project's details as the Standing card holds them (Option 1 of the
   * details' structure): every standing fact with its choices open, the one
   * in force marked, read at a glance and changed where it stands.
   *
   * On a desk it is two columns that share their top edge: Places then
   * Tasks kept on the left, Finished work goes, Account and Large files on
   * the right, so reading and focus order follow the facts' rank down the
   * left column, then the right. As the phone's sheet it is one column in
   * that order. A line that says nothing can start stands over both.
   *
   * The control is the reading: a choice's options show with the one the hub
   * says is in force marked, so each fact is stated once. A pick goes out as
   * an act; while the hub has not answered, the option asked wears a live
   * mark and the one in force keeps its own; a refusal stands under its
   * group in the hub's words with Try again. Groups and rows exist only
   * where they apply: no repository facts on a project with no code, At its
   * limit only with an account named, the tied lines only while tied.
   */
  import { PROJECT_AT_LIMIT } from "@cawco/core/accounts";
  import { LANDS_MODES } from "@cawco/core/injected";
  import { machineLabel } from "@cawco/core/machine-names";
  import {
    TRACKER_NAMES,
    TRACKERS,
    type TrackerView,
  } from "@cawco/core/trackers";
  import cawcoIcon from "#lib/assets/brand/cawco-icon.png";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
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
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import AddPlace from "./AddPlace.svelte";
  import type {
    AccountChoice,
    CantStart,
    Change,
    ConnectionChoice,
    DetailsAct,
    Opened,
    PlaceFolder,
    PlaceLearned,
    PlaceMoving,
    Setting,
  } from "./details";
  import Group from "./Group.svelte";
  import PlaceRow from "./PlaceRow.svelte";
  import { standingWords as words } from "./words";

  let {
    form = "card",
    project,
    machines,
    folders,
    tracker,
    accounts,
    connections = [],
    reading = false,
    change = null,
    cantStart = null,
    opened = null,
    learned = null,
    moving = null,
    onact,
  }: {
    /** `card`: the desk's, two columns side by side; `sheet`: the phone's, one column. */
    form?: "card" | "sheet";
    project: ProjectRow;
    /** The fleet's machines, which name each place's. */
    machines: Machine[];
    /** What each place's machine says of its folder, by place id. */
    folders: Record<string, PlaceFolder>;
    /** Where its tasks are kept, or why that did not read. */
    tracker: TrackerView | { unread: string };
    /** The fleet's accounts, by the name each carries everywhere. */
    accounts: AccountChoice[];
    /** The connections that could sign in to a large-file address. */
    connections?: ConnectionChoice[];
    /** The hub has not said yet: each fact stands as its skeleton. */
    reading?: boolean;
    /** A change asked and not answered, or refused. */
    change?: Change | null;
    cantStart?: CantStart | null;
    opened?: Opened;
    learned?: PlaceLearned | null;
    moving?: PlaceMoving | null;
    onact: (act: DetailsAct) => void;
  } = $props();

  /** The hub is out of reach: what shows was read earlier, and nothing can change. */
  const sunk = $derived(cantStart?.cause === "hub");

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

  const clockAt = (at: number): string =>
    new Date(at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  const cantLine = $derived.by(() => {
    if (!cantStart) {
      return null;
    }
    if (cantStart.cause === "hub") {
      return words.cant.hub(clockAt(cantStart.readAt));
    }
    if (cantStart.cause === "account") {
      const { accountId } = cantStart;
      const name =
        accounts.find((one) => one.id === accountId)?.name ?? accountId;
      return words.cant.account(name);
    }
    const { placeId } = cantStart;
    const place = project.places.find((one) => one.id === placeId);
    const machine = place ? machineOf(place.machineId) : null;
    return words.cant.folder(
      machine ? machineLabel(machine.hostname) : (place?.machineId ?? "")
    );
  });

  /** Each landing's glyph: straight up onto main, a fork, two branches compared, none. */
  const LANDS_GLYPH = {
    main: IconArrowUp,
    branch: IconFork,
    pr: IconCompare,
    none: IconMinus,
  } as const;

  /** The value a pick names, of those offered; undefined when it names none. */
  const pickOf = <T extends string>(
    offered: readonly T[],
    next: string[]
  ): T | undefined => {
    const [picked] = next;
    return offered.find((one) => one === picked);
  };
  /** The option asked of the hub in this setting, while its answer is on its way. */
  const askedIn = (setting: Setting): string | null =>
    change?.setting === setting && change.state === "asked"
      ? change.value
      : null;
  /** The hub's refusal of this setting's change, in its words. */
  const refusedIn = (setting: Setting): string | null =>
    change?.setting === setting && change.state === "refused"
      ? change.reason
      : null;
  /** A pick sent as an act, unless it is the value in force or already asked. */
  function pick(setting: Setting, value: string | undefined, now: string) {
    if (value && value !== now && value !== askedIn(setting)) {
      onact({ kind: "set", setting, value });
    }
  }

  const binding = $derived("binding" in tracker ? tracker.binding : null);
  const trackerNow = $derived("tracker" in tracker ? tracker.tracker : null);
  const accountValue = $derived(project.account ?? "fleet");
  const lfsValue = $derived(
    project.lfsUrl === null && opened?.kind !== "lfs-address" ? "each" : "one"
  );
  const keyed = $derived(connections.filter((one) => one.serves));
</script>

{#snippet askedMark(setting: Setting, value: string)}
  {#if askedIn(setting) === value}
    <LiveDot data-box size="row" />
  {/if}
{/snippet}

{#snippet skeletonRows(rows: number)}
  <div class="flex min-w-0 flex-col gap-space-3">
    {#each Array.from({ length: rows }, (_, at) => at) as row (row)}
      <Skeleton height="control-sm" radius="tile" />
    {/each}
  </div>
{/snippet}

<div
  aria-busy={reading || undefined}
  class={[
    "grid min-w-0 gap-x-space-8 gap-y-space-5 p-space-5",
    form === "card" ? "grid-cols-2" : "grid-cols-1",
  ]}
  data-form={form}
  data-standing-card
>
  {#if cantLine}
    <Alert
      class={form === "card" ? "col-span-2" : undefined}
      variant={sunk ? "default" : "warning"}
    >
      <AlertDescription>{cantLine}</AlertDescription>
      {#if cantStart?.cause === "folder"}
        {@const { placeId } = cantStart}
        <AlertAction>
          <Button
            onclick={() => onact({ kind: "find", placeId })}
            size="sm"
            variant="outline">{words.places.find}</Button
          >
        </AlertAction>
      {:else if cantStart?.cause === "account"}
        <AlertAction>
          <Button
            onclick={() => onact({ kind: "sign-in" })}
            size="sm"
            variant="outline">{words.cant.signIn}</Button
          >
        </AlertAction>
      {/if}
    </Alert>
  {/if}

  <div class="flex min-w-0 flex-col gap-space-5">
    <Group title={words.places.title}>
      {#if reading}
        {@render skeletonRows(3)}
      {:else}
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-5 p-0">
          {#each places as place (place.id)}
            <PlaceRow
              dropping={opened?.kind === "drop" && opened.placeId === place.id}
              folder={folderOf(place.id)}
              learned={learned?.placeId === place.id ? learned : null}
              machine={place.kind === "hub" ? null : machineOf(place.machineId)}
              moving={moving?.placeId === place.id ? moving : null}
              ondrop={(placeId) => onact({ kind: "drop", placeId })}
              ondropped={(placeId) => onact({ kind: "dropped", placeId })}
              onfind={(placeId) => onact({ kind: "find", placeId })}
              onkeep={() => onact({ kind: "close" })}
              onmove={(placeId) => onact({ kind: "move", placeId })}
              onreopen={(placeId) => onact({ kind: "reopen", placeId })}
              {place}
              {sunk}
            />
          {/each}
        </ul>
        {#if opened?.kind === "add-place"}
          <AddPlace
            draft={opened.draft}
            {machines}
            onadd={() => onact({ kind: "added" })}
            oncancel={() => onact({ kind: "close" })}
            ondraft={(draft) => onact({ kind: "draft", draft })}
          />
        {:else}
          <div class="flex min-w-0 flex-wrap items-center gap-space-2">
            <Button
              disabled={sunk}
              onclick={() => onact({ kind: "add-place" })}
              size="sm"
              variant="outline"
            >
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
        {/if}
      {/if}
    </Group>

    <Group title={words.tasks.title}>
      {#if reading}
        <Skeleton height="row" radius="tile" />
      {:else}
        <OptionGroup
          aria-label={words.tasks.title}
          bind:value={
            () => (trackerNow ? [trackerNow] : []),
            (next) => {
              const picked = pickOf(TRACKERS, next);
              if (picked && picked !== trackerNow) {
                onact({ kind: "tracker", tracker: picked });
              }
            }
          }
          disabled={sunk}
          layout="tiles"
          style="--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: repeat(3, minmax(0, 1fr))"
        >
          {#each TRACKERS as one (one)}
            <OptionGroupItem value={one}>
              <!-- mark-line: a tile's mark stands over its name, the way a tile's picture does, so the three names start on one edge -->
              <span class="flex flex-col items-start gap-space-1 type-label">
                {#if one === "cawco"}
                  <img alt="" class="size-icon-md rounded-xs" src={cawcoIcon} />
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
        {#if "unread" in tracker}
          <RowFault
            again={() => onact({ kind: "read-tracker" })}
            againLabel={words.readAgain}
            reason={`${words.tasks.unread} ${tracker.unread}`}
          />
        {/if}
        {#if opened?.kind === "back-to-cawco"}
          <div class="flex min-w-0 flex-col gap-space-2" in:reveal>
            <p class="m-0 type-meta text-ink-strong text-pretty">
              {words.tasks.backAsk}
            </p>
            <div class="flex min-w-0 justify-end gap-space-2">
              <Button
                onclick={() => onact({ kind: "close" })}
                size="xs"
                variant="outline">{words.tasks.backStay}</Button
              >
              <Button
                onclick={() => onact({ kind: "back-to-cawco" })}
                size="xs"
                variant="destructive">{words.tasks.backGo}</Button
              >
            </div>
          </div>
        {/if}
        {#if binding}
          <div class="flex min-w-0 flex-col gap-space-2">
            <div class="flex min-w-0 items-baseline gap-space-3">
              <a
                class="mark-line flex min-w-0 items-center gap-space-1 type-label text-ink-strong underline-offset-4 hover:underline"
                href={binding.targetUrl}
                rel="noreferrer"
                target="_blank"
                ><span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{binding.targetName}</span
                >
                <IconExternalLinear
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-ink-muted"
                  data-box
                /></a
              >
              <span class="ms-auto min-w-0 truncate type-meta text-ink-muted"
                >{binding.connection}</span
              >
            </div>
            <div class="flex min-w-0 items-center gap-space-3">
              <span
                aria-live="polite"
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
                <span class="flex-none text-ink-muted tabular-nums"
                  >{words.tasks.linked(binding.linked)}</span
                >
              </span>
              <Button
                disabled={sunk || binding.state === "syncing"}
                onclick={() => onact({ kind: "sync" })}
                size="xs"
                variant="outline">{words.tasks.syncNow}</Button
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
                    disabled={sunk}
                    onclick={() => onact({ kind: "stages" })}
                    size="xs"
                    tone="quiet"
                    variant="ghost">{words.tasks.change}</Button
                  >
                </span>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </Group>
  </div>

  <div class="flex min-w-0 flex-col gap-space-5">
    {#if holdsCode || reading}
      <Group clause={words.lands.when} title={words.lands.title}>
        {#if reading}
          <Skeleton height="row" radius="tile" />
        {:else}
          <OptionGroup
            aria-label={words.lands.title}
            bind:value={
              () => [project.lands],
              (next) => pick("lands", pickOf(LANDS_MODES, next), project.lands)
            }
            disabled={sunk}
            layout="tiles"
            style="--tiles-cols: repeat(4, minmax(0, 1fr)); --tiles-cols-phone: repeat(4, minmax(0, 1fr))"
          >
            {#each LANDS_MODES as mode (mode)}
              {@const Glyph = LANDS_GLYPH[mode]}
              <OptionGroupItem
                aria-busy={askedIn("lands") === mode || undefined}
                value={mode}
              >
                <!-- mark-line: a tile's glyph stands over its word, so four words fit four narrow tiles -->
                <span class="flex flex-col items-start gap-space-1 type-label">
                  <span class="flex items-center gap-space-2">
                    <Glyph
                      aria-hidden="true"
                      class="size-icon-md flex-none text-ink-muted"
                    />
                    {@render askedMark("lands", mode)}
                  </span>
                  <span>{words.lands.names[mode]}</span>
                </span>
                <span class="type-meta text-pretty text-ink-muted"
                  >{words.lands.notes[mode]}</span
                >
              </OptionGroupItem>
            {/each}
          </OptionGroup>
          <RowFault
            again={() => onact({ kind: "retry" })}
            reason={refusedIn("lands")}
          />
        {/if}
      </Group>
    {/if}

    <Group title={words.account.title}>
      {#if reading}
        {@render skeletonRows(2)}
      {:else}
        <OptionGroup
          aria-label={words.account.title}
          bind:value={
            () => [accountValue],
            (next) => {
              const [picked] = next;
              pick("account", picked, accountValue);
            }
          }
          disabled={sunk}
        >
          <OptionGroupItem
            aria-busy={askedIn("account") === "fleet" || undefined}
            value="fleet"
          >
            <span class="mark-line flex min-w-0 items-center gap-space-2">
              <span>{words.account.fleet}</span>
              {@render askedMark("account", "fleet")}
            </span>
          </OptionGroupItem>
          {#each accounts as account (account.id)}
            <OptionGroupItem
              aria-busy={askedIn("account") === account.id || undefined}
              value={account.id}
            >
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
                {@render askedMark("account", account.id)}
              </span>
            </OptionGroupItem>
          {/each}
        </OptionGroup>
        {#if accounts.length === 0}
          <div class="flex min-w-0 items-center gap-space-3">
            <span class="type-meta text-ink-muted">{words.account.none}</span>
            <Button
              disabled={sunk}
              onclick={() => onact({ kind: "add-account" })}
              size="xs"
              variant="outline">{words.account.addOne}</Button
            >
          </div>
        {/if}
        <RowFault
          again={() => onact({ kind: "retry" })}
          reason={refusedIn("account")}
        />
        {#if project.account}
          <div class="flex min-w-0 flex-col gap-space-2" in:reveal>
            <span class="type-meta text-ink-muted">{words.account.atLimit}</span
            >
            <OptionGroup
              aria-label={words.account.atLimit}
              bind:value={
                () => [project.accountAtLimit],
                (next) =>
                  pick(
                    "atLimit",
                    pickOf(PROJECT_AT_LIMIT, next),
                    project.accountAtLimit
                  )
              }
              disabled={sunk}
              layout="tiles"
              style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
            >
              <OptionGroupItem value="wait">
                <span class="mark-line flex items-center gap-space-2">
                  <span class="type-label">{words.account.wait}</span>
                  {@render askedMark("atLimit", "wait")}
                </span>
                <span class="type-meta text-pretty text-ink-muted"
                  >{words.account.waitNote}</span
                >
              </OptionGroupItem>
              <OptionGroupItem value="move">
                <span class="mark-line flex items-center gap-space-2">
                  <span class="type-label">{words.account.move}</span>
                  {@render askedMark("atLimit", "move")}
                </span>
                <span class="type-meta text-pretty text-ink-muted"
                  >{words.account.moveNote}</span
                >
              </OptionGroupItem>
            </OptionGroup>
            <RowFault
              again={() => onact({ kind: "retry" })}
              reason={refusedIn("atLimit")}
            />
          </div>
        {/if}
      {/if}
    </Group>

    {#if holdsCode && !reading}
      <Group title={words.lfs.title}>
        <OptionGroup
          aria-label={words.lfs.title}
          bind:value={
            () => [lfsValue],
            (next) => {
              const [picked] = next;
              if (picked && picked !== lfsValue) {
                onact(
                  picked === "one"
                    ? { kind: "lfs-draft", url: "", connection: null }
                    : { kind: "set", setting: "lfs", value: "each" }
                );
              }
            }
          }
          disabled={sunk}
          layout="tiles"
          style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(2, minmax(0, 1fr))"
        >
          <OptionGroupItem value="each">
            <span class="type-label">{words.lfs.each}</span>
          </OptionGroupItem>
          <OptionGroupItem value="one">
            <span class="type-label">{words.lfs.one}</span>
            <span class="type-meta text-pretty text-ink-muted"
              >{words.lfs.oneNote}</span
            >
          </OptionGroupItem>
        </OptionGroup>
        {#if opened?.kind === "lfs-address"}
          {@const draft = opened}
          <div class="flex min-w-0 flex-col gap-space-3" in:reveal>
            <Input
              aria-label={words.lfs.address}
              autocomplete="off"
              face="mono"
              oninput={(event) =>
                onact({
                  kind: "lfs-draft",
                  url: event.currentTarget.value,
                  connection: draft.connection,
                })}
              placeholder={words.lfs.addressHint}
              spellcheck="false"
              value={draft.url}
            />
            <div class="flex min-w-0 flex-col gap-space-2">
              <span class="type-meta text-ink-muted"
                >{words.lfs.connection}</span
              >
              {#if keyed.length > 0}
                <OptionGroup
                  aria-label={words.lfs.connection}
                  bind:value={
                    () => (draft.connection ? [draft.connection] : []),
                    (next) => {
                      const [connection] = next;
                      onact({
                        kind: "lfs-draft",
                        url: draft.url,
                        connection: connection ?? null,
                      });
                    }
                  }
                >
                  {#each keyed as connection (connection.name)}
                    <OptionGroupItem value={connection.name}>
                      <span>{connection.name}</span>
                    </OptionGroupItem>
                  {/each}
                </OptionGroup>
              {:else}
                <div class="flex min-w-0 items-center gap-space-3">
                  <span class="type-meta text-ink-muted">{words.lfs.noKey}</span
                  >
                  <Button
                    onclick={() => onact({ kind: "add-connection" })}
                    size="xs"
                    variant="outline">{words.lfs.addConnection}</Button
                  >
                </div>
              {/if}
            </div>
            <div class="flex min-w-0 justify-end">
              <Button
                disabled={!(draft.url.trim() && draft.connection)}
                onclick={() => onact({ kind: "lfs-save" })}
                size="sm"
                variant="outline">{words.lfs.save}</Button
              >
            </div>
          </div>
        {/if}
        <RowFault
          again={() => onact({ kind: "retry" })}
          reason={refusedIn("lfs")}
        />
      </Group>
    {/if}
  </div>
</div>
