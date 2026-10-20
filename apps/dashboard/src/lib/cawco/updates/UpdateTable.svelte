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
  <div
    class="overflow-x-auto rounded-md bg-surface-raised inset-ring inset-ring-border-hairline"
  >
    <!-- Under 640px each row is a card: the machine and what it runs, then
         the update across the card. -->
    <Table.Root stacks="phone" style="--card-cols: minmax(0, 1fr) auto">
      <Table.Header>
        <Table.Row>
          <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          <Table.Head scope="col" variant="matrix-corner">Machine</Table.Head>
          <Table.Head scope="col" variant="matrix-column">Running</Table.Head>
          <Table.Head scope="col" variant="matrix-column-wide"
            >Update</Table.Head
          >
          <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each machines as machine (machine.machineId)}
          {@const os = machineOs(machine.os)}
          {@const online = isOnline(machine)}
          <Table.Row inactive={!online} variant="stacks-ruled">
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              data-update-table-machine
              scope="row"
              variant="matrix-row"
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
                      class="size-(--status-dot-size) shrink-0 rounded-pill {online
                        ? 'bg-presence-online'
                        : 'bg-presence-off'}"
                    ></span>
                  </span>
                  <span class="text-label text-ink-muted"
                    >{os.label}{online ? "" : " · offline"}</span
                  >
                </span>
              </span>
            </Table.Head>
            <Table.Cell variant="matrix-stacks">
              <span
                class="mark-line inline-flex items-center gap-space-1 type-label"
              >
                {#if isCurrent(machine)}
                  <IconCheck class="size-icon-md shrink-0 text-success-9" />
                {/if}
                <code data-slot="num" class="num font-mono"
                  >{runningOf(machine)}</code
                >
              </span>
            </Table.Cell>
            <Table.Cell
              class="@max-phone/table:col-span-full"
              variant="matrix-stacks-under"
            >
              <UpdateCell {machine} {policy} />
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
