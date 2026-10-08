<script lang="ts">
  /**
   * `cawco.pickPlace()` (wire.ts): a page asks the person for a machine and a
   * folder on it, and gets CawCo's own pickers, over the whole of the
   * preview's well: the machine select and the folder browser New Session
   * uses. "Use this place" answers the page; Cancel or Escape answers null.
   */
  import DirectoryPicker from "#lib/components/features/DirectoryPicker.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { cawco } from "../client.svelte";
  import { appear } from "../motion/curves.svelte";

  let {
    onpick,
    oncancel,
  }: {
    onpick: (place: { machineId: string; path: string }) => Promise<void>;
    oncancel: () => void;
  } = $props();

  /** Trailing slashes on a typed folder, past the one that could be root. */
  const TRAILING_SLASHES = /(?!^)\/+$/;

  let machineId = $state(cawco.onlineMachines[0]?.machineId ?? "");
  let path = $state("");
  let saving = $state(false);
  let problem = $state<string | null>(null);

  const machine = $derived(
    cawco.onlineMachines.find((row) => row.machineId === machineId) ?? null
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
      problem = error instanceof Error ? error.message : String(error);
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
  class="place-pick"
  onsubmit={use}
  transition:appear
>
  <h2 class="pick-title">Pick a machine and folder</h2>
  <div class="flex flex-col gap-1">
    <span class="text-label text-muted-foreground" id="place-machine-label"
      >Machine</span
    >
    <Select.Root type="single" bind:value={machineId}>
      <Select.Trigger
        aria-labelledby="place-machine-label"
        class="w-full text-foreground"
        size="sm"
      >
        {machine ? `${machine.hostname} · ${machine.os}` : "No machines online"}
      </Select.Trigger>
      <Select.Content>
        {#each cawco.onlineMachines as row (row.machineId)}
          <Select.Item label="{row.hostname} · {row.os}" value={row.machineId}>
            {row.hostname}
            · {row.os}
          </Select.Item>
        {:else}
          <span class="block px-2 py-1.5 text-label">No machines online</span>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <div class="flex flex-col gap-1">
    <label class="text-label text-muted-foreground" for="place-folder"
      >Folder</label
    >
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
      machineId={machine.machineId}
      onSelect={(picked) => {
        path = picked;
        problem = null;
      }}
      value={path}
    />
  {/if}
  <div class="flex flex-wrap items-center gap-3 pt-1">
    <Button
      class="pressable"
      failed={problem !== null}
      label="Use this place"
      pending={saving}
      pendingLabel="Saving…"
      size="sm"
      type="submit"
    />
    <Button label="Cancel" onclick={oncancel} size="sm" variant="ghost" />
    {#if problem}
      <span class="text-label text-error" role="alert" in:appear
        >{problem}</span
      >
    {/if}
  </div>
</form>

<style>
  /* Over the whole well, opaque: the page under it is put by while the
     person picks, never shown cut through, so it carries its own heading. */
  .place-pick {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
    padding: var(--space-5);
    background: var(--surface-raised);
  }
  .pick-title {
    font: var(--type-title);
    color: var(--ink-strong);
  }
</style>
