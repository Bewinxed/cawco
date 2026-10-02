<script lang="ts">
  import type { DelegateType, Workflow } from "@cawco/core";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { cawco } from "$lib/cawco/client.svelte";
  import { loadDelegateTypes, message } from "$lib/cawco/delegate-types";
  import { dur, ease, motionOk } from "$lib/cawco/motion/curves.svelte";
  import { runHref } from "$lib/cawco/workflow-runs";
  import { launchWorkflow } from "$lib/cawco/workflows";
  import DirectoryPicker from "$lib/components/features/DirectoryPicker.svelte";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Dialog from "$lib/components/ui/dialog";

  let {
    workflow,
    from,
    onclose,
  }: {
    /** The button that opened the dialog: it grows from there and goes back into it. */
    from?: HTMLElement;
    onclose: () => void;
    workflow: Workflow;
  } = $props();
  let shown = $state(true);
  let content = $state<HTMLElement | null>(null);
  /**
   * Where the dialog stands against the button it came from: the step that
   * puts its centre on the button's, and the scale that brings it down
   * toward the button's size (no smaller than half, so it reads as the
   * dialog growing and not as a dot).
   */
  function fromButton(node: HTMLElement, button: HTMLElement) {
    const box = node.getBoundingClientRect();
    const at = button.getBoundingClientRect();
    const x = at.left + at.width / 2 - (box.left + box.width / 2);
    const y = at.top + at.height / 2 - (box.top + box.height / 2);
    const scale = Math.max(0.5, at.width / box.width);
    return {
      opacity: 0,
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
    };
  }
  // Opening, it grows out of the button over --dur-panel on the drawer
  // curve; closing, it shrinks back into it at the exit tier, and bits-ui
  // holds it mounted until that ends. Over the kit's own entrance, which
  // it overrides for as long as it runs.
  $effect(() => {
    if (!(content && from && motionOk.current)) {
      return;
    }
    const at = fromButton(content, from);
    const rest = { opacity: 1, transform: "none" };
    if (shown) {
      content.animate([at, rest], {
        duration: dur("--dur-panel"),
        easing: ease("--ease-drawer"),
      });
    } else {
      content.animate([rest, at], {
        duration: dur("--dur-exit"),
        easing: ease("--ease-out"),
        fill: "forwards",
      });
    }
  });
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
  onMount(() => {
    const defaults = workflow.graph?.settings;
    const project = defaults?.defaultProject
      ? cawco.project(defaults.defaultProject)
      : null;
    machineId = defaults?.defaultMachine ?? project?.machineId ?? "";
    workspace = project?.cwd ?? "";
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
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      busy = false;
    }
  }
</script>
<Dialog.Root
  onOpenChangeComplete={(next) => { if (!next) { onclose(); } }}
  bind:open={shown}
  ><Dialog.Content
    class="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
    escapeKeydownBehavior={busy ? 'ignore' : 'close'}
    interactOutsideBehavior={busy ? 'ignore' : 'close'}
    bind:ref={content}
    ><div class="wf wf-stack wf-launch">
      <Dialog.Header
        ><Dialog.Title>Run {workflow.name}</Dialog.Title
        ><Dialog.Description
          >Choose the inputs and workspace for this workflow
          run.</Dialog.Description
        ></Dialog.Header
      >
      <form class="wf-stack" onsubmit={launch}>
        {#if fields.length}
          {#each fields as input (input.name)}
            <label for="launch-{input.name}"
              >{input.label}
              {input.required ? ' (required)' : ''}
              {#if input.type === 'select'}
                <select
                  id="launch-{input.name}"
                  required={input.required}
                  bind:value={inputs[input.name]}
                >
                  <option value="">Choose</option>
                  {#each input.options ?? [] as option (option)}
                    <option>{option}</option>
                  {/each}
                </select>
              {:else if input.type === 'path'}
                <input
                  id="launch-{input.name}"
                  required={input.required}
                  bind:value={inputs[input.name]}
                >
              {:else}
                <textarea
                  id="launch-{input.name}"
                  required={input.required}
                  rows="2"
                  bind:value={inputs[input.name]}
                ></textarea>
              {/if}</label
            >
          {/each}
        {/if}
        <div class="wf-well">
          <h3>Workspace</h3>
          <label
            >Project<select
              onchange={(event) => { const project = cawco.project(event.currentTarget.value); if (project) { ({ machineId, cwd: workspace } = project); } }}
              value=""
            >
              <option value="">Choose a project or enter a directory</option>
              {#each cawco.projects as project (project.id)}
                <option value={project.id}>{project.name}</option>
              {/each}
            </select></label
          >
          <label
            >Machine<select required bind:value={machineId}>
              <option disabled value="">Choose a machine</option>
              {#each cawco.machines as machine (machine.machineId)}
                <option
                  disabled={machine.status !== 'online'}
                  value={machine.machineId}
                >
                  {machine.hostname}
                  {machine.status === 'online' ? '' : ' · offline'}
                </option>
              {/each}
            </select></label
          >
          <label
            >Directory<input
              class="wf-mono"
              required
              bind:value={workspace}
            ></label
          >
          {#if online}
            <DirectoryPicker
              {machineId}
              onSelect={(path) => { workspace = path; }}
              value={workspace}
            />
          {/if}
        </div>
        <label
          >Supervisor<select bind:value={supervisor}>
            <option value="">None</option>
            {#each types as type (type.name)}
              <option value={type.name}>{type.name}</option>
            {/each}
          </select></label
        >
        {#if errorMessage}
          <p class="wf-error" role="alert">{errorMessage}</p>
        {/if}
        <div class="wf-row wf-spread">
          <button
            class="wf-btn"
            disabled={busy}
            onclick={() => { shown = false; }}
            type="button"
          >
            Cancel
          </button><button
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            class="wf-btn wf-primary"
            disabled={!(online && workspace && cawco.hub === 'connected')}
            onclick={whileIdle(() => busy, undefined)}
            title={cawco.hub === 'connected'
              ? undefined
              : "Can't start a run while the hub is unreachable"}
            type="submit"
          >
            <PendingContent
              failed={errorMessage !== ''}
              label="Start run"
              pending={busy}
              pendingLabel="Starting workflow run…"
            />
          </button>
        </div>
      </form>
    </div></Dialog.Content
  ></Dialog.Root
>
<style>
  .wf-launch :global(button) {
    min-height: 44px;
  }
</style>
