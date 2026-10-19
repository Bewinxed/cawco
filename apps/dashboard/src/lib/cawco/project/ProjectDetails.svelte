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
   * - Browser: the project's browser on each machine (ProjectBrowsers):
   *   Open, Stop and Forget sign-ins.
   * - Repository: read from the folder's remote, said so.
   * - Large files: each origin's own LFS, or where the project declared
   *   they live, bound to a connection with a key (hub project-edit.ts).
   * - Work lands: where its attempts land when their task says nothing.
   * - Landing checks: the steps the hub runs before work lands, read from
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
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconChevronDown, IconPlus } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import CawLeadSwitch from "./CawLeadSwitch.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import ProjectBrowsers from "./ProjectBrowsers.svelte";

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

  /* ── Landing checks ─────────────────────────────────────────────── */

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
    <p data-slot="note" class="note" data-projects-refused>{ghRefused}</p>
  {:else if ghProjects}
    <NativeSelect.Root
      aria-label="GitHub Project"
      class="bind-project"
      size="sm"
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
      <p data-slot="note" class="note" data-no-status>
        {chosenProject.title} has no single-select field named Status: stages show
        on GitHub only as open and closed.
      </p>
    {:else if chosenProject}
      {@const options = chosenProject.options}
      <fieldset class="status-map" data-status-map>
        <legend data-slot="note" class="note">
          Each stage's Status on {chosenProject.title}
        </legend>
        {#each stageNames as stage, at (stage)}
          <label class="status-stage" for="{uid}-status-{at}"
            ><bdi>{stage}</bdi></label
          >
          <NativeSelect.Root
            class="status-pick"
            id="{uid}-status-{at}"
            size="sm"
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
    <p data-slot="note" class="note">
      Reading the GitHub Projects {pickConnection} reaches…
    </p>
  {/if}
{/snippet}

<section
  aria-label="Project details"
  class="details"
  data-project-details={project.id}
  transition:unfold
  {@attach escapes}
>
  <div data-slot="tile" class="tile">
    <!-- Place: where it lives, its places, and adding one. -->
    <div data-slot="row" class="row" data-detail="place" bind:this={placesRow}>
      <p data-slot="project-details-label" class="label">Place</p>
      <div data-slot="value" class="value">
        <!-- mark-line: the machine's mark heads its whole folder, which wraps (the head's line cuts it short): it stands in a mark cell, one line tall, on the first line -->
        <p class="fact place-fact">
          {#if machine}
            <span class="mark-cell"><OsMark class="os" os={machine.os} /></span>
          {/if}
          <span class="fact-words" data-place-words>{place}</span>
        </p>
        <p data-slot="note" class="note">
          Its folder stays where it is; CawCo can't move it.
        </p>
        <div class="places-head">
          <button
            aria-expanded={listOpen}
            class="disclose press-tint mark-line"
            data-places-toggle
            onclick={() => {
              listOpen = !listOpen;
            }}
            type="button"
          >
            <span data-slot="num" class="num"
              >{checkouts} {checkouts === 1 ? "place" : "places"}</span
            >
            <IconChevronDown data-chev class="chev" />
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
          <ul class="place-list" transition:unfold>
            {#each project.places as each (each.id)}
              <li data-place={each.id}>
                <div class="place-row">
                  <div class="place-words">
                    <span data-slot="host" class="host"
                      >{each.kind === "hub"
                        ? "The hub"
                        : hostWords(each.machineId)}</span
                    >
                    <span data-slot="path" class="path" title={each.path}
                      ><bdi>{each.path}</bdi></span
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
                  <span class="kept" data-place-kept
                    >Its primary checkout: it can't be removed, and goes when
                    the project does.</span
                  >
                {:else if each.kind === "hub"}
                  <span class="kept" data-place-kept
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
            class="add"
            data-add-place-form
            onsubmit={(event) => {
              event.preventDefault();
              add();
            }}
            transition:unfold
          >
            <NativeSelect.Root
              aria-label="Machine"
              class="add-machine"
              size="sm"
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
              class="add-path h-(--c-btn-h-sm) text-label"
              placeholder="/absolute/path on that machine"
              spellcheck="false"
              bind:value={addPath}
            />
            <div class="add-acts">
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

    <!-- Browser: the project's browser on each machine it ran on. -->
    <div data-slot="row" class="row" data-detail="browser">
      <p data-slot="project-details-label" class="label">Browser</p>
      <div data-slot="value" class="value">
        <ProjectBrowsers projectId={project.id} />
      </div>
    </div>

    <!-- Repository: a fact, with where it comes from. -->
    <div data-slot="row" class="row" data-detail="repository">
      <p data-slot="project-details-label" class="label">Repository</p>
      <div data-slot="value" class="value">
        {#if project.remote}
          <p class="fact"><bdi>{project.remote}</bdi></p>
          <p data-slot="note" class="note">From the folder's remote.</p>
        {:else}
          <p data-slot="note" class="note">
            No remote on the folder yet. Add one in the folder and it shows
            here.
          </p>
        {/if}
      </div>
    </div>

    <!-- Large files: each origin's own LFS, or where the project declared
         they live, bound to a connection with a key. -->
    <div data-slot="row" class="row" data-detail="lfs">
      <p data-slot="project-details-label" class="label">{lfsWords.label}</p>
      <div data-slot="value" class="value">
        {#if project.lfsUrl}
          <p class="fact" data-lfs-url><bdi>{project.lfsUrl}</bdi></p>
          <p data-slot="note" class="note">
            {lfsWords.declared(project.lfsConnection ?? "")}
            {lfsWords.pinned}
          </p>
        {:else}
          <p data-slot="note" class="note">{lfsWords.own}</p>
        {/if}
        {#if lfsEditing}
          <form
            data-slot="add"
            class="add"
            data-lfs-form
            onsubmit={(event) => {
              event.preventDefault();
              saveLfs({ url: lfsUrl.trim(), connection: lfsConnection });
            }}
            transition:unfold
          >
            <NativeSelect.Root
              aria-label={lfsWords.connection}
              class="add-machine"
              disabled={lfsKeyed.length === 0}
              size="sm"
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
              class="add-path h-(--c-btn-h-sm) text-label"
              placeholder={lfsWords.urlPlaceholder}
              spellcheck="false"
              type="url"
              bind:value={lfsUrl}
            />
            {#if lfsKeyed.length === 0 && lfsListed}
              <p data-slot="note" class="note lfs-none">
                {lfsWords.noConnections}
                <a href="/config/connections">{lfsWords.connectionsLink}</a>.
              </p>
            {/if}
            <div class="add-acts">
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
          <div class="lfs-acts">
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
    <div data-slot="row" class="row" data-detail="lands">
      <p data-slot="project-details-label" class="label" id="{uid}-lands">
        Work lands
      </p>
      <div data-slot="value" class="value">
        <ToggleGroup.Root
          aria-labelledby="{uid}-lands"
          class="lands"
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
        <p data-slot="note" class="note" data-lands-says>{LANDS[lands].says}</p>
        <RowFault
          again={() => (landsTried ? setLands(landsTried) : undefined)}
          data-lands-fault
          reason={landsFault}
        />
      </div>
    </div>

    <!-- Landing checks: what the hub runs before work lands, as gate.md declares it. -->
    <div data-slot="row" class="row" data-detail="gate" data-gate={gateShown}>
      <p data-slot="project-details-label" class="label">Landing checks</p>
      <div data-slot="value" class="value">
        {#if gateRead.state === "reading"}
          <p data-slot="note" class="note">Reading gate.md…</p>
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
          <p data-slot="note" class="note">
            Until gate.md is fixed, nothing in this project lands.
          </p>
        {:else if gateRead.gate.kind === "declared" && gateRead.gate.steps.length > 0}
          <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops list semantics when list styles are removed; an explicit role="list" keeps them (scottohara.me/blog/2019/01/12/lists-and-safari.html) -->
          <ol class="gate-steps" data-gate-steps role="list">
            {#each gateRead.gate.steps as each, at (at)}
              {@const facts = stepFacts(each)}
              <li class="gate-check" data-gate-step>
                <span class="gate-name">{each.name}</span>
                {#if each.command !== each.name}
                  <code class="gate-command">{each.command}</code>
                {/if}
                {#if facts}
                  <span class="gate-facts">{facts}</span>
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          <p data-slot="note" class="note">
            Landed with no checks: this project declares none.
          </p>
        {/if}
        <Button
          class="gate-edit"
          data-gate-edit
          href={folderFileHref(project.id, "gate.md")}
          label="Edit gate.md"
          size="xs"
          variant="link"
        />
      </div>
    </div>

    <!-- Tasks: where they live; a tracker is picked, then bound with Use. -->
    <div data-slot="row" class="row" data-detail="tracker">
      <p data-slot="project-details-label" class="label" id="{uid}-tracker">
        Tasks
      </p>
      <div data-slot="value" class="value">
        <ToggleGroup.Root
          aria-labelledby="{uid}-tracker"
          class="trackers"
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
            class="bind"
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
              <p data-slot="note" class="note">
                Reading the {service} connections…
              </p>
            {:else if usable.length === 0}
              <p data-slot="note" class="note" data-no-connection>
                No {service} connection a tracker can use yet: {picking ===
                "github"
                  ? "a GitHub App or a token"
                  : "a Linear app or an API key"}.
                <a href="/config/connections">Add one in Connections</a>.
              </p>
            {:else}
              <NativeSelect.Root
                aria-label="Connection"
                class="bind-connection"
                size="sm"
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
                  class="bind-target"
                  size="sm"
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
                <p data-slot="note" class="note">
                  Reading what {pickConnection} reaches…
                </p>
              {/if}
            {/if}
            <div class="add-acts">
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
          <p data-slot="note" class="note">
            New issues there become tasks here, and new tasks become issues.
            Each task's title, description, labels, stage and comments stay one
            with its issue.
          </p>
        {:else if tracker?.binding}
          {@const bound = tracker.binding}
          <!-- Its repository or team, and Change: another connection or target, its links kept for the same one. -->
          <div class="bound-head">
            <p class="fact bound mark-line" data-bound={bound.provider}>
              <span class="mark-cell"
                ><ProviderLogo provider={bound.provider} /></span
              >
              <a
                class="bound-target"
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
          <p data-slot="note" class="note" data-tracker-state={bound.state}>
            Through {bound.connection} · {bound.linked}
            {bound.linked === 1 ? "task" : "tasks"} linked · {syncWords(bound)}
          </p>
          {#if bound.githubProject}
            <p data-slot="note" class="note" data-github-project>
              Stages show on <a
                href={bound.githubProject.url}
                rel="noreferrer"
                target="_blank">{bound.githubProject.title}</a
              >, in its Status.
            </p>
          {/if}
          {#if bound.githubProjectReason}
            <p data-slot="note" class="note" data-github-project-reason>
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
          <p data-slot="note" class="note">
            Tasks live in the project's files alone.
          </p>
        {/if}
        <RowFault data-bind-fault reason={bindFault ?? trackerFault} />
      </div>
    </div>

    <!-- Caw: his own switch, its ways off with it. -->
    <div data-slot="row" class="row" data-detail="caw">
      <p data-slot="project-details-label" class="label">Caw</p>
      <div data-slot="value" class="value">
        <CawLeadSwitch
          label="Leads this project"
          {lead}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </div>

    <!-- Review before done. -->
    <div data-slot="row" class="row" data-detail="review">
      <p data-slot="project-details-label" class="label">Review</p>
      <div data-slot="value" class="value">
        <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch component renders a native button the label names; Biome can't see through the component boundary -->
        <label class="switch-line">
          <Switch
            data-review-switch
            disabled={reviewAsked !== null}
            bind:checked={
              () => reviewAsked ?? project.review, (next) => setReview(next)
            }
          />
          <span>Review before done</span>
        </label>
        <p data-slot="note" class="note">
          Only you move a task to done; landed work waits in review.
        </p>
        <RowFault
          again={() => setReview(!project.review)}
          data-review-fault
          reason={reviewFault}
        />
      </div>
    </div>

    <div data-slot="foot" class="foot">
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

<style>
  /* Under the head, from where its words start, as the forget tray stands
     (`.head-forget`): the head's own leading padding, as wide as the
     dialog it replaces. A phone's head pads by --space-5. */
  .details {
    container: details / inline-size;
    max-inline-size: calc(32rem + var(--space-7) + var(--space-6));
    min-inline-size: 0;
    padding-block: var(--space-1) var(--space-3);
    padding-inline: var(--space-7) var(--space-6);
  }
  @media (width < 900px) {
    .details {
      max-inline-size: none;
      padding-inline: var(--space-5);
    }
  }
  .tile {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-raised);
  }
  /* Label beside its value; on a narrow tray, over it. */
  .row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    align-items: start;
  }
  @container details (width < 30rem) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .label {
    padding-block-start: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .value {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    padding-block-start: var(--space-1);
  }
  .fact {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .fact :global(.os) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  /* The whole folder, wrapping where it must: the head's line above cuts it
     short, so here it says what the line can't. */
  .place-fact {
    align-items: flex-start;
  }
  .fact-words {
    min-inline-size: 0;
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .places-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-block-start: var(--space-1);
  }
  .disclose {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline: calc(var(--space-1) * -1);
    padding: 2px var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: var(--type-label);
    color: var(--ink-strong);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) {
    .disclose:hover {
      background: var(--surface-hover);
    }
  }
  .disclose :global(.chev) {
    inline-size: 14px;
    block-size: 14px;
    color: var(--ink-muted);
    transition: rotate var(--dur-control) var(--ease-out);
  }
  .disclose[aria-expanded="true"] :global(.chev) {
    rotate: 180deg;
  }
  .place-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-1) 0 0;
    list-style: none;
  }
  .place-list li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .place-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .place-words {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .host {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .path {
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: start;
  }
  .kept {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .add {
    display: grid;
    grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
    gap: var(--space-2);
    padding-block-start: var(--space-2);
  }
  .add :global(.add-machine) {
    inline-size: 100%;
  }
  .lfs-none {
    grid-column: 1 / -1;
  }
  .note a {
    color: var(--link-ink);
  }
  .lfs-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-block-start: var(--space-1);
  }
  .add-acts {
    display: flex;
    grid-column: 1 / -1;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  @container details (width < 30rem) {
    .add {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .value :global(.kit-segmented.lands),
  .value :global(.kit-segmented.trackers) {
    flex-wrap: wrap;
    align-self: flex-start;
    max-inline-size: 100%;
  }
  /* Asked, not yet answered: the thumb breathes on the live-work loop. */
  .value :global(.kit-segmented.lands[data-pending] .kit-thumb),
  .value :global(.kit-segmented.trackers[data-pending] .kit-thumb) {
    @media (prefers-reduced-motion: no-preference) {
      animation: breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  /* The binding's form: its connection and its repository or team, then Use. */
  .bind {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-2);
    padding-block-start: var(--space-2);
  }
  .bind > .note {
    grid-column: 1 / -1;
    overflow-wrap: anywhere;
  }
  .bind :global(.bind-connection),
  .bind :global(.bind-target) {
    inline-size: 100%;
  }
  /* The GitHub Project under the repository, as wide as the form. */
  .bind :global(.bind-project) {
    grid-column: 1 / -1;
    inline-size: 100%;
  }
  /* Each stage beside its Status option; on a narrow tray, over it. */
  .status-map {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    gap: var(--space-1) var(--space-2);
    align-items: center;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .status-map > legend {
    padding: 0 0 var(--space-1);
  }
  .status-stage {
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .status-map :global(.status-pick) {
    inline-size: 100%;
  }
  @container details (width < 30rem) {
    .status-map {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @container details (width < 30rem) {
    .bind {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .note a,
  .bound-target {
    color: var(--link-ink);
  }
  /* The bound repository or team and its Change, as the places' head stands
     their count and Add a place. */
  .bound-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* Its mark on the first line of a name that wraps; as the head's flex
     item it shrinks, so a long unbroken name never pushes Change off. */
  .bound {
    align-items: flex-start;
    min-inline-size: 0;
  }
  .bound-target {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-decoration: none;
  }
  @media (hover: hover) {
    .bound-target:hover {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  }
  .bound :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  /* Landing checks: one entry per step, in gate.md's order; every line
     wraps, a command or path breaking anywhere rather than overflowing. */
  .gate-steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* A step's lines stand on their own line heights: one entry, set apart
     from the next by the list's gap. */
  .gate-check {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .gate-name {
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .gate-command {
    min-inline-size: 0;
    font: var(--type-meta);
    font-family: var(--font-mono);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .gate-facts {
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  /* A text link: its words start on the value column with the rest. */
  .value :global(.gate-edit) {
    align-self: flex-start;
    padding-inline: 0;
  }
  .switch-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-label);
    color: var(--ink-strong);
    cursor: pointer;
  }
  .value :global(.lead-switch) {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .foot {
    display: flex;
    justify-content: flex-end;
  }
</style>
