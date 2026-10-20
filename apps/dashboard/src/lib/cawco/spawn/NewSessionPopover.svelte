<script lang="ts">
  /**
   * The New Session form as a popover at the trigger pressed (the session
   * strip's "+", a project's Spin off): the kit popover, hanging from the
   * trigger, `c-new-session-pop-w` wide (the narrowest the form's own rows
   * hold one line at), its height capped at the room under the trigger with
   * the form's body scrolling. As the dialog's card does, the popover is the
   * frame and recesses, and the form's body stands raised on it (DESIGN.md,
   * The Frame Recesses Rule). Esc or a press outside closes it and the focus
   * goes back to the trigger; the prompt takes the keys as it opens. Under
   * 640px it is the dialog's bottom sheet (NewSessionDialog).
   */
  import { MediaQuery } from "svelte/reactivity";
  import { Popover, PopoverContent } from "#lib/components/ui/popover/index.js";
  import NewSessionDialog from "./NewSessionDialog.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import { FORM_SIZES, type SpawnPrefill } from "./new-session.svelte";

  let {
    open,
    anchor,
    prefill,
    onclose,
  }: {
    open: boolean;
    /** The trigger it hangs from, which the focus goes back to. */
    anchor: HTMLElement;
    prefill?: SpawnPrefill;
    onclose: () => void;
  } = $props();

  const mobile = new MediaQuery("(max-width: 640px)");
  let card = $state<HTMLElement | null>(null);
  let form = $state<NewSessionForm>();
</script>

{#if mobile.current}
  <NewSessionDialog {anchor} {onclose} {open} {prefill} />
{:else}
  <Popover
    onOpenChange={(value) => {
      if (!value) {
        form?.close();
      }
    }}
    {open}
  >
    <!-- The form's own measure, never past the window's gutter or the room
         bits-ui measures under the trigger; the recess tray under the
         raised body, as the dialog's card is. -->
    <PopoverContent
      align="start"
      aria-label="New session"
      customAnchor={anchor}
      data-ns-popover
      gap="none"
      height="room"
      look="new-session"
      morphs={{ on: FORM_SIZES }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Back to the trigger, unless the press that closed it put the
        // focus somewhere of its own.
        const held = document.activeElement;
        if (!held || held === document.body || card?.contains(held)) {
          anchor.focus({ preventScroll: true });
        }
      }}
      onEscapeKeydown={(event) => form?.escapeStep(event)}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        form?.focusPrompt();
      }}
      side="bottom"
      style="--pop-w: min(var(--c-new-session-pop-w), 100vw - var(--space-8) * 1.5); --pop-max-h: calc(var(--bits-popover-content-available-height) - 2px)"
      width="room"
      bind:ref={card}
    >
      <NewSessionForm {onclose} {open} {prefill} bind:this={form} />
    </PopoverContent>
  </Popover>
{/if}
