<script lang="ts">
  /**
   * What waits on you in other projects, at the panel's head (advisor
   * report §2, WAITING): one row per decision, longest wait first, its act
   * on its row. The row stands on the house's glyph grid
   * (`grid-cols-mark-fluid`): the needs-you glyph in its column, the title
   * (label, one line, cut inside its
   * box) over where it comes from and how long it has waited (meta), the
   * act at the trailing edge: a permission's Deny (quiet) and Approve (the
   * one filled primary), else Open. Your own project's ask is the
   * composer's, never a row here. A hairline parts the zone from the thread.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import type { Waiting } from "./fixtures";

  let {
    rows,
    form,
  }: {
    rows: Waiting[];
    form: "desk" | "phone";
  } = $props();
</script>

{#if rows.length > 0}
  <ul
    class={[
      "m-0 flex shrink-0 list-none flex-col border-border-hairline border-be py-space-1",
      form === "phone" ? "px-space-4" : "px-space-3",
    ]}
    data-panel-waiting
  >
    {#each rows as row (row.id)}
      <li
        class="grid min-w-0 grid-cols-mark-fluid items-center gap-x-space-3 py-space-1"
      >
        <span class="grid place-items-center text-status-attn-glyph"
          ><IconNeedsYou aria-hidden="true" class="size-icon-md" /></span
        >
        <span
          class="grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-3"
        >
          <span class="flex min-w-0 flex-col">
            <span
              class="min-w-0 truncate text-ink-strong text-label"
              title={row.title}>{row.title}</span
            >
            <span class="min-w-0 truncate text-ink-muted text-meta"
              >{row.source}</span
            >
          </span>
          <span class="flex shrink-0 items-center gap-space-1">
            {#if row.act === "answer"}
              <Button label="Deny" size="xs" variant="ghost" />
              <Button label="Approve" size="xs" />
            {:else}
              <Button label="Open" size="xs" variant="outline" />
            {/if}
          </span>
        </span>
      </li>
    {/each}
  </ul>
{/if}
