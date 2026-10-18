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
   * Their choice while it is online; until they choose, the first machine
   * online now, so one heard after the picker opened is offered at once.
   */
  const machine = $derived(
    chosen === null
      ? (onlineMachines[0] ?? null)
      : (onlineMachines.find((row) => row.machineId === chosen) ?? null)
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
  aria-label={words.title}
  class="place-pick"
  onsubmit={use}
  transition:appear
>
  <h2 class="pick-title">{words.title}</h2>
  <div class="flex flex-col gap-1">
    <span class="text-label text-muted-foreground" id="place-machine-label"
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
        class="w-full text-foreground"
        size="sm"
      >
        {machine
          ? words.machineOption(machineLabel(machine.hostname), machine.os)
          : words.noMachines}
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
  <div class="flex flex-col gap-1">
    <label class="text-label text-muted-foreground" for="place-folder"
      >{words.folder}</label
    >
    <Input
      autocomplete="off"
      class="font-mono"
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
  <div class="flex flex-wrap items-center gap-3 pt-1">
    <Button
      class="pressable"
      failed={problem !== null}
      label={words.use}
      pending={saving}
      pendingLabel={words.saving}
      size="sm"
      type="submit"
    />
    <Button label={words.cancel} onclick={oncancel} size="sm" variant="ghost" />
    {#if problem}
      <span class="text-label text-error" role="alert" in:appear>{problem}</span
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
