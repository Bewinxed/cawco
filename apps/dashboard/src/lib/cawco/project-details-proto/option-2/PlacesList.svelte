<script lang="ts">
  /**
   * Stage 2 left column: every place the project lives in at once, inline
   * Add place well (refusing scratch areas, accepting offline machines),
   * linked Repositories (when any exist on code projects), and Large-file
   * storage (code projects only).
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { machineIcon } from "#lib/components/ui/machine-row/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconAlert,
    IconExternalLinear,
    IconGitRepo,
    IconKey,
    IconPlus,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { Change, ChangeKey, PlaceAct } from "./changes";
  import ControlRefusal from "./ControlRefusal.svelte";
  import PlaceRow from "./PlaceRow.svelte";
  import type { HowItRunsRecord } from "./records";
  import { LARGE_FILE_KEY_CONNECTIONS } from "./tie-setup.fixture";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    movingPlaceId,
    onchange,
    onretry,
    onplace,
    onaddplace,
    hrefOf,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    movingPlaceId: string | null;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onplace: (act: PlaceAct, placeId: string) => void;
    onaddplace: (machineId: string, path: string) => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
  } = $props();

  const pathInputId = $props.id();
  const lfsAddressId = $props.id();

  /** UI-local state for the inline Add place well. */
  let addingPlace = $state(false);
  let machinePick = $state<string | null>(null);
  let pathDraft = $state("");
  let scratchRefusal = $state<string | null>(null);

  /** UI-local state for declaring a large-file storage address. */
  let declaringLargeFiles = $state(false);
  let lfsAddressDraft = $derived(
    record.largeFiles.kind === "declared" ? record.largeFiles.address : ""
  );
  let lfsConnectionDraft = $derived(
    record.largeFiles.kind === "declared"
      ? record.largeFiles.connection
      : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "")
  );

  const disabled = $derived(!record.hubReachable);
  const addPending = $derived(pending.includes("addPlace"));
  const lfsPending = $derived(pending.includes("largeFiles"));

  const machinesById = $derived(
    new Map(record.machines.map((machine) => [machine.id, machine]))
  );

  const activeMachineId = $derived(
    machinePick && record.machines.some((m) => m.id === machinePick)
      ? machinePick
      : (record.machines[0]?.id ?? null)
  );
  const activeMachine = $derived(
    activeMachineId ? (machinesById.get(activeMachineId) ?? null) : null
  );

  const showLargeFileEditor = $derived(
    record.largeFiles.kind === "declared" || declaringLargeFiles
  );

  const lfsDirty = $derived.by(() => {
    const trimmed = lfsAddressDraft.trim();
    if (record.largeFiles.kind !== "declared") {
      return trimmed.length > 0 && lfsConnectionDraft.length > 0;
    }
    return (
      trimmed !== record.largeFiles.address ||
      lfsConnectionDraft !== record.largeFiles.connection
    );
  });

  const SCRATCH_PATH =
    /^(?:\/(?:private\/)?tmp(?:\/|$)|\/var\/tmp(?:\/|$))|\/(?:\.cawco\/)?scratch(?:\/|$)/iu;

  function submitAddPlace() {
    if (disabled || !activeMachineId) {
      return;
    }
    const trimmed = pathDraft.trim();
    if (!trimmed) {
      return;
    }
    if (SCRATCH_PATH.test(trimmed)) {
      scratchRefusal = words.places.scratchRefused;
      return;
    }
    scratchRefusal = null;
    onaddplace(activeMachineId, trimmed);
  }

  function pickLargeFilesKind(kind: "own" | "declared") {
    if (disabled) {
      return;
    }
    if (kind === "own") {
      declaringLargeFiles = false;
      if (record.largeFiles.kind !== "own") {
        onchange({ key: "largeFiles", value: { kind: "own" } });
      }
      return;
    }
    declaringLargeFiles = true;
  }

  function saveLargeFiles() {
    if (disabled) {
      return;
    }
    const trimmed = lfsAddressDraft.trim();
    if (!trimmed || !lfsConnectionDraft) {
      return;
    }
    onchange({
      key: "largeFiles",
      value: {
        kind: "declared",
        address: trimmed,
        connection: lfsConnectionDraft,
      },
    });
  }
</script>

<div
  class="flex min-w-0 flex-col rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4 @setup:py-space-3"
  data-slot="well"
>
  <!-- Places header + Add place button. -->
  <div class="flex items-center justify-between gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.places.heading}</h3>
    <Button
      aria-expanded={addingPlace}
      {disabled}
      icon={IconPlus}
      label={words.places.addPlace}
      onclick={() => {
        addingPlace = !addingPlace;
        scratchRefusal = null;
      }}
      size="xs"
      variant="outline"
    />
  </div>

  <!-- Inline expandable Add place well. -->
  {#if addingPlace}
    <div
      class="mt-space-2 flex flex-col gap-space-2 rounded-sm border border-border-control bg-surface-raised p-space-3"
      data-slot="setup-asks"
      transition:unfold
    >
      <div class="flex flex-col gap-space-1">
        <span class="type-meta font-medium text-ink-muted"
          >{words.places.machineLabel}</span
        >
        <OptionGroup
          aria-label={words.places.machineLabel}
          {disabled}
          value={activeMachineId ? [activeMachineId] : []}
        >
          {#each record.machines as machine (machine.id)}
            {@const Glyph = machineIcon(machine.os)}
            <OptionGroupItem
              onclick={(event) => {
                event.preventDefault();
                machinePick = machine.id;
              }}
              value={machine.id}
            >
              <Glyph
                aria-hidden="true"
                class={[
                  "size-icon-md flex-none",
                  !machine.online && "text-machine-offline",
                ]}
              />
              <span class={!machine.online ? "text-ink-muted" : undefined}
                >{machine.name}</span
              >
              {#if !machine.online}
                <IconWarningTriangle
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-status-attn-glyph"
                />
                <span class="type-meta text-ink-muted"
                  >{words.places.away}</span
                >
              {/if}
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      </div>

      <div class="flex flex-col gap-space-1">
        <label class="type-meta font-medium text-ink-muted" for={pathInputId}
          >{words.places.folderPath}</label
        >
        <Input
          id={pathInputId}
          aria-invalid={Boolean(scratchRefusal || refused.addPlace) || undefined}
          class="max-phone:text-row coarse:text-row"
          {disabled}
          face="mono"
          oninput={() => {
            if (scratchRefusal) {
              scratchRefusal = null;
            }
          }}
          placeholder={activeMachine
            ? `${activeMachine.home}/code/${record.project.id}`
            : `/path/to/${record.project.id}`}
          bind:value={pathDraft}
        />
        {#if activeMachine && !activeMachine.online}
          <p class="m-0 type-meta text-ink-muted">
            {words.places.offlineNote}
          </p>
        {/if}
      </div>

      {#if scratchRefusal}
        <Alert layout="row" variant="destructive">
          <IconAlert aria-hidden="true" />
          <AlertDescription class="type-meta">{scratchRefusal}</AlertDescription>
        </Alert>
      {/if}

      <ControlRefusal
        {disabled}
        onretry={() => onretry("addPlace")}
        reason={refused.addPlace}
      />

      <div class="flex flex-wrap items-center gap-space-2">
        <Button
          disabled={disabled || !activeMachineId || pathDraft.trim().length === 0}
          label={words.places.add}
          onclick={submitAddPlace}
          pending={addPending}
          pendingLabel={words.places.adding}
          size="xs"
          variant="outline"
        />
        <Button
          label={words.cancel}
          onclick={() => {
            addingPlace = false;
            scratchRefusal = null;
          }}
          size="xs"
          variant="ghost"
        />
      </div>
    </div>
  {/if}

  <!-- All places listed at once. -->
  <ul class="m-0 mt-space-2 flex list-none flex-col gap-space-row p-0">
    {#each record.places as place (place.id)}
      <PlaceRow
        {disabled}
        machine={place.machineId
          ? (machinesById.get(place.machineId) ?? null)
          : null}
        moving={movingPlaceId === place.id}
        {onplace}
        {place}
      />
    {/each}
  </ul>

  <!-- Repositories (code projects with at least one link only). -->
  {#if record.holdsCode && record.repos.length > 0}
    <div
      class="mt-space-2 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 border-t border-border-hairline pt-space-2"
      data-slot="repo"
    >
      <span class="type-meta font-medium text-ink-muted"
        >{words.places.repositories}</span
      >
      <ul class="m-0 flex list-none flex-wrap items-center gap-x-space-3 gap-y-space-1 p-0">
        {#each record.repos as repo (`${repo.host}/${repo.owner}/${repo.name}`)}
          <li>
            <a
              class="mark-line inline-flex items-center gap-space-1 type-code text-link-ink hover:underline"
              href={repo.url}
              rel="noreferrer"
              target="_blank"
            >
              <IconGitRepo
                aria-hidden="true"
                class="size-icon-sm flex-none text-ink-muted"
              />
              <span>{repo.owner}/{repo.name}</span>
              <IconExternalLinear
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Large-file storage (code projects only). -->
  {#if record.holdsCode}
    <div
      class="mt-space-2 flex flex-col gap-space-2 border-t border-border-hairline pt-space-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <span class="flex items-center gap-space-2">
          <span class="type-label text-ink-strong"
            >{words.places.largeFilesHeading}</span
          >
          {#if lfsPending}
            <Spinner aria-label={words.saving} box="small" tone="muted" />
          {/if}
        </span>

        <OptionGroup
          aria-label={words.places.largeFilesGroupLabel}
          class="gap-space-1 coarse:gap-y-space-4"
          {disabled}
          value={[record.largeFiles.kind]}
        >
          <OptionGroupItem
            class="px-space-2"
            onclick={(event) => {
              event.preventDefault();
              pickLargeFilesKind("own");
            }}
            value="own"
          >
            {words.places.largeFilesOwn}
          </OptionGroupItem>
          <OptionGroupItem
            class="px-space-2"
            onclick={(event) => {
              event.preventDefault();
              pickLargeFilesKind("declared");
            }}
            value="declared"
          >
            {words.places.largeFilesDeclared}
          </OptionGroupItem>
        </OptionGroup>
      </div>

      {#if showLargeFileEditor}
        <div
          class="flex flex-col gap-space-2 rounded-sm border border-border-control bg-surface-raised p-space-3"
          transition:unfold
        >
          <div class="flex flex-col gap-space-1">
            <label
              class="type-meta font-medium text-ink-muted"
              for={lfsAddressId}>{words.places.largeFilesAddress}</label
            >
            <Input
              id={lfsAddressId}
              aria-invalid={Boolean(refused.largeFiles) || undefined}
              class="max-phone:text-row coarse:text-row"
              {disabled}
              face="mono"
              placeholder={words.places.largeFilesAddressPlaceholder}
              type="url"
              bind:value={lfsAddressDraft}
            />
          </div>

          <div class="flex flex-col gap-space-1">
            <span class="type-meta font-medium text-ink-muted"
              >{words.places.largeFilesKey}</span
            >
            {#if LARGE_FILE_KEY_CONNECTIONS.length === 0}
              <Alert layout="row" variant="default">
                <IconKey aria-hidden="true" />
                <AlertDescription class="type-meta"
                  >{words.places.largeFilesNoKey}</AlertDescription
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
              <OptionGroup
                aria-label={words.places.largeFilesKey}
                {disabled}
                value={lfsConnectionDraft ? [lfsConnectionDraft] : []}
              >
                {#each LARGE_FILE_KEY_CONNECTIONS as conn (conn.id)}
                  <OptionGroupItem
                    onclick={(event) => {
                      event.preventDefault();
                      lfsConnectionDraft = conn.id;
                    }}
                    value={conn.id}
                  >
                    <IconKey
                      aria-hidden="true"
                      class="size-icon-sm flex-none text-ink-muted"
                    />
                    <span>{conn.name}</span>
                  </OptionGroupItem>
                {/each}
              </OptionGroup>
            {/if}
          </div>

          <p class="m-0 type-meta text-ink-muted">
            {words.places.largeFilesOverrideNote}
          </p>

          {#if lfsDirty || record.largeFiles.kind !== "declared"}
            <div class="flex flex-wrap items-center gap-space-2">
              <Button
                disabled={disabled ||
                  lfsAddressDraft.trim().length === 0 ||
                  lfsConnectionDraft.length === 0}
                label={words.save}
                onclick={saveLargeFiles}
                pending={lfsPending}
                pendingLabel={words.saving}
                size="xs"
                variant="outline"
              />
              <Button
                label={words.cancel}
                onclick={() => {
                  declaringLargeFiles = false;
                  lfsAddressDraft =
                    record.largeFiles.kind === "declared"
                      ? record.largeFiles.address
                      : "";
                  lfsConnectionDraft =
                    record.largeFiles.kind === "declared"
                      ? record.largeFiles.connection
                      : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "");
                }}
                size="xs"
                variant="ghost"
              />
            </div>
          {/if}
        </div>
      {/if}

      <ControlRefusal
        {disabled}
        onretry={() => onretry("largeFiles")}
        reason={refused.largeFiles}
      />
    </div>
  {/if}
</div>
