<script lang="ts">
  /**
   * One side of a change to a starting set, on its approval (core
   * permission-presentation.ts `setTables`, filled by the hub from the count
   * of calls: hub unused-trim.ts `standing`): a ledger of the kit's own
   * Table, one row per skill or server, the never-called first. What joins
   * a set (a set that is new or gains items) is drawn with every session's
   * calls on the fleet; what leaves it (a trim), with the set's own
   * sessions' calls. Item (its name, and whether it is a skill or a
   * server), Last call (how long ago, the exact time on hover; "None in 120
   * days" for one no session counted called) and Sessions (how many of
   * those sessions called it). The rows are the hub's; nothing here is
   * written by an agent.
   */
  import type { SetChangeTable } from "@cawco/core/permission-presentation";
  import { routinesWords as words } from "@cawco/core/words/routines";
  import { exactOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import * as Table from "#lib/components/ui/table/index.js";

  let { table }: { table: SetChangeTable } = $props();

  const captionId = $props.id();
</script>

<section
  data-change={table.change}
  data-slot="set-change"
  aria-labelledby={captionId}
  class="flex min-w-0 flex-col gap-space-2"
>
  <p class="m-0 type-meta text-ink-muted" id={captionId}>
    {table.change === "joins"
      ? words.listedCaption(table.days)
      : words.unlistedCaption(table.days)}
  </p>
  <div
    class="overflow-hidden rounded-sm border border-border-hairline bg-surface-raised"
  >
    <Table.Root aria-labelledby={captionId} layout="ledger">
      <Table.Header>
        <Table.Row variant="band">
          <Table.Head variant="band">{words.columnItem}</Table.Head>
          <Table.Head class="w-c-ledger-when-w" variant="band"
            >{words.columnLastCall}</Table.Head
          >
          <Table.Head class="w-c-ledger-when-w" edge="end" variant="band"
            >{words.columnSessions}</Table.Head
          >
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each table.rows as row (`${row.kind}:${row.name}`)}
          <Table.Row data-set-row variant="unruled">
            <Table.Cell rule="top" variant="ledger">
              <span class="flex min-w-0 items-baseline gap-space-2">
                <span
                  class="min-w-0 truncate font-mono text-ink-row"
                  title={row.name}>{row.name}</span
                >
                <span class="flex-none text-ink-subtle"
                  >{row.kind === "skill"
                    ? words.kindSkill
                    : words.kindServer}</span
                >
              </span>
            </Table.Cell>
            <Table.Cell class="w-c-ledger-when-w" rule="top" variant="ledger">
              {#if row.lastAt === null}
                <span class="text-ink-subtle">{words.noCallIn(table.days)}</span
                >
              {:else}
                <time
                  class="num"
                  datetime={new Date(row.lastAt).toISOString()}
                  title={exactOf(row.lastAt)}>{since(row.lastAt)}</time
                >
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-c-ledger-when-w"
              edge="end"
              rule="top"
              variant="ledger"
            >
              <span class="num">{row.sessions}</span>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</section>
