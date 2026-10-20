<script lang="ts">
  /**
   * The machines ledger of Configure › Updates, three columns: Machine,
   * Running and Update. Under 640px each row is the board's two-line card:
   * name, presence and version, then the cell.
   */
  import { machineLabel } from "@cawco/core";
  import type { BinaryUpdatePolicy } from "@cawco/core/binary-updates";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconCheck } from "#lib/icons.js";
  import NoMachines from "../config/NoMachines.svelte";
  import { machineOs } from "../machine";
  import OsMark from "../OsMark.svelte";
  import { isCurrent, isOnline, runningOf, type UpdateMachine } from "./model";
  import UpdateCell from "./UpdateCell.svelte";

  type Row = UpdateMachine & { os: string };

  let { machines, policy }: { machines: Row[]; policy: BinaryUpdatePolicy } =
    $props();
</script>

{#if machines.length === 0}
  <NoMachines
    line="Builds install on your own machines, and none has joined this hub. Add one and it reports what it runs."
  />
{:else}
  <!-- The ledger (DESIGN.md, ledger-header and ledger-row): a 32px band of
       column heads, 44px rows apart by a hairline, on the page's own card.
       Under 640px each row is a card: the machine and what it runs, then
       the update across the card. An offline machine says so in words; its
       row keeps full ink. -->
  <Table.Root
    layout="ledger"
    stacks="phone"
    style="--card-cols: minmax(0, 1fr) auto"
  >
    <Table.Header>
      <Table.Row variant="band">
        <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head scope="col" variant="band">Machine</Table.Head>
        <Table.Head class="w-c-ledger-outcome-w" scope="col" variant="band"
          >Running</Table.Head
        >
        <Table.Head class="w-c-matrix-col-w" scope="col" variant="band"
          >Update</Table.Head
        >
        <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each machines as machine (machine.machineId)}
        {@const os = machineOs(machine.os)}
        {@const online = isOnline(machine)}
        <Table.Row variant="stacks">
          <Table.Cell data-update-table-machine variant="ledger-stacks">
            <span class="flex min-w-0 items-center gap-space-2">
              <OsMark
                class="size-icon-md shrink-0 text-ink-muted"
                os={machine.os}
              />
              <span class="flex min-w-0 flex-col">
                <span class="mark-line flex min-w-0 items-center gap-space-2">
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
                    >{machineLabel(machine.hostname)}</span
                  >
                  <span
                    data-box
                    class="size-(--status-dot-size) shrink-0 rounded-pill {online
                      ? 'bg-presence-online'
                      : 'bg-presence-off'}"
                  ></span>
                </span>
                <span class="truncate type-meta text-ink-muted"
                  >{os.label}{online ? "" : " · offline"}</span
                >
              </span>
            </span>
          </Table.Cell>
          <Table.Cell variant="ledger-stacks">
            <span
              class="mark-line inline-flex items-center gap-space-1 text-ink-strong"
            >
              {#if isCurrent(machine)}
                <IconCheck
                  class="size-icon-md shrink-0 text-status-done-glyph"
                />
              {/if}
              <code data-slot="num" class="num type-code"
                >{runningOf(machine)}</code
              >
            </span>
          </Table.Cell>
          <Table.Cell
            class="@max-phone/table:col-span-full"
            variant="ledger-stacks"
          >
            <div class="whitespace-normal">
              <UpdateCell {machine} {policy} />
            </div>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
{/if}
