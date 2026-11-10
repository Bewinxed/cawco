<script lang="ts">
  /**
   * A delegate's report's outputs, the files its finish copied into the
   * project's folder, each drawn as what it is (@cawco/core deliverables):
   * - pictures inline, as a tool row's gallery draws them (Shot cards, each
   *   captioned with its path), one swipe set in the lightbox;
   * - video and audio in the platform's player (TaskOutput);
   * - markdown, a post and any other file a chip to its file card on the
   *   project page (FolderFiles, `?file=`).
   * Every one is read from the folder's bytes (folderRawHref).
   */
  import { deliverableKind } from "@cawco/core/deliverables";
  import FolderFiles from "../project/FolderFiles.svelte";
  import { folderRawHref } from "../project-tasks";
  import TaskOutput from "../tasks/TaskOutput.svelte";
  import Shot from "./Shot.svelte";

  let {
    projectId,
    files,
  }: {
    /** Whose folder they are in. */
    projectId: string;
    /** Their paths in the folder, as the report names them. */
    files: string[];
  } = $props();

  const drawn = $derived.by(() => {
    const by: { pictures: string[]; played: string[]; chips: string[] } = {
      pictures: [],
      played: [],
      chips: [],
    };
    for (const path of files) {
      const kind = deliverableKind(path);
      if (kind === "image") {
        by.pictures.push(path);
      } else if (kind === "video" || kind === "audio") {
        by.played.push(path);
      } else {
        by.chips.push(path);
      }
    }
    return by;
  });
</script>

{#if drawn.pictures.length > 0}
  <div
    data-slot="shots"
    class="flex flex-wrap gap-space-2 mt-space-3"
    data-gallery
  >
    {#each drawn.pictures as path (path)}
      <Shot
        alt={path.split("/").at(-1) ?? path}
        {path}
        size="card"
        src={folderRawHref(projectId, path)}
      />
    {/each}
  </div>
{/if}
{#each drawn.played as path (path)}
  <div class="mt-space-3">
    <TaskOutput {path} {projectId} src={folderRawHref(projectId, path)} />
  </div>
{/each}
{#if drawn.chips.length > 0}
  <FolderFiles files={drawn.chips} {projectId} />
{/if}
