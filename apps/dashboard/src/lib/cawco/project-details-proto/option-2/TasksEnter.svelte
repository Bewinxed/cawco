<script lang="ts">
  import { repoIdentity } from "@cawco/core/protocol";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import RepoPicker from "#lib/cawco/spawn/RepoPicker.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  /**
   * Stage 1 ("Tasks enter"): the three homes for the project's tasks as the
   * house's equal tiles (OptionTiles), each led by its mark (CawCo's own
   * files, GitHub's and Linear's own logos); while tied to one, how the two
   * sides stand above them; and pressed on GitHub or Linear, the tie's setup
   * opening under the tiles. Files moves at the press (changes.ts
   * `withAsked`); GitHub or Linear moves at the setup's Save. A refusal
   * puts it back and stands under the tiles (RowFault).
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconChevronRight,
    IconDocument,
    IconError,
    IconExternalLinear,
    IconInfo,
    IconRefresh,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import type { Change, ChangeKey } from "./changes";
  import type { HowItRunsRecord, TaskHome } from "./records";
  import {
    DEFAULT_STAGE_STATUS,
    GITHUB_CONNECTIONS,
    GITHUB_PROJECTS,
    LINEAR_CONNECTIONS,
    LINEAR_TEAMS,
    PROJECT_STAGES,
  } from "./tie-setup.fixture";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    syncing,
    onchange,
    onretry,
    onsync,
    hrefOf,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    syncing: boolean;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onsync: () => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
  } = $props();

  const HOMES: readonly TaskHome[] = ["files", "github", "linear"];
  const NONE_PROJECT = "__none__";
  const LEAVE_ALONE = "__leave__";

  /** The tie's setup standing open, for GitHub or Linear: the pick shows it from the press. */
  let setupHome = $state<"github" | "linear" | null>(null);
  let connectionPick = $state<string | null>(null);
  /** The Linear team picked; null for the first. */
  let teamPick = $state<string | null>(null);
  /** The GitHub repository picked, by its git URL; "" for the project's own. */
  let repoPick = $state("");
  let githubProjectPick = $state<string>("proj-7");
  let stageMapping = $state<Record<string, string>>({
    ...DEFAULT_STAGE_STATUS,
  });

  const disabled = $derived(!record.hubReachable);
  const syncPending = $derived(syncing || pending.includes("sync"));
  const tie = $derived(record.tie);

  /** Connections for the tracker currently open in the inline setup well. */
  const setupConnections = $derived(
    setupHome === "linear" ? LINEAR_CONNECTIONS : GITHUB_CONNECTIONS
  );

  const activeConnectionId = $derived(
    connectionPick &&
      setupConnections.some((conn) => conn.id === connectionPick)
      ? connectionPick
      : (setupConnections[0]?.id ?? null)
  );

  /** The project's own repositories, by identity: the picker marks their rows. */
  const projectRepos = $derived(
    new Set(record.repos.map((repo) => repoIdentity(repo.url)))
  );
  /** The repository the tie takes: the one picked, else the project's own. */
  const activeRepo = $derived(repoPick || (record.repos[0]?.url ?? ""));
  const markOwn = (repo: { url: string }): string =>
    projectRepos.has(repoIdentity(repo.url)) ? words.tasks.projectRepoTag : "";

  const activeTeamId = $derived(
    teamPick && LINEAR_TEAMS.some((team) => team.id === teamPick)
      ? teamPick
      : (LINEAR_TEAMS[0]?.id ?? null)
  );
  const activeConnection = $derived(
    setupConnections.find((conn) => conn.id === activeConnectionId) ?? null
  );

  const selectedGithubProject = $derived(
    GITHUB_PROJECTS.find((proj) => proj.id === githubProjectPick) ?? null
  );

  const canSaveTie = $derived(
    !disabled &&
      setupHome !== null &&
      activeConnectionId !== null &&
      (setupHome === "github" ? activeRepo !== "" : activeTeamId !== null)
  );

  function openSetup(home: "github" | "linear") {
    setupHome = home;
    connectionPick = null;
    teamPick = null;
    repoPick = "";
    githubProjectPick = GITHUB_PROJECTS[0]?.id ?? NONE_PROJECT;
    stageMapping = { ...DEFAULT_STAGE_STATUS };
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
      if (record.taskHome !== "files") {
        onchange({ key: "taskHome", value: "files" });
      }
      return;
    }
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

  function saveTie() {
    if (!canSaveTie || setupHome === null) {
      return;
    }
    onchange({ key: "taskHome", value: setupHome });
    closeSetup();
  }

  function formatAge(iso: string): string {
    return formatDistanceToNow(new Date(iso));
  }
</script>

{#snippet homeGlyph(home: TaskHome)}
  {#if home === "files"}
    <IconDocument aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <ProviderLogo provider={home} />
  {/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-space-2">
  {#if tie}
    <div class="flex flex-col gap-space-1" data-slot="sync">
      <div
        class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
      >
        <a
          class="mark-line inline-flex min-w-0 items-center gap-space-1 type-code text-link-ink hover:underline"
          href={tie.target.url}
          rel="noreferrer"
          target="_blank"
        >
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{tie.target.label}</span
          >
          <IconExternalLinear
            aria-hidden="true"
            class="size-icon-sm flex-none"
          />
        </a>
        <span class="type-meta text-ink-muted">
          {tie.connection.name} · {tie.connection.account}
        </span>
        <span class="type-meta text-ink-muted num">
          {words.tasks.linkedCount(tie.linked)}
        </span>

        <span
          class="mark-line inline-flex items-center gap-space-1 type-meta"
          data-slot="status"
        >
          {#if syncPending || tie.sync.kind === "syncing"}
            <LiveDot size="dot" tone="live" />
            <span class="text-status-live-ink">{words.tasks.syncing}</span>
          {:else if tie.sync.kind === "first"}
            <LiveDot size="dot" tone="live" />
            <span class="text-status-live-ink">{words.tasks.firstSync}</span>
          {:else if tie.sync.kind === "inStep"}
            <span class="text-ink-muted"
              >{words.tasks.inStep(formatAge(tie.sync.at))}</span
            >
          {:else}
            <IconError
              aria-hidden="true"
              class="size-icon-sm flex-none text-status-fail-glyph"
            />
            <span class="text-status-fail-ink"
              >{words.tasks.syncRefused(formatAge(tie.sync.at))}</span
            >
          {/if}
        </span>

        <span class="ms-auto flex flex-none items-center gap-space-1">
          <Button
            {disabled}
            label={words.tasks.changeTie}
            onclick={() =>
              setupHome === tie.home ? closeSetup() : openSetup(tie.home)}
            size="xs"
            tone="quiet"
            variant="ghost"
          />
          <Button
            {disabled}
            icon={IconRefresh}
            label={words.tasks.syncNow}
            onclick={onsync}
            pending={syncPending}
            pendingLabel={words.tasks.syncing}
            size="xs"
            variant="outline"
          />
        </span>
      </div>

      {#if tie.home === "github" && tie.githubProject !== null}
        <div
          class="flex min-w-0 flex-wrap items-center gap-space-1 type-meta text-ink-muted"
        >
          {#if "url" in tie.githubProject}
            <span>{words.tasks.stagesVia}</span>
            <a
              class="mark-line inline-flex items-center gap-space-1 text-link-ink hover:underline"
              href={tie.githubProject.url}
              rel="noreferrer"
              target="_blank"
            >
              <span>{tie.githubProject.name}</span>
              <IconExternalLinear
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
            </a>
          {:else}
            <span>{words.tasks.stagesNone} {tie.githubProject.none}</span>
          {/if}
        </div>
      {/if}

      {#if tie.sync.kind === "refused" && !syncPending}
        <Alert class="mt-space-1" layout="row" variant="destructive">
          <IconError aria-hidden="true" />
          <AlertDescription>{tie.sync.words}</AlertDescription>
          <AlertAction>
            <Button
              {disabled}
              icon={IconRefresh}
              label={words.tryAgain}
              onclick={onsync}
              size="xs"
              variant="outline"
            />
          </AlertAction>
        </Alert>
      {/if}

      <RowFault
        again={() => onretry("sync")}
        againLabel={words.retryChange}
        reason={refused.sync}
      />
    </div>
  {/if}

  <OptionTiles
    bind:value={
      () => setupHome ?? record.taskHome,
      (next) => {
        if (next !== null) {
          handleHomeClick(next);
        }
      }
    }
    cols={3}
    {disabled}
    glyph={homeGlyph}
    label={words.tasks.groupLabel}
    options={HOMES.map((home) => ({
      id: home,
      name: words.tasks.homes[home].name,
      note: words.tasks.homes[home].note,
    }))}
  />
  <RowFault
    again={() => onretry("taskHome")}
    againLabel={words.retryChange}
    reason={refused.taskHome}
  />

  {#if setupHome !== null}
    <div
      class="flex min-w-0 flex-col gap-space-3 pt-space-2"
      data-slot="setup-asks"
      transition:unfold
    >
      <div class="flex flex-wrap items-baseline justify-between gap-space-2">
        <h3 class="m-0 type-label text-ink-strong">
          {words.tasks.setupTitle(setupHome)}
        </h3>
        <span class="type-meta text-ink-muted"
          >{words.tasks.setupFieldsNote}</span
        >
      </div>

      <!-- Connection picker (or alert when none can serve). -->
      <div class="flex flex-col gap-space-1">
        <span class="type-meta font-medium text-ink-muted"
          >{words.tasks.connectionLabel}</span
        >
        {#if setupConnections.length === 0}
          <Alert layout="row" variant="default">
            <IconInfo aria-hidden="true" />
            <AlertDescription
              >{words.tasks.noConnection(setupHome)}</AlertDescription
            >
            <AlertAction>
              <Button
                href={hrefOf("connections")}
                label={words.tasks.openConnections}
                size="xs"
                variant="outline"
              />
            </AlertAction>
          </Alert>
        {:else}
          <div class="flex flex-wrap items-center gap-space-2">
            <OptionGroup
              aria-label={words.tasks.connectionLabel}
              {disabled}
              value={activeConnectionId ? [activeConnectionId] : []}
            >
              {#each setupConnections as conn (conn.id)}
                <OptionGroupItem
                  onclick={(event) => {
                    event.preventDefault();
                    connectionPick = conn.id;
                  }}
                  value={conn.id}
                >
                  <span>{conn.name}</span>
                  <span class="type-meta text-ink-muted">{conn.account}</span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>
            <a
              class="mark-line inline-flex items-center gap-space-1 type-meta text-link-ink hover:underline"
              href={hrefOf("connections")}
            >
              <span>{words.tasks.openConnections}</span>
              <IconChevronRight
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
            </a>
          </div>
        {/if}
      </div>

      <!-- Repository (GitHub): the New session form's repository picker, on
           the connection's account; Team (Linear): its few teams as one pick. -->
      {#if setupConnections.length > 0}
        {#if setupHome === "github" && activeConnection}
          <div class="flex min-w-0 flex-col gap-space-1" inert={disabled}>
            <span class="type-meta font-medium text-ink-muted"
              >{words.tasks.repoLabel}</span
            >
            <RepoPicker
              machineId={activeConnection.id}
              machineName={activeConnection.name}
              mark={markOwn}
              onrepo={(url) => {
                repoPick = url;
              }}
              repo={activeRepo}
            />
          </div>
        {:else if setupHome === "linear"}
          <div class="flex flex-col gap-space-1">
            <span class="type-meta font-medium text-ink-muted"
              >{words.tasks.teamLabel}</span
            >
            <OptionGroup
              aria-label={words.tasks.teamLabel}
              {disabled}
              value={activeTeamId ? [activeTeamId] : []}
            >
              {#each LINEAR_TEAMS as team (team.id)}
                <OptionGroupItem
                  onclick={(event) => {
                    event.preventDefault();
                    teamPick = team.id;
                  }}
                  value={team.id}
                >
                  {team.label}
                </OptionGroupItem>
              {/each}
            </OptionGroup>
          </div>
        {/if}

        <!-- GitHub Project & per-stage Status mapping (GitHub only). -->
        {#if setupHome === "github"}
          <div class="flex flex-col gap-space-2">
            <div class="flex flex-col gap-space-1">
              <span class="type-meta font-medium text-ink-muted"
                >{words.tasks.githubProjectLabel}</span
              >
              <OptionGroup
                aria-label={words.tasks.githubProjectLabel}
                {disabled}
                value={[githubProjectPick]}
              >
                <OptionGroupItem
                  onclick={(event) => {
                    event.preventDefault();
                    githubProjectPick = NONE_PROJECT;
                  }}
                  value={NONE_PROJECT}
                >
                  {words.tasks.githubProjectNone}
                </OptionGroupItem>
                {#each GITHUB_PROJECTS as proj (proj.id)}
                  <OptionGroupItem
                    onclick={(event) => {
                      event.preventDefault();
                      githubProjectPick = proj.id;
                    }}
                    value={proj.id}
                  >
                    {proj.name}
                  </OptionGroupItem>
                {/each}
              </OptionGroup>
            </div>

            {#if selectedGithubProject}
              <div class="flex flex-col gap-space-1 pt-space-1">
                <span class="type-meta font-medium text-ink-muted"
                  >{words.tasks.stageMapLabel}</span
                >
                <div class="flex flex-col gap-space-1 coarse:gap-y-space-3">
                  {#each PROJECT_STAGES as stage (stage)}
                    {@const currentStatus = stageMapping[stage] ?? LEAVE_ALONE}
                    <div
                      class="flex flex-col gap-space-1 @kinds:flex-row @kinds:items-center @kinds:gap-space-2"
                    >
                      <span
                        class="type-label text-ink-row @kinds:w-22 @kinds:flex-none"
                        >{stage}</span
                      >
                      <OptionGroup
                        aria-label={words.tasks.stageStatusLabel(stage)}
                        class="min-w-0 flex-1"
                        {disabled}
                        value={[currentStatus]}
                      >
                        {#each selectedGithubProject.statuses as status (status)}
                          <OptionGroupItem
                            onclick={(event) => {
                              event.preventDefault();
                              stageMapping = {
                                ...stageMapping,
                                [stage]: status,
                              };
                            }}
                            value={status}
                          >
                            {status}
                          </OptionGroupItem>
                        {/each}
                        <OptionGroupItem
                          onclick={(event) => {
                            event.preventDefault();
                            stageMapping = {
                              ...stageMapping,
                              [stage]: LEAVE_ALONE,
                            };
                          }}
                          value={LEAVE_ALONE}
                        >
                          {words.tasks.leaveAlone}
                        </OptionGroupItem>
                      </OptionGroup>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="flex flex-wrap items-center gap-space-2">
        <Button
          disabled={!canSaveTie}
          label={words.tasks.saveTie}
          onclick={saveTie}
          size="sm"
          variant="outline"
        />
        <Button
          label={words.cancel}
          onclick={closeSetup}
          size="sm"
          variant="ghost"
        />
      </div>
    </div>
  {/if}
</div>
