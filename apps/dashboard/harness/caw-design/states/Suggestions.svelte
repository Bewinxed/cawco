<script lang="ts">
  /**
   * PROPOSED (pin 6, addendum §A): what to ask Caw, one design for his
   * panel's hero and the empty board. A ranked list from the hub, each a
   * tile of its own (the house's raised tile, TaskCard's recipe, all one
   * width, --space-2 apart), so it reads as something to press and never
   * as an Earlier row: the kind's Solar duotone glyph in ink-strong, the
   * sentence (label, ink-strong) and under it the reason naming its source
   * (meta, muted), so the claim can be checked before the press. The whole
   * tile is the control, named by its sentence; a press puts the sentence
   * in the composer, and nothing is sent.
   *
   * - generating: the list's skeleton at its real size, as many rows as
   *   the cap, held still until the hub answers.
   * - generated: skeleton out and rows in on one cross-fade (--dur-fade,
   *   opacity only), then the rows uncovered top to bottom (--pop-rise,
   *   --dur-pop, one clock: min(--dur-stagger, --dur-cascade / n)).
   * - more than the cap: "Show N more" unfolds the rest (Fold).
   * - none: the section is absent; on a first thread with nothing else
   *   under the title, one meta line says when they come.
   * - refreshed: kept rows slide to their new rank (--dur-panel,
   *   --ease-in-out), leavers close (--dur-exit), arrivals uncover
   *   (--dur-pop), a kept row's changed reason morphs (MorphText).
   */
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import Fold from "./Fold.svelte";
  import type { Suggestion } from "./fixtures";
  import { crossFade, ease, leave, ms, uncover } from "./motion";
  import { TILE, TILE_SHAPE } from "./tile";

  let {
    items,
    cap = 4,
    phase = "generated",
    live = false,
    open = false,
    next = null,
    first = false,
    board = false,
    onpick,
  }: {
    items: Suggestion[];
    /** How many show before Show more: 4 in the panel, 6 on the board. */
    cap?: number;
    phase?: "generating" | "generated";
    /** Lands live: the skeleton first, then the rows uncovered. */
    live?: boolean;
    open?: boolean;
    /** The list the project's change ranks next, landing a beat after. */
    next?: Suggestion[] | null;
    /** A first thread: nothing else stands under the title. */
    first?: boolean;
    board?: boolean;
    onpick: (text: string) => void;
  } = $props();

  // The state's start: a proposal is mounted once per state, and its own
  // timers move it on from there.
  let now = $state<"generating" | "generated">(untrack(() => phase));
  let list = $state<Suggestion[]>(untrack(() => items));
  let more = $state(false);
  $effect.pre(() => {
    more = open;
  });
  $effect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (live) {
      now = "generating";
      timers.push(
        setTimeout(() => {
          now = "generated";
        }, 900)
      );
    }
    if (next) {
      const ranked = next;
      timers.push(
        setTimeout(() => {
          list = ranked;
        }, 1200)
      );
    }
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  });

  const shown = $derived(list.slice(0, cap));
  const rest = $derived(list.slice(cap));
  const step = $derived(
    Math.min(
      ms("--dur-stagger"),
      ms("--dur-cascade") / Math.max(shown.length, 1)
    )
  );
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Each reason's element, the tile's accessible description. */
  const uid = $props.id();
  const reasonId = (one: Suggestion) => `${uid}-why-${list.indexOf(one)}`;
  const slide = () => ({
    duration: still ? 0 : ms("--dur-panel"),
    easing: ease("--ease-in-out"),
  });
</script>

{#snippet row(one: Suggestion)}
  {@const Glyph = GLYPHS[one.glyph]}
  <Tip label={one.reason ? `${one.text}\n${one.reason}` : one.text}>
    {#snippet children(tip)}
      <!-- Its own silhouette, the house's raised tile (TaskCard's recipe):
           something to press, not a row of the Earlier list under it. -->
      <!-- Named by its sentence; its reason, a caption one step down in the
           meta role and muted ink, is its description. -->
      <button
        {...tip}
        aria-describedby={one.reason ? reasonId(one) : undefined}
        aria-label={one.text}
        class={TILE}
        data-design-suggestion
        onclick={() => onpick(one.text)}
        type="button"
      >
        <span class="glyph mark-cell"><Glyph aria-hidden="true" /></span>
        <span class="words">
          <span class="text">{one.text}</span>
          {#if one.reason && next}
            <!-- A list the project's change re-ranks: a kept row's reason morphs. -->
            <span class="reason" id={reasonId(one)}
              ><MorphText text={one.reason} /></span
            >
          {:else if one.reason}
            <span class="reason" id={reasonId(one)}>{one.reason}</span>
          {/if}
        </span>
      </button>
    {/snippet}
  </Tip>
{/snippet}

{#if list.length > 0}
  <section aria-label="Things to ask Caw" class={["suggest", { board }]}>
    <div class="room">
      {#if now === "generating"}
        <ul
          aria-hidden="true"
          class="list skeleton gap-(--space-2)"
          out:crossFade
        >
          {#each { length: cap } as _, at (at)}
            <li class={["ghost", TILE_SHAPE]}>
              <Skeleton class="tile" />
              <span class="words">
                <Skeleton class="bar label-bar" />
                <Skeleton class="bar meta-bar" />
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="rows gap-(--space-2)" in:crossFade>
          <ul class="list gap-(--space-2)">
            {#each shown as one, at (one.text)}
              <li
                animate:flip={slide()}
                in:uncover|global={{ delay: live ? at * step : 0 }}
                out:leave
              >
                {@render row(one)}
              </li>
            {/each}
          </ul>
          {#if rest.length > 0}
            <Fold open={more}>
              <ul class="list gap-(--space-2)">
                {#each rest as one (one.text)}
                  <li>{@render row(one)}</li>
                {/each}
              </ul>
            </Fold>
            <!-- Its words on the tiles' edge: the link's 1px edge and 8px
                 inset taken back. -->
            <Button
              aria-expanded={more}
              class="-ms-[9px] self-start"
              label={more ? "Show fewer" : `Show ${rest.length} more`}
              onclick={() => {
                more = !more;
              }}
              size="xs"
              variant="link"
            />
          {/if}
        </div>
      {/if}
    </div>
  </section>
{:else if first}
  <p class="none">
    Suggestions appear once the project has tasks, threads or a repository.
  </p>
{/if}

<style>
  .suggest {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    /* One measure at every width, panel or board, on the room's start
       edge. */
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 36rem;
    text-align: start;
  }
  /* Skeleton and rows share one cell: the cross-fade moves nothing. */
  .room {
    display: grid;
    min-inline-size: 0;
  }
  .room > :global(*) {
    grid-area: 1 / 1;
    min-inline-size: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    min-inline-size: 0;
  }
  .glyph {
    color: var(--ink-strong);
  }
  .glyph :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  /* The duotone's half layer at the status glyphs' weight, so a lens or a
     handle never fades to a grey disc. */
  .glyph :global(svg [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }
  .words {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .text {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  /* One line, clamped as lines are: its words (and the ids set in mono
     among them) wrap inside the row and the lines past the first are cut,
     so nothing is laid out past its edge. */
  .reason {
    display: -webkit-box;
    min-inline-size: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  /* The morphing words are the line's own box, so the clip and its
     ellipsis happen inside it rather than past it. */
  .reason :global(.morph-text) {
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The skeleton at the tiles' own size: a 16px glyph, a 60% label bar and
     a 40% meta bar on the tile's own surface. */
  .ghost :global(.tile) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    margin-block-start: calc((1lh - var(--icon-md)) / 2);
  }
  .ghost .words {
    gap: var(--space-1);
    padding-block: calc(var(--space-1) / 2);
  }
  .ghost :global(.bar) {
    border-radius: var(--radius-xs);
  }
  .ghost :global(.label-bar) {
    inline-size: 60%;
    block-size: var(--text-label);
  }
  .ghost :global(.meta-bar) {
    inline-size: 40%;
    block-size: var(--text-meta);
  }
  .none {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
