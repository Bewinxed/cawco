<script lang="ts">
  import type { DelegateType, Workflow } from "@whiffle/core";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import DirectoryPicker from "$lib/components/features/DirectoryPicker.svelte";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Dialog from "$lib/components/ui/dialog";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { loadDelegateTypes, message } from "$lib/whiffle/delegate-types";
  import { launchWorkflow } from "$lib/whiffle/workflows";

  let { workflow, onclose }: { onclose: () => void; workflow: Workflow } =
    $props();
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
    whiffle.onlineMachines.some((machine) => machine.machineId === machineId)
  );
  onMount(() => {
    const defaults = workflow.graph?.settings;
    const project = defaults?.defaultProject
      ? whiffle.project(defaults.defaultProject)
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
      await goto(`/workflows/${workflow.id}/runs/${runId}`);
      onclose();
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      busy = false;
    }
  }
</script>
<Dialog.Root
  onOpenChange={(open) => { if (!(open || busy)) { onclose(); } }}
  open
  ><Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
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
              onchange={(event) => { const project = whiffle.project(event.currentTarget.value); if (project) { ({ machineId, cwd: workspace } = project); } }}
              value=""
            >
              <option value="">Choose a project or enter a directory</option>
              {#each whiffle.projects as project (project.id)}
                <option value={project.id}>{project.name}</option>
              {/each}
            </select></label
          >
          <label
            >Machine<select required bind:value={machineId}>
              <option disabled value="">Choose a machine</option>
              {#each whiffle.machines as machine (machine.machineId)}
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
            onclick={onclose}
            type="button"
          >
            Cancel
          </button><button
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            class="wf-btn wf-primary start"
            disabled={!(online && workspace && whiffle.hub === 'connected')}
            onclick={whileIdle(() => busy, undefined)}
            title={whiffle.hub === 'connected'
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
  /* The start button draws the kit's pending content in the workflow skin:
     its gap and icon size, and no press while the run is being started. */
  .start {
    --btn-gap: var(--space-2);
    --btn-icon: 16px;
  }
  .start[aria-busy="true"] {
    pointer-events: none;
  }
  .wf-launch :global(button) {
    min-height: 44px;
  }
</style>
