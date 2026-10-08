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
   * The whole strip is one control. It opens every account with its key and
   * where the next delegate goes, and the way to the Usage page: a popover
   * by the strip with a fine pointer, the house bottom sheet on touch. The
   * strip is 44px in the rail (56px on the phone home) in every state, so
   * nothing around it moves when a reading lands or changes.
   *
   * Live: the forecast is read whenever the hub says an account moved
   * (usage/forecast.svelte.ts), and the words move on once a minute.
   */
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconKey, IconUsage } from "#lib/icons.js";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import Arrow from "~icons/solar/arrow-right-linear";
  import AccountName from "./accounts/AccountName.svelte";
  import { cawco, type Machine } from "./client.svelte";
  import MachineLogin from "./MachineLogin.svelte";
  import { dur, motionOk } from "./motion/curves.svelte";
  import { morph } from "./motion/morph.svelte";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import { claudeGap } from "./usage";
  import Figure from "./usage/Figure.svelte";
  import { startForecast, usage } from "./usage/forecast.svelte";
  import Rings from "./usage/Rings.svelte";
  import RingsKey from "./usage/RingsKey.svelte";
  import {
    caption,
    nameFields,
    openCodeStatus,
    openCodeStop,
    plain,
    type RingAccount,
    rowStatus,
    rowTime,
    stopText,
  } from "./usage/rings";
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
  let loginFor = $state<Machine | null>(null);
  let loginOpen = $state(false);

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
  status: ReturnType<typeof rowStatus>
)}
  <div class="row" data-account={ring.id} class:limit={ring.state === "limit"}>
    <Rings {ring} size={24} />
    <div class="content">
      <div class="r1">
        <AccountName account={nameFields(ring)} row wrap />
        <span class="time" class:muted={ring.state === "stale"}
          ><Figure text={time} /></span
        >
      </div>
      <p class="status" data-status><Words parts={status} /></p>
      <RingsKey {ring} />
    </div>
  </div>
{/snippet}

{#snippet limits()}
  <!-- Its size follows what it lists (a provider arriving, a note going). -->
  <div class="pop-body" {@attach morph()}>
    {#if !shown && notes.length === 0}
      <p class="pop-empty">{empty}</p>
    {/if}
    {#if claude}
      <section class="group">
        <h3 class="provider">
          <span aria-hidden="true" class="mark"><ClaudeIcon /></span>
          Claude
        </h3>
        <div class="rows">
          {#each claude.accounts as ring (ring.id)}
            {@render row(
              ring,
              rowTime(ring, claude, now),
              rowStatus(ring, claude, now)
            )}
          {/each}
        </div>
        {#if claude.delegate}
          <p class="delegates" data-delegates>
            <b class="head">Delegates</b>
            <span
              ><Arrow aria-hidden="true" class="arrow" />
              <Words
                parts={[
                  { strong: claude.delegate.name },
                  claude.delegateWhy ? ` (${claude.delegateWhy})` : "",
                ]}
              /></span
            >
          </p>
        {/if}
      </section>
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
            openCodeStop(openCode, now),
            openCodeStatus(openCode, now)
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
    <div class="foot">
      <Button href="/usage" label="Open Usage" size="sm" variant="outline" />
    </div>
  </div>
{/snippet}

<div class="strip" data-variant={variant} class:gap={gap !== null}>
  {#if gap}
    <EmptyState icon={IconUsage} inline line={gap.reason} title="No limits">
      {#snippet action()}
        {#if gap.signIn && gap.machine}
          {@const machine = gap.machine}
          <Button
            aria-label="Log in to Claude on {machine.hostname}"
            icon={IconKey}
            label="Log in"
            onclick={() => {
              loginFor = machine;
              loginOpen = true;
            }}
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
    <Drawer.Root>
      <Drawer.Trigger
        aria-label={triggerLabel}
        class="strip-hit press-tint touch-hit"
      >
        {@render face()}
      </Drawer.Trigger>
      <Drawer.Content
        class="usage-sheet max-h-[85vh] pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <Drawer.Header class="p-0 pb-1 text-left">
          <Drawer.Title class="text-left">Usage limits</Drawer.Title>
        </Drawer.Header>
        {@render limits()}
      </Drawer.Content>
    </Drawer.Root>
  {:else}
    <Popover.Root>
      <Popover.Trigger aria-label={triggerLabel} class="strip-hit press-tint">
        {@render face()}
      </Popover.Trigger>
      <Popover.Content
        align="start"
        class="usage-pop w-[min(20rem,calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
        collisionPadding={8}
        side="top"
        sideOffset={6}
      >
        {@render limits()}
      </Popover.Content>
    </Popover.Root>
  {/if}
</div>

{#if loginFor}
  <MachineLogin machine={loginFor} bind:open={loginOpen} />
{/if}

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
  .pop-body {
    --ring-ground: var(--surface-raised);
    display: flex;
    flex-direction: column;
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
    padding: 12px 10px;
  }
  .group + .group,
  .group + .pop-note,
  .pop-note + .pop-note {
    border-block-start: 1px solid var(--border-hairline);
  }
  .provider {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 var(--space-1) 2px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* An account: its ring, then its name and the time that matters, a short
     status, and its key. */
  .row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    column-gap: 10px;
    align-items: start;
    padding: 7px var(--space-1);
    border-radius: var(--radius-sm);
    transition: background-color var(--dur-fade) var(--ease-out);

    & > :global(svg) {
      margin-block-start: 1px;
    }
  }
  .row.limit {
    background: var(--meter-wash-over);
    --ring-ground: var(--meter-wash-over);
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-inline-size: 0;
  }
  .r1 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .time {
    flex: none;
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--ink-strong);
  }
  .status {
    margin: 0 0 3px;
    font: var(--type-meta);
    color: var(--ink-row);
  }
  .delegates {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px var(--space-1) 0;
    font: var(--type-meta);
    color: var(--ink-row);

    & > .head {
      font: var(--type-label);
      color: var(--ink-strong);
    }
    & :global(.arrow) {
      display: inline-block;
      inline-size: 12px;
      block-size: 12px;
      vertical-align: -2px;
      color: var(--ink-muted);
    }
  }
  .foot {
    padding: 10px 14px;
    border-block-start: 1px solid var(--border-hairline);
  }
  :global(.usage-sheet) .group {
    padding: 12px;
  }
  :global(.usage-sheet) .row {
    min-block-size: 44px;
    padding: 8px 6px;
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
