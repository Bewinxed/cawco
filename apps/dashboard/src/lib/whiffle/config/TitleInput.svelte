<script lang="ts">
  /** The name of the thing being edited, typed where its title reads. */
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

<style>
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
  /* An input draws no ::after, so on a coarse pointer its padding grows to a
     44px box and an equal negative margin keeps the layout still. */
  @media (pointer: coarse) {
    .title-input {
      padding-block: 12px;
      margin-block: -10px;
    }
  }
  .title-input.mono {
    font-family: var(--font-mono);
  }
  .title-input::placeholder {
    color: var(--ink-subtle);
  }
  .title-input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .title-input:disabled {
    color: var(--ink-strong);
    opacity: 1;
  }
</style>
