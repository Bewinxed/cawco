<script lang="ts">
  /**
   * A file of the project's folder on the hub, at its address on the
   * project page (`?file=<path>`, folderFileHref), as it reads there:
   * markdown drawn, anything else as text. A Caw reply's chips, Configure's
   * project delegate types and a task's attached files link to it. It opens
   * in the page (The Open Page Rule): the card beside the view on a desk
   * (SideSurface, in the page's Split), its own page with Back under 900px.
   * A path the hub refuses (not in the folder, outside it) says so in the
   * hub's words; only the hub reads the folder.
   */
  import { failureWords, hubRefusal } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronLeft } from "#lib/icons.js";
  import SideSurface from "../side/SideSurface.svelte";

  let {
    projectId,
    path,
    onclose,
    page = false,
    backLabel = "Back",
  }: {
    projectId: string;
    path: string;
    /** Close on a desk; Back on a phone. */
    onclose: () => void;
    /** Under 900px: the file is its own page, with Back, not a card beside the view. */
    page?: boolean;
    /** What Back says on its own page. */
    backLabel?: string;
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
          throw await hubRefusal(response, `so ${at} could not be read.`);
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

{#snippet body()}
  <div
    class="flex min-h-0 flex-1 flex-col gap-space-2 overflow-y-auto p-space-5 in-data-file-page:border-t in-data-file-page:border-t-border-hairline"
    data-folder-file={path}
  >
    {#if problem}
      <!-- Plain, not alarmed (WORDS.md, no alarm inflation): the path
           asked for is not there to show, and the hub says why. -->
      <Alert data-folder-file-refused>
        <AlertDescription>{problem}</AlertDescription>
      </Alert>
    {:else if content === null}
      <Skeleton class="h-icon-md w-2/3" />
      <Skeleton class="h-icon-md w-1/2" />
    {:else if markdown}
      <Markdown source={content} />
    {:else}
      <pre
        data-slot="text"
        class="m-0 font-mono text-size-code wrap-anywhere whitespace-pre-wrap text-ink-strong">{content}</pre>
    {/if}
  </div>
{/snippet}

{#if page}
  <!-- Its own page under 900px, headed as a task's (TaskPane's page): Back,
       then the path at the row's end, cut short where it runs long. -->
  <section
    aria-label={path}
    class="flex min-h-0 flex-1 flex-col"
    data-file-page
  >
    <header
      data-slot="page-head"
      class="flex flex-none items-center gap-space-2 pt-0 pr-space-5 pb-space-2 pl-space-3"
    >
      <Button onclick={onclose} size="sm" variant="ghost">
        <IconChevronLeft />
        <span>{backLabel}</span>
      </Button>
      <bdi
        data-slot="page-path"
        class="ms-auto min-w-0 overflow-clip type-meta font-mono liga-none text-ellipsis whitespace-nowrap text-ink-subtle"
        >{path}</bdi
      >
    </header>
    {@render body()}
  </section>
{:else}
  <SideSurface
    label="A file of the project's folder"
    {onclose}
    title={path}
    titleCode
  >
    {@render body()}
  </SideSurface>
{/if}
