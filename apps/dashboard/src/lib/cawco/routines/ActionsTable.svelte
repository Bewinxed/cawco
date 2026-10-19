<script lang="ts" module>
  import { type ApprovedActionView, routinesWords as words } from "@cawco/core";
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
        return { status: "waiting", word: words.actionWaiting, at: null };
      case "approved":
        return {
          status: "done",
          word: words.actionApproved,
          at: action.approvedAt,
        };
      case "running":
        return {
          status: "running",
          word: words.actionRunning,
          at: action.startedAt,
        };
      case "done":
        return { status: "done", word: words.actionRan, at: ended };
      case "failed":
        return { status: "failed", word: words.actionFailed, at: ended };
      case "unknown":
        return { status: "waiting", word: words.actionUnknown, at: ended };
      case "denied":
        return { status: "neutral", word: words.actionDenied, at: ended };
      case "cancelled":
        break;
    }
    return { status: "neutral", word: words.actionCancelled, at: ended };
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

<div
  data-slot="actions-ledger"
  style:--lead-w="calc(var(--c-row-lead) + var(--space-3))"
  style:--none="0"
>
  <Table.Root
    data-actions
    aria-label={label}
    class="table-fixed border-separate"
    spacing="flush"
  >
    <Table.Header>
      <Table.Row variant="band">
        <Table.Head class="h-c-toolbar-ctl w-(--lead-w)" variant="caps"
          ><span class="sr-only">{words.columnService}</span></Table.Head
        >
        <Table.Head class="h-c-toolbar-ctl" variant="caps"
          >{words.columnAction}</Table.Head
        >
        <Table.Head
          data-slot="actions-table-col-status"
          class="h-c-toolbar-ctl w-c-routine-time-w"
          variant="caps">{words.columnStatus}</Table.Head
        >
        <Table.Head
          data-slot="actions-table-col-when"
          class="h-c-toolbar-ctl w-c-ledger-when-w"
          variant="caps">{words.columnWhen}</Table.Head
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
            class="h-c-btn-h-lg num align-middle"
            rule="between"
            variant="list"
            ><span data-slot="mark" class="grid w-c-row-lead place-items-center"
              ><ProviderLogo
                class="size-icon-md"
                provider={action.service.toLowerCase()}
              /></span
            ></Table.Cell
          >
          <Table.Cell
            class="h-c-btn-h-lg num align-middle"
            rule="between"
            variant="list"
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
                >{words.from(from)}</span
              >
            {/if}
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg num align-middle"
            data-cell="status"
            rule="between"
            variant="list"
          >
            <RunStatus status={said.status} text={said.word} />
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg num align-middle"
            data-cell="when"
            rule="between"
            variant="list"
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
