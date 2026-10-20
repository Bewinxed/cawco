<script lang="ts">
  import type { DelegateType, WorkflowListing } from "@cawco/core";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { loadDelegateTypes } from "#lib/cawco/delegate-types.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { fleetFolders } from "#lib/cawco/preview/fleet-pane.svelte.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import { runHref } from "#lib/cawco/workflow-runs.js";
  import { launchWorkflow } from "#lib/cawco/workflows.js";
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
  import { goto } from "$app/navigation";

  /**
   * The launch form, opened under the button that asked for it (Run
   * workflow, a list row's Run). It blocks nothing (DESIGN.md, The Open
   * Page Rule): a popover with no scrim on a desk, the house bottom sheet
   * under 640px, as the New Session form opens. Esc or a press outside
   * closes it, and the focus goes back to the button. Opened by a pointer
   * it focuses its own card, so no field shows a ring (The One Ring Rule).
   */
  let {
    workflow,
    from,
    onclose,
  }: {
    /** The button it opens under, which the focus goes back to. */
    from: HTMLElement;
    onclose: () => void;
    workflow: WorkflowListing;
  } = $props();
  const phone = new MediaQuery("(max-width: 640px)");
  let shown = $state(true);
  let card = $state<HTMLElement | null>(null);
  const dismissed = (open: boolean) => {
    if (!(open || busy)) {
      shown = false;
      onclose();
    }
  };
  function takeFocus(event: Event) {
    event.preventDefault();
    card?.focus({ preventScroll: true });
  }
  function giveFocusBack(event: Event) {
    event.preventDefault();
    from.focus({ preventScroll: true });
  }
  let machineId = $state("");
  let workspace = $state("");
  let supervisor = $state("");
  let inputs = $state<Record<string, string>>({});
  let types = $state<DelegateType[]>([]);
  let errorMessage = $state("");
  let busy = $state(false);
  const start = $derived(
    workflow.graph?.nodes.find((node) => node.kind === "start")
  );
  // The Start node for a graph; for a program, the `inputs` zod export the hub
  // evaluated at save. One list either way.
  const fields = $derived(
    start?.kind === "start" ? start.inputs : workflow.inputs
  );
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
  onMount(() => {
    const defaults = workflow.graph?.settings;
    const project = defaults?.defaultProject
      ? cawco.project(defaults.defaultProject)
      : null;
    const primary = project ? checkoutOf(project) : undefined;
    machineId = defaults?.defaultMachine ?? primary?.machineId ?? "";
    workspace = primary?.path ?? "";
    supervisor =
      defaults?.defaultSupervisor &&
      "delegateType" in defaults.defaultSupervisor
        ? defaults.defaultSupervisor.delegateType
        : "";
    inputs = Object.fromEntries(
      fields.map((input) => [input.name, input.default ?? ""])
    );
    loadDelegateTypes()
      .then((data) => {
        ({ types } = data);
      })
      .catch((caught) => {
        errorMessage = message(caught);
      });
  });
  async function launch(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    errorMessage = "";
    try {
      const { runId } = await launchWorkflow(workflow.id, {
        inputs,
        workspace: { path: workspace, machineId },
        supervisor: supervisor ? { delegateType: supervisor } : null,
      });
      await goto(runHref(runId));
      shown = false;
      onclose();
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet launchForm(sheet: boolean)}
  <div
    class="flex min-w-0 flex-col gap-space-4 type-body text-ink-strong"
    class:pb-space-4={sheet}
    data-slot="launch"
  >
    <form class="flex min-w-0 flex-col gap-space-4" onsubmit={launch}>
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
        <Alert variant="destructive">{errorMessage}</Alert>
      {/if}
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <Button
          disabled={busy}
          onclick={() => dismissed(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button><Button
          aria-describedby={waits ? "launch-waits" : undefined}
          disabled={waits !== ""}
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
      aria-label="Run {workflow.name}"
      onCloseAutoFocus={giveFocusBack}
      onOpenAutoFocus={takeFocus}
      tabindex={-1}
      bind:ref={card}
    >
      <Drawer.Header>
        <Drawer.Title>Run {workflow.name}</Drawer.Title>
      </Drawer.Header>
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
      interactOutsideBehavior={busy ? "ignore" : "close"}
      escapeKeydownBehavior={busy ? "ignore" : "close"}
      onCloseAutoFocus={giveFocusBack}
      onOpenAutoFocus={takeFocus}
      overflow="scroll"
      side="bottom"
      style="--pop-w: min(var(--c-new-session-pop-w), 100vw - var(--space-8) * 1.5); --pop-max-h: calc(var(--bits-popover-content-available-height) - 2px)"
      tabindex={-1}
      width="room"
      bind:ref={card}
    >
      <PopoverTitle>Run {workflow.name}</PopoverTitle>
      <p class="text-ink-muted">
        Choose the inputs and workspace for this workflow run.
      </p>
      {@render launchForm(false)}
    </PopoverContent>
  </Popover>
{/if}
