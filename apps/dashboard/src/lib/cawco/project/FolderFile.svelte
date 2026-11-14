<script lang="ts">
  /**
   * A file of the project's folder on the hub, at its address on the
   * project page (`?file=<path>`, folderFileHref), drawn as what it is
   * (@cawco/core deliverables): a picture as itself, opening in the
   * lightbox, video and audio in the platform's player (TaskOutput, from
   * the folder's bytes, folderRawFile); markdown drawn, anything else as
   * text. A Caw reply's chips, a report's file chips, Configure's project
   * delegate types and a task's attached files link to it. It opens
   * in the page (The Open Page Rule): the card beside the view on a desk
   * (SideSurface, in the page's Split), its own page with Back under 900px
   * (PageSurface). Either bar names it by the file's name, its path the
   * body's first line (DESIGN.md, The Title Bars Follow Liquid Glass Rule: "a path is
   * never printed in a bar"; "Back and Close are symbols, named by where
   * they go").
   * A path the hub refuses (not in the folder, outside it) says so in the
   * hub's words; only the hub reads the folder.
   */
  import { deliverableKind } from "@cawco/core/deliverables";
  import { filesWords } from "@cawco/core/words/files";
  import Markdown from "#lib/cawco/Markdown.svelte";
  import { fileName } from "#lib/components/features/diff-language.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { hub } from "#lib/platform/hub.js";
  import { failureWords, hubData, hubRefusal } from "#lib/platform/hub-read.js";
  import { reveal, revealOut } from "#lib/platform/motion/curves.svelte.js";
  import { folderRawFile } from "../project-tasks";
  import PageSurface from "../side/PageSurface.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import TaskOutput from "../tasks/TaskOutput.svelte";

  let {
    projectId,
    path,
    onclose,
    page,
  }: {
    projectId: string;
    path: string;
    /** Close on a desk; Back on a phone. */
    onclose: () => void;
    /** Under 900px: the file is its own page, with Back to `backTo` (the view's name, Back's tooltip and accessible name), not a card beside the view. */
    page?: { backTo: string };
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
    hubData(
      hub.api.projects({ id: pid }).folder.file.get({ query: { path: at } }),
      (refused) => hubRefusal(refused, filesWords.notReadThen(at))
    )
      .then((read) => read.content)
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

<!-- The file runs to its surface's top beneath the head floating over it:
     its scroller pads its top by the head's room (`--side-room`, the side
     card's or the page's) and is the timeline its scroll edge effect plays
     on (HeadFade). -->
{#snippet body()}
  <div
    class="flex min-h-0 flex-1 flex-col overflow-y-auto pt-(--side-room) scroll-timeline-transcript-head"
    data-folder-file={path}
  >
    <div class="flex flex-col gap-space-2 p-space-5">
      <!-- Its path, which the bar names by the file alone: words to read
           and copy, wrapping where it runs long. -->
      <bdi
        data-slot="page-path"
        class="type-meta font-mono liga-none wrap-anywhere text-ink-subtle"
        >{path}</bdi
      >
      {#if media}
        <TaskOutput
          bare
          {path}
          {projectId}
          source={folderRawFile(projectId, path)}
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
  </div>
{/snippet}

{#if page}
  <!-- Its own page under 900px: Back to the view, the file's name its
       title, its path the body's first line. -->
  <PageSurface
    backTo={page.backTo}
    data-file-page
    label={path}
    {onclose}
    title={fileName(path)}
  >
    {@render body()}
  </PageSurface>
{:else}
  <SideSurface
    of="file"
    label="A file of the project's folder"
    {onclose}
    title={fileName(path)}
  >
    {@render body()}
  </SideSurface>
{/if}
