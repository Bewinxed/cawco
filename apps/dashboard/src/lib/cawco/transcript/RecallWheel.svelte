<script lang="ts">
  /**
   * The composer's recall: what the reader sent in this conversation rolls
   * down into the field as ghost text, on a wheel grown up out of the
   * history button (grown.ts). The row on the field's line is the pick, its
   * words and time in the selected ink; the reader's own draft is the first
   * row, the newest message the next, and older ones stand above, each a
   * little smaller, leaning back and softer than the one below it.
   *
   * It is mounted while it is up. ↑ and ↓ step (the composer hands it its
   * keys, `key`), a scroll or a drag rolls it, Enter takes the pick into
   * the field unsent, mod+Enter sends it as it is, Esc rolls back to the
   * draft (clearing a search first), and ↓ past the draft closes. With the
   * composer empty, typing searches what was sent (recall.ts) and the best
   * match lands on the line. A held press on a touch screen brings it up
   * under the finger and drags it (`follow`, `release`); a tap on a row
   * takes it, and a tap anywhere else puts it away.
   *
   * It rolls on the app's 0.3s glide spring, critically damped (the tab
   * track's, fluid-tabs/TabsList), and every entry it lands on is a detent
   * the reader hears and feels (feel.svelte.ts). Its sizes are read once,
   * by the composer before it opens (grown.ts `measureShape`); a frame only
   * writes. With reduced motion it steps without
   * rolling and stands up without growing, with the same outcomes.
   */
  import { onMount, tick, untrack } from "svelte";
  import { dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { IconSearch } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { felt } from "../feel.svelte";
  import { GrownShape, type LineBox, SHRINK, type ShapeSize } from "./grown";
  import { marked, oneLine, type Part, type Sent, SentIndex } from "./recall";

  let {
    shell,
    pill,
    measured,
    draft,
    id,
    sent,
    more,
    older,
    keys,
    queuedWord,
    active = $bindable(),
    ontake,
    onback,
    ondone,
  }: {
    /** The box the shape and the rows stand in, the pill at its foot. */
    shell: HTMLElement;
    pill: HTMLElement;
    /**
     * The composer's sizes and its field's last line, read by the composer
     * before it wrote anything for the wheel (grown.ts `measureShape`).
     */
    measured: { size: ShapeSize; line: LineBox };
    /** The composer's text when it came up: the first row. */
    draft: string;
    /** The list's id; each row's is the list's and its place. */
    id: string;
    /** What was sent here, newest first. */
    sent: Sent[];
    /** Older history exists that is not read yet. */
    more: boolean;
    /** Reads the next older page. */
    older: () => void;
    /** Keys reach it from the field; a held press leaves the keyboard down. */
    keys: boolean;
    /** What a queued send is called on this harness, if anything. */
    queuedWord?: string;
    /** The row on the line, for the field's `aria-activedescendant`. */
    active?: string;
    /** The pick goes into the field (`send`: and is sent as it is). */
    ontake: (text: string, send: boolean) => void;
    /** Back to the draft, as it was. */
    onback: () => void;
    /** Folded away: the composer can let it go. */
    ondone: (send: boolean) => void;
  } = $props();

  /** Rows above the field's line, at most. */
  const ABOVE = 3;
  /** How far each row up leans back (deg), and how much softer it goes (px). */
  const LEAN = 6;
  const SOFT = 0.9;
  /** The tab track's glide: critically damped at a 0.3s response. */
  const GLIDE = 0.3;
  const STIFFNESS = ((2 * Math.PI) / GLIDE) ** 2;
  const DAMPING = (4 * Math.PI) / GLIDE;

  /** One row on the wheel: the draft, a send, or the line that says there is none. */
  interface Row {
    entry?: Sent;
    key: string;
    kind: "draft" | "sent" | "none";
    parts?: Part[];
  }

  // Held from the moment it opens: an older page read while it is up adds
  // to the end, so the rows above the line never shift under the reader.
  let entries = $state<Sent[]>(untrack(() => [...sent]));
  const index = untrack(() => new SentIndex(entries));
  $effect(() => {
    const known = new Set(entries.map((entry) => entry.id));
    const last = entries.at(-1)?.at ?? Number.POSITIVE_INFINITY;
    const fresh = sent.filter(
      (entry) => !known.has(entry.id) && (entry.at ?? 0) <= last
    );
    if (fresh.length > 0) {
      entries = [...entries, ...fresh];
      index.add(fresh);
    }
  });

  let query = $state("");
  /** An empty composer searches as the reader types; a draft takes the keys back. */
  const typing = untrack(() => draft === "");

  const rows = $derived.by((): Row[] => {
    const q = query.trim();
    if (q) {
      const found = index.search(q).map(
        ({ entry, terms }): Row => ({
          key: entry.id,
          kind: "sent",
          entry,
          parts: marked(oneLine(entry.text), terms),
        })
      );
      return found.length ? found : [{ key: "none", kind: "none" as const }];
    }
    const own: Row[] = [
      { key: "draft", kind: "draft" },
      ...entries.map((entry): Row => ({ key: entry.id, kind: "sent", entry })),
    ];
    return entries.length || more
      ? own
      : [...own, { key: "none", kind: "none" }];
  });
  /** How many rows can be picked: the line never rests on "none". */
  const pickable = $derived(rows.filter((each) => each.kind !== "none").length);
  const last = () => Math.max(0, pickable - 1);
  const clamp = (v: number) => Math.max(0, Math.min(last(), v));
  /** Past either end it gives a third of the way, as a scroll view does. */
  const soft = (v: number) => {
    if (v < 0) {
      return v * 0.35;
    }
    return v > last() ? last() + (v - last()) * 0.35 : v;
  };

  let ghosts = $state<HTMLElement>();
  let chipWidth = $state(0);
  /** The row on the line. */
  let pick = $state(0);
  $effect(() => {
    active = `${id}-${pick}`;
  });

  let pos = 0;
  let target = 0;
  let speed = 0;
  let frame = 0;
  let lastAt = 0;
  let detent: number | null = null;
  let closing = false;
  let shape: GrownShape | null = null;
  /** Sizes, read once as it opens. */
  let row = $state(0);
  let box = $state({ left: 0, bottom: 0, width: 0, height: 0 });
  /** Called once the roll stands still (back to the draft, then close). */
  let settled: (() => void) | null = null;

  /** The room over the top row, grown. */
  let headroom = 0;
  /** How far above the pill the shape reaches: what the rows need, never less than one. */
  const extFor = () => {
    const above = query.trim()
      ? Math.min(Math.max(pickable - 1, 1), ABOVE)
      : ABOVE;
    return above * row + headroom;
  };

  /** A ghost row `o` rows above the line. */
  const ghost = (o: number) => 0.6 * (1 - o * 0.22);
  /**
   * How strongly a row `off` rows from the line shows: at full strength on
   * it, a ghost fading as it rises above it, leaving below it.
   */
  function presence(off: number): number {
    if (off < 0) {
      return Math.max(0, 1 + off * 1.6);
    }
    return Math.max(0, off < 1 ? 1 + (ghost(1) - 1) * off : ghost(off));
  }

  /** Places one row `off` rows above the line. Writes only. */
  function place(node: HTMLElement, off: number): void {
    if (off > ABOVE + 0.6 || off < -1.2) {
      node.style.visibility = "hidden";
      return;
    }
    node.style.visibility = "visible";
    const up = Math.max(0, off);
    node.style.transform = `translateY(${-off * row}px) rotateX(${up * LEAN}deg) scale(${1 - up * SHRINK})`;
    // Each row up is a little softer than the one below it: the words go
    // out of focus row by row instead of being cut by a fade.
    const blur = Math.max(0, up - 1) * SOFT;
    node.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
    node.style.opacity = String(presence(off));
  }

  /** The roll stands at `at`, and aims there. */
  function stand(at: number): void {
    pos = at;
    target = at;
  }

  /** Places every row where the roll has it. Writes only. */
  function draw(): void {
    const nodes = ghosts?.children ?? [];
    for (let k = 0; k < nodes.length; k += 1) {
      place(nodes[k] as HTMLElement, k - pos);
    }
    const k = clamp(Math.round(pos));
    if (k !== detent) {
      // A detent the reader feels; overshooting past an end is not one.
      if (detent !== null && pickable > 0 && Math.round(pos) === k) {
        felt("detent", k > detent ? "older" : "newer");
      }
      detent = k;
      pick = k;
    }
    // Nearing the oldest row read so far, the page before it is read.
    if (more && target >= pickable - 3 && !query.trim()) {
      older();
    }
  }

  /** Rolls toward the nearest row to `target` on the glide spring. */
  function roll(): void {
    cancelAnimationFrame(frame);
    if (!motionOk.current) {
      stand(clamp(Math.round(target)));
      draw();
      settled?.();
      return;
    }
    lastAt = 0;
    const step = (now: number) => {
      const dt = lastAt ? Math.min(0.032, (now - lastAt) / 1000) : 1 / 60;
      lastAt = now;
      const goal = clamp(Math.round(target));
      speed += (STIFFNESS * (goal - pos) - DAMPING * speed) * dt;
      pos += speed * dt;
      if (Math.abs(goal - pos) < 0.002 && Math.abs(speed) < 0.05) {
        stand(goal);
        speed = 0;
        draw();
        settled?.();
        return;
      }
      draw();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function spinTo(k: number): void {
    target = clamp(k);
    roll();
  }

  async function setQuery(next: string): Promise<void> {
    query = next;
    await tick();
    // The best match lands on the line; with no query, the newest message.
    detent = null;
    stand(clamp(query.trim() ? 0 : 1));
    speed = 0;
    draw();
    // The shape keeps only the room the matches need.
    if (shape && extFor() !== shape.ext) {
      shape.morphTo(1, extFor(), dur("--dur-fade"));
    }
  }

  /**
   * Folds away. `text`: the pick goes into the field (and is sent, `andSend`);
   * none: back to the draft, as it was.
   */
  async function close(text?: string, andSend = false): Promise<void> {
    if (closing) {
      return;
    }
    closing = true;
    cancelAnimationFrame(frame);
    settled = null;
    const line = ghosts?.children[Math.round(pos)] as HTMLElement | undefined;
    if (text === undefined) {
      onback();
      felt("close");
    } else {
      // The ghost on the line becomes the field's own text.
      if (line && motionOk.current) {
        await line.animate([{ opacity: line.style.opacity }, { opacity: 1 }], {
          duration: dur("--dur-control"),
          fill: "forwards",
        }).finished;
      }
      ontake(text, andSend);
    }
    if (line) {
      line.style.visibility = "hidden";
    }
    // It folds back into the button it came out of, the rows inside it,
    // fading as they go.
    if (ghosts && motionOk.current) {
      ghosts.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-fade"),
        fill: "forwards",
      });
    }
    if (shape) {
      await tick();
      shape.base = pill.offsetHeight;
      await shape.morphTo(0, shape.ext, dur("--dur-grow-exit"));
    }
    ondone(andSend);
  }

  /** Takes the row on the line. */
  function take(andSend: boolean): void {
    const chosen = rows[Math.round(pos)];
    if (!chosen || chosen.kind === "none") {
      return;
    }
    if (chosen.kind === "draft") {
      close();
    } else {
      close(chosen.entry?.text, andSend);
    }
  }

  /** Sends the row on the line as it is (the Send button, as mod+Enter). */
  export function send(): void {
    if (!closing) {
      take(true);
    }
  }

  /** Rolls back to the draft and closes there; from a search, closes at once. */
  export function back(): void {
    if (closing) {
      return;
    }
    if (query || Math.round(pos) === 0) {
      close();
      return;
    }
    settled = () => close();
    spinTo(0);
  }

  /**
   * A key from the field. True when the wheel took it; a key it leaves goes
   * on to the field (typing into a draft of your own goes back to it).
   */
  export function key(event: KeyboardEvent): boolean {
    if (closing) {
      // Folding away, the field already holds what it keeps, and takes
      // keys as usual.
      return false;
    }
    if (event.key === "ArrowUp") {
      spinTo(Math.round(target) + 1);
    } else if (event.key === "ArrowDown") {
      if (!query && Math.round(target) <= 0) {
        close();
      } else {
        spinTo(Math.round(target) - 1);
      }
    } else if (event.key === "Enter") {
      take(event.metaKey || event.ctrlKey);
    } else if (event.key === "Escape") {
      if (query) {
        setQuery("");
      } else {
        back();
      }
    } else if (!typed(event)) {
      return false;
    }
    event.preventDefault();
    return true;
  }

  /**
   * Typing while it is up: into an empty composer it searches; into a draft
   * of your own it goes back to the draft, the key landing where the caret
   * was. False when the key goes on to the field.
   */
  function typed(event: KeyboardEvent): boolean {
    const printable =
      event.key.length === 1 &&
      !(event.ctrlKey || event.metaKey || event.altKey);
    if (event.isComposing || !typing) {
      if (event.isComposing || printable || event.key === "Backspace") {
        close();
        return false;
      }
    } else if (printable) {
      setQuery(query + event.key);
    } else if (event.key === "Backspace" && query) {
      setQuery(query.slice(0, -1));
    }
    return true;
  }

  /** A held press dragged `dy` px from where the wheel came up under it. */
  export function follow(dy: number): void {
    if (closing) {
      return;
    }
    cancelAnimationFrame(frame);
    // Dragging down pulls older messages down into the field.
    stand(soft(1 + dy / row));
    draw();
  }

  /** The press lifted, moving at `speedAt` px a ms: the wheel stays up. */
  export function release(speedAt: number): void {
    target = clamp(Math.round(pos + speedAt * 6));
    roll();
  }

  function onwheel(event: WheelEvent): void {
    event.preventDefault();
    if (closing) {
      return;
    }
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= row;
    }
    target = Math.max(
      -0.4,
      Math.min(last() + 0.4, target + (delta / row) * 0.5)
    );
    roll();
  }

  let dragging = false;
  let dragY = 0;
  let dragAt = 0;
  let flick = 0;
  function ondown(event: PointerEvent): void {
    dragging = true;
    dragY = event.clientY;
    dragAt = performance.now();
    flick = 0;
    ghosts?.setPointerCapture(event.pointerId);
  }
  function onmove(event: PointerEvent): void {
    if (!dragging || closing) {
      return;
    }
    const dy = event.clientY - dragY;
    const now = performance.now();
    flick = dy / Math.max(1, now - dragAt);
    dragY = event.clientY;
    dragAt = now;
    cancelAnimationFrame(frame);
    stand(soft(pos + dy / row));
    draw();
  }
  function onup(): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    release(flick);
  }

  function pickRow(k: number): void {
    if (closing || rows[k]?.kind === "none") {
      return;
    }
    if (Math.round(pos) === k) {
      take(false);
    } else {
      spinTo(k);
    }
  }

  // Rows that come or go (a search, an older page) are placed in the frame
  // they are drawn.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — a new list of rows is drawn where the roll stands
    void rows;
    if (row > 0) {
      untrack(draw);
    }
  });

  onMount(() => {
    const { size, line } = measured;
    ({ row, headroom } = size);
    box = { ...line, height: row * (ABOVE + 1) };
    shape = new GrownShape(shell, size, extFor(), { frosted: true });
    if (ghosts) {
      shape.clip(ghosts, () => box);
    }
    draw();
    if (keys) {
      felt("open");
    }
    shape.morphTo(1, shape.ext, dur("--dur-grow"));
    // The newest message rolls down into the field as it grows.
    spinTo(1);
    return () => {
      cancelAnimationFrame(frame);
      shape?.remove();
    };
  });

  /** What a send's row says after its words: its state, then its age. */
  const meta = (entry: Sent | undefined): string => {
    if (!entry) {
      return "";
    }
    let state: string | undefined;
    if (entry.state === "pending") {
      state = queuedWord;
    } else if (entry.state === "failed" || entry.state === "unreached") {
      state = "Not sent";
    }
    const age = entry.at === null ? "" : formatAgeShort(entry.at);
    return [state, age].filter(Boolean).join(" · ");
  };
</script>

<!-- The field keeps focus and points at the row on the line
     (aria-activedescendant): the list and its rows are never focused. -->
<div
  aria-label="What you sent here"
  class="ghosts"
  {id}
  onpointercancel={onup}
  onpointerdown={ondown}
  onpointermove={onmove}
  onpointerup={onup}
  {onwheel}
  role="listbox"
  tabindex="-1"
  bind:this={ghosts}
  style:--chip-room="{query.trim() ? chipWidth : 0}px"
  style:bottom="{box.bottom}px"
  style:height="{box.height}px"
  style:left="{box.left}px"
  style:width="{box.width}px"
  class:filtering={!!query.trim()}
>
  {#each rows as entry, k (entry.key)}
    <!-- The keys are the field's (↑ ↓ Enter); a click is the pointer's way
         to the same pick. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- biome-ignore lint/a11y/useKeyWithClickEvents: the field owns the keys for every row (aria-activedescendant) -->
    <div
      aria-selected={k === pick}
      class="ghost"
      id="{id}-{k}"
      onclick={() => pickRow(k)}
      role="option"
      tabindex="-1"
      class:draft={entry.kind === "draft"}
      class:none={entry.kind === "none"}
    >
      <span class="t">
        {#if entry.kind === "none"}
          {query.trim()
            ? "Nothing you sent here matches"
            : "Nothing sent here yet"}
        {:else if entry.kind === "draft"}
          {#if draft}
            {oneLine(draft)}
          {:else}
            <span class="hint">Your draft · type to search</span>
          {/if}
        {:else if entry.parts}
          {#each entry.parts as part, p (p)}
            {#if part.mark}
              <mark>{part.text}</mark>
            {:else}
              {part.text}
            {/if}
          {/each}
        {:else}
          {oneLine(entry.entry?.text ?? "")}
        {/if}
      </span>
      <span class="m num">{meta(entry.entry)}</span>
    </div>
  {/each}
</div>
{#if query.trim()}
  <div
    class="chip-line"
    style:bottom="{box.bottom}px"
    style:height="{row}px"
    style:left="{box.left}px"
    style:width="{box.width}px"
  >
    <span class="qchip" bind:offsetWidth={chipWidth}>
      <IconSearch aria-hidden="true" />
      <span class="q">{query}</span>
      <span class="n num">{rows[0]?.kind === "none" ? 0 : pickable}</span>
    </span>
  </div>
{/if}

<style>
  /* The rows stand on the field's line and above it, each one row tall,
     set as the field sets its text. The oldest fades out at the top edge
     instead of being cut through. */
  .ghosts {
    position: absolute;
    z-index: 3;
    overflow: hidden;
    perspective: 900px;
    perspective-origin: 50% 100%;
    mask-image: linear-gradient(transparent, #000 var(--space-4));
    touch-action: none;
    user-select: none;
    cursor: ns-resize;
  }
  .ghost {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: var(--c-composer-field);
    padding-block: calc((var(--c-composer-field) - 1lh) / 2);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-3);
    align-items: baseline;
    font-family: var(--font-body);
    font-size: 16px;
    line-height: var(--leading-ui);
    color: var(--ink-strong);
    transform-origin: 50% 100%;
    will-change: transform, opacity;
    /* Drawn where the roll puts it, once it has a place. */
    visibility: hidden;
    cursor: pointer;
    transition: color var(--dur-control) var(--ease-out);
  }
  .t {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .m {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    white-space: nowrap;
    transition: color var(--dur-control) var(--ease-out);
  }
  /* The pick: what sits on the field's line, what Enter or a tap takes,
     its words and its time in the selected ink. The reader's own draft on
     the line is not a pick and keeps the field's ink. */
  .ghost[aria-selected="true"]:not(.draft, .none),
  .ghost[aria-selected="true"]:not(.draft) .m {
    color: var(--selected-ink);
  }
  .hint {
    color: var(--ink-subtle);
  }
  .none .t {
    color: var(--ink-muted);
  }
  mark {
    background: var(--selection);
    color: inherit;
    border-radius: var(--radius-hair);
  }
  /* While searching, every row stops short of the query chip. */
  .filtering .ghost {
    inset-inline-end: calc(var(--chip-room) + var(--space-2));
  }
  /* The query, on the field's line at its end, wherever the rows roll. */
  .chip-line {
    position: absolute;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    pointer-events: none;
  }
  .qchip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 45%;
    padding: calc(var(--space-1) / 2) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    font-size: var(--text-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    white-space: nowrap;

    & :global(svg) {
      flex: none;
      inline-size: var(--icon-sm);
      block-size: var(--icon-sm);
      color: var(--ink-muted);
    }
  }
  .q {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    color: var(--ink-muted);
  }
  /* A phone's field is too narrow to spend on the age. */
  @media (width < 640px) {
    .m {
      display: none;
    }
  }
</style>
