<script lang="ts" module>
  /** What a ledger row reads of its machine. */
  export interface LedgerMachine {
    hostname: string;
    machineId: string;
    os: string;
  }
</script>

<script generics="M extends LedgerMachine" lang="ts">
  /**
   * A ledger of machines (DESIGN.md, ledger-header and ledger-row): a band
   * of column heads, Machine first, then `heads`; a row per machine, its
   * first cell the machine (its OS mark, name, presence dot and OS, with
   * "offline" said in words), then `cells`. Under 640px each row is the
   * board's two-line card. Configure's tool matrix and Updates draw one.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import type { Snippet } from "svelte";
  import type { HTMLTdAttributes } from "svelte/elements";
  import * as Table from "#lib/components/ui/table/index.js";
  import { machineOs } from "./machine";
  import OsMark from "./OsMark.svelte";

  let {
    machines,
    online,
    heads,
    cells,
    rowClass,
    machineCell,
    settle,
  }: {
    machines: M[];
    online: (machine: M) => boolean;
    /** The column heads after Machine. */
    heads: Snippet;
    /** A row's cells after its machine. */
    cells: Snippet<[M, boolean]>;
    rowClass?: string;
    /** What the machine cell carries besides. */
    machineCell?: HTMLTdAttributes;
    /**
     * `top`: the rows' cells wrap under their first line (Table.Cell
     * `settle`), and the machine stands on that first line.
     */
    settle?: "top";
  } = $props();
</script>

<Table.Root
  layout="ledger"
  stacks="phone"
  style="--card-cols: minmax(0, 1fr) auto"
>
  <Table.Header>
    <Table.Row variant="band">
      <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      <Table.Head scope="col" variant="band">Machine</Table.Head>
      <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      {@render heads()}
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each machines as machine (machine.machineId)}
      {@const os = machineOs(machine.os)}
      {@const on = online(machine)}
      <Table.Row class={rowClass} variant="stacks">
        <Table.Cell {...machineCell} {settle} variant="ledger-stacks">
          <span
            class={[
              "flex min-w-0 items-center gap-space-2",
              settle === "top" && "@phone/table:min-h-c-ledger-row-h",
            ]}
          >
            <OsMark
              class="size-icon-md shrink-0 text-ink-muted"
              os={machine.os}
            />
            <span class="flex min-w-0 flex-col">
              <span class="mark-line flex min-w-0 items-start gap-space-2">
                <!-- The row's title: it wraps whole, never cut, at a
                     hostname's own breaks (its hyphens), past them only
                     where one part is wider than the column. -->
                <span
                  class="min-w-0 type-label whitespace-normal wrap-break-word text-ink-row"
                  >{machineLabel(machine.hostname)}</span
                >
                <!-- On the name's first line when it wraps (mark-cell). -->
                <span class="mark-cell type-label">
                  <span
                    data-box
                    class="size-(--status-dot-size) shrink-0 rounded-pill {on
                      ? 'bg-presence-online'
                      : 'bg-presence-off'}"
                  ></span>
                </span>
              </span>
              <span class="truncate type-meta text-ink-muted"
                >{os.label}{on ? "" : " · offline"}</span
              >
            </span>
          </span>
        </Table.Cell>
        {@render cells(machine, on)}
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
