<script lang="ts">
  /**
   * The Workflows block's ledger, the routines ledger's rows: the lead
   * glyph, the name over its version and how it is kept, the last run as
   * the page's status and words, its runs, how its checks held, and its ⋯.
   * A workflow opens in place under its row (`open`), as RoutineDetail
   * does; `detail` is what each option draws there.
   */
  import type { Snippet } from "svelte";
  import RunStatus from "#lib/cawco/routines/RunStatus.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconMore, IconStructure } from "#lib/icons.js";
  import { NIGHTLY, VERSION, WORKFLOW } from "./release";

  let {
    open = true,
    sub = `${VERSION} · 5 steps · 3 checks`,
    detail,
  }: {
    /** Release 2.4 stands open under its row. */
    open?: boolean;
    /** Release 2.4's line under its name. */
    sub?: string;
    detail?: Snippet;
  } = $props();

  const rows = $derived([
    {
      name: WORKFLOW,
      sub,
      last: { status: "waiting" as const, text: "Run 12 · 4m" },
      runs: 12,
      score: "30 of 33",
      open,
    },
    {
      name: NIGHTLY.name,
      sub: `${NIGHTLY.version} · 2 steps · 1 check`,
      last: { status: "done" as const, text: NIGHTLY.last },
      runs: NIGHTLY.runs,
      score: NIGHTLY.score,
      open: false,
    },
  ]);
</script>

<Table.Root
  aria-label="Workflows"
  layout="ledger"
  stacks="phone"
  style="--card-cols: auto minmax(0, 1fr) auto"
>
  <Table.Header>
    <Table.Row variant="band">
      <Table.Head class="w-c-row-lead" variant="band"
        ><span class="sr-only">State</span></Table.Head
      >
      <Table.Head variant="band">Workflow</Table.Head>
      <Table.Head class="w-c-routine-time-w" fold="measure" variant="band"
        >Last run</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" fold="measure" variant="band"
        >Runs</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" fold="runs-took" variant="band"
        >Checks</Table.Head
      >
      <Table.Head class="w-c-btn-h-lg" variant="band"
        ><span class="sr-only">Actions</span></Table.Head
      >
    </Table.Row>
  </Table.Header>
  {#each rows as row (row.name)}
    <Table.Body class="group" data-state={row.open ? "open" : "closed"}>
      <Table.Row variant="stacks">
        <Table.Cell rule="top" variant="ledger-stacks">
          <span
            class="grid w-c-row-lead place-items-center text-ink-muted"
            data-box
            ><IconStructure aria-hidden="true" class="size-icon-md" /></span
          >
        </Table.Cell>
        <Table.Cell rule="top" variant="ledger-stacks">
          <span class="flex min-w-0 flex-col">
            <span
              class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap type-label text-ink-row group-state-open:text-ink-strong"
              >{row.name}</span
            >
            <span
              class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap type-meta text-ink-muted"
              >{row.sub}</span
            >
          </span>
        </Table.Cell>
        <Table.Cell fold="measure" rule="top" variant="ledger-stacks">
          <RunStatus status={row.last.status} text={row.last.text} />
        </Table.Cell>
        <Table.Cell fold="measure" rule="top" variant="ledger-stacks">
          <span class="num">{row.runs}</span>
        </Table.Cell>
        <Table.Cell fold="runs-took" rule="top" variant="ledger-stacks">
          <span class="num">{row.score}</span>
        </Table.Cell>
        <Table.Cell edge="end" rule="top" variant="ledger-stacks">
          <Button aria-label="More for {row.name}" size="icon-sm" variant="ghost">
            <IconMore />
          </Button>
        </Table.Cell>
      </Table.Row>
      {#if row.open && detail}
        <tr>
          <td class="bg-surface-well p-0" colspan={6}>
            {@render detail()}
          </td>
        </tr>
      {/if}
    </Table.Body>
  {/each}
</Table.Root>
