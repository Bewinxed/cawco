<script lang="ts">
  import { land } from "#lib/cawco/motion/share.svelte.js";
  /**
   * The name of the thing being edited, typed where its title reads. It is
   * the same object as the row's name in the section list: drilling in, the
   * row's name flies up into it; going back, it flies down into the row
   * (motion/share.svelte.ts, keyed on the editor's path).
   */
  import { page } from "$app/state";

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
  data-slot="title"
  class="block w-full min-w-0 touch-hit"
  data-share="title:{page.url.pathname}"
  {@attach land(() => `title:${page.url.pathname}`, { uniform: true })}
>
  <input
    aria-invalid={invalid ? "true" : undefined}
    aria-label={label}
    autocomplete="off"
    class="type-title w-full min-w-0 rounded-xs border-none border-current bg-transparent px-0 py-space-row text-ink-strong placeholder:text-ink-subtle data-mono:font-(family-name:--font-mono) disabled:text-ink-strong disabled:opacity-100"
    data-mono={mono || undefined}
    {disabled}
    {onblur}
    {placeholder}
    spellcheck="false"
    bind:value
  />
</label>
