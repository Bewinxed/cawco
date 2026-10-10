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
   * and every account on two lines (grouped by organization where one has
   * more than two), then the way to the Usage page: a popover by the strip
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
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconKey, IconRefresh, IconUsage } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import AccountName from "./accounts/AccountName.svelte";
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
    bindReset,
    caption,
    delegateTip,
    nameFields,
    openCodeRowTime,
    openCodeStatus,
    openCodeStop,
    orgGroups,
    plain,
    type RingAccount,
    rowStatus,
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

  /** One mark's room in the strip: 16px and the 4px between marks. */
  const SLOT = 20;

  /** Why there is nothing to draw: a normal state, never a fake 0%. */
  const empty = $derived(
    cawco.usageLimitsRead && usage.read
      ? "Sign in to see limits"
      : "Reading limits…"
  );

  /**
   * No limit can be shown once everything is read: the strip is the empty
   * state (DESIGN.md "Empty"), what is missing, why, and the one action that
   * fixes it, in the Usage page's words (usage.ts `claudeGap`).
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
    ].filter((note) => note.text !== null)
  );

  const weekUsed = (ring: RingAccount) =>
    ring.week ? `week ${100 - ring.week.left}%` : "";

  /** The strip read out: what its one control is called. */
  const triggerLabel = $derived.by(() => {
    if (!shown) {
      return `${empty}. Show every limit.`;
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
    <span class="noline">{empty}</span>
  {:else}
    <span class="cells">
      {#if claude}
        <span class="cell" data-cell="claude">
          <span class="l1">
            <span aria-hidden="true" class="mark"><ClaudeIcon /></span>
            <span
              class="marks"
              style:inline-size="{claude.accounts.length * SLOT - 4}px"
            >
              {#each claude.accounts as ring, i (ring.id)}
                <span
                  class="slot"
                  style:transform="translateX({i * SLOT}px)"
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

{#snippet row(
  ring: RingAccount,
  time: string,
  status: ReturnType<typeof rowStatus>,
  delegates: string | null,
  carrying: boolean
)}
  <!-- Two lines: its name and the time that matters, then what nothing
       else says (its status, the sessions the carrier holds, where
       delegates start) and the one reset that binds it. -->
  {@const reset = bindReset(ring, now)}
  <div
    class="row"
    data-account={ring.id}
    data-flyover-anchor
    class:limit={ring.state === "limit"}
  >
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
            <Rings {ring} size={24} />
          </button>
        {/snippet}
      </Tip>
    {:else}
      <Rings {ring} size={24} />
    {/if}
    <span class="who"><AccountName account={nameFields(ring)} row /></span>
    <span class="time" data-time class:muted={ring.state === "stale"}
      ><Figure text={time} /></span
    >
    <span class="line2">
      {#if status.length > 0}
        <span class="status" data-status><Words parts={status} /></span>
      {/if}
      {#if carrying && ring.sessions.length > 0}
        <SessionsChip
          account={ring.name}
          onopen={putAway}
          sessions={ring.sessions}
        />
      {/if}
      {#if delegates}
        <Tip label={delegates} side="top">
          {#snippet children(
            props
          )}
            <!-- The word alone: with the glyph it doesn't fit beside "takes
                 over in 1h 20m" and the short reset at 320px. -->
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
      {#if reset}
        <!-- The reset glyph and the time; "resets in 1h 33m" read out. -->
        <span class="reset" data-reset>
          <IconRefresh aria-hidden="true" />
          <span class="sr-only">{reset.said}</span>
          <span aria-hidden="true">{reset.at}</span>
        </span>
      {/if}
    </span>
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
    {#if !shown && notes.length === 0}
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
    <div class="accounts" data-accounts>
      {#if claude}
        <div class="group orgs">
          <!-- An organization of more than two accounts is a group under its
               name; the rest follow, ungrouped, after the same gap a group's
               name stands after. -->
          {#each orgGroups(claude.accounts) as group (group.org ?? "")}
            <div class="rows" data-org-group={group.org ?? ""}>
              {#if group.org}
                <h4 class="org" data-org-head>{group.org}</h4>
              {/if}
              {#each group.accounts as ring (ring.id)}
                {@render row(
                  ring,
                  rowTime(ring, claude, now),
                  rowStatus(ring, claude, now),
                  ring.id === claude.delegate?.id ? delegateTip(claude) : null,
                  ring.id === claude.carry?.id
                )}
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      {#if openCode}
        <section class="group">
          <h3 class="provider">
            <span aria-hidden="true" class="mark"><OpenCodeLogo /></span>
            opencode Go
          </h3>
          <div class="rows">
            {@render row(
              openCode,
              openCodeRowTime(openCode, now),
              openCodeStatus(openCode),
              null,
              true
            )}
          </div>
        </section>
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

<div class="strip" data-variant={variant} class:gap={gap !== null}>
  {#if gap}
    <EmptyState icon={IconUsage} inline line={gap.reason} title="No limits">
      {#snippet action()}
        {#if gap.signIn}
          <Button
            href="/config/accounts"
            icon={IconKey}
            label="Sign in an account"
            size="xs"
            variant="outline"
          />
        {:else}
          <!-- A text link: no box to pad, so its words start where the
               strip's mark does when it wraps under the line. -->
          <Button
            class="px-0"
            href="/usage"
            label="Open Usage"
            size="xs"
            variant="link"
          />
        {/if}
      {/snippet}
    </EmptyState>
  {:else if touch.current}
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
  /* Empty: the claim stands in the strip's height, its padding the row's. */
  .strip.gap {
    display: flex;
    align-items: center;
    min-block-size: 44px;
    padding: var(--space-1) var(--space-2);
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
  .marks {
    position: relative;
    flex: none;
    block-size: 16px;
  }
  .slot {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    display: grid;
    transition: transform var(--dur-reveal) var(--ease-in-out);
  }
  .digits {
    font: var(--weight-strong) var(--text-label) / 16px var(--font-body);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  .digits.muted,
  .time.muted {
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
  .group + .group,
  .group + .pop-note,
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
  /* Rows stand edge to edge: one pitch, the row's own height. */
  .rows {
    display: flex;
    flex-direction: column;
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
  /* An account, on two lines beside its ring: its name and the time that
     matters, then a short status and the one reset that binds it. 40px
     (44px on touch) whatever line 2 holds: line 1 is one label line, line 2
     is always the kit badge's height (1.25rem, its h-5), so line 2 starts
     at the same offset on every row, chip or no chip, tint or no tint. */
  .row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    grid-template-rows: auto 1.25rem;
    column-gap: var(--space-2);
    align-content: center;
    align-items: center;
    block-size: 40px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    transition: background-color var(--dur-fade) var(--ease-out);

    & > :global(svg),
    & > .ring-tip {
      grid-row: 1 / 3;
      align-self: center;
    }
  }
  .row.limit {
    background: var(--meter-wash-over);
    --ring-ground: var(--meter-wash-over);
  }
  .who {
    display: flex;
    min-inline-size: 0;
  }
  .time {
    flex: none;
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--ink-strong);
  }
  /* What only this account can say: its status, the sessions it carries,
     where new delegates start; then, at its end, its reset. It spans the
     name's column and the time's, so its words have the row's whole width
     and never the time column's leftovers. */
  .line2 {
    display: flex;
    grid-column: 2 / 4;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    block-size: 100%;
  }
  .status {
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: var(--type-meta);
    color: var(--ink-row);
  }
  /* The Delegates badge: the glyph and the word, in meta. */
  .tag {
    flex: none;
    font: var(--type-meta);
    line-height: 1;
    cursor: help;
  }
  /* The reset: the refresh glyph and the time, end-aligned under the row's
     time. */
  .reset {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
    margin-inline-start: auto;
    white-space: nowrap;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
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
  :global(.usage-sheet) .row {
    block-size: 44px;
    padding: 0 6px;
  }
  :global(.usage-sheet) .foot :global(a) {
    inline-size: 100%;
    block-size: 44px;
  }
  @media (prefers-reduced-motion: reduce) {
    .slot,
    .row {
      transition: none;
    }
  }
</style>
