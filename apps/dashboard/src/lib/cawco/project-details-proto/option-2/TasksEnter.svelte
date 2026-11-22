<script lang="ts">
  import { repoIdentity } from "@cawco/core/protocol";
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
   * opening under the tiles. Files moves at the press (changes.ts
   * `withAsked`); GitHub or Linear moves at the setup's Save. A refusal
   * puts it back and stands under the tiles (RowFault).
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconDocument,
    IconError,
    IconExternalLinear,
    IconRefresh,
    IconSettings,
    IconWorking,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import {
    aside,
    type Travel,
    travelIn,
    travelOut,
  } from "#lib/platform/motion/route.svelte.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import type { Change, ChangeKey } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import PickTiles from "./PickTiles.svelte";
  import type { HowItRunsRecord, TaskHome } from "./records";
  import {
    GITHUB_CONNECTIONS,
    GITHUB_PROJECTS,
    LINEAR_CONNECTIONS,
    LINEAR_TEAMS,
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
  /** Which way the setup swapped for its sibling moves: the move every page makes to a sibling (motion/route `aside`). */
  let setupTravel = $state<Travel>(aside(1, false));
  let setupWas = untrack(() => setupHome);
  $effect.pre(() => {
    const next = setupHome;
    if (next !== setupWas) {
      const was = setupWas;
      if (next !== null && was !== null) {
        setupTravel = aside(
          TILE_AT[next] - TILE_AT[was],
          getComputedStyle(document.documentElement).direction === "rtl"
        );
      }
      setupWas = next;
    }
  });
  /**
   * The setup leaving, out of the flow where it stood, so the form's height
   * follows the one arriving (morph) while the two cross.
   */
  const setupOut = (node: HTMLElement) => {
    node.style.position = "absolute";
    node.style.insetInline = "0";
    node.style.top = "0";
    return travelOut(node, () => setupTravel);
  };
  /** Leaving a tie for the project's own files, asked and not yet answered: the press first says what it stops (DESIGN.md, ceremony matches consequence). */
  let leaving = $derived(opening === "files");
  let connectionPick = $state<string | null>(null);
  /** The Linear team picked; null for the first. */
  let teamPick = $state<string | null>(null);
  /** The GitHub repository picked, by its git URL; "" for the project's own. */
  let repoPick = $state("");
  let githubProjectPick = $state<string>("proj-7");

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
    const inStep =
      tie.sync.kind === "inStep" && !syncPending
        ? words.tasks.inStep(formatAge(tie.sync.at))
        : null;
    return [
      inStep,
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
    options={HOMES.map((home) => ({
      id: home,
      name: words.tasks.homes[home].name,
      note: words.tasks.homes[home].note,
    }))}
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
      <!-- GitHub's setup and Linear's swap sideways toward the tile picked,
           both at once, as a page moves to its sibling (motion/route
           `aside`: the old one out, the new one in, one nudge), and the
           form's height follows the one coming in (motion/morph). -->
      <div class="relative min-w-0" {@attach morph()}>
        {#key setupHome}
          <div
            class="flex min-w-0 flex-col gap-space-5"
            in:travelIn={setupTravel}
            out:setupOut
          >
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
              {#if setupConnections.length === 0}
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
                  {#each setupConnections as conn (conn.id)}
                    <OptionGroupItem
                      onclick={(event) => {
                        event.preventDefault();
                        connectionPick = conn.id;
                      }}
                      value={conn.id}
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
                <div class={FORM_FIELD}>
                  <p class={FORM_LABEL} id="{uid}-team">
                    {words.tasks.teamLabel}
                  </p>
                  <OptionGroup
                    aria-labelledby="{uid}-team"
                    {disabled}
                    glide
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
                        <span>{team.label}</span>
                      </OptionGroupItem>
                    {/each}
                  </OptionGroup>
                </div>
              {/if}

              <!-- The GitHub Project its columns come from (GitHub only): linked,
             the hub matches the board's columns to the Project's statuses. -->
              {#if setupHome === "github"}
                <div class={FORM_FIELD}>
                  <p class={FORM_LABEL} id="{uid}-board">
                    {words.tasks.githubProjectLabel}
                  </p>
                  <OptionGroup
                    aria-labelledby="{uid}-board"
                    {disabled}
                    glide
                    value={[githubProjectPick]}
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
                    {#each GITHUB_PROJECTS as proj (proj.id)}
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
</div>
