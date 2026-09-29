<script lang="ts">
  /**
   * The delegate tray: one compact chip per delegate this session has working,
   * in a row standing on the composer, so the reader scrolled far from a
   * delegate's card still sees what it is doing. A chip enters the first time
   * its card leaves the view (tray.svelte.ts), shows what the delegate is
   * doing in words and one mark, opens a panel with the detail on hover or
   * press, and leaves on its own once the work is done. Failed work stays
   * until it is dismissed, on every screen at once.
   */
  import type { WorkItemSummary } from "@whiffle/core";
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import {
    IconAsk,
    IconStop,
    IconSuccess,
    IconWarningTriangle,
  } from "$lib/icons";
  import { dismissWorkItem, whiffle } from "../client.svelte";
  import { askDetailOf, askShortOf } from "../frames";
  import { conversationHref } from "../links";
  import { markHue, sessionSprite } from "../mark";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { land } from "../motion/share.svelte";
  import {
    admit,
    cardVisible,
    type Entry,
    entered,
    flightKey,
    left,
    trayNews,
  } from "./tray.svelte";

  let {
    parentId,
    held = false,
  }: {
    /** The session whose own delegates the tray shows. */
    parentId: string;
    /** A swipe is carrying the conversation: the chips wait. */
    held?: boolean;
  } = $props();

  /** How long a finished chip stays on screen, counted only while it is seen. */
  const HOLD = 6000;
  /** How long a new delegate's card has to come on screen before its chip simply appears. */
  const SETTLE = 1500;
  /** One chip's width and the gap after it, for the overflow count; the "+N" chip and its gap. */
  const CHIP = 120;
  const GAP = 7;
  const MORE = 59;

  type Tone = "running" | "asked" | "needs" | "done" | "cancelled" | "failed";
  interface Chip {
    entry: Entry;
    item: WorkItemSummary;
    /** The pending question: the delegate's own (needs you), or the one it put to this session. */
    question: string;
    questions: number;
    step: string;
    tone: Tone;
  }

  const panelId = $props.id();
  /** Delegates that existed before this tray: their chips are simply there. */
  const mountedAt = Date.now();

  const items = $derived(whiffle.workItemsOf(parentId));

  const toChip = (item: WorkItemSummary): Chip => {
    const pending = whiffle.session(item.instanceId)?.pending ?? [];
    const own = pending.filter((each) => !each.routedTo);
    const routed = pending.filter((each) => each.routedTo === "parent");
    const live = item.state === "starting" || item.state === "running";
    let tone: Tone;
    if (item.state === "failed") {
      tone = "failed";
    } else if (item.state === "cancelled") {
      tone = "cancelled";
    } else if (item.state === "done") {
      tone = "done";
    } else if (own.length > 0) {
      tone = "needs";
    } else if (routed.length > 0) {
      tone = "asked";
    } else {
      tone = "running";
    }
    const asking = own[0] ?? routed[0];
    const tool = live ? whiffle.currentToolOf(item.instanceId) : null;
    return {
      item,
      tone,
      entry: entered.get(item.instanceId) ?? "none",
      questions: own.length,
      question: asking
        ? (own[0] ? askDetailOf : askShortOf)(
            asking.toolName,
            asking.input as Parameters<typeof askShortOf>[1]
          )
        : "",
      step: tool ? `${tool.name} ${tool.glance}`.trim() : "",
    };
  };

  const chips = $derived(
    items
      .filter(
        (item) =>
          entered.has(item.instanceId) &&
          !left.has(item.id) &&
          item.dismissedAt === null
      )
      .map(toChip)
  );

  /* ---- entering without a flight ------------------------------------- */

  /** When the tray first heard of each item. */
  const known = new Map<string, number>();
  const candidate = (item: WorkItemSummary, now: number): boolean =>
    item.dismissedAt === null &&
    (item.state === "starting" ||
      item.state === "running" ||
      item.state === "failed" ||
      (item.endedAt !== null && now - item.endedAt < HOLD));

  /* ---- the finished chip's hold -------------------------------------- */

  /** How long each finished chip has been on screen, by item id. */
  const shownFor = new SvelteMap<string, number>();
  let hovering = $state(false);
  let focusedKey = $state<string | null>(null);
  let openKey = $state<string | null>(null);

  const TICK = 250;

  /**
   * A delegate whose card has had its chance to be on screen and is not:
   * its chip comes in by itself — faded in if it started while the tray was
   * here, simply there if it was already running when the page loaded.
   */
  function admitWaiting(now: number): void {
    for (const item of items) {
      known.set(item.id, known.get(item.id) ?? now);
      const waiting =
        !(entered.has(item.instanceId) || left.has(item.id)) &&
        candidate(item, now) &&
        now - (known.get(item.id) ?? now) >= SETTLE;
      if (waiting && !cardVisible(item.instanceId)) {
        admit(item.instanceId, item.createdAt < mountedAt ? "none" : "fade");
      }
    }
  }

  /** Counts a finished chip's time on screen; paused while it is not being seen, or is being read. */
  function holdFinished(now: number): void {
    const paused = document.hidden || hovering || openKey !== null;
    for (const { item, tone, entry } of chips) {
      if (!(tone === "done" || tone === "cancelled")) {
        continue;
      }
      // At load, one that finished moments ago shows for what is left.
      const start =
        entry === "none" && item.endedAt !== null
          ? Math.max(0, now - item.endedAt)
          : 0;
      const sofar = shownFor.get(item.id) ?? start;
      const next = paused || focusedKey === item.id ? sofar : sofar + TICK;
      shownFor.set(item.id, next);
      if (next >= HOLD) {
        left.add(item.id);
      }
    }
  }

  $effect(() => {
    const beat = setInterval(() => {
      const now = Date.now();
      untrack(() => {
        admitWaiting(now);
        holdFinished(now);
      });
    }, TICK);
    return () => clearInterval(beat);
  });

  /* ---- overflow ------------------------------------------------------ */

  let rowWidth = $state(0);
  const fit = $derived.by(() => {
    const total = chips.length;
    if (rowWidth === 0) {
      return total;
    }
    for (let n = total; n >= 1; n -= 1) {
      const hidden = total - n;
      if (n * CHIP + (n - 1) * GAP + (hidden ? MORE : 0) <= rowWidth) {
        return n;
      }
    }
    return 1;
  });
  const shown = $derived(chips.slice(0, fit));
  const hidden = $derived(chips.slice(fit));
  const keys = $derived([
    ...shown.map((chip) => chip.item.id),
    ...(hidden.length ? ["more"] : []),
  ]);

  /* ---- words ---------------------------------------------------------- */

  let minute = $state(Date.now());
  $effect(() => {
    const clock = setInterval(() => {
      minute = Date.now();
    }, 60_000);
    return () => clearInterval(clock);
  });
  const span = (from: number, to: number): string => {
    const m = Math.floor((to - from) / 60_000);
    if (m < 1) {
      return "<1m";
    }
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const stateWords = (chip: Chip): string => {
    switch (chip.tone) {
      case "needs":
        return `needs you, ${questionWords(chip.questions)}`;
      case "asked":
        return "running, asked this session a question";
      default:
        return chip.tone;
    }
  };
  const questionWords = (n: number) =>
    n === 1 ? "1 question" : `${n} questions`;
  const hrefOf = (item: WorkItemSummary) =>
    conversationHref(item.instanceId, whiffle.instanceIndex);

  /* ---- what the tray says out loud ------------------------------------ */

  /** Each chip's last announced tone; a chip seen first is recorded silently at load. */
  const said = new Map<string, Tone>();
  let politeQueue: string[] = [];
  let flush: ReturnType<typeof setTimeout> | undefined;
  /** What a chip's change says, if anything: polite news, or an urgent question. */
  const PHRASE: Partial<Record<Tone, string>> = {
    done: "finished",
    failed: "failed",
    cancelled: "was cancelled",
  };
  function newsOf(
    { item, tone, entry }: Chip,
    was: Tone | undefined
  ): { urgent?: string; polite?: string } {
    if (was === tone || (was === undefined && entry === "none")) {
      return {};
    }
    if (tone === "needs") {
      return { urgent: `${item.title} has a question` };
    }
    const phrase = was === undefined ? "started" : PHRASE[tone];
    return phrase ? { polite: `${item.title} ${phrase}` } : {};
  }
  $effect(() => {
    const now = chips;
    untrack(() => {
      let urgent = "";
      for (const chip of now) {
        const news = newsOf(chip, said.get(chip.item.id));
        said.set(chip.item.id, chip.tone);
        urgent = news.urgent ?? urgent;
        if (news.polite) {
          politeQueue.push(news.polite);
        }
      }
      if (urgent) {
        trayNews.set(parentId, {
          polite: trayNews.get(parentId)?.polite ?? "",
          assertive: urgent,
          at: Date.now(),
        });
      }
      if (politeQueue.length && !flush) {
        // A burst is said once: every change in it, in one sentence.
        flush = setTimeout(() => {
          trayNews.set(parentId, {
            polite: `${politeQueue.join(". ")}.`,
            assertive: "",
            at: Date.now(),
          });
          politeQueue = [];
          flush = undefined;
        }, 400);
      }
    });
  });
  $effect(() => () => clearTimeout(flush));

  /* ---- the panel ------------------------------------------------------ */

  let root = $state<HTMLElement>();
  let row = $state<HTMLElement>();
  let pinned = $state(false);
  let gliding = $state(false);
  let place = $state({ x: 0, origin: 0, room: 320 });
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;

  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const chipEl = (key: string) =>
    row?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;

  function open(key: string, pin: boolean): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    const chip = chipEl(key);
    if (!(chip && row && root)) {
      return;
    }
    const width = Math.min(360, row.clientWidth);
    const x = Math.min(
      Math.max(0, chip.offsetLeft),
      Math.max(0, row.clientWidth - width)
    );
    const dock = root.closest(".dock") ?? document.documentElement;
    const room =
      root.getBoundingClientRect().top - dock.getBoundingClientRect().top;
    gliding = openKey !== null && openKey !== key;
    place = {
      x,
      origin: chip.offsetLeft + chip.offsetWidth / 2 - x,
      room: Math.min(320, room - 16),
    };
    openKey = key;
    pinned = pin || pinned;
  }
  function close(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    openKey = null;
    pinned = false;
    gliding = false;
  }

  // A chip that leaves takes its panel with it.
  $effect(() => {
    if (openKey && !keys.includes(openKey)) {
      untrack(close);
    }
  });

  // An outside press closes a pinned panel.
  $effect(() => {
    if (!(openKey && pinned)) {
      return;
    }
    const press = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  });

  function onchipenter(key: string): void {
    if (!fine()) {
      return;
    }
    clearTimeout(closing);
    clearTimeout(dwell);
    if (openKey !== null && !pinned) {
      open(key, false);
    } else if (openKey === null) {
      dwell = setTimeout(() => open(key, false), 350);
    }
  }
  function onpress(key: string): void {
    if (openKey === key && pinned) {
      close();
    } else {
      open(key, true);
    }
  }
  function onrootleave(): void {
    hovering = false;
    clearTimeout(dwell);
    if (fine() && !pinned && openKey !== null) {
      closing = setTimeout(close, 300);
    }
  }

  /* ---- keyboard: one tab stop, arrows between chips ------------------ */

  let current = $state(0);
  $effect(() => {
    if (current > keys.length - 1) {
      current = Math.max(0, keys.length - 1);
    }
  });
  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && openKey) {
      event.preventDefault();
      const key = openKey;
      close();
      chipEl(key)?.focus();
      return;
    }
    const at = keys.indexOf(
      (event.target as HTMLElement).closest<HTMLElement>("[data-key]")?.dataset
        .key ?? ""
    );
    if (at < 0) {
      return;
    }
    const to = {
      ArrowRight: Math.min(keys.length - 1, at + 1),
      ArrowLeft: Math.max(0, at - 1),
      Home: 0,
      End: keys.length - 1,
    }[event.key];
    if (to === undefined) {
      return;
    }
    event.preventDefault();
    current = to;
    chipEl(keys[to])?.focus();
  }

  /* ---- motion --------------------------------------------------------- */

  /** The whole row, the first time a chip is in it: unfolds, unless every chip was simply there. */
  const quiet = $derived(chips.every((chip) => chip.entry === "none"));

  function panelIn(_node: Element): TransitionConfig {
    if (!motionOk.current) {
      return { duration: 160, css: (t) => `opacity: ${t}` };
    }
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t, u) =>
        `opacity: ${t}; transform: translateY(${(u * 4).toFixed(2)}px) scale(${(0.98 + 0.02 * t).toFixed(4)})`,
    };
  }
  function panelOut(_node: Element): TransitionConfig {
    return { duration: 120, easing: easeOut, css: (t) => `opacity: ${t}` };
  }
  /** The panel's content, when it glides to another chip. */
  function swap(_node: Element): TransitionConfig {
    return { duration: 100, easing: easeOut, css: (t) => `opacity: ${t}` };
  }
  /** The state slot's check: in over 240ms, from 0.8 and a 2px blur. */
  function slotIn(_node: Element, check: boolean): TransitionConfig {
    if (!(check && motionOk.current)) {
      return { duration: 120, easing: easeOut, css: (t) => `opacity: ${t}` };
    }
    return {
      duration: 240,
      easing: easeOut,
      css: (t, u) =>
        `opacity: ${t}; transform: scale(${(0.8 + 0.2 * t).toFixed(3)}); filter: blur(${(u * 2).toFixed(2)}px)`,
    };
  }
  function slotOut(_node: Element): TransitionConfig {
    return { duration: 120, easing: easeOut, css: (t) => `opacity: ${t}` };
  }

  const slotOf = (tone: Tone) =>
    tone === "asked" || tone === "needs" ? "ask" : tone;
  const openChip = $derived(
    chips.find((chip) => chip.item.id === openKey) ?? null
  );

  async function dismiss(item: WorkItemSummary): Promise<void> {
    try {
      await dismissWorkItem(item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }
</script>

{#snippet mark(item: WorkItemSummary, flies: boolean)}
  {@const Sprite = sessionSprite(item.instanceId)}
  <span
    aria-hidden="true"
    class="mark m{markHue(item.instanceId)}"
    {@attach land(() => (flies ? flightKey(item.instanceId) : undefined))}
    ><Sprite /></span
  >
{/snippet}

<div class="host" bind:clientWidth={rowWidth}>
  {#if chips.length}
    <div
      class="tray"
      onpointerenter={() => {
        hovering = true;
        clearTimeout(closing);
      }}
      onpointerleave={onrootleave}
      role="presentation"
      bind:this={root}
      transition:unfold={{ ms: quiet ? 0 : undefined }}
    >
      <!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is toolbar or group (a binding the rule cannot read); both take a label. -->
      <div
        aria-label="Delegates"
        class="row"
        inert={held}
        {onkeydown}
        role={keys.length >= 3 ? 'toolbar' : 'group'}
        bind:this={row}
        {@attach reflow()}
      >
        {#each shown as chip, i (chip.item.id)}
          {@const { item, tone, entry } = chip}
          <button
            aria-controls={panelId}
            aria-expanded={openKey === item.id}
            aria-label="{item.title}, {stateWords(chip)}"
            class="chip touch-hit {tone}"
            data-flip="pop box"
            data-flip-enter={entry === 'fade' ? undefined : 'own'}
            data-key={item.id}
            onblur={() => {
              focusedKey = null;
            }}
            onclick={() => onpress(item.id)}
            onfocus={() => {
              focusedKey = item.id;
              current = i;
            }}
            onmousedown={(event) => event.preventDefault()}
            onpointerenter={() => onchipenter(item.id)}
            tabindex={current === i ? 0 : -1}
            type="button"
            class:fly={entry === 'fly'}
          >
            {@render mark(item, entry === 'fly')}
            <span aria-hidden="true" class="words">
              <span class="title">{item.title}</span>
              {#if tone === 'needs'}
                <span class="note">{questionWords(chip.questions)}</span>
              {:else if tone === 'failed' || tone === 'cancelled'}
                <span class="note">{tone}</span>
              {/if}
            </span>
            <span aria-hidden="true" class="slot">
              {#key slotOf(tone)}
                <span class="glyph" in:slotIn={tone === 'done'} out:slotOut>
                  {#if tone === 'running'}
                    <span
                      class="dot"
                      style:animation-delay="-{Date.now() % 2000}ms"
                    ></span>
                  {:else if tone === 'asked' || tone === 'needs'}
                    <IconAsk />
                  {:else if tone === 'done'}
                    <IconSuccess />
                  {:else if tone === 'failed'}
                    <IconWarningTriangle />
                  {:else}
                    <IconStop />
                  {/if}
                </span>
              {/key}
            </span>
          </button>
        {/each}
        {#if hidden.length}
          <button
            aria-controls={panelId}
            aria-expanded={openKey === 'more'}
            aria-label="{hidden.length} more delegates"
            class="chip more touch-hit"
            data-flip="pop"
            data-key="more"
            onclick={() => onpress('more')}
            onfocus={() => {
              current = shown.length;
            }}
            onmousedown={(event) => event.preventDefault()}
            onpointerenter={() => onchipenter('more')}
            tabindex={current === shown.length ? 0 : -1}
            type="button"
            class:needs={hidden.some((chip) => chip.tone === 'needs')}
          >
            +{hidden.length}
          </button>
        {/if}
      </div>

      {#if openKey}
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: swallows the mousedown so a phone's keyboard stays up; the panel's controls are links and buttons. -->
        <div
          class="panel"
          id={panelId}
          onmousedown={(event) => event.preventDefault()}
          role="presentation"
          style:--origin="{place.origin}px"
          style:--room="{place.room}px"
          style:--x="{place.x}px"
          class:gliding={gliding}
          in:panelIn
          out:panelOut
        >
          <div class="cell">
            {#key openKey}
              <div class="pbody" in:swap out:swap>
                {#if openKey === 'more'}
                  <ul class="list">
                    {#each hidden as chip (chip.item.id)}
                      <li>
                        <a class="prow" href={hrefOf(chip.item)}>
                          {@render mark(chip.item, false)}
                          <span class="ptitle one">{chip.item.title}</span>
                          <span class="pstate">{stateWords(chip)}</span>
                        </a>
                      </li>
                    {/each}
                  </ul>
                {:else if openChip}
                  {@const { item, tone } = openChip}
                  {#if tone === 'needs'}
                    <p class="question">{openChip.question}</p>
                    <div class="acts">
                      <Button href={hrefOf(item)} size="sm" variant="outline"
                        >Open question</Button
                      >
                    </div>
                  {:else}
                    {#if tone === 'running' || tone === 'asked'}
                      <p class="ptitle">{item.title}</p>
                      <p class="meta">
                        running · {span(item.createdAt, minute)}
                      </p>
                      {#if openChip.step}
                        <p class="line step">{openChip.step}</p>
                      {/if}
                      {#if item.firstLines.brief}
                        <p class="line">{item.firstLines.brief}</p>
                      {/if}
                      {#if tone === 'asked'}
                        <p class="line muted">
                          Asked this session: {openChip.question}
                        </p>
                      {/if}
                    {:else if tone === 'done' || tone === 'cancelled'}
                      <p class="meta">
                        {tone === 'done' ? 'finished' : 'cancelled'}
                        ·
                        {span(item.createdAt, item.endedAt ?? minute)}
                      </p>
                      {#if item.firstLines.result}
                        <p class="line">{item.firstLines.result}</p>
                      {/if}
                    {:else}
                      <p class="line fail">
                        {item.firstLines.error || 'It failed without saying why.'}
                      </p>
                    {/if}
                    <div class="acts">
                      <Button href={hrefOf(item)} size="sm" variant="outline"
                        >Open transcript</Button
                      >
                      {#if tone === 'failed'}
                        <Button
                          onclick={() => dismiss(item)}
                          size="sm"
                          variant="ghost"
                          >Dismiss</Button
                        >
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>
            {/key}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Always laid out, so the row's width is known before its first chip. */
  .host {
    pointer-events: none;
  }
  /* The row of chips, standing --space-2 off the composer's top edge: no
     surface of its own, one line, never wrapping or scrolling sideways. */
  .tray {
    position: relative;
    padding-block-end: var(--space-2);

    @media (pointer: coarse) {
      padding-block-end: var(--space-3);
    }
  }
  .row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-2);
    overflow: visible;
    --hit-gap-x: var(--space-2);
  }

  /* A chip: the attachment chip's surface, drawn on a layer of its own so
     it can arrive after a mark that flew in. */
  .chip {
    position: relative;
    isolation: isolate;
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 224px;
    block-size: 28px;
    display: inline-flex;
    align-items: center;
    gap: var(--c-pill-gap);
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    user-select: none;
    transition: color var(--dur-control) var(--ease-out);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border: 1px solid var(--border-hairline);
      border-radius: inherit;
      background: var(--surface-raised);
      box-shadow: var(--shadow-tile);
      transition: background-color var(--dur-control) var(--ease-out);
    }

    @media (pointer: coarse) {
      block-size: 34px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition:
        color var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);

      &:active {
        transform: scale(var(--press-scale));
      }
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .chip:not(.needs, .failed):hover::before {
      background-color: var(--surface-hover);
    }
  }
  .chip.needs {
    color: var(--status-attn-ink);

    &::before {
      background-color: var(--status-attn-bg);
    }
  }
  .chip.failed {
    color: var(--status-fail-ink);

    &::before {
      background-color: var(--status-fail-bg);
    }
  }

  .words {
    min-inline-size: 0;
    display: flex;
    align-items: baseline;
    gap: var(--c-pill-gap);
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    flex: none;
    font-weight: var(--weight-body);
    white-space: nowrap;
  }
  .cancelled .note {
    color: var(--ink-muted);
  }

  .slot {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    display: grid;
    place-items: center;

    & > .glyph {
      grid-area: 1 / 1;
      display: grid;
      place-items: center;
    }
    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
  }
  .running .slot,
  .asked .slot,
  .cancelled .slot {
    color: var(--ink-muted);
  }
  .done .slot {
    color: var(--status-done-ink);
  }
  .dot {
    inline-size: 5px;
    block-size: 5px;
    border-radius: 50%;
    background: var(--status-live-ink);

    @media (prefers-reduced-motion: no-preference) {
      animation: breathe var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes breathe {
    50% {
      opacity: 0.3;
    }
  }

  /* The mark flew in; the chip's surface and words come in after it. */
  @media (prefers-reduced-motion: no-preference) {
    .chip.fly::before,
    .chip.fly .words,
    .chip.fly .slot {
      animation: arrive 160ms var(--ease-out) 120ms both;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip.fly {
      animation: arrive 160ms var(--ease-out) both;
    }
  }
  @keyframes arrive {
    from {
      opacity: 0;
    }
  }

  .more {
    flex: none;
    inline-size: 52px;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }

  /* The delegate card's mark, at its size. */
  .mark {
    flex: none;
    inline-size: 17px;
    block-size: 17px;
    border-radius: var(--radius-xs);
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      display: block;
      color: var(--mark-glyph);
    }
  }
  .mark.m2 {
    background-color: var(--mark-2);
  }
  .mark.m3 {
    background-color: var(--mark-3);
  }
  .mark.m4 {
    background-color: var(--mark-4);
  }
  .mark.m5 {
    background-color: var(--mark-5);
  }
  .mark.m6 {
    background-color: var(--mark-6);
  }
  .mark.m7 {
    background-color: var(--mark-7);
  }
  .mark.m8 {
    background-color: var(--mark-8);
  }

  /* The house popover, standing 4px off the chips, growing from the chip
     it belongs to. It glides between chips; its content cross-fades. */
  .panel {
    position: absolute;
    inset-block-end: calc(100% + 4px);
    inset-inline-start: 0;
    inline-size: min(360px, 100%);
    translate: var(--x) 0;
    transform-origin: var(--origin) 100%;
    z-index: 2;
    pointer-events: auto;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);

    /* The 4px between the panel and the chips, so the pointer crossing it
       is still over the panel. */
    &::after {
      content: "";
      position: absolute;
      inset-inline: 0;
      inset-block-start: 100%;
      block-size: 4px;
    }
  }
  .panel.gliding {
    transition: translate 140ms var(--ease-out);
  }
  .cell {
    display: grid;
    max-block-size: var(--room);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3);

    & > .pbody {
      grid-area: 1 / 1;
      min-inline-size: 0;
    }
  }
  .ptitle {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .ptitle.one {
    -webkit-line-clamp: 1;
    line-clamp: 1;
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  .meta {
    margin-block-start: var(--space-1);
    font-size: var(--text-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .line {
    margin-block-start: var(--space-2);
    font-size: var(--text-meta);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .line:first-child,
  .meta:first-child {
    margin-block-start: 0;
  }
  .line.muted,
  .step {
    color: var(--ink-muted);
  }
  .line.fail {
    color: var(--status-fail-ink);
  }
  .question {
    font-size: var(--text-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .acts {
    margin-block-start: var(--space-3);
    display: flex;
    gap: var(--space-2);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 30px;
    padding-inline: var(--space-2);
    margin-inline: calc(var(--space-2) * -1);
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    text-decoration: none;
    font-size: var(--text-label);

    @media (pointer: coarse) {
      min-block-size: 44px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .prow:hover {
      background: var(--surface-hover);
    }
  }
  .pstate {
    flex: none;
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
</style>
