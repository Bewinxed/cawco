<script lang="ts">
  /**
   * A list of the agents' work: tasks by number and name, routines by
   * name, each a WorkRow that opens as tasks open everywhere.
   */
  import WorkRow from "./WorkRow.svelte";

  let {
    rows,
    onopen,
  }: {
    rows: {
      kind: "task" | "routine";
      name: string;
      ref: string | null;
      state: string;
      live?: boolean;
    }[];
    /** A row was opened, as `task:#152` or `routine:PR sweep`. */
    onopen: (what: string) => void;
  } = $props();
</script>

<ul class="flex min-w-0 flex-col gap-space-2">
  {#each rows as row (row.ref ?? row.name)}
    <WorkRow
      kind={row.kind}
      live={row.live}
      name={row.name}
      onopen={() => onopen(`${row.kind}:${row.ref ?? row.name}`)}
      ref={row.ref}
      state={row.state}
    />
  {/each}
</ul>
