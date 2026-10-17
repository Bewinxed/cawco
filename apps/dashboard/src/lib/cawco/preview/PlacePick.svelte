<script lang="ts">
  /**
   * `cawco.pickPlace()` (wire.ts): a page asks the person for a machine and a
   * folder on it, and gets CawCo's own pickers, over the whole of the
   * preview's well: the machine select and the folder browser New Session
   * uses. "Use this place" answers the page; Cancel or Escape answers null.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import DirectoryPicker from "#lib/components/features/DirectoryPicker.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { appear } from "../motion/curves.svelte";
  import { paneFleet } from "./pane-fleet";

  let {
    onpick,
    oncancel,
  }: {
    onpick: (place: { machineId: string; path: string }) => Promise<void>;
    oncancel: () => void;
  } = $props();

  /** Trailing slashes on a typed folder, past the one that could be root. */
  const TRAILING_SLASHES = /(?!^)\/+$/;

  const fleet = paneFleet();
  const onlineMachines = $derived(fleet.machines.filter((row) => row.online));
  let machineId = $state(
    fleet.machines.find((row) => row.online)?.machineId ?? ""
  );
  let path = $state("");
  let saving = $state(false);
  let problem = $state<string | null>(null);

  const machine = $derived(
    onlineMachines.find((row) => row.machineId === machineId) ?? null
  );
  const folder = $derived(path.trim().replace(TRAILING_SLASHES, ""));

  async function use(event: SubmitEvent) {
    event.preventDefault();
    if (!machine) {
      problem = "Choose a machine that is online.";
      return;
    }
    if (!folder.startsWith("/")) {
      problem = "A folder is its full path, starting with /.";
      return;
    }
    saving = true;
    problem = null;
    try {
      await onpick({ machineId: machine.machineId, path: folder });
    } catch (error) {
      problem = failureWords(error);
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      oncancel();
    }
  }}
/>

<form
  aria-label="Pick a machine and folder"
  class="absolute inset-0 z-1 flex flex-col gap-space-3 overflow-y-auto p-space-5 bg-surface-raised"
  onsubmit={use}
  transition:appear
>
  <h2 class="type-title text-ink-strong">Pick a machine and folder</h2>
  <div class="flex flex-col gap-space-1">
    <span class="text-label text-ink-muted" id="place-machine-label"
      >Machine</span
    >
    <Select.Root type="single" bind:value={machineId}>
      <Select.Trigger
        aria-labelledby="place-machine-label"
        class="w-full text-ink-strong"
        size="sm"
      >
        {machine ? `${machine.hostname} · ${machine.os}` : "No machines online"}
      </Select.Trigger>
      <Select.Content>
        {#each onlineMachines as row (row.machineId)}
          <Select.Item label="{row.hostname} · {row.os}" value={row.machineId}>
            {row.hostname}
            · {row.os}
          </Select.Item>
        {:else}
          <span data-slot="block" class="block px-2 py-1.5 text-label"
            >No machines online</span
          >
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <div class="flex flex-col gap-space-1">
    <label class="text-label text-ink-muted" for="place-folder">Folder</label>
    <Input
      autocomplete="off"
      class="font-mono"
      id="place-folder"
      oninput={() => {
        problem = null;
      }}
      placeholder="/home/you/project"
      spellcheck="false"
      bind:value={path}
    />
  </div>
  {#if machine}
    <DirectoryPicker
      folders={fleet.folders}
      machineId={machine.machineId}
      onSelect={(picked) => {
        path = picked;
        problem = null;
      }}
      value={path}
    />
  {/if}
  <div class="flex flex-wrap items-center gap-3 pt-space-1">
    <Button
      press="pressable"
      failed={problem !== null}
      label="Use this place"
      pending={saving}
      pendingLabel="Saving…"
      size="sm"
      type="submit"
    />
    <Button label="Cancel" onclick={oncancel} size="sm" variant="ghost" />
    {#if problem}
      <span class="text-label text-error-9" role="alert" in:appear
        >{problem}</span
      >
    {/if}
  </div>
</form>
