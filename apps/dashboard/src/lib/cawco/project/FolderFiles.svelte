<script lang="ts">
  /**
   * The project folder's files a delegate's report copied there: one chip
   * each, its path, a link to the file's address on the project
   * page (`?file=`, FolderFile). The chip of the file that page shows now
   * reads current.
   */
  import { IconDocument } from "#lib/icons.js";
  import { page } from "$app/state";
  import { folderFileHref } from "../project-tasks";

  let {
    projectId,
    files,
  }: {
    projectId: string;
    files: string[];
  } = $props();

  /** The file the project page shows now, when this is its page. */
  const shown = $derived.by(() => {
    const url = page.shallow?.url ?? page.url;
    return url.pathname === `/project/${projectId}`
      ? url.searchParams.get("file")
      : null;
  });
</script>

<ul class="m-0 mt-space-3 flex list-none flex-wrap gap-space-2 p-0">
  {#each files as path (path)}
    <li>
      <a
        aria-current={shown === path ? "page" : undefined}
        class="group/file mark-line press-tint type-label inline-flex min-h-control-sm max-w-full items-center gap-space-2 rounded-sm ring ring-ui-2 bg-bg px-space-3 text-tx transition-[background-color] duration-(--duration-fast) ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-2 text-center no-underline aria-current-page:bg-ui aria-current-page:text-accent"
        data-folder-chip={path}
        href={folderFileHref(projectId, path)}
      >
        <IconDocument
          data-slot="file-icon"
          class="size-icon-md flex-none text-tx-2 group-aria-current-page/file:text-accent"
        />
        <bdi
          data-slot="path"
          class="min-w-0 overflow-clip font-(family-name:--font-mono) text-sm text-ellipsis whitespace-nowrap"
          >{path}</bdi
        >
      </a>
    </li>
  {/each}
</ul>
