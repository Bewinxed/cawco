<script lang="ts">
  /**
   * The project folder's files a Caw reply names (`thread_reply` `files`):
   * one chip each, its path. A chip opens its file in the page (FolderFile,
   * placed by ThreadPane); the chip of the file on show reads pressed.
   */
  import { IconDocument } from "#lib/icons.js";

  let {
    files,
    shown,
    onopen,
  }: {
    files: string[];
    /** The file open now, wherever ThreadPane shows it; null when none is. */
    shown: string | null;
    onopen: (path: string) => void;
  } = $props();
</script>

<ul class="files">
  {#each files as path (path)}
    <li>
      <button
        aria-pressed={shown === path}
        class="file mark-line press-tint"
        data-folder-chip={path}
        onclick={() => onopen(path)}
        type="button"
      >
        <IconDocument class="icon" />
        <bdi class="path">{path}</bdi>
      </button>
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
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .file[aria-pressed="true"] {
    background: var(--surface-fill);
  }
  .file :global(.icon) {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-muted);
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
