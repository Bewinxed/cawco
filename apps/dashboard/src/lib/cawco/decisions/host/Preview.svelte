<!--
  Another artifact of the session's, live in a frame. A page stands at its
  own address on this page's origin (`/__cawco/page/<id>/`), as tall as its
  content up to most of the window: an animated mockup in HTML, say. A dev
  server's preview or a sheet stands on an origin of its own the hub opened
  for it (hub server.ts `embedAt`), named in the page's media, at the shape
  of a screen. A component canvas draws the stories its `stories` names (every
  one when it names none) as the component alone, at their own size, and
  says how tall it stands, so its frame is as tall as it; the canvas's own
  runtime centres each story at its own size, scales one wider than the
  frame to fit it and scrolls one too wide at its words' floor sideways
  under the house edge fade (runtime.ts `fitToEmbed`). Each stands in its
  well. While the origin is asked, the frame's place holds a skeleton at a
  screen's shape, and once the wait outlasts its grace Caw and its line stand
  over it (DESIGN.md, The Claim Of Nothing Rule, The Real Wait Rule). One the
  hub no longer holds says so in words where it would stand.
-->
<script lang="ts">
  import { CANVAS_EMBED_SIZE, canvasEmbedUrl } from "@cawco/core/stage";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-working.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-working.webp";
  import { dur } from "../../motion/curves.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    artifact: unknown;
    caption?: unknown;
    stories?: unknown;
  }> = $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  const stories = $derived(
    Array.isArray(props.stories) ? props.stories.map(String) : []
  );
  let frame = $state<HTMLIFrameElement>();
  let tall = $state<number | null>(null);
  let watch: FrameObserver | undefined;

  /** A component canvas's own height, as it says it (agent canvas runtime `by=embed`): its frame is as tall. */
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const said = event.data as { height?: unknown; type?: unknown } | null;
      if (
        event.source === frame?.contentWindow &&
        said?.type === CANVAS_EMBED_SIZE &&
        typeof said.height === "number"
      ) {
        tall = said.height;
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
  });

  function sized() {
    watch?.disconnect();
    let root: HTMLElement | undefined;
    try {
      root = frame?.contentDocument?.documentElement;
    } catch {
      // Another origin's document: its own height is not this page's to read.
      return;
    }
    if (!root) {
      return;
    }
    const measure = () => {
      tall = root.scrollHeight;
    };
    // Read now, and a change in the next frame (frameObserver): the frame
    // takes its height from it, which lays its document out again.
    measure();
    watch = frameObserver(measure);
    watch.observe(root);
  }
  $effect(() => () => watch?.disconnect());

  /**
   * How often, and how many times, an embed's origin is asked whether it
   * serves yet: once a second for 30 seconds. Our call: long enough for a
   * dev server's cold start, short enough that a dead one is said.
   */
  const PING_MS = 1000;
  const PINGS = 30;
  /** `--dur-wait-grace` in ms, in the unit host.css writes it (motion `dur`: its minifier writes `1000ms` as `1s`): a wait shows nothing before it (DESIGN.md, The Real Wait Rule). */
  const grace = () => dur("--dur-wait-grace");
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  let waited = $state(false);
  /** The wait has outlasted `--dur-wait-grace`: its line may show. */
  let slow = $state(false);
  $effect(() => {
    const embed = held?.embed;
    ready = null;
    waited = false;
    slow = false;
    if (!embed) {
      return;
    }
    const address =
      held?.kind === "component" ? canvasEmbedUrl(embed, stories) : embed;
    let gone = false;
    const after = setTimeout(() => {
      slow = true;
    }, grace());
    const ping = new URL("/__cawco/ping", embed).href;
    (async () => {
      for (let tries = 0; tries < PINGS && !gone; tries += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one ask a second until the origin serves, never several at once
        const ok = await fetch(ping, { cache: "no-store" }).then(
          (answer) => answer.ok,
          () => false
        );
        if (ok) {
          if (!gone) {
            ready = address;
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, PING_MS));
      }
      if (!gone) {
        waited = true;
      }
    })();
    return () => {
      gone = true;
      clearTimeout(after);
    };
  });

  /** What the embed's status says: nothing until the wait outlasts its grace, nothing once it serves. */
  const waitLine = $derived.by(() => {
    if (!held?.embed || ready || !slow) {
      return "";
    }
    return waited
      ? `The ${held.kind} ${held.name} isn't answering; reload the page once it runs.`
      : `Opening the ${held.kind} ${held.name}…`;
  });
</script>

<Well caption={props.caption ? String(props.caption) : undefined}>
  {#if held?.kind === "page"}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it. -->
    <iframe
      bind:this={frame}
      class={[
        "block max-h-c-media-max-h w-full rounded-xs border-0 bg-surface-page",
        tall === null && "aspect-16/10",
      ]}
      data-slot="embed"
      onload={sized}
      src={`/__cawco/page/${id}/`}
      style:block-size={tall === null ? undefined : `${tall}px`}
      title={held.name}
    ></iframe>
  {:else if held?.embed}
    <!-- One box for the frame and its wait: the frame once its origin serves, else the skeleton at a screen's shape, past the wait a screen's room; the live region stands over it from the start, its words only once the wait has lasted. -->
    <div class="relative w-full">
      {#if ready}
        <!-- A screen keeps its 16:10 under the cap; a component canvas that said its height is as tall as its frames, and the page scrolls past it. -->
        <iframe
          bind:this={frame}
          class={[
            "block w-full rounded-xs border-0 bg-surface-page",
            tall === null && "aspect-16/10 max-h-c-media-max-h",
          ]}
          data-shape={tall === null ? "screen" : "drawn"}
          data-slot="embed"
          src={ready}
          style:block-size={tall === null ? undefined : `${tall}px`}
          title={held.name}
        ></iframe>
      {:else if waited}
        <div class="aspect-16/10 w-full"></div>
      {:else}
        <Skeleton class="w-full" height="picture" />
      {/if}
      <!-- mark-line: Caw stands over the wait's line, in a column; no mark beside words -->
      <div
        class="pointer-events-none absolute inset-0 grid content-center justify-items-center gap-space-2"
      >
        {#if slow && !waited && !ready}
          <img
            alt=""
            height="40"
            src={scheme.now === "dark" ? cawDark : cawLight}
            width="40"
          />
        {/if}
        <p
          class="type-meta text-center text-ink-muted wrap-anywhere"
          role="status"
        >
          {waitLine}
        </p>
      </div>
    </div>
  {:else}
    <p
      data-slot="media-gone"
      class="type-meta grid aspect-16/10 w-full place-items-center text-center text-ink-muted wrap-anywhere"
    >
      {held
        ? `The ${held.kind} this card shows can't be opened here now.`
        : "What this card showed is gone."}
    </p>
  {/if}
</Well>
