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

<ul class="m-0 mt-space-3 flex list-none flex-wrap gap-space-2 p-0">
  {#each files as path (path)}
    <li>
      <!-- literal: 30px, 2px -->
      <button
        aria-pressed={shown === path}
        class="mark-line press-tint type-label inline-flex min-h-(--chip-h) max-w-full cursor-pointer items-center gap-space-2 rounded-sm border border-border-control bg-surface-raised px-space-3 text-ink-strong transition-[background-color] dur-control ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-offset) aria-pressed:bg-surface-fill"
        style:--chip-h="30px"
        style:--focus-offset="2px"
        data-folder-chip={path}
        onclick={() => onopen(path)}
        type="button"
      >
        <IconDocument class="size-icon-md flex-none text-ink-muted" />
        <bdi
          data-slot="path"
          class="min-w-0 overflow-clip font-(family-name:--font-mono) text-size-code text-ellipsis whitespace-nowrap"
          >{path}</bdi>
      </button>
    </li>
  {/each}
</ul>
