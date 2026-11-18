<script lang="ts" module>
  import {
    addProjectPlace,
    editProject,
    moveProjectPlace,
    removeProjectPlace,
  } from "#lib/cawco/client.svelte.js";
  import { setTracker, syncTracker } from "#lib/cawco/project-tasks.js";

  /** What the details change on the hub: the live client's calls, or a states file's stand-ins. */
  export interface ProjectEdits {
    addPlace: typeof addProjectPlace;
    edit: typeof editProject;
    movePlace: typeof moveProjectPlace;
    removePlace: typeof removeProjectPlace;
    setTracker: typeof setTracker;
    syncTracker: typeof syncTracker;
  }

  export const liveEdits: ProjectEdits = {
    addPlace: addProjectPlace,
    edit: editProject,
    movePlace: moveProjectPlace,
    removePlace: removeProjectPlace,
    setTracker,
    syncTracker,
  };
</script>

<script lang="ts">
  /**
   * The project's details, changed where they are shown (DESIGN.md, The Stay
   * In Context Rule; project-details-wireframe.md): a tray that unfolds under
   * the project head, in the end tray's frame (ProjectEndTray, StopTray),
   * with the board live under it (The Open Page Rule). The head's place (its
   * machine's mark, or the hub's folder) opens it, and so does ⋯ › Project
   * details…; Done, Escape or the place again folds it.
   *
   * Its rows stand in groups, each group set off by a hairline:
   * - Places: every place in one list, the primary marked. A checkout's
   *   folder is changed in its own row (no file moves); a checkout other
   *   than the primary can be removed, another added (a machine, picked
   *   when there is more than one, and a folder on it).
   * - Who decides: the fleet's or the project's own, at a value's weight,
   *   with Review before done under it.
   * - Tasks: where they live (tracker), each choice saying what it does;
   *   GitHub or Linear then bound to one repository or team with Use.
   * - Code, while the project holds code (a repository linked, or a place
   *   on a machine): its repositories, where work lands, its large files.
   * - Account: the account its sessions start on, or the fleet's routing;
   *   while one is named, what its sessions do at that account's limit.
   *
   * A change shows what was asked while the hub answers (the segment's thumb
   * breathes, the switch waits), and the row then shows the hub's value: a
   * refusal puts it back, with the hub's words under the row and Try again
   * (RowFault). Every value is the project as the hub last said it, which
   * `projects.changed` brings to every open dashboard. Reads go through the
   * hub seam and changes through `edits`, so a states file stands in for
   * both.
   */
  import {
    accountNameAmong,
    PROJECT_AT_LIMIT,
    type ProjectAtLimit,
  } from "@cawco/core/accounts";
  import { type ConnectionView, readsGitHubApi } from "@cawco/core/connections";
  import { hubRequest } from "@cawco/core/hub-request";
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import { machineLabel } from "@cawco/core/machine-names";
  import type { StagesView } from "@cawco/core/task-views";
  import {
    type GithubProjectChoice,
    type GithubProjectsView,
    type IssueTracker,
    statusOptionFor,
    TRACKER_NAMES,
    type Tracker,
    type TrackerBindingView,
    type TrackerTarget,
    type TrackerView,
  } from "@cawco/core/trackers";
  import { lfsWords } from "@cawco/core/words/lfs";
  import { projectWords } from "@cawco/core/words/project";
  import { projectAccountWords } from "@cawco/core/words/project-account";
  import type { Component } from "svelte";
  import type {
    AccountsView,
    Machine,
    ProjectRow,
  } from "#lib/cawco/client.svelte.js";
  import DecidesRow from "#lib/cawco/decides/DecidesRow.svelte";
  import { hubSeam } from "#lib/cawco/hub-live.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import {
    IconFolder,
    IconForbidden,
    IconGitBranch,
    IconGitCommit,
    IconGitPullRequest,
    IconPlus,
    IconServer,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  let {
    project,
    machines,
    accounts,
    onclose,
    edits = liveEdits,
  }: {
    project: ProjectRow;
    /** The fleet's machines, as the hub lists them. */
    machines: Machine[];
    /** The fleet's accounts and their sign-ins; null while unread. */
    accounts: AccountsView | null;
    onclose: () => void;
    edits?: ProjectEdits;
  } = $props();

  type RowKey = "place" | "repository" | "lands" | "lfs" | "account" | "at-limit";

  const uid = $props.id();
  const hub = hubSeam();

  /** What each way of landing does (core `LandsMode`), under its segments. */
  const LANDS: Record<
    LandsMode,
    { icon: Component; label: string; says: string }
  > = {
    main: {
      icon: IconGitCommit,
      label: "Main",
      says: "Onto its default branch.",
    },
    branch: {
      icon: IconGitBranch,
      label: "Branch",
      says: "To a branch of its own on origin.",
    },
    pr: {
      icon: IconGitPullRequest,
      label: "PR",
      says: "To its branch, with a pull request.",
    },
    none: {
      icon: IconForbidden,
      label: "None",
      says: "No commits: its outputs are the work.",
    },
  };

  /* ── Work lands ─────────────────────────────────────────────────── */

  let landsAsked = $state<LandsMode | null>(null);
  let landsFault = $state<string | null>(null);
  const lands = $derived(landsAsked ?? project.lands);

  async function setLands(next: LandsMode): Promise<void> {
    if (landsAsked !== null || next === project.lands) {
      return;
    }
    landsAsked = next;
    landsFault = null;
    try {
      await edits.edit(project.id, { lands: next });
    } catch (error) {
      landsFault = failureWords(error);
    } finally {
      landsAsked = null;
    }
  }

  /** Try again: the last way asked, once more. */
  let landsTried: LandsMode | null = null;
  function askLands(next: LandsMode): void {
    landsTried = next;
    setLands(next);
  }

  /* ── Account ────────────────────────────────────────────────────── */

  /** The fleet's accounts, each by the name it shows everywhere. */
  const accountChoices = $derived.by(() => {
    const all = accounts?.accounts ?? [];
    return all.map((one) => ({ id: one.id, name: accountNameAmong(one, all) }));
  });
  /** The account asked while the hub answers; undefined: none asked. */
  let accountAsked = $state<string | null | undefined>(undefined);
  let accountFault = $state<string | null>(null);
  const accountNow = $derived(
    accountAsked === undefined ? project.account : accountAsked
  );
  const accountName = $derived(
    accountChoices.find((one) => one.id === project.account)?.name ??
      project.account
  );
  /** Set, and signed in on no machine: nothing of the project starts. */
  const accountSignedOut = $derived(
    project.account !== null &&
      accounts !== null &&
      !accounts.signins.some(
        (one) => one.accountId === project.account && one.state === "signed-in"
      )
  );

  /** Try again: the last account asked, once more. */
  let accountTried: string | null = null;

  async function setAccount(next: string | null): Promise<void> {
    if (accountAsked !== undefined || next === project.account) {
      return;
    }
    accountTried = next;
    accountAsked = next;
    accountFault = null;
    try {
      await edits.edit(project.id, { account: next });
    } catch (error) {
      accountFault = failureWords(error);
    } finally {
      accountAsked = undefined;
    }
  }

  /* ── At its limit ──────────────────────────────────────────────── */

  let atLimitAsked = $state<ProjectAtLimit | null>(null);
  let atLimitFault = $state<string | null>(null);
  const atLimit = $derived(atLimitAsked ?? project.accountAtLimit);
  /** Try again: the last way asked, once more. */
  let atLimitTried: ProjectAtLimit | null = null;

  async function setAtLimit(next: ProjectAtLimit): Promise<void> {
    if (atLimitAsked !== null || next === project.accountAtLimit) {
      return;
    }
    atLimitTried = next;
    atLimitAsked = next;
    atLimitFault = null;
    try {
      await edits.edit(project.id, { accountAtLimit: next });
    } catch (error) {
      atLimitFault = failureWords(error);
    } finally {
      atLimitAsked = null;
    }
  }

  /* ── Tasks: where they live ─────────────────────────────────────── */

  /** The project's tracker as the hub last said it; null while it is read. */
  let tracker = $state<TrackerView | null>(null);
  let trackerFault = $state<string | null>(null);
  /** The tracker picked and not yet bound: its form stands under the pick. */
  let picking = $state<IssueTracker | null>(null);
  /** The picked service's connections a tracker can use: an app or a key. */
  let usable = $state<ConnectionView[] | null>(null);
  let pickConnection = $state("");
  let targets = $state<TrackerTarget[] | null>(null);
  let targetsFault = $state<string | null>(null);
  let pickTarget = $state("");
  let binding = $state(false);
  let bindFault = $state<string | null>(null);
  const shownTracker = $derived<Tracker>(
    picking ?? tracker?.tracker ?? "cawco"
  );

  /** GitHub: the Projects the connection reaches for the repository picked; null while they are read. */
  let ghProjects = $state<GithubProjectChoice[] | null>(null);
  /** GitHub's words when the connection may not read the owner's Projects. */
  let ghRefused = $state<string | null>(null);
  let ghFault = $state<string | null>(null);
  /** The Project picked: its id, or "" for none. */
  let pickProject = $state("");
  /** The project's stages, by name, in its order: each takes a Status option. */
  let stageNames = $state<string[]>([]);
  /** Each stage's Status option picked; null leaves Status alone. */
  let statusMap = $state<Record<string, string | null>>({});
  const chosenProject = $derived(
    ghProjects?.find((each) => each.id === pickProject)
  );

  $effect(() => {
    hub
      .read<TrackerView>(
        hubRequest("GET /api/projects/:id/tracker", {
          path: { id: project.id },
        })
      )
      .then(
        (read) => {
          tracker = read;
        },
        (error: unknown) => {
          trackerFault = failureWords(error);
        }
      );
  });

  /**
   * A connection's repositories or teams, the one bound now chosen, else the
   * project's own repository, else the first.
   */
  async function readTargets(connection: string): Promise<void> {
    targets = null;
    targetsFault = null;
    pickTarget = "";
    if (!connection) {
      return;
    }
    try {
      const read = (
        await hub.read<{ targets: TrackerTarget[] }>(
          hubRequest("GET /api/connections/:name/targets", {
            path: { name: connection },
          })
        )
      ).targets;
      if (pickConnection !== connection) {
        return;
      }
      targets = read;
      const own = project.links.flatMap((link) =>
        link.startsWith("github.com/")
          ? [link.slice("github.com/".length).toLowerCase()]
          : []
      );
      const bound =
        tracker?.binding?.provider === picking
          ? tracker.binding.target
          : undefined;
      pickTarget =
        read.find((each) => each.id === bound)?.id ??
        read.find((each) => own.includes(each.id.toLowerCase()))?.id ??
        read[0]?.id ??
        "";
    } catch (error) {
      targetsFault = failureWords(error);
      return;
    }
    await readProjects(connection, pickTarget);
  }

  /** Each stage's Status option for a Project: as bound when it is the bound one, else the option named as the stage. */
  function mapFor(id: string): void {
    const choice = ghProjects?.find((each) => each.id === id);
    const bound =
      tracker?.binding?.githubProject?.id === id
        ? tracker.binding.githubProject.map
        : {};
    statusMap = choice
      ? Object.fromEntries(
          stageNames.map((name) => [
            name,
            statusOptionFor(name, { map: bound, options: choice.options }),
          ])
        )
      : {};
  }

  /**
   * GitHub: the repository's Projects and the project's stages, the bound
   * Project chosen (none, when it was bound with none), else the first
   * linked to the repository; GitHub's words when it may not read them.
   */
  async function readProjects(connection: string, repo: string) {
    ghProjects = null;
    ghRefused = null;
    ghFault = null;
    pickProject = "";
    if (picking !== "github" || !(connection && repo)) {
      return;
    }
    try {
      const [read, stages] = await Promise.all([
        hub.read<GithubProjectsView>(
          hubRequest("GET /api/connections/:name/github-projects", {
            path: { name: connection },
            query: { repo },
          })
        ),
        hub.read<StagesView>(
          hubRequest("GET /api/projects/:id/stages", {
            path: { id: project.id },
          })
        ),
      ]);
      if (pickConnection !== connection || pickTarget !== repo) {
        return;
      }
      stageNames = stages.stages.map((stage) => stage.name);
      ghRefused = read.refused;
      ghProjects = read.projects;
      const was =
        tracker?.binding?.provider === "github" &&
        tracker.binding.target === repo
          ? tracker.binding
          : null;
      pickProject = was
        ? (was.githubProject?.id ?? "")
        : (read.projects.find((each) => each.linked)?.id ?? "");
      mapFor(pickProject);
    } catch (error) {
      ghFault = failureWords(error);
    }
  }

  /** Opens the binding's form for a tracker: its usable connections, then their targets. */
  async function pick(next: Tracker): Promise<void> {
    bindFault = null;
    if (next === "cawco") {
      picking = null;
      if (tracker?.tracker !== "cawco") {
        await bind({ tracker: "cawco" });
      }
      return;
    }
    picking = next;
    usable = null;
    try {
      const { connections } = await hub.read<{
        connections: ConnectionView[];
      }>(hubRequest("GET /api/connections"));
      usable = connections.filter(
        (each) =>
          each.service.toLowerCase() === next &&
          (next === "github"
            ? readsGitHubApi(each.auth)
            : each.auth === "app" || each.auth === "bearer")
      );
    } catch (error) {
      bindFault = failureWords(error);
      usable = [];
    }
    pickConnection =
      usable.find((each) => each.name === tracker?.binding?.connection)?.name ??
      usable[0]?.name ??
      "";
    await readTargets(pickConnection);
  }

  async function bind(
    asked:
      | { tracker: "cawco" }
      | {
          connection: string;
          githubProject?: {
            id: string;
            map: Record<string, string | null>;
          } | null;
          target: string;
          tracker: IssueTracker;
        }
  ): Promise<void> {
    binding = true;
    bindFault = null;
    try {
      tracker = await edits.setTracker(project.id, asked);
      picking = null;
    } catch (error) {
      bindFault = failureWords(error);
    } finally {
      binding = false;
    }
  }

  async function syncNow(): Promise<void> {
    tracker = await edits.syncTracker(project.id);
  }

  /** How a binding's sync stands, in a few words. */
  function syncWords(bound: TrackerBindingView): string {
    if (bound.state === "syncing") {
      return "Syncing…";
    }
    if (bound.state === "refused") {
      return "Refused";
    }
    return bound.polledAt
      ? `Synced ${formatDistanceToNow(new Date(bound.polledAt))}`
      : "Synced";
  }

  /* ── Review before done ─────────────────────────────────────────── */

  let reviewAsked = $state<boolean | null>(null);
  let reviewFault = $state<string | null>(null);

  async function setReview(next: boolean): Promise<void> {
    if (reviewAsked !== null || next === project.review) {
      return;
    }
    reviewAsked = next;
    reviewFault = null;
    try {
      await edits.edit(project.id, { review: next });
    } catch (error) {
      reviewFault = failureWords(error);
    } finally {
      reviewAsked = null;
    }
  }

  /* ── Large files ────────────────────────────────────────────────── */

  type LfsAsk = { connection: string; url: string } | null;

  let lfsEditing = $state(false);
  let lfsUrl = $state("");
  let lfsConnection = $state("");
  let lfsPending = $state(false);
  let lfsFault = $state<string | null>(null);
  /** The fleet's connections, read once the form opens; only one with a key signs in to an LFS server. */
  let connections = $state<ConnectionView[]>([]);
  let lfsListed = $state(false);
  const lfsKeyed = $derived(
    connections.filter(
      (each) =>
        each.hasSecret && (each.auth === "bearer" || each.auth === "header")
    )
  );

  async function startLfs(): Promise<void> {
    lfsEditing = true;
    lfsFault = null;
    lfsUrl = project.lfsUrl ?? "";
    lfsConnection = project.lfsConnection ?? "";
    try {
      ({ connections } = await hub.read<{ connections: ConnectionView[] }>(
          hubRequest("GET /api/connections")
        ));
      lfsListed = true;
      lfsConnection ||= lfsKeyed[0]?.name ?? "";
    } catch (error) {
      lfsFault = failureWords(error);
    }
  }

  function stopLfs(): void {
    lfsEditing = false;
    lfsFault = null;
  }

  /** Try again: the last setting asked, once more. */
  let lfsTried: LfsAsk | undefined;

  async function saveLfs(next: LfsAsk): Promise<void> {
    if (lfsPending) {
      return;
    }
    lfsTried = next;
    lfsPending = true;
    lfsFault = null;
    try {
      await edits.edit(project.id, { lfs: next });
      lfsEditing = false;
    } catch (error) {
      // The typed URL stays, the hub's words under it.
      lfsFault = failureWords(error);
    } finally {
      lfsPending = false;
    }
  }

  /* ── Places ─────────────────────────────────────────────────────── */

  /** Its places on machines (its folder on the hub is every project's). */
  const checkouts = $derived(
    project.places.filter((each) => each.kind !== "hub").length
  );
  /**
   * The project holds code: a repository linked, or a place on a machine.
   * Only then do its code's rows stand (repository, large files, where work
   * lands): a project is code and more than code (PRODUCT.md), and a project
   * with neither has none of them to set. A place added makes it code, and
   * they stand.
   */
  const holdsCode = $derived(project.links.length > 0 || checkouts > 0);
  const hostOf = (machineId: string) =>
    machines.find((row) => row.machineId === machineId);
  const hostWords = (machineId: string) => {
    const host = hostOf(machineId);
    return host ? machineLabel(host.hostname) : "A machine not joined";
  };

  /** A place whose Remove is on its way, and why the last one was refused, by place. */
  let removing = $state<string | null>(null);
  let placeFault = $state<{
    again: () => void;
    at: string;
    reason: string;
  } | null>(null);

  async function remove(placeId: string): Promise<void> {
    if (removing) {
      return;
    }
    removing = placeId;
    placeFault = null;
    try {
      await edits.removePlace(project.id, placeId);
    } catch (error) {
      placeFault = {
        at: placeId,
        reason: failureWords(error),
        again: () => remove(placeId),
      };
    } finally {
      removing = null;
    }
  }

  /** The place whose folder is being changed in its row, and the folder typed. */
  let moving = $state<string | null>(null);
  let movePath = $state("");
  let movePending = $state(false);

  function startMove(placeId: string, path: string): void {
    moving = placeId;
    movePath = path;
    placeFault = null;
  }

  function stopMove(): void {
    moving = null;
    placeFault = null;
  }

  async function move(placeId: string): Promise<void> {
    if (movePending) {
      return;
    }
    movePending = true;
    placeFault = null;
    try {
      await edits.movePlace(project.id, placeId, movePath.trim());
      moving = null;
    } catch (error) {
      // The typed folder stays, the hub's words under it.
      placeFault = {
        at: placeId,
        reason: failureWords(error),
        again: () => move(placeId),
      };
    } finally {
      movePending = false;
    }
  }

  let adding = $state(false);
  let addMachine = $state("");
  let addPath = $state("");
  let addPending = $state(false);
  let addFault = $state<string | null>(null);
  const primaryMachine = $derived(
    project.places.find((each) => each.isPrimary)?.machineId
  );

  function startAdd(): void {
    adding = true;
    addFault = null;
    addMachine ||= primaryMachine ?? machines[0]?.machineId ?? "";
  }

  function stopAdd(): void {
    adding = false;
    addPath = "";
    addFault = null;
  }

  async function add(): Promise<void> {
    if (addPending) {
      return;
    }
    addPending = true;
    addFault = null;
    try {
      await edits.addPlace(project.id, addMachine, addPath.trim());
      stopAdd();
    } catch (error) {
      // The typed folder stays, the hub's words under it.
      addFault = failureWords(error);
    } finally {
      addPending = false;
    }
  }

  /** Escape inside it folds it, and goes no further. */
  function escapes(node: HTMLElement) {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        onclose();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }
</script>

<!-- One row: its label in the first column, its value in the second; one column in a narrow tray. -->
{#snippet row(label: string, key: RowKey)}
  <div
    data-slot="row"
    class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
    data-detail={key}
  >
    <p
      data-slot="project-details-label"
      class="type-label pt-space-1 text-ink-muted"
      id="{uid}-{key}"
    >
      {label}
    </p>
    <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
      {#if key === "place"}
        {@render placesValue()}
      {:else if key === "repository"}
        {@render repositoryValue()}
      {:else if key === "lands"}
        {@render landsValue()}
      {:else if key === "lfs"}
        {@render lfsValue()}
      {:else if key === "account"}
        {@render accountValue()}
      {:else}
        {@render atLimitValue()}
      {/if}
    </div>
  </div>
{/snippet}

<!-- GitHub: the Project whose Status carries the stages, and each stage's option. -->
{#snippet projectPick()}
  {#if ghRefused}
    <p data-slot="note" class="type-meta text-ink-muted" data-projects-refused>
      {ghRefused}
    </p>
  {:else if ghProjects}
    <NativeSelect.Root
      aria-label="GitHub Project"
      class="col-span-full w-full"
      bind:value={
        () => pickProject,
        (next) => {
          pickProject = next;
          mapFor(next);
        }
      }
    >
      <NativeSelect.Option value="">No GitHub Project</NativeSelect.Option>
      {#each ghProjects as each (each.id)}
        <NativeSelect.Option value={each.id}>{each.title}</NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
    {#if chosenProject && chosenProject.options.length === 0}
      <p data-slot="note" class="type-meta text-ink-muted" data-no-status>
        {chosenProject.title} has no single-select field named Status: stages show
        on GitHub only as open and closed.
      </p>
    {:else if chosenProject}
      {@const options = chosenProject.options}
      <fieldset
        class="col-span-full grid min-w-0 grid-cols-(--status-cols) items-center gap-x-space-2 gap-y-space-1 @max-details/details:grid-cols-1"
        data-status-map
        style:--status-cols="minmax(0, max-content) minmax(0, 1fr)"
      >
        <legend data-slot="note" class="type-meta pb-space-1 text-ink-muted">
          Each stage's Status on {chosenProject.title}
        </legend>
        {#each stageNames as stage, at (stage)}
          <label
            class="min-w-0 type-label wrap-anywhere text-ink-strong"
            for="{uid}-status-{at}"><bdi>{stage}</bdi></label
          >
          <NativeSelect.Root
            class="w-full"
            id="{uid}-status-{at}"
            bind:value={
              () => statusMap[stage] ?? "",
              (next) => {
                statusMap = { ...statusMap, [stage]: next || null };
              }
            }
          >
            <NativeSelect.Option value=""
              >Leave Status alone</NativeSelect.Option
            >
            {#each options as option (option.id)}
              <NativeSelect.Option value={option.id}
                >{option.name}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        {/each}
      </fieldset>
    {/if}
  {:else if !ghFault}
    <p
      data-slot="note"
      class="mark-line flex items-start gap-space-2 type-meta text-ink-muted"
    >
      <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
        >Reading the GitHub Projects {pickConnection} reaches…</span
      >
    </p>
  {/if}
{/snippet}

<!-- Places: every place in one list, the primary marked; a checkout's folder changes in its row. -->
{#snippet placesValue()}
  <ul class="m-0 flex list-none flex-col gap-space-1 p-0" data-places>
    {#each project.places as each (each.id)}
      {@const host = each.kind === "hub" ? undefined : hostOf(each.machineId)}
      <li
        data-place={each.id}
        class="flex min-w-0 flex-col gap-space-2 rounded-sm bg-surface-recess px-space-3 py-space-2"
      >
        <div class="flex min-w-0 items-center gap-space-2">
          <span class="flex-none text-ink-muted">
            {#if host}
              <OsMark class="size-icon-sm" os={host.os} />
            {:else}
              <IconServer class="size-icon-sm" />
            {/if}
          </span>
          <div class="flex min-w-0 flex-auto flex-col gap-space-row">
            <span data-slot="host" class="type-label text-ink-strong"
              >{each.kind === "hub"
                ? projectWords.hubPlace
                : hostWords(each.machineId)}</span
            >
            {#if moving !== each.id}
              <!-- The path reads from its end: the folder's tail stays when
                   it is cut, and one that fits starts under its host. -->
              <span
                data-slot="path"
                class="dir-rtl type-meta truncate text-end text-ink-muted"
                title={each.path}><bdi>{each.path}</bdi></span
              >
            {/if}
          </div>
          {#if each.isPrimary}
            <Badge data-place-primary variant="secondary"
              >{projectWords.primaryPlace}</Badge
            >
          {/if}
          {#if each.kind === "checkout" && moving !== each.id}
            <Button
              data-change-place
              label={projectWords.changePlace}
              onclick={() => startMove(each.id, each.path)}
              size="xs"
              variant="ghost"
            />
            {#if !each.isPrimary}
              <Button
                data-remove-place
                disabled={removing !== null && removing !== each.id}
                label="Remove"
                onclick={() => remove(each.id)}
                pending={removing === each.id}
                pendingLabel="Removing…"
                size="xs"
                variant="ghost"
              />
            {/if}
          {/if}
        </div>
        {#if moving === each.id}
          <form
            class="flex flex-col gap-space-2"
            data-move-place-form
            onsubmit={(event) => {
              event.preventDefault();
              move(each.id);
            }}
            transition:unfold
          >
            <Input
              aria-label="Folder on {hostWords(each.machineId)}"
              autocomplete="off"
              spellcheck="false"
              text="label"
              bind:value={movePath}
            />
            <div class="flex flex-wrap items-center justify-between gap-space-2">
              <span class="type-meta text-ink-muted"
                >{projectWords.placeMovesNothing}</span
              >
              <div class="flex gap-space-2">
                <Button
                  label="Cancel"
                  onclick={stopMove}
                  size="sm"
                  type="button"
                  variant="ghost"
                />
                <Button
                  disabled={!movePath.trim() || movePath.trim() === each.path}
                  label="Save"
                  pending={movePending}
                  pendingLabel="Saving…"
                  size="sm"
                  type="submit"
                />
              </div>
            </div>
          </form>
        {/if}
        <RowFault
          again={placeFault?.at === each.id ? placeFault.again : undefined}
          data-place-fault
          reason={placeFault?.at === each.id ? placeFault.reason : null}
        />
      </li>
    {/each}
  </ul>
  {#if adding}
    <form
      data-slot="add"
      class="flex flex-col gap-space-2 pt-space-1"
      data-add-place-form
      onsubmit={(event) => {
        event.preventDefault();
        add();
      }}
      transition:unfold
    >
      {#if machines.length > 1}
        <OptionGroup
          aria-label="Machine"
          bind:value={
            () => [addMachine],
            (next) => {
              addMachine = next[0] ?? addMachine;
            }
          }
        >
          {#each machines as host (host.machineId)}
            <OptionGroupItem value={host.machineId}>
              <OsMark class="size-icon-sm" os={host.os} />
              {machineLabel(host.hostname)}
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      {/if}
      <Input
        aria-label="Folder on that machine"
        autocomplete="off"
        placeholder="/absolute/path on that machine"
        spellcheck="false"
        text="label"
        bind:value={addPath}
      />
      <div class="flex justify-end gap-space-2">
        <Button
          label="Cancel"
          onclick={stopAdd}
          size="sm"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={!(addMachine && addPath.trim())}
          label="Add"
          pending={addPending}
          pendingLabel="Adding…"
          size="sm"
          type="submit"
        />
      </div>
    </form>
    <RowFault again={add} data-add-fault reason={addFault} />
  {:else}
    <Button
      class="self-start"
      data-add-place
      icon={IconPlus}
      label={projectWords.addPlace}
      onclick={startAdd}
      size="xs"
      variant="ghost"
    />
  {/if}
{/snippet}

<!-- Tasks: each tracker says what picking it does; GitHub or Linear is then bound with Use. -->
{#snippet tasksValue()}
  <OptionGroup
    aria-labelledby="{uid}-tracker"
    data-pending={binding ? "" : undefined}
    layout="tiles"
    style="--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: minmax(0, 1fr)"
    bind:value={
      () => [shownTracker],
      (next) => {
        const chosen = next[0] as Tracker | undefined;
        if (chosen && chosen !== shownTracker) {
          pick(chosen);
        }
      }
    }
  >
    {#each ["cawco", "github", "linear"] as const as each (each)}
      <OptionGroupItem value={each}>
        <span class="flex items-center gap-space-2 type-label font-medium">
          {#if each === "cawco"}
            <IconFolder class="size-icon-md flex-none" />
          {:else}
            <ProviderLogo provider={each} size="control" />
          {/if}
          {projectWords.trackers[each].name}
        </span>
        <span class="type-meta text-pretty text-ink-muted"
          >{projectWords.trackers[each].note}</span
        >
      </OptionGroupItem>
    {/each}
  </OptionGroup>
  {#if picking}
    {@const service = picking === "github" ? "GitHub" : "Linear"}
    <form
      data-slot="bind"
      class="grid grid-cols-2 gap-space-2 pt-space-2 @max-details/details:grid-cols-1"
      data-bind-form={picking}
      onsubmit={(event) => {
        event.preventDefault();
        if (picking) {
          bind({
            tracker: picking,
            connection: pickConnection,
            target: pickTarget,
            // Read and not refused: the Project picked, or none.
            ...(picking === "github" && ghProjects && !ghRefused
              ? {
                  githubProject: chosenProject
                    ? { id: chosenProject.id, map: statusMap }
                    : null,
                }
              : {}),
          });
        }
      }}
      transition:unfold
    >
      {#if usable === null}
        <p
          data-slot="note"
          class="mark-line col-span-full flex items-start gap-space-2 type-meta wrap-anywhere text-ink-muted"
        >
          <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
            >Reading the {service} connections…</span
          >
        </p>
      {:else if usable.length === 0}
        <p
          data-slot="note"
          class="col-span-full type-meta wrap-anywhere text-ink-muted"
          data-no-connection
        >
          No {service} connection a tracker can use yet: {picking === "github"
            ? "a GitHub App or a token"
            : "a Linear app or an API key"}.
          <a class="text-link-ink" href="/config/connections"
            >Add one in Connections</a
          >.
        </p>
      {:else}
        <OptionGroup
          aria-label="Connection"
          class="col-span-full"
          data-bind-connection
          bind:value={
            () => [pickConnection],
            (next) => {
              const [chosen] = next;
              if (chosen && chosen !== pickConnection) {
                pickConnection = chosen;
                readTargets(chosen);
              }
            }
          }
        >
          {#each usable as each (each.name)}
            <OptionGroupItem value={each.name}
              >{each.name} · {each.account}</OptionGroupItem
            >
          {/each}
        </OptionGroup>
        {#if targets}
          <NativeSelect.Root
            aria-label={picking === "github" ? "Repository" : "Team"}
            class="col-span-full w-full"
            data-bind-target
            bind:value={
              () => pickTarget,
              (next) => {
                pickTarget = next;
                readProjects(pickConnection, next);
              }
            }
          >
            {#each targets as each (each.id)}
              <NativeSelect.Option value={each.id}
                >{each.name}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
          {#if picking === "github"}
            {@render projectPick()}
          {/if}
        {:else if !targetsFault}
          <p
            data-slot="note"
            class="mark-line col-span-full flex items-start gap-space-2 type-meta wrap-anywhere text-ink-muted"
          >
            <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
              >Reading what {pickConnection} reaches…</span
            >
          </p>
        {/if}
      {/if}
      <div class="col-span-full flex justify-end gap-space-2">
        <Button
          label="Cancel"
          onclick={() => {
            picking = null;
            bindFault = null;
          }}
          size="sm"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={!(pickConnection && pickTarget)}
          label="Use {TRACKER_NAMES[picking]}"
          pending={binding}
          pendingLabel="Syncing…"
          size="sm"
          type="submit"
        />
      </div>
    </form>
    <RowFault
      again={() => readTargets(pickConnection)}
      data-targets-fault
      reason={targetsFault}
    />
    <RowFault
      again={() => readProjects(pickConnection, pickTarget)}
      data-projects-fault
      reason={ghFault}
    />
  {:else if tracker?.binding}
    {@const bound = tracker.binding}
    <!-- Its repository or team, and Change: another connection or target, its links kept for the same one. -->
    <div class="flex min-w-0 items-start justify-between gap-space-2 pt-space-1">
      <p
        class="mark-line flex min-w-0 items-start gap-space-2 type-label wrap-anywhere text-ink-strong"
        data-bound={bound.provider}
      >
        <span class="mark-cell"
          ><ProviderLogo provider={bound.provider} size="control" /></span
        >
        <a
          data-slot="bound-target"
          class="min-w-0 text-link-ink no-underline wrap-anywhere hover:underline hover:underline-offset-(--underline-offset)"
          href={bound.targetUrl}
          rel="noreferrer"
          target="_blank">{bound.targetName}</a
        >
      </p>
      <Button
        data-change-tracker
        label="Change"
        onclick={() => pick(bound.provider)}
        size="xs"
        variant="ghost"
      />
    </div>
    <p
      data-slot="note"
      class="type-meta text-ink-muted"
      data-tracker-state={bound.state}
    >
      Through {bound.connection} · {bound.linked}
      {bound.linked === 1 ? "task" : "tasks"} linked ·
      {#if bound.state === "syncing"}
        <span class="me-space-1 inline-flex align-middle" data-box
          ><LiveDot /></span
        >
      {/if}{syncWords(bound)}
    </p>
    {#if bound.githubProject}
      <p data-slot="note" class="type-meta text-ink-muted" data-github-project>
        Stages show on <a
          class="text-link-ink"
          href={bound.githubProject.url}
          rel="noreferrer"
          target="_blank">{bound.githubProject.title}</a
        >, in its Status.
      </p>
    {/if}
    {#if bound.githubProjectReason}
      <p
        data-slot="note"
        class="type-meta text-ink-muted"
        data-github-project-reason
      >
        {bound.githubProjectReason}
      </p>
    {/if}
    <RowFault
      again={syncNow}
      againLabel="Sync now"
      againPending="Syncing…"
      data-tracker-fault
      reason={bound.reason}
    />
  {/if}
  <RowFault data-bind-fault reason={bindFault ?? trackerFault} />
{/snippet}

{#snippet repositoryValue()}
  {#if project.links.length > 0}
    {#each project.links as link (link)}
      <p class="m-0 type-label wrap-anywhere text-ink-strong">
        <bdi>{link}</bdi>
      </p>
    {/each}
  {:else}
    <p data-slot="note" class="m-0 type-meta text-ink-muted">
      {projectWords.noRepository}
    </p>
  {/if}
{/snippet}

<!-- Work lands: four equal segments, each its glyph and a word; the segment asked breathes until the hub answers. -->
{#snippet landsValue()}
  <ToggleGroup.Root
    aria-labelledby="{uid}-lands"
    class="grid w-full grid-cols-4"
    data-pending={landsAsked === null ? undefined : ""}
    type="single"
    bind:value={
      () => lands,
      (next) => {
        if (next) {
          askLands(next as LandsMode);
        }
      }
    }
  >
    {#each LANDS_MODES as mode (mode)}
      {@const Icon = LANDS[mode].icon}
      <ToggleGroup.Item class="justify-center gap-space-1" value={mode}>
        <Icon class="size-icon-sm" />{LANDS[mode].label}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
  <p data-slot="note" class="m-0 type-meta text-ink-muted" data-lands-says>
    {LANDS[lands].says}
  </p>
  <RowFault
    again={() => (landsTried ? setLands(landsTried) : undefined)}
    data-lands-fault
    reason={landsFault}
  />
{/snippet}

<!-- Large files: each origin's own LFS, or where the project declared they live, bound to a connection with a key. -->
{#snippet lfsValue()}
  {#if project.lfsUrl}
    <p
      class="m-0 type-label wrap-anywhere text-ink-strong"
      data-lfs-url
    >
      <bdi>{project.lfsUrl}</bdi>
    </p>
    <p data-slot="note" class="m-0 type-meta text-ink-muted">
      {lfsWords.declared(project.lfsConnection ?? "")}
    </p>
  {:else}
    <p data-slot="note" class="m-0 type-meta text-ink-muted">{lfsWords.own}</p>
  {/if}
  {#if lfsEditing}
    <form
      data-slot="add"
      class="flex flex-col gap-space-2 pt-space-2"
      data-lfs-form
      onsubmit={(event) => {
        event.preventDefault();
        saveLfs({ url: lfsUrl.trim(), connection: lfsConnection });
      }}
      transition:unfold
    >
      {#if lfsKeyed.length > 0}
        <OptionGroup
          aria-label={lfsWords.connection}
          bind:value={
            () => [lfsConnection],
            (next) => {
              lfsConnection = next[0] ?? lfsConnection;
            }
          }
        >
          {#each lfsKeyed as each (each.name)}
            <OptionGroupItem value={each.name}>{each.name}</OptionGroupItem>
          {/each}
        </OptionGroup>
      {:else if lfsListed}
        <p data-slot="note" class="m-0 type-meta text-ink-muted">
          {lfsWords.noConnections}
          <a class="text-link-ink" href="/config/connections"
            >{lfsWords.connectionsLink}</a
          >.
        </p>
      {/if}
      <Input
        aria-label={lfsWords.url}
        autocomplete="off"
        placeholder={lfsWords.urlPlaceholder}
        spellcheck="false"
        text="label"
        type="url"
        bind:value={lfsUrl}
      />
      <div class="flex justify-end gap-space-2">
        <Button
          label={lfsWords.cancel}
          onclick={stopLfs}
          size="sm"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={!(lfsConnection && lfsUrl.trim())}
          label={lfsWords.save}
          pending={lfsPending}
          pendingLabel={lfsWords.saving}
          size="sm"
          type="submit"
        />
      </div>
    </form>
  {:else}
    <div class="flex flex-wrap gap-space-2">
      <Button
        class="self-start"
        data-lfs-declare
        label={project.lfsUrl ? lfsWords.change : lfsWords.declare}
        onclick={startLfs}
        size="xs"
        variant="ghost"
      />
      {#if project.lfsUrl}
        <Button
          data-lfs-clear
          label={lfsWords.clear}
          onclick={() => saveLfs(null)}
          pending={lfsPending}
          pendingLabel={lfsWords.clearing}
          size="xs"
          variant="ghost"
        />
      {/if}
    </div>
  {/if}
  <RowFault
    again={() => (lfsTried === undefined ? undefined : saveLfs(lfsTried))}
    data-lfs-fault
    reason={lfsFault}
  />
{/snippet}

<!-- Account: the fleet's routing or one account, each a chip; its note only once one is named. -->
{#snippet accountValue()}
  <OptionGroup
    aria-label={projectAccountWords.select}
    data-account-pick
    disabled={accountAsked !== undefined}
    bind:value={
      () => [accountNow ?? ""],
      (next) => {
        const [chosen] = next;
        if (chosen !== undefined) {
          setAccount(chosen || null);
        }
      }
    }
  >
    <OptionGroupItem value="">{projectAccountWords.routing}</OptionGroupItem>
    {#each accountChoices as each (each.id)}
      <OptionGroupItem value={each.id}>{each.name}</OptionGroupItem>
    {/each}
  </OptionGroup>
  {#if accountName}
    <p data-slot="note" class="m-0 type-meta text-ink-muted">
      {projectAccountWords.set(accountName)}
    </p>
  {/if}
  {#if accountSignedOut && accountName}
    <p
      data-slot="note"
      class="m-0 type-meta text-status-fail-ink"
      data-account-signed-out
    >
      {projectAccountWords.signedOut(accountName)}
    </p>
  {/if}
  <RowFault
    again={() => setAccount(accountTried)}
    data-account-fault
    reason={accountFault}
  />
{/snippet}

{#snippet atLimitValue()}
  <ToggleGroup.Root
    aria-labelledby="{uid}-at-limit"
    class="max-w-full self-start"
    data-pending={atLimitAsked === null ? undefined : ""}
    type="single"
    bind:value={
      () => atLimit,
      (next) => {
        if (next) {
          setAtLimit(next as ProjectAtLimit);
        }
      }
    }
  >
    {#each PROJECT_AT_LIMIT as way (way)}
      <ToggleGroup.Item value={way}
        >{projectAccountWords.atLimit[way]}</ToggleGroup.Item
      >
    {/each}
  </ToggleGroup.Root>
  <p data-slot="note" class="m-0 type-meta text-ink-muted">
    {projectAccountWords.atLimit.says[atLimit]}
  </p>
  <RowFault
    again={() => (atLimitTried ? setAtLimit(atLimitTried) : undefined)}
    data-at-limit-fault
    reason={atLimitFault}
  />
{/snippet}

<section
  aria-label="Project details"
  class="@container/details max-w-(--details-max) min-w-0 pt-space-1 pe-space-6 pb-space-3 ps-space-7 max-desk:max-w-none max-desk:pe-space-5 max-desk:ps-space-5"
  data-project-details={project.id}
  style:--details-max={"calc(var(--c-project-details-measure) + var(--space-7) + var(--space-6))"}
  transition:unfold
  {@attach escapes}
>
  <div
    data-slot="tile"
    class="grid rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-raised"
    style:--row-cols="var(--c-project-details-label-w) minmax(0, 1fr)"
  >
    <!-- Each group set off from the one before by a hairline. -->
    <div
      class="grid divide-y divide-border-hairline [&>*]:py-space-4 [&>*:first-child]:pt-0"
    >
      <div data-slot="group" data-group="places" class="grid gap-space-3">
        {@render row(projectWords.placesLabel, "place")}
      </div>

      <div data-slot="group" data-group="decides" class="grid gap-space-3">
        <!-- Who decides, with Review before done under it: who finishes work is the same question. -->
        <DecidesRow projectId={project.id}>
          <div class="flex flex-col gap-space-1" data-detail="review">
            <label
              class="type-label flex items-center gap-space-2 text-ink-strong"
            >
              <Switch
                data-review-switch
                disabled={reviewAsked !== null}
                bind:checked={
                  () => reviewAsked ?? project.review, (next) => setReview(next)
                }
              />
              <span>Review before done</span>
            </label>
            <p data-slot="note" class="m-0 type-meta text-ink-muted">
              Only you move a task to done; landed work waits in review.
            </p>
            <RowFault
              again={() => setReview(!project.review)}
              data-review-fault
              reason={reviewFault}
            />
          </div>
        </DecidesRow>
      </div>

      <div data-slot="group" data-group="tasks" class="grid gap-space-3">
        <div
          data-slot="row"
          class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
          data-detail="tracker"
        >
          <p
            data-slot="project-details-label"
            class="type-label pt-space-1 text-ink-muted"
            id="{uid}-tracker"
          >
            {projectWords.tasksLabel}
          </p>
          <div
            data-slot="value"
            class="flex min-w-0 flex-col gap-space-2 pt-space-1"
          >
            {@render tasksValue()}
          </div>
        </div>
      </div>

      {#if holdsCode}
        <div data-slot="group" data-group="code" class="grid gap-space-4">
          {@render row(
            project.links.length > 1 ? "Repositories" : "Repository",
            "repository"
          )}
          {@render row(projectWords.landsLabel, "lands")}
          {@render row(lfsWords.label, "lfs")}
        </div>
      {/if}

      <div data-slot="group" data-group="account" class="grid gap-space-4">
        {@render row(projectAccountWords.label, "account")}
        {#if project.account}
          {@render row(projectAccountWords.atLimit.label, "at-limit")}
        {/if}
      </div>
    </div>

    <div data-slot="foot" class="flex justify-end pt-space-3">
      <!-- Each row commits on its own: Done only folds the tray, so it
           stays quiet beside the head's Ask Caw. -->
      <Button
        data-details-done
        label="Done"
        onclick={onclose}
        size="sm"
        variant="secondary"
      />
    </div>
  </div>
</section>
