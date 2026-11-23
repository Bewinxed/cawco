<script lang="ts">
  /**
   * The kit's Dialog in a frame of its own (its states file's): open over
   * its scrim, drawn in place (the portal off) in a box that holds it
   * (`contain: layout`, so its fixed tray and scrim stand in the frame), its
   * header, its body and its footer's actions as the error and connect
   * dialogs compose them. It stays open: a press outside or Esc leaves it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "./index.js";

  let {
    title,
    line,
    confirm,
    height,
  }: {
    /** Its title. */
    title: string;
    /** What it says. */
    line: string;
    /** Its primary action's words. */
    confirm: string;
    /** The frame's least height, px: room for the dialog. */
    height: number;
  } = $props();
</script>

<div
  class="relative min-h-(--frame-h) w-full contain-layout"
  style:--frame-h={`${height}px`}
>
  <Dialog.Root open>
    <Dialog.Content
      escapeKeydownBehavior="ignore"
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      preventScroll={false}
      trapFocus={false}
    >
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
      </Dialog.Header>
      <p class="text-tx-2 type-body">{line}</p>
      <Dialog.Footer>
        <Button variant="outline">Not now</Button>
        <Button>{confirm}</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
