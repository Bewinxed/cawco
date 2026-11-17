<script lang="ts">
  /**
   * The glide popover (`roomy`, the new-session form's own popovers) open
   * in a frame of its own (its states file's), holding the rows its chips
   * hold, so their corners are read against the surface's (The Concentric
   * Rule). The lifetime, project and machines chips are the real ones, fed
   * the rows the form hands them; the permission list is the real
   * PermissionSection, embedded as ModePick embeds it. Each opens its
   * surface on the page (bits-ui's portal), under its chip. A press on a
   * machine's row checks or unchecks it, as the form's own handler does.
   */
  import type { PermissionMode } from "@cawco/core/harness/modes";
  import { spawnWords } from "@cawco/core/words/spawn";
  import {
    IconChevronDown as Down,
    IconServerSquare as Server,
  } from "#lib/icons.js";
  import LifetimeChip from "./LifetimeChip.svelte";
  import MachinesChip from "./MachinesChip.svelte";
  import NsPopover from "./NsPopover.svelte";
  import type { MachineItem, ProjectItem } from "./ns-types";
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
      hue: "var(--color-mark-3)",
      machineId: "studio",
    },
    {
      id: "site",
      name: "site",
      path: "~/code/site",
      hue: "var(--color-mark-6)",
      machineId: "studio",
    },
  ];
  const machine = (
    id: string,
    os: string,
    load: string = spawnWords.machines.idle
  ): MachineItem => ({
    id,
    name: id,
    os,
    load,
    online: true,
    icon: Server,
    hue: "var(--color-mark-6)",
  });
  const MACHINES: MachineItem[] = [
    machine("studio", "macOS"),
    machine("tower", "Linux"),
    machine("laptop", "macOS", spawnWords.machines.running(2)),
  ];
  /** The machines the form holds checked: the fixture keeps what the form would. */
  let chosen = $state(["studio", "tower"]);
  const toggle = (id: string) => {
    chosen = chosen.includes(id)
      ? chosen.filter((one) => one !== id)
      : [...chosen, id];
  };
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
    <MachinesChip
      machines={MACHINES}
      onchange={still}
      ontoggle={toggle}
      open
      selected={chosen}
    />
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
