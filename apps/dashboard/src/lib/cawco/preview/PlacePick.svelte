<script lang="ts">
  /**
   * `cawco.pickPlace()` (wire.ts): a page asks the person for a machine and a
   * folder on it, and gets CawCo's own pickers, over the whole of the
   * preview's well: the machine select and the folder browser New Session
   * uses. "Use this place" answers the page with the machine, its label (the
   * name the dashboard shows it by) and the folder; Cancel or Escape answers
   * null.
   */
  import { machineLabel, placePickWords as words } from "@cawco/core";
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
    onpick: (place: {
      label: string;
      machineId: string;
      path: string;
    }) => Promise<void>;
    oncancel: () => void;
  } = $props();

  /** Trailing slashes on a typed folder, past the one that could be root. */
  const TRAILING_SLASHES = /(?!^)\/+$/;

  const fleet = paneFleet();
  const onlineMachines = $derived(fleet.machines.filter((row) => row.online));
  /** The machine the person chose; null until they choose one. */
  let chosen = $state<string | null>(null);
  let path = $state("");
  let saving = $state(false);
  let problem = $state<string | null>(null);

  /**
   * Their choice while it is online; none until they choose, as New Session
   * opens on none: no machine goes back to the page that nobody chose.
   */
  const machine = $derived(
    onlineMachines.find((row) => row.machineId === chosen) ?? null
  );
  const folder = $derived(path.trim().replace(TRAILING_SLASHES, ""));

  async function use(event: SubmitEvent) {
    event.preventDefault();
    if (!machine) {
      problem = words.needsMachine;
      return;
    }
    if (!folder.startsWith("/")) {
      problem = words.needsPath;
      return;
    }
    saving = true;
    problem = null;
    try {
      await onpick({
        label: machineLabel(machine.hostname),
        machineId: machine.machineId,
        path: folder,
      });
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
  data-slot="place-pick"
  aria-label={words.title}
  class="absolute inset-0 z-1 flex flex-col gap-space-3 overflow-y-auto overscroll-contain p-space-5 bg-surface-raised"
  onsubmit={use}
  transition:appear
>
  <h2 class="type-title text-ink-strong">{words.title}</h2>
  <div class="flex flex-col gap-space-1">
    <span class="text-label text-ink-muted" id="place-machine-label"
      >{words.machine}</span
    >
    <Select.Root
      type="single"
      bind:value={
        () => machine?.machineId ?? "",
        (next) => {
          chosen = next;
        }
      }
    >
      <Select.Trigger
        aria-labelledby="place-machine-label"
        class="w-full"
        size="sm"
        tone="strong"
      >
        {#if machine}
          {words.machineOption(machineLabel(machine.hostname), machine.os)}
        {:else}
          <!-- Unchosen, the trigger reads as its placeholder (data-placeholder). -->
          {onlineMachines.length > 0 ? words.chooseMachine : words.noMachines}
        {/if}
      </Select.Trigger>
      <Select.Content>
        {#each onlineMachines as row (row.machineId)}
          <Select.Item
            label={words.machineOption(machineLabel(row.hostname), row.os)}
            value={row.machineId}
          >
            {words.machineOption(machineLabel(row.hostname), row.os)}
          </Select.Item>
        {:else}
          <span data-slot="block" class="block px-2 py-1.5 text-label"
            >{words.noMachines}</span
          >
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <div class="flex flex-col gap-space-1">
    <label class="text-label text-ink-muted" for="place-folder"
      >{words.folder}</label
    >
    <Input
      autocomplete="off"
      face="mono"
      id="place-folder"
      oninput={() => {
        problem = null;
      }}
      placeholder={words.folderPlaceholder}
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
      label={words.use}
      pending={saving}
      pendingLabel={words.saving}
      size="sm"
      type="submit"
    />
    <Button label={words.cancel} onclick={oncancel} size="sm" variant="ghost" />
    {#if problem}
      <span class="text-label text-error-9" role="alert" in:appear
        >{problem}</span
      >
    {/if}
  </div>
</form>
