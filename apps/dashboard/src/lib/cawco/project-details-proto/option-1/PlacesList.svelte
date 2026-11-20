<script lang="ts">
  /**
   * Places & Storage popover body: shows every place at once (starting place,
   * other machine places, hub folder) with machine state, whole paths wrapping
   * at `/`, direct acts (Move · Find folder · Copy to machine, plus Drop on
   * droppable places), an inline Add place well, conditional Repositories, and
   * conditional low-prominence Large-file storage (code projects only).
   */
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    type MachinePresence,
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconDatabase,
    IconExternalLinear,
    IconFolder,
    IconGitRepo,
    IconLayers,
    IconPlus,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import ConnectionPick from "./ConnectionPick.svelte";
  import {
    formatHomePath,
    hubReading,
    isPending,
    pathSegments,
    refusalFor,
    repoHref,
  } from "./format";
  import HubAwayNote from "./HubAwayNote.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import type {
    LargeFiles,
    MachineFact,
    PlaceAct,
    PlacesProps,
  } from "./records";
  import { words } from "./words";

  let { record, changes, onchange, onplace, onreread }: PlacesProps = $props();

  const { asOfTime, reachable } = $derived(hubReading(record));

  // ── Places ordering: starting place, other checkouts, hub folder ─────────
  const orderedPlaces = $derived.by<ProjectPlace[]>(() => {
    const primary: ProjectPlace[] = [];
    const others: ProjectPlace[] = [];
    const hubs: ProjectPlace[] = [];
    for (const one of record.project.places) {
      if (one.kind === "hub") {
        hubs.push(one);
      } else if (one.isPrimary) {
        primary.push(one);
      } else {
        others.push(one);
      }
    }
    return [...primary, ...others, ...hubs];
  });

  const machineMap = $derived(
    new Map(
      record.machines.map((machine, index) => [machine.id, { machine, index }])
    )
  );
  const activeMachines = $derived(record.machines.filter((m) => !m.left));

  function machineStatus(machine: MachineFact | undefined): {
    label: string;
    presence: MachinePresence;
  } {
    if (!machine || machine.left) {
      return { label: words.places.statusLeft, presence: "off" };
    }
    return machine.online
      ? { label: words.places.statusOnline, presence: "online" }
      : { label: words.places.statusOffline, presence: "off" };
  }

  // ── Inline Add place well ────────────────────────────────────────────────
  let addingPlace = $state(false);
  let addMachineId = $state<string | null>(null);
  let addPath = $state("");
  let lastAddAttempt = $state<{ machineId: string; path: string } | null>(null);
  let wasAddPending = false;

  const selectedAddMachineId = $derived(
    addMachineId ?? activeMachines[0]?.id ?? null
  );
  const selectedAddMachine = $derived(
    activeMachines.find((m) => m.id === selectedAddMachineId) ?? null
  );
  const addPending = $derived(isPending(changes, "addPlace"));
  const addRefusal = $derived(refusalFor(changes, "addPlace"));

  $effect(() => {
    if (wasAddPending && !addPending && !addRefusal) {
      addingPlace = false;
      addPath = "";
      lastAddAttempt = null;
    }
    wasAddPending = addPending;
  });

  function toggleAddPlace() {
    addingPlace = !addingPlace;
    if (addingPlace && !addMachineId) {
      addMachineId = activeMachines[0]?.id ?? null;
    }
  }

  function submitAddPlace() {
    const trimmed = addPath.trim();
    if (!reachable || addPending || !selectedAddMachineId || !trimmed) {
      return;
    }
    lastAddAttempt = { machineId: selectedAddMachineId, path: trimmed };
    onchange({
      key: "addPlace",
      machineId: selectedAddMachineId,
      path: trimmed,
    });
  }

  function retryAddPlace() {
    if (!reachable || addPending) {
      return;
    }
    const target =
      lastAddAttempt ??
      (selectedAddMachineId && addPath.trim()
        ? { machineId: selectedAddMachineId, path: addPath.trim() }
        : null);
    if (!target) {
      return;
    }
    onchange({ key: "addPlace", ...target });
  }

  // ── Large-file storage (code projects only) ──────────────────────────────
  let editingDeclared = $state(false);
  let lfsUrlDraft = $state<string | null>(null);
  let lfsConnectionDraft = $state<string | null>(null);
  let lastLfsAttempt = $state<LargeFiles | null>(null);
  let wasLfsPending = false;

  const lfsPending = $derived(isPending(changes, "largeFiles"));
  const lfsRefusal = $derived(refusalFor(changes, "largeFiles"));

  const keyConnections = $derived(
    record.connections.state === "read"
      ? record.connections.value.filter((c) => c.holdsKey)
      : []
  );

  const showDeclaredForm = $derived(
    editingDeclared || record.largeFiles.kind === "declared"
  );
  const lfsUrl = $derived(
    lfsUrlDraft ??
      (record.largeFiles.kind === "declared" ? record.largeFiles.url : "")
  );
  const lfsConnection = $derived(
    lfsConnectionDraft ??
      (record.largeFiles.kind === "declared"
        ? record.largeFiles.connection
        : (keyConnections[0]?.name ?? ""))
  );

  $effect(() => {
    if (wasLfsPending && !lfsPending && !lfsRefusal) {
      editingDeclared = false;
      lfsUrlDraft = null;
      lfsConnectionDraft = null;
    }
    wasLfsPending = lfsPending;
  });

  function pickLfsMode(mode: "own" | "declared") {
    if (!reachable || lfsPending) {
      return;
    }
    if (mode === "own") {
      editingDeclared = false;
      if (record.largeFiles.kind !== "own") {
        const next: LargeFiles = { kind: "own" };
        lastLfsAttempt = next;
        onchange({ key: "largeFiles", largeFiles: next });
      }
      return;
    }
    editingDeclared = true;
  }

  function applyDeclaredLfs() {
    const trimmed = lfsUrl.trim();
    if (!reachable || lfsPending || !trimmed || !lfsConnection) {
      return;
    }
    const next: LargeFiles = {
      kind: "declared",
      url: trimmed,
      connection: lfsConnection,
    };
    lastLfsAttempt = next;
    onchange({ key: "largeFiles", largeFiles: next });
  }

  function cancelDeclaredLfs() {
    editingDeclared = false;
    lfsUrlDraft = null;
    lfsConnectionDraft = null;
  }

  function retryLfs() {
    if (!reachable || lfsPending || !lastLfsAttempt) {
      return;
    }
    onchange({ key: "largeFiles", largeFiles: lastLfsAttempt });
  }
  /** A machine place's acts, Find folder first while its folder is missing. */
  const actsOf = (place: ProjectPlace): PlaceAct[] =>
    place.missing ? ["find", "move", "copy"] : ["move", "find", "copy"];
  const STORAGE_PICKS = ["own", "declared"] as const;
</script>

<div class="grid gap-space-4 p-space-1">
  <HubAwayNote asOf={asOfTime} />

  <!-- Group 1: Places (all at once) -->
  <section class="grid gap-space-2">
    <SectionHeader
      hue="var(--color-ink-muted)"
      icon={IconFolder}
      label={words.places.sectionPlaces}
    >
      {#snippet right()}
        <Button
          aria-expanded={addingPlace}
          disabled={!reachable}
          onclick={toggleAddPlace}
          size="xs"
          variant="outline"
        >
          <IconPlus aria-hidden="true" />
          <span>{words.places.addPlace}</span>
        </Button>
      {/snippet}
    </SectionHeader>

    {#if addingPlace}
      <div
        class="grid gap-space-3 rounded-well border border-border-control bg-surface-well p-space-3"
        data-slot="add-place-well"
      >
        <div class="grid gap-space-1">
          <span class="type-meta text-ink-muted"
            >{words.places.machineLabel}</span
          >
          <OptionGroup
            aria-label={words.places.machineLabel}
            disabled={!reachable || addPending}
            layout="chips"
            bind:value={
              () => (selectedAddMachineId ? [selectedAddMachineId] : []),
              ([next]) => {
                if (next) {
                  addMachineId = next;
                }
              }
            }
          >
            {#each activeMachines as machine (machine.id)}
              {@const Icon = machineIcon(machine.os)}
              <OptionGroupItem value={machine.id}>
                <Icon
                  aria-hidden="true"
                  class="size-icon-sm shrink-0 text-ink-muted"
                />
                <span>{machine.name}</span>
                {#if !machine.online}
                  <span class="type-meta text-machine-offline">
                    · {words.places.statusOffline}
                  </span>
                {/if}
              </OptionGroupItem>
            {/each}
          </OptionGroup>
          {#if selectedAddMachine && !selectedAddMachine.online}
            <p class="m-0 type-meta text-ink-muted">
              {words.places.offlineAddNote}
            </p>
          {/if}
        </div>

        <div class="grid gap-space-1">
          <label class="type-meta text-ink-muted" for="opt1-add-place-path">
            {words.places.folderPathLabel}
          </label>
          <Input
            id="opt1-add-place-path"
            disabled={!reachable || addPending}
            face="mono"
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitAddPlace();
              }
            }}
            placeholder={words.places.folderPathPlaceholder}
            bind:value={addPath}
          />
        </div>

        <div class="flex items-center justify-end gap-space-2">
          <Button
            disabled={addPending}
            onclick={() => {
              addingPlace = false;
            }}
            size="xs"
            variant="ghost"
          >
            {words.hub.cancel}
          </Button>
          <Button
            disabled={!(reachable && selectedAddMachineId && addPath.trim()) ||
              addPending}
            label={words.places.add}
            onclick={submitAddPlace}
            pending={addPending}
            pendingLabel={words.places.adding}
            size="xs"
            variant="outline"
          />
        </div>

        {#if addRefusal}
          <RefusalNote
            disabled={!reachable || addPending}
            onretry={retryAddPlace}
            said={addRefusal}
          />
        {/if}
      </div>
    {/if}

    <ul class="m-0 grid list-none gap-space-row p-0">
      {#each orderedPlaces as place (place.id)}
        {#if place.kind === "hub"}
          <li
            class="grid gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3"
          >
            <div class="mark-line flex items-center gap-space-2 min-w-0">
              <span class={[iconTileVariants(), "text-ink-muted"]} data-box>
                <IconDatabase aria-hidden="true" class="size-icon-md" />
              </span>
              <span
                class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
              >
                {words.places.hubName}
              </span>
              <Badge data-box kind="meta"
                ><span>{words.places.hubStore}</span></Badge
              >
            </div>
            <div
              class="flex flex-wrap items-baseline justify-between gap-space-2"
            >
              <code class="min-w-0 flex-1 type-code text-ink-muted break-words">
                {#each pathSegments(place.path) as seg, i (i)}{seg}<wbr
                  />{/each}
              </code>
              <span class="shrink-0 type-meta text-ink-subtle">
                {words.places.leavesWithProject}
              </span>
            </div>
          </li>
        {:else}
          {@const entry = machineMap.get(place.machineId)}
          {@const machine = entry?.machine}
          {@const machineIndex = entry?.index ?? 0}
          {@const status = machineStatus(machine)}
          {@const displayPath = formatHomePath(place.path, machine?.home)}
          {@const droppable = !place.isPrimary}
          <li
            class={cn(
              "grid gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3",
              place.missing && "border-s-2 border-s-status-fail-ink"
            )}
          >
            <div class="flex items-center gap-space-2 min-w-0">
              <MachineRow
                hue={machineHue(
                  machineIndex,
                  Boolean(machine?.online && !machine.left)
                )}
                icon={machineIcon(machine?.os ?? "linux")}
                meta={status.label}
                name={machine?.name ?? place.machineId}
                presence={status.presence}
              >
                {#snippet trailing()}
                  <div class="flex shrink-0 items-center gap-space-1">
                    {#if place.missing}
                      <Badge variant="fail">
                        <IconWarningTriangle aria-hidden="true" />
                        <span>{words.places.missingBadge}</span>
                      </Badge>
                    {/if}
                    {#if place.isPrimary}
                      <Badge kind="meta"
                        ><span>{words.places.startsHere}</span></Badge
                      >
                    {/if}
                  </div>
                {/snippet}
              </MachineRow>
            </div>

            <code class="min-w-0 type-code text-ink-strong break-words">
              {#each pathSegments(displayPath) as seg, i (i)}{seg}<wbr />{/each}
            </code>

            {#if place.missing}
              <p class="m-0 type-meta text-status-fail-ink text-pretty">
                {words.places.missingNote}
              </p>
            {/if}

            <div class="flex flex-wrap items-center gap-space-1 pt-space-1">
              {#each actsOf(place) as act (act)}
                <Button
                  disabled={!reachable}
                  onclick={() => onplace(act, place.id)}
                  size="xs"
                  tone={place.missing && act === "find" ? undefined : "quiet"}
                  variant={place.missing && act === "find"
                    ? "outline"
                    : "ghost"}
                >
                  {words.places.acts[act]}
                </Button>
              {/each}

              {#if droppable}
                <Tip label={words.places.dropHint}>
                  {#snippet children(tipProps)}
                    <Button
                      {...tipProps}
                      class="ms-auto"
                      disabled={!reachable}
                      onclick={() => onplace("drop", place.id)}
                      size="xs"
                      tone="quiet"
                      variant="ghost"
                    >
                      {words.places.acts.drop}
                    </Button>
                  {/snippet}
                </Tip>
              {:else}
                <span class="ms-auto type-meta text-ink-subtle">
                  {words.places.leavesWithProject}
                </span>
              {/if}
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  </section>

  <!-- Group 2: Repositories (only when linked and project holds code) -->
  {#if record.holdsCode && record.project.links.length > 0}
    <section
      class="grid gap-space-2 border-t border-border-hairline pt-space-3"
    >
      <SectionHeader
        hue="var(--color-ink-muted)"
        icon={IconGitRepo}
        label={words.places.sectionRepos}
      />
      <ul class="m-0 grid list-none gap-space-row p-0">
        {#each record.project.links as link (link)}
          <li>
            <a
              class="flex items-center justify-between gap-space-2 rounded-sm px-space-2 py-space-1 text-ink-strong transition-control hover:bg-surface-hover"
              href={repoHref(link)}
              rel="noreferrer"
              target="_blank"
            >
              <span class="min-w-0 break-all type-code">{link}</span>
              <span
                class="mark-line flex shrink-0 items-center gap-space-1 type-meta text-ink-subtle"
              >
                <span>{words.places.repoSourceRemote}</span>
                <IconExternalLinear aria-hidden="true" class="size-icon-sm" />
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- Group 3: Large-file storage (code projects only, low prominence) -->
  {#if record.holdsCode}
    <section
      class="grid gap-space-2 border-t border-border-hairline pt-space-3"
    >
      <SectionHeader
        hue="var(--color-ink-muted)"
        icon={IconLayers}
        label={words.places.sectionLargeFiles}
      />

      <OptionGroup
        aria-label={words.places.sectionLargeFiles}
        disabled={!reachable || lfsPending}
        layout="chips"
        bind:value={
          () => [record.largeFiles.kind],
          (next) => {
            const picked = STORAGE_PICKS.find((pick) => pick === next[0]);
            if (picked) {
              pickLfsMode(picked);
            }
          }
        }
      >
        <OptionGroupItem
          onclick={() => {
            if (editingDeclared && record.largeFiles.kind === "own") {
              cancelDeclaredLfs();
            }
          }}
          value="own"
        >
          <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
            <span>{words.places.largeFilesModes.own.name}</span>
            {#if lfsPending && lastLfsAttempt?.kind === "own"}
              <Spinner box="small" tone="muted" />
            {/if}
          </span>
        </OptionGroupItem>
        <OptionGroupItem
          onclick={() => {
            if (record.largeFiles.kind === "declared") {
              editingDeclared = true;
            }
          }}
          value="declared"
        >
          <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
            <span>{words.places.largeFilesModes.declared.name}</span>
            {#if lfsPending && lastLfsAttempt?.kind === "declared"}
              <Spinner box="small" tone="muted" />
            {/if}
          </span>
        </OptionGroupItem>
      </OptionGroup>

      {#if showDeclaredForm}
        <div
          class="grid gap-space-3 rounded-well border border-border-well bg-surface-well p-space-3"
        >
          <div class="grid gap-space-1">
            <label class="type-meta text-ink-muted" for="opt1-lfs-url">
              {words.places.lfsUrlLabel}
            </label>
            <Input
              id="opt1-lfs-url"
              disabled={!reachable || lfsPending}
              face="mono"
              oninput={(event) => {
                lfsUrlDraft = event.currentTarget.value;
              }}
              placeholder={words.places.lfsUrlPlaceholder}
              value={lfsUrl}
            />
          </div>

          <ConnectionPick
            chosen={lfsConnection}
            connections={record.connections}
            disabled={!reachable || lfsPending}
            eligible={keyConnections}
            label={words.places.lfsConnectionLabel}
            none={words.places.lfsNoKeyConnections}
            onpick={(name) => {
              lfsConnectionDraft = name;
            }}
            onreread={() => onreread("connections")}
            {reachable}
          />

          <p class="m-0 type-meta text-ink-muted">
            {words.places.lfsOverrideNote}
          </p>

          <div class="flex items-center justify-end gap-space-2">
            {#if record.largeFiles.kind === "own"}
              <Button
                disabled={lfsPending}
                onclick={cancelDeclaredLfs}
                size="xs"
                variant="ghost"
              >
                {words.hub.cancel}
              </Button>
            {/if}
            <Button
              disabled={!reachable ||
                lfsPending ||
                !lfsUrl.trim() ||
                !lfsConnection}
              label={words.hub.apply}
              onclick={applyDeclaredLfs}
              pending={lfsPending}
              pendingLabel={words.hub.saving}
              size="xs"
              variant="outline"
            />
          </div>
        </div>
      {/if}

      {#if lfsRefusal}
        <RefusalNote
          disabled={!reachable || lfsPending}
          onretry={retryLfs}
          said={lfsRefusal}
        />
      {/if}
    </section>
  {/if}
</div>
