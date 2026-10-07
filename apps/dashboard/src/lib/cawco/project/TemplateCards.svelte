<script lang="ts">
  /**
   * New project's template cards (design §5): radio cards on app.css's icon
   * cards (the channel-card recipe: one selection frame for the set, 1px
   * `brand-solid` over `surface-recess`), as many to a row as fit. The
   * frame is the house highlight's selection pill (components/ui/highlight,
   * the new-session dialog's list), drawn in that recipe: it glides to the
   * picked card with the house timing and the cards share its hover ghost.
   * Caw's ledge peek stands on the card that fits the prompt, the ledge line
   * on its top edge, "Fits your prompt" on it.
   *
   * The page decides when the peek is there (one live Caw at a time: the
   * page's 80px Caw goes before he peeks); once there, he moves to whichever
   * card fits now. A tap picks a card whatever fits.
   */
  import { RadioGroup } from "bits-ui";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import Caw, { LEDGE_LINE } from "../home/Caw.svelte";
  import CardFace from "./CardFace.svelte";
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

  let boxes = $state<Partial<Record<TemplateName, Box>>>({});

  /** Each card's box in the grid's own coordinates, read whenever the grid's size changes. */
  function measure(node: HTMLElement) {
    const read = () => {
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
    class="icon-cards cards"
    onValueChange={(next) => {
      selected = (next || null) as TemplateName | null;
    }}
    value={selected ?? ""}
    {@attach measure}
    {@attach highlight({
      rows: ".icon-card",
      selected: '.icon-card[data-state="checked"]',
      axis: "xy",
    })}
  >
    {#each cards as card (card.template)}
      <RadioGroup.Item
        class="icon-card"
        data-template={card.template}
        value={card.template}
      >
        <CardFace
          hue={card.hue}
          icon={card.icon}
          meta={metaOf(card)}
          name={card.name}
        >
          {#snippet aside()}
            {#if fit === card.template && peek}
              <span class="fits" transition:appear>Fits your prompt</span>
            {/if}
          {/snippet}
        </CardFace>
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
  /* The cards are app.css's icon cards; rows stand further apart here, so
     Caw's rise has the room. */
  .templates :global(.cards) {
    row-gap: var(--space-8);
  }
  .fits {
    font: var(--type-label);
    color: var(--brand-ink);
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
