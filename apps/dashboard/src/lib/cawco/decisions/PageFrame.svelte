<script lang="ts">
  /**
   * A decision page in the Decisions tab's pane, live: the project's page, on
   * the project's own preview origin at `/__cawco/page/<id>/`, whichever
   * session wrote it and whether or not it still stands
   * (hub preview.ts), whichever artifact its panel shows. Its overlay joins
   * the page's document itself (the `cawco:hello` names it), so a pick here is
   * a pick in the panel and every other view, and a revision morphs in place.
   * It draws in the dashboard's theme and pads its foot for the docked
   * composer (`inset.bottom`). On a host-mode name the browser's pass lets
   * it through; turned away, it enters once and loads again
   * (preview/pass.ts).
   */
  import { decisionsWords, PREVIEW_LOCKED_MESSAGE } from "@cawco/core";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { pageSource } from "#lib/cawco/preview/page-source.js";
  import { enterPreviews, turnedAwayWords } from "#lib/cawco/preview/pass.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconDocument } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";

  let {
    projectId,
    artifactId,
    name,
    title,
    card = null,
    insetBottom,
  }: {
    /** Its project: the project's preview origin serves it. */
    projectId: string;
    artifactId: string;
    name: string;
    title: string;
    /** The card it opens scrolled to. */
    card?: string | null;
    /** What the docked composer covers of the page's foot, px. */
    insetBottom: number;
  } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let origin = $state<string | null>(null);
  let src = $state<string | null>(null);
  let problem = $state<string | null>(null);
  let connected = false;
  let turnedAway = 0;
  /**
   * When the frame last stood without the pass it may hold now
   * (`performance.now()`): its load, or its page's last word that it was
   * let in. An entry that landed since stands for it (preview/pass.ts).
   */
  let since = 0;
  /** Asks again: Retry on the page's failure reads where it is served afresh. */
  let tries = $state(0);

  const place = $derived(
    `/__cawco/page/${artifactId}/${card ? `#${encodeURIComponent(card)}` : ""}`
  );

  /** Turned away: the browser enters its previews, then the frame loads again. */
  async function enter(at: string) {
    const refused = await enterPreviews(at, since);
    if (refused) {
      problem = refused;
      return;
    }
    if (frame && src) {
      since = performance.now();
      frame.src = src;
    }
  }

  /**
   * Each switch of the fleet's preview mode the page heard (Settings ›
   * Previews): every origin moved, the page's embeds named in it as it was
   * served among them, so it is asked where it stands and loads again.
   */
  let modeMoves = $state(0);
  let modeSeen: string | null = null;
  $effect(() => {
    const settings = cawco.previewSettings;
    if (!settings) {
      return;
    }
    const mode = settings.mode === "host" ? settings.pattern : settings.mode;
    if (modeSeen !== null && modeSeen !== mode) {
      untrack(() => {
        modeMoves += 1;
      });
    }
    modeSeen = mode;
  });

  // Where its project's pages are served, asked once per project and page,
  // and again after a Retry or a switch of the preview mode.
  $effect(() => {
    const project = projectId;
    // biome-ignore lint/complexity/noVoid: read so a Retry runs the effect again
    void tries;
    // biome-ignore lint/complexity/noVoid: read so a mode switch runs the effect again
    void modeMoves;
    const wanted = untrack(() => place);
    let live = true;
    problem = null;
    src = null;
    connected = false;
    turnedAway = 0;
    pageSource({ project }, wanted).then((found) => {
      if (!live) {
        return;
      }
      if ("problem" in found) {
        ({ problem } = found);
        return;
      }
      since = performance.now();
      ({ origin, src } = found);
    });
    return () => {
      live = false;
    };
  });

  function post(message: object) {
    if (origin) {
      frame?.contentWindow?.postMessage(message, origin);
    }
  }

  function hello() {
    connected = false;
    post({
      type: "cawco:hello",
      theme: theme.resolved,
      artifact: { id: artifactId, kind: "page", name },
      sync: `/__cawco/artifact/${artifactId}`,
      inset: { bottom: insetBottom },
    });
  }

  // The dashboard's theme turning tells the page; so does the composer's height.
  $effect(() => {
    const scheme = theme.resolved;
    untrack(() => {
      if (connected) {
        post({ type: "cawco:theme", theme: scheme });
      }
    });
  });
  $effect(() => {
    const bottom = insetBottom;
    untrack(() => {
      if (connected) {
        post({ type: "cawco:place", inset: { bottom } });
      }
    });
  });

  // Only its own frame, from its own origin, is heard.
  $effect(() => {
    const heard = (event: MessageEvent) => {
      if (!(
        origin &&
        event.source === frame?.contentWindow &&
        event.origin === origin
      )) {
        return;
      }
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "cawco:ready") {
        connected = true;
        turnedAway = 0;
        since = performance.now();
      } else if (type === PREVIEW_LOCKED_MESSAGE && src) {
        turnedAway += 1;
        if (turnedAway > 1) {
          problem = turnedAwayWords(origin);
          return;
        }
        enter(origin);
      }
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  });
</script>

{#snippet again()}
  <Button
    onclick={() => {
      tries += 1;
    }}
    size="sm"
    variant="outline">{decisionsWords.retry}</Button
  >
{/snippet}

{#if problem}
  <!-- The page didn't open: the Empty recipe, named for the page, the hub's
       words for why, and Retry (DESIGN.md, Empty). -->
  <div role="alert" in:reveal>
    <EmptyState action={again} icon={IconDocument} line={problem} {title} />
  </div>
{:else if src}
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
  <iframe
    class="block min-h-0 w-full flex-auto border-none border-current bg-transparent"
    onload={hello}
    {src}
    title="Decision page: {title}"
    bind:this={frame}
    in:reveal
  ></iframe>
{:else}
  <div aria-hidden="true" class="flex-auto p-space-5" out:revealOut>
    <Skeleton class="w-2/5" data-slot="block" line="body" radius="text" />
  </div>
{/if}
