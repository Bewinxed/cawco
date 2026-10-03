<script lang="ts">
  import { popOut } from "#lib/cawco/motion/pop.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";

  let {
    label,
    value,
    paths,
    onchange,
    multiline = false,
  }: {
    label: string;
    value: string;
    paths: string[];
    onchange: (value: string) => void;
    multiline?: boolean;
  } = $props();
  let field = $state<HTMLTextAreaElement | HTMLInputElement>();
  const fieldId = $props.id();
  const closingBraces = /^\}\}/;
  let cursor = $state(0);
  let open = $state(false);
  let template = $state<HTMLElement>();
  /** Where the list grows from: the caret, on the field's top edge below. */
  let origin = $state("0 0");
  let measure: CanvasRenderingContext2D | null = null;
  function aimAtCaret(target: HTMLTextAreaElement | HTMLInputElement) {
    measure ??= document.createElement("canvas").getContext("2d");
    if (!(measure && template)) {
      return;
    }
    const styles = getComputedStyle(target);
    measure.font = `${styles.fontStyle} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    const line =
      target.value
        .slice(0, target.selectionStart ?? 0)
        .split("\n")
        .at(-1) ?? "";
    const left = Number.parseFloat(styles.paddingLeft);
    // A textarea wraps a long line: the caret sits on its last row.
    const room =
      target.clientWidth - left - Number.parseFloat(styles.paddingRight);
    const { width } = measure.measureText(line);
    const along = multiline && room > 0 ? width % room : width;
    const x =
      target.getBoundingClientRect().left -
      template.getBoundingClientRect().left +
      left +
      along -
      target.scrollLeft;
    origin = `${Math.min(template.clientWidth, Math.max(0, x)).toFixed(1)}px 0`;
  }
  let active = $state(0);
  const prefix = $derived(value.slice(0, cursor));
  const start = $derived(prefix.lastIndexOf("{{"));
  const query = $derived(start >= 0 ? prefix.slice(start + 2).trim() : "");
  const matches = $derived(
    open && start >= 0 && !query.includes("}")
      ? paths
          .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 12)
      : []
  );
  function changed(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    cursor = target.selectionStart;
    aimAtCaret(target);
    open = true;
    active = 0;
    onchange(target.value);
  }
  function choose(path: string) {
    const next =
      value.slice(0, start) +
      `{{${path}}}` +
      value.slice(cursor).replace(closingBraces, "");
    onchange(next);
    open = false;
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(
        start + path.length + 4,
        start + path.length + 4
      );
    });
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      open = false;
      return;
    }
    if (!matches.length) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active =
        (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
        matches.length;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(matches[active] ?? matches[0]);
    }
  }
</script>
<div class="template" bind:this={template}>
  <label for={fieldId}
    >{label}
    {#if multiline}
      <textarea
        class="wf-mono"
        id={fieldId}
        onclick={() => {
          cursor = field?.selectionStart ?? 0;
        }}
        oninput={changed}
        onkeydown={key}
        rows="7"
        {value}
        bind:this={field}
      ></textarea>
    {:else}
      <input
        class="wf-mono"
        id={fieldId}
        onclick={() => {
          cursor = field?.selectionStart ?? 0;
        }}
        oninput={changed}
        onkeydown={key}
        {value}
        bind:this={field}
      >
    {/if}
  </label>
  {#if matches.length}
    <div
      aria-label="Template paths"
      class="completer kit-pop"
      data-state="open"
      role="listbox"
      style:transform-origin={origin}
      out:popOut
      {@attach highlight({ rows: "button", hovered: '[aria-selected="true"]' })}
    >
      {#each matches as path, index (path)}
        <button
          aria-selected={active === index}
          onclick={() => choose(path)}
          onmousedown={(event) => {
            event.preventDefault();
          }}
          onmousemove={() => {
            active = index;
          }}
          role="option"
          type="button"
        >
          {path}
        </button>
      {/each}
    </div>
  {/if}
</div>
<style>
  .template {
    position: relative;
  }
  .completer {
    position: absolute;
    top: 100%;
    inset-inline: 0;
    max-height: 240px;
    overflow-y: auto;
    z-index: 30;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-2);
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--text-label);
    min-height: 36px;
  }
  @media (max-width: 1023px) {
    button {
      min-height: 44px;
    }
  }
</style>
