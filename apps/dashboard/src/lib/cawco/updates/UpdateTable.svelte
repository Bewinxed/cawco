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
  import { addMachine } from "../join/join.svelte";
  import { machineOs } from "../machine";
  import OsMark from "../OsMark.svelte";
  import { isCurrent, isOnline, runningOf, type UpdateMachine } from "./model";
  import UpdateCell from "./UpdateCell.svelte";

  type Row = UpdateMachine & { os: string };

  let { machines, policy }: { machines: Row[]; policy: BinaryUpdatePolicy } =
    $props();
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
        <span>Add machine</span>
      </Button>
    {/snippet}
  </EmptyState>
{:else}
  <!-- literal: inset 0 0 0 1px var(--border-hairline) -->
  <!-- literal: minmax(0, 1fr) auto -->
  <div
    class="overflow-x-auto rounded-md bg-surface-raised shadow-(--matrix-ring)"
    style:--matrix-ring="inset 0 0 0 1px var(--border-hairline)"
    style:--phone-cols="minmax(0, 1fr) auto"
  >
    <Table.Root class="border-collapse text-left max-phone:block">
      <Table.Header class="max-phone:hidden">
        <Table.Row
          class="align-top max-phone:grid max-phone:grid-cols-(--phone-cols) max-phone:items-center max-phone:border-b max-phone:border-border-hairline max-phone:last:border-b-0"
        >
          <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          <Table.Head
            class="h-auto px-space-4 py-space-3 text-meta text-ink-muted"
            scope="col">Machine</Table.Head
          >
          <Table.Head
            class="h-auto border-l border-border px-space-4 py-space-3 text-meta text-ink-muted"
            scope="col">Running</Table.Head
          >
          <Table.Head
            class="h-auto min-w-56 border-l border-border px-space-4 py-space-3 text-meta text-ink-muted"
            scope="col">Update</Table.Head
          >
          <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        </Table.Row>
      </Table.Header>
      <Table.Body class="max-phone:block">
        {#each machines as machine (machine.machineId)}
          {@const os = machineOs(machine.os)}
          {@const online = isOnline(machine)}
          <Table.Row
            class="max-phone:grid max-phone:grid-cols-(--phone-cols) max-phone:items-center max-phone:border-b max-phone:border-border-hairline max-phone:last:border-b-0 {online
              ? ''
              : 'opacity-50'}"
          >
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              data-update-table-machine
              class="h-auto bg-surface-raised px-space-4 py-space-2"
              scope="row"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <span class="flex items-center gap-space-2">
                <OsMark
                  class="size-icon-md shrink-0 text-ink-muted"
                  os={machine.os}
                />
                <span class="flex min-w-0 flex-col">
                  <span class="flex items-center gap-space-2">
                    <span class="truncate text-label text-ink-strong"
                      >{machineLabel(machine.hostname)}</span
                    >
                    <span
                      class="size-2 shrink-0 rounded-full {online
                        ? 'bg-success-9'
                        : 'bg-ink-muted/40'}"
                    ></span>
                  </span>
                  <span class="text-label text-ink-muted"
                    >{os.label}{online ? "" : " · offline"}</span
                  >
                </span>
              </span>
            </Table.Head>
            <Table.Cell
              class="border-l border-border px-space-4 py-space-2 max-phone:border-l-0"
            >
              <span class="mark-line inline-flex items-center gap-space-1 type-label">
                {#if isCurrent(machine)}
                  <IconCheck class="size-icon-md shrink-0 text-success-9" />
                {/if}
                <code data-slot="num" class="num font-mono"
                  >{runningOf(machine)}</code
                >
              </span>
            </Table.Cell>
            <Table.Cell
              class="border-l border-border px-space-4 py-space-2 whitespace-normal max-phone:col-span-full max-phone:border-l-0 max-phone:pt-0"
            >
              <UpdateCell {machine} {policy} />
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
