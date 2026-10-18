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

<ul class="files">
  {#each files as path (path)}
    <li>
      <a
        aria-current={shown === path ? "page" : undefined}
        class="file mark-line press-tint"
        data-folder-chip={path}
        href={folderFileHref(projectId, path)}
      >
        <IconDocument class="icon" />
        <bdi data-slot="path" class="path">{path}</bdi>
      </a>
    </li>
  {/each}
</ul>

<style>
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }
  .file {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-inline-size: 100%;
    min-block-size: 30px;
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-label);
    /* As the button it was set: its path centred, never underlined. */
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .file :global(.icon) {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-muted);
  }
  /* The file the page shows now takes the Selected pair (DESIGN.md Colors:
     Selected): the wash, its path in selected-ink and its glyph in
     selected-icon. It stands after the base rules it overrides. */
  .file[aria-current="page"] {
    background: var(--selected-bg);
    color: var(--selected-ink);

    & :global(.icon) {
      color: var(--selected-icon);
    }
  }
  .path {
    min-inline-size: 0;
    overflow: clip;
    font-family: var(--font-mono);
    font-size: var(--text-code);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
