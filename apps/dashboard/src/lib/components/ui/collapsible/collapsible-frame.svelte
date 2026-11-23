<script lang="ts">
  /**
   * The kit's Collapsible in a frame of its own (its states file's): its
   * fold trigger over the lines it opens, shut or open, as a task's activity
   * composes it.
   */
  import { IconChevronRight } from "#lib/icons.js";
  import * as Collapsible from "./index.js";

  let {
    summary,
    lines,
    open = false,
  }: {
    /** What the fold says while shut. */
    summary: string;
    /** What it opens to. */
    lines: string[];
    /** It stands open. */
    open?: boolean;
  } = $props();
</script>

<div class="w-sm max-w-full">
  <Collapsible.Root {open}>
    <Collapsible.Trigger class="group w-full" look="fold">
      <IconChevronRight
        aria-hidden="true"
        class="size-icon-sm flex-none transition-[transform] duration-(--duration-fast) ease-out group-state-open:transform-(--chev-turn)"
        style="--chev-turn: rotate(90deg)"
      />
      <span>{summary}</span>
    </Collapsible.Trigger>
    <Collapsible.Content>
      <ol
        class="m-0 flex list-none flex-col gap-space-2 pt-space-2 pl-space-4 type-label"
      >
        {#each lines as line (line)}
          <li>{line}</li>
        {/each}
      </ol>
    </Collapsible.Content>
  </Collapsible.Root>
</div>
