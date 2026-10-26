<script lang="ts">
  import { LEDGE_LINE } from "#lib/cawco/home/Caw.svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconChevronLeft, IconClose } from "#lib/icons.js";
  import Confetti from "./Confetti.svelte";
  import TrayActions from "./TrayActions.svelte";
  import TrayCaw from "./TrayCaw.svelte";
  import TrayDetails from "./TrayDetails.svelte";
  import TrayState from "./TrayState.svelte";
  import TraySurface from "./TraySurface.svelte";
  /**
   * Direction A: the Family tray, with Caw peeking over its top edge
   * (design 6ddc57c4, Option A). One thing per tray, replaced in place: the
   * title and the button's words morph in their held box (MorphText), the
   * state's words and object cross in under them (`arrive`/`depart`), and
   * the tray's height tweens to the new state's over --dur-pop on the drawer
   * curve (morph), from wherever it is drawn. Caw keeps his spot on the
   * edge in every state; only a failure brings him down into the tray at
   * 80px, the house's failure shape (PairingScreen, MachinesEmpty).
   *
   * Desk: the dialog's recess tray holding its raised body (18px, 6px, 12px:
   * concentric). Phone: the drawer's bottom sheet, full-bleed, its grabber,
   * its actions full width at 44px with the primary last. ‹ stands only on
   * an optional station reached from another; × on every state.
   */
  import { factsFor, rawFor, stateWords, type TrayProps } from "./words";

  let { tray, form, ref = $bindable(null) }: TrayProps = $props();

  /** Caw's still box on the edge, and over the failure. */
  const CAW = 64;
  const CAW_DOWN = 80;

  const words = $derived(stateWords(tray, form));
  const failed = $derived(tray.step === "failed");
  /** What swaps the state's words and object: the state, its network, its cause. */
  const body = $derived(`${tray.view}:${tray.network}:${tray.cause}`);
  const titleId = $props.id();
</script>

<section
  bind:this={ref}
  aria-labelledby={titleId}
  class="relative grid min-w-0"
  data-form={form}
  data-step={tray.step}
  data-tray="family"
  {@attach (node) => morph({ ms: dur("--dur-pop") })(node)}
>
  {#if !failed}
    <!-- Caw's room over the top edge: he stands behind it, so only what
         is above the edge shows (his ledge). -->
    <div
      class="flex h-(--caw-room) justify-center"
      data-tray-rise
      style:--caw-room="{CAW * LEDGE_LINE}px"
    >
      <TrayCaw ledge pose={tray.pose.pose} size={CAW} />
    </div>
  {/if}
  <TraySurface class="gap-space-4" deskPad="p-space-5" {form}>
    <div class="grid min-w-0 gap-space-4" data-tray-content>
      {#if failed}
        <div class="flex justify-center pt-space-2">
          <TrayCaw pose={tray.pose.pose} size={CAW_DOWN} />
        </div>
      {/if}
      <!-- The title, ‹ before it on an optional station reached from
             another, × after it on every state. -->
      <div
        class="grid grid-cols-(--head-cols) items-start gap-x-space-2"
        style:--head-cols="auto minmax(0, 1fr) auto"
      >
        {#if tray.back}
          <span class="col-1 flex">
            <Button
              aria-label="Back"
              class="-ms-space-2"
              icon={IconChevronLeft}
              onclick={() => tray.goBack()}
              size="icon-sm"
              variant="ghost"
            />
          </span>
        {/if}
        <h2
          id={titleId}
          class={[
            "m-0 min-w-0 type-title tracking-title text-balance text-ink-strong",
            tray.back ? "col-2" : "col-start-1 col-end-3",
            failed && "text-center",
          ]}
          data-slot="title"
        >
          <MorphText text={words.title} wrap />
        </h2>
        <Button
          aria-label="Close"
          class="col-3 -me-space-2"
          icon={IconClose}
          onclick={() => tray.park()}
          size="icon-sm"
          variant="ghost"
        />
      </div>
      <TrayState
        center={failed}
        {form}
        key={body}
        metaSlot="meta"
        {tray}
        {words}
      />
      {#if form === "phone"}
        <TrayDetails
          bind:open={tray.details}
          facts={factsFor(tray)}
          raw={rawFor(tray)}
          {tray}
        />
      {/if}
      {#if words.primary}
        <TrayActions
          center={failed}
          data-slot="actions"
          {form}
          primary={words.primary}
          secondary={words.secondary}
        />
      {/if}
      {#if form === "desk"}
        <TrayDetails
          bind:open={tray.details}
          facts={factsFor(tray)}
          raw={rawFor(tray)}
          {tray}
        />
      {/if}
    </div>
    {#if tray.firstLive && tray.step === "live"}
      <Confetti />
    {/if}
  </TraySurface>
</section>
