<script lang="ts">
  /**
   * The usage strip, in the rail's footer and, always, under the phone
   * home's status line, drawn as Rings (the owner's double dial): a cell for
   * Claude, then one for opencode. Claude's cell is its mark, one ring per
   * account in carrying order (who carries you now first), the time until
   * nothing can carry your new sessions ("3h 10m", "5h+"), and under it who
   * takes over next ("then Work"), or when you're back ("back in 2h 10m").
   * A ring's inner disc is what is left of the account's 5-hour window, its
   * rim what is left of its week, in the account's colour. When the carrying
   * order changes the rings slide to their new places.
   *
   * The whole strip is one control. It opens the relay: the time until
   * Claude stops, who carries you across the next five hours as one bar,
   * and every account as a cell of the dial wall, two across (grouped by
   * organization where one has more than two): its 32px double dial, its
   * name, the time that matters and its week, so one glance says which
   * accounts still have room in the next five hours and this week. Then
   * the way to the Usage page: a popover by the strip
   * with a fine pointer, the house bottom sheet on touch. The
   * strip is 44px in the rail (56px on the phone home) in every state, so
   * nothing around it moves when a reading lands or changes.
   *
   * Live: the forecast is read whenever the hub says an account moved
   * (usage/forecast.svelte.ts), and the words move on once a minute.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconKey, IconRefresh, IconSubagents } from "#lib/icons.js";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import { cawco } from "./client.svelte";
  import { dur, motionOk } from "./motion/curves.svelte";
  import { morph } from "./motion/morph.svelte";
  import { reflow } from "./motion/rows.svelte";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import { claudeGap } from "./usage";
  import Figure from "./usage/Figure.svelte";
  import { startForecast, usage } from "./usage/forecast.svelte";
  import Relay from "./usage/Relay.svelte";
  import Rings from "./usage/Rings.svelte";
  import {
    type CellTime,
    type ClaudeRings,
    caption,
    cellTime,
    delegateTip,
    dialTip,
    orgGroups,
    plain,
    type RingAccount,
    shownNames,
    stopFigure,
    stopOf,
    weekLeft,
  } from "./usage/rings";
  import SessionsChip from "./usage/SessionsChip.svelte";
  import WeekMark from "./usage/WeekMark.svelte";
  import Words from "./usage/Words.svelte";

  let {
    variant = "rail",
  }: {
    /** The phone home's strip stands on its own raised card, a size up. */
    variant?: "rail" | "home";
  } = $props();

  $effect(() => {
    startForecast();
  });

  /** The popover or the sheet stands open. */
  let open = $state(false);
  /**
   * The strip was last pressed with a pointer, not a key. A pointer's open
   * leaves focus on the strip, so no ring lands on the first thing inside
   * (the house ring is for the keyboard); a key's open moves focus in.
   */
  let byPointer = false;
  const pressed = () => {
    byPointer = true;
  };
  const keyed = () => {
    byPointer = false;
  };
  const keepFocus = (event: Event) => {
    if (byPointer) {
      event.preventDefault();
    }
  };
  /** A session was opened from it: it goes away, as a menu does. */
  const putAway = () => {
    open = false;
  };

  const claude = $derived(usage.claude);
  const openCode = $derived(usage.openCode);
  const now = $derived(usage.now);
  const shown = $derived(Boolean(claude || openCode));

  /** Touch, or a phone's width: the limits open in the house bottom sheet. */
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );

  // ── the dial wall ──
  /** An organization's cells under its name, or (null) the ungrouped ones. */
  interface WallBlock {
    cells: RingAccount[];
    /** Its head: the organization's name, "Other" under groups, or none. */
    head: string | null;
    org: string | null;
  }
  /** The ungrouped accounts' head, where a group's head stands above. */
  const OTHER = "Other";
  /**
   * The moment the wall ranks at: the last reading's, so the minute moving
   * on, which shortens every running account's time but no idle one's,
   * never reorders the cells.
   */
  let rankedAt = $state(untrack(() => usage.now));
  $effect.pre(() => {
    if (usage.cause === "data") {
      rankedAt = usage.now;
    }
  });
  /** What is left of the window that binds an account: the tie-break. */
  const roomOf = (ring: RingAccount): number =>
    (ring.bind === "week" ? ring.week?.left : ring.w5?.left) ?? 0;
  /**
   * The time each cell says first: the latest forecast stop first ("5h+
   * left" before any time), ties to the most room; accounts at their limit
   * last, the one back soonest first; then the carrying order. Read across
   * a row, the times run down.
   */
  const ranked = (accounts: RingAccount[], c: ClaudeRings): RingAccount[] => {
    const stop = (ring: RingAccount) =>
      stopOf(ring, c, rankedAt) ?? Number.POSITIVE_INFINITY;
    return [...accounts].sort((a, b) => {
      const limitA = a.state === "limit";
      const limitB = b.state === "limit";
      if (limitA !== limitB) {
        return limitA ? 1 : -1;
      }
      if (limitA) {
        return (
          (a.backAt ?? Number.POSITIVE_INFINITY) -
          (b.backAt ?? Number.POSITIVE_INFINITY)
        );
      }
      return stop(b) - stop(a) || roomOf(b) - roomOf(a);
    });
  };
  /**
   * Claude's accounts as blocks, each ranked by its time and starting its
   * own row: an organization's under its name, then the ungrouped ones,
   * under "Other" where a group stands above them.
   */
  const wall = $derived.by((): WallBlock[] => {
    if (!claude) {
      return [];
    }
    const groups = orgGroups(claude.accounts);
    return groups.map((group, i) => ({
      org: group.org,
      head: group.org ?? (i > 0 ? OTHER : null),
      cells: ranked(group.accounts, claude),
    }));
  });

  /** The cell a relay band stands for, while the band is hovered or open. */
  let lit = $state<string | null>(null);
  /** The ground a cell's reserve notch takes: the hover wash while lit,
      else the limit wash at its limit (lit wins, as its background does). */
  function groundOf(ring: RingAccount): string | undefined {
    if (ring.id === lit) {
      return "var(--surface-hover)";
    }
    if (ring.state === "limit") {
      return "var(--meter-wash-over)";
    }
    return undefined;
  }
  /** Where a cell's tooltips open. */
  type TipSide = "top" | "right";
  /**
   * A cell's tooltips cover no cell: with a fine pointer they stand beside
   * the cell's whole row, outside the popover's free edge (its right); in
   * the sheet, which has no free edge, over its head, above the accounts.
   * Their first line names whose they are.
   */
  const sideFor = (): TipSide => (touch.current ? "top" : "right");
  const rowOf = (id: string) => ({
    getBoundingClientRect: () => {
      const cell = document.querySelector<HTMLElement>(
        `[data-slot="cell-d"][data-account="${CSS.escape(id)}"]`
      );
      const grid = cell?.closest<HTMLElement>('[data-slot="wall"]');
      if (!(cell && grid)) {
        return new DOMRect();
      }
      const across = grid.getBoundingClientRect();
      if (touch.current) {
        const list = grid.closest<HTMLElement>("[data-accounts]");
        const { top } = (list ?? grid).getBoundingClientRect();
        return new DOMRect(across.x, top, across.width, 0);
      }
      const at = cell.getBoundingClientRect();
      return new DOMRect(across.x, at.y, across.width, at.height);
    },
  });

  /** Every account by the one name the strip and the popover show it by. */
  const names = $derived(shownNames(claude?.accounts ?? [], openCode));
  const nameOf = (ring: RingAccount): string => {
    const name = names.get(ring.id);
    return name ? `${name.local}${name.domain}` : ring.name;
  };
  /**
   * A cell read out whole, with the words its figures and marks stand for:
   * "design · 5h+ left · week 62% left · 2 sessions · new sessions start
   * here".
   */
  const cellLabel = (
    ring: RingAccount,
    c: ClaudeRings | null,
    name = nameOf(ring)
  ): string => {
    const time = cellTime(ring, c, now);
    const week = weekLeft(ring);
    const sessions = ring.sessions.length;
    let said: string;
    if (time.kind === "back") {
      said =
        time.figure === null
          ? "at its limit"
          : `at its limit, back in ${time.figure}`;
    } else {
      said = `${time.guess ? "about " : ""}${time.figure} left`;
    }
    return [
      name,
      said,
      week === null ? null : `week ${week}% left`,
      sessions > 0
        ? `${sessions} ${sessions === 1 ? "session" : "sessions"}`
        : null,
      c && ring.id === c.delegate?.id ? "delegates start here" : null,
      c && ring.id === c.carry?.id ? "new sessions start here" : null,
    ]
      .filter((part) => part !== null)
      .join(" · ");
  };

  /** One mark's room in the strip: 16px and the 4px between marks. */
  const SLOT = 20;
  /**
   * Where the i-th of n marks starts: a slot apart while they fit, closer
   * (evenly, overlapping if they must) when the strip is narrower than all
   * of them and the digits, so the digits are never the part cut.
   */
  const slotAt = (i: number, n: number): string =>
    n < 2 ? "0px" : `min(${i * SLOT}px, (100% - 16px) * ${i / (n - 1)})`;
  /** The room the marks have in the strip, as laid out (`roomFor`). */
  let marksRoom = $state(Number.POSITIVE_INFINITY);
  /** How many marks stand a slot apart in that room. */
  const marksFit = $derived(Math.max(1, Math.floor((marksRoom + 4) / SLOT)));
  /**
   * The strip's marks: every account while they stand a slot apart, else
   * as many as do, less one place for a "+N" count of the rest. The
   * popover shows them all.
   */
  const stripMarks = $derived.by(() => {
    const all = claude?.accounts ?? [];
    return all.length > marksFit ? all.slice(0, marksFit - 1) : all;
  });
  const stripMore = $derived(
    (claude?.accounts.length ?? 0) - stripMarks.length
  );
  /**
   * The accounts, when they scroll, end on a whole cell or section, never a
   * sliver of one, with the edge fade over that fold: their height is the
   * deepest cell or section foot that fits the room the popover or sheet
   * gives them. When everything fits they take their own height.
   */
  const wholeRows = (node: HTMLElement) => {
    let frame = 0;
    const fold = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.maxBlockSize = "";
        const room = node.clientHeight;
        if (node.scrollHeight <= room + 1) {
          return;
        }
        // Layout offsets, not drawn boxes: the popover is still scaling in
        // from 0.92 when this first runs, and a transform moves no foot.
        const footOf = (one: HTMLElement) => {
          let top = 0;
          for (
            let at: HTMLElement | null = one;
            at && at !== node;
            at = at.offsetParent as HTMLElement | null
          ) {
            top += at.offsetTop;
          }
          return top + one.offsetHeight;
        };
        const feet = [
          ...node.querySelectorAll<HTMLElement>(
            "[data-flyover-anchor], [data-flyover-edge], .group"
          ),
        ]
          .map(footOf)
          .filter((foot) => foot <= room + 0.5);
        const deepest = Math.max(0, ...feet);
        if (deepest > 0) {
          node.style.maxBlockSize = `${deepest}px`;
        }
      });
    };
    const sizes = new ResizeObserver(fold);
    const watch = () => {
      sizes.disconnect();
      for (const child of node.children) {
        sizes.observe(child);
      }
    };
    watch();
    const children = new MutationObserver(() => {
      watch();
      fold();
    });
    children.observe(node, { childList: true });
    window.addEventListener("resize", fold);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      children.disconnect();
      window.removeEventListener("resize", fold);
    };
  };
  /** Reads the room the marks span is given (it asks for every account's). */
  const roomFor = (node: HTMLElement) => {
    const sizes = new ResizeObserver(([entry]) => {
      marksRoom = entry.contentRect.width;
    });
    sizes.observe(node);
    return () => sizes.disconnect();
  };

  /** Why there is nothing to draw: a normal state, never a fake 0%. */
  const empty = $derived(
    cawco.usageLimitsRead && usage.read
      ? "Sign in to see limits"
      : "Reading limits…"
  );

  /**
   * No limit can be shown once everything is read: the strip says so in one
   * line (`short`), and its popover says why and the one action that fixes
   * it, in the Usage page's words (usage.ts `claudeGap`).
   */
  const gap = $derived(
    !shown && cawco.usageLimitsRead && usage.read
      ? claudeGap(cawco.claudeLimits, cawco.machines)
      : null
  );

  /** The hub's word for a key or login the provider turned away. */
  const KEY_REFUSED = /^HTTP 40[13]\b/;

  /**
   * What the list says of a provider with nothing to draw: no machine is
   * signed in to it, or every read failed before any succeeded. Nothing
   * before the first read (an absence not known yet is not claimed).
   */
  function noteOf(
    name: string,
    has: boolean,
    readings: { error?: string | null }[]
  ): string | null {
    if (!cawco.usageLimitsRead || has) {
      return null;
    }
    const error =
      readings.length === 0
        ? "not signed in"
        : readings.find((reading) => reading.error)?.error;
    if (!error) {
      return null;
    }
    if (error === "not signed in") {
      return `Sign in to ${name} on a machine to see its limits.`;
    }
    if (error === "no reading yet") {
      return `${name}'s limits appear once a session runs.`;
    }
    return KEY_REFUSED.test(error)
      ? `${name} turned the key away. Sign in again on a machine.`
      : `${name}'s limits could not be read: ${error}`;
  }
  const notes = $derived(
    [
      {
        id: "Claude",
        mark: ClaudeIcon,
        text: noteOf(
          "Claude",
          Boolean(claude),
          Object.values(cawco.claudeLimits)
        ),
      },
      {
        id: "opencode",
        mark: OpenCodeLogo,
        text: noteOf(
          "opencode Go",
          Boolean(openCode),
          Object.values(cawco.openCodeGoLimits)
        ),
      },
    ].filter((note) => note.text !== null && !(gap && note.id === "Claude"))
  );

  /** The Go plan's time and week in the strip, as its popover cell says them. */
  const goTime = $derived.by(() => {
    if (!openCode) {
      return null;
    }
    const time = cellTime(openCode, null, now);
    return time.kind === "stop" && time.guess
      ? { ...time, figure: `~${time.figure}` }
      : time;
  });
  const goWeek = $derived(openCode ? weekLeft(openCode) : null);
  /** Claude's figure in the strip and the head: the stop, or when it's back. */
  const stop = $derived(claude ? stopFigure(claude, now, nameOf) : null);

  /** The strip read out: what its one control is called. */
  const triggerLabel = $derived.by(() => {
    if (!shown) {
      return `${gap?.short ?? empty}. Show every limit.`;
    }
    const said: string[] = [];
    if (claude && stop) {
      said.push(
        `Claude · ${stop.said} · ${plain(caption(claude, now, nameOf))}`
      );
    }
    if (openCode) {
      said.push(cellLabel(openCode, null, "opencode Go"));
    }
    return `${said.join(". ")}. Show every limit.`;
  });

  /**
   * Under reduced motion a mark that changes place fades in at its new
   * place instead of travelling there.
   */
  function slot(node: HTMLElement, first: number) {
    let at = first;
    return {
      update(next: number) {
        if (next !== at && !motionOk.current) {
          node.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: dur("--dur-fade"),
            easing: "linear",
          });
        }
        at = next;
      },
    };
  }
</script>

{#snippet face()}
  {#if !shown}
    <span class="truncate type-meta text-ink-muted">{gap?.short ?? empty}</span>
  {:else}
    <!-- Claude's cell asks for its whole first line and caption, and never
         takes less than its marks and digits; opencode's is as wide as it
         says. Where the rail is too narrow for both, opencode's cell wraps
         onto a second row the strip does not show (it stays in the strip's
         label and the popover), rather than Claude's answer being cut: one
         row of cells, 34px (the first line, 3px, the caption). -->
    <!-- literal: 34px; 3px; 6px; 14px, 3px -->
    <span
      class="flex h-(--strip-row) min-w-0 flex-1 flex-wrap gap-x-space-2 overflow-clip group-variant-home/strip:gap-x-space-6"
      style:--cell-gap="3px"
      style:--l1-gap="6px"
      style:--mark-r="3px"
      style:--mark-side="14px"
      style:--strip-row="34px"
    >
      {#if claude}
        <span
          class="flex h-(--strip-row) flex-auto flex-col justify-center gap-(--cell-gap)"
          data-cell="claude"
        >
          <span
            class="flex h-icon-md min-w-0 items-center gap-(--l1-gap) whitespace-nowrap"
          >
            <span
              data-slot="mark"
              aria-hidden="true"
              class="inline-flex size-(--mark-side) flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
              ><ClaudeIcon /></span
            >
            <!-- The marks are the part of line 1 that gives: they ask for a
                 slot each and shrink to one mark's width, the marks closing
                 up inside (slotAt), so the Claude mark and the digits always
                 stand whole inside the cells' clip. -->
            <!-- literal: 16px -->
            <span
              class="relative h-icon-md min-w-(--mark-min) shrink grow-0 basis-(--marks-basis)"
              data-strip-marks
              style:--mark-min="16px"
              style:--marks-basis="{claude.accounts.length * SLOT - 4}px"
              {@attach roomFor}
            >
              {#each stripMarks as ring, i (ring.id)}
                <span
                  data-slot="slot"
                  class="absolute start-(--slot-at) top-0 grid transition-[inset-inline-start] dur-reveal ease-in-out motion-reduce:transition-off"
                  style:--slot-at={slotAt(
                    i,
                    stripMarks.length + (stripMore > 0 ? 1 : 0)
                  )}
                  use:slot={i}
                >
                  <Rings index={i} reveal {ring} size={16} />
                </span>
              {/each}
              {#if stripMore > 0}
                <!-- The rest, counted: the popover shows every one. "+N":
                     the accounts past what stands a slot apart, in meta. -->
                <!-- literal: 16px -->
                <span
                  data-slot="slot"
                  data-more
                  class="absolute start-(--slot-at) top-0 grid h-icon-md min-w-(--mark-min) place-items-center font-body text-size-meta leading-(--more-lh) font-normal num text-ink-muted transition-[inset-inline-start] dur-reveal ease-in-out motion-reduce:transition-off"
                  data-strip-more
                  style:--more-lh="16px"
                  style:--slot-at={slotAt(
                    stripMarks.length,
                    stripMarks.length + 1
                  )}>+{stripMore}</span
                >
              {/if}
            </span>
            <!-- Nothing can carry you now: when an account is back, after
                 the refresh mark, as Go's cell beside it says its own. -->
            {#if stop?.back}
              <span
                aria-hidden="true"
                class="inline-grid flex-none text-ink-muted"
                data-strip-back><IconRefresh class="size-icon-sm" /></span
              >
            {/if}
            <!-- The strip's time: its line here, the figure face on its own
                 span (`mono-figure`). -->
            <!-- literal: 16px -->
            <span
              class="flex-none font-body text-size-label leading-(--digits-lh) font-medium num text-ink-strong data-muted:text-ink-muted"
              data-muted={claude.stale !== null || undefined}
              data-strip-digits
              style:--digits-lh="16px"
              ><span class="mono-figure"
                ><Figure text={stop?.figure ?? ""} /></span
              ></span
            >
          </span>
          <!-- One line. Its whole width is what the cell asks for, but it
               may break anywhere, so it never holds the cell wider than the
               marks and digits: only when the rail cannot fit it at all does
               it end in an ellipsis. -->
          <!-- literal: 15px -->
          <span
            class="line-clamp-1 line-clamp-std-1 min-w-0 font-body text-size-meta leading-(--cap-lh) font-normal num wrap-anywhere text-ink-muted [&_b]:text-ink-row"
            data-next={claude.next?.id}
            data-strip-caption
            style:--cap-lh="15px"
            ><Words parts={caption(claude, now, nameOf)} /></span
          >
        </span>
      {/if}
      {#if openCode}
        <span
          class="flex h-(--strip-row) flex-none flex-col justify-center gap-(--cell-gap)"
          data-cell="opencode"
        >
          <span
            class="flex h-icon-md min-w-0 items-center gap-(--l1-gap) whitespace-nowrap"
          >
            <span
              data-slot="mark"
              aria-hidden="true"
              class="inline-flex size-(--mark-side) flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
              ><OpenCodeLogo /></span
            >
            <Rings reveal ring={openCode} size={16} />
            <!-- As its popover cell says it: how long it lasts, or at its
                 limit the refresh mark and when it's back: 12px, Solar
                 duotone, muted. -->
            {#if goTime?.kind === "back"}
              <span
                aria-hidden="true"
                class="inline-grid flex-none text-ink-muted"
                ><IconRefresh class="size-icon-sm" /></span
              >
            {/if}
            <!-- literal: 16px -->
            <span
              class="flex-none font-body text-size-label leading-(--digits-lh) font-medium num text-ink-strong"
              data-strip-go-time
              style:--digits-lh="16px"
              ><span class="mono-figure"
                ><Figure text={goTime?.figure ?? ""} /></span
              ></span
            >
          </span>
          {#if goWeek !== null}
            <!-- literal: 15px -->
            <!-- mark-line: one clamped line of text; the week ring stands in
                 it on vertical-align: middle, the x-height's middle -->
            <span
              class="line-clamp-1 line-clamp-std-1 min-w-0 font-body text-size-meta leading-(--cap-lh) font-normal num wrap-anywhere text-ink-muted [&_b]:text-ink-row"
              data-strip-go-week
              style:--cap-lh="15px"
              ><WeekMark ring={openCode} />
              <span class="mono-figure">{goWeek}%</span></span
            >
          {/if}
        </span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet dial(
  ring: RingAccount,
  c: ClaudeRings | null,
  shown: string,
  side: TipSide
)}
  <!-- The 32px double dial (its disc the 5-hour limit, its rim the week),
       its own key: resting on it or a tap says whose it is and what each
       limit has left, opening to the side that covers the fewest cells. -->
  {@const tip = dialTip(ring, c, now)}
  <!-- The dial, centred on the two lines, the wall's space-1 gap before the
       status slot: the slot's marks still stand clear of the ring's ink, the
       ring curving away from its box at the second line's height. Every
       dial is its tooltip's trigger: a bare button, the ring itself. -->
  <span class="col-1 row-span-2 row-start-1 grid self-center">
    <Tip anchor={rowOf(ring.id)} label={tip} {side} tap title={shown}>
      {#snippet children(props)}
        <!-- literal: 50% -->
        <button
          {...props}
          aria-label="{shown}: {tip}"
          class="grid cursor-help rounded-(--tip-round) border-none border-current bg-transparent p-0"
          style:--tip-round="50%"
          data-dial-tip
          data-stale-ring={ring.state === "stale" ? "" : undefined}
          type="button"
        >
          <Rings {ring} size={32} />
        </button>
      {/snippet}
    </Tip>
  </span>
{/snippet}

{#snippet lineTwo(ring: RingAccount, time: CellTime, side: TipSide)}
  <!-- The second line on its own tracks: the status slot (a guess's tilde,
       or at its limit the refresh mark, said whole on a rest or a tap), the
       time, a figure alone, then the week's mark and what is left of it. -->
  {#if time.kind === "back"}
    {@const tip =
      time.figure === null
        ? "At its limit."
        : `At its limit. Back in ${time.figure}.`}
    <Tip anchor={rowOf(ring.id)} label={tip} {side} tap>
      {#snippet children(props)}
        <!-- The status slot, before every time: a guess's tilde against the
             time, or at its limit the refresh mark (12px, Solar duotone,
             muted); empty otherwise. -->
        <span
          data-usage-meter-glyph
          {...props}
          aria-label={tip}
          class="col-2 row-2 inline-grid self-center justify-self-end text-ink-muted"
          data-status-slot
          role="img"
          ><IconRefresh aria-hidden="true" class="size-icon-sm" /></span
        >
      {/snippet}
    </Tip>
  {:else if time.guess}
    <span
      class="mono-figure col-2 row-2 self-center justify-self-end text-size-meta leading-meta text-ink-muted"
      data-status-slot>~</span
    >
  {/if}
  <!-- The second line: the time, then the week's share, each a figure alone
       in the figure face (mono-figure), never wrapping; the time a step
       stronger than the week; a guess stays muted. -->
  <span
    data-slot="time"
    class="col-3 row-2 type-meta whitespace-nowrap text-ink-row data-guess:text-ink-muted"
    data-guess={(time.kind === "stop" && time.guess) || undefined}
    data-time
  >
    {#if time.figure}
      <span class="mono-figure">{time.figure}</span>
    {/if}
  </span>
  {@const week = weekLeft(ring)}
  {#if week !== null}
    <!-- The week's mark at its slot's start, centred on the line; the share
         end-aligned on a width that holds "100%". -->
    <span class="col-4 row-2 grid self-center" data-week-mark
      ><WeekMark {ring} /></span
    >
    <!-- literal: 4ch -->
    <span
      class="col-5 row-2 justify-self-end type-meta whitespace-nowrap text-ink-muted"
      data-week
      ><span
        class="mono-figure inline-block min-w-(--pct-min) text-end"
        style:--pct-min="4ch">{week}%</span
      ></span
    >
  {/if}
{/snippet}

{#snippet sessionsChip(ring: RingAccount, shown: string)}
  {#if ring.sessions.length > 0}
    <!-- The count, 16px. Its touch area reaches the full 44px up and down,
         and space-5 / 2 to either side: a count in the last column stays
         inside the wall's padding, so the accounts never scroll sideways. -->
    <span class="ms-auto grid" style:--hit-gap-x="var(--space-5)">
      <SessionsChip
        account={ring.name}
        name={shown}
        onopen={putAway}
        sessions={ring.sessions}
      />
    </span>
  {/if}
{/snippet}

{#snippet cell(ring: RingAccount, c: ClaudeRings | null, side: TipSide)}
  <!-- The carrier's hairline ring says, on a rest or a tap, that new
       sessions start there. -->
  {#if c && ring.id === c.carry?.id}
    <Tip anchor={rowOf(ring.id)} label="New sessions start here" {side} tap>
      {#snippet children(props)}
        {@render cellBody(ring, c, side, props)}
      {/snippet}
    </Tip>
  {:else}
    {@render cellBody(ring, c, side, {})}
  {/if}
{/snippet}

{#snippet cellBody(
  ring: RingAccount,
  c: ClaudeRings | null,
  side: TipSide,
  props: Record<string, unknown>
)}
  <!-- A cell of the dial wall, one row on its wall column's five tracks
       (subgrid): the dial on both lines; its name on the first (the Go
       plan's led by its mark), the delegates' mark after it where new
       delegates start, the sessions it runs at the line's end; the status
       slot, how long it lasts, the week's mark and its share on the second.
       Read out whole with the words its marks stand for. A re-ranking slides
       it to its new place (motion/rows). -->
  {@const go = c === null}
  {@const name = go
    ? { local: "opencode Go", domain: "" }
    : (names.get(ring.id) ?? { local: ring.name, domain: "" })}
  {@const shown = `${name.local}${name.domain}`}
  <!-- A cell: one row on its column's five tracks (subgrid), space-1 in on
       every side, in meta. The carrier wears a ring in the outline button's
       edge (3:1 on the raised surface); an account at its limit the limit
       wash, which the dial's reserve notch takes as its ground; the cell a
       relay band stands for, while that band is hovered or open, the hover
       wash; each of those washes is also the ground the notch takes
       (`--ring-ground`). (`cell-d` is the hook rowOf reads.) -->
  <!-- literal: span 5; auto auto -->
  <!-- biome-ignore lint/a11y/useSemanticElements: a cell is a labelled group of figures and marks, not a form; a fieldset would draw a form's frame and legend -->
  <div
    data-slot="cell-d"
    {...props}
    aria-label={cellLabel(ring, c, shown)}
    class="relative col-(--cell-span) grid min-w-0 grid-cols-subgrid grid-rows-(--cell-rows) content-start items-start rounded-sm p-space-1 transition-[background-color] dur-fade ease-out data-carrying:inset-ring data-carrying:inset-ring-border-button-outline not-data-lit:data-limit:bg-meter-wash-over data-lit:bg-surface-hover motion-reduce:transition-off"
    data-account={ring.id}
    data-bind={ring.bind}
    data-carrying={(c !== null && ring.id === c.carry?.id) || undefined}
    data-flip
    data-flyover-anchor
    data-limit={ring.state === "limit" || undefined}
    data-lit={ring.id === lit || undefined}
    role="group"
    style:--cell-rows="auto auto"
    style:--cell-span="span 5"
    style:--ring-ground={groundOf(ring)}
  >
    {@render dial(ring, c, shown, side)}
    <!-- The first line, from the time's x to the share's end, so the name
         and the time start on one x and the status slot stands before both:
         the name (the Go plan's after its mark), then the session count at
         the line's end, on the share's end x. A name that wraps makes this
         line taller, the time's line stays beneath it. -->
    <span
      class="col-span-3 col-start-3 row-1 flex h-auto min-w-0 items-center gap-space-1 whitespace-normal"
    >
      {#if go}
        <!-- literal: 3px -->
        <span
          data-slot="mark"
          aria-hidden="true"
          class="inline-flex size-icon-md flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
          style:--mark-r="3px"><OpenCodeLogo /></span
        >
      {/if}
      <!-- The name strong, the domain's stem (where it is needed) quiet
           right after it, going under it only when the two don't fit. A
           name never ends in an ellipsis; one longer than the cell wraps. -->
      <span class="flex min-w-0 flex-wrap type-meta wrap-anywhere" data-name>
        <span class="min-w-0 font-medium text-ink-strong">{name.local}</span>
        {#if name.domain}
          <span class="text-ink-muted">{name.domain}</span>
        {/if}
      </span>
      {#if c && ring.id === c.delegate?.id}
        {@const tip = delegateTip(c, ring)}
        <Tip anchor={rowOf(ring.id)} label={tip} {side} tap>
          {#snippet children(tipProps)}
            <span
              {...tipProps}
              aria-label={tip}
              class="inline-grid flex-none text-ink-row"
              data-delegates
              role="img"
            >
              <IconSubagents aria-hidden="true" class="size-icon-sm" />
            </span>
          {/snippet}
        </Tip>
      {/if}
      {@render sessionsChip(ring, shown)}
    </span>
    {@render lineTwo(ring, cellTime(ring, c, now), side)}
  </div>
{/snippet}

{#snippet limits(sheet: boolean)}
  <!-- Its size follows what it lists (a provider arriving, a note going).
       In the popover and in the sheet alike the head and the foot stand
       still and the accounts between them scroll. -->
  <!-- Never taller than the room bits-ui measures beside the strip (inside
       its collision padding), less the popover's 1px edge above and below:
       the head and the foot stand still, and the accounts between them
       scroll. The sheet: as the popover, the controls at the touch floor. -->
  <!-- literal: 12px 14px 10px; 4px 18px 12px; 10px 12px; 6px; 8px, 10px, 12px; 40px -->
  <div
    class={[
      "flex flex-col",
      sheet ? "max-h-none min-h-0 flex-auto" : "max-h-(--pop-max)",
    ]}
    style:--mark-r="3px"
    style:--mark-side="14px"
    style:--note-gap="6px"
    style:--pop-max="calc(var(--bits-popover-content-available-height) - 2px)"
    style:--ring-ground="var(--surface-raised)"
    style:--pop-edge="12px"
    style:--pop-step="10px"
    {@attach morph()}
  >
    {#if !(shown || gap) && notes.length === 0}
      <p class="px-(--pop-edge) py-(--pop-step) type-meta text-ink-muted">
        {empty}
      </p>
    {/if}
    {#if claude}
      <header
        class={[
          "flex flex-none flex-col gap-space-2",
          sheet
            ? "px-space-5 pt-space-1 pb-(--pop-edge)"
            : "px-space-4 pt-(--pop-edge) pb-(--pop-step)",
        ]}
        data-pop-head
      >
        <div class="flex items-center justify-between gap-space-2">
          <h3
            class="mark-line flex items-center gap-space-2 p-0 type-label text-ink-strong"
          >
            <span
              data-slot="mark"
              aria-hidden="true"
              class="inline-flex size-(--mark-side) flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
              data-box><ClaudeIcon /></span
            >
            <span>Claude</span>
          </h3>
          <!-- The answer first: how long until nothing can carry you, or,
               when nothing can now, after the refresh mark, when an
               account is back; said whole on a rest or a tap. -->
          <Tip label={stop?.tip ?? ""} side="bottom" tap>
            {#snippet children(props)}
              <!-- Nothing can carry you now: the refresh mark before when an
                   account is back, as the Usage page's lead draws it: Solar
                   duotone, at the figure's cap height, muted. -->
              <!-- literal: 0.25em; -0.1em; 0.8em -->
              <span
                data-num
                {...props}
                aria-label={stop?.said}
                class="type-kpi num whitespace-nowrap text-ink-stat data-muted:text-ink-muted"
                data-muted={claude.stale !== null || undefined}
                data-stop-kpi
                role="img"
                style:--kpi-glyph="0.8em"
                style:--kpi-glyph-drop="-0.1em"
                style:--kpi-glyph-gap="0.25em"
                >{#if stop?.back}
                  <span
                    aria-hidden="true"
                    class="me-(--kpi-glyph-gap) inline-grid align-(--kpi-glyph-drop) text-ink-muted"
                    data-stop-back
                    ><IconRefresh class="size-(--kpi-glyph)" /></span
                  >
                {/if}
                <Figure text={stop?.figure ?? ""} /></span
              >
            {/snippet}
          </Tip>
        </div>
        <Relay
          accounts={claude.accounts}
          {nameOf}
          {now}
          onlight={(id) => {
            lit = id;
          }}
          spans={usage.spans}
          stopAt={claude.stopAt}
        />
      </header>
    {/if}
    <!-- A sessions list hangs from its cell's row, as wide as the wall
         (SessionsChip). The house edge fade shows where more is above or
         below; a re-ranking reflows the cells. -->
    <!-- The house edge fade at its full length on every width, as Caw's
         panel has it: the phone's short one reads as no fade at all. Under
         the head, a hairline. -->
    <div
      class={[
        "kit-edge-fade-block min-h-0 flex-auto overflow-y-auto overscroll-contain",
        sheet && "kit-sheet-scroll",
        claude && "border-t border-t-border-hairline",
      ]}
      data-accounts
      data-flyover-scope
      style:--fade-len="40px"
      {@attach reflow()}
      {@attach wholeRows}
    >
      {#if claude}
        <!-- Claude's accounts: the wall, space-3 under the head's
             hairline. -->
        <!-- literal: 8px; 10px, 12px -->
        <div
          data-slot="group"
          class="group flex flex-col gap-space-3 px-(--group-pad-x) pt-space-3 pb-(--group-pad-y)"
          data-burn={claude.burn}
          data-burn-week={claude.burnWeek}
          style:--group-pad-x={sheet ? "12px" : "10px"}
          style:--group-pad-y="8px"
        >
          <!-- One grid for the whole wall, so every dial, every text start
               and every week's end stands on one x down it. An organization
               of more than two accounts is a group under its name; the rest
               follow, ungrouped, on rows of their own: a head spans the
               wall, so the next block starts a row. -->
          <!-- The dial wall: one grid, two columns of cells, each column five
               tracks: the dial, the status slot (12px, a glyph's size), the
               time, the week's mark (10px) and the week's share (as wide as
               "100%" in the figure face), so every dial, every time, every
               mark and every share's end stands on one x down the wall,
               whatever the figures. A block is no box of its own: its head
               and cells stand on the wall's grid. An organization's name
               over its accounts: meta, no chrome of its own, across the
               wall, starting on the dials' start edge. Every block after the
               first stands the same space-3 from the one before. -->
          <!-- literal: repeat(2, auto 12px minmax(0, 1fr) 10px auto) -->
          <div
            data-slot="wall"
            class="grid grid-cols-(--wall-cols) gap-space-1 [&>[data-slot=block]+[data-slot=block]>h4]:mt-(--org-gap)"
            data-flyover-span
            style:--org-gap="calc(var(--space-3) - var(--space-1))"
            style:--wall-cols="repeat(2, auto 12px minmax(0, 1fr) 10px auto)"
          >
            {#each wall as block (block.org ?? "")}
              <div
                data-slot="block"
                class="contents"
                data-org-group={block.org ?? ""}
              >
                {#if block.head}
                  <h4
                    class="col-span-full px-space-1 pt-0 pb-space-row type-meta text-ink-muted"
                    data-flyover-edge
                    data-org-head
                  >
                    {block.head}
                  </h4>
                {/if}
                {#each block.cells as ring (ring.id)}
                  {@render cell(ring, claude, sideFor())}
                {/each}
              </div>
            {/each}
            {#if openCode}
              <!-- The Go plan on the same grid, so its marks stand on
                   Claude's x's: a cell of the same recipe on the first
                   column, named by its provider, after the hairline that
                   parts the providers, drawn edge to edge. -->
              <div data-slot="block" class="contents" data-org-group="opencode">
                <!-- The providers' hairline, inside the wall's grid: across
                     the whole popover, edge to edge, as a section's edge
                     is: `border: 0`, then its top edge. -->
                <hr
                  class="col-span-full mx-(--seam-pull) my-space-1 border-t border-t-border-hairline border-r-none border-b-none border-l-none"
                  style:--seam-pull="calc(-1 * var(--group-pad-x))"
                />
                {@render cell(openCode, null, sideFor())}
              </div>
            {/if}
          </div>
        </div>
      {/if}
      {#if openCode && !claude}
        <!-- The Go plan: a cell of the same recipe on the wall's first
             column, named by its provider; the hairline before it parts it
             from Claude's. -->
        <!-- literal: 6px; 8px; 10px, 12px -->
        <section
          data-slot="group"
          class="group flex flex-col gap-(--note-gap) px-(--group-pad-x) py-(--group-pad-y)"
          style:--group-pad-x={sheet ? "12px" : "10px"}
          style:--group-pad-y="8px"
        >
          <!-- literal: repeat(2, auto 12px minmax(0, 1fr) 10px auto) -->
          <div
            data-slot="wall"
            class="grid grid-cols-(--wall-cols) gap-space-1"
            data-flyover-span
            style:--wall-cols="repeat(2, auto 12px minmax(0, 1fr) 10px auto)"
          >
            {@render cell(openCode, null, sideFor())}
          </div>
        </section>
      {/if}
      {#if gap}
        <!-- Claude's gap: the whole why the strip's line stands for, and
             the sign-in that fixes it when one does. -->
        <div
          class="flex flex-col items-start gap-space-2 px-(--pop-edge) py-(--pop-step) type-meta text-ink-muted"
        >
          <p class="mark-line flex items-center gap-(--note-gap)">
            <span
              data-slot="mark"
              aria-hidden="true"
              class="inline-flex size-(--mark-side) flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
              data-box><ClaudeIcon /></span
            >
            <span>{gap.reason}</span>
          </p>
          {#if gap.signIn}
            <Button
              href="/config/accounts"
              icon={IconKey}
              label="Sign in an account"
              size="xs"
              variant="outline"
            />
          {/if}
        </div>
      {/if}
      {#each notes as note (note.id)}
        {@const Mark = note.mark}
        <!-- A provider with nothing to draw: why, and what to do about it.
             A hairline parts it from the group, the gap or the note before
             it. -->
        <p
          class="mark-line flex items-center gap-(--note-gap) px-(--pop-edge) py-(--pop-step) type-meta text-ink-muted not-first:border-t not-first:border-t-border-hairline"
        >
          <span
            data-slot="mark"
            aria-hidden="true"
            class="inline-flex size-(--mark-side) flex-none overflow-hidden rounded-(--mark-r) [&_svg]:size-full"
            data-box><Mark /></span
          >
          <span>{note.text}</span>
        </p>
      {/each}
    </div>
    <!-- literal: 10px (--pop-step); 44px -->
    <div
      data-slot="foot"
      class="flex-none border-t border-t-border-hairline px-space-4 py-(--pop-step)"
      data-pop-foot
    >
      <Button
        class={sheet ? "h-(--foot-touch) w-full" : undefined}
        href="/usage"
        label="Open usage"
        size="sm"
        style={sheet ? "--foot-touch: 44px;" : undefined}
        variant="outline"
      />
    </div>
  </div>
{/snippet}

<!-- Its ground is the surface it stands on: the rail's by default, the phone
     home's raised card. A reserve notch is cut in the same paint. One
     control, one height whatever it says (`data-strip-hit`, which the
     usage-relay bench finds it by); under the pointer or open it paints its
     own ground, and the dials' reserve notch takes it (`ring-ground-*`). -->
<!-- literal: 44px, 56px -->
<div
  data-slot="strip"
  class="group/strip relative w-full min-w-0 rounded-sm bg-(--ring-ground) variant-home:rounded-md"
  data-variant={variant}
  style:--ring-ground="var(--strip-ground, var(--sidebar))"
  style:--strip-ground={variant === "home"
    ? "var(--surface-raised)"
    : undefined}
  style:--strip-hit-h={variant === "home" ? "56px" : "44px"}
>
  {#if touch.current}
    <!-- On touch every account rises in the house sheet, as a tab's details
         and a peek do; with a fine pointer it is a popover by the strip. -->
    <Drawer.Root bind:open>
      <Drawer.Trigger
        aria-label={triggerLabel}
        class="press-tint touch-hit flex h-(--strip-hit-h) w-full cursor-pointer items-center rounded-sm border-none border-current bg-transparent px-space-3 py-0 text-start text-ink-strong transition-[background-color] dur-control ease-out group-variant-home/strip:rounded-md group-variant-home/strip:px-space-4 hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover state-open:bg-surface-hover state-open:ring-ground-surface-hover"
        data-strip-hit
        onkeydown={keyed}
        onpointerdown={pressed}
      >
        {@render face()}
      </Drawer.Trigger>
      <Drawer.Content onOpenAutoFocus={keepFocus}>
        <Drawer.Header>
          <Drawer.Title>Usage limits</Drawer.Title>
        </Drawer.Header>
        {@render limits(true)}
      </Drawer.Content>
    </Drawer.Root>
  {:else}
    <Popover.Root bind:open>
      <Popover.Trigger
        aria-label={triggerLabel}
        class="press-tint flex h-(--strip-hit-h) w-full cursor-pointer items-center rounded-sm border-none border-current bg-transparent px-space-3 py-0 text-start text-ink-strong transition-[background-color] dur-control ease-out group-variant-home/strip:rounded-md group-variant-home/strip:px-space-4 hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover state-open:bg-surface-hover state-open:ring-ground-surface-hover"
        data-strip-hit
        onkeydown={keyed}
        onpointerdown={pressed}
      >
        {@render face()}
      </Popover.Trigger>
      <!-- literal: 100vw, 16px -->
      <Popover.Content
        align="start"
        class="w-(--usage-pop-w)"
        collisionPadding={8}
        frame="panel"
        gap="none"
        onOpenAutoFocus={keepFocus}
        pad="none"
        side="top"
        sideOffset={6}
        style="--usage-pop-w: min(var(--c-panel-w), calc(100vw - 16px));"
      >
        {@render limits(false)}
      </Popover.Content>
    </Popover.Root>
  {/if}
</div>
