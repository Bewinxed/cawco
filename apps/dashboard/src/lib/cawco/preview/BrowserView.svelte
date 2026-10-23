<script lang="ts">
  /**
   * A browser artifact in the panel (Projects spec §5.11, "The view"): under
   * the head, an address band with the page's origin and who has control
   * (the Private chip while you do, the local browser's line on a machine
   * with no container runtime); the well is the browser's stream, drawn
   * here from the hub's socket (browser-stream.ts), never a page of its own.
   * No comments and no ink: nothing the person sees here reaches an agent
   * (§5.11, "Private").
   *
   * The well's states: starting (the browser woken, its image built), live
   * (the agent driving, the person watching), you have control (the
   * person's pointer, keys and paste go to the browser), and each failure in
   * the error formula with its way out: the machine away, the browser that
   * didn't start, the view's link lost or refused, the stream that found no
   * way here (the stream relay's settings), a codec this browser can't play.
   */
  import { browserWords, commonWords, shellWords } from "@cawco/core";
  import type { ListedBrowser } from "@cawco/core/browser";
  import { untrack } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconAlert, IconGlobe, IconLock, IconRefresh } from "#lib/icons.js";
  import { newId } from "../id";
  import { appear } from "../motion/curves.svelte";
  import OriginText from "../OriginText.svelte";
  import { store, stored } from "../storage";
  import { startFromPanel, takeOverFromPanel } from "./browser-acts";
  import {
    type BrowserStream,
    cdpStream,
    nekoStream,
    type StreamState,
    streamUrl,
  } from "./browser-stream";

  let {
    instanceId,
    artifactId,
    browser,
    machine,
  }: {
    instanceId: string;
    artifactId: string;
    /** The browser as the hub lists it; null until its machine reported it. */
    browser: ListedBrowser | null;
    /** The session's machine: its name, and whether the hub reaches it. */
    machine: { machineId: string; name: string; online: boolean };
  } = $props();

  const detailsId = $props.id();

  /** The view's name for itself on the hub (its `?token`): one neko session per tab and artifact, kept through a reload. */
  const viewer = $derived.by(() => {
    const storeKey = `cawco-browser-viewer:${artifactId}`;
    return untrack(() => {
      const kept = stored("session", storeKey);
      if (kept) {
        return kept;
      }
      const made = newId();
      store("session", storeKey, made);
      return made;
    });
  });

  /** What each host streams: neko's video, or the local browser's frames. */
  const STREAM_OF = { container: "video", local: "frames" } as const;

  const mine = $derived(!!browser?.takeover);
  const host = $derived(browser?.host ?? null);
  const live = $derived(browser?.state === "live" && machine.online);

  let stream: BrowserStream | null = null;
  let streamState = $state<StreamState>({ kind: "connecting" });
  /** neko's session for this view, once introduced: the shield gives it control. */
  let session = $state<string | null>(null);
  /** Each press of a failure's Try again opens the stream again. */
  let again = $state(0);
  let video = $state<HTMLVideoElement>();
  let canvas = $state<HTMLCanvasElement>();
  let well = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  let details = $state(false);
  /** A start or a control hand-off the hub refused, in its words. */
  let refusal = $state<string | null>(null);
  let starting = $state(false);

  /** The well's frames, counted on its element for whoever reads the engine (the probe kit). */
  function counted(width: number, height: number) {
    if (!well) {
      return;
    }
    well.dataset.frames = String(Number(well.dataset.frames ?? 0) + 1);
    well.dataset.width = String(width);
    well.dataset.height = String(height);
  }

  // The stream, while the browser is live: neko's on the container host,
  // the local browser's frames on the local host.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — each press opens it again
    void again;
    const kind = host;
    const media = kind === "container" ? video : canvas;
    if (!(live && kind && media)) {
      return;
    }
    const events = {
      state: (next: StreamState) => {
        streamState = next;
      },
      session: (id: string | null) => {
        session = id;
      },
    };
    const opened = untrack(() =>
      kind === "container"
        ? nekoStream(
            streamUrl(instanceId, artifactId, "api", viewer),
            media as HTMLVideoElement,
            events
          )
        : cdpStream(
            streamUrl(instanceId, artifactId, "cdp", viewer),
            media as HTMLCanvasElement,
            events,
            counted
          )
    );
    stream = opened;
    return () => {
      opened.close();
      if (stream === opened) {
        stream = null;
      }
      session = null;
      streamState = { kind: "connecting" };
    };
  });

  // The video's frames, counted as they are presented.
  $effect(() => {
    const playing = video;
    if (!(playing && host === "container")) {
      return;
    }
    let handle = 0;
    const presented = () => {
      handle = playing.requestVideoFrameCallback((_now, frame) => {
        counted(frame.width, frame.height);
        presented();
      });
    };
    presented();
    return () => playing.cancelVideoFrameCallback(handle);
  });

  // While the person holds the browser, control goes to this view's neko
  // session, once per take-over and session (the hub's /takeover sent
  // again with `viewer`, agent shield.ts `control/give`).
  let gaveTo = "";
  $effect(() => {
    const held = browser?.takeover;
    const own = session;
    if (!(held && own && host === "container" && browser)) {
      return;
    }
    const mark = `${held.since}:${own}`;
    if (gaveTo === mark) {
      return;
    }
    gaveTo = mark;
    const { key: browserKey } = browser;
    untrack(() =>
      takeOverFromPanel(browserKey, {
        instanceId,
        machineId: machine.machineId,
        viewer: own,
      }).then((why) => {
        refusal = why ? browserWords.cantTakeOver(why) : null;
      })
    );
  });

  // The person opened it asleep: it starts (§5.11, "or when the person opens it").
  let wokeFor = "";
  $effect(() => {
    if (
      !(browser?.state === "asleep" && machine.online) ||
      wokeFor === browser.key
    ) {
      return;
    }
    wokeFor = browser.key;
    untrack(() => start());
  });

  async function start() {
    if (!browser) {
      return;
    }
    starting = true;
    const why = await startFromPanel(browser.key, machine.machineId);
    starting = false;
    refusal = why;
  }

  function tryAgain() {
    details = false;
    refusal = null;
    if (browser?.state === "failed") {
      start();
      return;
    }
    again += 1;
  }

  /** A point on the well in the stream's own pixels, the picture letterboxed in the well. */
  function at(event: { clientX: number; clientY: number }) {
    const size = stream?.size();
    const box = layer?.getBoundingClientRect();
    if (!(size && box && box.width > 0 && box.height > 0)) {
      return null;
    }
    const scale = Math.min(box.width / size.width, box.height / size.height);
    const left = box.left + (box.width - size.width * scale) / 2;
    const top = box.top + (box.height - size.height * scale) / 2;
    const clamp = (value: number, most: number) =>
      Math.max(0, Math.min(Math.round(value), most));
    return {
      x: clamp((event.clientX - left) / scale, size.width),
      y: clamp((event.clientY - top) / scale, size.height),
    };
  }

  /** Input goes to the browser only while the person holds it and the stream stands. */
  const driving = $derived(mine && streamState.kind === "live");

  function pointer(event: PointerEvent, phase: "down" | "move" | "up") {
    if (!(driving && stream)) {
      return;
    }
    const point = at(event);
    if (!point) {
      return;
    }
    if (phase === "move") {
      stream.move(point.x, point.y);
      return;
    }
    if (phase === "down") {
      layer?.focus();
      layer?.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    stream.button(point.x, point.y, event.button, phase === "down");
  }

  function wheel(event: WheelEvent) {
    if (!(driving && stream)) {
      return;
    }
    const point = at(event);
    if (point) {
      event.preventDefault();
      stream.wheel(point.x, point.y, event);
    }
  }

  function key(event: KeyboardEvent, down: boolean) {
    if (!(driving && stream)) {
      return;
    }
    // Every key is the browser's while the person drives it: none reaches
    // the pane's or the app's shortcuts. Ctrl+V stays the browser's own, so
    // its paste event carries the person's text.
    event.stopPropagation();
    const pasting =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
    if (!pasting) {
      event.preventDefault();
    }
    stream.key(event, down);
  }

  function paste(event: ClipboardEvent) {
    if (!(driving && stream)) {
      return;
    }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    if (text) {
      stream.paste(text);
    }
  }

  /** What the well says when it shows no stream: a wait, or a failure with its way out. */
  const shown = $derived.by(
    ():
      | { kind: "wait"; line: string }
      | {
          kind: "fail";
          title: string;
          line: string;
          details?: string;
          relay?: boolean;
          again: boolean;
        }
      | null => {
      if (!machine.online) {
        return {
          kind: "fail",
          title: browserWords.awayTitle(machine.name),
          line: browserWords.awayLine(machine.name),
          again: false,
        };
      }
      if (browser?.state === "failed") {
        return {
          kind: "fail",
          title: browserWords.failedTitle,
          line: browserWords.failedLine(machine.name),
          ...(browser.why ? { details: browser.why } : {}),
          again: true,
        };
      }
      if (!live) {
        const progress = browser?.progress;
        return {
          kind: "wait",
          line: progress
            ? browserWords.building(progress.done, progress.total)
            : browserWords.starting,
        };
      }
      switch (streamState.kind) {
        case "connecting":
          return { kind: "wait", line: browserWords.connecting };
        case "lost":
          return {
            kind: "fail",
            title: browserWords.lostTitle,
            line: browserWords.lostLine,
            details: streamState.why,
            again: true,
          };
        case "refused":
          return {
            kind: "fail",
            title: browserWords.refusedTitle,
            line: streamState.why,
            again: true,
          };
        case "no-stream":
          return {
            kind: "fail",
            title: browserWords.noStreamTitle,
            line: browserWords.noStreamLine(machine.name),
            relay: true,
            again: true,
          };
        case "no-codec":
          return {
            kind: "fail",
            title: browserWords.noCodecTitle,
            line: browserWords.noCodecLine(streamState.codec),
            again: false,
          };
        case "live":
          return null;
        default:
          return null;
      }
    }
  );
</script>

<section
  aria-label={browserWords.view}
  class="absolute inset-0 flex flex-col min-h-0 bg-surface-well"
  data-browser-host={host ?? undefined}
  data-browser-mine={mine || undefined}
  data-slot="browser-view"
>
  <!-- The address band: the page in front and who has control. -->
  <div
    class="flex flex-none flex-wrap items-center gap-x-space-2 gap-y-space-1 min-w-0 px-space-3 py-space-2 border-b border-border-hairline bg-surface-raised type-meta"
    data-slot="browser-band"
  >
    <span
      class="mark-line flex flex-1 items-center gap-space-1 min-w-0 text-ink-strong"
    >
      <span class="mark-cell flex-none text-ink-muted">
        {#if mine}<IconLock />{:else}<IconGlobe />{/if}
      </span>
      <span class="min-w-0 wrap-anywhere" data-slot="browser-origin">
        {#if browser?.origin}<OriginText
            origin={browser.origin}
          />{:else}{browserWords.noPage}{/if}
      </span>
    </span>
    <span
      class="flex flex-none items-center gap-space-2 text-ink-muted"
      data-slot="browser-control"
    >
      {mine ? browserWords.youHaveControl : browserWords.agentDriving}
      {#if mine}
        <Badge data-slot="browser-private"
          ><IconLock /><span>{browserWords.private}</span></Badge
        >
      {/if}
    </span>
    {#if host === "local"}
      <p
        class="basis-full m-0 text-ink-muted text-pretty"
        data-slot="browser-local"
      >
        {browserWords.localLine}
      </p>
    {/if}
  </div>
  <div
    bind:this={well}
    class="relative flex-1 min-h-0 overflow-hidden bg-surface-recess"
    data-slot="browser-well"
    data-stream={host ? STREAM_OF[host] : undefined}
    data-stream-state={live ? streamState.kind : (browser?.state ?? "unknown")}
  >
    {#if host === "container"}
      <video
        bind:this={video}
        class="absolute inset-0 size-full object-contain pointer-events-none"
        data-slot="browser-video"
        disablepictureinpicture
        muted
        playsinline
      ></video>
    {:else if host === "local"}
      <canvas
        bind:this={canvas}
        class="absolute inset-0 size-full object-contain pointer-events-none"
        data-slot="browser-frames"
      ></canvas>
    {/if}
    <!-- The person's input while they hold the browser; the agent's page is only watched otherwise. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- the remote browser is one application widget (WAI-ARIA `application`): it takes the focus, every key, the pointer and paste while the person drives it. -->
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the remote browser is one application widget, its keys, pointer and paste the person's while they drive it. -->
    <div
      bind:this={layer}
      aria-label={browserWords.view}
      class="absolute inset-0 outline-none data-driving:touch-none data-driving:cursor-default"
      data-driving={driving || undefined}
      data-slot="browser-input"
      oncontextmenu={(event) => {
        if (driving) {
          event.preventDefault();
        }
      }}
      onkeydown={(event) => key(event, true)}
      onkeyup={(event) => key(event, false)}
      onpaste={paste}
      onpointerdown={(event) => pointer(event, "down")}
      onpointermove={(event) => pointer(event, "move")}
      onpointerup={(event) => pointer(event, "up")}
      {@attach (node) => {
        // Not passive: a wheel the browser takes doesn't scroll the panel.
        node.addEventListener("wheel", wheel, { passive: false });
        return () => node.removeEventListener("wheel", wheel);
      }}
      role="application"
      tabindex={driving ? 0 : -1}
    ></div>
    {#if shown?.kind === "wait"}
      <p
        class="mark-line absolute inset-x-0 top-0 m-0 flex items-start gap-space-2 p-space-5 text-ink-muted type-meta animate-wait-grace-in"
        data-slot="browser-wait"
        role="status"
      >
        <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
          >{shown.line}</span
        >
      </p>
    {:else if shown?.kind === "fail"}
      {@const failed = shown}
      <div
        class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
        data-slot="browser-down"
        role="alert"
        transition:appear
      >
        <EmptyState icon={IconAlert} title={failed.title}>
          {#snippet line()}
            {failed.line}
          {/snippet}
          {#snippet action()}
            <div class="flex flex-wrap items-center gap-space-2">
              {#if failed.again}
                <Button
                  icon={IconRefresh}
                  label={commonWords.tryAgain}
                  onclick={tryAgain}
                  pending={starting}
                  pendingLabel={browserWords.tryingAgain}
                  size="sm"
                  variant="outline"
                />
              {/if}
              {#if failed.relay}
                <Button
                  href="/config/browsers"
                  label={browserWords.relaySettings}
                  pad="none"
                  size="sm"
                  variant="link"
                />
              {/if}
              {#if failed.details}
                <Button
                  aria-controls={detailsId}
                  aria-expanded={details}
                  data-details
                  label={details
                    ? shellWords.hideDetails
                    : shellWords.showDetails}
                  onclick={() => {
                    details = !details;
                  }}
                  size="sm"
                  variant="ghost"
                />
              {/if}
            </div>
            {#if failed.details && details}
              <p
                class="mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
                data-slot="details"
                id={detailsId}
              >
                {failed.details}
              </p>
            {/if}
          {/snippet}
        </EmptyState>
      </div>
    {/if}
    {#if refusal}
      <p
        class="absolute inset-x-0 bottom-0 m-0 px-space-3 py-space-2 border-t border-border-hairline bg-surface-raised text-data-bad text-size-body text-pretty wrap-anywhere"
        data-slot="browser-refusal"
        role="alert"
      >
        {refusal}
      </p>
    {/if}
  </div>
</section>
