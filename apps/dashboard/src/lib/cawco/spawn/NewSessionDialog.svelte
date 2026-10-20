<script lang="ts">
  /**
   * The New Session form's dialog frame: the centred card over its scrim on
   * a desk, the kit drawer's bottom sheet under 640px (DESIGN.md: "the
   * new-session dialog becomes a bottom sheet"). The form inside is
   * NewSessionForm. A popover at a trigger is the same sheet under 640px
   * (NewSessionPopover), and gives its trigger as `anchor`.
   */
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { mirror } from "#lib/cawco/page-marks.js";
  import {
    Dialog,
    DialogPortal,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.js";
  import {
    Drawer,
    DrawerContent,
    DrawerTitle,
  } from "#lib/components/ui/drawer/index.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import type { ContinueSource, SessionDraft } from "../continue.svelte";
  import { morph } from "../motion/morph.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import type { SpawnPrefill } from "./new-session.svelte";

  let {
    open,
    prefill,
    continueFrom,
    restore,
    anchor = null,
    onclose,
    onexitcontinue,
  }: {
    open: boolean;
    prefill?: SpawnPrefill;
    /**
     * Continue in new session: the form starts a session seeded with a summary
     * of this one. Mutually exclusive with `prefill` — the source says where.
     */
    continueFrom?: ContinueSource;
    /** Continue mode: the form a failed continuation was submitted with, opened as it was. */
    restore?: SessionDraft;
    /**
     * The trigger it was opened from (a popover's, as its sheet): the prompt
     * takes the keys as it opens, and the focus goes back to the trigger as
     * it closes. Without one the card takes the focus, and gives it back to
     * whatever held it.
     */
    anchor?: HTMLElement | null;
    onclose: () => void;
    /** The operator deleted the source chip: the dialog stays open as a plain New Session. */
    onexitcontinue?: () => void;
  } = $props();

  const mobile = new MediaQuery("(max-width: 640px)");
  let card = $state<HTMLElement | null>(null);
  let form = $state<NewSessionForm>();
  /** What held the focus as it opened, which it goes back to as it closes. */
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (open) {
      untrack(() => {
        opener = anchor ?? (document.activeElement as HTMLElement | null);
      });
    }
  });
  // The phone's sheet (the kit drawer's) says on the body that it is up, for
  // its scrim's exit (spawn/ns-theme.css).
  $effect(() => {
    if (card) {
      return mirror(
        card,
        "body",
        "data-session-sheet",
        ["data-vaul-drawer", "data-session-card"],
        (sheet) =>
          sheet.hasAttribute("data-vaul-drawer") &&
          sheet.hasAttribute("data-session-card")
            ? ["up"]
            : []
      );
    }
  });
  /**
   * The card tweens to its new height when its body changes, as every dialog
   * does (DESIGN.md, Dialog; ui/dialog's content): it renders its own
   * content, so it takes the same `morph()` here. The sheet on a phone is the
   * kit drawer's and is left to it.
   */
  const resize = morph();
  $effect(() => {
    if (card && !mobile.current) {
      return resize(card);
    }
  });
  function dismissed(value: boolean) {
    if (!value) {
      form?.close();
    }
  }
  function takeFocus(event: Event) {
    event.preventDefault();
    if (anchor) {
      form?.focusPrompt();
    } else {
      card?.focus({ preventScroll: true });
    }
  }
  function giveFocusBack(event: Event) {
    event.preventDefault();
    opener?.focus({ preventScroll: true });
  }
</script>

{#if mobile.current}
  <Drawer
    noBodyStyles
    onOpenChange={dismissed}
    {open}
    shouldScaleBackground={false}
  >
    <DrawerContent
      data-session-card
      aria-label="New Session"
      data-ns-dialog
      look="new-session"
      onCloseAutoFocus={giveFocusBack}
      onEscapeKeydown={(event) => form?.escapeStep(event)}
      onOpenAutoFocus={takeFocus}
      style={`--drawer-max-height: calc(var(--visible-height, 100dvh) - max(env(safe-area-inset-top), var(--space-7)))${open ? "" : "; animation-duration: var(--dur-exit); animation-timing-function: var(--ease-out)"}`}
      bind:ref={card}
    >
      <DrawerTitle visible={false}>New session</DrawerTitle>
      {@render body()}
    </DrawerContent>
  </Drawer>
{:else}
  <Dialog onOpenChange={dismissed} {open}>
    <DialogPortal>
      <!-- Drawn through `child`: bits-ui holds the body's lock only while it
           is open and clears it at once, and the leaving card and scrim let
           presses through (floating-presence). -->
      <DialogPrimitive.Overlay
        data-slot="session-scrim"
        class="ns-theme fixed inset-0 z-(--layer-float) bg-scrim backdrop-blur-(--scrim-blur) motion-safe:data-open:animate-ns-scrim-in motion-safe:data-closed:animate-ns-scrim-out"
      >
        {#snippet child({ props, open: shown })}
          <div {...props} style:pointer-events={pressable(shown)}></div>
        {/snippet}
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        data-session-card
        aria-label="New Session"
        class="ns-theme fixed z-(--layer-float) flex origin-center flex-col outline-off inset-0 m-auto h-fit max-h-(--card-max-h) w-(--card-w) rounded-lg bg-surface-recess p-space-2 shadow-modal motion-safe:data-open:animate-ns-card-in motion-safe:data-closed:animate-ns-card-out"
        data-ns-dialog
        onCloseAutoFocus={giveFocusBack}
        onEscapeKeydown={(event) => form?.escapeStep(event)}
        onOpenAutoFocus={takeFocus}
        restoreScrollDelay={0}
        style="--card-max-h: calc(100dvh - var(--space-8) * 1.5); --card-w: min(var(--c-new-session-w), 100vw - var(--space-8) * 1.5)"
        bind:ref={card}
      >
        {#snippet child({ props, open: shown })}
          <div {...props} style:pointer-events={pressable(shown)}>
            <DialogTitle visible={false}>New session</DialogTitle>
            {@render body()}
          </div>
        {/snippet}
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>
{/if}

{#snippet body()}
  <NewSessionForm
    {continueFrom}
    {onclose}
    {onexitcontinue}
    {open}
    {prefill}
    {restore}
    bind:this={form}
  />
{/snippet}
