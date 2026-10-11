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
   * and every account as a cell of the dial wall, four across (grouped by
   * organization where one has more than two): its 56px double dial, its
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
  import { MediaQuery } from "svelte/reactivity";
  import { badgeVariants } from "#lib/components/ui/badge/index.js";
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
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import { claudeGap } from "./usage";
  import Figure from "./usage/Figure.svelte";
  import { startForecast, usage } from "./usage/forecast.svelte";
  import Relay from "./usage/Relay.svelte";
  import Rings from "./usage/Rings.svelte";
  import {
    caption,
    cellTime,
    delegateLine,
    openCodeStop,
    orgGroups,
    plain,
    type RingAccount,
    staleTip,
    stopText,
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

  // ── the dial wall ──
  /** Cells across the wall. */
  const ACROSS = 4;
  /** A cell: its account, and whether an organization's head stands over it. */
  interface WallCell {
    grouped: boolean;
    ring: RingAccount;
  }
  /**
   * A row of cells; from `join` on they are ungrouped accounts that went on
   * along an organization's last row, after a hairline.
   */
  interface WallRow {
    cells: WallCell[];
    join: number;
  }
  /** An organization's rows under its name, or (null) the ungrouped ones. */
  interface WallBlock {
    org: string | null;
    rows: WallRow[];
  }
  const rowsOf = (cells: WallCell[]): WallRow[] =>
    Array.from({ length: Math.ceil(cells.length / ACROSS) }, (_, i) => {
      const slice = cells.slice(i * ACROSS, (i + 1) * ACROSS);
      return { cells: slice, join: slice.length };
    });
  /**
   * Claude's accounts as blocks of rows, four across. Where the last
   * organization's last row leaves two or more places, the ungrouped
   * accounts go on along it, one place short of full so the hairline
   * between them has room; the rest stand in rows of their own after the
   * group gap.
   */
  const wall = $derived.by((): WallBlock[] => {
    if (!claude) {
      return [];
    }
    const blocks: WallBlock[] = [];
    for (const group of orgGroups(claude.accounts)) {
      const cells = group.accounts.map((ring) => ({
        ring,
        grouped: group.org !== null,
      }));
      const last = blocks.at(-1)?.rows.at(-1);
      if (group.org === null && last && ACROSS - last.cells.length >= 2) {
        last.join = last.cells.length;
        last.cells.push(...cells.splice(0, ACROSS - last.cells.length - 1));
      }
      if (cells.length > 0) {
        blocks.push({ org: group.org, rows: rowsOf(cells) });
      }
    }
    return blocks;
  });
  /** Each row's columns: four cells' widths, a hairline's where one joins. */
  const columnsOf = (row: WallRow): string =>
    row.join < row.cells.length
      ? `repeat(${row.join}, var(--cell)) auto repeat(${row.cells.length - row.join}, var(--cell))`
      : `repeat(${ACROSS}, var(--cell))`;

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
   * A cell's name on two lines: its first line, then, only where an
   * ungrouped account shares that first line with another shown with it,
   * its domain's stem ("@gmail"). Under an organization's head the head
   * tells them apart.
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
  /** The space inside a figure ("1h 20m"). */
  const FIGURE_SPACE = /(\d[hm]) (?=\d)/g;
  /**
   * A cell's time with its figure held together: in a narrow cell "back
   * in", "over" or "left" takes a line of its own, never half the figure.
   */
  const unbroken = (time: string): string => time.replace(FIGURE_SPACE, "$1 ");
  /** Its week, one style in every cell: "wk 62%" left, "wk 0%" at its limit. */
  const weekText = (ring: RingAccount): string => {
    if (ring.limitOn === "week") {
      return "wk 0%";
    }
    return ring.week ? `wk ${ring.week.left}%` : "";
  };
  /** Where new delegates start, said under the wall in the name its cell shows. */
  const delegates = $derived.by(() => {
    const to = claude?.delegate;
    if (!(claude && to)) {
      return [];
    }
    const grouped = wall.some((block) =>
      block.rows.some((row) =>
        row.cells.some((cell) => cell.ring.id === to.id && cell.grouped)
      )
    );
    const name = cellName(to, grouped);
    return delegateLine(claude, `${name.local}${name.domain}`);
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

  /** Touch, or a phone's width: the limits open in the house bottom sheet. */
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
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
              style:flex-basis="{claude.accounts.length * SLOT - 4}px"
            >
              {#each claude.accounts as ring, i (ring.id)}
                <span
                  class="slot"
                  style:inset-inline-start={slotAt(i, claude.accounts.length)}
                  use:slot={i}
                >
                  <Rings index={i} reveal {ring} size={16} />
                </span>
              {/each}
            </span>
            <span
              class="digits"
              data-strip-digits
              class:muted={claude.stale !== null}
              ><Figure text={stopText(claude, now)} /></span
            >
          </span>
          <span class="cap" data-strip-caption
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
  time: string
)}
  <!-- A cell of the dial wall: the sessions it runs at its top corner, off
       the dial; the double dial at 56px (its disc the 5-hour window, its
       rim the week); its name on two lines; how long it lasts; its week.
       Its four parts are the row's four tracks (subgrid), so every time and
       every week stand on one line across the row. -->
  {@const name = cellName(ring, grouped)}
  {@const week = weekText(ring)}
  <div
    class="cell-d"
    data-account={ring.id}
    data-flyover-anchor
    class:carrying={ring.id === claude?.carry?.id}
    class:limit={ring.state === "limit"}
  >
    {#if ring.sessions.length > 0}
      <span class="cell-chip">
        <SessionsChip
          account={ring.name}
          onopen={putAway}
          sessions={ring.sessions}
        />
      </span>
    {/if}
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
              <Rings {ring} size={56} />
            </button>
          {/snippet}
        </Tip>
      {:else}
        <Rings {ring} size={56} />
      {/if}
    </span>
    <!-- Two lines in every cell: the first line, then the domain's stem
         only where it tells two accounts apart. -->
    <span class="nm" data-name>
      <span class="nm-local">{name.local}</span>
      <span class="nm-domain">{name.domain}</span>
    </span>
    <span class="line" data-time>{unbroken(time)}</span>
    <span class="line" data-week>{week}</span>
  </div>
{/snippet}

{#snippet wallRows(
  rows: WallRow[]
)}
  {#each rows as row, r (r)}
    <!-- A row with a session count holds the chip's band over its dials. -->
    <div
      class="wall-row"
      style:grid-template-columns={columnsOf(row)}
      class:chips={row.cells.some((one) => one.ring.sessions.length > 0)}
    >
      {#each row.cells as one, i (one.ring.id)}
        {#if i === row.join}
          <span aria-hidden="true" class="seam" data-seam></span>
        {/if}
        {@render cell(one.ring, one.grouped, cellTime(one.ring, claude, now))}
      {/each}
    </div>
  {/each}
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
            <span class="kpi" class:muted={claude.stale !== null}
              ><Figure text={stopText(claude, now)} /></span
            >
            <span class="stop-meta">until Claude stops</span>
          </span>
        </div>
        <Relay accounts={claude.accounts} {now} spans={usage.spans} />
      </header>
    {/if}
    <!-- A sessions list hangs from its cell's row, as wide as the wall
         (SessionsChip). -->
    <div class={["accounts", sheet && "kit-sheet-scroll"]} data-accounts>
      {#if claude}
        <div class="group orgs">
          <!-- An organization of more than two accounts is a group under its
               name; the rest follow, ungrouped, along its last row after a
               hairline when two places are left there, else after the same
               gap a group's name stands after. -->
          {#each wall as block (block.org ?? "")}
            <div
              class="wall"
              data-flyover-span
              data-org-group={block.org ?? ""}
            >
              {#if block.org}
                <h4 class="org" data-org-head>{block.org}</h4>
              {/if}
              {@render wallRows(block.rows)}
            </div>
          {/each}
          {#if delegates.length > 0}
            <!-- Where new delegates start, said whole: no word to hover. -->
            <p class="delegates" data-delegates>
              <IconSubagents aria-hidden="true" />
              <Words parts={delegates} />
            </p>
          {/if}
        </div>
      {/if}
      {#if openCode}
        <section class="group">
          <h3 class="provider">
            <span aria-hidden="true" class="mark"><OpenCodeLogo /></span>
            opencode Go
          </h3>
          <div class="wall" data-flyover-span>
            <div class="wall-row" class:chips={openCode.sessions.length > 0}>
              {@render cell(openCode, true, cellTime(openCode, null, now))}
            </div>
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
        class="usage-pop w-[min(20rem,calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
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
    font-variant-numeric: tabular-nums;
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
  .accounts {
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
  /* Claude's accounts, a block per organization and one for the rest: the
     same gap stands before every block, the first one's after the head's
     hairline, so the accounts after a group read apart from it as a group
     after its name does, with no label of their own. */
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
  /* An organization's name over its accounts: meta, no chrome of its own. */
  .org {
    padding: 0 var(--space-1) 2px;
    font: var(--type-meta);
    color: var(--ink-muted);
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
  /* The dial wall: an organization's name, then its rows of four, one
     pitch apart. */
  .wall {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  /* A row: four cells' widths (a quarter of the wall less the gaps, so a
     short row keeps the same pitch), and the four tracks every cell's parts
     stand on: the dial, the name, the time, the week. */
  .wall-row {
    --cell: calc((100% - 3 * var(--space-1)) / 4);
    display: grid;
    grid-template-columns: repeat(4, var(--cell));
    grid-template-rows: repeat(4, auto);
    column-gap: var(--space-1);
    row-gap: 2px;
  }
  /* Ungrouped accounts going on along an organization's last row: a
     hairline the wall's height between, a wider gap either side. */
  .seam {
    grid-row: 1 / -1;
    inline-size: 1px;
    margin-inline: var(--space-2);
    background: var(--border-hairline);
  }
  /* A cell: the dial over its name, its time and its week, centred, in
     meta, on its row's tracks. The carrier wears a hairline ring; an
     account at its limit the limit wash, which the dial's reserve notch
     takes as its ground. */
  .cell-d {
    position: relative;
    display: grid;
    grid-row: 1 / -1;
    grid-template-rows: subgrid;
    justify-items: center;
    align-items: start;
    min-inline-size: 0;
    padding: var(--space-1) 2px;
    border-radius: var(--radius-sm);
    text-align: center;
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .cell-d.carrying {
    box-shadow: inset 0 0 0 1px var(--border-control);
  }
  .cell-d.limit {
    background: var(--meter-wash-over);
    --ring-ground: var(--meter-wash-over);
  }
  .dial {
    display: grid;
  }
  /* The session count stands in a band over the dials of its row, at its
     cell's top corner, clear of the week rim. */
  .wall-row.chips .dial {
    margin-block-start: calc(1.25rem + var(--space-1));
  }
  .cell-chip {
    position: absolute;
    inset-block-start: var(--space-1);
    inset-inline-end: 2px;
  }
  /* Two lines in every cell, so every row's times stand level: the first
     line strong, the domain's stem (where it is needed) quiet. A name
     never ends in an ellipsis; one longer than the cell wraps. */
  .nm {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-block-size: 2lh;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    font: var(--type-meta);
  }
  .nm-local {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .nm-domain {
    color: var(--ink-muted);
  }
  .line {
    max-inline-size: 100%;
    text-wrap: balance;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
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
