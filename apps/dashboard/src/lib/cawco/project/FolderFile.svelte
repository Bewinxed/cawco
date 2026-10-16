<script lang="ts">
  /**
   * A file of the project's folder on the hub, opened from its chip under a
   * Caw reply (FolderFiles), as it reads there: markdown drawn, anything
   * else as text. It is the card beside the conversation (SideSurface), so
   * it opens in the page (The Open Page Rule): beside the thread on a desk
   * (SideSplit), on the phone's sheet over the composer (SideSheet), or in
   * the thread's own place where it has no split (ThreadPane).
   */
  import type { Snippet } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import SideSurface from "../side/SideSurface.svelte";

  let {
    projectId,
    path,
    onclose,
    switcher,
  }: {
    projectId: string;
    path: string;
    onclose: () => void;
    /** The split's switch, while the plan or the preview is open beside it. */
    switcher?: Snippet;
  } = $props();

  let content = $state<string | null>(null);
  let problem = $state<string | null>(null);

  $effect(() => {
    const pid = projectId;
    const at = path;
    content = null;
    problem = null;
    fetch(
      `/api/projects/${encodeURIComponent(pid)}/folder/file?${new URLSearchParams({ path: at })}`
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            (await response.text()) ||
              `The hub answered ${response.status}, so ${at} could not be read.`
          );
        }
        return ((await response.json()) as { content: string }).content;
      })
      .then(
        (text) => {
          if (at === path) {
            content = text;
          }
        },
        (error: unknown) => {
          if (at === path) {
            problem = failureWords(error);
          }
        }
      );
  });

  const markdown = $derived(path.endsWith(".md"));
</script>

<SideSurface
  class="folder-file"
  label="A file of the project's folder"
  {onclose}
  {switcher}
  title={path}
>
  <div class="file-body" data-folder-file={path}>
    {#if problem}
      <Alert variant="destructive">
        <AlertDescription>{problem}</AlertDescription>
      </Alert>
    {:else if content === null}
      <Skeleton class="h-icon-md w-2/3" />
      <Skeleton class="h-icon-md w-1/2" />
    {:else if markdown}
      <Markdown source={content} />
    {:else}
      <pre data-slot="text" class="text">{content}</pre>
    {/if}
  </div>
</SideSurface>

<style>
  /* css-scope: .folder-file is this card's own class (SideSurface `class`).
     The path in the head is set as its chip sets it, in the mono face. */
  :global(.folder-file > .side-head .title) {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }
  .file-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-2);
    min-block-size: 0;
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
