<script lang="ts">
  /**
   * The controls that mark a chosen or current item, each with one item
   * chosen and one not, for the chosen-hover probe: the new-session chips'
   * rows (`?control=lifetime|project|machines` opens that one's popover),
   * the permission rows, the side panel's pressed head button, the plan
   * ring, the comments list's current pin, the model list (its catalogue
   * is the browser's kept one, `cawco-models:by-harness`, which the
   * chosen-hover spec seeds with two Claude models before the page loads),
   * a live Crepe editor, for its slash menu, and a Caw reply's file chips
   * (`?control=files` stands the page on that project's file, shallowly, as
   * the project page does, so the first chip reads current).
   */
  import type { Pin } from "@cawco/core/comments";
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import PinList from "#lib/cawco/preview/PinList.svelte";
  import FolderFiles from "#lib/cawco/project/FolderFiles.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import LifetimeChip from "#lib/cawco/spawn/LifetimeChip.svelte";
  import MachinesChip from "#lib/cawco/spawn/MachinesChip.svelte";
  import ModelSection from "#lib/cawco/spawn/ModelSection.svelte";
  import type { MachineItem, ProjectItem } from "#lib/cawco/spawn/ns-types.js";
  import PermissionSection from "#lib/cawco/spawn/PermissionSection.svelte";
  import ProjectChip from "#lib/cawco/spawn/ProjectChip.svelte";
  import MarkdownEditor from "#lib/components/features/MarkdownEditor.svelte";
  import { IconEye, IconLaptop, IconPen, IconServer } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  const control = $derived(page.url.searchParams.get("control"));

  const projects: ProjectItem[] = [
    {
      hue: "var(--hue-blue-500)",
      id: "p1",
      machineId: "m1",
      name: "cockpit",
      path: "~/cockpit",
    },
    {
      hue: "var(--hue-orange-500)",
      id: "p2",
      machineId: "m1",
      name: "landing",
      path: "~/landing",
    },
  ];
  const machines: MachineItem[] = [
    {
      hue: "var(--hue-blue-500)",
      icon: IconLaptop,
      id: "m1",
      load: "2 sessions",
      name: "studio",
      online: true,
      os: "macOS",
    },
    {
      hue: "var(--hue-orange-500)",
      icon: IconServer,
      id: "m2",
      load: "idle",
      name: "build-box",
      online: true,
      os: "Linux",
    },
  ];
  const pin = (id: string, number: number): Pin => ({
    anchor: { element: `e${number}` },
    at: "2026-10-18T09:00:00Z",
    by: "person",
    elements: [],
    id,
    kind: "comment",
    number,
    thread: [],
  });
  const pins: Pin[] = [pin("pin-1", 1), pin("pin-2", 2)];
  const noop = () => undefined;
  let markdown = $state("");

  $effect(() => {
    if (control === "files") {
      goto("/project/p1?file=notes.md", { replace: true, shallow: true });
    }
  });
</script>

<svelte:head><title>Chosen and hover | CawCo</title></svelte:head>
<main
  data-bench
  class="flex flex-wrap items-box-start gap-space-6 p-space-8 text-ink-strong *:min-w-0"
>
  <section data-probe="lifetime">
    <LifetimeChip
      ephemeral={false}
      onchange={noop}
      onlifetime={noop}
      open={control === "lifetime"}
    />
  </section>
  <section data-probe="project">
    <ProjectChip
      home="/home/me"
      onchange={noop}
      onclear={noop}
      oncreate={async () => undefined}
      onpick={noop}
      open={control === "project"}
      projectId="p1"
      {projects}
    />
  </section>
  <section data-probe="machines">
    <MachinesChip
      {machines}
      onchange={noop}
      ontoggle={noop}
      open={control === "machines"}
      selected={["m1"]}
    />
  </section>
  <section data-probe="permission">
    <PermissionSection
      harness="claude"
      modes={[
        { value: "default", disabled: false },
        { value: "acceptEdits", disabled: false },
      ]}
      onchange={noop}
      value="default"
    />
  </section>
  <!-- literal: 360px, 240px -->
  <section
    class="h-(--side-h) w-(--side-w)"
    data-probe="side"
    style:--side-h="240px"
    style:--side-w="360px"
  >
    <SideSurface label="Preview" onclose={noop} title="Preview">
      {#snippet actions()}
        <button aria-label="Inspect" aria-pressed="true" type="button"
          ><IconEye /></button
        >
        <button aria-label="Draw" aria-pressed="false" type="button"
          ><IconPen /></button
        >
      {/snippet}
      <p>Well</p>
    </SideSurface>
  </section>
  <section data-probe="plan-ring">
    <PlanRing done={1} onopen={noop} open={true} total={3} />
    <PlanRing done={1} onopen={noop} open={false} total={3} />
  </section>
  <!-- literal: 480px -->
  <section class="w-(--bench-w)" data-probe="model" style:--bench-w="480px">
    <ModelSection
      harness="claude"
      installed={["claude"]}
      machineIds={[]}
      machineName="studio"
      model="claude-opus-4-5"
      onharness={noop}
      onmodel={noop}
    />
  </section>
  <!-- literal: 480px -->
  <section class="w-(--bench-w)" data-probe="slash" style:--bench-w="480px">
    <MarkdownEditor bind:value={markdown} label="Notes" />
  </section>
  <section data-probe="pins">
    <PinList
      focused="pin-1"
      live={new Set()}
      onclose={noop}
      onopen={noop}
      onplace={noop}
      {pins}
      placing={null}
    />
  </section>
  <section data-probe="files">
    <FolderFiles files={["notes.md", "plan.md"]} projectId="p1" />
  </section>
</main>
