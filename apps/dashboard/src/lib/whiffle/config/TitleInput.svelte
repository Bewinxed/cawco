<script lang="ts">
  /**
   * The name of the thing being edited, typed where its title reads. It is
   * the same object as the row's name in the section list: drilling in, the
   * row's name flies up into it; going back, it flies down into the row
   * (motion/share.svelte.ts, keyed on the editor's path).
   */
  import { page } from "$app/state";
  import { land } from "$lib/whiffle/motion/share.svelte";

  let {
    value = $bindable(""),
    label,
    placeholder,
    invalid = false,
    disabled = false,
    mono = false,
    onblur,
  }: {
    value?: string;
    label: string;
    placeholder: string;
    invalid?: boolean;
    disabled?: boolean;
    mono?: boolean;
    onblur?: () => void;
  } = $props();
</script>

<!-- A label, so its touch area around the 24px title focuses the field. -->
<label
  class="title touch-hit"
  data-share="title:{page.url.pathname}"
  {@attach land(() => `title:${page.url.pathname}`, { uniform: true })}
>
  <input
    aria-invalid={invalid ? 'true' : undefined}
    aria-label={label}
    autocomplete="off"
    class={["title-input", mono && "mono"]}
    {disabled}
    {onblur}
    {placeholder}
    spellcheck="false"
    bind:value
  >
</label>

<style>
  .title {
    display: block;
    width: 100%;
    min-width: 0;
  }
  .title-input {
    width: 100%;
    min-width: 0;
    padding: 2px 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    font: var(--type-title);
    letter-spacing: -0.01em;
    color: var(--ink-strong);
    outline: none;
  }
  .title-input.mono {
    font-family: var(--font-mono);
  }
  .title-input::placeholder {
    color: var(--ink-subtle);
  }
  .title-input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .title-input:disabled {
    color: var(--ink-strong);
    opacity: 1;
  }
</style>
