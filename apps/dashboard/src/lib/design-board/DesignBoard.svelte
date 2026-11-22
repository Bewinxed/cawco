<script lang="ts">
  /**
   * CawCo's design system as the shipped dashboard draws it: the theme's
   * foundations (foundations.ts, read off theme.css, each token drawn
   * through `var()`), then every live kit component (families.ts) in each
   * state its states file holds, drawn in the light scheme and the dark side
   * by side. Each scheme is a pane that
   * says it (`data-scheme`, which the theme's dark and light variants read,
   * and its `color-scheme`, which every `light-dark()` token follows), so one
   * frame holds both whatever scheme the page itself is in.
   *
   * A component that answers the pointer draws its first state again forced
   * into hover, focus and press: the stage rewrites every `:hover`,
   * `:focus-visible` and `:active` rule to also match an element carrying
   * `cawco-<state>` (stage-host canvas pseudo.ts `stateClass`), which the
   * first control in each of those frames carries, so what the board draws
   * is the component's own rule, never a copy of it.
   *
   * The components stand in sections by kind. In a section each is a card,
   * its two panes side by side where the card is wide enough and one over
   * the other on a phone; the cards flow in columns, so a short card never
   * leaves a hole beside a tall one, and a component whose frames need room
   * takes the section's whole width under them.
   */
  import type { Snippet } from "svelte";
  import Foundation from "./Foundation.svelte";
  import { type Family, framesOf, GROUPS, titleOf } from "./families.js";
  import { FOUNDATIONS } from "./foundations.js";

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

  /** Puts the stage's forced-state class on the frame's first control (stage-host canvas pseudo.ts `stateClass`). */
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

{#snippet shell(title: string, pane: Snippet)}
  <section
    class="@container mb-space-5 flex break-inside-avoid flex-col overflow-clip rounded-lg border border-border-hairline"
    aria-label={title}
  >
    <h3
      class="border-b border-border-hairline bg-surface-raised px-space-4 py-space-2 type-label"
    >
      {title}
    </h3>
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
  <div class="flex flex-wrap items-start gap-space-5">
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

{#snippet foundationCard(one: (typeof FOUNDATIONS)[number])}
  {#snippet pane()}
    <Foundation foundation={one} />
  {/snippet}
  {@render shell(one.title, pane)}
{/snippet}

<div
  class="flex min-h-dvh flex-col gap-space-6 bg-surface-page p-space-5 text-ink-strong max-phone:p-space-3"
>
  <header class="flex flex-col gap-space-1">
    <h1 class="type-title">CawCo design system</h1>
    <p class="text-ink-muted type-body">
      The theme's foundations and every kit component the dashboard ships, in
      its states, light and dark side by side.
    </p>
  </header>

  <section class="flex flex-col gap-space-3" aria-label="Foundations">
    <h2 class="text-ink-muted type-label">Foundations</h2>
    {#each FOUNDATIONS.filter((one) => one.wide) as one (one.title)}
      <div class="-mb-space-5">{@render foundationCard(one)}</div>
    {/each}
    <div class="-mb-space-5 columns-phone gap-space-5">
      {#each FOUNDATIONS.filter((one) => !one.wide) as one (one.title)}
        {@render foundationCard(one)}
      {/each}
    </div>
  </section>

  {#each sections as section (section.title)}
    <section class="flex flex-col gap-space-3" aria-label={section.title}>
      <h2 class="text-ink-muted type-label">{section.title}</h2>
      {#if section.flowing.length > 0}
        <div class="-mb-space-5 columns-phone gap-space-5">
          {#each section.flowing as one (one.family.file)}
            {@render card(one)}
          {/each}
        </div>
      {/if}
      {#each section.wide as one (one.family.file)}
        <div class="-mb-space-5">{@render card(one)}</div>
      {/each}
    </section>
  {/each}
</div>
