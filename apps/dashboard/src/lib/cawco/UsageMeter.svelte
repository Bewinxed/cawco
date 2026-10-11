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
  import { IconKey, IconRefresh } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
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
    delegateTip,
    fmt,
    openCodeRowTime,
    openCodeStop,
    orgGroups,
    plain,
    type RingAccount,
    rowTime,
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

  // ── the dial wall's words ──
  /** A cell's time in its words and its figure: "in ", "1h 20m", " left". */
  const TIME_PARTS = /^(in )?(.*?)( left)?$/;
  /** An email domain's top level ("gmail.com" → "gmail"). */
  const TOP_DOMAIN = /\.[^.]+$/;
  /**
   * A cell's name, so no two cells shown together read the same: a
   * nickname as it is; under its organization's head the email's local
   * part; ungrouped, the local part and its domain's stem ("bewinxed" and
   * "@gmail"), which may stand on a second line.
   */
  const cellName = (
    ring: RingAccount,
    grouped: boolean
  ): { local: string; domain: string } => {
    if (ring.nick || !ring.email) {
      return { local: ring.name, domain: "" };
    }
    const at = ring.email.lastIndexOf("@");
    if (at < 0) {
      return { local: ring.email, domain: "" };
    }
    return {
      local: ring.email.slice(0, at),
      domain: grouped ? "" : ring.email.slice(at + 1).replace(TOP_DOMAIN, ""),
    };
  };
  /**
   * A time worked out from a reading out of date carries a tilde, once,
   * on the figure ("in ~1h 20m", "~3h 40m left", "~5h+").
   */
  const guessed = (ring: RingAccount, time: string): string => {
    if (ring.state !== "stale" || time.includes("~")) {
      return time;
    }
    return time.startsWith("in ") ? `in ~${time.slice(3)}` : `~${time}`;
  };
  /**
   * A Claude account's one time that matters: "in 1h 20m" for one the
   * relay hands over to later, else the row time ("1h 20m left", "5h+",
   * "back in 4h 50m").
   */
  const claudeTime = (ring: RingAccount): string => {
    if (!claude) {
      return "";
    }
    if (
      ring.id !== claude.carry?.id &&
      ring.state !== "limit" &&
      ring.carryFrom !== null &&
      ring.carryFrom > now
    ) {
      return guessed(ring, `in ${fmt(ring.carryFrom - now)}`);
    }
    return guessed(ring, rowTime(ring, claude, now));
  };
  /** Its week: "wk 62%" left, "wk —" at the week's limit, nothing unread. */
  const weekText = (ring: RingAccount): string => {
    if (ring.limitOn === "week") {
      return "wk —";
    }
    return ring.week ? `wk ${ring.week.left}%` : "";
  };
  const delegatesOf = (ring: RingAccount): string | null =>
    claude && ring.id === claude.delegate?.id ? delegateTip(claude) : null;

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

{#snippet when(
  text: string
)}
  <!-- A time; "back in 4h 50m" as the reset glyph and the time, read out
       whole, so a limit takes a reset's width. -->
  {#if text.startsWith("back in ")}
    <span class="when"
      ><IconRefresh aria-hidden="true" /><span class="sr-only">back in</span>
      {text.slice(8)}</span
    >
  {:else}
    <!-- The figure never breaks; in a narrow cell "in" or "left" takes a
         line of its own rather than the time running past the cell. -->
    {@const [, before = "", figure = text, after = ""] =
      TIME_PARTS.exec(text) ?? []}
    {before}<span class="fig">{figure}</span>{after}
  {/if}
{/snippet}

{#snippet cell(
  ring: RingAccount,
  grouped: boolean,
  time: string
)}
  <!-- A cell of the dial wall: the double dial at 56px (its disc the
       5-hour window, its rim the week) with the sessions it runs on its
       corner, then its name, the time that matters, its week, and the
       word "Delegates" under the account new delegates start on. -->
  {@const name = cellName(ring, grouped)}
  {@const tip = delegatesOf(ring)}
  {@const week = weekText(ring)}
  <div
    class="cell-d"
    data-account={ring.id}
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
              <Rings {ring} size={56} />
            </button>
          {/snippet}
        </Tip>
      {:else}
        <Rings {ring} size={56} />
      {/if}
      {#if ring.sessions.length > 0}
        <span class="dial-chip">
          <SessionsChip
            account={ring.name}
            onopen={putAway}
            sessions={ring.sessions}
          />
        </span>
      {/if}
    </span>
    <!-- Its parts are flex items, so no space stands between them and the
         domain takes the second line whole when both don't fit. -->
    <span class="nm" data-name>
      <span>{name.local}</span>
      {#if name.domain}
        <span>@{name.domain}</span>
      {/if}
    </span>
    <span class="line" data-time>{@render when(time)}</span>
    {#if week}
      <span class="line" data-week class:strong={ring.bind === "week"}
        >{week}</span
      >
    {/if}
    {#if tip}
      <Tip label={tip} side="top">
        {#snippet children(
          props
        )}
          <button
            {...props}
            class={cn(badgeVariants({ variant: "secondary" }), "tag px-1")}
            data-delegates-tag
            type="button"
          >
            Delegates
          </button>
        {/snippet}
      </Tip>
    {/if}
  </div>
{/snippet}

{#snippet limits(
  sheet: boolean
)}
  <!-- Its size follows what it lists (a provider arriving, a note going).
       In the popover the head and the foot stand still and the accounts
       between them scroll; in the sheet the whole body scrolls under the
       sheet's header. -->
  <div class={["pop-body", sheet && "kit-sheet-scroll"]} {@attach morph()}>
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
    <!-- A sessions list hangs from a cell's row across its wall and ends on
         the first cell's or head's foot under it (SessionsChip). -->
    <div class="accounts" data-accounts data-flyover-scope>
      {#if claude}
        <div class="group orgs">
          <!-- An organization of more than two accounts is a group under its
               name; the rest follow, ungrouped, after the same gap a group's
               name stands after. -->
          {#each orgGroups(claude.accounts) as group (group.org ?? "")}
            <div
              class="wall"
              data-flyover-span
              data-org-group={group.org ?? ""}
            >
              {#if group.org}
                <h4 class="org" data-flyover-edge data-org-head>{group.org}</h4>
              {/if}
              {#each group.accounts as ring (ring.id)}
                {@render cell(ring, group.org !== null, claudeTime(ring))}
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      {#if openCode}
        <section class="group">
          <h3 class="provider" data-flyover-edge>
            <span aria-hidden="true" class="mark"><OpenCodeLogo /></span>
            opencode Go
          </h3>
          <div class="wall" data-flyover-span>
            {@render cell(
              openCode,
              true,
              guessed(openCode, openCodeRowTime(openCode, now))
            )}
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
        <p class="pop-empty pop-note" data-flyover-edge>
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
  /* The dial wall: four cells across, one pitch apart, an organization's
     name across the whole row over its cells. */
  .wall {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-1);

    & > .org {
      grid-column: 1 / -1;
    }
  }
  /* A cell: the dial over its name, its time and its week, centred, in
     meta. The carrier wears a hairline ring; an account at its limit the
     limit wash, which the dial's reserve notch takes as its ground. */
  .cell-d {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
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
  /* The dial, with the count of the sessions it runs on its lower corner. */
  .dial {
    position: relative;
    display: grid;
    margin-block-end: 2px;
  }
  .dial-chip {
    position: absolute;
    inset-block-end: -4px;
    inset-inline-end: -10px;
  }
  /* A name never ends in an ellipsis: an ungrouped one breaks before its
     "@" onto a second line, and anything longer than the cell wraps. */
  .nm {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .line {
    max-inline-size: 100%;
    text-wrap: balance;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  /* The week, when it is the window that binds. */
  .line.strong {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .fig {
    white-space: nowrap;
  }
  /* "back in 4h 50m" as the reset glyph and the time. */
  .when {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    line-height: 1;

    & :global(svg) {
      flex: none;
      inline-size: 12px;
      block-size: 12px;
    }
  }
  /* The Delegates badge: the word alone, in meta, 4px in. */
  .tag {
    flex: none;
    font: var(--type-meta);
    line-height: 1;
    cursor: help;
  }
  .foot {
    flex: none;
    padding: 10px 14px;
    border-block-start: 1px solid var(--border-hairline);
  }
  /* The sheet: the whole body scrolls under its header, rows at the touch
     floor. */
  :global(.usage-sheet) .pop-body {
    flex: 1 1 auto;
    min-block-size: 0;
    max-block-size: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  :global(.usage-sheet) .accounts {
    flex: none;
    overflow: visible;
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
