<script lang="ts">
  /**
   * The project folder's files a Caw reply names (`thread_reply` `files`):
   * one chip each, its path, which opens the file in a sheet as it reads in
   * the project's folder on the hub (markdown drawn, anything else as text).
   */
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconDocument } from "#lib/icons.js";

  let { projectId, files }: { projectId: string; files: string[] } = $props();

  let open = $state<string | null>(null);
  let content = $state<string | null>(null);
  let problem = $state<string | null>(null);

  async function read(path: string) {
    open = path;
    content = null;
    problem = null;
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/folder/file?${new URLSearchParams({ path })}`
      );
      if (!response.ok) {
        throw new Error(
          (await response.text()) ||
            `The hub answered ${response.status}, so ${path} could not be read.`
        );
      }
      const { content: text } = (await response.json()) as { content: string };
      if (open === path) {
        content = text;
      }
    } catch (error) {
      if (open === path) {
        problem = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const markdown = $derived(open?.endsWith(".md") ?? false);
</script>

<ul class="files">
  {#each files as path (path)}
    <li>
      <button class="file press-tint" onclick={() => read(path)} type="button">
        <IconDocument class="icon" />
        <bdi class="path">{path}</bdi>
      </button>
    </li>
  {/each}
</ul>

<Sheet.Root
  bind:open={
    () => open !== null,
    (next) => {
    if (!next) {
      open = null;
    }
  }
  }
>
  <Sheet.Content
    class="gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 data-[side=right]:sm:max-w-xl"
    side="right"
  >
    <Sheet.Header class="file-head">
      <Sheet.Title class="file-title"><bdi>{open}</bdi></Sheet.Title>
      <Sheet.Description class="sr-only">
        A file of the project's folder on the hub.
      </Sheet.Description>
    </Sheet.Header>
    <div class="file-body">
      {#if problem}
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      {:else if content === null}
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
      {:else if markdown}
        <Markdown source={content} />
      {:else}
        <pre class="text">{content}</pre>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>

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
  }
  .file :global(.icon) {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-muted);
  }
  .path {
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--text-code);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 2px;
  }
  :global(.file-head) {
    border-block-end: 1px solid var(--border-hairline);
    padding: var(--space-4) var(--space-5);
  }
  :global(.file-title) {
    font-family: var(--font-mono);
    font-size: var(--text-label);
  }
  .file-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    overflow-y: auto;
    padding: var(--space-5);
  }
  .text {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-code);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--ink-strong);
  }
</style>
