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
  import {
    PREVIEW_LOCKED_MESSAGE,
    PREVIEW_PING_PATH,
    type PreviewAddress,
    type PreviewTicket,
    previewEnterUrl,
    previewRoute,
  } from "@cawco/core";
  import { untrack } from "svelte";
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

  /** The hub's sentence for a refused request, or the fallback words. */
  const said = async (answer: Response | null, otherwise: string) =>
    (await answer?.text().catch(() => "")) || otherwise;

  /** Its address: straight on a port, or entered with a new pass by host name. */
  async function enter(at: string, byHost: boolean, wanted: string) {
    if (!byHost) {
      src = `${at}${wanted}`;
      return;
    }
    const answer = await fetch(
      `/api/instances/${encodeURIComponent(instanceId)}/preview-ticket`,
      { method: "POST" }
    ).catch(() => null);
    if (!answer?.ok) {
      problem = await said(answer, "The hub didn't give this page a pass.");
      return;
    }
    const { ticket } = (await answer.json()) as PreviewTicket;
    src = previewEnterUrl(at, ticket, wanted);
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
    (async () => {
      const answer = await fetch(
        `/api/instances/${encodeURIComponent(session)}/preview-address`,
        { method: "POST" }
      ).catch(() => null);
      if (!live) {
        return;
      }
      if (!answer?.ok) {
        problem = await said(answer, "The hub didn't say where this page is served.");
        return;
      }
      const route = previewRoute((await answer.json()) as PreviewAddress, location);
      if (!route) {
        problem = "The hub named no address for this page.";
        return;
      }
      const reached = await fetch(`${route.origin}${PREVIEW_PING_PATH}`, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      })
        .then((ping) => ping.ok)
        .catch(() => false);
      if (!live) {
        return;
      }
      if (!reached) {
        problem = `Pages are served at ${new URL(route.origin).host}, which this browser can't reach.`;
        return;
      }
      origin = route.origin;
      await enter(route.origin, route.byHost, wanted);
    })();
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
      if (!(origin && event.source === frame?.contentWindow && event.origin === origin)) {
        return;
      }
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "cawco:ready") {
        connected = true;
        turnedAway = 0;
      } else if (type === PREVIEW_LOCKED_MESSAGE && src) {
        turnedAway += 1;
        if (turnedAway > 1) {
          problem =
            "This page turned away its pass twice: this browser didn't keep the preview's cookie. Reach previews over https, then open it again.";
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
  <p class="problem" role="alert">{problem}</p>
{:else if src}
  <iframe
    class="kit-page"
    onload={hello}
    {src}
    title="Decision page: {title}"
    bind:this={frame}
  ></iframe>
{:else}
  <div aria-hidden="true" class="opening">
    <span class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"></span>
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
