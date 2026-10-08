<script lang="ts">
  /**
   * The Configure rail: every section, grouped, with how many rows it holds
   * and how many of them are failing somewhere. As `list` it is the whole
   * screen under 900px — the same entries at a touch height.
   */
  import { TextMorph } from "torph/svelte";
  import {
    dur,
    easeOut,
    morphMs,
    motionOk,
    popScale,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { countOf, faultsIn, updatesWaiting } from "./counts.svelte";
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
   * over through TextMorph. With reduced motion, a fade.
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

<nav
  aria-label="Configure"
  class="rail"
  data-variant={variant}
  {@attach highlight({ rows: ".row", selected: '[aria-current="page"]' })}
>
  {#each GROUPS as { group, sections } (group)}
    <div class="group">
      <h2 class="label">{group}</h2>
      <ul class="list">
        {#each sections as section (section.slug)}
          {@const count = countOf(store, section.slug)}
          {@const waiting = section.slug === "updates"}
          {@const faults = waiting
            ? updatesWaiting()
            : faultsIn(store, section.slug)}
          <li>
            <a
              aria-current={current === section.slug ? "page" : undefined}
              class="row focus-inset press-tint"
              href="/config/{section.slug}"
            >
              <span class="tile" style="color:{section.hue}"
                ><section.icon /></span
              >
              <span class="name">{section.label}</span>
              {#if unsavedIn(store, section.slug)}
                <span class="unsaved" title="Unsaved changes"
                  ><span class="sr-only">Unsaved changes</span></span
                >
              {/if}
              {#if faults > 0}
                <span
                  class="fault num"
                  title={waiting
                    ? `${faults} waiting on you`
                    : `${faults} failing on a machine or at the hub`}
                  transition:badge
                  ><TextMorph
                    as="span"
                    duration={morphMs()}
                    text={String(faults)}
                  />
                  <span class="sr-only"
                    >{waiting ? " waiting" : " failing"}</span
                  ></span
                >
              {/if}
              {#if section.counted}
                <!-- The figure is its own element, not the dash's text
                     rewritten: it arrives in place rather than moving in. -->
                {#if count === null}
                  <span class="count">—</span>
                {:else}
                  <span class="count">{count}</span>
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
  .rail {
    display: flex;
    flex-direction: column;
    padding: 0 var(--space-2) var(--space-5);
  }
  /* A panel standing in the Configure page's gutter, in the page card's own
     recipe (raised, radius-lg, tile shadow), so it needs no divider: the
     recess around it is the seam. Raised, not recessed: in light the fill a
     chosen row takes is the recess's own step (n-3), so on the recess the
     selection would not show at all. */
  .rail[data-variant="rail"] {
    position: relative;
    width: 232px;
    flex: none;
    overflow-y: auto;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .rail[data-variant="list"] {
    padding: 0 var(--space-2) var(--space-2);
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .label {
    padding: var(--space-4) var(--space-3) var(--space-2);
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: var(--c-rail-row-h);
    padding: 0 var(--space-3) 0 var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--ink-row);
    text-decoration: none;
    transition: var(--transition-control);
  }
  /* The chosen row's ink; the apricot wash under it is the highlight's pill. */
  .row[aria-current="page"] {
    color: var(--selected-ink);
  }
  [data-variant="list"] .row {
    height: 48px;
  }
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    background: var(--surface-tile);
    box-shadow: var(--shadow-tile);
  }
  .tile :global(svg) {
    width: 14px;
    height: 14px;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Three digits wide from the first paint, the figure set to its end, so
     the dash that stands in until the count is read and the count that
     replaces it hold the same box. */
  .count {
    flex: none;
    min-inline-size: 3ch;
    text-align: end;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  [aria-current="page"] .count {
    color: var(--selected-ink);
  }
  /* An editor in this section holds edits not saved yet. */
  .unsaved {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-strong);
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-control) var(--ease-out);
      @starting-style {
        opacity: 0;
      }
    }
  }
  .fault {
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-xs);
    background: var(--status-attn-bg);
    font: var(--type-meta);
    line-height: 18px;
    text-align: center;
    color: var(--status-attn-ink);
  }
</style>
