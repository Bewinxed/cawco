<script lang="ts">
  /**
   * The machines table of Configure › Updates: the Command-line tools matrix's
   * look with three columns, Machine, Running and Update. Under 640px each row
   * is the board's two-line card: name, presence and version, then the cell.
   */
  import { machineLabel } from "@cawco/core";
  import type { BinaryUpdatePolicy } from "@cawco/core/binary-updates";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconCheck, IconLaptop, IconServer } from "#lib/icons.js";
  import ErrorDialog from "../ErrorDialog.svelte";
  import { addMachine } from "../join/join.svelte";
  import { machineOs } from "../machine";
  import OsMark from "../OsMark.svelte";
  import { isCurrent, isOnline, runningOf, type UpdateMachine } from "./model";
  import UpdateCell from "./UpdateCell.svelte";

  type Row = UpdateMachine & { os: string };

  let { machines, policy }: { machines: Row[]; policy: BinaryUpdatePolicy } =
    $props();

  let reading = $state<Row | null>(null);
  let open = $state(false);
</script>

{#if machines.length === 0}
  <EmptyState
    icon={IconLaptop}
    line="Builds install on your own machines, and none has joined this hub. Add one and it reports what it runs."
    title="No machines yet"
  >
    {#snippet action()}
      <Button onclick={() => addMachine.show()}>
        <IconServer />
        Add machine
      </Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="matrix">
    <Table.Root class="updates border-collapse text-left">
      <Table.Header>
        <Table.Row class="align-top">
          <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          <Table.Head
            class="h-auto px-[var(--space-4)] py-[var(--space-3)] text-meta text-muted-foreground"
            scope="col"
            >Machine</Table.Head
          >
          <Table.Head
            class="h-auto border-l border-border px-[var(--space-4)] py-[var(--space-3)] text-meta text-muted-foreground"
            scope="col"
            >Running</Table.Head
          >
          <Table.Head
            class="h-auto min-w-56 border-l border-border px-[var(--space-4)] py-[var(--space-3)] text-meta text-muted-foreground"
            scope="col"
            >Update</Table.Head
          >
          <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each machines as machine (machine.machineId)}
          {@const os = machineOs(machine.os)}
          {@const online = isOnline(machine)}
          <Table.Row class={online ? "" : "opacity-50"}>
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              class="machine h-auto bg-[var(--surface-raised)] px-[var(--space-4)] py-[var(--space-2)]"
              scope="row"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <span class="flex items-center gap-[var(--space-2)]">
                <OsMark
                  class="size-4 shrink-0 text-muted-foreground"
                  os={machine.os}
                />
                <span class="flex min-w-0 flex-col">
                  <span class="flex items-center gap-[var(--space-2)]">
                    <span class="truncate text-label text-foreground"
                      >{machineLabel(machine.hostname)}</span
                    >
                    <span
                      class="size-2 shrink-0 rounded-full {online
                        ? "bg-success"
                        : "bg-muted-foreground/40"}"
                    ></span>
                  </span>
                  <span class="text-label text-muted-foreground"
                    >{os.label}{online ? "" : " · offline"}</span
                  >
                </span>
              </span>
            </Table.Head>
            <Table.Cell
              class="running border-l border-border px-[var(--space-4)] py-[var(--space-2)]"
            >
              <span class="version">
                {#if isCurrent(machine)}
                  <IconCheck class="size-4 shrink-0 text-success" />
                {/if}
                <code class="num font-mono">{runningOf(machine)}</code>
              </span>
            </Table.Cell>
            <Table.Cell
              class="update border-l border-border px-[var(--space-4)] py-[var(--space-2)] whitespace-normal"
            >
              <UpdateCell
                {machine}
                onerror={() => {
                  reading = machine;
                  open = true;
                }}
                {policy}
              />
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}

{#if reading}
  <ErrorDialog
    message={reading.binaryUpdate?.error ?? "The machine did not say why."}
    title="Update failed on {machineLabel(reading.hostname)}"
    bind:open
  />
{/if}

<style>
  .matrix {
    overflow-x: auto;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .version {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-label);
  }
  /* The board's two-line card: name, presence and version, then the cell. */
  @media (max-width: 639px) {
    .matrix :global(table.updates thead) {
      display: none;
    }
    .matrix :global(table.updates),
    .matrix :global(table.updates tbody) {
      display: block;
    }
    .matrix :global(table.updates tr) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      border-bottom: 1px solid var(--border-hairline);
    }
    .matrix :global(table.updates tr:last-child) {
      border-bottom: 0;
    }
    .matrix :global(table.updates .update) {
      grid-column: 1 / -1;
      border-left: 0;
      padding-top: 0;
    }
    .matrix :global(table.updates .running) {
      border-left: 0;
    }
  }
</style>
