<script lang="ts">
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";

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
<div class="template">
  <label for={fieldId}
    >{label}
    {#if multiline}
      <textarea
        class="wf-mono"
        id={fieldId}
        onclick={() => { cursor = field?.selectionStart ?? 0; }}
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
        onclick={() => { cursor = field?.selectionStart ?? 0; }}
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
      class="completer"
      role="listbox"
      {@attach highlight({ rows: "button", hovered: '[aria-selected="true"]' })}
    >
      {#each matches as path, index (path)}
        <button
          aria-selected={active === index}
          onclick={() => choose(path)}
          onmousedown={(event) => { event.preventDefault(); }}
          onmousemove={() => { active = index; }}
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
    background: var(--surface-raised);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-overlay);
    padding: var(--space-1);
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
