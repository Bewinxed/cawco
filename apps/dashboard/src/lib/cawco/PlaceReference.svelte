<script lang="ts">
  /**
   * A place in an artifact named in written words (core references.ts): a
   * pin (`cawco:pin/<artifact>/<n>`), a decision card
   * (`cawco:decision/<artifact>/<card>`) or the artifact itself
   * (`cawco:artifact/<id>`), drawn as the inline chip (ui/chip `inline`)
   * with the label the dashboard holds now (preview/places.svelte.ts):
   *
   * - **A pin:** its disc as the mark (at 40% resolved, recessed when its
   *   element is gone, the needs-you dot while its answer is unread), what
   *   it stands on as the label. Resting on it peeks its thread's first
   *   line in the floating-tag recipe.
   * - **A card:** the decision card's checklist glyph and its question;
   *   "· picked" or "· not picked" in its title alone.
   * - **An artifact:** its kind's glyph and its name.
   *
   * A press brings the artifact to the front of the panel of the
   * conversation it is written in (the transcript's `cawco:panel`, else the
   * session holding it), on a phone in its sheet, and asks the pane for the
   * place (preview/place-ask.svelte.ts): pin N's card open, or the card
   * scrolled to and outlined; asked before the page is ready, it lands once
   * it is. In an artifact's own tab, a chip for another artifact goes to
   * that one's tab (`?pin=` for a pin).
   */
  import { placeOf } from "@cawco/core";
  import { Portal } from "bits-ui";
  import { getContext } from "svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconDecisionCard } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ShowRefused, showArtifact } from "./artifact-api";
  import { ARTIFACT_GLYPHS } from "./artifact-glyphs";
  import { revealPreview } from "./client.svelte";
  import { failureWords } from "./hub-read";
  import { rise } from "./motion/curves.svelte";
  import PinDisc from "./preview/PinDisc.svelte";
  import { askPlace, type PlaceAsked } from "./preview/place-ask.svelte";
  import { places } from "./preview/places.svelte";
  import { toast } from "./toasts";

  let {
    kind,
    id,
  }: {
    kind: "pin" | "decision" | "artifact";
    /** As the registry found it (references.ts): `<artifact>/<place>` for a pin or a card, the artifact's id for an artifact. */
    id: string;
  } = $props();

  const peekId = $props.id();
  /** The conversation the chip is written in: its panel is where the artifact comes to the front. */
  const panel = getContext<(() => string) | undefined>("cawco:panel");

  const place = $derived(
    kind === "artifact" ? { artifact: id, at: "" } : placeOf(id)
  );
  const held = $derived(place ? places.of(place.artifact) : null);
  const pin = $derived(
    kind === "pin" && place
      ? held?.pins.find((one) => String(one.number) === place.at)
      : undefined
  );
  const card = $derived(
    kind === "decision" && place
      ? held?.cards.find((one) => one.id === place.at)
      : undefined
  );
  const label = $derived(pin?.name ?? card?.question ?? held?.name ?? "");
  const title = $derived.by(() => {
    if (pin) {
      if (pin.moved) {
        return `Pin ${pin.number} · its element is gone`;
      }
      return pin.resolved
        ? `Pin ${pin.number} · resolved`
        : `Pin ${pin.number} on ${pin.name}`;
    }
    if (card) {
      return `${card.question} · ${card.picked ? "picked" : "not picked"}`;
    }
    return held?.name ?? "";
  });
  const Glyph = $derived(held ? ARTIFACT_GLYPHS[held.kind] : null);

  /** Its first line, peeked while the pointer rests on a pin's chip; its box in the viewport. */
  let peek = $state<DOMRect | null>(null);
  let chip = $state<HTMLButtonElement>();

  async function press() {
    if (!held) {
      return;
    }
    let asked: PlaceAsked | null = null;
    if (pin) {
      asked = { pin: pin.number };
    } else if (card) {
      asked = { card: card.id };
    }
    if (asked) {
      askPlace(held.id, asked);
    }
    const own = page.url.pathname.match(OWN_TAB)?.[1];
    if (own !== undefined) {
      if (decodeURIComponent(own) !== held.id) {
        await goto(
          `/artifact/${encodeURIComponent(held.id)}${pin ? `?pin=${pin.number}` : ""}`
        );
      }
      return;
    }
    const session = panel?.() ?? held.instanceId;
    if (!session) {
      return;
    }
    try {
      await showArtifact(session, held.id);
      revealPreview(session);
    } catch (error) {
      toast.error(
        error instanceof ShowRefused ? error.message : failureWords(error)
      );
    }
  }

  /** An artifact's own tab: `/artifact/<id>`. */
  const OWN_TAB = /^\/artifact\/([^/]+)/;
</script>

<!-- The chip stands in a line of text as a word does (ui/chip `inline`). -->
<button
  aria-describedby={peek && pin?.firstLine ? peekId : undefined}
  class={chipVariants({ variant: "inline" })}
  data-place-chip={kind}
  data-place={id}
  data-resolved={pin?.resolved || undefined}
  data-unread={pin?.unread || undefined}
  onclick={press}
  onpointerenter={() => {
    peek = pin && chip ? chip.getBoundingClientRect() : null;
  }}
  onpointerleave={() => {
    peek = null;
  }}
  {title}
  type="button"
  bind:this={chip}
>
  {#if pin}
    <span data-slot="mark" class="grid flex-none place-items-center" data-box>
      <PinDisc
        inline
        moved={pin.moved}
        number={pin.number}
        resolved={pin.resolved}
        unread={pin.unread}
      />
    </span>
    {#if pin.unread}
      <span class="sr-only">New answer:</span>
    {/if}
  {:else if card}
    <IconDecisionCard />
  {:else if Glyph}
    <Glyph />
  {/if}
  <span data-slot="label">{label}</span>
</button>{#if peek && pin?.firstLine}<Portal>
    <!-- The pin's first line, in the floating-tag recipe, over the chip. -->
    <div
      id={peekId}
      data-slot="place-peek"
      class="fixed left-(--peek-x) top-(--peek-y) -mt-space-2 z-(--layer-flight) max-w-c-pin-card-w truncate px-space-2 py-space-1 border border-border-hairline rounded-md bg-surface-raised shadow-overlay type-meta text-ink-row pointer-events-none -translate-y-full"
      role="tooltip"
      style:--peek-x="{peek.left}px"
      style:--peek-y="{peek.top}px"
      in:rise={"--dur-panel"}
      out:rise={"--dur-exit"}
    >
      {pin.firstLine}
    </div>
  </Portal>{/if}
