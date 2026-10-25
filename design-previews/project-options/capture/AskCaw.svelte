<!--
  Ask Caw, Caw's seat (report part 1, rulings 8 and 4): his face is its
  glyph, in the pose for what he is doing, with the Status dot on the
  glyph's top-end corner while he works (live, breathing) or asks (needs
  you, pinging).

  - `open="none"`: the view's one coral, the act a board is for.
  - `open="pane"`: a pane with a decision is open, so the coral is the
    pane's: Ask Caw drops its fill and its word and stands as his face, a
    bare symbol in the bar's glass, named "Ask Caw" in its tooltip and for
    the screen reader (The Coral Is Where You Act Rule; ruling 8 as
    amended: "A control takes words only where no symbol says it").
  - `open="caw"`: his column is open, its Send the coral: the same face
    symbol wears the selected wash (`selected-bg`, the rail row's).
  Its word and coral come back when nothing else holds the view's act.

  `seat`: idle, working, asking-a or asking-b (the two asking takes; the
  owner picks). `phone` draws it for a docked foot bar: coral, it is the
  dock's Button; without its coral, the face alone with no glass round it
  (glass is a title bar's, and a dock is content's ground).
-->
<script>
  import { BarGlass, Button } from "./kit.js";

  let { open = "none", seat = "idle", phone = false } = $props();
  const pose = $derived(
    { idle: "seat-idle", working: "seat-working-2", "asking-a": "seat-asking-a-2", "asking-b": "seat-asking-b-1" }[seat]
  );
  const dot = $derived(
    seat === "working" ? "bg-status-live-glyph" : seat.startsWith("asking") ? "bg-status-attn-glyph" : ""
  );
</script>

{#snippet face()}
  <span class="relative block size-icon-lg flex-none">
    <span data-img="caw/{pose}.png" data-seat={seat} class="block size-full"></span>
    {#if dot}
      <span
        aria-hidden="true"
        data-status-dot={seat === "working" ? "live" : "attn"}
        class={["absolute -top-px -end-px size-(--status-dot-size) rounded-pill", dot]}
      ></span>
    {/if}
  </span>
{/snippet}

{#if open === "none"}
  <Button class={["flex-none rounded-pill ps-space-2", phone && "h-c-composer-field"]} data-ask-caw="coral">
    {@render face()}
    <span>Ask Caw</span>
  </Button>
{:else if phone}
  <!-- In a docked bar (the phone's foot, a narrow page's foot) the dock is
       content's ground, not a title bar: the face is the glyph alone, a
       bare item at the field's height, no glass of its own. -->
  <button
    data-ask-caw={open === "caw" ? "selected" : "plain"}
    aria-label="Ask Caw"
    aria-pressed={open === "caw"}
    class={[
      "grid h-c-composer-field min-w-c-composer-field flex-none place-items-center rounded-sm border-0 p-0 select-none touch-hit press-tint",
      open === "caw" ? "bg-selected-bg" : "bg-transparent",
    ]}
    title="Ask Caw"
    type="button"
  >
    {@render face()}
  </button>
{:else}
  <BarGlass>
    {#snippet head()}
      <button
        data-bar-item
        data-ask-caw={open === "caw" ? "selected" : "plain"}
        aria-label="Ask Caw"
        aria-pressed={open === "caw"}
        class={["select-none touch-hit press-tint", open === "caw" && "bg-selected-bg"]}
        title="Ask Caw"
        type="button"
      >
        {@render face()}
      </button>
    {/snippet}
  </BarGlass>
{/if}
