<!-- A project's browser alone (Projects spec §5.11): the band and the stream
     (BrowserView), with no head, for the app's web view, which draws its own
     head, and for the panel's Open in new tab. The artifact is found, shown
     in its session's panel when it is not, and followed on the artifact's
     session socket (artifact-session.svelte.ts) for its browser's key and
     machine; the stream goes through the hub, as the panel's does. -->
<script lang="ts">
  import type { BrowserKey } from "@cawco/core/browser";
  import { untrack } from "svelte";
  import { findArtifact, showArtifact } from "#lib/cawco/artifact-api.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import Overlays from "#lib/cawco/Overlays.svelte";
  import { ArtifactSession } from "#lib/cawco/preview/artifact-session.svelte.js";
  import BrowserView from "#lib/cawco/preview/BrowserView.svelte";
  import { cardOnScreen } from "#lib/cawco/preview/browser-on-screen.svelte.js";
  import { BrowserPanel } from "#lib/cawco/preview/browser-panel.svelte.js";
  import { setPaneFleet } from "#lib/cawco/preview/pane-fleet.js";
  import { BROWSER_WORDS, browserKeyOf } from "#lib/cawco/preview/source.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconAlert } from "#lib/icons.js";
  import { page } from "$app/state";

  const id = $derived(page.params.id ?? "");
  let found = $state<{ instanceId: string } | null>(null);
  let problem = $state<string | null>(null);
  const session = new ArtifactSession();
  setPaneFleet(session);

  $effect(() => {
    const wanted = id;
    let live = true;
    found = null;
    problem = null;
    findArtifact(wanted)
      .then(async (artifact) => {
        if (artifact.kind !== "browser") {
          throw new Error(`${artifact.name} is no browser`);
        }
        if (!artifact.shown) {
          await showArtifact(artifact.instanceId, wanted);
        }
        if (live) {
          session.follow(artifact.instanceId, wanted);
          found = { instanceId: artifact.instanceId };
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = failureWords(error);
        }
      });
    return () => {
      live = false;
      session.end();
    };
  });

  /** The browser's key and machine, once the session's frame names them. */
  const place = $derived.by(() => {
    const instanceId = found?.instanceId;
    if (!instanceId) {
      return null;
    }
    const key = browserKeyOf(session.preview(instanceId)?.source);
    const machineId = session.session(instanceId)?.machineId;
    return key && machineId
      ? `${instanceId}\u0000${key}\u0000${machineId}`
      : null;
  });
  /** The view: one per browser, kept however often the session's frame comes again. */
  const panel = $derived.by(() => {
    const at = place;
    if (!at) {
      return null;
    }
    const [instanceId, key, machineId] = at.split("\u0000") as [
      string,
      BrowserKey,
      string,
    ];
    return untrack(
      () =>
        new BrowserPanel(
          { key, artifactId: id, instanceId, machineId },
          session
        )
    );
  });

  /*
   * The app's web view draws its own head (Take over, Sound): the page tells
   * it where the view stands (`cawco:browser`), once as it loads and on every
   * change, and takes from it Sound on or off (`cawco:browser-sound`) and
   * whether the app's own card of the open ask stands beside the page
   * (`cawco:browser-card`, `shown`; never told, none), whose reason the band
   * then leaves to it. Each comes as a window message of this page's own
   * origin.
   */
  interface AppBridge {
    webkit?: {
      messageHandlers?: {
        cawcoBrowser?: { postMessage: (message: string) => void };
      };
    };
  }
  /** What the app was told last: a change it would not see is not sent. */
  let lastTold = "";
  $effect(() => {
    if (!panel) {
      return;
    }
    const told = JSON.stringify({
      type: "cawco:browser",
      stream: panel.stream.kind,
      takeOverWaits: panel.takeOverWaits ?? null,
      sound: panel.soundOn,
      host: panel.row?.host ?? null,
    });
    if (told === lastTold) {
      return;
    }
    lastTold = told;
    (window as AppBridge).webkit?.messageHandlers?.cawcoBrowser?.postMessage(
      told
    );
  });
  /** The app's card of the open ask stands beside the page, as the app last said. */
  let appCard = $state(false);
  $effect(() => {
    const one = panel;
    if (!one) {
      return;
    }
    const heard = (event: MessageEvent) => {
      const data = event.data as {
        on?: unknown;
        shown?: unknown;
        type?: unknown;
      } | null;
      if (!(event.source === window && event.origin === location.origin)) {
        return;
      }
      if (data?.type === "cawco:browser-sound") {
        one.setSound(data.on === true);
      }
      if (data?.type === "cawco:browser-card") {
        appCard = data.shown === true;
      }
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  });
  // The app's card stands on screen as a web card would: the band sheds the reason.
  $effect(() => {
    const ask = panel?.ask;
    if (!(appCard && ask && found)) {
      return;
    }
    return cardOnScreen({
      instanceId: found.instanceId,
      requestId: ask.requestId,
    });
  });
</script>

<svelte:head
  ><title>{BROWSER_WORDS.title(panel?.row?.name || null)} · CawCo</title
  ></svelte:head
>

<Overlays>
  <div
    data-slot="browser-tab"
    class="flex h-dvh flex-col overflow-hidden bg-(--surface-page)"
  >
    {#if session.refused || problem}
      <div class="px-(--space-6)">
        <EmptyState icon={IconAlert} title="This browser didn't open">
          {#snippet line()}
            {session.refused ?? problem} Open it again from its session's panel.
          {/snippet}
          {#snippet action()}
            <Button
              href="/session"
              label="Back to the fleet"
              variant="outline"
            />
          {/snippet}
        </EmptyState>
      </div>
    {:else if panel}
      <BrowserView {panel} />
    {:else}
      <div aria-hidden="true" class="flex-1 bg-(--surface-recess)"></div>
    {/if}
  </div>
</Overlays>
