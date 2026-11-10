<script lang="ts">
  /**
   * The Dials card where the artifact panel raises it from its tools over
   * the drawing's foot, with no store read: the kit's floating surface at
   * the reading measure, no taller than half the stage, holding the agent's
   * dials and the props of the state on the stage (props as docgen reads
   * them, the state's args as its file writes them).
   */
  import type { PropMeta } from "@cawco/core/stage";
  import { MediaQuery } from "svelte/reactivity";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import Dials from "./Dials.svelte";
  import type { DialValues, GraphDial } from "./dials";
  import { propDials, savedOf } from "./prop-dials";

  let {
    dials,
    written,
    values,
    component,
    props,
    args,
    edits,
    lang,
  }: {
    dials: GraphDial[];
    written: DialValues;
    values: DialValues;
    /** The component the state mounts. */
    component: string;
    /** Its props as the stage's docgen reads them. */
    props: PropMeta[];
    /** The state's args as its file writes them. */
    args: Record<string, unknown>;
    /** His prop values not saved yet. */
    edits: DialValues;
    lang: string | undefined;
  } = $props();

  /** The stage's height the card is held to half of: a 1440 desk's panel, a 390 phone's. */
  const phone = new MediaQuery("(width < 640px)");
  const stage = $derived(phone.current ? 700 : 820);
  const nothing = () => undefined;
  /**
   * The card hugs the controls' grid (Dials' columns, their two gaps, its
   * pad and edge), never past the reading measure, so no strip of the card
   * stands empty beside the undo glyphs.
   */
  const CARD_W =
    "min(var(--c-measure), calc(var(--c-graph-move-name-w) + var(--c-graph-control-w) + var(--c-btn-h-xs) + 4 * var(--space-3) + 2px))";
</script>

<div
  class="flex justify-center bg-surface-page px-space-3 pt-space-5 pb-space-6"
>
  <div
    class={floatingSurface({
      class:
        "flex max-h-(--card-max) w-full max-w-(--card-w) flex-col p-space-3",
    })}
    data-slot="dials-card"
    style:--card-max={`${stage / 2}px`}
    style:--card-w={CARD_W}
  >
    <Dials
      {dials}
      {lang}
      onchange={nothing}
      onreset={nothing}
      state={{
        component,
        props: propDials(props, dials),
        saved: savedOf(props, args),
        edits,
        onchange: nothing,
        onreset: nothing,
        onsave: nothing,
        onsavenew: nothing,
      }}
      {values}
      {written}
    />
  </div>
</div>
