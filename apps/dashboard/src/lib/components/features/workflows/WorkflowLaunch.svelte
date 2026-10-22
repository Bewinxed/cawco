<script lang="ts">
  import type { DelegateType, WorkflowListing } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { loadDelegateTypes } from "#lib/cawco/delegate-types.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { departBox, land } from "#lib/cawco/motion/share.svelte.js";
  import { fleetFolders } from "#lib/cawco/preview/fleet-pane.svelte.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import {
    type LaunchDraft,
    launchShare,
    workflowLaunches,
  } from "#lib/cawco/workflow-launch.svelte.js";
  import DirectoryPicker from "#lib/components/features/DirectoryPicker.svelte";
  import { Alert } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { NativeSelect } from "#lib/components/ui/native-select/index.js";
  import {
    Popover,
    PopoverContent,
    PopoverTitle,
  } from "#lib/components/ui/popover/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";

  /**
   * The launch form, opened under the button that asked for it (Run
   * workflow, a list row's Run). It blocks nothing (DESIGN.md, The Open
   * Page Rule): a popover with no scrim on a desk, the house bottom sheet
   * under 640px, as the New Session form opens. Opened by a pointer it
   * focuses its own card, so no field shows a ring (The One Ring Rule).
   *
   * It shows the workflow's launch as it stands (workflow-launch.svelte.ts,
   * The Work Outlives Its Surface Rule): what was typed and picked, a start
   * under way, the hub's refusal; a reload brings it back as it was. Esc or
   * a press outside closes it and parks the launch, which goes on: a start
   * under way travels into the workflow's row (WorkflowLaunchParked) and
   * comes back out of it on Reopen. Only Cancel ends it. The focus goes
   * back to the button it hangs from.
   */
  let {
    workflow,
  }: {
    workflow: WorkflowListing;
  } = $props();
  const phone = new MediaQuery("(max-width: 640px)");
  const share = $derived(launchShare(workflow.id));
  const launch = $derived(workflowLaunches.of(workflow.id));
  const busy = $derived(launch?.step === "starting");
  let shown = $state(true);
  let card = $state<HTMLElement | null>(null);
  /** The button it hangs from: the one pressed, else its workflow's Run (after a reload). */
  const from = $derived(
    workflowLaunches.from ??
      (typeof document === "undefined"
        ? null
        : document.querySelector<HTMLElement>(
            `[data-run-workflow="${CSS.escape(workflow.id)}"]`
          ))
  );
  /** Esc, ✕ or a press outside: the form closes and the launch is parked as it stands. */
  const dismissed = (open: boolean) => {
    if (open) {
      return;
    }
    if (card && launch && launch.step !== "editing") {
      // It travels into the place the launch is parked (The One Object Rule).
      departBox(share, card, false);
    }
    shown = false;
    workflowLaunches.park();
  };
  function takeFocus(event: Event) {
    event.preventDefault();
    card?.focus({ preventScroll: true });
  }
  function giveFocusBack(event: Event) {
    event.preventDefault();
    from?.focus({ preventScroll: true });
  }
  let types = $state<DelegateType[]>([]);
  /** The delegate types could not be read: said in the form. */
  let unread = $state("");
  const start = $derived(
    workflow.graph?.nodes.find((node) => node.kind === "start")
  );
  // The Start node for a graph; for a program, the `inputs` zod export the hub
  // evaluated at save. One list either way.
  const fields = $derived(
    start?.kind === "start" ? start.inputs : workflow.inputs
  );

  /** The workflow's own defaults: its default project's checkout, its supervisor, each input's default. */
  function defaults(): LaunchDraft {
    const settings = workflow.graph?.settings;
    const project = settings?.defaultProject
      ? cawco.project(settings.defaultProject)
      : null;
    const primary = project ? checkoutOf(project) : undefined;
    return {
      machineId: settings?.defaultMachine ?? primary?.machineId ?? "",
      workspace: primary?.path ?? "",
      supervisor:
        settings?.defaultSupervisor &&
        "delegateType" in settings.defaultSupervisor
          ? settings.defaultSupervisor.delegateType
          : "",
      inputs: Object.fromEntries(
        fields.map((input) => [input.name, input.default ?? ""])
      ),
    };
  }
  // What the form held, where its launch keeps it; a first open, the
  // defaults. Read once: the form is drawn for one workflow (its host keys it).
  const held = untrack(
    () => workflowLaunches.of(workflow.id)?.draft ?? defaults()
  );
  let machineId = $state(held.machineId);
  let workspace = $state(held.workspace);
  let supervisor = $state(held.supervisor);
  let inputs = $state<Record<string, string>>({ ...held.inputs });
  // Every change is written to the launch as it is made, so a reload keeps it.
  $effect(() => {
    workflowLaunches.write(workflow.id, {
      machineId,
      workspace,
      supervisor,
      inputs: $state.snapshot(inputs),
    });
  });

  const online = $derived(
    cawco.onlineMachines.some((machine) => machine.machineId === machineId)
  );
  const live = $derived(cawco.hub === "connected");
  /** Why Start run waits, said under it while it does; nothing once it can go. */
  const waits = $derived.by(() => {
    if (!live) {
      return "Can't start a run while the hub is unreachable.";
    }
    if (!machineId) {
      return "Choose the machine it runs on.";
    }
    if (!online) {
      return "That machine is offline. Choose one that's online.";
    }
    if (!workspace) {
      return "Choose the directory it runs in.";
    }
    return "";
  });
  const errorMessage = $derived(launch?.refusal ?? unread);
  onMount(() => {
    loadDelegateTypes()
      .then((data) => {
        ({ types } = data);
      })
      .catch((caught) => {
        unread = message(caught);
      });
  });
  function launchIt(event: SubmitEvent) {
    event.preventDefault();
    // biome-ignore lint/complexity/noVoid: the launch keeps its own outcome
    void workflowLaunches.start(workflow.id);
  }
  function cancel() {
    shown = false;
    workflowLaunches.cancel(workflow.id);
  }
</script>

{#snippet launchForm(sheet: boolean)}
  <div
    class="flex min-w-0 flex-col gap-space-4 type-body text-ink-strong"
    class:pb-space-4={sheet}
    data-slot="launch"
  >
    <form class="flex min-w-0 flex-col gap-space-4" onsubmit={launchIt}>
      {#if fields.length}
        {#each fields as input (input.name)}
          <label
            class="flex flex-col gap-space-2 type-label text-ink-muted"
            for="launch-{input.name}"
            >{input.label}
            {input.required ? " (required)" : ""}
            {#if input.type === "select"}
              <NativeSelect
                class="w-full"
                id="launch-{input.name}"
                required={input.required}
                bind:value={inputs[input.name]}
              >
                <option value="">Choose</option>
                {#each input.options ?? [] as option (option)}
                  <option>{option}</option>
                {/each}
              </NativeSelect>
            {:else if input.type === "path"}
              <Input
                id="launch-{input.name}"
                required={input.required}
                bind:value={inputs[input.name]}
              />
            {:else}
              <Textarea
                id="launch-{input.name}"
                required={input.required}
                rows={2}
                bind:value={inputs[input.name]}
              />
            {/if}</label
          >
        {/each}
      {/if}
      <div class="flex flex-col gap-space-3">
        <h3 class="type-label">Workspace</h3>
        <label class="flex flex-col gap-space-2 type-label text-ink-muted"
          >Project<NativeSelect
            class="w-full"
            onchange={(event) => {
              const project = cawco.project(event.currentTarget.value);
              const primary = project ? checkoutOf(project) : undefined;
              if (primary) {
                ({ machineId, path: workspace } = primary);
              }
            }}
            value=""
          >
            <option value="">Choose a project</option>
            {#each cawco.projects.filter( (each) => checkoutOf(each) ) as project (project.id)}
              <option value={project.id}>{project.name}</option>
            {/each}
          </NativeSelect></label
        >
        <label class="flex flex-col gap-space-2 type-label text-ink-muted"
          >Machine<NativeSelect class="w-full" required bind:value={machineId}>
            <option disabled value="">Choose a machine</option>
            {#each cawco.machines as machine (machine.machineId)}
              <option
                disabled={machine.status !== "online"}
                value={machine.machineId}
              >
                {machine.hostname}
                {machine.status === "online" ? "" : " · offline"}
              </option>
            {/each}
          </NativeSelect></label
        >
        <label class="flex flex-col gap-space-2 type-label text-ink-muted"
          >Directory<Input
            face="mono"
            required
            text="meta"
            bind:value={workspace}
          /></label
        >
        {#if online}
          <DirectoryPicker
            folders={fleetFolders}
            {machineId}
            onSelect={(path) => {
              workspace = path;
            }}
            value={workspace}
          />
        {/if}
      </div>
      <label class="flex flex-col gap-space-2 type-label text-ink-muted"
        >Supervisor<NativeSelect class="w-full" bind:value={supervisor}>
          <option value="">None</option>
          {#each types as type (type.name)}
            <option value={type.name}>{type.name}</option>
          {/each}
        </NativeSelect></label
      >
      {#if errorMessage}
        <Alert data-slot="launch-refusal" variant="destructive"
          >{errorMessage}</Alert
        >
      {/if}
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <Button
          disabled={busy}
          onclick={cancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button><Button
          aria-describedby={waits ? "launch-waits" : undefined}
          disabled={waits !== "" || busy}
          failed={errorMessage !== ""}
          label="Start run"
          pending={busy}
          pendingLabel="Starting workflow run…"
          type="submit"
        />
      </div>
      {#if waits}
        <p id="launch-waits" class="type-meta text-ink-muted">{waits}</p>
      {/if}
    </form>
  </div>
{/snippet}

{#if phone.current}
  <Drawer.Root onOpenChange={dismissed} open={shown}>
    <Drawer.Content
      onCloseAutoFocus={giveFocusBack}
      onOpenAutoFocus={takeFocus}
      tabindex={-1}
      title={`Run ${workflow.name}`}
      bind:ref={card}
      {@attach land(() => share)}
    >
      <Drawer.Description visible={false}
        >Choose the inputs and workspace for this workflow run.</Drawer.Description
      >
      <div
        class="kit-sheet-scroll kit-edge-fade-block min-h-0 touch-pan-y overflow-y-auto overscroll-contain"
      >
        {@render launchForm(true)}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover onOpenChange={dismissed} open={shown}>
    <PopoverContent
      align="end"
      aria-label="Run {workflow.name}"
      customAnchor={from}
      gap="snug"
      height="room"
      onCloseAutoFocus={giveFocusBack}
      onOpenAutoFocus={takeFocus}
      overflow="scroll"
      side="bottom"
      style="--pop-w: min(var(--c-new-session-pop-w), 100vw - var(--space-8) * 1.5); --pop-max-h: calc(var(--bits-popover-content-available-height) - 2px)"
      tabindex={-1}
      width="room"
      bind:ref={card}
      {@attach land(() => share)}
    >
      <PopoverTitle>Run {workflow.name}</PopoverTitle>
      <p class="text-ink-muted">
        Choose the inputs and workspace for this workflow run.
      </p>
      {@render launchForm(false)}
    </PopoverContent>
  </Popover>
{/if}
