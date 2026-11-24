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
  import "./type-pairs/type-pairs.css";
  import { type Pair, pairFaces, TODAY } from "./type-pairs/pairs.js";

  /** The Sans + Mono pair the whole board is set in (its switcher's). */
  let { pair = TODAY }: { pair?: Pair } = $props();
  const faces = $derived(pairFaces(pair));

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

{#snippet shell(title: string, pane: Snippet, note?: string, major = false)}
  <section
    class={[
      "@container flex break-inside-avoid flex-col gap-space-3",
      major ? "mb-space-8" : "mb-space-4",
    ]}
    aria-label={title}
  >
    <header class="flex flex-col gap-space-1">
      {#if major}
        <h2 class="type-title">{title}</h2>
      {:else}
        <h3 class="type-label">{title}</h3>
      {/if}
      {#if note}
        <p class="max-w-measure text-tx-2 type-body">{note}</p>
      {/if}
    </header>
    <div class="grid overflow-clip rounded-lg ring ring-ui @phone:grid-cols-2">
      {#each SCHEMES as scheme (scheme.scheme)}
        <div
          data-scheme={scheme.scheme}
          class={[
            "flex min-w-0 flex-col gap-space-3 bg-bg p-space-4 text-tx",
            scheme.scheme === "dark" ? "scheme-dark" : "scheme-light",
          ]}
        >
          <p class="text-tx-2 type-meta">{scheme.label}</p>
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
        <figcaption class="text-tx-2 type-meta">
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
          <figcaption class="text-tx-2 type-meta">
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
    <Foundation foundation={one} {pair} />
  {/snippet}
  {@render shell(one.title, pane, one.note, true)}
{/snippet}

{#snippet foundations(groups: Group[])}
  {#each groups as one (one.title)}
    {@render foundationCard(one)}
  {/each}
{/snippet}

<div
  class="flex min-h-dvh flex-col gap-space-8 bg-bg p-space-6 text-tx max-phone:p-space-3"
  style:--font-sans={faces?.sans}
  style:--font-mono={faces?.mono}
>
  <header class="flex flex-col gap-space-1">
    <h1 class="type-kpi">CawCo design system</h1>
    <p class="text-tx-2 type-body">
      Semantic roles, shared scales, and core kit components in their states,
      light and dark side by side.
    </p>
  </header>

  {@render foundations(ROLES)}

  {@render foundations(SCALES)}

  <section class="flex flex-col gap-space-4" aria-label="Core components">
    <header class="flex flex-col gap-space-1">
      <h2 class="type-title">Core components</h2>
      <p class="text-tx-2 type-meta">
        The canonical UI kit primitives in their states, including subgrid Row,
        row-subgrid OptionTiles, Dialog, Fluid tabs, and Icon toggle.
      </p>
    </header>

    {#each sections as section (section.title)}
      <div class="flex flex-col gap-space-3">
        <h3 class="text-tx-2 type-label">{section.title}</h3>
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
