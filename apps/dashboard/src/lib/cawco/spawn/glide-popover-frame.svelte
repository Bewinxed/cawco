<script lang="ts">
  /**
   * The glide popover (`roomy`, the new-session form's own popovers) open
   * in a frame of its own (its states file's), holding the rows its chips
   * hold, so their corners are read against the surface's (The Concentric
   * Rule). The lifetime and project chips are the real ones; the permission
   * list is the real PermissionSection, embedded as ModePick embeds it; the
   * machines list stands in for MachinesChip, which reads the fleet store,
   * with its rows' own markup and corners (`machineRowRadius`). Each opens
   * its surface on the page (bits-ui's portal), under its chip.
   */
  import type { PermissionMode } from "@cawco/core";
  import { MachineRow } from "#lib/components/ui/machine-row/index.js";
  import {
    IconChevronDown as Down,
    IconServerSquare as Server,
  } from "#lib/icons.js";
  import LifetimeChip from "./LifetimeChip.svelte";
  import { machineRowRadius } from "./machine-rows";
  import NsPopover from "./NsPopover.svelte";
  import type { ProjectItem } from "./ns-types";
  import PermissionSection from "./PermissionSection.svelte";
  import ProjectChip from "./ProjectChip.svelte";

  let {
    which,
    height,
  }: {
    /** Which chip's popover stands open. */
    which: "lifetime" | "project" | "machines" | "permission";
    /** The frame's least height, px: room for the popover under its chip. */
    height: number;
  } = $props();

  const PROJECTS: ProjectItem[] = [
    {
      id: "cockpit",
      name: "cockpit",
      path: "~/code/cockpit",
      hue: "var(--hue-amber-500)",
      machineId: "studio",
    },
    {
      id: "site",
      name: "site",
      path: "~/code/site",
      hue: "var(--hue-cyan-500)",
      machineId: "studio",
    },
  ];
  const MACHINES = [
    { id: "studio", name: "studio", meta: "macOS · Idle", on: true },
    { id: "tower", name: "tower", meta: "Linux · Idle", on: true },
    { id: "laptop", name: "laptop", meta: "macOS · 2 sessions", on: false },
  ];
  const MODES: { value: PermissionMode; disabled: boolean }[] = [
    { value: "default", disabled: false },
    { value: "acceptEdits", disabled: false },
    { value: "plan", disabled: false },
  ];
  const still = () => undefined;
</script>

<div
  class="relative min-h-(--frame-h) p-space-5"
  style:--frame-h={`${height}px`}
>
  {#if which === "lifetime"}
    <LifetimeChip ephemeral={false} onchange={still} onlifetime={still} open />
  {:else if which === "project"}
    <ProjectChip
      home="/home/you"
      onchange={still}
      onclear={still}
      oncreate={async () => undefined}
      onpick={still}
      open
      projectId="cockpit"
      projects={PROJECTS}
    />
  {:else if which === "machines"}
    <NsPopover id="frame-machines" label="Machines" onchange={still} open>
      {#snippet trigger()}
        <Server />
        <span>studio, tower</span>
        <Down />
      {/snippet}
      {#each MACHINES as row, index (row.id)}
        <button
          data-slot="row"
          aria-pressed={row.on}
          class="relative flex h-c-row-h w-full select-none items-center gap-space-3 border-none bg-transparent rounded-(--row-r) px-space-2 py-space-2 text-start text-ink-strong aria-pressed:bg-selected-bg"
          style:--row-r={machineRowRadius(
            row.on,
            MACHINES[index - 1]?.on ?? false,
            MACHINES[index + 1]?.on ?? false
          )}
          type="button"
        >
          <MachineRow
            hue="var(--hue-cyan-500)"
            icon={Server}
            ink={row.on}
            meta={row.meta}
            name={row.name}
            presence="online"
          />
        </button>
      {/each}
    </NsPopover>
  {:else}
    <NsPopover
      id="frame-permission"
      label="Choose a permission mode"
      onchange={still}
      open
      width={340}
    >
      {#snippet trigger()}
        <span>Ask first</span>
        <Down />
      {/snippet}
      <PermissionSection
        embedded
        harness="claude"
        modes={MODES}
        onchange={still}
        value="default"
      />
    </NsPopover>
  {/if}
</div>
