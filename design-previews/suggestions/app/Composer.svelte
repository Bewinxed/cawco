<!--
  The message box, drawn only as the place a press puts the words: the
  house composer's shell (12px, the control edge, the raised surface, the
  tile shadow) with its field and the coral send square. `focused` holds
  its edge strong, as a field does while its text has focus (The Caret
  Rule), for the phone's keyboard-up state. Its field is bound out, so a
  direction puts words in it and the caret after them.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    value = $bindable(""),
    field = $bindable(),
    focused = false,
    children,
  }: {
    value?: string;
    field?: HTMLTextAreaElement;
    focused?: boolean;
    /** What the box holds over its field (the tray), so the field keeps the foot. */
    children?: Snippet;
  } = $props();
</script>

<div class="composer" data-focused={focused || undefined} data-slot="composer">
  {@render children?.()}
  <label class="line">
    <span class="sr-only">Message Caw</span>
    <textarea
      bind:this={field}
      bind:value
      data-slot="composer-field"
      placeholder="Message Caw…"
      rows="1"
    ></textarea>
    <span class="send" aria-hidden="true"></span>
  </label>
</div>

<style>
  .composer {
    flex: none;
    overflow: clip;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);

    &:has(textarea:focus),
    &[data-focused] {
      border-color: var(--border-control-strong);
    }
  }

  .line {
    display: flex;
    align-items: end;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }

  textarea {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: var(--c-composer-field);
    padding-block: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--ink-strong);
    font: var(--type-body);
    field-sizing: content;
    max-block-size: 6lh;
    resize: none;
    outline: none;
    caret-color: var(--brand-solid);

    &::placeholder {
      color: var(--ink-subtle);
    }

    @media (pointer: coarse) {
      font-size: var(--text-field-floor);
    }
  }

  .send {
    flex: none;
    inline-size: var(--c-composer-field);
    block-size: var(--c-composer-field);
    border-radius: var(--radius-xs);
    background: var(--action-surface), var(--action-solid);
  }
</style>
