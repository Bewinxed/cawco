<script lang="ts">
  import { machineLabel } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * The machines as a list: each machine (its menu on right-click or
   * long-press: update, reload, log in, unlock, forget), then Add machine.
   * With no machine yet it is the empty fleet's compact form: one line and
   * the two ways in, each opening Connect a machine on its tab. Shown in the
   * wide bar's Machines popover and in the phone's sidebar; `onleave` is
   * called before a row opens a dialog, so the place it stands in can close.
   */
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { cawco, type Machine } from "./client.svelte";
  import { home } from "./home/home-state.svelte";
  import { answerMachine, hubAuth } from "./hub-auth.svelte";
  import { failureWords } from "./hub-read";
  import { addMachine, JOIN_WAYS } from "./join/join.svelte";
  import MachineMenu from "./MachineMenu.svelte";
  import { pausedWords } from "./machine-pause";
  import RowFault from "./RowFault.svelte";
  import { cellFor } from "./updates/model";
  import { updates } from "./updates/updates.svelte";

  let { onleave }: { onleave?: () => void } = $props();

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
    cawco.runningRows.filter((row) => row.machineId === machineId).length;
  /** The row's dot: down, up but in trouble, or fine. */
  function presenceOf(
    up: boolean,
    fault: string | undefined
  ): "online" | "away" | "off" {
    if (!up) {
      return "off";
    }
    return fault ? "away" : "online";
  }
  const faultOf = (machineId: string): string | undefined =>
    home.exceptions.find((entry) => entry.machineId === machineId)?.text;

  /**
   * An update under way says where it stands on the machine's row, in the
   * Update cell's words, on the machine's word; one that failed says why
   * under the row, with Retry where a retry is the person's to make.
   */
  const MOVING = new Set([
    "ready",
    "downloading",
    "installing",
    "waiting-sessions",
    "failed",
    "failed-rolled-back",
  ]);
  $effect(() => {
    if (!(updates.policy || updates.problem)) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the rows read the policy when it lands
      void updates.loadPolicy();
    }
  });
  function updateOf(machine: Machine) {
    const phase =
      machine.status === "online" ? machine.binaryUpdate?.phase : undefined;
    if (!(updates.policy && phase && MOVING.has(phase))) {
      return null;
    }
    return cellFor(machine, updates.policy);
  }
  function updateFault(machine: Machine) {
    const refused = updates.refused.get(machine.machineId);
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
    class="mx-0 mt-0 mb-space-1 flex list-none flex-col gap-space-row border-b border-b-seam px-0 pt-0 pb-space-1"
  >
    {#each hubAuth.waiting as machine (machine.machineId)}
      {@const name = machineLabel(machine.hostname ?? machine.machineId)}
      <!-- literal: 44px -->
      <li
        data-slot="row"
        class="flex w-full min-h-space-8 items-center gap-space-2 rounded-sm border-none border-current bg-transparent px-space-2 py-space-1 text-start text-ink-strong transition-control coarse:min-h-(--row-touch) hover:bg-surface-hover cursor-default"
        data-waiting={machine.machineId}
        style:--row-touch="44px"
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
{#if cawco.machines.length === 0}
  <!-- No machine yet: the empty fleet's two ways in, as rows. -->
  <p class="m-0 px-space-2 pt-space-1 pb-space-2 type-meta text-ink-muted">Connect a machine to run sessions</p>
  <ul
    data-slot="list"
    class="m-0 flex list-none flex-col gap-space-row p-0"
  >
    {#each JOIN_WAYS as way (way.way)}
      {@const Icon = way.icon}
      <li>
        <!-- literal: 44px -->
        <button
          data-slot="row"
          aria-haspopup="dialog"
          class="flex w-full min-h-space-8 items-center gap-space-2 rounded-sm border-none border-current bg-transparent px-space-2 py-space-1 text-start text-ink-strong transition-control coarse:min-h-(--row-touch) hover:bg-surface-hover cursor-pointer press-tint focus-inset"
          onclick={() => {
            onleave?.();
            addMachine.show(way.way);
          }}
          style:--row-touch="44px"
          type="button"
        >
          <span
            data-slot="glyph"
            class="inline-grid w-icon-md flex-none place-items-center text-(color:--glyph-ink)"
            style:--glyph-ink={way.hue}
            ><Icon class="size-icon-md" /></span
          >
          <span data-slot="words" class="flex min-w-0 flex-col">
            <span data-slot="name" class="type-label text-ink-strong">{way.name}</span>
            <span data-slot="meta" class="type-meta text-ink-muted">{way.meta}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <ul
    data-slot="list"
    class="m-0 flex list-none flex-col gap-space-row p-0"
  >
    {#each cawco.machines as machine, index (machine.machineId)}
      {@const up = machine.status === "online"}
      {@const live = liveOn(machine.machineId)}
      {@const fault = faultOf(machine.machineId)}
      {@const update = updateOf(machine)}
      {@const updateFailed = updateFault(machine)}
      <li
        data-machine={machine.machineId}
        style:--fault-end="var(--space-2)"
        style:--fault-indent="calc(var(--space-2) * 2 + var(--icon-md))"
      >
        <MachineMenu {machine}>
          <!-- literal: 44px -->
          <div
            data-slot="row"
            class="flex w-full min-h-space-8 items-center gap-space-2 rounded-sm border-none border-current bg-transparent px-space-2 py-space-1 text-start text-ink-strong transition-control coarse:min-h-(--row-touch) hover:bg-surface-hover press-tint focus-inset"
            style:--row-touch="44px"
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
        <RowFault
          again={updateFailed?.again}
          reason={updateFailed?.reason}
        />
      </li>
    {/each}
  </ul>
  <!-- literal: 44px -->
  <button
    data-slot="row"
    data-add
    class="mark-line press-tint focus-inset mt-space-1 flex w-full min-h-space-8 cursor-pointer items-center gap-space-2 rounded-ee-sm rounded-es-sm border-t border-t-seam border-r-none border-b-none border-l-none bg-transparent px-space-2 py-space-1 text-start type-label text-ink-muted transition-control coarse:min-h-(--row-touch) hover:bg-surface-hover"
    style:--row-touch="44px"
    onclick={() => {
      onleave?.();
      addMachine.show();
    }}
    type="button"
  >
    <IconPlus aria-hidden="true" class="size-icon-md" />
    <span>Add machine</span>
  </button>
{/if}
