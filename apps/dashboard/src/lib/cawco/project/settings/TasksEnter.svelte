<script lang="ts">
  import { repoIdentity, repoPath } from "@cawco/core/protocol";
  import {
    TRACKER_DIRECTIONS,
    type TrackerDirection,
  } from "@cawco/core/trackers";
  import { boardStatusWords } from "@cawco/core/words/board-statuses";
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  import { untrack } from "svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import RepoPicker from "#lib/cawco/spawn/RepoPicker.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  /**
   * Task sync: the three homes for the project's tasks as the view's one
   * pick (PickTiles), each led by its mark (CawCo's own
   * files, GitHub's and Linear's own logos); while tied to one, how the two
   * sides stand above them; and pressed on GitHub or Linear, the tie's setup
   * opening under the tiles, its sign-ins, repositories, teams and GitHub
   * Projects read from the hub as it asks (`setup`), and which way it
   * syncs: both ways, or into CawCo only, which writes nothing to the
   * tracker. Linking a GitHub Project matches the board's columns to its
   * Status options by name, and on a tie both ways the hub adds any it
   * lacks. Files moves at the press (changes.ts
   * `withAsked`); GitHub or Linear moves at the setup's Save. A refusal
   * puts it back and stands under the tiles (RowFault). Under them, one
   * row's switch holds outsiders' issues and comments in Needs you, or lets
   * them start sessions (the project's `outsiders`); it moves at the press.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconDocument,
    IconDownload,
    IconError,
    IconExternalLinear,
    IconRefresh,
    IconSettings,
    IconShield,
    IconTransfer,
    IconWorking,
  } from "#lib/icons.js";
  import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import type { Change, ChangeKey, SetupConnection, TieSetup } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import PickTiles from "./PickTiles.svelte";
  import type { SettingsRecord, TaskHome } from "./records";

  let {
    record,
    pending,
    refused,
    syncing,
    onchange,
    onretry,
    onsync,
    hrefOf,
    setup,
    opening = null,
  }: {
    record: SettingsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    syncing: boolean;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onsync: () => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
    /** What the tie's setup reads from the hub. */
    setup: TieSetup;
    /** The tie's setup standing open as it mounts: a states file reads it without the press. */
    opening?: "github" | "linear" | "files" | null;
  } = $props();

  const uid = $props.id();
  const HOMES: readonly TaskHome[] = ["files", "github", "linear"];
  const NONE_PROJECT = "__none__";

  /** The tie's setup standing open, for GitHub or Linear: the pick shows it from the press. */
  let setupHome = $derived<"github" | "linear" | null>(
    opening === "files" ? null : opening
  );
  /** The tiles' order, which way a swap between their setups moves. */
  const TILE_AT = { github: 1, linear: 2 } as const;
  /** Which way the last swap between the two setups went along the tiles: 1 rightward, -1 leftward, 0 for none. */
  let setupDir = 0;
  let setupWas = untrack(() => setupHome);
  $effect.pre(() => {
    const next = setupHome;
    if (next !== setupWas) {
      const was = setupWas;
      setupDir =
        next !== null && was !== null
          ? Math.sign(TILE_AT[next] - TILE_AT[was])
          : 0;
      setupWas = next;
    }
  });
  /**
   * The setup arriving glides in from the side of the tile picked, as a
   * conversation does when its tab is switched (workspace/PaneLeaf: a
   * `--swap-nudge` toward the new side over `--duration-pop` on the drawer
   * curve); the one it replaces goes at once.
   */
  const setupIn = (node: HTMLElement) => {
    const dir = setupDir;
    if (!(dir && motionOk.current)) {
      return;
    }
    const rtl = getComputedStyle(node).direction === "rtl" ? -1 : 1;
    node.animate(
      [
        {
          transform: `translateX(calc(var(--swap-nudge) * ${dir * rtl}))`,
          opacity: 0.4,
        },
        { transform: "none", opacity: 1 },
      ],
      { duration: dur("--duration-pop"), easing: ease("--ease-drawer") }
    );
  };
  /** Leaving a tie for the project's own files, asked and not yet answered: the press first says what it stops (DESIGN.md, ceremony matches consequence). */
  let leaving = $derived(opening === "files");
  let connectionPick = $state<string | null>(null);
  /** The Linear team picked; null for the first. */
  let teamPick = $state<string | null>(null);
  /** The GitHub repository picked, by its git URL; "" for the project's own. */
  let repoPick = $state("");
  /** The GitHub Project picked; null for the first the repository links. */
  let githubProjectPick = $state<string | null>(null);
  /** Which way the tie syncs, as picked; null for the tie's own, else both ways. */
  let directionPick = $state<TrackerDirection | null>(null);

  const disabled = $derived(!record.hubReachable);
  const syncPending = $derived(syncing || pending.includes("sync"));
  const tie = $derived(record.tie);

  /** The sign-ins the tracker open in the setup can use, as the hub listed them. */
  const connectionsRead = $derived(
    setupHome ? setup.connections[setupHome] : undefined
  );
  const setupConnections = $derived<SetupConnection[]>(
    connectionsRead?.state === "read" ? connectionsRead.value : []
  );
  // Each read is asked as the setup comes to need it, never again from
  // its own answer: the read's state is the setup's, not the effect's.
  $effect(() => {
    const home = setupHome;
    if (home) {
      untrack(() => setup.read({ kind: "connections", home }));
    }
  });

  /** The sign-in the tie takes: the one picked, else the tie's own, else the first. */
  const activeConnectionId = $derived.by(() => {
    const names = setupConnections.map((conn) => conn.name);
    if (connectionPick && names.includes(connectionPick)) {
      return connectionPick;
    }
    const tied = tie?.home === setupHome ? tie?.connection.name : undefined;
    return tied && names.includes(tied) ? tied : (names[0] ?? null);
  });

  /** The project's own repositories, by identity: the picker marks their rows. */
  const projectRepos = $derived(
    new Set(record.repos.map((repo) => repoIdentity(repo.url)))
  );
  /** The repository the tie takes: the one picked, else the tie's own, else the project's own. */
  const activeRepo = $derived.by(() => {
    if (repoPick) {
      return repoPick;
    }
    if (tie?.home === "github") {
      return `https://github.com/${tie.target.id}.git`;
    }
    return record.repos[0]?.url ?? "";
  });
  /** The picked repository as GitHub names it, `owner/name`; "" while none is. */
  const activeRepoName = $derived(activeRepo ? repoPath(activeRepo) : "");
  const markOwn = (repo: { url: string }): string =>
    projectRepos.has(repoIdentity(repo.url)) ? words.tasks.projectRepoTag : "";

  /** The Linear teams the sign-in reaches. */
  const teamsRead = $derived(
    setupHome === "linear" && activeConnectionId
      ? setup.teams[activeConnectionId]
      : undefined
  );
  const teams = $derived(teamsRead?.state === "read" ? teamsRead.value : []);
  $effect(() => {
    const connection = activeConnectionId;
    if (setupHome === "linear" && connection) {
      untrack(() => setup.read({ kind: "teams", connection }));
    }
  });
  const activeTeamId = $derived.by(() => {
    if (teamPick && teams.some((team) => team.id === teamPick)) {
      return teamPick;
    }
    const tied = tie?.home === "linear" ? tie.target.id : undefined;
    return tied && teams.some((team) => team.id === tied)
      ? tied
      : (teams[0]?.id ?? null);
  });
  const activeConnection = $derived(
    setupConnections.find((conn) => conn.name === activeConnectionId) ?? null
  );

  /** The GitHub Projects the sign-in reaches for the repository. */
  const projectsKey = $derived(
    setupHome === "github" && activeConnectionId && activeRepoName
      ? `${activeConnectionId} ${activeRepoName}`
      : ""
  );
  const projectsRead = $derived(
    projectsKey ? setup.projects[projectsKey] : undefined
  );
  const githubProjects = $derived(
    projectsRead?.state === "read" ? projectsRead.value.projects : []
  );
  $effect(() => {
    const connection = activeConnectionId;
    const repo = activeRepoName;
    if (setupHome === "github" && connection && repo) {
      untrack(() => setup.read({ kind: "projects", connection, repo }));
    }
  });
  /** The Project the tie takes: the one picked, else the first linked to the repository, else open and closed only. */
  const activeProject = $derived.by(() => {
    if (
      githubProjectPick === NONE_PROJECT ||
      (githubProjectPick !== null &&
        githubProjects.some((one) => one.id === githubProjectPick))
    ) {
      return githubProjectPick;
    }
    return githubProjects.find((one) => one.linked)?.id ?? NONE_PROJECT;
  });

  /** Which way the tie syncs: the one picked, else the tie's own, else both ways. */
  const activeDirection = $derived<TrackerDirection>(
    directionPick ?? (tie?.home === setupHome ? tie.direction : "both")
  );

  const canSaveTie = $derived(
    !disabled &&
      setupHome !== null &&
      activeConnectionId !== null &&
      (setupHome === "github" ? activeRepoName !== "" : activeTeamId !== null)
  );

  function openSetup(home: "github" | "linear") {
    setupHome = home;
    connectionPick = null;
    teamPick = null;
    repoPick = "";
    githubProjectPick = null;
    directionPick = null;
  }

  function closeSetup() {
    setupHome = null;
  }

  function handleHomeClick(home: TaskHome) {
    if (disabled) {
      return;
    }
    if (home === "files") {
      closeSetup();
      if (record.tie !== null) {
        // A tie stops: said first, with what it reaches.
        leaving = true;
      } else if (record.taskHome !== "files") {
        onchange({ key: "taskHome", value: "files" });
      }
      return;
    }
    leaving = false;
    if (record.taskHome === home && record.tie?.home === home) {
      // Already tied to this home: toggle the inline setup to adjust its target.
      if (setupHome === home) {
        closeSetup();
      } else {
        openSetup(home);
      }
      return;
    }
    openSetup(home);
  }

  function leaveTie() {
    leaving = false;
    if (!disabled) {
      onchange({ key: "taskHome", value: "files" });
    }
  }

  function saveTie() {
    const target = setupHome === "github" ? activeRepoName : activeTeamId;
    if (!(canSaveTie && setupHome && activeConnectionId && target)) {
      return;
    }
    onchange({
      key: "tie",
      value: {
        home: setupHome,
        connection: activeConnectionId,
        target,
        direction: activeDirection,
        githubProject:
          setupHome === "github" && activeProject !== NONE_PROJECT
            ? activeProject
            : null,
      },
    });
    closeSetup();
  }

  function formatAge(iso: string): string {
    return formatDistanceToNow(new Date(iso));
  }

  /** The tie's quieter facts: whose sign-in, how many tasks it holds, where its columns come from. */
  const tieMeta = $derived.by(() => {
    if (!tie) {
      return "";
    }
    const board = tie.home === "github" ? tie.githubProject : null;
    let columns: string | null = null;
    if (board !== null) {
      columns =
        "url" in board
          ? `${words.tasks.stagesVia} ${board.name}`
          : `${words.tasks.stagesNone} ${board.none}`;
    }
    const inStep =
      tie.sync.kind === "inStep" && !syncPending
        ? words.tasks.inStep(formatAge(tie.sync.at))
        : null;
    return [
      inStep,
      `${tie.connection.name} (${tie.connection.account})`,
      words.tasks.directions[tie.direction].name,
      words.tasks.linkedCount(tie.linked),
      columns,
    ]
      .filter((fact) => fact !== null)
      .join(", ");
  });
</script>

{#snippet directionGlyph(direction: TrackerDirection)}
  {#if direction === "both"}
    <IconTransfer aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconDownload aria-hidden="true" class="size-icon-md text-ink-muted" />
  {/if}
{/snippet}

{#snippet homeGlyph(home: TaskHome)}
  {#if home === "files"}
    <IconDocument aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <ProviderLogo provider={home} />
  {/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-space-3">
  {#if tie}
    <!-- The tie as a connected thing's row (ConnectionsSection's sign-ins):
         where tasks sync, by whose sign-in, how the two sides stand; Sync
         now at its end, the rest of its acts in its ⋯. -->
    <RowList label={words.tasks.groupLabel}>
      <SectionRow
        actions={[
          {
            label: words.tasks.changeTie,
            icon: IconSettings,
            disabled,
            onselect: () =>
              setupHome === tie.home ? closeSetup() : openSetup(tie.home),
          },
          {
            label: tie.target.label,
            icon: IconExternalLinear,
            onselect: () => {
              window.open(tie.target.url, "_blank", "noopener");
            },
          },
        ]}
        meta={tieMeta}
        mono
        name={tie.target.label}
        whole
      >
        {#snippet tile()}
          <ProviderLogo provider={tie.home} />
        {/snippet}
        {#snippet badge()}
          {#if syncPending || tie.sync.kind === "syncing"}
            <Badge variant="live"
              ><IconWorking aria-hidden="true" /><span
                >{words.tasks.syncing}</span
              ></Badge
            >
          {:else if tie.sync.kind === "first"}
            <Badge variant="live"
              ><IconWorking aria-hidden="true" /><span
                >{words.tasks.firstSync}</span
              ></Badge
            >
          {:else if tie.sync.kind === "refused"}
            <Badge variant="fail"
              ><IconError aria-hidden="true" /><span
                >{words.tasks.syncRefused(formatAge(tie.sync.at))}</span
              ></Badge
            >
          {/if}
        {/snippet}
        {#snippet trailing()}
          <Button
            {disabled}
            icon={IconRefresh}
            label={words.tasks.syncNow}
            onclick={onsync}
            pending={syncPending}
            pendingLabel={words.tasks.syncing}
            size="sm"
            variant="outline"
          />
        {/snippet}
        {#snippet below()}
          {#if tie.sync.kind === "refused" && !syncPending}
            <RowFault
              again={onsync}
              againLabel={words.tryAgain}
              reason={tie.sync.words}
            />
          {/if}
          {#if tie.statusesAdded && tie.githubProject && "name" in tie.githubProject}
            <!-- The Status options the hub last added to the Project: told on the tie, never in the Caw chat. -->
            <div class="flex min-w-0 flex-col gap-space-1">
              <p class="m-0 min-w-0 type-meta text-pretty text-ink-strong">
                {boardStatusWords.addedTitle(
                  tie.githubProject.name,
                  tie.statusesAdded.options
                )}
              </p>
              <p class="m-0 min-w-0 type-meta text-pretty text-ink-muted">
                {boardStatusWords.addedBody(
                  tie.githubProject.name,
                  tie.statusesAdded.options.length
                )}
              </p>
            </div>
          {/if}
          {#if tie.statusesRefused && !syncPending}
            <!-- GitHub refused a Status option for a column its Project lacks: Sync now asks again. -->
            <RowFault
              again={onsync}
              againLabel={words.tryAgain}
              reason={tie.statusesRefused}
            />
          {/if}
          <RowFault
            again={() => onretry("sync")}
            againLabel={words.retryChange}
            reason={refused.sync}
          />
        {/snippet}
      </SectionRow>
    </RowList>
  {/if}

  <PickTiles
    cols={3}
    {disabled}
    glyph={homeGlyph}
    label={words.tasks.groupLabel}
    onpick={handleHomeClick}
    options={HOMES.map((home) => {
      const { name, ...rest } = words.tasks.homes[home];
      return { id: home, name, ...("note" in rest ? { note: rest.note } : {}) };
    })}
    value={leaving ? "files" : (setupHome ?? record.taskHome)}
  />
  <RowFault
    again={() => onretry("taskHome")}
    againLabel={words.retryChange}
    reason={refused.taskHome}
  />

  {#if leaving && tie}
    <!-- Leaving the tie for the project's own files: the house's opened
         form says what it does and the tie it stops before the press. -->
    <section
      aria-labelledby="{uid}-leave"
      class={OPENED_FORM}
      data-slot="leave-tie"
      transition:unfold
    >
      <div class="flex min-w-0 flex-col gap-space-1">
        <p class="m-0 type-label text-ink-strong" id="{uid}-leave">
          {words.tasks.leaveTie.says(words.tasks.homes[tie.home].name)}
        </p>
        <p class="m-0 type-meta text-pretty text-ink-muted">
          {words.tasks.leaveTie.keeps(words.tasks.site[tie.home])}
        </p>
      </div>
      <p class="mark-line m-0 flex min-w-0 items-center gap-space-2 type-meta">
        <ProviderLogo class="flex-none" provider={tie.home} />
        <span class="min-w-0 type-code wrap-anywhere text-ink-strong"
          >{tie.target.label}</span
        >
        <span class="flex-none text-ink-muted num"
          >{words.tasks.linkedCount(tie.linked)}</span
        >
      </p>
      <div class="flex justify-end gap-space-2">
        <Button
          label={words.cancel}
          onclick={() => {
            leaving = false;
          }}
          size="sm"
          variant="ghost"
        />
        <Button
          {disabled}
          label={words.tasks.leaveTie.act}
          onclick={leaveTie}
          size="sm"
        />
      </div>
    </section>
  {/if}

  {#if setupHome !== null}
    <!-- The tie's setup, unfolding from its tile: the house's opened form
         (opened-form.ts), its head the service it ties to. -->
    <section
      aria-labelledby="{uid}-setup"
      class={OPENED_FORM}
      data-slot="setup-asks"
      transition:unfold
    >
      <!-- GitHub's setup and Linear's swap as a conversation's tabs do: the
           new one glides in from the tile's side (setupIn), and the form's
           height follows it (motion/morph). -->
      <div class="relative min-w-0" {@attach morph()}>
        {#key setupHome}
          <div class="flex min-w-0 flex-col gap-space-5" {@attach setupIn}>
            <div class="flex min-w-0 flex-col gap-space-1">
              <p
                class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
                id="{uid}-setup"
              >
                <ProviderLogo class="flex-none" provider={setupHome} />
                <span>{words.tasks.setupTitle(setupHome)}</span>
              </p>
              <p class="m-0 type-meta text-pretty text-ink-muted">
                {words.tasks.setupFieldsNote}
              </p>
            </div>

            <!-- Sign-in: its label's row holds the way to manage them, trailing. -->
            <div class={FORM_FIELD}>
              <div
                class="flex min-w-0 items-center justify-between gap-space-2"
              >
                <p class={FORM_LABEL} id="{uid}-connection">
                  {words.tasks.connectionLabel}
                </p>
                {#if setupConnections.length > 0}
                  <Button
                    class="-my-space-1"
                    href={hrefOf("connections")}
                    label={words.tasks.openConnections}
                    size="xs"
                    tone="quiet"
                    variant="ghost"
                  />
                {/if}
              </div>
              {#if connectionsRead?.state === "failed"}
                <RowFault
                  again={() =>
                    setupHome &&
                    setup.read({ kind: "connections", home: setupHome })}
                  reason={connectionsRead.reason}
                />
              {:else if connectionsRead?.state !== "read"}
                <Skeleton class="w-full" height="control-sm" radius="chip" />
              {:else if setupConnections.length === 0}
                <!-- Said on the form's own ground, the way on beside it. -->
                <div class="flex min-w-0 flex-wrap items-center gap-space-2">
                  <p
                    class="m-0 min-w-0 flex-auto type-meta text-pretty text-ink-muted"
                  >
                    {words.tasks.noConnection(setupHome)}
                  </p>
                  <Button
                    href={hrefOf("connections")}
                    label={words.tasks.openConnections}
                    size="sm"
                    variant="outline"
                  />
                </div>
              {:else}
                <OptionGroup
                  aria-labelledby="{uid}-connection"
                  {disabled}
                  glide
                  value={activeConnectionId ? [activeConnectionId] : []}
                >
                  {#each setupConnections as conn (conn.name)}
                    <OptionGroupItem
                      onclick={(event) => {
                        event.preventDefault();
                        connectionPick = conn.name;
                      }}
                      value={conn.name}
                    >
                      <span>{conn.name}</span>
                      <span class="type-meta text-ink-muted"
                        >{conn.account}</span
                      >
                    </OptionGroupItem>
                  {/each}
                </OptionGroup>
              {/if}
            </div>

            <!-- Repository (GitHub): the New session form's repository picker, on
           the connection's account; Team (Linear): its few teams as one pick. -->
            {#if setupConnections.length > 0}
              {#if setupHome === "github" && activeConnection}
                <div class={FORM_FIELD} inert={disabled}>
                  <p class={FORM_LABEL}>{words.tasks.repoLabel}</p>
                  <!-- The house's repository picker, on the sign-in's own
                       repositories (its `source`), never a machine's. -->
                  <RepoPicker
                    machineId="connection:{activeConnection.name}"
                    machineName={activeConnection.name}
                    mark={markOwn}
                    onrepo={(url) => {
                      repoPick = url;
                      githubProjectPick = null;
                    }}
                    repo={activeRepo}
                    source={setup.repos}
                  />
                </div>
              {:else if setupHome === "linear"}
                <div class={FORM_FIELD}>
                  <p class={FORM_LABEL} id="{uid}-team">
                    {words.tasks.teamLabel}
                  </p>
                  {#if teamsRead?.state === "failed"}
                    <RowFault
                      again={() =>
                        activeConnectionId &&
                        setup.read({
                          kind: "teams",
                          connection: activeConnectionId,
                        })}
                      reason={teamsRead.reason}
                    />
                  {:else if teamsRead?.state !== "read"}
                    <Skeleton
                      class="w-full"
                      height="control-sm"
                      radius="chip"
                    />
                  {:else}
                    <OptionGroup
                      aria-labelledby="{uid}-team"
                      {disabled}
                      glide
                      value={activeTeamId ? [activeTeamId] : []}
                    >
                      {#each teams as team (team.id)}
                        <OptionGroupItem
                          onclick={(event) => {
                            event.preventDefault();
                            teamPick = team.id;
                          }}
                          value={team.id}
                        >
                          <span>{team.label}</span>
                        </OptionGroupItem>
                      {/each}
                    </OptionGroup>
                  {/if}
                </div>
              {/if}

              <!-- Which way it syncs: each way says what it sends to the
                   site, so both stand side by side (PickTiles). -->
              <div class={FORM_FIELD}>
                <p class={FORM_LABEL} id="{uid}-direction">
                  {words.tasks.directionLabel}
                </p>
                <PickTiles
                  cols={2}
                  {disabled}
                  glyph={directionGlyph}
                  label={words.tasks.directionLabel}
                  onpick={(next) => {
                    directionPick = next;
                  }}
                  options={TRACKER_DIRECTIONS.map((direction) => ({
                    id: direction,
                    name: words.tasks.directions[direction].name,
                    note: words.tasks.directions[direction].note(
                      words.tasks.site[setupHome ?? "github"]
                    ),
                  }))}
                  value={activeDirection}
                />
              </div>

              <!-- The GitHub Project its columns come from (GitHub only): linked,
             the hub matches the board's columns to the Project's statuses. -->
              {#if setupHome === "github"}
                <div class={FORM_FIELD}>
                  <p class={FORM_LABEL} id="{uid}-board">
                    {words.tasks.githubProjectLabel}
                  </p>
                  {#if projectsRead?.state === "failed"}
                    <RowFault
                      again={() =>
                        activeConnectionId &&
                        setup.read({
                          kind: "projects",
                          connection: activeConnectionId,
                          repo: activeRepoName,
                        })}
                      reason={projectsRead.reason}
                    />
                  {:else if projectsRead?.state === "read" && projectsRead.value.refused}
                    <p class="m-0 type-meta text-pretty text-ink-muted">
                      {projectsRead.value.refused}
                    </p>
                  {:else if projectsRead?.state !== "read"}
                    <Skeleton
                      class="w-full"
                      height="control-sm"
                      radius="chip"
                    />
                  {:else}
                    <OptionGroup
                      aria-labelledby="{uid}-board"
                      {disabled}
                      glide
                      value={[activeProject]}
                    >
                      <OptionGroupItem
                        onclick={(event) => {
                          event.preventDefault();
                          githubProjectPick = NONE_PROJECT;
                        }}
                        value={NONE_PROJECT}
                      >
                        <span>{words.tasks.githubProjectNone}</span>
                      </OptionGroupItem>
                      {#each githubProjects as proj (proj.id)}
                        <OptionGroupItem
                          onclick={(event) => {
                            event.preventDefault();
                            githubProjectPick = proj.id;
                          }}
                          value={proj.id}
                        >
                          <span>{proj.name}</span>
                        </OptionGroupItem>
                      {/each}
                    </OptionGroup>
                  {/if}
                </div>
              {/if}
            {/if}

            <div class="flex justify-end gap-space-2">
              <Button
                label={words.cancel}
                onclick={closeSetup}
                size="sm"
                variant="ghost"
              />
              <Button
                disabled={!canSaveTie}
                label={words.tasks.saveTie}
                onclick={saveTie}
                size="sm"
              />
            </div>
          </div>
        {/key}
      </div>
    </section>
  {/if}

  <!-- Outsiders' issues and comments: held in Needs you, or a session started (the project's `outsiders`). -->
  <RowList label={words.tasks.outsiders}>
    <SectionRow
      enabled={record.outsiders === "hold"}
      icon={IconShield}
      name={words.tasks.outsiders}
      ontoggle={(hold) =>
        onchange({ key: "outsiders", value: hold ? "hold" : "start" })}
      toggling={disabled}
    >
      {#snippet below()}
        <RowFault
          again={() => onretry("outsiders")}
          againLabel={words.retryChange}
          reason={refused.outsiders}
        />
      {/snippet}
    </SectionRow>
  </RowList>
</div>
