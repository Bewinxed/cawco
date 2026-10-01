<script lang="ts">
  /**
   * Every machine, with its build and sync state, and Add machine. Opened
   * from the status line. Each machine keeps the menu it has everywhere it
   * is listed (update, reload, log in, unlock, forget).
   */
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sheet from "$lib/components/ui/sheet";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconServer } from "$lib/icons";
  import { whiffle } from "../client.svelte";
  import { addMachine } from "../join/join.svelte";
  import MachineCard from "../MachineCard.svelte";
  import MachineMenu from "../MachineMenu.svelte";

  let { open: shown = $bindable(false) }: { open?: boolean } = $props();

  /** A phone's sheet rises from the bottom; a wide screen's comes in from the side. */
  const narrow = new MediaQuery("max-width: 639px");
</script>

<Sheet.Root bind:open={shown}>
  <Sheet.Content
    class="machines-sheet"
    side={narrow.current ? 'bottom' : 'right'}
  >
    <Sheet.Header>
      <Sheet.Title>Machines</Sheet.Title>
      <Sheet.Description
        >Each machine's build and sync state. Right-click or long-press a
        machine for its actions.</Sheet.Description
      >
    </Sheet.Header>
    <Tooltip.Provider>
      <ul class="list">
        {#each whiffle.machines as machine (machine.machineId)}
          <li>
            <MachineMenu {machine}>
              <MachineCard hubBuild={whiffle.hubBuild} {machine} />
            </MachineMenu>
          </li>
        {/each}
      </ul>
    </Tooltip.Provider>
    <div class="foot">
      <Button
        onclick={() => {
          shown = false;
          addMachine.show();
        }}
        variant="outline"
      >
        <IconServer />
        Add machine
      </Button>
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0 var(--space-2);
    list-style: none;
    overflow-y: auto;
  }
  .list > li + li {
    border-top: 1px solid var(--border-hairline);
  }
  .foot {
    padding: var(--space-4);
  }
  :global(.machines-sheet[data-side="bottom"]) {
    max-height: 80dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
