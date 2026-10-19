<!--
  One decision: the kit's card (RECIPES.md, page.css `.dp-card`). The card
  carries its id twice: `data-cawco-choice`, which the overlay's bridge
  picks on (a click on an option's `data-option` stores it, and the
  overlay marks it `data-cawco-picked`), and `id="decision-<id>"`, which a
  pin's selector holds on to across revisions. Its note goes to the hub a
  moment after typing stops; the state line follows the stored picks.
-->
<script lang="ts">
  import { setContext } from "svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    id: unknown;
    question: unknown;
    options: unknown[];
    why?: unknown;
    media?: unknown[];
    multiple?: unknown;
  }> = $props();

  const id = $derived(String(props.id ?? ""));
  const question = $derived(String(props.question ?? ""));
  /** Each option's id in order: an option's keycap is its place. */
  const order = $derived(
    (Array.isArray(props.options) ? props.options : []).map((option) =>
      String((option as { props?: { id?: unknown } } | null)?.props?.id ?? "")
    )
  );
  setContext("decision-options", () => order);

  const picked = $derived(picks.now[id]?.options.length ?? 0);
  const stateLine = $derived.by(() => {
    if (picked === 0) {
      return "Not picked";
    }
    return picked > 1 ? `${picked} picked` : "Picked";
  });

  const stored = $derived(picks.now[id]?.note ?? "");
  let note = $state("");
  let typing = false;
  $effect(() => {
    const next = stored;
    if (!typing) {
      note = next;
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function typed() {
    typing = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      typing = false;
      if (note !== stored) {
        bridge()
          ?.note(id, note)
          .catch(() => undefined);
      }
    }, 700);
  }
</script>

<article
  class="dp-card"
  data-cawco-choice={id}
  data-cawco-multiple={props.multiple === true ? "" : undefined}
  id={`decision-${id}`}
>
  <header>
    <h2>{question}</h2>
    <span class={["dp-state", picked > 0 && "on"]}>{stateLine}</span>
  </header>
  {#if props.why}<p class="dp-why">{String(props.why)}</p>{/if}
  {#if Array.isArray(props.media) && props.media.length > 0}
    <div class={["dp-show", props.media.length === 1 && "solo"]}>
      {@render renderNode(props.media)}
    </div>
  {/if}
  <!-- biome-ignore lint/a11y/useSemanticElements: the kit's option grid (page.css .dp-opts); a fieldset's legend would say the question twice. -->
  <div aria-label={question} class="dp-opts" role="group">
    {@render renderNode(props.options)}
  </div>
  <label class="dp-note"
    >Note<textarea
      bind:value={note}
      disabled={!bridge()}
      oninput={typed}
      onblur={() => {
        typing = false;
      }}
      placeholder="Anything to add"
      rows="1"></textarea></label
  >
</article>
