<script lang="ts">
  /**
   * The New Session form as a popover at the trigger pressed (the session
   * strip's "+", a project's Spin off): the kit popover, hanging from the
   * trigger and as wide as the dialog's card, so the form is laid out as it
   * is there, its height capped at the room under the trigger with the
   * form's body scrolling. Esc or a press outside closes it and the focus
   * goes back to the trigger; the prompt takes the keys as it opens. Under
   * 640px it is the dialog's bottom sheet (NewSessionDialog).
   */
  import { MediaQuery } from "svelte/reactivity";
  import { Popover, PopoverContent } from "#lib/components/ui/popover/index.js";
  import NewSessionDialog from "./NewSessionDialog.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import type { SpawnPrefill } from "./new-session.svelte";

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
    <!-- The dialog card's measure (DESIGN.md, New-session dialog: up to
         980px), never past the room bits-ui measures under the trigger. -->
    <PopoverContent
      align="start"
      aria-label="New session"
      class="ns-theme max-h-[calc(var(--bits-popover-content-available-height)-2px)] w-[min(980px,calc(100vw-48px))] gap-0"
      customAnchor={anchor}
      data-ns-popover
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
      bind:ref={card}
    >
      <NewSessionForm {onclose} {open} {prefill} bind:this={form} />
    </PopoverContent>
  </Popover>
{/if}
