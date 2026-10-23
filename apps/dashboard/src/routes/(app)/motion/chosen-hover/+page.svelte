<script lang="ts">
  /**
   * The controls that mark a chosen or current item, each with one item
   * chosen and one not, for the chosen-hover probe: the new-session chips'
   * rows (`?control=lifetime|project|machines` opens that one's popover),
   * the permission rows, the side panel's pressed head button, the kit
   * Toggle itself (one pressed, one not), the plan ring, the Comments rail's open row, the model list (its catalogue
   * is what the machines report, models.svelte.ts: the bench has no hub, so
   * it stands one machine in the client's own state reporting two Claude
   * models, the first chosen),
   * a live Crepe editor, for its slash menu, and a Caw reply's file chips
   * (`?control=files` stands the page on that project's file, shallowly, as
   * the project page does, so the first chip reads current), a chosen
   * option chip that is a button, and the split's handle (its drag's
   * `data-active` the probe sets).
   */
  import { CAPABILITIES_NONE } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import CommentRail from "#lib/cawco/preview/CommentRail.svelte";
  import FolderFiles from "#lib/cawco/project/FolderFiles.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import LifetimeChip from "#lib/cawco/spawn/LifetimeChip.svelte";
  import MachinesChip from "#lib/cawco/spawn/MachinesChip.svelte";
  import ModelSection from "#lib/cawco/spawn/ModelSection.svelte";
  import type { MachineItem, ProjectItem } from "#lib/cawco/spawn/ns-types.js";
  import PermissionSection from "#lib/cawco/spawn/PermissionSection.svelte";
  import ProjectChip from "#lib/cawco/spawn/ProjectChip.svelte";
  import MarkdownEditor from "#lib/components/features/MarkdownEditor.svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
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
  const pin = (id: string, number: number, words: string[]): Pin => ({
    anchor: { element: `e${number}` },
    at: "2026-10-18T09:00:00Z",
    by: "person",
    elements: [],
    id,
    kind: "comment",
    number,
    thread: words.map((text, i) => ({
      at: "2026-10-18T09:00:00Z",
      by: i === 0 ? "person" : "agent",
      id: `${id}-${i}`,
      text,
    })),
  });
  // The rows as the rail draws them: a comment answered, and one waiting.
  const pins: Pin[] = [
    pin("pin-1", 1, [
      "Make this heading a bit bigger",
      "Done: the heading is a step larger now.",
    ]),
    pin("pin-2", 2, [
      "The paragraph under it starts before the eye has settled; give the heading more room above it.",
    ]),
  ];
  const noop = () => undefined;

  let markdown = $state("");

  // The model list's catalogue: one machine reporting two Claude models.
  // Stood once, in the browser: the board never comes over a bench's hub.
  $effect(() => {
    if (cawco.machines.some((one) => one.machineId === "bench-models")) {
      return;
    }
    cawco.machines.push({
      auth: "unknown",
      harnesses: [
        {
          auth: "authenticated",
          capabilities: CAPABILITIES_NONE,
          harness: "claude",
          installed: true,
          models: [
            { displayName: "Opus 4.5", value: "claude-opus-4-5" },
            { displayName: "Sonnet 4.5", value: "claude-sonnet-4-5" },
          ],
        },
      ],
      hostname: "studio",
      lastSeenAt: null,
      machineId: "bench-models",
      os: "darwin",
      pausedUntil: null,
      pauseStopped: null,
      status: "online",
    });
  });

  $effect(() => {
    if (control === "files") {
      goto("/project/p1?file=notes.md", { replace: true, shallow: true });
    }
  });
</script>

<svelte:head><title>Chosen and hover | CawCo</title></svelte:head>
<main
  data-bench
  class="flex flex-wrap items-start gap-space-6 p-space-8 text-ink-strong"
>
  <section class="min-w-0" data-probe="lifetime">
    <LifetimeChip
      ephemeral={false}
      onchange={noop}
      onlifetime={noop}
      open={control === "lifetime"}
    />
  </section>
  <section class="min-w-0" data-probe="project">
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
  <section class="min-w-0" data-probe="machines">
    <MachinesChip
      {machines}
      onchange={noop}
      ontoggle={noop}
      open={control === "machines"}
      selected={["m1"]}
    />
  </section>
  <section class="min-w-0" data-probe="permission">
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
  <section class="h-c-bench-side-h w-c-bench-side-w min-w-0" data-probe="side">
    <SideSurface label="Preview" onclose={noop} title="Preview">
      {#snippet actions()}
        <Toggle aria-label="Inspect" pressed={true} size="sm"
          ><IconEye /></Toggle
        >
        <Toggle aria-label="Draw" pressed={false} size="sm"><IconPen /></Toggle>
      {/snippet}
      <p>Well</p>
    </SideSurface>
  </section>
  <section class="min-w-0" data-probe="toggle">
    <Toggle aria-label="Bold" pressed={true}>B</Toggle>
    <Toggle aria-label="Italic" pressed={false}>I</Toggle>
  </section>
  <section class="min-w-0" data-probe="plan-ring">
    <PlanRing done={1} onopen={noop} open={true} total={3} />
    <PlanRing done={1} onopen={noop} open={false} total={3} />
  </section>
  <section class="w-c-bench-field-w min-w-0" data-probe="model">
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
  <section class="w-c-bench-field-w min-w-0" data-probe="slash">
    <MarkdownEditor bind:value={markdown} label="Notes" />
  </section>
  <!-- The Comments rail as it stands beside the page, its first comment's thread open. -->
  <section class="h-c-bench-side-h min-w-0" data-probe="pins">
    <CommentRail
      down={null}
      focused="pin-1"
      hold="ready"
      live={new Set(["pin-2"])}
      onclose={noop}
      onhover={noop}
      onopen={noop}
      onpage={noop}
      onresolve={noop}
      onretry={noop}
      onretrypin={noop}
      open="pin-1"
      {pins}
      unread={new Set()}
    />
  </section>
  <section class="min-w-0" data-probe="files">
    <FolderFiles files={["notes.md", "plan.md"]} projectId="p1" />
  </section>
  <section class="min-w-0" data-probe="chip-chosen">
    <button
      class={chipVariants({ variant: "option" })}
      data-chosen
      type="button"><span>Chosen</span></button
    >
  </section>
  <section class="h-c-bench-side-h w-c-bench-side-w min-w-0" data-probe="split">
    <Resizable.PaneGroup direction="horizontal">
      <Resizable.Pane defaultSize={50} look="split" />
      <Resizable.Handle look="split" />
      <Resizable.Pane defaultSize={50} look="split" />
    </Resizable.PaneGroup>
  </section>
</main>
