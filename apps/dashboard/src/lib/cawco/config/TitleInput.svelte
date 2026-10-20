<script lang="ts">
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
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
    onblur,
  }: {
    value?: string;
    label: string;
    placeholder: string;
    invalid?: boolean;
    disabled?: boolean;
    onblur?: () => void;
  } = $props();
</script>

<!-- A field (DESIGN.md, Inputs and fields: 36px, the control edge, its
     touch area the kit's) whose words take the title role, so the name
     reads as the page's title while it stays plainly editable. -->
<div
  data-slot="title"
  class="w-full min-w-0"
  data-share="title:{page.url.pathname}"
  {@attach land(() => `title:${page.url.pathname}`, { uniform: true })}
>
  <Input
    aria-invalid={invalid ? "true" : undefined}
    aria-label={label}
    autocomplete="off"
    {disabled}
    {onblur}
    {placeholder}
    spellcheck="false"
    text="title"
    bind:value
  />
</div>
