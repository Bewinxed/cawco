<script lang="ts">
  /**
   * The kit's Command in a frame of its own (its states file's): its search
   * field over its list, rows in groups under their headings, and the empty
   * line when nothing matches, as the finder composes it.
   */
  import * as Command from "./index.js";

  let {
    search,
    groups,
  }: {
    /** What is typed in the field. */
    search: string;
    /** Each group's heading and rows. */
    groups: { heading: string; rows: string[] }[];
  } = $props();
</script>

<div class="w-sm max-w-full overflow-clip rounded-lg border border-ui-2 bg-bg">
  <!-- Its first row is not scrolled into view as it mounts: drawn in place,
       that scroll reached the page around the frame (the design board,
       scrolled down to it on load). -->
  <Command.Root disableInitialScroll value="" shouldFilter={false}>
    <Command.Input
      placeholder="Find a session, task or machine"
      value={search}
    />
    <Command.List>
      <Command.Empty>Nothing matches “{search}”</Command.Empty>
      {#each groups as group (group.heading)}
        <Command.Group heading={group.heading}>
          {#each group.rows as row (row)}
            <Command.Item value={row}>{row}</Command.Item>
          {/each}
        </Command.Group>
      {/each}
    </Command.List>
  </Command.Root>
</div>
