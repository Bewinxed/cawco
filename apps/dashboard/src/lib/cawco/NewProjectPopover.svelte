<script lang="ts">
  import { mergeProps } from "bits-ui";
  import { tick } from "svelte";
  import DirectoryPicker from "#lib/components/features/DirectoryPicker.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  /**
   * Names a directory so the rail has a folder for it before anything has run
   * there. Every other folder in the rail is grown from live work, which leaves
   * no way at all to add the checkout you have not started yet — this is it.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconPlus } from "#lib/icons.js";
  import { cawco, createProject } from "./client.svelte";
  import { appear } from "./motion/curves.svelte";

  const leaf = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

  /** Trailing slashes on a typed directory, past the one that could be root. */
  const TRAILING_SLASHES = /(?!^)\/+$/;

  /** Typed directories arrive with trailing slashes; the leaf assumes none. */
  const trim = (path: string) => path.trim().replace(TRAILING_SLASHES, "");

  let open = $state(false);
  let name = $state("");
  let machineId = $state("");
  let cwd = $state("");
  let saving = $state(false);
  /**
   * What stopped the last Create, and where it is said: under the field it is
   * about, or, for what the hub answered, beside the button.
   */
  let problem = $state<{
    at: "machine" | "dir" | "hub";
    text: string;
  } | null>(null);

  let nameInput = $state<HTMLInputElement | null>(null);

  const machine = $derived(
    cawco.machines.find((row) => row.machineId === machineId) ?? null
  );
  const dir = $derived(trim(cwd));

  function opened(next: boolean) {
    open = next;
    if (!next) {
      return;
    }
    name = "";
    machineId = cawco.onlineMachines[0]?.machineId ?? "";
    cwd = "";
    saving = false;
    problem = null;
    // biome-ignore lint/complexity/noVoid: focusing the name field after open is fire-and-forget — nothing awaits it
    void tick().then(() => nameInput?.focus());
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!machineId) {
      problem = {
        at: "machine",
        text: "Choose the machine this directory is on.",
      };
      return;
    }
    if (!dir) {
      problem = {
        at: "dir",
        text: "Enter the directory this project lives in.",
      };
      return;
    }
    saving = true;
    problem = null;
    try {
      // `createProject` refreshes the registry, so the folder is already there.
      await createProject({
        machineId,
        cwd: dir,
        name: name.trim() || leaf(dir),
      });
      open = false;
    } catch (err) {
      problem = {
        at: "hub",
        text: err instanceof Error ? err.message : String(err),
      };
    } finally {
      saving = false;
    }
  }
</script>

{#snippet problemAt(
  at: "machine" | "dir" | "hub"
)}
  {#if problem?.at === at}
    <span class="text-label text-error" role="alert" in:appear
      >{problem.text}</span
    >
  {/if}
{/snippet}

<Popover.Root onOpenChange={opened} {open}>
  <Tip label="New project">
    {#snippet children(
      tip
    )}
      <Popover.Trigger>
        {#snippet child({
          props,
        })}
          <Button
            {...mergeProps(props, tip)}
            aria-label="New project"
            class="-mr-1"
            size="icon-sm"
            variant="ghost"
          >
            <IconPlus />
          </Button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tip>

  <Popover.Content
    align="start"
    aria-label="New project"
    class="material-panel flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[var(--radius-lg)] p-4 shadow-xl"
    side="bottom"
    sideOffset={6}
  >
    <h2 class="text-body font-medium">New project</h2>

    <form class="flex flex-col gap-3" onsubmit={create}>
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted-foreground" for="project-name"
          >Name</label
        >
        <Input
          autocomplete="off"
          id="project-name"
          oninput={() => {
            problem = null;
          }}
          placeholder={dir ? leaf(dir) : "What you call it"}
          spellcheck="false"
          bind:ref={nameInput}
          bind:value={name}
        />
      </div>

      <div class="flex flex-col gap-1">
        <span
          class="text-label text-muted-foreground"
          id="project-machine-label"
          >Machine</span
        >
        <Select.Root type="single" bind:value={machineId}>
          <Select.Trigger
            aria-labelledby="project-machine-label"
            class="w-full text-foreground"
            size="sm"
          >
            {machine
              ? `${machine.hostname} · ${machine.os}`
              : "No machines online"}
          </Select.Trigger>
          <Select.Content>
            {#each cawco.onlineMachines as row (row.machineId)}
              <Select.Item
                label="{row.hostname} · {row.os}"
                value={row.machineId}
              >
                {row.hostname}
                · {row.os}
              </Select.Item>
            {:else}
              <span class="block px-2 py-1.5 text-label"
                >No machines online</span
              >
            {/each}
          </Select.Content>
        </Select.Root>
        {@render problemAt("machine")}
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-label text-muted-foreground" for="project-cwd"
          >Directory</label
        >
        <Input
          autocomplete="off"
          class="font-mono"
          id="project-cwd"
          oninput={() => {
            problem = null;
          }}
          placeholder="/home/you/project"
          spellcheck="false"
          bind:value={cwd}
        />
        {@render problemAt("dir")}
      </div>

      <DirectoryPicker
        {machineId}
        onSelect={(path) => {
          cwd = path;
          problem = null;
        }}
        value={cwd}
      />

      <div class="flex items-center gap-3 pt-1">
        <Button
          class="pressable"
          failed={problem !== null}
          label="Create"
          pending={saving}
          pendingLabel="Creating…"
          size="sm"
          type="submit"
        />
        {@render problemAt("hub")}
      </div>
    </form>
  </Popover.Content>
</Popover.Root>
