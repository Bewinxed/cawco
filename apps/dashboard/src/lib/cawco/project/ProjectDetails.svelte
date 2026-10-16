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

<section
  aria-label="Project details"
  class="details"
  data-project-details={project.id}
  transition:unfold
  {@attach escapes}
>
  <div class="tile">
    <!-- Place: where it lives, its places, and adding one. -->
    <div class="row" data-detail="place" bind:this={placesRow}>
      <p class="label">Place</p>
      <div class="value">
        <!-- mark-line: the machine's mark heads its whole folder, which wraps (the head's line cuts it short): it stands in a mark cell, one line tall, on the first line -->
        <p class="fact place-fact">
          {#if machine}
            <span class="mark-cell"><OsMark class="os" os={machine.os} /></span>
          {/if}
          <span class="fact-words" data-place-words>{place}</span>
        </p>
        <p class="note">Its folder stays where it is; CawCo can't move it.</p>
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
            <span class="num"
              >{checkouts} {checkouts === 1 ? "place" : "places"}</span
            >
            <IconChevronDown class="chev" />
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
                    <span class="host"
                      >{each.kind === "hub"
                        ? "The hub"
                        : hostWords(each.machineId)}</span
                    >
                    <span class="path" title={each.path}
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
                {#if each.held}
                  {@const held = each.held}
                  <span class="holds">Held: {held.holds} · {held.size}</span>
                  <span class="held-acts">
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
              class="add-path h-[30px] text-label"
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

    <!-- Repository: a fact, with where it comes from. -->
    <div class="row" data-detail="repository">
      <p class="label">Repository</p>
      <div class="value">
        {#if project.remote}
          <p class="fact"><bdi>{project.remote}</bdi></p>
          <p class="note">From the folder's remote.</p>
        {:else}
          <p class="note">
            No remote on the folder yet. Add one in the folder and it shows
            here.
          </p>
        {/if}
      </div>
    </div>

    <!-- Work lands: the segment asked breathes until the hub answers. -->
    <div class="row" data-detail="lands">
      <p class="label" id="{uid}-lands">Work lands</p>
      <div class="value">
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
        <p class="note" data-lands-says>{LANDS[lands].says}</p>
        <RowFault
          again={() => (landsTried ? setLands(landsTried) : undefined)}
          data-lands-fault
          reason={landsFault}
        />
      </div>
    </div>

    <!-- Caw: his own switch, its ways off with it. -->
    <div class="row" data-detail="caw">
      <p class="label">Caw</p>
      <div class="value">
        <CawLeadSwitch
          label="Leads this project"
          {lead}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </div>

    <!-- Review before done. -->
    <div class="row" data-detail="review">
      <p class="label">Review</p>
      <div class="value">
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
        <p class="note">
          Only you move a task to done; landed work waits in review.
        </p>
        <RowFault
          again={() => setReview(!project.review)}
          data-review-fault
          reason={reviewFault}
        />
      </div>
    </div>

    <div class="foot">
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
  @media (max-width: 899px) {
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
    inline-size: var(--icon-sm, 14px);
    block-size: var(--icon-sm, 14px);
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
  .holds {
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  .held-acts {
    display: flex;
    gap: var(--space-2);
    padding-block-start: var(--space-1);
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
  .value :global(.kit-segmented.lands) {
    flex-wrap: wrap;
    align-self: flex-start;
    max-inline-size: 100%;
  }
  /* Asked, not yet answered: the thumb breathes on the live-work loop. */
  .value :global(.kit-segmented.lands[data-pending] .kit-thumb) {
    animation: details-breath var(--breath) var(--ease-in-out) infinite;
  }
  @keyframes -global-details-breath {
    50% {
      opacity: 0.45;
    }
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
