<script lang="ts">
  /**
   * A field's touch area round it (the input's, the textarea's `area`),
   * under the field (`hit-under`: the field takes its own presses, its caret
   * and its words' selection): a finger landing on it beside the field
   * focuses the field, which is the control and takes the focus itself.
   */
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    field,
    slot,
    class: className,
    children,
  }: {
    /** The field the area focuses. */
    field: HTMLElement | null;
    /** Its `data-slot`. */
    slot: string;
    class?: ClassValue | null;
    children: Snippet;
  } = $props();

  function focusField(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      field?.focus();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: the field's touch area round it; the field itself is the control and takes the focus -->
<!-- biome-ignore lint/a11y/noStaticElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: a keyboard reaches the field itself; only a finger lands on the area. -->
<span
  class={cn("touch-hit hit-under inline-flex w-full min-w-0", className)}
  data-slot={slot}
  onclick={focusField}
>
  {@render children()}
</span>
