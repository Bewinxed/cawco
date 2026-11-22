<script lang="ts">
  /**
   * Run environments: every folder the project lives in, always shown as a
   * divided list (RowList `divided`, SectionRow): the machine's glyph and
   * name, its whole path under it in the muted code face, where sessions
   * start as a pill, the hub's own copy said as such, what is wrong as
   * badges, and the place's acts in its ⋯ menu (Find folder standing out on
   * a folder gone missing, and why under it). Add folder is the list's
   * last row; pressed, the add form opens under the list.
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
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconClose,
    IconCopy,
    IconError,
    IconFolderOpen,
    IconHubFolder,
    IconPlus,
    IconTransfer,
    IconWorking,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { PlaceAct, PlacesProps } from "./changes";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import type { ProjectPlace } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    movingPlaceId,
    onretry,
    onplace,
    onaddplace,
    opening = null,
  }: PlacesProps = $props();

  const uid = $props.id();

  const disabled = $derived(!record.hubReachable);
  const machinesById = $derived(
    new Map(record.machines.map((machine) => [machine.id, machine]))
  );

  /* ── Adding a place ─────────────────────────────────────────────── */

  /** The add form standing open: from the press, or open as it mounts (`opening`). */
  let adding = $derived(opening === "folder");
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

  /** The place whose Stop using is being said under its row before it goes. */
  let dropping = $derived<string | null>(
    opening?.startsWith("drop:") ? opening.slice("drop:".length) : null
  );

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
              // Said first, under its row, with what it reaches.
              onselect: () => {
                dropping = place.id;
              },
            },
          ]
        : []),
    ];
  };
</script>

<div class="flex min-w-0 flex-col gap-space-3">
  <!-- Drawn out by its glyphs' inset, so they share the card's left edge. -->
  <div class="-ms-c-mark-inset min-w-0">
    <RowList divided label={words.places.heading}>
      {#each record.places as place (place.id)}
        {@const machine = place.machineId
          ? (machinesById.get(place.machineId) ?? null)
          : null}
        {@const offline = machine !== null && !machine.online}
        {@const moving = movingPlaceId === place.id}
        <SectionRow
          actions={place.kind === "hub" ? [] : actsOf(place)}
          icon={machine ? machineIcon(machine.os) : IconHubFolder}
          code
          meta={place.path}
          name={machine ? machine.name : words.places.hub}
          note={place.missing
            ? { text: words.places.missingTip, tone: "fail" }
            : undefined}
          whole
        >
          {#snippet badge()}
            {#if place.missing}
              <Badge variant="fail"
                ><IconError aria-hidden="true" /><span
                  >{words.places.missing}</span
                ></Badge
              >
            {:else if moving}
              <Badge variant="live"
                ><IconWorking aria-hidden="true" /><span
                  >{words.places.moving}</span
                ></Badge
              >
            {:else if offline}
              <Badge variant="attn"><span>{words.places.away}</span></Badge>
            {/if}
            {#if place.kind === "start"}
              <!-- Where sessions start: the one marked place, a pill. -->
              <Badge variant="brand"
                ><span>{words.places.startsHere}</span></Badge
              >
            {:else if place.kind === "hub"}
              <!-- Why it has no menu: the hub keeps it. -->
              <span class="type-meta text-ink-muted">{words.places.hubOwn}</span
              >
            {/if}
          {/snippet}
          {#snippet trailing()}
            {#if place.missing}
              <Button
                {disabled}
                icon={IconFolderOpen}
                label={words.places.findFolder}
                onclick={() => onplace("find", place.id)}
                size="sm"
                variant="outline"
              />
            {/if}
          {/snippet}
          {#snippet below()}
            {#if dropping === place.id}
              <div class="flex min-w-0 flex-col gap-space-2" transition:unfold>
                <p class="m-0 type-meta text-pretty text-ink-strong">
                  {words.places.dropSays(
                    place.path,
                    machine ? machine.name : words.places.hub
                  )}
                  <span class="text-ink-muted">{words.places.dropKeeps}</span>
                </p>
                <div class="flex justify-end gap-space-2">
                  <Button
                    label={words.cancel}
                    onclick={() => {
                      dropping = null;
                    }}
                    size="sm"
                    variant="ghost"
                  />
                  <Button
                    {disabled}
                    label={words.places.drop}
                    onclick={() => {
                      dropping = null;
                      onplace("drop", place.id);
                    }}
                    size="sm"
                  />
                </div>
              </div>
            {/if}
          {/snippet}
        </SectionRow>
      {/each}
      {#if !adding}
        <!-- The list's last row adds to it, in the rows' shape, its plus in
             the row's lead. -->
        <SectionRow
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
  </div>

  {#if adding}
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
          glide
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
              <span class="mark-line flex min-w-0 items-center gap-x-space-2">
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
      <RowFault again={() => onretry("addPlace")} reason={refused.addPlace} />
      <div class="flex justify-end gap-space-2">
        <Button
          label={words.cancel}
          onclick={stopAdding}
          size="sm"
          type="button"
          variant="ghost"
        />
        <Button
          disabled={disabled ||
            !activeMachineId ||
            pathDraft.trim().length === 0}
          label={words.places.add}
          pending={pending.includes("addPlace")}
          pendingLabel={words.places.adding}
          size="sm"
          type="submit"
        />
      </div>
    </form>
  {/if}
</div>
