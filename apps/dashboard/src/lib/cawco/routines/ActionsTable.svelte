<script lang="ts" module>
  import type { ApprovedActionView } from "@cawco/core";
  import type { Status } from "./RunStatus.svelte";

  /**
   * An approved action waits on you (the hub's `/api/actions/waiting`):
   * proposed, or failed or unknown until you put it away.
   */
  export const waitsOnYou = (action: ApprovedActionView): boolean =>
    action.state === "proposed" ||
    ((action.state === "failed" || action.state === "unknown") &&
      action.checkedAt === null);

  /** An approved action's status, its word, and when. */
  export function actionOf(action: ApprovedActionView): {
    status: Status;
    word: string;
    at: number | null;
  } {
    const ended = action.endedAt ?? action.createdAt;
    switch (action.state) {
      case "proposed":
        return { status: "waiting", word: "Waiting on you", at: null };
      case "approved":
        return { status: "done", word: "Approved", at: action.approvedAt };
      case "running":
        return { status: "running", word: "Running", at: action.startedAt };
      case "done":
        return { status: "done", word: "Ran", at: ended };
      case "failed":
        return { status: "failed", word: "Failed", at: ended };
      case "unknown":
        return { status: "waiting", word: "Outcome unknown", at: ended };
      case "denied":
        return { status: "neutral", word: "Denied", at: ended };
      case "cancelled":
        break;
    }
    return { status: "neutral", word: "Cancelled", at: ended };
  }
</script>

<script lang="ts">
  /**
   * Actions sessions proposed and what came of them, as a ledger (the
   * routines table's band and rows): the service's mark; the action, in its
   * proposer's words, with where it came from unless the table stands in a
   * routine's own detail; its status in the page's glyph vocabulary; when.
   */
  import { since } from "#lib/cawco/rules.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import RunStatus from "./RunStatus.svelte";
  import { exactOf } from "./schedule";

  let {
    actions,
    label,
    routineNames = null,
  }: {
    actions: ApprovedActionView[];
    /** The table's name, read out. */
    label: string;
    /**
     * The project's routines' names by id: each action says where it came
     * from, its routine or else the session that proposed it. Left out in a
     * routine's own detail, where the routine is the row's.
     */
    routineNames?: Map<string, string> | null;
  } = $props();

  /** Where an action came from: the routine its run proposed it in, else its proposer. */
  const fromOf = (action: ApprovedActionView): string | null =>
    (action.routineId && routineNames?.get(action.routineId)) ||
    action.proposerTitle;
</script>

<div class="actions-ledger">
  <Table.Root aria-label={label} class="actions table-fixed">
    <Table.Header>
      <Table.Row class="band border-0">
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head class="col-mark" scope="col"
          ><span class="sr-only">Service</span></Table.Head
        >
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head class="col-action" scope="col">Action</Table.Head>
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head class="col-status" scope="col">Status</Table.Head>
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head class="col-when" scope="col">When</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each actions as action (action.id)}
        {@const said = actionOf(action)}
        {@const from = routineNames ? fromOf(action) : null}
        <Table.Row class="action" data-status={said.status}>
          <Table.Cell class="col-mark"
            ><span class="mark"
              ><ProviderLogo provider={action.service.toLowerCase()} /></span
            ></Table.Cell
          >
          <Table.Cell class="col-action">
            <span class="what" title="{action.service} · {action.tool}"
              >{action.reason}</span
            >
            {#if from}
              <span class="from">From {from}</span>
            {/if}
          </Table.Cell>
          <Table.Cell class="col-status" data-cell="status">
            <RunStatus status={said.status} text={said.word} />
          </Table.Cell>
          <Table.Cell class="col-when" data-cell="when">
            {#if said.at !== null}
              <time class="when num" title={exactOf(said.at)}
                >{since(said.at)}</time
              >
            {/if}
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  .actions-ledger :global(table.actions) {
    border-collapse: separate;
    border-spacing: 0;
  }
  .actions-ledger :global(tr.band) {
    background: var(--surface-band);
  }
  .actions-ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .actions-ledger :global(tr.action > td) {
    block-size: var(--c-btn-h-lg);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    vertical-align: middle;
  }
  .actions-ledger :global(tr.action + tr.action > td) {
    border-block-start: 1px solid var(--border-hairline);
  }
  .actions-ledger :global(th.col-mark) {
    inline-size: calc(var(--c-row-lead) + var(--space-3));
    padding-inline-end: 0;
  }
  .actions-ledger :global(td.col-mark) {
    padding-inline-end: 0;
  }
  .actions-ledger :global(th.col-status) {
    inline-size: var(--c-routine-time-w);
  }
  .actions-ledger :global(th.col-when) {
    inline-size: 6rem;
  }
  .mark {
    display: grid;
    place-items: center;
    inline-size: var(--c-row-lead);
  }
  .mark :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .what,
  .from {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what {
    font: var(--type-label);
    color: var(--ink-row);
  }
  .from {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .when {
    white-space: nowrap;
  }
</style>
