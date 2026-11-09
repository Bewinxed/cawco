<script lang="ts">
  import {
    PAGE_TOUCHED_MESSAGE,
    PREVIEW_LOCKED_MESSAGE,
  } from "@cawco/core/preview/routes";
  /**
   * A decision page in the Decisions tab's pane, live: the project's page, on
   * the project's own preview origin at `/__cawco/page/<id>/`, whichever
   * session wrote it and whether or not it still stands
   * (hub preview.ts), whichever artifact its panel shows. Its overlay joins
   * the page's document itself (the `cawco:hello` names it), so a pick here is
   * a pick in the panel and every other view, and a revision morphs in place.
   * It draws in the dashboard's theme and pads its foot for the docked
   * composer (`inset.bottom`). It loads once the browser entered its
   * previews (page-source.ts); turned away later, it enters once more and
   * loads again (preview/pass.ts). Loaded and in view, it tells the hub
   * that each session's panel showing this page has it on screen, as the
   * pane does (PreviewPane): the agent's artifact_create or artifact_show
   * answers from it.
   */
  import { decisionsWords } from "@cawco/core/words/decisions";
  import { untrack } from "svelte";
  import { artifactShown } from "#lib/cawco/artifact-api.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { artifactReached } from "#lib/cawco/files/reached.js";
  import { pageVisible } from "#lib/cawco/page-visible.svelte.js";
  import { frameHand, holdOpen } from "#lib/cawco/preview/open-pages.js";
  import { pageSource } from "#lib/cawco/preview/page-source.js";
  import { enterPreviews, turnedAwayWords } from "#lib/cawco/preview/pass.js";
  import {
    previewError,
    previewErrorOf,
    previewOpenArtifact,
  } from "#lib/cawco/preview/wire.js";
  import { openReference } from "#lib/cawco/reference-open.svelte.js";
  import { heardInput } from "#lib/cawco/reload.svelte.js";
  import { sessionHere } from "#lib/cawco/session-here.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconDocument } from "#lib/icons.js";
  import { reveal, revealOut } from "#lib/platform/motion/curves.svelte.js";
  import { track } from "#lib/platform/track.js";
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
  /** The page said it is ready (`cawco:ready`): its overlay joined it. */
  let connected = $state(false);
  /**
   * Why the page's last Send didn't go, in the error formula, as the page
   * said it (`cawco:error` of a send); its own Send goes again, and the
   * line stands until a Send goes (`cawco:resolved`) or the page loads again.
   */
  let notSent = $state<string | null>(null);
  let turnedAway = 0;
  /**
   * When the frame last stood without the pass it may hold now
   * (`performance.now()`): its load, or its page's last word that it was
   * let in. An entry that landed since stands for it (preview/pass.ts).
   */
  let since = 0;
  /** Asks again: Retry on the page's failure reads where it is served afresh. */
  let tries = $state(0);

  const place = $derived(`/__cawco/page/${artifactId}/`);

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
    track(tries);
    track(modeMoves);
    const wanted = untrack(() => place);
    let live = true;
    problem = null;
    src = null;
    connected = false;
    notSent = null;
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

  // While the page stands ready here, I'm done picking and every other Send
  // the dashboard makes carries what it shows (open-pages.ts).
  $effect(() => {
    if (!connected) {
      return;
    }
    return holdOpen(
      artifactId,
      frameHand(
        () => frame,
        () => origin
      )
    );
  });

  /** The session whose conversation the page stands in, where it stands in one. */
  const here = sessionHere();

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

  // The card the address names (`#<card>`) is brought into view and outlined
  // for a moment once the page is ready, and again when the address names
  // another, as a card chip does in the panel (PreviewPane `showCard`).
  $effect(() => {
    const target = card;
    if (!(connected && target)) {
      return;
    }
    untrack(() =>
      post({
        type: "cawco:show-element",
        selector: `#decision-${CSS.escape(target)}`,
        outline: "flash",
      })
    );
  });

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

  /** The open frames already said on screen, by revision. */
  const said = new Set<string>();
  // Each session's panel showing this page, at its open frame's revision:
  // the page is on screen here, which the waiting show answers.
  $effect(() => {
    if (!(connected && pageVisible.current)) {
      return;
    }
    for (const [instanceId, panel] of Object.entries(cawco.previews)) {
      if (
        panel?.state !== "open" ||
        panel.artifact.id !== artifactId ||
        said.has(panel.revision)
      ) {
        continue;
      }
      const { revision } = panel;
      said.add(revision);
      artifactShown(instanceId, artifactId, { revision, ok: true }).then(
        () => artifactReached(instanceId, artifactId),
        () => {
          // Unheard: the next change of state says it again.
          said.delete(revision);
        }
      );
    }
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
      const told = event.data as {
        message?: unknown;
        of?: unknown;
        type?: unknown;
      } | null;
      // A Canvas's Open to draw or a Preview's Open full: the artifact opens
      // where a chip of it pressed here opens.
      const opening = previewOpenArtifact(event.data);
      if (opening) {
        openReference(opening.artifact, { top: true }, here?.()).then(
          (refused) => post({ jsonrpc: "2.0", id: opening.id, result: refused })
        );
        return;
      }
      const type = told?.type;
      if (type === PAGE_TOUCHED_MESSAGE) {
        heardInput();
      } else if (
        type === "cawco:error" &&
        previewErrorOf(told?.of) === "send"
      ) {
        notSent = previewError(told?.message);
      } else if (type === "cawco:resolved") {
        notSent = null;
      } else if (type === "cawco:ready") {
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
  {#if notSent}
    <!-- The page's Send that didn't go: said over the page, never over its
         Send, which goes again from where it stands. -->
    <p
      class="m-0 flex-none px-space-3 py-space-2 bg-surface-raised border-b border-border-hairline text-data-bad text-size-body text-pretty wrap-anywhere"
      role="alert"
      in:reveal
    >
      {notSent}
    </p>
  {/if}
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
  <!-- biome-ignore lint/security/useIframeSandbox: a page CawCo serves itself under /__cawco, which needs scripts and its own origin to run, and with both a sandbox holds nothing back. -->
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
