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
  import {
    carriesWait,
    revealIn,
    revealOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { enterPage, pageSource } from "#lib/cawco/preview/page-source.js";
  import { theme } from "#lib/theme.svelte.js";

  let {
    instanceId,
    artifactId,
    name,
    title,
    card = null,
    insetBottom,
    waitingSince,
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
    /**
     * When the wait it carries on began (`performance.now()`): the page's
     * own read, whose opening line its first one takes over (DecisionPage).
     */
    waitingSince?: number;
  } = $props();

  /** When the wait its opening line stands for began: the one handed on, then each address asked anew. */
  let since = $state(untrack(() => waitingSince) ?? performance.now());
  /** The first address asked carries the handed wait on; each later one is a wait of its own. */
  let asked = false;

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
    if (asked) {
      since = performance.now();
    }
    asked = true;
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

<!-- The house opening line (the kit's skeleton, unseen for the wait's
     grace) while its address is asked, then the page, or why it could not
     be opened, in the reveal (revealOut, revealIn). -->
{#if problem}
  <p class="problem" role="alert" in:revealIn>{problem}</p>
{:else if src}
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
  <iframe
    class="kit-page"
    onload={hello}
    {src}
    title="Decision page: {title}"
    bind:this={frame}
    in:revealIn
  ></iframe>
{:else}
  <!-- It carries on the page's own wait (DecisionPage): its line stands
       where that one stood, seen or not, and goes as the frame comes. -->
  <div
    aria-hidden="true"
    class="opening"
    data-page-frame-opening
    {@attach carriesWait(since)}
    out:revealOut
  >
    <span
      data-slot="block"
      class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
    ></span>
  </div>
{/if}

<style>
  .kit-page {
    display: block;
    flex: 1 1 auto;
    inline-size: 100%;
    min-block-size: 0;
    border: 0;
    background: transparent;
  }
  .opening {
    flex: 1 1 auto;
    padding: var(--space-5);
  }
  .problem {
    margin: 0;
    padding: var(--space-5) 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }
</style>
