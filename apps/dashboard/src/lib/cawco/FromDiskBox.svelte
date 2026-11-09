<script lang="ts">
  /**
   * A delete's one choice, said the same wherever a project is deleted (its
   * tray under the head or its row in the rail, a row of Forgotten
   * projects): "Also delete its files on disk" (or, with no checkout on any
   * machine, "Also delete its sessions' transcripts"), and under it what
   * that box decides. Checked: each checkout that goes, its machine over its path
   * (read from the path's end, as Project details lists places) and, where
   * a live project's wider folder holds it, that project named as losing
   * those files too (core place-nesting.ts); then that its sessions'
   * transcripts go too. Unchecked: that the transcripts stay,
   * where a machine may list them again as sessions with no project.
   */
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  let {
    checked,
    disabled = false,
    places,
    onchange,
  }: {
    checked: boolean;
    /** The delete was pressed: the box holds what was chosen. */
    disabled?: boolean;
    /** Each checkout the box removes, by its machine's name, with the names of the live projects whose folder holds it. */
    places: { machine: string; path: string; within: readonly string[] }[];
    onchange: (on: boolean) => void;
  } = $props();
</script>

<!-- What the box decides stands under its words, from where they start
     (`--box-indent`: the box and its gap). -->
<div
  data-from-disk
  class="grid min-w-0 grid-cols-1 gap-space-2"
  style:--box-indent="calc(var(--spacing-icon-md) + var(--spacing-space-2))"
>
  <label
    class="mark-line flex min-w-0 items-center gap-space-2 type-label text-ink-strong data-disabled:text-ink-muted"
    data-disabled={disabled || undefined}
  >
    <Checkbox
      data-box
      {checked}
      {disabled}
      onCheckedChange={(on) => onchange(on === true)}
    />
    <!-- What the box removes, named from what the project holds: its files
         where it has checkouts, else only its sessions' transcripts. -->
    <span class="min-w-0"
      >{places.length > 0
        ? projectEndWords.fromDisk
        : projectEndWords.transcriptsOnly}</span
    >
  </label>
  {#key checked}
    <div
      class="grid min-w-0 grid-cols-1 gap-space-2 ps-(--box-indent)"
      in:unfold
    >
      {#if checked && places.length > 0}
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-2 p-0">
          {#each places as place (`${place.machine}\0${place.path}`)}
            <li class="flex min-w-0 flex-col gap-space-row">
              <span class="type-label text-ink-row">{place.machine}</span>
              <!-- The path reads from its end: the folder's tail stays when
                   it is cut, and one that fits starts under its machine's
                   name (the end of a right-to-left line). -->
              <span
                class="dir-rtl type-meta truncate text-end text-ink-muted"
                title={place.path}><bdi>{place.path}</bdi></span
              >
              {#if place.within.length > 0}
                <span class="type-meta text-pretty text-ink-muted"
                  >{projectEndWords.within(place.within)}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if !checked}
        <p class="m-0 min-w-0 type-meta text-pretty text-ink-muted">
          {projectEndWords.transcriptsStay}
        </p>
      {:else if places.length > 0}
        <p class="m-0 min-w-0 type-meta text-pretty text-ink-muted">
          {projectEndWords.transcriptsGo}
        </p>
      {/if}
    </div>
  {/key}
</div>
