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
              {#if section.slug !== "models" && section.slug !== "updates"}
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
    gap: 14px;
    padding: 14px 8px 14px 12px;
  }
  /* Raised, not recessed: in light the fill a chosen row takes is the recess's
     own step (n-3), so on the recess the selection would not show at all. */
  .rail[data-variant="rail"] {
    position: relative;
    width: 232px;
    flex: none;
    overflow-y: auto;
    border-right: 1px solid var(--border-hairline);
    background: var(--surface-raised);
  }
  .rail[data-variant="list"] {
    padding: 7px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    padding: 0 8px 4px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    height: 36px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    text-decoration: none;
    transition: var(--transition-control);
  }
  [data-variant="list"] .row {
    height: 48px;
  }
  @media (pointer: coarse) {
    .row {
      height: 44px;
    }
    [data-variant="list"] .row {
      height: 48px;
    }
  }
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .tile :global(svg) {
    width: 16px;
    height: 16px;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font: var(--type-label);
    font-weight: var(--weight-strong);
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
