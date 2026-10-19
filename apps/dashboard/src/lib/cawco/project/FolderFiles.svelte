<script lang="ts">
  /**
   * The project folder's files a Caw reply names (`thread_reply` `files`):
   * one chip each, its path, a link to the file's address on the project
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
        class="group/file mark-line press-tint type-label inline-flex min-h-c-btn-h-sm max-w-full cursor-pointer items-center gap-space-2 rounded-sm border border-border-control bg-surface-raised px-space-3 text-ink-strong transition-[background-color] dur-control ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset) text-center no-underline aria-current-page:bg-selected-bg aria-current-page:text-selected-ink"
        data-folder-chip={path}
        href={folderFileHref(projectId, path)}
      >
        <IconDocument
          data-slot="file-icon"
          class="size-icon-md flex-none text-ink-muted group-aria-current-page/file:text-selected-icon"
        />
        <bdi
          data-slot="path"
          class="min-w-0 overflow-clip font-(family-name:--font-mono) text-size-code text-ellipsis whitespace-nowrap"
          >{path}</bdi
        >
      </a>
    </li>
  {/each}
</ul>
