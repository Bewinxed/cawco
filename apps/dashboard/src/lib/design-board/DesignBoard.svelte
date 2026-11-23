<script lang="ts">
  /**
   * CawCo's design system board: presents the system's structure rather than a
   * raw variable dump — Layer 1 primitive scales, Layer 2 semantic roles, then
   * the core kit components in their states, light and dark side by side.
   *
   * Each scheme is a pane with `data-scheme` and `color-scheme` so one frame
   * holds both schemes regardless of the page's own theme. Interactive
   * controls also show their first state forced into hover, focus, and pressed
   * via the stage's `cawco-<state>` classes.
   */
  import type { Snippet } from "svelte";
  import Foundation from "./Foundation.svelte";
  import { type Family, framesOf, GROUPS, titleOf } from "./families.js";
  import { type Foundation as Group, ROLES, SCALES } from "./foundations.js";

  const SCHEMES = [
    { scheme: "light", label: "Light" },
    { scheme: "dark", label: "Dark" },
  ] as const;

  const FORCED = [
    { state: "hover", label: "hover" },
    { state: "focus-visible", label: "focus" },
    { state: "active", label: "pressed" },
  ] as const;

  /** What a person presses or types in: the element a forced state stands on. */
  const CONTROL =
    'button, a[href], input, textarea, select, [role="switch"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

  /** Puts the stage's forced-state class on the frame's first control. */
  const forced = (state: string) => (node: HTMLElement) => {
    const control = node.querySelector(CONTROL);
    const name = `cawco-${state}`;
    control?.classList.add(name);
    return () => control?.classList.remove(name);
  };

  const cardOf = (family: Family) => ({
    family,
    title: titleOf(family),
    frames: framesOf(family),
  });

  const sections = GROUPS.map((group) => ({
    title: group.title,
    flowing: group.families.filter((one) => !one.wide).map(cardOf),
    wide: group.families.filter((one) => one.wide).map(cardOf),
  }));
</script>

{#snippet shell(title: string, pane: Snippet, note?: string)}
  <section
    class="@container mb-space-4 flex break-inside-avoid flex-col overflow-clip rounded-lg border border-border-hairline"
    aria-label={title}
  >
    <header
      class="flex flex-wrap items-baseline justify-between gap-x-space-4 gap-y-space-1 border-b border-border-hairline bg-surface-raised px-space-4 py-space-2"
    >
      <h3 class="type-label">{title}</h3>
      {#if note}
        <p class="text-ink-muted type-meta">{note}</p>
      {/if}
    </header>
    <div class="grid grow @phone:grid-cols-2">
      {#each SCHEMES as scheme (scheme.scheme)}
        <div
          data-scheme={scheme.scheme}
          class={[
            "flex min-w-0 flex-col gap-space-3 bg-surface-page p-space-4 text-ink-strong",
            scheme.scheme === "dark" ? "scheme-dark" : "scheme-light",
          ]}
        >
          <p class="text-ink-subtle type-meta">{scheme.label}</p>
          {@render pane()}
        </div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet frames(one: ReturnType<typeof cardOf>)}
  <div class="flex flex-wrap items-start gap-space-4">
    {#each one.frames as frame (frame.name)}
      <figure
        class={[
          "flex max-w-full min-w-0 flex-col gap-space-2",
          one.family.fill && "w-full",
        ]}
      >
        <div class="max-w-full min-w-0">
          <frame.component {...frame.args} />
        </div>
        <figcaption class="text-ink-muted type-meta">
          {frame.label}
        </figcaption>
      </figure>
    {/each}
    {#if one.family.forced && one.frames[0]}
      {@const first = one.frames[0]}
      {#each FORCED as force (force.state)}
        <figure class="flex max-w-full min-w-0 flex-col gap-space-2">
          <div class="max-w-full min-w-0" {@attach forced(force.state)}>
            <first.component {...first.args} />
          </div>
          <figcaption class="text-ink-muted type-meta">
            {first.label}, {force.label}
          </figcaption>
        </figure>
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet card(one: ReturnType<typeof cardOf>)}
  {#snippet pane()}
    {@render frames(one)}
  {/snippet}
  {@render shell(one.title, pane)}
{/snippet}

{#snippet foundationCard(one: Group)}
  {#snippet pane()}
    <Foundation foundation={one} />
  {/snippet}
  {@render shell(one.title, pane, one.note)}
{/snippet}

{#snippet layerSection(heading: string, summary: string, groups: Group[])}
  <section class="flex flex-col gap-space-3" aria-label={heading}>
    <header class="flex flex-col gap-space-1">
      <h2 class="text-ink-strong type-label">{heading}</h2>
      <p class="text-ink-muted type-meta">{summary}</p>
    </header>
    {#each groups.filter((one) => one.wide) as one (one.title)}
      <div class="-mb-space-4">{@render foundationCard(one)}</div>
    {/each}
    <div class="-mb-space-4 columns-phone gap-space-4">
      {#each groups.filter((one) => !one.wide) as one (one.title)}
        {@render foundationCard(one)}
      {/each}
    </div>
  </section>
{/snippet}

<div
  class="flex min-h-dvh flex-col gap-space-6 bg-surface-page p-space-4 text-ink-strong max-phone:p-space-3"
>
  <header class="flex flex-col gap-space-1">
    <h1 class="type-title">CawCo design system</h1>
    <p class="text-ink-muted type-body">
      Primitive scales, semantic roles, and core kit components in their states,
      light and dark side by side.
    </p>
  </header>

  {@render layerSection(
    "Layer 1 · Primitive scales",
    "Raw steps declared once in theme.css: neutrals, coral, categorical marks, 4px spacing, type ramp, radii, motion, breakpoints, and z-layers.",
    SCALES
  )}

  {@render layerSection(
    "Layer 2 · Semantic roles",
    "Roles bound to Layer 1 by job across light and dark: surfaces, inks, borders, accent, status, type roles, semantic sizes, and elevations.",
    ROLES
  )}

  <section class="flex flex-col gap-space-4" aria-label="Core components">
    <header class="flex flex-col gap-space-1">
      <h2 class="text-ink-strong type-label">Core components</h2>
      <p class="text-ink-muted type-meta">
        The canonical UI kit primitives in their states, including folded
        Dialog, Fluid tabs, and Icon toggle.
      </p>
    </header>

    {#each sections as section (section.title)}
      <div class="flex flex-col gap-space-3">
        <h3 class="text-ink-muted type-label">{section.title}</h3>
        {#if section.flowing.length > 0}
          <div class="-mb-space-4 columns-phone gap-space-4">
            {#each section.flowing as one (one.family.file)}
              {@render card(one)}
            {/each}
          </div>
        {/if}
        {#each section.wide as one (one.family.file)}
          <div class="-mb-space-4">{@render card(one)}</div>
        {/each}
      </div>
    {/each}
  </section>
</div>
