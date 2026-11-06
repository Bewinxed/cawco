<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * The session's screen as the person meets it, drawn around where its
   * list of what waits on him stands, for the canvas to show each place in
   * each state: the tab strip and the bar's glass over the conversation,
   * its turns, the composer's tray row (a delegate's chip, the plan ring)
   * and the composer. The list, its chip and its card are the real ones;
   * the rest is the kit's own parts in the session's shape, never the live
   * shell.
   *
   * `place` is where the list lives: `tray`, a chip on the tray row whose
   * card rises over the row; `bar`, a symbol in the bar's glass whose card
   * hangs from the glass; `tab`, the session tab's own card, opened by
   * pressing the tab that wears the hand.
   */
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import {
    IconChevronDown,
    IconFiles,
    IconNeedsYou,
    IconPlus,
    IconSearch,
    IconSend,
    IconServer,
    IconTick,
  } from "#lib/icons.js";
  import MessageBody from "../../MessageBody.svelte";
  import PlanRing from "../../plan/PlanRing.svelte";
  import { type WaitingRow, waitingCounts } from "../rows";
  import WaitingCard from "../WaitingCard.svelte";
  import WaitingChip from "../WaitingChip.svelte";
  import WaitingList from "../WaitingList.svelte";

  let {
    place,
    rows,
    opened = false,
    height = 760,
  }: {
    place: "tray" | "bar" | "tab";
    rows: WaitingRow[];
    /** The list stands open. */
    opened?: boolean;
    /** The frame's height, px. */
    height?: number;
  } = $props();

  // A story's args are the live instance's inputs: the press flips its own copy, and a new arg resets it.
  let shown = $state(false);
  $effect.pre(() => {
    shown = opened;
  });

  /** A press the fixture answers with nothing: the screen's own opens are the live pane's. */
  const nothing = () => undefined;

  const counts = $derived(waitingCounts(rows));
  const waiting = $derived(counts.open > 0);

  const TURNS = [
    "The Liquid Glass title bars are on main. They'll reach your machines in the next nightly, which I'm holding until two host checks on other fixes pass.",
    "With the bars landed, I've started the design for seeing a session's pending decisions from its own chat. Its options will come to you on one decision page.",
  ];
</script>

<TooltipProvider>
  <div
    class="relative isolate flex h-(--fixture-h) flex-col overflow-clip bg-surface-shelf text-ink-strong"
    data-slot="session-fixture"
    style:--fixture-h="{height}px"
    style:--card-room="calc({height}px - 2 * var(--c-top-bar-h) -
    var(--c-composer-field) - var(--space-8))"
  >
    <!-- The shelf: the session's tab, then the bar's trailing glass. -->
    <div
      class="relative z-2 flex h-c-top-bar-h flex-none items-end gap-space-3 ps-space-3 pe-space-2"
    >
      <div class="relative min-w-0 flex-auto">
        <Tabs value="this" variant="folder">
          <TabsList aria-label="Sessions">
            <TabItem
              aria-expanded={place === "tab" ? shown : undefined}
              label="Continue CawCo open tasks"
              onclick={() => {
                if (place === "tab") {
                  shown = !shown;
                }
              }}
              value="this"
            >
              {#snippet lead()}
                {#if waiting}
                  <IconNeedsYou
                    aria-hidden="true"
                    class="size-icon-md text-status-attn-glyph"
                  />
                {/if}
              {/snippet}
            </TabItem>
          </TabsList>
        </Tabs>
        {#if place === "tab" && shown}
          <section
            aria-label="Continue CawCo open tasks"
            class={floatingSurface({
              class:
                "absolute start-0 top-[calc(100%+var(--space-1))] z-3 flex max-h-(--card-room) w-[min(var(--c-lead-card-w),calc(100cqw-var(--space-6)))] flex-col p-0",
            })}
            data-state="open"
          >
            <div
              class="flex flex-col gap-space-1 px-space-4 pbs-space-4 pbe-space-3"
            >
              <h2 class="type-title m-0 text-ink-strong">
                Continue CawCo open tasks
              </h2>
              <p
                class="type-meta mark-line m-0 flex items-center gap-space-1 text-ink-muted"
              >
                {#if waiting}
                  <IconNeedsYou
                    aria-hidden="true"
                    class="size-icon-sm text-status-attn-glyph"
                  />
                  <span class="text-status-attn-ink">Needs you</span>
                  <span aria-hidden="true">·</span>
                {/if}
                <span>obelisk-of-light</span>
              </p>
            </div>
            {#if rows.length > 0}
              <div
                class="kit-edge-fade-block min-h-0 flex-auto overflow-y-auto overscroll-contain border-bs border-bs-border-hairline px-space-1 pbs-space-2"
              >
                <WaitingList onopen={nothing} {rows} />
              </div>
            {/if}
            <div
              class="flex flex-wrap gap-space-2 border-bs border-bs-border-hairline px-space-4 py-space-3"
            >
              {#each ["Opus 5.5", "Xhigh", "Bypass"] as setting (setting)}
                <span class={chipVariants({ variant: "setting" })}>
                  <span data-slot="chip-label">{setting}</span>
                  <IconChevronDown data-slot="chevron" aria-hidden="true" />
                </span>
              {/each}
            </div>
          </section>
        {/if}
      </div>
      <div class="relative flex-none self-center">
        <BarGlass form="group">
          <button
            aria-label="Files, 100"
            class="select-none mark-line touch-hit press-tint"
            data-bar-item
            data-counted
            type="button"
          >
            <IconFiles data-slot="bar-symbol" aria-hidden="true" />
            <span data-slot="num" class="num">100</span>
          </button>
          {#if place === "bar" && rows.length > 0}
            <button
              aria-expanded={shown}
              aria-haspopup="dialog"
              aria-label={waitingWords.triggerLabel(
                counts.open,
                counts.answered
              )}
              class="select-none mark-line touch-hit press-tint"
              data-bar-item
              data-counted
              onclick={() => {
                shown = !shown;
              }}
              type="button"
            >
              {#if waiting}
                <IconNeedsYou
                  data-slot="bar-symbol"
                  aria-hidden="true"
                  class="text-status-attn-glyph"
                />
              {:else}
                <IconTick data-slot="bar-symbol" aria-hidden="true" />
              {/if}
              <span data-slot="num" class="num"
                >{counts.open > 0 ? counts.open : counts.answered}</span
              >
            </button>
          {/if}
          <button
            aria-label="Jump to session"
            class="select-none touch-hit press-tint"
            data-bar-item
            type="button"
          >
            <IconSearch data-slot="bar-symbol" aria-hidden="true" />
          </button>
          <button
            aria-label="4 machines"
            class="select-none mark-line touch-hit press-tint"
            data-bar-item
            data-counted
            type="button"
          >
            <IconServer data-slot="bar-symbol" aria-hidden="true" />
            <span data-slot="num" class="num">4</span>
          </button>
        </BarGlass>
        {#if place === "bar" && shown && rows.length > 0}
          <section
            aria-label={waitingWords.title(counts.open)}
            class={floatingSurface({
              class:
                "absolute end-0 top-[calc(100%+var(--space-1))] z-3 flex max-h-(--card-room) w-[min(var(--c-lead-card-w),calc(100cqw-var(--space-4)))] flex-col p-0",
            })}
            data-state="open"
          >
            <h2
              class="m-0 flex h-c-top-bar-h items-center px-space-4 text-size-label font-medium text-ink-strong"
            >
              {waitingWords.title(counts.open)}
            </h2>
            <div
              class="kit-edge-fade-block min-h-0 flex-auto overflow-y-auto overscroll-contain px-space-1 pbe-space-2"
            >
              <WaitingList onopen={nothing} {rows} />
            </div>
          </section>
        {/if}
      </div>
    </div>

    <!-- The pane: its turns, then the dock (tray row and composer). -->
    <div
      class="relative flex min-h-0 flex-auto flex-col rounded-t-lg bg-surface-raised @container"
      data-slot="dock"
    >
      <div class="min-h-0 flex-auto overflow-hidden px-space-7 pbs-space-6">
        <div class="mx-auto flex max-w-c-measure flex-col gap-space-5">
          {#each TURNS as turn, n (n)}
            <article class="flex flex-col gap-space-2">
              <p class="type-label m-0 text-ink-row">Claude Code</p>
              <MessageBody source={turn} wrap="pretty" />
            </article>
          {/each}
        </div>
      </div>
      <div class="relative flex-none px-space-4 pbe-space-4">
        <div class="relative mx-auto flex max-w-c-measure flex-col gap-space-2">
          <div class="relative flex items-center gap-space-2" data-slot="tray">
            <span
              class={chipVariants({
                variant: "tray",
                class: "min-w-0 shrink text-ink-strong",
              })}
            >
              <span
                class="size-icon-md rounded-xs bg-mark-3"
                aria-hidden="true"
                data-box
              ></span>
              <span
                class="min-w-0 max-w-c-tab-max-w overflow-clip text-ellipsis whitespace-nowrap"
                >Design the Comments rail and sheet whole</span
              >
            </span>
            <span class="ms-auto"></span>
            {#if place === "tray"}
              <WaitingChip
                answered={counts.answered}
                onopen={() => {
                  shown = !shown;
                }}
                open={counts.open}
                {shown}
              />
            {/if}
            {#if place === "tray" && shown && rows.length > 0}
              <WaitingCard
                onclose={() => {
                  shown = false;
                }}
                onopen={nothing}
                {rows}
              />
            {/if}
            <PlanRing done={2} onopen={nothing} open={false} total={12} />
          </div>
          <div
            class="flex items-center gap-space-2 rounded-panel border border-border-control bg-surface-raised p-space-2 ps-space-4 shadow-tile"
          >
            <span class="type-body min-w-0 flex-auto truncate text-ink-subtle">
              Message the agent…
            </span>
            <Button
              icon={IconPlus}
              aria-label="Attach or draw"
              size="icon-composer"
              variant="outline"
            />
            <Button
              icon={IconSend}
              aria-label="Send message"
              size="icon-composer"
              variant="default"
              disabled
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</TooltipProvider>
