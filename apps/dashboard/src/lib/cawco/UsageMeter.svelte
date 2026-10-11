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
  import { IconKey, IconSubagents } from "#lib/icons.js";
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
    delegateLine,
    openCodeStop,
    orgGroups,
    plain,
    type RingAccount,
    staleTip,
    stopOf,
    stopText,
    weekLeft,
  } from "./usage/rings";
  import SessionsChip from "./usage/SessionsChip.svelte";
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
  /** A cell: its account, and whether an organization's head stands over it. */
  interface WallCell {
    grouped: boolean;
    ring: RingAccount;
  }
  /** An organization's cells under its name, or (null) the ungrouped ones. */
  interface WallBlock {
    cells: WallCell[];
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
      cells: ranked(group.accounts, claude).map((ring) => ({
        ring,
        grouped: group.org !== null,
      })),
    }));
  });

  /** An email domain's top level ("gmail.com" → "gmail"). */
  const TOP_DOMAIN = /\.[^.]+$/;
  /** An account's first name line: its nickname, else its email's local part. */
  const localOf = (ring: RingAccount): string =>
    ring.nick || !ring.email
      ? ring.name
      : ring.email.slice(0, ring.email.lastIndexOf("@"));
  /** How many accounts shown together go by each first line. */
  const locals = $derived.by(() => {
    const count = new Map<string, number>();
    for (const ring of [...(claude?.accounts ?? []), openCode]) {
      if (ring) {
        count.set(localOf(ring), (count.get(localOf(ring)) ?? 0) + 1);
      }
    }
    return count;
  });
  /**
   * A cell's name: its first line, then, only where an ungrouped account
   * shares that first line with another shown with it, its domain's stem
   * ("@gmail"). Under an organization's head the head tells them apart.
   */
  const cellName = (
    ring: RingAccount,
    grouped: boolean
  ): { local: string; domain: string } => {
    const local = localOf(ring);
    const shared = (locals.get(local) ?? 0) > 1;
    return {
      local,
      domain:
        !grouped && shared && ring.email
          ? `@${ring.email.slice(ring.email.lastIndexOf("@") + 1).replace(TOP_DOMAIN, "")}`
          : "",
    };
  };
  /** Where new delegates start, said under the wall in the name its cell shows. */
  const delegates = $derived.by(() => {
    const to = claude?.delegate;
    if (!(claude && to)) {
      return [];
    }
    const grouped = new Set(
      wall.flatMap((block) =>
        block.cells.filter((cell) => cell.grouped).map((cell) => cell.ring.id)
      )
    );
    return delegateLine(claude, (ring) => {
      const name = cellName(ring, grouped.has(ring.id));
      return `${name.local}${name.domain}`;
    });
  });

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

  const weekUsed = (ring: RingAccount) =>
    ring.week ? `week ${100 - ring.week.left}%` : "";

  /** The strip read out: what its one control is called. */
  const triggerLabel = $derived.by(() => {
    if (!shown) {
      return `${gap?.short ?? empty}. Show every limit.`;
    }
    const said: string[] = [];
    if (claude) {
      said.push(
        `Claude: ${stopText(claude, now)} until you're stopped, ${plain(caption(claude, now))}`
      );
    }
    if (openCode) {
      said.push(
        `opencode Go: ${openCodeStop(openCode, now)}, ${weekUsed(openCode)}`
      );
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
    <span class="noline">{gap?.short ?? empty}</span>
  {:else}
    <span class="cells">
      {#if claude}
        <span class="cell" data-cell="claude">
          <span class="l1">
            <span aria-hidden="true" class="mark"><ClaudeIcon /></span>
            <span
              class="marks"
              data-strip-marks
              style:flex-basis="{claude.accounts.length * SLOT - 4}px"
              {@attach roomFor}
            >
              {#each stripMarks as ring, i (ring.id)}
                <span
                  class="slot"
                  style:inset-inline-start={slotAt(
                    i,
                    stripMarks.length + (stripMore > 0 ? 1 : 0)
                  )}
                  use:slot={i}
                >
                  <Rings index={i} reveal {ring} size={16} />
                </span>
              {/each}
              {#if stripMore > 0}
                <!-- The rest, counted: the popover shows every one. -->
                <span
                  class="slot more"
                  data-strip-more
                  style:inset-inline-start={slotAt(
                    stripMarks.length,
                    stripMarks.length + 1
                  )}
                  >+{stripMore}</span
                >
              {/if}
            </span>
            <span
              class="digits"
              data-strip-digits
              class:muted={claude.stale !== null}
              ><Figure text={stopText(claude, now)} /></span
            >
          </span>
          <span class="cap" data-next={claude.next?.id} data-strip-caption
            ><Words parts={caption(claude, now)} /></span
          >
        </span>
      {/if}
      {#if openCode}
        <span class="cell oc" data-cell="opencode">
          <span class="l1">
            <span aria-hidden="true" class="mark"><OpenCodeLogo /></span>
            <Rings reveal ring={openCode} size={16} />
            <span class="digits"
              ><Figure text={openCodeStop(openCode, now)} /></span
            >
          </span>
          <span class="cap">{weekUsed(openCode)}</span>
        </span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet cell(
  ring: RingAccount,
  grouped: boolean,
  time: CellTime
)}
  <!-- A cell of the dial wall, one row on its wall column's three tracks
       (subgrid): the 32px double dial (its disc the 5-hour window, its rim
       the week) on both lines; its name on the first, the sessions it runs
       at that line's end; how long it lasts, then its week at the end, on
       the second. A re-ranking slides it to its new place (motion/rows). -->
  {@const name = cellName(ring, grouped)}
  {@const week = weekLeft(ring)}
  <div
    class="cell-d"
    data-account={ring.id}
    data-bind={ring.bind}
    data-flip
    data-flyover-anchor
    class:carrying={ring.id === claude?.carry?.id}
    class:limit={ring.state === "limit"}
  >
    <span class="dial">
      {#if ring.state === "stale"}
        <Tip label={staleTip(ring, now)} side="top">
          {#snippet children(
            props
          )}
            <button
              {...props}
              aria-label={staleTip(ring, now)}
              class="ring-tip"
              data-stale-ring
              type="button"
            >
              <Rings {ring} size={32} />
            </button>
          {/snippet}
        </Tip>
      {:else}
        <Rings {ring} size={32} />
      {/if}
    </span>
    <!-- The first line: the name, the domain's stem right after it only
         where it tells two accounts apart, and the session count at the
         line's end. -->
    <span class="l1">
      <span class="nm" data-name>
        <span class="nm-local">{name.local}</span>
        {#if name.domain}
          <span class="nm-domain">{name.domain}</span>
        {/if}
      </span>
      {#if ring.sessions.length > 0}
        <span class="cell-chip">
          <SessionsChip
            account={ring.name}
            name={`${name.local}${name.domain}`}
            onopen={putAway}
            sessions={ring.sessions}
          />
        </span>
      {/if}
    </span>
    <!-- Its words a space apart; the tilde of a time worked out from an
         old reading hangs before the line, so every time's first figure
         stands on one x. -->
    <span class="line" data-time>
      {#if time.guess}
        <span class="tilde">~</span>
      {/if}
      {#if time.lead}
        <span>{time.lead}</span>
      {/if}
      {#if time.figure}
        <span class="fig num">{time.figure}</span>
      {/if}
      {#if time.tail}
        <span>{time.tail}</span>
      {/if}
    </span>
    {#if week !== null}
      <span class="line wk" data-week
        >wk <span class="fig num">{week}%</span></span
      >
    {/if}
  </div>
{/snippet}

{#snippet limits(
  sheet: boolean
)}
  <!-- Its size follows what it lists (a provider arriving, a note going).
       In the popover and in the sheet alike the head and the foot stand
       still and the accounts between them scroll. -->
  <div class="pop-body" {@attach morph()}>
    {#if !(shown || gap) && notes.length === 0}
      <p class="pop-empty">{empty}</p>
    {/if}
    {#if claude}
      <header class="pop-head" data-pop-head>
        <div class="head-line">
          <h3 class="provider">
            <span aria-hidden="true" class="mark"><ClaudeIcon /></span>
            Claude
          </h3>
          <span class="stop">
            <span class="kpi num" class:muted={claude.stale !== null}
              ><Figure text={stopText(claude, now)} /></span
            >
            <span class="stop-meta">until Claude stops</span>
          </span>
        </div>
        <Relay accounts={claude.accounts} {now} spans={usage.spans} />
      </header>
    {/if}
    <!-- A sessions list hangs from its cell's row, as wide as the wall
         (SessionsChip). The house edge fade shows where more is above or
         below; a re-ranking reflows the cells. -->
    <div
      class={["accounts kit-edge-fade-block", sheet && "kit-sheet-scroll"]}
      data-accounts
      data-flyover-scope
      {@attach reflow()}
      {@attach wholeRows}
    >
      {#if claude}
        <div
          class="group orgs"
          data-burn={claude.burn}
          data-burn-week={claude.burnWeek}
        >
          <!-- One grid for the whole wall, so every dial, every text start
               and every week's end stands on one x down it. An organization
               of more than two accounts is a group under its name; the rest
               follow, ungrouped, on rows of their own: a head spans the
               wall, so the next block starts a row. -->
          <div class="wall" data-flyover-span>
            {#each wall as block (block.org ?? "")}
              <div class="block" data-org-group={block.org ?? ""}>
                {#if block.head}
                  <h4 class="org" data-flyover-edge data-org-head>
                    {block.head}
                  </h4>
                {/if}
                {#each block.cells as one (one.ring.id)}
                  {@render cell(
                    one.ring,
                    one.grouped,
                    cellTime(one.ring, claude, now)
                  )}
                {/each}
              </div>
            {/each}
          </div>
          <!-- The dial's key: what the disc and the ring measure. -->
          <p class="key" data-dial-key data-flyover-edge>
            Disc: 5-hour window left · Ring: week left
          </p>
          {#if delegates.length > 0}
            <!-- Where new delegates start, said whole: no word to hover. -->
            <p class="delegates num" data-delegates data-flyover-edge>
              <IconSubagents aria-hidden="true" />
              <Words parts={delegates} />
            </p>
          {/if}
        </div>
      {/if}
      {#if openCode}
        <section class="group">
          <h3 class="provider" data-flyover-edge>
            <span aria-hidden="true" class="mark"><OpenCodeLogo /></span>
            opencode Go
          </h3>
          <div class="wall" data-flyover-span>
            {@render cell(openCode, true, cellTime(openCode, null, now))}
          </div>
        </section>
      {/if}
      {#if gap}
        <!-- Claude's gap: the whole why the strip's line stands for, and
             the sign-in that fixes it when one does. -->
        <div class="pop-empty pop-gap">
          <p class="pop-note">
            <span aria-hidden="true" class="mark"><ClaudeIcon /></span>
            {gap.reason}
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
        <!-- A provider with nothing to draw: why, and what to do about it. -->
        <p class="pop-empty pop-note">
          <span aria-hidden="true" class="mark"><Mark /></span>
          {note.text}
        </p>
      {/each}
    </div>
    <div class="foot" data-pop-foot>
      <Button href="/usage" label="Open Usage" size="sm" variant="outline" />
    </div>
  </div>
{/snippet}

<div class="strip" data-variant={variant}>
  {#if touch.current}
    <!-- On touch every account rises in the house sheet, as a tab's details
         and a peek do; with a fine pointer it is a popover by the strip. -->
    <Drawer.Root bind:open>
      <Drawer.Trigger
        aria-label={triggerLabel}
        class="strip-hit press-tint touch-hit"
        onkeydown={keyed}
        onpointerdown={pressed}
      >
        {@render face()}
      </Drawer.Trigger>
      <Drawer.Content class="usage-sheet" onOpenAutoFocus={keepFocus}>
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
        class="strip-hit press-tint"
        onkeydown={keyed}
        onpointerdown={pressed}
      >
        {@render face()}
      </Popover.Trigger>
      <Popover.Content
        align="start"
        class="usage-pop w-[min(var(--c-panel-w),calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
        collisionPadding={8}
        onOpenAutoFocus={keepFocus}
        side="top"
        sideOffset={6}
      >
        {@render limits(false)}
      </Popover.Content>
    </Popover.Root>
  {/if}
</div>

<style>
  /* Its ground is the surface it stands on: the rail's by default, the
     phone home's raised card. A reserve notch is cut in the same paint. */
  .strip {
    --ring-ground: var(--strip-ground, var(--sidebar));
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    border-radius: var(--radius-sm);
    background: var(--ring-ground);
  }
  .strip[data-variant="home"] {
    --strip-ground: var(--surface-raised);
    border-radius: var(--radius-md);
  }
  /* One control, one height whatever it says. */
  :global(.strip-hit) {
    display: flex;
    align-items: center;
    inline-size: 100%;
    block-size: 44px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: start;
    color: var(--ink-strong);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
        --ring-ground: var(--surface-hover);
      }
    }
    &[aria-expanded="true"],
    &[data-state="open"] {
      background: var(--surface-hover);
      --ring-ground: var(--surface-hover);
    }
  }
  .strip[data-variant="home"] :global(.strip-hit) {
    block-size: 56px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
  }
  .noline {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Claude's cell asks for its whole first line and caption, and never takes
     less than its marks and digits; opencode's is as wide as it says. Where
     the rail is too narrow for both, opencode's cell wraps onto a second row
     the strip does not show (it stays in the strip's label and the popover),
     rather than Claude's answer being cut: one row of cells, 34px (the first
     line, 3px, the caption). */
  .cells {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    column-gap: var(--space-2);
    block-size: 34px;
    min-inline-size: 0;
    overflow: clip;
  }
  .strip[data-variant="home"] .cells {
    column-gap: var(--space-6);
  }
  .cell {
    display: flex;
    flex: none;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    block-size: 34px;
  }
  .cell[data-cell="claude"] {
    flex: 1 1 auto;
  }
  .l1 {
    display: flex;
    align-items: center;
    gap: 6px;
    block-size: 16px;
    min-inline-size: 0;
    white-space: nowrap;
  }
  .mark {
    display: inline-flex;
    flex: none;
    inline-size: 14px;
    block-size: 14px;
    overflow: hidden;
    border-radius: 3px;

    & :global(svg) {
      inline-size: 100%;
      block-size: 100%;
    }
  }
  .group .mark {
    inline-size: 16px;
    block-size: 16px;
  }
  /* The marks are the part of line 1 that gives: they ask for a slot each
     and shrink to one mark's width, the marks closing up inside (slotAt),
     so the Claude mark and the digits always stand whole inside the cells'
     clip. */
  .marks {
    position: relative;
    flex-grow: 0;
    flex-shrink: 1;
    min-inline-size: 16px;
    block-size: 16px;
  }
  .slot {
    position: absolute;
    inset-block-start: 0;
    display: grid;
    transition: inset-inline-start var(--dur-reveal) var(--ease-in-out);
  }
  /* "+N": the accounts past what stands a slot apart, in meta. */
  .slot.more {
    place-items: center;
    min-inline-size: 16px;
    block-size: 16px;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    color: var(--ink-muted);
  }
  .digits {
    flex: none;
    font: var(--weight-strong) var(--text-label) / 16px var(--font-body);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  .digits.muted {
    color: var(--ink-muted);
  }
  /* One line. Its whole width is what the cell asks for, but it may break
     anywhere, so it never holds the cell wider than the marks and digits:
     only when the rail cannot fit it at all does it end in an ellipsis. */
  .cap {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    min-inline-size: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    font: var(--weight-body) var(--text-meta) / 15px var(--font-body);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);

    & :global(b) {
      color: var(--ink-row);
    }
  }

  /* ── the popover and the sheet ── */
  /* Never taller than the room bits-ui measures beside the strip (inside
     its collision padding), less the popover's 1px edge above and below:
     the head and the foot stand still, and the accounts between them
     scroll. */
  .pop-body {
    --ring-ground: var(--surface-raised);
    display: flex;
    flex-direction: column;
    max-block-size: calc(var(--bits-popover-content-available-height) - 2px);
  }
  .pop-head {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    padding: 12px 14px 10px;
  }
  .head-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  /* The answer first: how long until nothing can carry you. */
  .stop {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .kpi {
    font: var(--type-kpi);
    white-space: nowrap;
    color: var(--ink-stat);
  }
  .kpi.muted {
    color: var(--ink-muted);
  }
  .stop-meta {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The house edge fade at its full length on every width, as Caw's panel
     has it: the phone's short one reads as no fade at all. */
  .accounts {
    --fade-len: 40px;
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .pop-head + .accounts {
    border-block-start: 1px solid var(--border-hairline);
  }
  .pop-empty {
    padding: 10px 12px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .pop-note {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
  }
  .pop-gap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .group + .group,
  .group + .pop-note,
  .pop-gap + .pop-note,
  .pop-note + .pop-note {
    border-block-start: 1px solid var(--border-hairline);
  }
  /* Claude's accounts: the wall, the dial's key and the delegates line,
     space-3 apart, the wall space-3 under the head's hairline. */
  .orgs {
    gap: var(--space-3);
    padding-block-start: var(--space-3);
  }
  .provider {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 var(--space-1) 2px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pop-head .provider {
    padding: 0;
  }
  /* An organization's name over its accounts: meta, no chrome of its own,
     across the wall, starting on the dials' start edge. Every block after
     the first stands the same space-3 from the one before. */
  .org {
    grid-column: 1 / -1;
    padding: 0 var(--space-1) 2px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .block + .block > .org {
    margin-block-start: calc(var(--space-3) - var(--space-1));
  }
  /* A stale ring is its tooltip's trigger: a bare button, the ring itself. */
  .ring-tip {
    display: grid;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: help;
  }
  /* The dial wall: one grid, two columns of cells, each column three
     tracks (the dial, the text, the week), so every dial, every text start
     and every week's end stands on one x down the wall. A block is no box
     of its own: its head and cells stand on the wall's grid. */
  .wall {
    display: grid;
    grid-template-columns: repeat(2, auto minmax(0, 1fr) auto);
    gap: var(--space-1);
  }
  .block {
    display: contents;
  }
  /* A cell: one row on its column's three tracks (subgrid), space-1 in on
     every side, in meta. The carrier wears a hairline ring; an account at
     its limit the limit wash, which the dial's reserve notch takes as its
     ground. */
  .cell-d {
    position: relative;
    display: grid;
    grid-column: span 3;
    grid-template-columns: subgrid;
    grid-template-rows: auto auto;
    align-content: start;
    align-items: start;
    min-inline-size: 0;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .cell-d.carrying {
    box-shadow: inset 0 0 0 1px var(--border-control);
  }
  .cell-d.limit {
    background: var(--meter-wash-over);
    --ring-ground: var(--meter-wash-over);
  }
  /* The dial, centred on the two lines, space-2 before the text: the
     wall's space-1 gap and the rest here. */
  .dial {
    display: grid;
    grid-row: 1 / span 2;
    grid-column: 1;
    align-self: center;
    margin-inline-end: calc(var(--space-2) - var(--space-1));
  }
  /* The first line, across the text and the week: the name, then the
     session count at the line's end, on the week's end x. */
  .l1 {
    display: flex;
    grid-row: 1;
    grid-column: 2 / span 2;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  /* The name strong, the domain's stem (where it is needed) quiet right
     after it, going under it only when the two don't fit. A name never
     ends in an ellipsis; one longer than the cell wraps. */
  .nm {
    display: flex;
    flex-wrap: wrap;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font: var(--type-meta);
  }
  .nm-local {
    min-inline-size: 0;
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .nm-domain {
    color: var(--ink-muted);
  }
  /* The count, 16px. Its touch area reaches the full 44px up and down,
     and space-5 / 2 to either side: a count in the last column stays
     inside the wall's padding, so the accounts never scroll sideways. */
  .cell-chip {
    --hit-gap-x: var(--space-5);
    display: grid;
    margin-inline-start: auto;
  }
  /* The second line: the time at the text's start, the week at the end,
     their figures tabular (.num). A figure never breaks, nor does the
     week; a time too long for its track ("back in 4h 50m" in a narrow
     sheet) goes on under its words rather than run into the week. */
  .line {
    grid-row: 2;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line[data-time] {
    position: relative;
    grid-column: 2;
  }
  .fig,
  .wk {
    white-space: nowrap;
  }
  .wk {
    grid-column: 3;
    justify-self: end;
  }
  /* A guess's tilde hangs in the gap before the text, so "~3h 14m" starts
     its figure on the x "2h 21m" does. */
  .tilde {
    position: absolute;
    inset-inline-end: 100%;
  }
  /* The dial's key, under the wall, in meta. */
  .key {
    padding: 0 var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Where new delegates start, in words under the wall. */
  .delegates {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    padding: 0 var(--space-1);
    font: var(--type-meta);
    color: var(--ink-row);

    & :global(svg) {
      flex: none;
      inline-size: 16px;
      block-size: 16px;
      color: var(--ink-muted);
    }
  }
  .foot {
    flex: none;
    padding: 10px 14px;
    border-block-start: 1px solid var(--border-hairline);
  }
  /* The sheet: as the popover, the head and the foot stand still and the
     accounts between them scroll, the controls at the touch floor. */
  :global(.usage-sheet) .pop-body {
    flex: 1 1 auto;
    min-block-size: 0;
    max-block-size: none;
  }
  :global(.usage-sheet) .pop-head {
    padding: 4px 18px 12px;
  }
  :global(.usage-sheet) .group {
    padding: 8px 12px;
  }
  :global(.usage-sheet) .orgs {
    padding-block-start: var(--space-3);
  }
  :global(.usage-sheet) .foot :global(a) {
    inline-size: 100%;
    block-size: 44px;
  }

  @media (prefers-reduced-motion: reduce) {
    .slot,
    .cell-d {
      transition: none;
    }
  }
</style>
