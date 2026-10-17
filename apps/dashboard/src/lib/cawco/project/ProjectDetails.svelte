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
   *   the hub say they can't be removed; a held workspace keeps its Continue
   *   and Discard.
   * - Repository: read from the folder's remote, said so.
   * - Work lands: where its attempts land when their task says nothing.
   * - Caw: his lead switch (CawLeadSwitch), its ways off with it.
   * - Review before done.
   *
   * A change shows what was asked while the hub answers (the segment's thumb
   * breathes, the switch waits), and the row then shows the hub's value: a
   * refusal puts it back, with the hub's words under the row and Try again
   * (RowFault). Every value is the project as the hub last said it, which
   * `projects.changed` brings to every open dashboard.
   */
  import { LANDS_MODES, type LandsMode, machineLabel } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import {
    addProjectPlace,
    archiveWorkspace,
    cawco,
    editProject,
    type HeldPlace,
    type Machine,
    type ProjectRow,
    removeProjectPlace,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { conversationHref } from "#lib/cawco/links.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconChevronDown, IconPlus } from "#lib/icons.js";
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

  /**
   * A held workspace's Discard asks in the list, beside its row (The Open
   * Page Rule); Continue opens the session its work ran in.
   */
  const placeAsker = new Asker<AskHereRequest>();
  async function askDiscard(placeId: string, held: HeldPlace, where: string) {
    await placeAsker.ask({
      at: placeId,
      title: "Discard this held workspace?",
      body: `Its clone holds ${held.holds}. Discard writes that to a carry on ${where} (in ~/.cawco/carries), then deletes the clone, its boundary and its records.`,
      confirmLabel: "Discard",
      destructive: true,
      pendingLabel: "Discarding…",
      run: () => archiveWorkspace(held.workspaceId, { discard: true }),
    });
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

<!-- Under the head, from where its words start, as the forget tray stands
     (`.head-forget`): the head's own leading padding, as wide as the
     dialog it replaces. A phone's head pads by --space-5. -->
<!-- literal: 32rem, 6.5rem, 10rem, 30px, 14px -->
<section
  aria-label="Project details"
  class="@container/details max-w-(--details-max) min-w-0 pt-space-1 pr-space-6 pb-space-3 pl-space-7 max-desk:max-w-none max-desk:pr-space-5 max-desk:pl-space-5"
  data-project-details={project.id}
  style:--details-max="calc(32rem + var(--space-7) + var(--space-6))"
  transition:unfold
  {@attach escapes}
>
  <div
    data-slot="tile"
    class="grid gap-space-4 rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-raised"
    style:--row-cols="6.5rem minmax(0, 1fr)"
  >
    <!-- Place: where it lives, its places, and adding one. -->
    <div data-slot="row" class="grid grid-cols-(--row-cols) items-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1" data-detail="place" bind:this={placesRow}>
      <p data-slot="project-details-label" class="type-label pt-space-1 text-ink-muted">Place</p>
      <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
        <!-- mark-line: the machine's mark heads its whole folder, which wraps (the head's line cuts it short): it stands in a mark cell, one line tall, on the first line -->
        <p class="type-label flex min-w-0 items-start gap-space-2 wrap-anywhere text-ink-strong">
          {#if machine}
            <span class="mark-cell"><OsMark class="size-icon-sm flex-none" os={machine.os} /></span>
          {/if}
          <span class="min-w-0" data-place-words>{place}</span>
        </p>
        <p data-slot="note" class="type-meta text-ink-muted">
          Its folder stays where it is; CawCo can't move it.
        </p>
        <div class="flex flex-wrap items-center justify-between gap-space-2 pt-space-1">
          <button
            aria-expanded={listOpen}
            class="group press-tint mark-line type-label -mx-space-1 inline-flex cursor-pointer items-center gap-space-1 rounded-xs border-none border-current bg-transparent px-space-1 py-space-row text-ink-strong transition-[background-color] dur-control ease-out hover:bg-surface-hover"
            style:--chev="14px"
            data-places-toggle
            onclick={() => {
              listOpen = !listOpen;
            }}
            type="button"
          >
            <span data-slot="num"
              >{checkouts} {checkouts === 1 ? "place" : "places"}</span
            >
            <IconChevronDown
              data-chev
              class="size-(--chev) text-ink-muted transition-[rotate] dur-control ease-out group-aria-expanded:rotate-180"
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
              <li data-place={each.id} class="flex min-w-0 flex-col gap-space-row">
                <div class="flex min-w-0 items-center gap-space-2">
                  <div class="flex min-w-0 flex-auto flex-col gap-space-row">
                    <span data-slot="host" class="type-label text-ink-strong"
                      >{each.kind === "hub"
                        ? "The hub"
                        : hostWords(each.machineId)}</span
                    >
                    <span
                      data-slot="path"
                      class="type-meta truncate text-start text-ink-muted"
                      title={each.path}
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
                {#if each.held}
                  {@const held = each.held}
                  <span class="type-meta text-ink-strong">Held: {held.holds} · {held.size}</span>
                  <span class="flex gap-space-2 pt-space-1">
                    {#if held.instanceId}
                      <Button
                        href={conversationHref(
                          held.instanceId,
                          cawco.instanceIndex
                        )}
                        size="xs"
                        variant="secondary">Continue</Button
                      >
                    {/if}
                    <Button
                      onclick={() =>
                        askDiscard(each.id, held, hostWords(each.machineId))}
                      size="xs"
                      variant="destructive">Discard</Button
                    >
                  </span>
                  <AskHere asker={placeAsker} at={each.id} />
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
            style:--add-cols="minmax(0, 10rem) minmax(0, 1fr)"
            style:--field-h="30px"
            onsubmit={(event) => {
              event.preventDefault();
              add();
            }}
            transition:unfold
          >
            <NativeSelect.Root
              aria-label="Machine"
              class="w-full"
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
              class="h-(--field-h) text-label"
              placeholder="/absolute/path on that machine"
              spellcheck="false"
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
    <div data-slot="row" class="grid grid-cols-(--row-cols) items-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1" data-detail="repository">
      <p data-slot="project-details-label" class="type-label pt-space-1 text-ink-muted">Repository</p>
      <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
        {#if project.remote}
          <p class="type-label flex min-w-0 items-center gap-space-2 wrap-anywhere text-ink-strong"><bdi>{project.remote}</bdi></p>
          <p data-slot="note" class="type-meta text-ink-muted">From the folder's remote.</p>
        {:else}
          <p data-slot="note" class="type-meta text-ink-muted">
            No remote on the folder yet. Add one in the folder and it shows
            here.
          </p>
        {/if}
      </div>
    </div>

    <!-- Work lands: the segment asked breathes until the hub answers. -->
    <div data-slot="row" class="grid grid-cols-(--row-cols) items-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1" data-detail="lands">
      <p data-slot="project-details-label" class="type-label pt-space-1 text-ink-muted" id="{uid}-lands">
        Work lands
      </p>
      <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
        <ToggleGroup.Root
          aria-labelledby="{uid}-lands"
          class="max-w-full flex-wrap self-start"
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
        <p data-slot="note" class="type-meta text-ink-muted" data-lands-says>{LANDS[lands].says}</p>
        <RowFault
          again={() => (landsTried ? setLands(landsTried) : undefined)}
          data-lands-fault
          reason={landsFault}
        />
      </div>
    </div>

    <!-- Caw: his own switch, its ways off with it. -->
    <div data-slot="row" class="grid grid-cols-(--row-cols) items-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1" data-detail="caw">
      <p data-slot="project-details-label" class="type-label pt-space-1 text-ink-muted">Caw</p>
      <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
        <CawLeadSwitch
          label="Leads this project"
          {lead}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </div>

    <!-- Review before done. -->
    <div data-slot="row" class="grid grid-cols-(--row-cols) items-start gap-x-space-3 gap-y-space-1 @max-details/details:grid-cols-1" data-detail="review">
      <p data-slot="project-details-label" class="type-label pt-space-1 text-ink-muted">Review</p>
      <div data-slot="value" class="flex min-w-0 flex-col gap-space-1 pt-space-1">
        <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch component renders a native button the label names; Biome can't see through the component boundary -->
        <label class="type-label flex cursor-pointer items-center gap-space-2 text-ink-strong">
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
           stays quiet beside the head's New session. -->
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
  /* residual: unmapped */
  /* The path reads from its end: the folder's tail stays when it is cut. */
  [data-slot="path"] {
    direction: rtl;
  }
  /* residual: foreign-dom */
  [data-slot="value"] :global([data-slot="lead-switch"]) {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* residual: keyframes */
  /* Asked, not yet answered: the thumb breathes on the live-work loop. */
  [data-slot="value"] :global(.kit-segmented[data-pending] .kit-thumb) {
    animation: details-breath var(--breath) var(--ease-in-out) infinite;
  }
  @keyframes -global-details-breath {
    50% {
      opacity: 0.45;
    }
  }
</style>
