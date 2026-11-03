<script lang="ts">
  /**
   * A file of the project's folder on the hub, at its address on the
   * project page (`?file=<path>`, folderFileHref), drawn as what it is
   * (@cawco/core deliverables): a picture as itself, opening in the
   * lightbox, video and audio in the platform's player (TaskOutput, from
   * the folder's bytes, folderRawHref); markdown drawn, anything else as
   * text. A Caw reply's chips, a report's file chips, Configure's project
   * delegate types and a task's attached files link to it. It opens
   * in the page (The Open Page Rule): the card beside the view on a desk
   * (SideSurface, in the page's Split), its own page with Back under 900px.
   * A path the hub refuses (not in the folder, outside it) says so in the
   * hub's words; only the hub reads the folder.
   */
  import { deliverableKind } from "@cawco/core/deliverables";
  import { filesWords } from "@cawco/core/words/files";
  import { failureWords, hubRefusal } from "#lib/cawco/hub-read.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronLeft } from "#lib/icons.js";
  import { folderRawHref } from "../project-tasks";
  import SideSurface from "../side/SideSurface.svelte";
  import TaskOutput from "../tasks/TaskOutput.svelte";

  let {
    projectId,
    path,
    onclose,
    page = false,
    backLabel = "",
  }: {
    projectId: string;
    path: string;
    /** Close on a desk; Back on a phone. */
    onclose: () => void;
    /** Under 900px: the file is its own page, with Back, not a card beside the view. */
    page?: boolean;
    /** Where Back goes on its own page, named in its tooltip ("Back to …"). */
    backLabel?: string;
  } = $props();

  const kind = $derived(deliverableKind(path));
  /** A picture, a video or a sound: drawn from its bytes, never read as text. */
  const media = $derived(
    kind === "image" || kind === "video" || kind === "audio"
  );
  let content = $state<string | null>(null);
  let problem = $state<string | null>(null);

  $effect(() => {
    const pid = projectId;
    const at = path;
    content = null;
    problem = null;
    if (media) {
      return;
    }
    fetch(
      `/api/projects/${encodeURIComponent(pid)}/folder/file?${new URLSearchParams({ path: at })}`
    )
      .then(async (response) => {
        if (!response.ok) {
          throw await hubRefusal(response, filesWords.notReadThen(at));
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
  /** The file's own name, its title; and the folder it stands in, said in its content. */
  const name = $derived(path.split("/").at(-1) ?? path);
  const folder = $derived(path.split("/").slice(0, -1).join("/"));
</script>

{#snippet body()}
  <div
    class="flex min-h-0 flex-1 flex-col gap-space-2 overflow-y-auto p-space-5"
    data-folder-file={path}
  >
    {#if folder}
      <!-- Where it is in the project's folder: a fact of the file, in its
           content, never a path in the bar. -->
      <p
        data-slot="file-folder"
        class="m-0 min-w-0 truncate type-code text-ink-muted"
        title={path}
      >
        <bdi>{folder}</bdi>
      </p>
    {/if}
    {#if media}
      <TaskOutput
        bare
        {path}
        {projectId}
        src={folderRawHref(projectId, path)}
      />
    {:else if problem}
      <!-- Plain, not alarmed (DESIGN.md, Voice: no alarm inflation): the path
           asked for is not there to show, and the hub says why. -->
      <Alert data-folder-file-refused>
        <AlertDescription>{problem}</AlertDescription>
      </Alert>
    {:else if content === null}
      <div class="flex flex-col gap-space-2" out:revealOut>
        <Skeleton class="w-2/3" line="body" />
        <Skeleton class="w-1/2" line="body" />
      </div>
    {:else if markdown}
      <div in:reveal>
        <Markdown source={content} />
      </div>
    {:else}
      <pre
        in:reveal
        data-slot="text"
        class="m-0 font-mono text-size-code wrap-anywhere whitespace-pre-wrap text-ink-strong">{content}</pre>
    {/if}
  </div>
{/snippet}

{#if page}
  <!-- Its own page under 900px, headed as a task's (TaskPane's page). -->
  <section
    aria-label={path}
    class="flex min-h-0 flex-1 flex-col"
    data-file-page
  >
    <!-- One row (DESIGN.md, The Title Bars Follow Liquid Glass Rule): Back,
         the chevron alone in its glass group, named by where it goes, then
         the file's name; its folder is the content's first line, never a
         path in the bar. -->
    <header
      data-slot="page-head"
      class="flex h-c-top-bar-h flex-none items-center gap-space-2 pe-space-5 ps-space-2"
    >
      <BarGlass form="group">
        <BarItem
          icon={IconChevronLeft}
          label={backLabel ? `Back to ${backLabel}` : "Back"}
          onclick={onclose}
        />
      </BarGlass>
      <h2
        data-slot="title"
        class="m-0 min-w-0 truncate type-label font-medium text-ink-strong"
      >
        {name}
      </h2>
    </header>
    {@render body()}
  </section>
{:else}
  <SideSurface
    of="file"
    label="A file of the project's folder"
    {onclose}
    title={name}
    titleCode
  >
    {@render body()}
  </SideSurface>
{/if}
