<script lang="ts">
  /**
   * The machines ledger of Configure › Updates, three columns: Machine,
   * Running and Update. Under 640px each row is the board's two-line card:
   * name, presence and version, then the cell.
   */
  import type { BinaryUpdatePolicy } from "@cawco/core/binary-updates";
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconCheck } from "#lib/icons.js";
  import NoMachines from "../config/NoMachines.svelte";
  import MachineLedger from "../MachineLedger.svelte";
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
  <MachineLedger
    machineCell={{ "data-update-table-machine": "" }}
    {machines}
    online={isOnline}
  >
    {#snippet heads()}
      <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      <Table.Head class="w-c-ledger-outcome-w" scope="col" variant="band"
        >Running</Table.Head
      >
      <Table.Head class="w-c-matrix-col-w" scope="col" variant="band"
        >Update</Table.Head
      >
      <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
    {/snippet}
    {#snippet cells(machine: Row)}
      <Table.Cell variant="ledger-stacks">
        <span
          class="mark-line inline-flex items-center gap-space-1 text-ink-strong"
        >
          {#if isCurrent(machine)}
            <IconCheck class="size-icon-md shrink-0 text-status-done-glyph" />
          {/if}
          <code data-slot="num" class="num type-code">{runningOf(machine)}</code
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
    {/snippet}
  </MachineLedger>
{/if}
