<script lang="ts">
  /**
   * Files and locations: every folder of the project, all in view, one row
   * each (FolderRow), the Main folder first and the Built-in folder last;
   * under them, two quiet buttons that open their steps (Connect existing
   * folder, Copy to computer). Rows are skeletons until the folders are
   * read; a read that failed says so with Try again, never an empty list.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconCopy, IconLink } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { Computer, Folder, FolderAct, Read } from "./details";
  import FolderRow from "./FolderRow.svelte";
  import Section from "./Section.svelte";
  import { actWords, cardWords, sectionWords } from "./words";

  let {
    folders,
    fleet,
    openFolder = $bindable(null),
    confirming = $bindable(null),
    running = null,
    sunk = false,
    onact,
    ondisconnect,
    ontry,
  }: {
    folders: Read<Folder[]>;
    /** The fleet's computers, for each mark's identity hue. */
    fleet: Computer[];
    /** The folder whose acts stand open. */
    openFolder?: string | null;
    /** The folder Disconnect folder asks about. */
    confirming?: string | null;
    running?: { folderId: string; says: string } | null;
    sunk?: boolean;
    onact: (act: FolderAct, folderId: string | null) => void;
    ondisconnect: (folderId: string) => void;
    ontry: () => void;
  } = $props();

  const ORDER = { main: 0, extra: 1, builtin: 2 } as const;
  const rows = $derived(
    folders.state === "read"
      ? [...folders.value].sort((a, b) => ORDER[a.role] - ORDER[b.role])
      : []
  );
  const hueOf = (folder: Folder) =>
    Math.max(
      0,
      fleet.findIndex((computer) => computer.id === folder.machine.id)
    );
  /** Only the Built-in folder: nothing to copy from yet. */
  const onlyBuiltin = $derived(
    rows.every((folder) => folder.role === "builtin")
  );
</script>

<Section
  key="files"
  line={sectionWords.files.line}
  name={sectionWords.files.name}
>
  {#if folders.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each [0, 1, 2] as k (k)}
        <Skeleton height="row" />
      {/each}
    </div>
  {:else if folders.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {folders.reason}" />
  {:else}
    <div class="flex flex-col gap-space-1" in:reveal>
      {#each rows as folder (folder.id)}
        <FolderRow
          confirming={confirming === folder.id}
          {folder}
          hue={hueOf(folder)}
          onact={(act) => onact(act, folder.id)}
          oncancel={() => {
            confirming = null;
          }}
          onconfirm={() => {
            confirming = folder.id;
            openFolder = null;
          }}
          ondisconnect={() => {
            confirming = null;
            ondisconnect(folder.id);
          }}
          ontoggle={() => {
            confirming = null;
            openFolder = openFolder === folder.id ? null : folder.id;
          }}
          open={openFolder === folder.id}
          running={running?.folderId === folder.id ? running.says : null}
          {sunk}
        />
      {/each}
    </div>
    <div class="flex flex-wrap gap-space-2 ps-space-3">
      <Button
        disabled={sunk}
        icon={IconLink}
        label={actWords.connect.name}
        onclick={() => onact("connect", null)}
        size="sm"
        variant="ghost"
      />
      {#if !onlyBuiltin}
        <Button
          disabled={sunk}
          icon={IconCopy}
          label={actWords.copy.name}
          onclick={() => onact("copy", null)}
          size="sm"
          variant="ghost"
        />
      {/if}
    </div>
  {/if}
</Section>
