<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  /**
   * The New Session form on a desk: a popover hanging from the trigger
   * pressed (the rail's Start session, the session strip's "+", a project's
   * Spin off), the kit popover, `c-new-session-pop-w` wide (the narrowest the
   * form's own rows hold one line at), its height capped at the room under
   * the trigger with the form's body scrolling. An opener with no trigger of
   * its own (the shortcut, a `?spawn=` link, a session's Continue) hangs it
   * from the rail's Start session, or under the bar's leading edge where the
   * rail is a sheet. It holds nothing (DESIGN.md, The Open Page Rule): no
   * scrim, no blur, the page live beside it; its own popovers hang from it.
   * As a dialog's card does, the popover is the frame and recesses, and the
   * form's body stands raised on it (The Frame Recesses Rule). Esc or a
   * press outside closes it and the focus goes back to whatever held it;
   * the prompt takes the keys as it opens. Under 640px it is the bottom
   * sheet (NewSessionDialog).
   */
  import { MediaQuery } from "svelte/reactivity";
  import { Popover, PopoverContent } from "#lib/components/ui/popover/index.js";

  import type { ContinueSource } from "../continue.svelte";
  import NewSessionDialog from "./NewSessionDialog.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import { FORM_SIZES, type SpawnPrefill } from "./new-session.svelte";

  let {
    open,
    anchor = null,
    prefill,
    continueFrom,
    onclose,
    onexitcontinue,
  }: {
    open: boolean;
    /** The trigger it hangs from; none, and it hangs from the rail's Start session. */
    anchor?: HTMLElement | null;
    prefill?: SpawnPrefill;
    /**
     * Continue in new session: the form starts a session seeded with a summary
     * of this one. Mutually exclusive with `prefill`: the source says where.
     */
    continueFrom?: ContinueSource;
    onclose: () => void;
    /** The operator deleted the source chip: the form stays open as a plain New Session. */
    onexitcontinue?: () => void;
  } = $props();

  const mobile = new MediaQuery("(max-width: 640px)");
  let card = $state<HTMLElement | null>(null);
  let form = $state<NewSessionForm>();
  /** The rail's Start session, marked where it stands (Sidebar). */
  const START = "[data-start-session]";
  /**
   * What it hangs from when its opener gave no trigger: the rail's Start
   * session where the rail stands, else the top bar, from its leading edge
   * (the rail a sheet), read as it opens.
   */
  const standIn = (): HTMLElement | null => {
    const start = document.querySelector<HTMLElement>(START);
    if (start && start.getClientRects().length > 0) {
      return start;
    }
    return document.querySelector<HTMLElement>('header[data-slot="top"]');
  };
  const hangsFrom = $derived(open ? (anchor ?? standIn()) : null);
  /** What held the focus as it opened, which it goes back to as it closes. */
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (open) {
      opener =
        anchor ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
    }
  });
</script>

{#if mobile.current}
  <NewSessionDialog
    {anchor}
    {continueFrom}
    {onclose}
    {onexitcontinue}
    {open}
    {prefill}
  />
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
         under the trigger (its layer's box caps it there: kit
         anchored.svelte.ts); the recess tray under the raised body, as the
         dialog's card is. -->
    <!-- A dialog that holds nothing (WAI-ARIA, dialog: `aria-modal` false):
         its openers say they open one (`aria-haspopup="dialog"`), and
         bits-ui's popover content carries no role of its own. -->
    <PopoverContent
      align="start"
      aria-label={commonWords.newSession}
      aria-modal="false"
      customAnchor={hangsFrom}
      data-ns-popover
      gap="none"
      height="room"
      look="new-session"
      morphs={{ on: FORM_SIZES }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Back to what held it, unless the press that closed it put the
        // focus somewhere of its own.
        const held = document.activeElement;
        if (!held || held === document.body || card?.contains(held)) {
          opener?.focus({ preventScroll: true });
        }
      }}
      onEscapeKeydown={(event) => form?.escapeStep(event)}
      role="dialog"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        form?.focusPrompt();
      }}
      side="bottom"
      style="--pop-w: min(calc(var(--spacing) * 142.25), 100vw - var(--spacing-space-8) * 1.5); --pop-max-h: none"
      width="room"
      bind:ref={card}
    >
      <NewSessionForm
        {continueFrom}
        {onclose}
        {onexitcontinue}
        {open}
        {prefill}
        bind:this={form}
      />
    </PopoverContent>
  </Popover>
{/if}
