<script lang="ts" module>
  /**
   * The rail's five words. `failed` is deliberately not `blocked`: a branch that
   * died has stopped, it is not asking for you, and only the one asking for you
   * is allowed to move.
   */
  export type IndicatorState =
    | "working"
    | "idle"
    | "blocked"
    | "failed"
    | "sleeping";
</script>

<script lang="ts">
  /**
   * Which lab is running a row, and what it is doing, in one 16px mark.
   *
   * The logo is the mark and the state is a badge on its corner, which is the
   * avatar-and-presence-dot arrangement, used here for the reason that pattern
   * exists: the two facts are read at different distances. Identity is a shape
   * you match at a glance, so it gets the whole slot; state is one of five
   * things, so a 6px disc of colour is enough to say which.
   *
   * This replaced a ring drawn around the logo. A ring costs its stroke and
   * then its air, twice over across the diameter, which left a 9px well in a
   * 16px slot — and a brand mark at 9px is a smudge, not a mark. The slot is
   * better spent on the logo, with the state laid over it.
   *
   * The dot does not sit *on* the logo, it sits in a hole cut out of it. The
   * mask punches the corner away so the row's own background shows through as
   * the dot's gap. A background-coloured halo would have been simpler and would
   * have been wrong the moment a row is hovered or current, because the colour
   * it was matching is no longer the colour behind it.
   *
   * Hue agrees with `ActivityDot`, because this is the same fact that component
   * reports: amber mid-turn, green at rest, red parked on a human.
   */
  import ProviderLogo from "$lib/components/features/ProviderLogo.svelte";
  import { providerOf } from "./models.svelte";

  let {
    model = null,
    state,
    label,
  }: {
    /** The model id as known on the wire. Without one the mark is the dot alone. */
    model?: string | null;
    state: IndicatorState;
    /** What the row is, when the mark should say that rather than the model. */
    label?: string;
  } = $props();

  const WORD: Record<IndicatorState, string> = {
    working: "Working",
    idle: "Idle",
    blocked: "Needs you",
    failed: "Failed",
    sleeping: "Sleeping",
  };

  /*
   * Motion is rationed to the two states that are actually live. `failed` is
   * red and still, which is the whole of how it differs from `blocked` — one
   * has stopped, the other is waiting, and only waiting deserves the eye.
   */
  const TONE: Record<IndicatorState, string> = {
    working: "bg-warning animate-pulse motion-reduce:animate-none",
    idle: "bg-success",
    blocked: "bg-error",
    failed: "bg-error",
    sleeping: "bg-muted-foreground/60",
  };

  /* `providerOf` finding nothing means nobody here has that lab's mark, and the
     dot stands on its own rather than badging an empty square. */
  const logo = $derived(model && providerOf(model) ? model : null);
  const spoken = $derived(
    [label, model, WORD[state]].filter(Boolean).join(" · ")
  );
</script>

<span
  aria-label={spoken}
  class="relative flex size-4 shrink-0 items-center justify-center"
  role="img"
  title={spoken}
>
  {#if logo}
    <!-- The bite is 4.75px where the dot is 3px, so 1.75px of clean background
         separates them however the row behind is painted. -->
    <span
      class="well size-4"
      style="--bite: radial-gradient(circle at 12.5px 12.5px, transparent 4.75px, #000 5.25px)"
      class:dimmed={state === 'sleeping'}
    >
      <ProviderLogo model={logo} size={16} />
    </span>
  {/if}
  <span
    class="absolute flex size-1.5 items-center justify-center"
    class:badged={logo}
    class:centred={!logo}
  >
    <!-- Blocked is the only state waiting on a human, so it is the only one
         that reaches past its own edge. -->
    {#if state === 'blocked'}
      <span
        class="absolute inset-0 rounded-full bg-error opacity-75 animate-ping motion-reduce:animate-none"
      ></span>
    {/if}
    <span class="absolute inset-0 rounded-full {TONE[state]}"></span>
  </span>
</span>

<style>
  .well {
    -webkit-mask-image: var(--bite);
    mask-image: var(--bite);
  }

  /* A sleeping row keeps its mark, quietly: the lab it would resume on is
     still worth knowing, it is just not news. */
  .dimmed {
    opacity: 0.45;
  }

  /* Centre 12.5 of 16: hard against the corner, where a centred mark has the
     least ink to lose to the bite. */
  .badged {
    right: 0.5px;
    bottom: 0.5px;
  }

  /* With no logo there is no corner to badge, so the dot takes the slot's
     middle and the column reads the same as it did before.

     `relative`, not `static`: this span has to stay the containing block for
     the two `inset-0` discs inside it. Made static, they resolve against the
     16px wrapper instead and the dot renders as a disc filling the whole slot
     — which is every branch row, since a subagent carries no model of its own. */
  .centred {
    position: relative;
  }
</style>
