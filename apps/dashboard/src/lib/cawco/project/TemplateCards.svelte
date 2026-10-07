<script lang="ts">
  /**
   * New project's template cards (design §5): radio cards on the channel-card
   * recipe, as many to a row as fit, one selection frame for the set that
   * travels to the picked card (the leading edge at once, the trailing edge
   * after --dur-ghost, each over --dur-fade on ease-in-out; with less motion
   * it fades across), and Caw's ledge peek standing on the card that fits
   * the prompt, the ledge line on its top edge, "Fits your prompt" on it.
   *
   * The page decides when the peek is there (one live Caw at a time: the
   * page's 80px Caw goes before he peeks); once there, he moves to whichever
   * card fits now. A tap picks a card whatever fits.
   */
  import { RadioGroup } from "bits-ui";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import Caw, { LEDGE_LINE } from "../home/Caw.svelte";
  import type { TemplateCard, TemplateName } from "./new-project";

  let {
    cards,
    selected = $bindable(),
    fit,
    peek,
    peekPresent,
    onpeekgone,
    metaOf,
    peekSize,
    peekShare,
  }: {
    cards: readonly TemplateCard[];
    selected: TemplateName | null;
    /** The card the prompt fits, or null. */
    fit: TemplateName | null;
    /** The peek is mounted (the page's own Caw has gone). */
    peek: boolean;
    /** Off: the peek leaves, and `onpeekgone` says when he has. */
    peekPresent: boolean;
    onpeekgone: () => void;
    /** A card's meta line as it reads now (the code card's says when no machine is online). */
    metaOf: (card: TemplateCard) => string;
    /** The side of the peek's still, px. */
    peekSize: number;
    /** The key the peek departs under when the page goes (motion/share). */
    peekShare?: string;
  } = $props();

  interface Box {
    height: number;
    left: number;
    top: number;
    width: number;
  }

  let gridBox = $state({ width: 0, height: 0 });
  let boxes = $state<Partial<Record<TemplateName, Box>>>({});

  /** Each card's box in the grid's own coordinates, read whenever the grid's size changes. */
  function measure(node: HTMLElement) {
    const read = () => {
      gridBox = { width: node.clientWidth, height: node.clientHeight };
      const next: Partial<Record<TemplateName, Box>> = {};
      for (const card of node.querySelectorAll<HTMLElement>(
        "[data-template]"
      )) {
        next[card.dataset.template as TemplateName] = {
          top: card.offsetTop,
          left: card.offsetLeft,
          width: card.offsetWidth,
          height: card.offsetHeight,
        };
      }
      boxes = next;
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }

  const frame = $derived(selected ? boxes[selected] : undefined);
  /**
   * Which edges lead: the frame's edge on the side it travels to moves at
   * once, the one it leaves behind after --dur-ghost.
   */
  let travel = $state("");
  let before: Box | undefined;
  $effect.pre(() => {
    const now = frame;
    const was = before;
    before = now;
    if (!(now && was)) {
      travel = "";
      return;
    }
    const lead = "0ms";
    const trail = "var(--dur-ghost)";
    const right = now.left > was.left;
    const down = now.top > was.top;
    const delays = {
      left: right ? trail : lead,
      right: right ? lead : trail,
      top: down ? trail : lead,
      bottom: down ? lead : trail,
    };
    travel = (["left", "right", "top", "bottom"] as const)
      .map(
        (edge) => `${edge} var(--dur-fade) var(--ease-in-out) ${delays[edge]}`
      )
      .join(", ");
  });

  /** Where the peek stands: centred on the fitting card, the ledge line on its top edge. */
  const rise = $derived(peekSize * LEDGE_LINE);
  /**
   * The card he stands on: the fitting one, and while the fit is gone and
   * he leaves, the one he was on, so he leaves from where he stood.
   */
  let standsOn = $state<TemplateName | null>(null);
  $effect.pre(() => {
    if (fit) {
      standsOn = fit;
    } else if (!peek) {
      standsOn = null;
    }
  });
  const peekAt = $derived.by(() => {
    const box = standsOn ? boxes[standsOn] : undefined;
    return box
      ? {
          x: box.left + (box.width - peekSize) / 2,
          y: box.top - rise,
        }
      : undefined;
  });
  /** The peek's first place is taken without travel; after that he moves. */
  let placed = $state(false);
  $effect(() => {
    if (!peek) {
      placed = false;
    } else if (peekAt && !placed) {
      requestAnimationFrame(() => {
        placed = true;
      });
    }
  });
</script>

<div class="templates">
  <RadioGroup.Root
    aria-label="Template"
    class="cards"
    onValueChange={(next) => {
      selected = (next || null) as TemplateName | null;
    }}
    value={selected ?? ""}
    {@attach measure}
  >
    {#if frame}
      <span
        aria-hidden="true"
        class="frame"
        style:bottom="{gridBox.height - frame.top - frame.height}px"
        style:left="{frame.left}px"
        style:right="{gridBox.width - frame.left - frame.width}px"
        style:top="{frame.top}px"
        style:transition={travel || null}
        transition:appear
      ></span>
    {/if}

    {#each cards as card (card.template)}
      <RadioGroup.Item
        class="tcard"
        data-template={card.template}
        value={card.template}
      >
        {@const Icon = card.icon}
        <span class="head">
          <span class="tile" style:color={card.hue}><Icon /></span>
          {#if fit === card.template && peek}
            <span class="fits" transition:appear>Fits your prompt</span>
          {/if}
        </span>
        <span class="name">{card.name}</span>
        <span class="meta">{metaOf(card)}</span>
      </RadioGroup.Item>
    {/each}

    {#if peek && peekAt}
      <div
        aria-hidden="true"
        class="peek"
        data-share={peekShare}
        style:translate="{peekAt.x}px {peekAt.y}px"
        class:placed
      >
        <Caw
          ledge
          ongone={onpeekgone}
          present={peekPresent}
          size={peekSize}
          status="ready"
        />
      </div>
    {/if}
  </RadioGroup.Root>
</div>

<style>
  /* Room above the first row for Caw: his rise over the ledge line takes
     the gap above and the first lines of padding of a card in the row
     above, never its words. */
  .templates {
    padding-top: var(--space-8);
  }
  .templates :global(.cards) {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-8) var(--space-3);
  }
  @media (max-width: 639px) {
    .templates :global(.cards) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 399px) {
    .templates :global(.cards) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .templates :global(.tcard) {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-7) var(--space-4) var(--space-4);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-strong);
    font: var(--type-meta);
    text-align: start;
    cursor: pointer;
    transition: var(--transition-control);
  }
  .templates :global(.tcard) > :global(*) {
    position: relative;
    z-index: 2;
  }
  .templates :global(.tcard:active) {
    background: var(--surface-fill);
  }
  @media (hover: hover) {
    .templates :global(.tcard:hover) {
      background: var(--surface-hover);
    }
  }
  .templates :global(.tcard:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: -2px;
  }
  /* Its head: the icon tile (DESIGN.md: the duotone glyph on a raised
     26px tile, in its section hue), and the fit beside it. */
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 26px;
    margin-block-end: var(--space-2);
  }
  .tile {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .tile :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .name {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .meta {
    color: var(--ink-muted);
  }
  .fits {
    font: var(--type-label);
    color: var(--brand-ink);
  }
  /* The one frame for the set: drawn under the cards' text, it is what moves. */
  .frame {
    position: absolute;
    z-index: 1;
    border: 1px solid var(--brand-solid);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .frame {
      transition: none !important;
    }
  }
  /* Caw stands on the fitting card, painted over the grid. */
  .peek {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .peek.placed {
      transition: translate var(--dur-panel) var(--ease-drawer);
    }
  }
</style>
