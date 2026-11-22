<script lang="ts">
  import { repoIdentity } from "@cawco/core/protocol";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
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
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import {
    IconDocument,
    IconExternalLinear,
    IconInfo,
    IconRefresh,
    IconSettings,
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
    opening = null,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    syncing: boolean;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onsync: () => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
    /** The tie's setup standing open as it mounts: a states file reads it without the press. */
    opening?: "github" | "linear" | null;
  } = $props();

  const HOMES: readonly TaskHome[] = ["files", "github", "linear"];
  const NONE_PROJECT = "__none__";
  const LEAVE_ALONE = "__leave__";

  /** The tie's setup standing open, for GitHub or Linear: the pick shows it from the press. */
  let setupHome = $derived<"github" | "linear" | null>(opening);
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
    return [
      `${tie.connection.name} (${tie.connection.account})`,
      words.tasks.linkedCount(tie.linked),
      columns,
    ]
      .filter((fact) => fact !== null)
      .join(", ");
  });
</script>

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
            <Badge variant="live"><span>{words.tasks.syncing}</span></Badge>
          {:else if tie.sync.kind === "first"}
            <Badge variant="live"><span>{words.tasks.firstSync}</span></Badge>
          {:else if tie.sync.kind === "inStep"}
            <Badge kind="meta"
              ><span>{words.tasks.inStep(formatAge(tie.sync.at))}</span></Badge
            >
          {:else}
            <Badge variant="fail"
              ><span>{words.tasks.syncRefused(formatAge(tie.sync.at))}</span
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
            size="xs"
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
          <RowFault
            again={() => onretry("sync")}
            againLabel={words.retryChange}
            reason={refused.sync}
          />
        {/snippet}
      </SectionRow>
    </RowList>
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
    glide
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
      class="flex min-w-0 flex-col gap-space-5 pt-space-4"
      data-slot="setup-asks"
      transition:unfold
    >
      <div class="flex flex-col gap-space-1">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>
          {words.tasks.setupTitle(setupHome)}
        </h3>
        <p class="m-0 type-meta text-pretty text-ink-muted">
          {words.tasks.setupFieldsNote}
        </p>
      </div>

      <!-- Connection picker (or alert when none can serve). -->
      <div class="flex flex-col gap-space-2">
        <p class="m-0 type-meta text-ink-muted">
          {words.tasks.connectionLabel}
        </p>
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
              glide
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
            <Button
              href={hrefOf("connections")}
              label={words.tasks.openConnections}
              size="xs"
              tone="quiet"
              variant="ghost"
            />
          </div>
        {/if}
      </div>

      <!-- Repository (GitHub): the New session form's repository picker, on
           the connection's account; Team (Linear): its few teams as one pick. -->
      {#if setupConnections.length > 0}
        {#if setupHome === "github" && activeConnection}
          <div class="flex min-w-0 flex-col gap-space-2" inert={disabled}>
            <p class="m-0 type-meta text-ink-muted">{words.tasks.repoLabel}</p>
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
          <div class="flex flex-col gap-space-2">
            <p class="m-0 type-meta text-ink-muted">{words.tasks.teamLabel}</p>
            <OptionGroup
              glide
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
          <div class="flex flex-col gap-space-5">
            <div class="flex flex-col gap-space-2">
              <p class="m-0 type-meta text-ink-muted">
                {words.tasks.githubProjectLabel}
              </p>
              <OptionGroup
                glide
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
              <div class="flex flex-col gap-space-2">
                <p class="m-0 type-meta text-ink-muted">
                  {words.tasks.stageMapLabel}
                </p>
                <div class="flex flex-col gap-space-2 coarse:gap-y-space-3">
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
                        glide
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
