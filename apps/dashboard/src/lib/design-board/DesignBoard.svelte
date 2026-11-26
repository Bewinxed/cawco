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
  import InlineBlockConversation from "#lib/cawco/transcript/inline-block-conversation-frame.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import Foundation from "./Foundation.svelte";
  import { type Family, framesOf, GROUPS, titleOf } from "./families.js";
  import { type Foundation as Group, ROLES, SCALES } from "./foundations.js";
  import "./type-pairs/type-pairs.css";
  import { PAIRS, type Pair, slugOf, TODAY } from "./type-pairs/pairs.js";

  /** The Sans + Mono pair the whole board is set in (its switcher's). */
  let { pair = TODAY }: { pair?: Pair } = $props();

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

  /**
   * Every section stays mounted, and the browser skips drawing the ones off
   * screen (`content-visibility: auto`, owner's pick, 2026-11-25). Each pane
   * carries `contain-intrinsic-size: auto` from its first frame, so the
   * browser remembers its real height while it is drawn (it remembers only
   * for a box that carries `auto`), and skipping starts only once every
   * pane has held its height through a frame: the kit's frames measure
   * themselves as they mount and settle a frame or two later (a checkbox's
   * pane 100px in its first frame, 156px in its second). So no section
   * changes height as it comes into view, and the browser's scroll anchoring
   * never moves the board under the reader. The 352px is only what a pane
   * would stand at before it was ever drawn.
   */
  let skipping = $state(false);

  /** Turns skipping on once a frame passes with no pane resized. */
  const remember = (node: HTMLElement) => {
    const seen = frameObserver((changed) => {
      if (changed.length > 0) {
        seen.request();
        return;
      }
      skipping = true;
      seen.disconnect();
    });
    for (const pane of node.querySelectorAll("[data-board-pane]")) {
      seen.observe(pane);
    }
    return () => seen.disconnect();
  };

  /** A section's anchor, from its title: what the index's links name. */
  const anchorOf = (title: string) =>
    `section-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;

  const sections = GROUPS.map((group) => ({
    title: group.title,
    flowing: group.families.filter((one) => !one.wide).map(cardOf),
    wide: group.families.filter((one) => one.wide).map(cardOf),
  }));

  /** A conversation as the transcript draws it: type in use, to judge a pair by. */
  const TRANSCRIPT = "Transcript";
  const REPLIES = [
    [
      "The deploy to **obelisk-of-light** finished, and all 14 checks passed. Two things changed since the last run:",
      "",
      "1. The hub now restarts `cawco-hub` only after its migrations land, so a session no longer sees a half-written database.",
      "2. The board reads `--font-sans` and `--font-mono` from one place, so a pair changes every role at once.",
      "",
      "```ts",
      'const machine = "obelisk-of-light";',
      "await deploy(machine, { retries: 3, timeoutMs: 90_000 });",
      "// 0O 1lI 5S 8B: every glyph apart",
      "```",
      "",
      "| Check | Took | Result |",
      "| --- | --- | --- |",
      "| Type check | 41.2s | Passed |",
      "| Lint | 18.7s | Passed |",
      "| Migrations | 1.9s | Passed |",
      "",
      "Next I'll move the stop tray onto the kit's confirm. Say if you'd rather I start with the focus rings.",
    ].join("\n"),
  ];

  /**
   * The board's index, in its own order: the foundations, then each group
   * of components, every link an anchor to its section. The board scrolls
   * in its own column beside it, so the index stays in view.
   */
  const INDEX = [
    {
      title: "Foundations",
      links: [TRANSCRIPT, ...[...ROLES, ...SCALES].map((one) => one.title)],
    },
    ...sections.map((section) => ({
      title: section.title,
      links: [...section.flowing, ...section.wide].map((one) => one.title),
    })),
  ];
</script>

{#snippet shell(title: string, pane: Snippet, note?: string, major = false)}
  <section
    class={[
      "@container flex break-inside-avoid flex-col gap-space-3",
      major ? "mb-space-8" : "mb-space-4",
    ]}
    aria-label={title}
    id={anchorOf(title)}
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
    <div
      data-board-pane
      class={[
        "grid overflow-clip rounded-lg ring ring-ui intrinsic-auto-88 @phone:grid-cols-2",
        skipping && "content-visibility-auto",
      ]}
    >
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

{#snippet holds()}
  <div class="flex flex-col gap-space-1">
    <p class="text-tx-2 type-meta">Hold to see the board in</p>
    {#each PAIRS as { short, slug } (slug)}
      <Button
        align="row"
        data-pair-hold={slug}
        label={short}
        size="sm"
        variant="ghost"
      />
    {/each}
  </div>
{/snippet}

{#snippet index()}
  <ul class="flex flex-col gap-space-4">
    {#each INDEX as group (group.title)}
      <li class="flex flex-col gap-space-1">
        <p class="text-tx-2 type-meta">{group.title}</p>
        <ul class="flex flex-col">
          {#each group.links as title (title)}
            <li>
              <a
                class="block rounded-xs px-space-2 py-space-1 text-tx-2 type-label hover:bg-ui hover:text-tx"
                href={`#${anchorOf(title)}`}>{title}</a
              >
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="flex h-dvh bg-bg text-tx" data-board data-pair={slugOf(pair)}>
  <nav
    aria-label="Sections"
    class="h-dvh w-56 flex-none overflow-y-auto overscroll-contain border-e border-ui p-space-4 max-desk:hidden"
  >
    {@render holds()}
    <div class="mt-space-6">{@render index()}</div>
  </nav>
  <div
    {@attach remember}
    class="flex h-dvh min-w-0 flex-1 flex-col gap-space-8 overflow-y-auto overscroll-contain p-space-6 max-phone:p-space-3"
  >
    <details
      class="sticky top-0 z-1 -mx-space-6 -mt-space-6 border-b border-ui bg-bg px-space-6 py-space-2 desk:hidden max-phone:-mx-space-3 max-phone:-mt-space-3 max-phone:px-space-3"
    >
      <summary class="type-label">Sections</summary>
      <div class="max-h-96 overflow-y-auto overscroll-contain pt-space-2">
        {@render index()}
      </div>
    </details>
    <header class="flex flex-col gap-space-1">
      <h1 class="type-kpi">CawCo design system</h1>
      <p class="text-tx-2 type-body">
        Semantic roles, shared scales, and core kit components in their states,
        light and dark side by side.
      </p>
    </header>

    {#snippet transcript()}
      <InlineBlockConversation replies={REPLIES} />
    {/snippet}
    {@render shell(
      TRANSCRIPT,
      transcript,
      "A conversation as the transcript draws it: words, code, a list and a table in the pair the board is set in.",
      true
    )}

    {@render foundations(ROLES)}

    {@render foundations(SCALES)}

    <section class="flex flex-col gap-space-4" aria-label="Core components">
      <header class="flex flex-col gap-space-1">
        <h2 class="type-title">Core components</h2>
        <p class="text-tx-2 type-meta">
          The canonical UI kit primitives in their states, including subgrid
          Row, row-subgrid OptionTiles, Dialog, Fluid tabs, and Icon toggle.
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
</div>
