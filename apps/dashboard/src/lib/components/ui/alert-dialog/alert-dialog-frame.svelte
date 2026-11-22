<script lang="ts">
  /**
   * The kit's AlertDialog in a frame of its own (its states file's): open
   * over its scrim, drawn in place (the portal off) in a box that holds it
   * (`contain: layout`), its title, its line and its two answers. It stays
   * open: a press outside or Esc leaves it.
   */
  import * as AlertDialog from "./index.js";

  let {
    title,
    line,
    confirm,
    height,
  }: {
    /** What it asks. */
    title: string;
    /** What answering it does. */
    line: string;
    /** The destructive answer's words. */
    confirm: string;
    /** The frame's least height, px: room for the dialog. */
    height: number;
  } = $props();
</script>

<div
  class="relative min-h-(--frame-h) w-full contain-layout"
  style:--frame-h={`${height}px`}
>
  <AlertDialog.Root open>
    <AlertDialog.Content
      escapeKeydownBehavior="ignore"
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      preventScroll={false}
      trapFocus={false}
    >
      <AlertDialog.Header>
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <p class="text-ink-muted type-body">{line}</p>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Keep it</AlertDialog.Cancel>
        <AlertDialog.Action variant="destructive">{confirm}</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</div>
