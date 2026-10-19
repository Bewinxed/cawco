<!--
  One decision: the kit's card (RECIPES.md, page.css `.dp-card`). The card
  carries its id twice: `data-cawco-choice`, which the overlay's bridge
  picks on (a click on an option's `data-option` stores it, and the
  overlay marks it `data-cawco-picked`), and `id="decision-<id>"`, which a
  pin's selector holds on to across revisions. Its note goes to the hub a
  moment after typing stops; the state line follows the stored picks.

  A picked card folds to one line, "Decided: <option>" with Change, and its
  body (why, media, options, note) is hidden but kept mounted, so the
  overlay's marks, the media's frames and a Dials panel stay. The fold is
  this view's own: the picks the hub keeps, and artifact_read, are the same.
  A one-pick card folds when the person's pick in it is stored; a
  several-pick card stays open while they pick, and folds on Done. Change
  reopens it.
-->
<script lang="ts">
  import { setContext, tick } from "svelte";
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

  type OptionNode = { props?: { id?: unknown; label?: unknown } } | null;

  const id = $derived(String(props.id ?? ""));
  const question = $derived(String(props.question ?? ""));
  const multiple = $derived(props.multiple === true);
  const options = $derived(
    (Array.isArray(props.options) ? props.options : []).map((option) => {
      const held = (option as OptionNode)?.props;
      const optionId = String(held?.id ?? "");
      return { id: optionId, label: String(held?.label ?? optionId) };
    })
  );
  /** Each option's id in order: an option's keycap is its place. */
  const order = $derived(options.map((option) => option.id));
  setContext("decision-options", () => order);

  const chosen = $derived(picks.now[id]?.options ?? []);
  const picked = $derived(chosen.length);
  const stateLine = $derived.by(() => {
    if (picked === 0) {
      return "Not picked";
    }
    return picked > 1 ? `${picked} picked` : "Picked";
  });

  /** Change reopened it, or the person is picking several: it stays open until a pick or Done. */
  let open = $state(false);
  const decided = $derived(picked > 0 && !open);
  const decidedLine = $derived(
    options
      .filter((option) => chosen.includes(option.id))
      .map((option) => option.label)
      .join(", ")
  );

  let card = $state<HTMLElement>();
  let body = $state<HTMLDivElement>();

  // A pick the person makes folds a one-pick card once it is stored; a
  // several-pick card stays open while they pick in it, until Done. Only
  // their own press on an option moves it: the overlay's other writes to the
  // page's doc (a pin re-anchored as the card opens) leave it as it is.
  let picking = false;
  let seen = "";
  $effect(() => {
    const now = chosen.join("\n");
    if (picking && now !== seen) {
      picking = false;
      open = false;
    }
    seen = now;
  });
  $effect(() => {
    const group = body;
    if (!group) {
      return;
    }
    const pressed = (event: Event) => {
      if (!(event.target as Element | null)?.closest("[data-option]")) {
        return;
      }
      if (multiple) {
        open = true;
      } else {
        picking = true;
      }
    };
    group.addEventListener("click", pressed, true);
    return () => group.removeEventListener("click", pressed, true);
  });

  // Focus that was in the card when it folds moves to Change, not to the page.
  let wasDecided = false;
  let hadFocus = false;
  $effect.pre(() => {
    if (decided !== wasDecided) {
      hadFocus = !!card?.contains(document.activeElement);
    }
  });
  $effect(() => {
    const now = decided;
    if (now && !wasDecided && hadFocus) {
      card?.querySelector<HTMLElement>(".dp-change")?.focus();
    }
    wasDecided = now;
  });

  /** Opens the card again, focus on its first picked option. */
  async function reopen() {
    open = true;
    await tick();
    body
      ?.querySelector<HTMLElement>(
        `[data-option="${CSS.escape(chosen[0] ?? "")}"]`
      )
      ?.focus();
  }

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
  bind:this={card}
  class="dp-card"
  data-cawco-choice={id}
  data-cawco-multiple={multiple ? "" : undefined}
  data-decided={decided ? "" : undefined}
  id={`decision-${id}`}
>
  <header>
    <h2>{question}</h2>
    {#if decided}
      <span class="dp-state on">Decided: {decidedLine}</span>
      <button class="dp-change" onclick={reopen} type="button">Change</button>
    {:else}
      <span class={["dp-state", picked > 0 && "on"]}>{stateLine}</span>
      {#if picked > 0}
        <button
          class="dp-change"
          onclick={() => {
            open = false;
          }}
          type="button">Done</button
        >
      {/if}
    {/if}
  </header>
  <div bind:this={body} class="dp-body" hidden={decided}>
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
  </div>
</article>
