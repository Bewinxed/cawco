<script lang="ts">
  import type { BinaryUpdatePhase } from "@cawco/core/binary-updates";
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { detach } from "@cawco/core/detach";
  import { machineLabel } from "@cawco/core/machine-names";
  import { connectWords } from "@cawco/core/words/connect";
  import {
    workspaceNeedsDetails,
    workspaceNeedsReason,
    workspaceNeedsWords,
  } from "@cawco/core/words/workspace-needs";
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * The machines as a list: every install under way or waiting on the
   * person first (connect/InstallRow: the place Add machine's work is
   * parked, one press back into its window), then each machine (its menu on
   * right-click or long-press: update, reload, log in, unlock, forget), a
   * machine being brought back drawn as its install's row in its own place,
   * then Add machine. With no machine yet it is the empty fleet's compact
   * form: one line and the two ways in, each opening Add machine on its
   * route. The list reflows as rows come and go (Nothing Jumps). Shown in
   * the wide bar's Machines popover and in the phone's sidebar; the popover
   * stays open under Add machine's window, so an install's row arrives in
   * it as the install starts and the window parks into it.
   */
  import {
    type MachinePresence,
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import { barGlass } from "./bar-glass.svelte";
  import { cawco, type Machine } from "./client.svelte";
  import InstallRow from "./connect/InstallRow.svelte";
  import { connect } from "./connect/installs.svelte";
  import { CONNECT_WAYS } from "./connect/ways";
  import { retryFleetItems } from "./fleet";
  import { signInsWaiting } from "./fleet-faults";
  import { home } from "./home/home-state.svelte";
  import { answerMachine, hubAuth } from "./hub-auth.svelte";
  import ItemFaults from "./ItemFaults.svelte";
  import MachineMenu from "./MachineMenu.svelte";
  import { pausedWords } from "./machine-pause";
  import RowFault from "./RowFault.svelte";
  import SignInWaits from "./SignInWaits.svelte";
  import { cellFor } from "./updates/model";
  import { updates } from "./updates/updates.svelte";

  let {
    rail = false,
  }: {
    /**
     * Standing in the phone's sidebar sheet: its rows take the sheet's own
     * columns, a glyph's box `c-row-inset` in and the words that same gap
     * after it (Files and Fleet's nav rows), a machine's tile centred on that
     * glyph's box with its words on the same start.
     */
    rail?: boolean;
  } = $props();
  /** A row with a bare glyph: the card's 7px pads, or the sheet's nav row's. */
  const bareRow = $derived(
    rail
      ? "gap-c-row-inset ps-c-row-inset pe-space-2"
      : "gap-space-2 px-space-2"
  );
  /** A row led by a machine's tile: in the sheet, the tile on the glyph's box's centre. */
  const tileRow = $derived(
    rail
      ? "gap-(--tile-lead) ps-(--tile-lead) pe-space-2"
      : "gap-space-2 px-space-2"
  );
  /** The glyph's box: the sheet's nav row's (space-5), or the glyph's own. */
  const glyphBox = $derived(rail ? "w-space-5" : "w-icon-md");
  const TILE_LEAD =
    "calc(var(--spacing-c-row-inset) - (var(--spacing-c-mark) - var(--spacing-space-5)) / 2)";

  /** Each machine the fleet lists that an install is bringing back: its row is that install's. */
  const returning = $derived(
    new Map(
      connect.band
        .filter((one) => one.returning !== null)
        .map((one) => [one.returning as string, one])
    )
  );
  /** The installs with no machine row of their own to grow out of. */
  const newcomers = $derived(
    connect.band.filter(
      (one) =>
        one.returning === null ||
        !cawco.machines.some((machine) => machine.machineId === one.returning)
    )
  );

  /** The waiting machine an answer is on its way for, and the hub's refusal of the last. */
  let answering = $state<string | null>(null);
  let admitRefused = $state<string | undefined>(undefined);
  async function answer(machineId: string, admit: boolean) {
    answering = machineId;
    admitRefused = undefined;
    try {
      await answerMachine(machineId, admit);
    } catch (error) {
      admitRefused = failureWords(error);
    } finally {
      answering = null;
    }
  }

  const liveOn = (machineId: string): number =>
    cawco.runningInstances.filter((row) => row.machineId === machineId).length;
  /** The row's dot: down, up but in trouble, or fine. */
  function presenceOf(up: boolean, fault: string | undefined): MachinePresence {
    if (!up) {
      return "off";
    }
    return fault ? "away" : "online";
  }
  /*
   * Opened onto one machine (bar-glass `showMachine`): the list on screen
   * brings its row into view and focuses it, and the ask is spent. Each
   * list asks only after it has drawn; a hidden one (the sidebar while the
   * card shows them) has nothing on screen and leaves it to the other.
   */
  $effect(() => {
    const id = barGlass.machine;
    // Read so a list that was hidden looks again when the card changes.
    const card = barGlass.open;
    if (!id || cawco.machines.length === 0 || card === undefined) {
      return;
    }
    if (!cawco.machines.some((each) => each.machineId === id)) {
      // Gone from the fleet: nothing to open onto, and no later opening of
      // the machines should land on it.
      barGlass.machine = null;
      return;
    }
    const row = [
      ...document.querySelectorAll<HTMLElement>(
        `li[data-machine="${CSS.escape(id)}"] [data-slot="row"]`
      ),
    ].find((each) => each.checkVisibility());
    if (!row) {
      return;
    }
    barGlass.machine = null;
    row.focus({ preventScroll: true });
    bringIntoView(row);
  });

  const faultOf = (machineId: string): string | undefined =>
    home.exceptions.find((entry) => entry.machineId === machineId)?.text;

  /**
   * An update under way says where it stands on the machine's row, in the
   * Update cell's words, on the machine's word; one that failed says why
   * under the row, with Retry where a retry is the person's to make.
   */
  const MOVING = new Set<BinaryUpdatePhase>([
    "ready",
    "downloading",
    "installing",
    "waiting-sessions",
    "waiting-for-hub",
    "failed",
    "failed-rolled-back",
  ]);
  $effect(() => {
    if (!(updates.policy || updates.problem)) {
      detach(updates.loadPolicy(), "loadPolicy");
    }
  });
  function updateOf(machine: Machine) {
    const phase =
      machine.status === "online" ? machine.binaryUpdate?.phase : undefined;
    // A keeper kept from its restart stops every session start here, whatever the update's phase.
    if (!(
      updates.policy &&
      phase &&
      (MOVING.has(phase) || machine.binaryUpdate?.sessiondKept)
    )) {
      return null;
    }
    return cellFor(machine, updates.policy);
  }
  /**
   * What the machine lacks for a delegate's workspace, as its report says
   * (core workspace-needs.ts): the refusal a delegate there gets, read
   * before one is sent, its install command in a well of its own with Copy,
   * and where each tool was looked for under Show details.
   */
  function needsOf(machine: Machine) {
    const needs = machine.machineCapabilities?.items.find(
      (item) => item.id === "workspace"
    );
    if (!needs || needs.available) {
      return null;
    }
    const missing = needs.missing ?? [];
    return {
      reason: workspaceNeedsReason(missing, needs.installCommand),
      command: needs.installCommand,
      details: workspaceNeedsDetails(missing),
    };
  }
  function updateFault(machine: Machine) {
    const refused = updates.refusalOf(machine);
    if (refused) {
      return refused;
    }
    const cell = updateOf(machine);
    if (!cell?.fail) {
      return null;
    }
    const said = machine.binaryUpdate?.error;
    return {
      reason: said ? `${cell.text} ${said}` : cell.text,
      again: cell.buttons.includes("retry")
        ? () => updates.installNow(machine)
        : undefined,
    };
  }
</script>

{#if hubAuth.waiting.length > 0}
  <!-- Machines waiting to be admitted (hub hub-auth.ts): first, as they wait on you. -->
  <ul
    data-slot="list"
    class="mx-0 mt-0 mb-space-1 flex list-none flex-col gap-space-row border-b border-b-border-hairline px-0 pt-0 pb-space-1"
  >
    {#each hubAuth.waiting as machine (machine.machineId)}
      {@const name = machineLabel(machine.hostname ?? machine.machineId)}
      <li
        data-slot="row"
        class={[
          "flex w-full min-h-space-8 items-center rounded-sm py-space-1 text-ink-strong transition-control coarse:min-h-c-row-h hover:bg-surface-hover",
          tileRow,
        ]}
        data-waiting={machine.machineId}
        style:--tile-lead={rail ? TILE_LEAD : undefined}
      >
        <MachineRow
          hue={machineHue(0, false)}
          icon={machineIcon(machine.platform ?? "")}
          meta={["Waits to be admitted", machine.address]
            .filter(Boolean)
            .join(" · ")}
          {name}
          presence="away"
        />
        <span class="ms-auto flex flex-none gap-space-1">
          <Button
            aria-label="Deny {name}"
            disabled={answering !== null}
            label="Deny"
            onclick={() => answer(machine.machineId, false)}
            size="xs"
            variant="ghost"
          />
          <Button
            aria-label="Admit {name}"
            disabled={answering !== null}
            label="Admit"
            onclick={() => answer(machine.machineId, true)}
            pending={answering === machine.machineId}
            size="xs"
            variant="secondary"
          />
        </span>
      </li>
    {/each}
  </ul>
  {#if admitRefused}
    <RowFault reason={admitRefused} />
  {/if}
{/if}
{#if newcomers.length > 0}
  <!-- Installs under way or waiting on the person: each one press back into its window. -->
  <ul
    data-slot="list"
    data-installs
    class="mx-0 mt-0 mb-space-1 flex list-none flex-col gap-space-row px-0 pt-0 pb-space-1"
    {@attach reflow()}
  >
    {#each newcomers as install, index (install.id)}
      <li data-install={install.id}>
        <InstallRow {index} {install} />
      </li>
    {/each}
  </ul>
{/if}
{#if cawco.machines.length === 0}
  <!-- No machine yet: the empty fleet's two ways in, as rows. -->
  <p
    class={[
      "m-0 pt-space-1 pb-space-2 type-meta text-ink-muted",
      rail ? "ps-c-row-inset pe-space-2" : "px-space-2",
    ]}
  >
    Connect a machine to run sessions
  </p>
  <ul data-slot="list" class="m-0 flex list-none flex-col gap-space-row p-0">
    {#each CONNECT_WAYS as way (way.route)}
      {@const Icon = way.icon}
      <li>
        <button
          data-slot="row"
          aria-haspopup="dialog"
          class={[
            "select-none flex w-full min-h-space-8 items-center rounded-sm py-space-1 text-start text-ink-strong transition-control coarse:min-h-c-row-h hover:bg-surface-hover press-tint focus-inset",
            bareRow,
          ]}
          onclick={(event) => connect.openNew(event.currentTarget, way.route)}
          type="button"
        >
          <span
            data-slot="glyph"
            class={["inline-grid flex-none place-items-center", glyphBox]}
            style:color={way.hue}><Icon class="size-icon-md" /></span
          >
          <span data-slot="words" class="flex min-w-0 flex-col">
            <span data-slot="name" class="type-label text-ink-strong"
              >{way.name}</span
            >
            <span data-slot="meta" class="type-meta text-ink-muted"
              >{way.meta}</span
            >
          </span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <!-- The fleet's servers waiting on a sign-in: once for the fleet, ahead of its machines. -->
  <SignInWaits names={signInsWaiting(cawco.machines)} />
  <ul
    data-slot="list"
    class="m-0 flex list-none flex-col gap-space-row p-0"
    {@attach reflow()}
  >
    {#each cawco.machines as machine, index (machine.machineId)}
      {@const up = machine.status === "online"}
      {@const live = liveOn(machine.machineId)}
      {@const fault = faultOf(machine.machineId)}
      {@const update = updateOf(machine)}
      {@const updateFailed = updateFault(machine)}
      {@const needs = up ? needsOf(machine) : null}
      {@const back = returning.get(machine.machineId)}
      <li
        data-machine={machine.machineId}
        style:--fault-end="var(--spacing-space-2)"
        style:--fault-indent={"calc(var(--spacing-space-2) * 2 + var(--spacing-icon-md))"}
      >
        {#if back}
          <!-- A machine coming back: its own row grows into its install's, its name kept. -->
          <InstallRow {index} install={back} os={machine.os ?? ""} />
        {:else}
          <MachineMenu {machine}>
            <div
              data-slot="row"
              class={[
                "flex w-full min-h-space-8 items-center rounded-sm py-space-1 text-ink-strong transition-control coarse:min-h-c-row-h hover:bg-surface-hover press-tint focus-inset",
                tileRow,
              ]}
              style:--tile-lead={rail ? TILE_LEAD : undefined}
              tabindex="-1"
            >
              <MachineRow
                hue={machineHue(index, up)}
                icon={machineIcon(machine.os ?? "")}
                meta={[
                  `${live} live`,
                  pausedWords(machine),
                  fault,
                  update && !update.fail ? update.text : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                name={machineLabel(machine.hostname)}
                presence={presenceOf(up, fault)}
              />
            </div>
          </MachineMenu>
          <RowFault again={updateFailed?.again} reason={updateFailed?.reason} />
          <!-- What a delegate's workspace needs here and the machine lacks: how to install it. -->
          <RowFault
            command={needs?.command}
            copyLabel={workspaceNeedsWords.copyCommand}
            data-workspace-needs
            details={needs?.details}
            reason={needs?.reason}
          />
          <!-- Its last fleet delta refused, in the machine's own words under Show details. -->
          <RowFault
            data-sync-fault
            details={machine.fleetSync?.state === "nacked"
              ? machine.fleetSync.error
              : undefined}
            reason={machine.fleetSync?.state === "nacked"
              ? "It refused the fleet's last change. CawCo sends it again on its own."
              : undefined}
          />
          <ItemFaults
            items={cawco.fleetFaultsOf(machine.machineId)}
            retry={(ids) => retryFleetItems(machine.machineId, ids)}
          />
        {/if}
      </li>
    {/each}
  </ul>
  <button
    data-slot="row"
    data-add
    class={[
      "select-none mark-line press-tint focus-inset mt-space-1 flex w-full min-h-space-8 items-center rounded-ee-sm rounded-es-sm border-t border-t-border-hairline py-space-1 text-start type-label text-ink-muted transition-control coarse:min-h-c-row-h hover:bg-surface-hover",
      bareRow,
    ]}
    onclick={(event) => connect.openNew(event.currentTarget)}
    type="button"
  >
    <span
      aria-hidden="true"
      class={["inline-grid flex-none place-items-center", glyphBox]}
      data-box><IconPlus class="size-icon-md" /></span
    >
    <span>{connectWords.addMachine}</span>
  </button>
{/if}
