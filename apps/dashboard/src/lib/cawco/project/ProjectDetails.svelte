<script lang="ts">
  /**
   * The project's details, changed where they are shown (DESIGN.md, The Stay
   * In Context Rule; project-details-wireframe.md): a tray that unfolds under
   * the project head, in the forget tray's frame (ForgetProjectTray, StopTray),
   * with the board live under it (The Open Page Rule). The head's place line
   * opens it, `· N places` opens it at its places, and so does ⋯ › Project
   * details…; Done, Escape or the line again folds it.
   *
   * One row per fact, each changed on its own row:
   * - Place: where it lives, which CawCo can't move, and its places: a
   *   checkout other than the primary can be removed, another added (a
   *   machine and a folder on it). The primary and the project's folder on
   *   the hub say they can't be removed. A held workspace is its delegating
   *   session's to continue or discard, never yours (hub work-items.ts
   *   `heldNotice`).
   * - Repository: read from the folder's remote, said so.
   * - Large files: each origin's own LFS, or where the project declared
   *   they live, bound to a connection with a key (hub project-edit.ts).
   * - Work lands: where its attempts land when their task says nothing.
   * - Merge checks: the steps the hub runs before it merges work, read from
   *   the project folder's gate.md (`GET /api/projects/:id/gate`), with a
   *   link to edit the file.
   * - Tasks: where they live (WORDS.md: tracker). CawCo's files alone, or
   *   GitHub Issues or Linear through a connection, on one repository or
   *   team: picked, then bound with Use. With GitHub, a GitHub Project too
   *   (the one linked to the repository first), and each stage's option of
   *   its Status field (the one named as the stage first): its open stages
   *   then show on GitHub, which an issue's open and closed cannot carry.
   *   Bound, it names the target, the connection, how many tasks are linked
   *   and how its sync stands, the tracker's refusal in its words with Try
   *   again, and the GitHub Project, or GitHub's words for why there is none.
   * - Caw: his lead switch (CawLeadSwitch), its ways off with it.
   * - Review before done.
   *
   * A change shows what was asked while the hub answers (the segment's thumb
   * breathes, the switch waits), and the row then shows the hub's value: a
   * refusal puts it back, with the hub's words under the row and Try again
   * (RowFault). Every value is the project as the hub last said it, which
   * `projects.changed` brings to every open dashboard.
   */
  import {
    type ConnectionView,
    type DeclaredStep,
    type GithubProjectChoice,
    type IssueTracker,
    LANDS_MODES,
    type LandsMode,
    lfsWords,
    machineLabel,
    type ProjectGate,
    projectWords,
    statusOptionFor,
    TRACKER_NAMES,
    type Tracker,
    type TrackerBindingView,
    type TrackerTarget,
    type TrackerView,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import {
    addProjectPlace,
    cawco,
    editProject,
    type Machine,
    type ProjectRow,
    readConnections,
    removeProjectPlace,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import {
    folderFileHref,
    githubProjects,
    readGate,
    readStages,
    readTracker,
    send,
    setTracker,
    syncTracker,
    trackerTargets,
  } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconChevronDown, IconPlus } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import CawLeadSwitch from "./CawLeadSwitch.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    project,
    machine,
    lead,
    place,
    placesAsked = 0,
    onclose,
  }: {
    project: ProjectRow;
    /** The primary checkout's machine; null while it has none, or it left. */
    machine: Machine | null;
    lead: CawLead;
    /** Where it lives, in the head's own words. */
    place: string;
    /** Each time `· N places` asks: its places list opens, in view. */
    placesAsked?: number;
    onclose: () => void;
  } = $props();

  const uid = $props.id();

  /** What each way of landing does (core `LandsMode`), under its segments. */
  const LANDS: Record<LandsMode, { label: string; says: string }> = {
    main: { label: "Main", says: "Onto its default branch." },
    branch: { label: "Branch", says: "To a branch of its own on origin." },
    pr: { label: "Pull request", says: "To its branch, with a pull request." },
    none: { label: "Nowhere", says: "No commits: its outputs are the work." },
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
      await editProject(project.id, { lands: next });
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

  /* ── Merge checks ───────────────────────────────────────────────── */

  /** The project's gate.md as the hub last read it, read when the details open. */
  type GateRead =
    | { state: "reading" }
    | { state: "failed"; reason: string }
    | { state: "read"; gate: ProjectGate };

  let gateRead = $state<GateRead>({ state: "reading" });
  /** Which read is the latest: an older one answering late is dropped. */
  let gateAsk = 0;

  async function loadGate(projectId: string): Promise<void> {
    gateAsk += 1;
    const asked = gateAsk;
    gateRead = { state: "reading" };
    try {
      const { gate } = await readGate(projectId);
      if (asked === gateAsk) {
        gateRead = { state: "read", gate };
      }
    } catch (error) {
      if (asked === gateAsk) {
        gateRead = { state: "failed", reason: failureWords(error) };
      }
    }
  }

  // Read again when the details show another project.
  $effect(() => {
    loadGate(project.id);
  });

  /** What the row draws: a declared gate naming no step reads as none. */
  const gateShown = $derived.by(() => {
    if (gateRead.state !== "read") {
      return gateRead.state;
    }
    const { gate } = gateRead;
    return gate.kind === "declared" && gate.steps.length === 0
      ? "none"
      : gate.kind;
  });

  const UNITS = [
    { sec: 3600, unit: "h" },
    { sec: 60, unit: "m" },
  ] as const;
  /** Seconds in the largest unit gate.md writes that holds them whole: 90s, 10m, 1h. */
  const durationWords = (seconds: number): string => {
    const fit = UNITS.find(({ sec }) => seconds % sec === 0);
    return fit ? `${seconds / fit.sec}${fit.unit}` : `${seconds}s`;
  };

  /** A step's facts, those that apply, joined as its meta line says them. */
  const stepFacts = (step: DeclaredStep): string =>
    [
      step.inputs?.length ? `on ${step.inputs.join(", ")}` : null,
      step.targetMap ? `builds what ${step.targetMap} maps a change to` : null,
      step.needs ? `needs ${step.needs}` : null,
      step.timeoutSec ? `within ${durationWords(step.timeoutSec)}` : null,
      step.stopsRest ? "stops the rest if it fails" : null,
    ]
      .filter(Boolean)
      .join(" · ");

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

  onMount(() => {
    readTracker(project.id).then(
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
      const read = (await trackerTargets(connection)).targets;
      if (pickConnection !== connection) {
        return;
      }
      targets = read;
      const own = project.remote?.startsWith("github.com/")
        ? project.remote.slice("github.com/".length).toLowerCase()
        : undefined;
      const bound =
        tracker?.binding?.provider === picking
          ? tracker.binding.target
          : undefined;
      pickTarget =
        read.find((each) => each.id === bound)?.id ??
        read.find((each) => each.id.toLowerCase() === own)?.id ??
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
        githubProjects(connection, repo),
        readStages(project.id),
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
      const { connections } = await send<{ connections: ConnectionView[] }>(
        "/api/connections"
      );
      usable = connections.filter(
        (each) =>
          each.service.toLowerCase() === next &&
          (each.auth === "app" || each.auth === "bearer")
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
      tracker = await setTracker(project.id, asked);
      picking = null;
    } catch (error) {
      bindFault = failureWords(error);
    } finally {
      binding = false;
    }
  }

  async function syncNow(): Promise<void> {
    tracker = await syncTracker(project.id);
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
      await editProject(project.id, { review: next });
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
      connections = await readConnections();
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
      await editProject(project.id, { lfs: next });
      lfsEditing = false;
    } catch (error) {
      // The typed URL stays, the hub's words under it.
      lfsFault = failureWords(error);
    } finally {
      lfsPending = false;
    }
  }

  /* ── Places ─────────────────────────────────────────────────────── */

  let listOpen = $state(false);
  let placesRow = $state<HTMLElement | null>(null);

  // `· N places` asked: the list opens, and the row comes into view once
  // the tray has drawn it.
  $effect(() => {
    if (placesAsked === 0) {
      return;
    }
    listOpen = true;
    const frame = requestAnimationFrame(() =>
      placesRow?.scrollIntoView({ block: "nearest" })
    );
    return () => cancelAnimationFrame(frame);
  });
  /** Its places on machines, as the head's line counts them. */
  const checkouts = $derived(
    project.places.filter((each) => each.kind !== "hub").length
  );
  const hostOf = (machineId: string) =>
    cawco.machines.find((row) => row.machineId === machineId);
  const hostWords = (machineId: string) => {
    const host = hostOf(machineId);
    return host ? machineLabel(host.hostname) : "A machine not joined";
  };

  /** A place whose Remove is on its way, and why the last one was refused, by place. */
  let removing = $state<string | null>(null);
  let removeFault = $state<{ at: string; reason: string } | null>(null);

  async function remove(placeId: string): Promise<void> {
    if (removing) {
      return;
    }
    removing = placeId;
    removeFault = null;
    try {
      await removeProjectPlace(project.id, placeId);
    } catch (error) {
      removeFault = { at: placeId, reason: failureWords(error) };
    } finally {
      removing = null;
    }
  }

  let adding = $state(false);
  let addMachine = $state("");
  let addPath = $state("");
  let addPending = $state(false);
  let addFault = $state<string | null>(null);

  function startAdd(): void {
    adding = true;
    addFault = null;
    addMachine ||= machine?.machineId ?? cawco.machines[0]?.machineId ?? "";
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
      await addProjectPlace(project.id, addMachine, addPath.trim());
      listOpen = true;
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
    class="grid gap-space-4 rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-raised"
    style:--row-cols="var(--c-project-details-label-w) minmax(0, 1fr)"
  >
    <!-- Place: where it lives, its places, and adding one. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="place"
      bind:this={placesRow}
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        Place
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        <!-- mark-line: the machine's mark heads its whole folder, which wraps (the head's line cuts it short): it stands in a mark cell, one line tall, on the first line -->
        <p
          class="type-label flex min-w-0 items-start gap-space-2 wrap-anywhere text-ink-strong"
        >
          {#if machine}
            <span class="mark-cell"
              ><OsMark class="size-icon-sm flex-none" os={machine.os} /></span
            >
          {/if}
          <span class="min-w-0" data-place-words>{place}</span>
        </p>
        <p data-slot="note" class="type-meta text-ink-muted">
          Its folder stays where it is; CawCo can't move it.
        </p>
        <div
          class="flex flex-wrap items-center justify-between gap-space-2 pt-space-1"
        >
          <button
            aria-expanded={listOpen}
            class="select-none group press-tint mark-line type-label -mx-space-1 inline-flex items-center gap-space-1 rounded-xs border-none border-current bg-transparent px-space-1 py-space-row text-ink-strong transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
            data-places-toggle
            onclick={() => {
              listOpen = !listOpen;
            }}
            type="button"
          >
            <span data-slot="num" class="num"
              >{checkouts} {checkouts === 1 ? "place" : "places"}</span
            >
            <IconChevronDown
              data-chev
              class="size-icon-sm text-ink-muted transition-[rotate] duration-(--dur-control) ease-out group-aria-expanded:rotate-180"
            />
          </button>
          {#if !adding}
            <Button
              data-add-place
              icon={IconPlus}
              label="Add a place"
              onclick={startAdd}
              size="xs"
              variant="ghost"
            />
          {/if}
        </div>
        {#if listOpen}
          <ul
            class="m-0 flex list-none flex-col gap-space-2 px-0 pt-space-1 pb-0"
            transition:unfold
          >
            {#each project.places as each (each.id)}
              <li
                data-place={each.id}
                class="flex min-w-0 flex-col gap-space-row"
              >
                <div class="flex min-w-0 items-center gap-space-2">
                  <div class="flex min-w-0 flex-auto flex-col gap-space-row">
                    <span data-slot="host" class="type-label text-ink-strong"
                      >{each.kind === "hub"
                        ? "The hub"
                        : hostWords(each.machineId)}</span
                    >
                    <!-- The path reads from its end: the folder's tail
                         stays when it is cut. -->
                    <span
                      data-slot="path"
                      class="dir-rtl type-meta truncate text-start text-ink-muted"
                      title={each.path}><bdi>{each.path}</bdi></span
                    >
                  </div>
                  {#if each.kind === "checkout" && !each.isPrimary}
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
                </div>
                {#if each.isPrimary}
                  <span class="type-meta text-ink-subtle" data-place-kept
                    >Its primary checkout: it can't be removed, and goes when
                    the project does.</span
                  >
                {:else if each.kind === "hub"}
                  <span class="type-meta text-ink-subtle" data-place-kept
                    >Its folder on the hub: it can't be removed, and goes when
                    the project does.</span
                  >
                {/if}
                <RowFault
                  again={() => remove(each.id)}
                  data-place-fault
                  reason={removeFault?.at === each.id
                    ? removeFault.reason
                    : null}
                />
              </li>
            {/each}
          </ul>
        {/if}
        {#if adding}
          <form
            data-slot="add"
            class="grid grid-cols-(--add-cols) gap-space-2 pt-space-2 @max-details/details:grid-cols-1"
            data-add-place-form
            style:--add-cols={"minmax(0, var(--c-project-details-select-w)) minmax(0, 1fr)"}
            onsubmit={(event) => {
              event.preventDefault();
              add();
            }}
            transition:unfold
          >
            <NativeSelect.Root
              aria-label="Machine"
              class="w-full"
              bind:value={addMachine}
            >
              {#each cawco.machines as host (host.machineId)}
                <NativeSelect.Option value={host.machineId}
                  >{machineLabel(host.hostname)}</NativeSelect.Option
                >
              {/each}
            </NativeSelect.Root>
            <Input
              aria-label="Folder on that machine"
              autocomplete="off"
              placeholder="/absolute/path on that machine"
              spellcheck="false"
              text="label"
              bind:value={addPath}
            />
            <div class="col-span-full flex justify-end gap-space-2">
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
        {/if}
      </div>
    </div>

    <!-- Repository: a fact, with where it comes from. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="repository"
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        Repository
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        {#if project.remote}
          <p
            class="type-label flex min-w-0 items-center gap-space-2 wrap-anywhere text-ink-strong"
          >
            <bdi>{project.remote}</bdi>
          </p>
          <p data-slot="note" class="type-meta text-ink-muted">
            From the folder's remote.
          </p>
        {:else}
          <p data-slot="note" class="type-meta text-ink-muted">
            No remote on the folder yet. Add one in the folder and it shows
            here.
          </p>
        {/if}
      </div>
    </div>

    <!-- Large files: each origin's own LFS, or where the project declared
         they live, bound to a connection with a key. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="lfs"
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        {lfsWords.label}
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        {#if project.lfsUrl}
          <p
            class="type-label flex min-w-0 items-center gap-space-2 wrap-anywhere text-ink-strong"
            data-lfs-url
          >
            <bdi>{project.lfsUrl}</bdi>
          </p>
          <p data-slot="note" class="type-meta text-ink-muted">
            {lfsWords.declared(project.lfsConnection ?? "")}
            {lfsWords.pinned}
          </p>
        {:else}
          <p data-slot="note" class="type-meta text-ink-muted">
            {lfsWords.own}
          </p>
        {/if}
        {#if lfsEditing}
          <form
            data-slot="add"
            class="grid grid-cols-(--add-cols) gap-space-2 pt-space-2 @max-details/details:grid-cols-1"
            data-lfs-form
            style:--add-cols={"minmax(0, var(--c-project-details-select-w)) minmax(0, 1fr)"}
            onsubmit={(event) => {
              event.preventDefault();
              saveLfs({ url: lfsUrl.trim(), connection: lfsConnection });
            }}
            transition:unfold
          >
            <NativeSelect.Root
              aria-label={lfsWords.connection}
              class="w-full"
              disabled={lfsKeyed.length === 0}
              bind:value={lfsConnection}
            >
              {#each lfsKeyed as each (each.name)}
                <NativeSelect.Option value={each.name}
                  >{each.name}</NativeSelect.Option
                >
              {/each}
            </NativeSelect.Root>
            <Input
              aria-label={lfsWords.url}
              autocomplete="off"
              placeholder={lfsWords.urlPlaceholder}
              spellcheck="false"
              text="label"
              type="url"
              bind:value={lfsUrl}
            />
            {#if lfsKeyed.length === 0 && lfsListed}
              <p
                data-slot="note"
                class="col-span-full type-meta text-ink-muted"
              >
                {lfsWords.noConnections}
                <a class="text-link-ink" href="/config/connections"
                  >{lfsWords.connectionsLink}</a
                >.
              </p>
            {/if}
            <div class="col-span-full flex justify-end gap-space-2">
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
          <div class="flex flex-wrap gap-space-2 pt-space-1">
            <Button
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
      </div>
    </div>

    <!-- Work lands: the segment asked breathes until the hub answers. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="lands"
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
        id="{uid}-lands"
      >
        Work lands
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        <ToggleGroup.Root
          aria-labelledby="{uid}-lands"
          class="max-w-full self-start"
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
            <ToggleGroup.Item value={mode}>{LANDS[mode].label}</ToggleGroup.Item
            >
          {/each}
        </ToggleGroup.Root>
        <p data-slot="note" class="type-meta text-ink-muted" data-lands-says>
          {LANDS[lands].says}
        </p>
        <RowFault
          again={() => (landsTried ? setLands(landsTried) : undefined)}
          data-lands-fault
          reason={landsFault}
        />
      </div>
    </div>

    <!-- Merge checks: what the hub runs before it merges work, as gate.md declares it. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="gate"
      data-gate={gateShown}
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        {projectWords.mergeChecks}
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        {#if gateRead.state === "reading"}
          <p
            data-slot="note"
            class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
          >
            <LiveDot /><span>Reading gate.md…</span>
          </p>
        {:else if gateRead.state === "failed"}
          <RowFault
            again={() => loadGate(project.id)}
            data-gate-fault
            reason={gateRead.reason}
          />
        {:else if gateRead.gate.kind === "unreadable"}
          {#each gateRead.gate.problems as problem, at (at)}
            <RowFault data-gate-problem reason={problem} />
          {/each}
          <p data-slot="note" class="type-meta text-ink-muted">
            {projectWords.mergeChecksUnread}
          </p>
        {:else if gateRead.gate.kind === "declared" && gateRead.gate.steps.length > 0}
          <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops list semantics when list styles are removed; an explicit role="list" keeps them (scottohara.me/blog/2019/01/12/lists-and-safari.html) -->
          <ol
            class="m-0 flex list-none flex-col gap-space-2 p-0"
            data-gate-steps
            role="list"
          >
            <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
            {#each gateRead.gate.steps as each, at (at)}
              {@const facts = stepFacts(each)}
              <li class="flex min-w-0 flex-col" data-gate-step>
                <span
                  data-slot="gate-name"
                  class="min-w-0 type-label wrap-anywhere text-ink-strong"
                  >{each.name}</span
                >
                {#if each.command !== each.name}
                  <code
                    class="min-w-0 type-meta font-mono whitespace-pre-wrap wrap-anywhere text-ink-muted"
                    >{each.command}</code
                  >
                {/if}
                {#if facts}
                  <span
                    data-slot="gate-facts"
                    class="min-w-0 type-meta wrap-anywhere text-ink-muted"
                    >{facts}</span
                  >
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          <p data-slot="note" class="type-meta text-ink-muted">
            {projectWords.noMergeChecks}
          </p>
        {/if}
        <Button
          class="self-start"
          pad="none"
          data-gate-edit
          href={folderFileHref(project.id, "gate.md")}
          label="Edit gate.md"
          size="xs"
          variant="link"
        />
      </div>
    </div>

    <!-- Tasks: where they live; a tracker is picked, then bound with Use. -->
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
        Tasks
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        <ToggleGroup.Root
          aria-labelledby="{uid}-tracker"
          class="max-w-full self-start"
          data-pending={binding ? "" : undefined}
          type="single"
          bind:value={
            () => shownTracker,
            (next) => {
              if (next) {
                pick(next as Tracker);
              }
            }
          }
        >
          {#each ["cawco", "github", "linear"] as const as each (each)}
            <ToggleGroup.Item value={each}
              >{TRACKER_NAMES[each]}</ToggleGroup.Item
            >
          {/each}
        </ToggleGroup.Root>
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
                No {service} connection a tracker can use yet: {picking ===
                "github"
                  ? "a GitHub App or a token"
                  : "a Linear app or an API key"}.
                <a class="text-link-ink" href="/config/connections"
                  >Add one in Connections</a
                >.
              </p>
            {:else}
              <NativeSelect.Root
                aria-label="Connection"
                class="w-full"
                data-bind-connection
                bind:value={
                  () => pickConnection,
                  (next) => {
                    pickConnection = next;
                    readTargets(next);
                  }
                }
              >
                {#each usable as each (each.name)}
                  <NativeSelect.Option value={each.name}
                    >{each.name} · {each.account}</NativeSelect.Option
                  >
                {/each}
              </NativeSelect.Root>
              {#if targets}
                <NativeSelect.Root
                  aria-label={picking === "github" ? "Repository" : "Team"}
                  class="w-full"
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
                  <span class="mark-cell"><LiveDot /></span><span
                    class="min-w-0">Reading what {pickConnection} reaches…</span
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
          <p data-slot="note" class="type-meta text-ink-muted">
            New issues there become tasks here, and new tasks become issues.
            Each task's title, description, labels, stage and comments stay one
            with its issue.
          </p>
        {:else if tracker?.binding}
          {@const bound = tracker.binding}
          <!-- Its repository or team, and Change: another connection or target, its links kept for the same one. -->
          <div class="flex min-w-0 items-start justify-between gap-space-2">
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
          <!-- mark-line: a line of facts in running text; while it syncs, the live dot stands in it on vertical-align: middle before the word -->
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
            <p
              data-slot="note"
              class="type-meta text-ink-muted"
              data-github-project
            >
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
        {:else if tracker}
          <p data-slot="note" class="type-meta text-ink-muted">
            Tasks live in the project's files alone.
          </p>
        {/if}
        <RowFault data-bind-fault reason={bindFault ?? trackerFault} />
      </div>
    </div>

    <!-- Caw: his own switch, its ways off with it. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="caw"
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        Caw
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1 type-label text-ink-strong"
      >
        <CawLeadSwitch
          label="Leads this project"
          {lead}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </div>

    <!-- Review before done. -->
    <div
      data-slot="row"
      class="grid grid-cols-(--row-cols) items-box-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1"
      data-detail="review"
    >
      <p
        data-slot="project-details-label"
        class="type-label pt-space-1 text-ink-muted"
      >
        Review
      </p>
      <div
        data-slot="value"
        class="flex min-w-0 flex-col gap-space-1 pt-space-1"
      >
        <label class="type-label flex items-center gap-space-2 text-ink-strong">
          <Switch
            data-review-switch
            disabled={reviewAsked !== null}
            bind:checked={
              () => reviewAsked ?? project.review, (next) => setReview(next)
            }
          />
          <span>Review before done</span>
        </label>
        <p data-slot="note" class="type-meta text-ink-muted">
          Only you move a task to done; landed work waits in review.
        </p>
        <RowFault
          again={() => setReview(!project.review)}
          data-review-fault
          reason={reviewFault}
        />
      </div>
    </div>

    <div data-slot="foot" class="flex justify-end">
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
