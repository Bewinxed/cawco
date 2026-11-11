<!--
  A block's Preview in a reply (tsk-330): an HTML page artifact its
  conversation made (artifact_create with `html`), live in a frame, found
  by the name the agent gave it among the session's artifacts. The page
  stands at its own address on the origin that serves it (`/__cawco/page/
  <id>/`, preview/page-source.ts, as the Decisions tab and Files load a
  page): another origin than the dashboard's, so its HTML runs in its own
  sandbox, as every page artifact does. Its frame is greeted as every host
  greets a page (`cawco:hello`, the dashboard's theme), and a browser its
  origin turns away enters its previews and loads it again, once.

  It loads only once its block draws (TranscriptBlock draws a block as it
  nears the view). Sized by its agent it takes that room, unsized the
  reply's measure (block-size.ts), at a screen's 16:10, the page scrolling
  inside it. Replaced, its block holds no frame: it stands as the page's
  last picture (its thumbnail), or a box of the frame's shape naming it.
  A name no page of the conversation has, or a page that can't open, says
  so in one line in its place.

  A kept block draws a Preview with the decision page's own
  (decisions/host/Preview.svelte), which the page's media resolve.
-->
<script lang="ts">
  import { PREVIEW_LOCKED_MESSAGE } from "@cawco/core/frames";
  import type { ArtifactSummary } from "@cawco/core/protocol";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArtifactPageLinear } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { enterPreviews, turnedAwayWords } from "../../preview/pass";
  import { blockMediaHere } from "./block-media";
  import { BLOCK_ROOM, blockSize } from "./block-size";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    artifact: unknown;
    caption?: unknown;
    size?: unknown;
  }> = $props();

  const media = blockMediaHere();
  const asked = $derived(String(props.artifact ?? ""));
  const caption = $derived(props.caption ? String(props.caption) : "");
  const size = $derived(blockSize(props.size) ?? "medium");
  /** Its conversation's artifacts; undefined while they are read. */
  const listed = $derived(media.pages?.list());
  /** The page it names, by its name or its id; null when none of the conversation's is. */
  const page = $derived.by((): ArtifactSummary | null | undefined => {
    if (listed === undefined) {
      return undefined;
    }
    return (
      listed.find(
        (one) => one.kind === "page" && (one.name === asked || one.id === asked)
      ) ?? null
    );
  });
  const title = $derived(page?.title || asked);
  const still = $derived(page && media.pages ? media.pages.still(page) : null);

  let frame = $state<HTMLIFrameElement>();
  let served = $state<{ origin: string; src: string } | null>(null);
  let problem = $state<string | null>(null);
  let loaded = $state(false);

  // Where the page is served, asked once it is found, for a live block.
  $effect(() => {
    const found = page;
    const { pages, still: stands } = media;
    served = null;
    problem = null;
    loaded = false;
    if (!(found && pages) || stands) {
      return;
    }
    let live = true;
    pages.frame(found).then((answer) => {
      if (!live) {
        return;
      }
      if ("problem" in answer) {
        ({ problem } = answer);
      } else {
        served = answer;
      }
    });
    return () => {
      live = false;
    };
  });

  /** Greets the page as every host does, in the dashboard's theme. */
  function hello() {
    loaded = true;
    if (!(served && page)) {
      return;
    }
    frame?.contentWindow?.postMessage(
      {
        type: "cawco:hello",
        theme: theme.resolved,
        artifact: { id: page.id, kind: "page", name: page.name },
        sync: `/__cawco/artifact/${page.id}`,
        inset: { bottom: 0 },
      },
      served.origin
    );
  }

  // The dashboard's theme turning tells the page.
  $effect(() => {
    const scheme = theme.resolved;
    if (loaded && served) {
      frame?.contentWindow?.postMessage(
        { type: "cawco:theme", theme: scheme },
        served.origin
      );
    }
  });

  // Turned away by its origin, the browser enters its previews and loads it again, once.
  $effect(() => {
    const at = served;
    if (!at) {
      return;
    }
    let since = performance.now();
    let entered = false;
    const heard = (event: MessageEvent) => {
      if (
        event.source !== frame?.contentWindow ||
        event.origin !== at.origin ||
        (event.data as { type?: unknown } | null)?.type !==
          PREVIEW_LOCKED_MESSAGE
      ) {
        return;
      }
      if (entered) {
        problem = turnedAwayWords(at.origin);
        return;
      }
      entered = true;
      enterPreviews(at.origin, since).then((refused) => {
        if (refused) {
          problem = refused;
        } else if (frame) {
          since = performance.now();
          frame.src = at.src;
        }
      });
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  });
</script>

<!-- mark-line: the page stands over its caption, in a column -->
<figure
  class={["m-0 min-w-0 max-w-full", BLOCK_ROOM[size]]}
  data-slot="block-preview"
>
  {#if page === null}
    <p
      class="m-0 type-meta text-ink-muted wrap-anywhere"
      data-slot="media-gone"
    >
      {transcriptWords.blockPageMissing(asked)}
    </p>
  {:else if problem}
    <p
      class="m-0 type-meta text-ink-muted wrap-anywhere"
      data-slot="media-gone"
    >
      {transcriptWords.blockPageFailed(title, problem)}
    </p>
  {:else if media.still}
    {#if still}
      <img
        alt={title}
        class="block aspect-16/10 w-full rounded-sm object-cover object-top outline-1 -outline-offset-1 outline-image-outline"
        data-slot="page-still"
        src={still}
      />
    {:else}
      <!-- mark-line: the glyph stands above the page's title -->
      <div
        class="grid aspect-16/10 w-full place-items-center content-center gap-space-1 rounded-sm bg-surface-recess px-space-3 text-ink-muted"
        data-slot="page-still"
      >
        <IconArtifactPageLinear class="size-icon-md" />
        <span class="type-meta text-center wrap-anywhere">{title}</span>
      </div>
    {/if}
  {:else}
    <div
      class="relative aspect-16/10 w-full overflow-clip rounded-sm bg-surface-raised outline-1 -outline-offset-1 outline-image-outline"
    >
      {#if served}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: its load greets the page. -->
        <!-- biome-ignore lint/security/useIframeSandbox: a page CawCo serves on its own preview origin, which needs scripts and that origin to run; with both a sandbox holds nothing back. -->
        <iframe
          bind:this={frame}
          class="block size-full border-0 bg-transparent"
          loading="lazy"
          onload={hello}
          src={served.src}
          title={transcriptWords.blockPageFrame(title)}
        ></iframe>
      {/if}
      {#if !loaded}
        <div aria-hidden="true" class="absolute inset-0">
          <Skeleton fill="frame" />
        </div>
      {/if}
    </div>
  {/if}
  {#if caption}
    <figcaption class="mt-space-2 type-meta text-ink-muted wrap-anywhere">
      {caption}
    </figcaption>
  {/if}
</figure>
