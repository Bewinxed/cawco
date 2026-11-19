<script lang="ts">
  /**
   * Files and locations: every folder of the project, all in view, one row
   * each (FolderRow), the Main folder first and the Built-in folder last; a
   * folder that comes or goes moves the rows round it (`reflow`, each row
   * `data-flip`). Under them, two quiet buttons that open their steps
   * (Connect existing folder, Copy to computer), each saying what it does
   * in its tooltip. Rows are skeletons until the folders are read; a read
   * that failed says so with Try again, never an empty list.
   */
  import {
    actWords,
    cardWords,
    sectionWords,
  } from "@cawco/core/words/project-details";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconCopyStroked, IconFolder, IconLink } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import type { Computer, Folder, FolderAct, Pending, Read } from "./details";
  import FolderRow from "./FolderRow.svelte";
  import Section from "./Section.svelte";

  let {
    folders,
    fleet,
    openFolder = $bindable(null),
    confirming = $bindable(null),
    running = null,
    disconnecting,
    callingOff,
    sunk = false,
    asOf = null,
    onact,
    ondisconnect,
    oncalloff,
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
    /** Disconnect folder sent: the folder's id, and the hub's refusal once it says no. */
    disconnecting?: Pending;
    /** Call off sent for a folder's waiting Locate folder: the folder's id, and the hub's refusal once it says no. */
    callingOff?: Pending;
    sunk?: boolean;
    /** CawCo is out of reach: when the details shown were read. */
    asOf?: string | null;
    onact: (act: FolderAct, folderId: string | null) => void;
    ondisconnect: (folderId: string) => void;
    oncalloff: (folderId: string) => void;
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
  hue="var(--color-mark-3)"
  icon={IconFolder}
  key="files"
  line={sectionWords.files.line}
  name={sectionWords.files.name}
>
  {#if folders.state === "reading"}
    <div class="flex flex-col gap-space-1">
      {#each [0, 1, 2] as k (k)}
        <Skeleton height="row" />
      {/each}
    </div>
  {:else if folders.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {folders.reason}" />
  {:else}
    <ul
      class="m-0 flex list-none flex-col gap-px p-0"
      in:reveal
      {@attach reflow()}
    >
      {#each rows as folder (folder.id)}
        <li data-flip>
          <FolderRow
            {asOf}
            callingOff={callingOff?.value === folder.id
              ? callingOff
              : undefined}
            confirming={confirming === folder.id}
            disconnecting={disconnecting?.value === folder.id
              ? disconnecting
              : undefined}
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
            oncalloff={() => oncalloff(folder.id)}
            ondisconnect={() => ondisconnect(folder.id)}
            ontoggle={() => {
              confirming = null;
              openFolder = openFolder === folder.id ? null : folder.id;
            }}
            open={openFolder === folder.id}
            running={running?.folderId === folder.id ? running.says : null}
            {sunk}
          />
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap gap-x-space-1 gap-y-space-2">
      <Tip label={actWords.connect.line}>
        {#snippet children(props)}
          <Button
            {...props}
            disabled={sunk}
            icon={IconLink}
            label={actWords.connect.name}
            onclick={() => onact("connect", null)}
            size="sm"
            variant="ghost"
          />
        {/snippet}
      </Tip>
      {#if !onlyBuiltin}
        <Tip label={actWords.copy.line}>
          {#snippet children(props)}
            <Button
              {...props}
              disabled={sunk}
              icon={IconCopyStroked}
              label={actWords.copy.name}
              onclick={() => onact("copy", null)}
              size="sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      {/if}
    </div>
  {/if}
</Section>
