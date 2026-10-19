<script lang="ts">
  /**
   * A project's browser in the artifact panel (Projects spec §5.11, DESIGN.md
   * "Browser view"): under the panel's head, the 32px address band (the
   * page's origin, read before typing, and who drives), then the well, the
   * live page letterboxed on the recess. The container host's stream is
   * neko's WebRTC (neko-source.ts), the local host's the frames of one page
   * while the person holds it (cdp-source.ts); every state stands where the
   * page would, in WORDS.md's words.
   *
   * - **Held.** While the person has control the well's own edge takes
   *   `brand-solid` at 2px inside its box, as Comment and Draw do, and on a
   *   coarse pointer the band's Keyboard raises the soft keyboard.
   * - **Pinch.** On a touch screen two fingers scale the stream between 1
   *   and 3 inside the well and move it while scaled (a CSS transform on the
   *   stage; the input layers read the picture's drawn box, which the
   *   transform moves). One finger stays the page's: a tap is a click.
   * - **Motion.** The band and its chip are still; the first frame fades up
   *   over `--dur-fade`; a state's cover arrives as the pane's `down` does
   *   (`appear`) and leaves over `--dur-exit`; with reduced motion they
   *   appear and go.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import RelayJourney from "#lib/cawco/relay/RelayJourney.svelte";
  import {
    actOnRelayCard,
    relayEntry,
    setUpRelay,
    stepsHere,
  } from "#lib/cawco/relay/relay.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconAlert,
    IconGlobe,
    IconKeyboard,
    IconMoon,
    IconPageLock,
    IconPageUnlocked,
    IconRefresh,
  } from "#lib/icons.js";
  import { copyToClipboard } from "../copy";
  import { appear, dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import { askCardOnScreen, viewOnScreen } from "./browser-on-screen.svelte";
  import type { BrowserPanel } from "./browser-panel.svelte";
  import { CdpSource } from "./cdp-source";
  import { NekoSource } from "./neko-source";
  import { BROWSER_WORDS as words } from "./source";

  let {
    panel,
    onScreen = true,
  }: {
    panel: BrowserPanel;
    /** Its tab is in view: the stream is drawn only then. */
    onScreen?: boolean;
  } = $props();

  const coarse = new MediaQuery("pointer: coarse");

  /** The page is in view of a person: its tab shown and the document visible. */
  let visible = $state(true);
  $effect(() => {
    const seen = () => {
      visible = document.visibilityState === "visible";
    };
    seen();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  });
  const active = $derived(onScreen && visible);

  // The asks open for this browser, kept with their sessions as they open:
  // "asked by" names the one the person took.
  $effect(() => {
    panel.noteAskers();
  });

  // On screen while its tab is: an ask's card then sheds what the view owns.
  $effect(() => {
    if (!onScreen) {
      return;
    }
    const { artifactId, instanceId, key } = panel.place;
    return viewOnScreen({ artifactId, instanceId, key });
  });

  const phase = $derived(panel.phase);
  const host = $derived(panel.row?.host ?? null);
  const held = $derived(panel.held);
  const stream = $derived(panel.stream);
  const live = $derived(phase === "live");

  /*
   * The stream, one per browser host and generation, for as long as the
   * browser is live: neko's carries the agent's driving and the person's
   * alike; the local host's frames are the page in front, a picture alone
   * until the person holds it, then the take-over's with their input (a
   * new source as the hold changes).
   */
  let stage = $state<HTMLDivElement>();
  const streamKey = $derived.by(() => {
    if (!(live && active && host)) {
      return null;
    }
    return host === "local"
      ? `local:${held ? "held" : "watch"}:${panel.generation}`
      : `container:${panel.generation}`;
  });
  $effect(() => {
    const key = streamKey;
    const into = stage;
    if (!(key && into)) {
      return;
    }
    const { instanceId, artifactId } = panel.place;
    const base = `${location.origin}/ws/browser/${encodeURIComponent(instanceId)}/${encodeURIComponent(artifactId)}/`;
    const report = (status: typeof panel.stream) => {
      panel.stream = status;
    };
    const source =
      host === "local"
        ? new CdpSource(`${base.replace(HTTP, "ws")}cdp`, report, held)
        : new NekoSource(base, report, (session) => {
            panel.viewer = session;
          });
    // The box the source draws in: positioned inside the stage, which
    // neko's overlay letterboxes it within, and which a pinch transforms.
    const box = document.createElement("div");
    box.className = host === "local" ? "absolute inset-0" : "relative";
    into.append(box);
    const detach = source.attach(box);
    untrack(() => {
      panel.source = source;
      source.sound(panel.soundOn);
    });
    return () => {
      detach();
      source.close();
      box.remove();
      if (panel.source === source) {
        panel.source = null;
      }
      panel.viewer = null;
    };
  });
  const HTTP = /^http/;

  // This view's neko session, once known while the person holds the browser, is the one given control.
  $effect(() => {
    if (panel.viewer && held) {
      untrack(() => panel.giveControlHere());
    }
  });

  /** The first frame is drawn: the stage fades up, and stays up through a reconnect. */
  let drawn = $state(false);
  $effect(() => {
    if (streamKey === null) {
      drawn = false;
    }
  });
  $effect(() => {
    if (stream.kind === "live") {
      drawn = true;
    }
  });

  /* Pinch: two fingers scale the stage between 1 and 3 and move it. */
  let zoom = $state({ scale: 1, x: 0, y: 0 });
  let wellEl = $state<HTMLDivElement>();
  /** Keeps a scaled stage covering the well: never a gap at an edge. */
  const clampZoom = (next: { scale: number; x: number; y: number }) => {
    const box = wellEl;
    if (!box || next.scale <= 1) {
      return { scale: 1, x: 0, y: 0 };
    }
    const roomX = (box.clientWidth * (next.scale - 1)) / 2;
    const roomY = (box.clientHeight * (next.scale - 1)) / 2;
    return {
      scale: next.scale,
      x: Math.max(-roomX, Math.min(roomX, next.x)),
      y: Math.max(-roomY, Math.min(roomY, next.y)),
    };
  };
  const pinchable = (node: HTMLElement) => {
    let pinch: {
      distance: number;
      mid: { x: number; y: number };
      from: typeof zoom;
    } | null = null;
    const two = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return a && b
        ? {
            distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            mid: {
              x: (a.clientX + b.clientX) / 2,
              y: (a.clientY + b.clientY) / 2,
            },
          }
        : null;
    };
    const start = (event: TouchEvent) => {
      const at = two(event);
      if (!at) {
        return;
      }
      // Two fingers are the view's, never the page's.
      event.stopPropagation();
      event.preventDefault();
      pinch = { ...at, from: zoom };
    };
    const move = (event: TouchEvent) => {
      const at = pinch ? two(event) : null;
      if (!(pinch && at)) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      zoom = clampZoom({
        scale: Math.max(
          1,
          Math.min(3, (pinch.from.scale * at.distance) / pinch.distance)
        ),
        x: pinch.from.x + at.mid.x - pinch.mid.x,
        y: pinch.from.y + at.mid.y - pinch.mid.y,
      });
    };
    const end = (event: TouchEvent) => {
      if (pinch && event.touches.length < 2) {
        pinch = null;
        event.stopPropagation();
      }
    };
    const capture = { capture: true, passive: false } as const;
    node.addEventListener("touchstart", start, capture);
    node.addEventListener("touchmove", move, capture);
    node.addEventListener("touchend", end, capture);
    node.addEventListener("touchcancel", end, capture);
    return () => {
      node.removeEventListener("touchstart", start, capture);
      node.removeEventListener("touchmove", move, capture);
      node.removeEventListener("touchend", end, capture);
      node.removeEventListener("touchcancel", end, capture);
    };
  };
  // A new stream starts unscaled.
  $effect(() => {
    if (streamKey !== null) {
      untrack(() => {
        zoom = { scale: 1, x: 0, y: 0 };
      });
    }
  });

  /* Covers: in as the pane's `down` (appear), out over --dur-exit; with reduced motion they appear and go. */
  const coverIn = (node: Element) =>
    motionOk.current ? appear(node) : { duration: 0 };
  const coverOut = (_node: Element) => ({
    duration: motionOk.current ? dur("--dur-exit") : 0,
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  });

  /** What stands over the well now; null while the stream itself does. */
  const cover = $derived.by(() => {
    switch (phase) {
      case "reading":
        return null;
      case "away":
      case "asleep":
      case "starting":
      case "failed":
        return phase;
      default:
        switch (stream.kind) {
          case "idle":
            return "idle";
          case "lost":
            return "lost";
          case "unreached":
            return "unreached";
          case "unoffered":
            return "unoffered";
          case "reconnecting":
            return "reconnecting";
          default:
            return null;
        }
    }
  });

  /** The band's origin, its scheme read for the lock. */
  const origin = $derived(panel.origin);
  const plain = $derived(origin?.startsWith("http:") ?? false);
  const ask = $derived(panel.ask);
  /** The ask's card stands on screen too: the reason is its to say, not the band's. */
  const askCarded = $derived(ask ? askCardOnScreen(ask.requestId) : false);
  /** The ask's reason under the band: the view alone carries it, at every width. */
  const reason = $derived(
    ask?.browserAsk && !held && !askCarded ? ask.browserAsk.reason : null
  );

  /** The band's chip: who drives, or where the browser stands. */
  const chip = $derived.by(
    (): {
      words: string;
      short?: string;
      tone: "neutral" | "attn" | "held";
    } | null => {
      if (panel.acting === "handback") {
        return { words: words.chips.handingBack, tone: "held" };
      }
      switch (phase) {
        case "starting":
          return { words: words.chips.starting, tone: "neutral" };
        case "asleep":
          return { words: words.chips.asleep, tone: "neutral" };
        // The machine or its browser doesn't answer: each cover says which.
        case "away":
        case "failed":
          return { words: words.chips.notAnswering, tone: "neutral" };
        case "live":
          break;
        default:
          return null;
      }
      if (held) {
        return {
          words: words.chips.private,
          short: words.chips.privateShort,
          tone: "held",
        };
      }
      if (stream.kind === "reconnecting") {
        return { words: words.chips.reconnecting, tone: "neutral" };
      }
      if (
        stream.kind === "unreached" ||
        stream.kind === "unoffered" ||
        stream.kind === "lost"
      ) {
        return { words: words.chips.notConnected, tone: "neutral" };
      }
      if (ask) {
        // The one status that asks for a person: the needs-you pair.
        return { words: words.chips.needsYou, tone: "attn" };
      }
      return { words: words.chips.agent, tone: "neutral" };
    }
  );
  const viaRelay = $derived(
    !held && stream.kind === "live" && stream.viaRelay && !ask
  );
  const askedBy = $derived(held ? panel.askedBy : null);

  /** The local browser's meta line, under the band. */
  const localLine = $derived(host === "local" && live ? words.localLine : null);
  /** The install command, set in code under the line, with Copy. */
  const installCommand = $derived(localLine ? panel.install : null);

  /** The relay's entry, when this page came through a domain while no relay is live (relay.svelte.ts). */
  const entry = $derived(relayEntry());
  /** Set up relay pressed with no domain: the journey stands here. */
  let settingUp = $state(false);
  let setUpRefused = $state<string | null>(null);
  async function setUp(): Promise<void> {
    setUpRefused = null;
    try {
      await setUpRelay();
      settingUp = true;
    } catch (error) {
      setUpRefused = error instanceof Error ? error.message : String(error);
    }
  }

  const progress = $derived(
    panel.row?.progress && panel.row.progress.total > 0
      ? panel.row.progress
      : null
  );
  const failedLine = $derived(
    panel.row?.why ??
      `The browser on ${panel.machineName} isn't answering. It keeps its sign-ins and comes back by itself; Try again starts it now.`
  );
  /** Something went wrong the person should read: a refused act, or the row unread. */
  const problem = $derived(panel.refusal);
</script>

<div
  data-slot="browser-view"
  data-browser-phase={phase}
  data-browser-stream={stream.kind}
  data-held={held || undefined}
  class="@container/browser flex min-h-0 min-w-0 flex-1 flex-col"
>
  <!-- The band: the one thing between the head and the stream, in every
       state. The lock, the origin cut from its start, then the Keyboard
       (a held browser on a coarse pointer) and one chip. -->
  <div
    data-slot="browser-band"
    class="mark-line flex h-(--space-8) min-w-0 shrink-0 items-center gap-(--space-2) border-(--border-hairline) border-b bg-(--surface-raised) px-(--space-3)"
  >
    {#if plain}
      <IconPageUnlocked
        aria-label="Not secure"
        class="size-4 shrink-0 text-(--status-fail-ink)"
      />
    {:else}
      <IconPageLock
        aria-hidden="true"
        class="size-4 shrink-0 text-(--ink-muted)"
      />
    {/if}
    <!-- Cut from its start, so the host's end (what a person checks) stays. -->
    <span
      data-slot="browser-origin"
      data-box
      class={[
        "min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-left [direction:rtl] [font:var(--type-code)]",
        origin ? "text-(--ink-strong)" : "text-(--ink-muted)",
      ]}
      title={origin ?? undefined}
      ><bdi dir="ltr">{origin ?? words.noPage}</bdi></span
    >
    {#if held && coarse.current && live}
      <Button
        data-slot="browser-keyboard"
        data-box
        class="shrink-0"
        icon={IconKeyboard}
        label={words.keyboard}
        onclick={() => panel.source?.keyboard()}
        size="sm"
        title={words.keyboardTitle}
        variant="ghost"
      />
    {/if}
    {#if viaRelay}
      <span
        data-slot="browser-via"
        class="shrink-0 whitespace-nowrap text-(--ink-muted) text-meta @max-md/browser:hidden"
        >{words.chips.viaRelay}</span
      >
    {/if}
    {#if chip}
      <Badge
        data-slot="browser-chip"
        data-box
        data-tone={chip.tone}
        class={[
          "max-w-[60%] shrink-0",
          chip.tone === "held" &&
            "border border-(--brand-solid) bg-transparent text-(--selected-ink)",
        ]}
        variant={chip.tone === "attn" ? "attn" : "default"}
      >
        {#if chip.short}
          <span class="@max-md/browser:hidden">{chip.words}</span>
          <span class="hidden @max-md/browser:inline">{chip.short}</span>
        {:else}
          <span>{chip.words}</span>
        {/if}
        {#if askedBy}
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap @max-md/browser:hidden"
            title={words.chips.askedBy(askedBy)}
            >· {words.chips.askedBy(askedBy)}</span
          >
        {/if}
      </Badge>
    {/if}
  </div>

  <!-- What the band names past its room, only with a line to show: the
       local browser's one page, and an open ask's reason while no card of
       it is on screen to say it. -->
  {#if localLine || reason}
    <div
      data-slot="browser-lines"
      class="flex shrink-0 flex-col gap-(--space-1) border-(--border-hairline) border-b bg-(--surface-raised) px-(--space-3) py-(--space-1) text-(--ink-muted) text-meta [overflow-wrap:anywhere]"
      {@attach morph()}
    >
      {#if reason}
        <p data-slot="browser-reason" class="m-0 text-pretty">{reason}</p>
      {/if}
      {#if localLine}
        <p data-slot="browser-local" class="m-0 text-pretty">{localLine}</p>
        {#if installCommand}
          <!-- The command on a line of its own, read whole before it is
               copied: it wraps in its own run (at its spaces, then
               anywhere), on its lead's first line, Copy at the end. -->
          <div
            data-slot="browser-install"
            class="flex min-w-0 items-baseline gap-(--space-2)"
          >
            <span class="shrink-0">{words.installLead}</span>
            <code
              data-slot="browser-install-command"
              class="min-w-0 flex-1 whitespace-normal text-(--ink-strong) [font:var(--type-code)] [overflow-wrap:anywhere]"
              data-box>{installCommand}</code
            >
            <Button
              class="shrink-0"
              label={words.copy}
              onclick={() => copyToClipboard(words.copyWhat, installCommand)}
              size="xs"
              variant="ghost"
            />
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- The well: the stream on the recess, its edge brand-solid while the person holds it. -->
  <div
    data-slot="browser-well"
    data-held={held || undefined}
    class="relative min-h-0 flex-1 overflow-hidden bg-(--surface-recess)"
    bind:this={wellEl}
    {@attach pinchable}
  >
    <div
      data-slot="browser-stage"
      class={[
        "absolute inset-0 origin-center transition-opacity duration-(--dur-fade) ease-(--ease-out)",
        drawn ? "opacity-100" : "opacity-0",
      ]}
      style:transform={zoom.scale > 1
        ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
        : undefined}
      bind:this={stage}
    ></div>

    {#if cover === "reconnecting"}
      <!-- The last frame dimmed, as the pane dims a page that dropped. -->
      <div
        data-slot="browser-cover"
        data-cover="reconnecting"
        class="absolute inset-0 grid place-items-center bg-(--scrim) p-(--space-5)"
        role="status"
        in:coverIn
        out:coverOut
      >
        <p
          class="m-0 rounded-md bg-(--surface-raised) px-(--space-3) py-(--space-2) text-(--ink-strong) text-body"
        >
          {words.dropped}
        </p>
      </div>
    {:else if cover === "starting"}
      <!-- A skeleton at the well's size, with what the machine is doing under it. -->
      <div
        data-slot="browser-cover"
        data-cover="starting"
        class="absolute inset-0 flex flex-col gap-(--space-3) p-(--space-5)"
        role="status"
        in:coverIn
        out:coverOut
      >
        <div class="kit-skeleton min-h-0 flex-1 rounded-lg"></div>
        {#if progress}
          <div
            class="h-0.5 overflow-hidden rounded-full bg-(--surface-fill)"
            aria-hidden="true"
          >
            <div
              class="h-full bg-(--brand-solid)"
              style:inline-size={`${Math.min(100, (progress.done / progress.total) * 100)}%`}
            ></div>
          </div>
        {/if}
        <p class="m-0 text-(--ink-muted) text-meta">
          {progress
            ? words.startingImage(
                panel.row?.state === "building",
                progress.done,
                progress.total
              )
            : words.startingBrowser}
        </p>
      </div>
    {:else if cover}
      <div
        data-slot="browser-cover"
        data-cover={cover}
        class="absolute inset-0 overflow-auto bg-(--surface-well) px-(--space-6)"
        role={cover === "idle" ? "status" : "alert"}
        in:coverIn
        out:coverOut
      >
        {#if cover === "asleep"}
          <EmptyState
            icon={IconMoon}
            line={words.asleepLine}
            title={words.asleepTitle}
          >
            {#snippet action()}
              <Button
                label={words.startBrowser}
                onclick={() => panel.start()}
                pending={panel.acting === "start"}
                pendingLabel={words.startingButton}
                size="sm"
                variant="outline"
              />
            {/snippet}
          </EmptyState>
        {:else if cover === "failed"}
          <EmptyState
            icon={IconAlert}
            line={failedLine}
            title={words.failedTitle}
          >
            {#snippet action()}
              <Button
                icon={IconRefresh}
                label={words.tryAgain}
                onclick={() => panel.start()}
                pending={panel.acting === "start"}
                pendingLabel={words.tryingAgain}
                size="sm"
                variant="outline"
              />
            {/snippet}
          </EmptyState>
        {:else if cover === "away"}
          <EmptyState
            icon={IconAlert}
            line={words.awayLine(panel.machineName)}
            title={words.awayTitle(panel.machineName)}
          />
        {:else if cover === "lost"}
          <EmptyState
            icon={IconAlert}
            line={words.lostLine(panel.machineName)}
            title={words.lostTitle}
          >
            {#snippet action()}
              <Button
                icon={IconRefresh}
                label={words.reconnect}
                onclick={() => panel.restream()}
                size="sm"
                variant="outline"
              />
            {/snippet}
          </EmptyState>
        {:else if cover === "unoffered"}
          <EmptyState
            icon={IconAlert}
            line={words.unofferedLine(panel.machineName)}
            title={words.unofferedTitle}
          >
            {#snippet action()}
              <Button
                icon={IconRefresh}
                label={words.reconnect}
                onclick={() => panel.restream()}
                size="sm"
                variant="outline"
              />
            {/snippet}
          </EmptyState>
        {:else if cover === "idle"}
          <EmptyState
            icon={IconGlobe}
            line={words.localIdleLine}
            title={words.localIdleTitle}
          />
        {:else if cover === "unreached" && stream.kind === "unreached"}
          {@const relay = stream.relay}
          <EmptyState icon={IconAlert} title={words.unreachedTitle}>
            {#snippet line()}
              {#if relay}
                {words.unreachedRelayLine(relay)}
              {:else if !(entry.show && entry.domain)}
                {words.unreachedLine(panel.machineName)}
              {/if}
            {/snippet}
            {#snippet action()}
              <div
                class="flex flex-col items-start gap-(--space-3)"
                {@attach morph()}
              >
                {#if !relay && entry.show && entry.domain}
                  <!-- Reached through a domain with no relay live: the relay's own entry, its Set up unfolding the journey here. -->
                  <RelayJourney
                    domain={entry.domain}
                    machine={cawco.relayJourney?.machine ?? null}
                    onact={actOnRelayCard}
                    steps={stepsHere(cawco.relayJourney?.steps ?? [])}
                    view="entry"
                  />
                {:else if !relay && settingUp && cawco.relayJourney}
                  <RelayJourney
                    candidates={cawco.relayJourney.candidates}
                    machine={cawco.relayJourney.machine}
                    onact={actOnRelayCard}
                    steps={stepsHere(cawco.relayJourney.steps)}
                    view="journey"
                  />
                {/if}
                <div class="flex flex-wrap items-center gap-(--space-2)">
                  <Button
                    icon={IconRefresh}
                    label={words.tryAgain}
                    onclick={() => panel.restream()}
                    size="sm"
                    variant="outline"
                  />
                  {#if !(relay || entry.show || settingUp)}
                    <Button
                      data-slot="browser-set-up-relay"
                      label={words.setUpRelay}
                      onclick={setUp}
                      size="sm"
                      variant="secondary"
                    />
                  {/if}
                </div>
                {#if setUpRefused}
                  <p
                    class="m-0 text-(--status-fail-ink) text-meta"
                    role="alert"
                  >
                    {setUpRefused}
                  </p>
                {/if}
              </div>
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}

    {#if problem}
      <!-- What went wrong, over the foot of the well, as the pane's failure band. -->
      <div
        data-slot="browser-problem"
        class="absolute inset-x-0 bottom-0 border-(--border-hairline) border-t bg-(--surface-raised) px-(--space-3) py-(--space-2)"
        role="alert"
        in:coverIn
        out:coverOut
      >
        <p
          class="m-0 text-(--data-bad) text-body text-pretty [overflow-wrap:anywhere]"
        >
          {problem}
        </p>
      </div>
    {/if}

    <!-- The held edge: brand-solid, 2px inside the well, above the stream,
         its frames and every cover on all four sides, taking no press. -->
    <div
      aria-hidden="true"
      data-held={held || undefined}
      data-slot="browser-edge"
      class="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_var(--focus-ring-width)_transparent] transition-[box-shadow] duration-(--dur-control) ease-(--ease-in-out) data-held:shadow-[inset_0_0_0_var(--focus-ring-width)_var(--brand-solid)]"
    ></div>
  </div>
</div>
