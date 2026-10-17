<script lang="ts">
  /**
   * The Configure rail: every section, grouped, with how many rows it holds
   * and how many of them are failing somewhere. As `list` it is the whole
   * screen under 900px — the same entries at a touch height.
   */
  import { configureWords as words } from "@cawco/core";
  import {
    dur,
    easeOut,
    motionOk,
    popScale,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { badgeOf, countOf } from "./counts.svelte";
  import { unsavedIn } from "./drafts.svelte";
  import { GROUPS, type SectionSlug } from "./sections";
  import { configStore } from "./store.svelte";

  let {
    current,
    variant = "rail",
  }: { current?: SectionSlug; variant?: "rail" | "list" } = $props();

  const store = configStore();

  /**
   * One ghost follows the pointer down the rail and one pill sits under the
   * chosen section, gliding to the next when the section changes; a section
   * picked with the pointer turns the ghost under it into the pill
   * (components/ui/highlight). The rail sits outside Configure's keyed pane,
   * so it holds still while the section slides beside it.
   */

  /**
   * A section's fault badge pops in from the pop scale as it fades
   * (--dur-menu) and leaves the same way on the exit tier; its figure ticks
   * over through MorphText. With reduced motion, a fade.
   */
  function badge(
    _node: Element,
    _params?: undefined,
    { direction }: { direction?: "in" | "out" | "both" } = {}
  ) {
    const scale = popScale();
    return {
      duration: dur(direction === "out" ? "--dur-exit" : "--dur-menu"),
      easing: easeOut,
      css: (t: number) =>
        motionOk.current
          ? `opacity: ${t}; scale: ${scale + (1 - scale) * t}`
          : `opacity: ${t}`,
    };
  }
</script>

<!-- literal: 232px -->
<nav
  data-slot="rail"
  aria-label={words.title}
  class="group/rail flex flex-col px-space-2 pb-space-5 variant-rail:relative variant-rail:w-(--rail-w) variant-rail:flex-none variant-rail:overflow-y-auto variant-rail:rounded-lg variant-rail:bg-surface-raised variant-list:pb-space-2"
  data-variant={variant}
  style:--rail-w="232px"
  {@attach highlight({ rows: '[data-slot="row"]', selected: '[aria-current="page"]' })}
>
  {#each GROUPS as { group, sections } (group)}
    <div data-slot="group" class="flex flex-col">
      <h2 data-slot="config-rail-label" class="pt-space-4 px-space-3 pb-space-2 type-body text-ink-muted">{group}</h2>
      <ul data-slot="list" class="flex flex-col m-0 p-0 list-none">
        {#each sections as section (section.slug)}
          {@const count = countOf(store, section.slug)}
          {@const waiting = section.badge === "updates-waiting"}
          {@const faults = badgeOf(store, section)}
          <li>
            <!-- literal: 48px, 22px, 6px, 50%, 5px, 18px, 3ch -->
            <a
              data-slot="row"
              aria-current={current === section.slug ? "page" : undefined}
              class="group/row relative flex items-center gap-space-3 h-c-rail-row-h pl-space-2 pr-space-3 rounded-sm text-ink-row no-underline transition-control aria-current-page:text-selected-ink group-variant-list/rail:h-(--list-row-h) focus-inset press-tint"
              href="/config/{section.slug}"
              style:--list-row-h="48px"
              style:--tile="22px"
              style:--dot="6px"
              style:--dot-r="50%"
              style:--fault-pad="5px"
              style:--fault-h="18px"
              style:--count-min="3ch"
            >
              <span data-slot="tile" class="inline-flex items-center justify-center flex-none size-(--tile) rounded-xs bg-surface-tile shadow-tile text-(--tile-ink)" style:--tile-ink={section.hue}
                ><section.icon /></span
              >
              <span data-slot="name" class="flex-auto min-w-0 type-label truncate">{section.label}</span>
              {#if unsavedIn(store, section.slug)}
                <span class="flex-none size-(--dot) rounded-(--dot-r) bg-ink-strong motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out motion-safe:starting:opacity-0" title={words.unsaved}
                  ><span class="sr-only">{words.unsaved}</span></span
                >
              {/if}
              {#if faults > 0}
                <span
                  data-slot="num"
                  class="flex-none min-w-space-5 h-space-5 px-(--fault-pad) rounded-xs bg-status-attn-bg font-body text-size-meta font-normal leading-(--fault-h) text-center text-status-attn-ink num"
                  title={waiting
                    ? words.badgeWaiting(faults)
                    : words.badgeFailing(faults)}
                  transition:badge
                  ><MorphText text={String(faults)} />
                  <span class="sr-only">
                    {waiting
                      ? words.badgeWaitingSaid
                      : words.badgeFailingSaid}</span
                  ></span
                >
              {/if}
              {#if section.counted}
                <!-- The figure is its own element, not the dash's text
                     rewritten: it arrives in place rather than moving in. -->
                {#if count === null}
                  <span data-slot="count" class="flex-none min-w-(--count-min) text-end type-meta num text-ink-muted group-aria-current-page/row:text-selected-ink">—</span>
                {:else}
                  <span data-slot="count" class="flex-none min-w-(--count-min) text-end type-meta num text-ink-muted group-aria-current-page/row:text-selected-ink">{count}</span>
                {/if}
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  /* residual: foreign-dom */
  [data-slot="tile"] :global(svg) {
    width: var(--space-4);
    height: var(--space-4);
  }
</style>
