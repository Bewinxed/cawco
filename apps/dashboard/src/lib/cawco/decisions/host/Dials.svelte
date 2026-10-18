<!--
  Values the person tunes, drawn where the program puts them: one native
  control per value of `config` (a range for [default, min, max, step?], a
  colour well for "#hex", a switch for a boolean, a menu for a list of
  words, a field for words), nested groups as dotted paths. Kept under the
  page's one `dials` key, each panel's values by name and path
  (`{ Card: { radius: 16, "shadow.blur": 8 } }`), the shape an HTML page's
  DialKit panels keep (the kit's dials.js), so artifact_read answers both
  alike. A change goes to the hub once the hand rests; a reload or a
  revision starts from what the hub kept.
-->
<script lang="ts">
  import { type Dial, dialsOf } from "@cawco/core/decisions-library";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; config: Record<string, unknown> }> =
    $props();

  const name = $derived(String(props.name ?? "Dials"));
  const dials = $derived(dialsOf(props.config ?? {}).dials);
  const uid = $props.id();

  /** Every panel's values as the hub keeps them now. */
  const kept = $derived(
    (picks.now.dials?.value ?? {}) as Record<string, Record<string, unknown>>
  );
  /** The person's values not yet in the hub, by path. */
  let touched = $state<Record<string, unknown>>({});
  const shownValue = (dial: Dial): unknown =>
    dial.path in touched
      ? touched[dial.path]
      : (kept[name]?.[dial.path] ?? dial.initial);

  let timer: ReturnType<typeof setTimeout> | undefined;
  function set(dial: Dial, value: unknown) {
    touched = { ...touched, [dial.path]: value };
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = { ...kept, [name]: { ...kept[name], ...touched } };
      bridge()
        ?.set("dials", next)
        .then(() => {
          touched = {};
        })
        .catch(() => undefined);
    }, 400);
  }
</script>

<figure class="dp-pane dials" aria-label={name}>
  <figcaption>{name}</figcaption>
  {#each dials as dial (dial.path)}
    {@const id = `${uid}-${dial.path}`}
    {@const value = shownValue(dial)}
    <div class="row">
      <label class="label" for={id}>{dial.path}</label>
      {#if dial.kind === "range"}
        <input
          {id}
          class="range"
          disabled={!bridge()}
          max={dial.max}
          min={dial.min}
          oninput={(event) => set(dial, Number(event.currentTarget.value))}
          step={dial.step}
          type="range"
          value={Number(value)}
        />
        <output class="value" for={id}>{String(value)}</output>
      {:else if dial.kind === "colour"}
        <input
          {id}
          class="colour"
          disabled={!bridge()}
          oninput={(event) => set(dial, event.currentTarget.value)}
          type="color"
          value={String(value)}
        />
        <output class="value" for={id}>{String(value)}</output>
      {:else if dial.kind === "switch"}
        <input
          {id}
          checked={value === true}
          class="switch"
          disabled={!bridge()}
          onchange={(event) => set(dial, event.currentTarget.checked)}
          aria-checked={value === true}
          role="switch"
          type="checkbox"
        />
      {:else if dial.kind === "menu"}
        <select
          {id}
          class="menu"
          disabled={!bridge()}
          onchange={(event) => set(dial, event.currentTarget.value)}
          value={String(value)}
        >
          {#each dial.choices as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
      {:else}
        <input
          {id}
          class="words"
          disabled={!bridge()}
          oninput={(event) => set(dial, event.currentTarget.value)}
          type="text"
          value={String(value)}
        />
      {/if}
    </div>
  {/each}
</figure>

<style>
  .dials {
    min-inline-size: 0;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-inline-size: 0;
  }
  .label {
    font: var(--type-meta);
    font-family: var(--font-mono);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .value {
    font: var(--type-meta);
    font-family: var(--font-mono);
    color: var(--ink-strong);
    min-inline-size: 4ch;
    text-align: end;
  }
  .range,
  .menu,
  .words {
    inline-size: 100%;
    min-inline-size: 0;
    accent-color: var(--brand-solid);
  }
  .menu,
  .words {
    font: var(--type-body);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-page);
    color: var(--ink-strong);
  }
  .colour {
    inline-size: 2.5rem;
    block-size: 1.75rem;
    padding: 0;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-page);
  }
  .switch {
    justify-self: start;
    accent-color: var(--brand-solid);
  }
  .row :focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  /* A field shows at 16px or more where a phone would zoom into a smaller one. */
  @media (pointer: coarse) {
    .menu,
    .words {
      font-size: max(1rem, 16px);
    }
  }
</style>
