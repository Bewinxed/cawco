<script lang="ts">
  /**
   * The Workflows view's Runs ledger: the routines' runs ledger widened by
   * what a workflow run adds (its version, steps done, the checks it held,
   * its cost), newest first. A row opens in place under itself, as a
   * routine does (`open`): the run's tree as it ended, and its way on (Run
   * again, and in option D Keep this run instead).
   */
  import type { Snippet } from "svelte";
  import RunStatus from "#lib/cawco/routines/RunStatus.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import { RUNS } from "./release";

  let {
    open = null,
    detail,
    limit = RUNS.length,
  }: {
    /** The run opened under its row. */
    open?: number | null;
    detail?: Snippet<[number]>;
    limit?: number;
  } = $props();

  const shown = $derived(RUNS.slice(0, limit));
</script>

<Table.Root
  aria-label="Runs"
  layout="ledger"
  stacks="phone"
  style="--card-cols: minmax(0, 1fr) auto"
>
  <Table.Header>
    <Table.Row variant="band">
      <Table.Head variant="band">Run</Table.Head>
      <Table.Head class="w-c-ledger-outcome-w" variant="band"
        >Outcome</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" fold="measure" variant="band"
        >Version</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" fold="measure" variant="band"
        >Took</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" fold="runs-took" variant="band"
        >Steps</Table.Head
      >
      <Table.Head class="w-c-ledger-took-w" variant="band">Checks</Table.Head>
      <Table.Head class="w-c-ledger-took-w" edge="end" fold="measure" variant="band"
        >Cost</Table.Head
      >
    </Table.Row>
  </Table.Header>
  {#each shown as run (run.n)}
    <Table.Body data-run={run.n} class="group/run" data-outcome={run.outcome}>
      <Table.Row variant="stacks">
        <Table.Cell rule="top" variant="ledger-stacks">
          <span class="flex min-w-0 flex-col">
            <span
              class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap type-label text-ink-row"
              >Run {run.n} · <time title={run.exact}>{run.when}</time></span
            >
            <span
              class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap type-meta text-ink-muted group-outcome-failed/run:text-status-fail-ink"
              title={run.result}>{run.result}</span
            >
          </span>
        </Table.Cell>
        <Table.Cell rule="top" variant="ledger-stacks">
          <RunStatus status={run.outcome} text={run.word} />
        </Table.Cell>
        <Table.Cell fold="measure" rule="top" variant="ledger-stacks">
          <span class="num">{run.version}</span>
        </Table.Cell>
        <Table.Cell fold="measure" rule="top" variant="ledger-stacks">
          <span class="num">{run.took}</span>
        </Table.Cell>
        <Table.Cell fold="runs-took" rule="top" variant="ledger-stacks">
          <span class="num">{run.steps}</span>
        </Table.Cell>
        <Table.Cell rule="top" variant="ledger-stacks">
          <span class="num">{run.score}</span>
        </Table.Cell>
        <Table.Cell edge="end" fold="measure" rule="top" variant="ledger-stacks">
          <span class="num">{run.usd}</span>
        </Table.Cell>
      </Table.Row>
      {#if open === run.n && detail}
        <tr>
          <td class="bg-surface-well p-0" colspan={7}>
            {@render detail(run.n)}
          </td>
        </tr>
      {/if}
    </Table.Body>
  {/each}
</Table.Root>
