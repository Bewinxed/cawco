<script lang="ts">
  /**
   * One section of CawCo's design system board: a foundation (the
   * transcript, colour, type, spacing, elevation, motion, layout) or a kit
   * family in the states its own states file holds, the light scheme and the
   * dark side by side. Each section is a story of its own
   * (DesignBoard.stories.ts), so a view draws one section and no more.
   *
   * Each scheme is a pane with `data-scheme` and `color-scheme` so one frame
   * holds both schemes regardless of the page's own theme. Interactive
   * controls also show their first state forced into hover, focus, and pressed
   * via the stage's `cawco-<state>` classes.
   */
  import type { Snippet } from "svelte";
  import InlineBlockConversation from "#lib/cawco/transcript/inline-block-conversation-frame.svelte";
  import Foundation from "./Foundation.svelte";
  import { type Card, cardOf, GROUPS } from "./families.js";
  import { ROLES, SCALES } from "./foundations.js";
  import "./type-pairs/type-pairs.css";
  import { type Pair, slugOf, TODAY } from "./type-pairs/pairs.js";

  let {
    pair = TODAY,
    section,
  }: {
    /** The Sans + Mono pair the section is set in (the font-pair dial's). */
    pair?: Pair;
    /** The section drawn: "Transcript", a foundation's title, or a kit family's states file. */
    section: string;
  } = $props();

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

  const foundation = $derived(
    [...ROLES, ...SCALES].find((one) => one.title === section)
  );
  const family = $derived(
    GROUPS.flatMap((group) => group.families).find(
      (one) => one.file === section
    )
  );
</script>

{#snippet shell(title: string, pane: Snippet, note?: string)}
  <section class="@container flex flex-col gap-space-3" aria-label={title}>
    <header class="flex flex-col gap-space-1">
      <h2 class="type-title">{title}</h2>
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

{#snippet frames(one: Card)}
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

<!-- As wide as the frame's screen: its panes stand in a size container, which gives the section no width of its own to fit. -->
<div
  class="w-dvw bg-bg p-space-6 text-tx max-phone:p-space-3"
  data-board
  data-pair={slugOf(pair)}
>
  {#if section === TRANSCRIPT}
    {#snippet transcript()}
      <InlineBlockConversation replies={REPLIES} />
    {/snippet}
    {@render shell(
      TRANSCRIPT,
      transcript,
      "A conversation as the transcript draws it: words, code, a list and a table in the pair the board is set in."
    )}
  {:else if foundation}
    {@const one = foundation}
    {#snippet pane()}
      <Foundation foundation={one} {pair} />
    {/snippet}
    {@render shell(one.title, pane, one.note)}
  {:else if family}
    {@const one = cardOf(family)}
    {#snippet pane()}
      {@render frames(one)}
    {/snippet}
    {@render shell(one.title, pane)}
  {/if}
</div>
