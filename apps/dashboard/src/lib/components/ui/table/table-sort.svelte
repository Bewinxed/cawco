<script lang="ts">
  /**
   * A band head's sort: the column's name as a button that sorts the
   * ledger by it (TanStack Table's column), its chevron saying the way
   * while it is the sort. Its pad stands outside the head's edge, so the
   * name starts where its cells' words do; the head around it says the sort
   * in `aria-sort`.
   */
  import { IconChevronDown, IconChevronUp } from "#lib/icons.js";

  let {
    label,
    column,
  }: {
    label: string;
    /** What it reads of its TanStack column. */
    column: {
      getIsSorted: () => false | "asc" | "desc";
      getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
    };
  } = $props();

  const sorted = $derived(column.getIsSorted());
</script>

<button
  class="select-none inline-flex items-center gap-space-1 -mx-space-1 p-space-1 rounded-sm type-label tracking-caps uppercase text-ink-muted mark-line press-tint focus-inset"
  data-slot="table-sort"
  onclick={column.getToggleSortingHandler()}
  type="button"
>
  <span>{label}</span>
  {#if sorted === "desc"}
    <IconChevronDown aria-hidden="true" class="size-icon-sm flex-none" />
  {:else if sorted === "asc"}
    <IconChevronUp aria-hidden="true" class="size-icon-sm flex-none" />
  {/if}
</button>
