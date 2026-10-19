<script lang="ts">
  /**
   * A decision page in the Decisions tab's pane, live: the page its session
   * published, on that session's own preview origin at `/__cawco/page/<id>/`
   * (hub preview.ts), whichever artifact its panel shows. Its overlay joins
   * the page's document itself (the `cawco:hello` names it), so a pick here is
   * a pick in the panel and every other view, and a revision morphs in place.
   * It draws in the dashboard's theme and pads its foot for the docked
   * composer (`inset.bottom`). Host mode enters with a pass of its own (hub
   * preview-access.ts); a lapsed pass enters again once.
   */
  import { decisionsWords, PREVIEW_LOCKED_MESSAGE } from "@cawco/core";
  import { untrack } from "svelte";
  import { enterPage, pageSource } from "#lib/cawco/preview/page-source.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { theme } from "#lib/theme.svelte.js";

  let {
    instanceId,
    artifactId,
    name,
    title,
    card = null,
    insetBottom,
  }: {
    /** The session that published it: its preview origin serves it. */
    instanceId: string;
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

  const place = $derived(
    `/__cawco/page/${artifactId}/${card ? `#${encodeURIComponent(card)}` : ""}`
  );

  /** Its address entered again (a lapsed pass): straight, or by a new pass. */
  async function enter(at: string, byHost: boolean, wanted: string) {
    const entered = await enterPage(instanceId, at, byHost, wanted);
    if ("src" in entered) {
      ({ src } = entered);
    } else {
      ({ problem } = entered);
    }
  }

  // Where its session's pages are served, asked once per session and page.
  $effect(() => {
    const session = instanceId;
    const wanted = untrack(() => place);
    let live = true;
    problem = null;
    src = null;
    connected = false;
    turnedAway = 0;
    pageSource(session, wanted).then((found) => {
      if (!live) {
        return;
      }
      if ("problem" in found) {
        ({ problem } = found);
        return;
      }
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
      } else if (type === PREVIEW_LOCKED_MESSAGE && src) {
        turnedAway += 1;
        if (turnedAway > 1) {
          problem = decisionsWords.turnedAway;
          return;
        }
        enter(origin, true, place);
      }
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  });
</script>

{#if problem}
  <p class="type-body m-0 py-space-5 text-ink-muted" role="alert">{problem}</p>
{:else if src}
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
  <iframe
    class="block min-h-0 w-full flex-auto border-none border-current bg-transparent"
    onload={hello}
    {src}
    title="Decision page: {title}"
    bind:this={frame}
  ></iframe>
{:else}
  <div aria-hidden="true" class="flex-auto p-space-5">
    <Skeleton class="h-space-3 w-2/5" data-slot="block" radius="text" />
  </div>
{/if}
