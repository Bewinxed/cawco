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
      default:
        return { status: "neutral", word: "Cancelled", at: ended };
    }
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

<!-- literal: 6rem -->
<div
  data-slot="actions-ledger"
  style:--lead-w="calc(var(--c-row-lead) + var(--space-3))"
  style:--when-w="6rem"
>
  <Table.Root
    data-actions
    aria-label={label}
    class="table-fixed border-separate"
  >
    <Table.Header>
      <Table.Row class="border-0 bg-surface-band">
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head
          class="h-c-toolbar-ctl w-(--lead-w) px-space-3 pe-0 type-label tracking-caps text-ink-muted uppercase"
          scope="col"><span class="sr-only">Service</span></Table.Head
        >
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head
          class="h-c-toolbar-ctl px-space-3 type-label tracking-caps text-ink-muted uppercase"
          scope="col">Action</Table.Head
        >
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head
          data-slot="actions-table-col-status"
          class="h-c-toolbar-ctl w-c-routine-time-w px-space-3 type-label tracking-caps text-ink-muted uppercase"
          scope="col">Status</Table.Head
        >
        <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head
          data-slot="actions-table-col-when"
          class="h-c-toolbar-ctl w-(--when-w) px-space-3 type-label tracking-caps text-ink-muted uppercase"
          scope="col">When</Table.Head
        >
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each actions as action (action.id)}
        {@const said = actionOf(action)}
        {@const from = routineNames ? fromOf(action) : null}
        <Table.Row
          data-actions-table-action
          class="group/row"
          data-status={said.status}
        >
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 pe-0 type-meta text-ink-muted num align-middle group-not-first/row:border-t group-not-first/row:border-border-hairline"
            ><span
              data-slot="mark"
              class="grid w-c-row-lead place-items-center"
              ><ProviderLogo
                class="size-icon-md"
                provider={action.service.toLowerCase()}
              /></span
            ></Table.Cell
          >
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted num align-middle group-not-first/row:border-t group-not-first/row:border-border-hairline"
          >
            <span
              data-slot="what"
              class="block truncate type-label text-ink-row"
              title="{action.service} · {action.tool}">{action.reason}</span
            >
            {#if from}
              <span
                data-slot="from"
                class="block truncate type-meta text-ink-muted"
                >From {from}</span
              >
            {/if}
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted num align-middle group-not-first/row:border-t group-not-first/row:border-border-hairline"
            data-cell="status"
          >
            <RunStatus status={said.status} text={said.word} />
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted num align-middle group-not-first/row:border-t group-not-first/row:border-border-hairline"
            data-cell="when"
          >
            {#if said.at !== null}
              <time
                data-when
                data-slot="num"
                class="num whitespace-nowrap"
                title={exactOf(said.at)}>{since(said.at)}</time
              >
            {/if}
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  /* residual: unmapped */
  [data-slot="actions-ledger"] :global([data-actions]) {
    border-spacing: 0;
  }
</style>
