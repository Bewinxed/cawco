<script lang="ts">
  /**
   * Stage 2's places: every folder the project lives in at once, as a
   * section's rows (RowList, SectionRow): the machine's glyph and name, the
   * whole path under it, where work starts and what is wrong as badges, and
   * the place's acts in its ⋯ menu (Find folder standing out on a folder
   * gone missing, and why under it). The list's last row adds a place, a
   * row of the list's own (SectionRow `onpress`, the plus in its tile):
   * pressed, it becomes the add form in its place. Under the list the
   * linked repositories as rows of their own, each opening on its host, and
   * for a code project where its large files are kept, as two of the
   * house's tiles each led by its glyph; the second opens its address and
   * key under the tiles.
   */
  import Field from "#lib/cawco/config/Field.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { machineIcon } from "#lib/components/ui/machine-row/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import {
    IconClose,
    IconCopy,
    IconExternalLinear,
    IconFolderGit,
    IconFolderOpen,
    IconGitRepo,
    IconHubFolder,
    IconKey,
    IconLargeFilesServer,
    IconPlus,
    IconTransfer,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { PlaceAct, SessionsStartProps } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import type { ProjectPlace } from "./records";
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
  }: SessionsStartProps = $props();

  const uid = $props.id();

  const disabled = $derived(!record.hubReachable);
  const machinesById = $derived(
    new Map(record.machines.map((machine) => [machine.id, machine]))
  );

  /* ── Adding a place ─────────────────────────────────────────────── */

  let adding = $state(false);
  let machinePick = $state<string | null>(null);
  let pathDraft = $state("");
  let scratchRefusal = $state<string | null>(null);
  /** The machines the project has no folder on yet: where a new folder most likely goes. */
  const freeMachines = $derived(
    record.machines.filter(
      (machine) =>
        !record.places.some((place) => place.machineId === machine.id)
    )
  );
  const activeMachineId = $derived(
    machinePick && machinesById.has(machinePick)
      ? machinePick
      : (freeMachines[0]?.id ?? record.machines[0]?.id ?? null)
  );
  const activeMachine = $derived(
    activeMachineId ? (machinesById.get(activeMachineId) ?? null) : null
  );

  const SCRATCH_PATH =
    /^(?:\/(?:private\/)?tmp(?:\/|$)|\/var\/tmp(?:\/|$))|\/(?:\.cawco\/)?scratch(?:\/|$)/iu;

  function submitAddPlace(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = pathDraft.trim();
    if (disabled || !activeMachineId || !trimmed) {
      return;
    }
    if (SCRATCH_PATH.test(trimmed)) {
      scratchRefusal = words.places.scratchRefused;
      return;
    }
    scratchRefusal = null;
    onaddplace(activeMachineId, trimmed);
  }

  function stopAdding() {
    adding = false;
    pathDraft = "";
    scratchRefusal = null;
  }

  /* ── Large files ────────────────────────────────────────────────── */

  /** The address being written: the pick moves to it at the press, the record once it is saved. */
  let declaring = $state(false);
  let lfsAddressDraft = $derived(
    record.largeFiles.kind === "declared" ? record.largeFiles.address : ""
  );
  let lfsConnectionDraft = $derived(
    record.largeFiles.kind === "declared"
      ? record.largeFiles.connection
      : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "")
  );
  const largeFilesShown = $derived(
    declaring ? "declared" : record.largeFiles.kind
  );
  const lfsDirty = $derived(
    record.largeFiles.kind !== "declared" ||
      lfsAddressDraft.trim() !== record.largeFiles.address ||
      lfsConnectionDraft !== record.largeFiles.connection
  );

  function pickLargeFiles(kind: "own" | "declared" | null) {
    if (kind === "own") {
      declaring = false;
      if (record.largeFiles.kind !== "own") {
        onchange({ key: "largeFiles", value: { kind: "own" } });
      }
    } else if (kind === "declared" && record.largeFiles.kind !== "declared") {
      declaring = true;
    }
  }

  function saveLargeFiles(event: SubmitEvent) {
    event.preventDefault();
    const address = lfsAddressDraft.trim();
    if (disabled || !(address && lfsConnectionDraft)) {
      return;
    }
    declaring = false;
    onchange({
      key: "largeFiles",
      value: { kind: "declared", address, connection: lfsConnectionDraft },
    });
  }

  /** A place's acts, its ⋯ menu's rows. */
  const actsOf = (place: ProjectPlace) => {
    const off = disabled || movingPlaceId === place.id;
    const act = (kind: PlaceAct) => () => onplace(kind, place.id);
    return [
      {
        label: words.places.move,
        icon: IconTransfer,
        disabled: off,
        onselect: act("move"),
      },
      ...(place.missing
        ? []
        : [
            {
              label: words.places.findFolder,
              icon: IconFolderOpen,
              disabled: off,
              onselect: act("find"),
            },
          ]),
      {
        label: words.places.copyToMachine,
        icon: IconCopy,
        disabled: off,
        onselect: act("copy"),
      },
      ...(place.kind === "other"
        ? [
            {
              label: words.places.drop,
              icon: IconClose,
              destructive: true,
              disabled: off,
              onselect: act("drop"),
            },
          ]
        : []),
    ];
  };
</script>

{#snippet largeFilesGlyph(kind: "own" | "declared")}
  {#if kind === "own"}
    <IconFolderGit aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconLargeFilesServer
      aria-hidden="true"
      class="size-icon-md text-ink-muted"
    />
  {/if}
{/snippet}

<section
  aria-labelledby="{uid}-places"
  class="flex min-w-0 flex-col gap-space-2"
>
  <h3 class={sectionHeadVariants({ inset: "flush" })} id="{uid}-places">
    {words.places.heading}
  </h3>

  <RowList label={words.places.heading}>
    {#each record.places as place (place.id)}
      {@const machine = place.machineId
        ? (machinesById.get(place.machineId) ?? null)
        : null}
      {@const offline = machine !== null && !machine.online}
      {@const moving = movingPlaceId === place.id}
      <SectionRow
        actions={place.kind === "hub" ? [] : actsOf(place)}
        icon={machine ? machineIcon(machine.os) : IconHubFolder}
        meta={place.path}
        name={machine ? machine.name : words.places.hub}
        note={place.missing
          ? { text: words.places.missingTip, tone: "fail" }
          : undefined}
        whole
      >
        {#snippet badge()}
          {#if place.missing}
            <Badge variant="fail"><span>{words.places.missing}</span></Badge>
          {:else if moving}
            <Badge variant="live"><span>{words.places.moving}</span></Badge>
          {:else if offline}
            <Badge variant="attn"><span>{words.places.away}</span></Badge>
          {/if}
          {#if place.kind === "start"}
            <Badge kind="meta"><span>{words.places.startsHere}</span></Badge>
          {/if}
        {/snippet}
        {#snippet trailing()}
          {#if place.missing}
            <Button
              {disabled}
              icon={IconFolderOpen}
              label={words.places.findFolder}
              onclick={() => onplace("find", place.id)}
              size="xs"
              variant="outline"
            />
          {/if}
        {/snippet}
      </SectionRow>
    {/each}

    {#if adding}
      <li class="flex min-w-0 flex-col" data-flip data-slot="item">
        <form
          aria-label={words.places.addPlace}
          class={OPENED_FORM}
          data-slot="add"
          onsubmit={submitAddPlace}
          transition:unfold
        >
          <p class="m-0 type-label text-ink-strong">
            {words.places.addPlace}
          </p>
          <div class={FORM_FIELD}>
            <p class={FORM_LABEL} id="{uid}-machine">
              {words.places.machineLabel}
            </p>
            <OptionGroup
              glide="fill"
              aria-labelledby="{uid}-machine"
              bind:value={
                () => (activeMachineId ? [activeMachineId] : []),
                (next) => {
                  machinePick = next[0] ?? null;
                }
              }
              {disabled}
            >
              {#each record.machines as machine (machine.id)}
                {@const Glyph = machineIcon(machine.os)}
                <OptionGroupItem value={machine.id}>
                  <span
                    class="mark-line flex min-w-0 items-center gap-x-space-2"
                  >
                    <Glyph aria-hidden="true" class="size-icon-md flex-none" />
                    <span>{machine.name}</span>
                    {#if !machine.online}
                      <Badge data-box variant="attn"
                        ><span>{words.places.away}</span></Badge
                      >
                    {/if}
                  </span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>
          </div>
          <Field
            hint={activeMachine && !activeMachine.online
              ? words.places.offlineNote
              : undefined}
            id="{uid}-path"
            label={words.places.folderPath}
          >
            <Input
              id="{uid}-path"
              aria-invalid={Boolean(scratchRefusal || refused.addPlace) ||
                undefined}
              autocomplete="off"
              {disabled}
              face="mono"
              oninput={() => {
                scratchRefusal = null;
              }}
              placeholder={activeMachine ? `${activeMachine.home}/` : "/"}
              spellcheck="false"
              bind:value={pathDraft}
            />
          </Field>
          <RowFault reason={scratchRefusal} />
          <RowFault
            again={() => onretry("addPlace")}
            reason={refused.addPlace}
          />
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              disabled={disabled ||
                !activeMachineId ||
                pathDraft.trim().length === 0}
              label={words.places.add}
              pending={pending.includes("addPlace")}
              pendingLabel={words.places.adding}
              size="sm"
              type="submit"
              variant="outline"
            />
            <Button
              label={words.cancel}
              onclick={stopAdding}
              size="sm"
              variant="ghost"
            />
          </div>
        </form>
      </li>
    {:else}
      <!-- The list's last row adds to it, in the list's own row (HIG, Lists:
           an add row ends its list). -->
      <SectionRow
        enabled={disabled ? false : undefined}
        icon={IconPlus}
        name={words.places.addPlace}
        onpress={disabled
          ? undefined
          : () => {
              adding = true;
            }}
      />
    {/if}
  </RowList>
</section>

{#if record.holdsCode && record.repos.length > 0}
  <section
    aria-labelledby="{uid}-repos"
    class="flex min-w-0 flex-col gap-space-2"
  >
    <h3 class={sectionHeadVariants({ inset: "flush" })} id="{uid}-repos">
      {words.places.repositories}
    </h3>
    <RowList label={words.places.repositories}>
      {#each record.repos as repo (`${repo.host}/${repo.owner}/${repo.name}`)}
        <SectionRow icon={IconGitRepo} mono name="{repo.owner}/{repo.name}">
          {#snippet trailing()}
            <Button
              aria-label="{repo.owner}/{repo.name}"
              href={repo.url}
              icon={IconExternalLinear}
              rel="noreferrer"
              size="icon-xs"
              target="_blank"
              tone="quiet"
              variant="ghost"
            />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  </section>
{/if}

{#if record.holdsCode}
  <section
    aria-labelledby="{uid}-lfs"
    class="flex min-w-0 flex-col gap-space-2"
  >
    <h3 class={sectionHeadVariants({ inset: "flush" })} id="{uid}-lfs">
      {words.places.largeFilesHeading}
    </h3>
    <OptionTiles
      bind:value={() => largeFilesShown, pickLargeFiles}
      cols={2}
      {disabled}
      glide="fill"
      glyph={largeFilesGlyph}
      wraps
      label={words.places.largeFilesGroupLabel}
      options={[
        {
          id: "own",
          name: words.places.largeFilesOwn.name,
          note: words.places.largeFilesOwn.note,
        },
        {
          id: "declared",
          name: words.places.largeFilesDeclared.name,
          note: words.places.largeFilesDeclared.note,
        },
      ]}
    />
    <RowFault
      again={() => onretry("largeFiles")}
      againLabel={words.retryChange}
      reason={refused.largeFiles}
    />

    {#if largeFilesShown === "declared"}
      <form
        aria-label={words.places.largeFilesDeclared.name}
        class={OPENED_FORM}
        onsubmit={saveLargeFiles}
        transition:unfold
      >
        <p class="m-0 type-label text-ink-strong">
          {words.places.largeFilesDeclared.name}
        </p>
        <Field id="{uid}-lfs-url" label={words.places.largeFilesAddress}>
          <Input
            id="{uid}-lfs-url"
            autocomplete="off"
            {disabled}
            face="mono"
            placeholder={words.places.largeFilesAddressPlaceholder}
            spellcheck="false"
            type="url"
            bind:value={lfsAddressDraft}
          />
        </Field>
        <div class={FORM_FIELD}>
          <p class={FORM_LABEL} id="{uid}-lfs-key">
            {words.places.largeFilesKey}
          </p>
          {#if LARGE_FILE_KEY_CONNECTIONS.length === 0}
            <RowFault
              goTo={{
                href: hrefOf("connections"),
                label: words.tasks.openConnections,
              }}
              reason={words.places.largeFilesNoKey}
            />
          {:else}
            <OptionGroup
              glide="fill"
              aria-labelledby="{uid}-lfs-key"
              bind:value={
                () => (lfsConnectionDraft ? [lfsConnectionDraft] : []),
                (next) => {
                  lfsConnectionDraft = next[0] ?? "";
                }
              }
              {disabled}
            >
              {#each LARGE_FILE_KEY_CONNECTIONS as conn (conn.id)}
                <OptionGroupItem value={conn.id}>
                  <span
                    class="mark-line flex min-w-0 items-center gap-x-space-2"
                  >
                    <IconKey
                      aria-hidden="true"
                      class="size-icon-sm flex-none text-ink-muted"
                    />
                    <span>{conn.name}</span>
                  </span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>
          {/if}
        </div>
        {#if lfsDirty || declaring}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              disabled={disabled ||
                lfsAddressDraft.trim().length === 0 ||
                lfsConnectionDraft.length === 0}
              label={words.save}
              size="sm"
              type="submit"
              variant="outline"
            />
            <Button
              label={words.cancel}
              onclick={() => {
                declaring = false;
                lfsAddressDraft =
                  record.largeFiles.kind === "declared"
                    ? record.largeFiles.address
                    : "";
                lfsConnectionDraft =
                  record.largeFiles.kind === "declared"
                    ? record.largeFiles.connection
                    : (LARGE_FILE_KEY_CONNECTIONS[0]?.id ?? "");
              }}
              size="sm"
              variant="ghost"
            />
          </div>
        {/if}
      </form>
    {/if}
  </section>
{/if}
