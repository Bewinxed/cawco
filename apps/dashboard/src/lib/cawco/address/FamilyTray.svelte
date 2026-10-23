<script lang="ts">
  import { LEDGE_LINE } from "#lib/cawco/home/Caw.svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronLeft,
    IconClose,
    IconExternal,
    IconSuccess,
  } from "#lib/icons.js";
  import Confetti from "./Confetti.svelte";
  import { arrive, depart } from "./motion";
  import StateObject from "./StateObject.svelte";
  import TrayCaw from "./TrayCaw.svelte";
  import TrayDetails from "./TrayDetails.svelte";
  import type { AddressTray } from "./tray.svelte";
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
  import Words from "./Words.svelte";
  import { type Form, factsFor, rawFor, stateWords } from "./words";

  let {
    tray,
    form,
    ref = $bindable(null),
  }: { tray: AddressTray; form: Form; ref?: HTMLElement | null } = $props();

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
  <div
    style:--tray-pad="calc(var(--radius-modal) - var(--radius-lg))"
    class={[
      "relative min-w-0",
      form === "desk"
        ? "rounded-modal bg-surface-recess p-(--tray-pad) shadow-overlay"
        : "rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer",
    ]}
    data-slot="surface"
  >
    <div
      class={[
        "relative grid min-w-0 gap-space-4 bg-surface-raised",
        form === "desk"
          ? "rounded-lg p-space-5"
          : "max-h-(--sheet-room) overflow-y-auto overscroll-contain rounded-t-lg px-space-4 pb-safe-space-4",
      ]}
      data-slot="body"
    >
      {#if form === "phone"}
        <div aria-hidden="true" class={grabberVariants()}></div>
      {/if}
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
        <div class="relative grid min-w-0">
          {#key body}
            <div
              class={["grid min-w-0 gap-space-3", failed && "text-center"]}
              in:arrive
              out:depart
            >
              {#each words.lines as line (line)}
                <p class="m-0 type-body text-pretty text-ink-muted">
                  <Words text={line} />
                </p>
              {/each}
              <StateObject {form} {tray} />
              {#if words.meta}
                <p
                  class={[
                    "mark-line m-0 flex min-w-0 flex-wrap items-start gap-x-space-2 gap-y-space-1 type-meta text-ink-muted",
                    failed && "justify-center",
                  ]}
                  data-slot="meta"
                >
                  <span class="mark-cell">
                    {#if words.meta.live}
                      <LiveDot />
                    {:else}
                      <IconSuccess
                        aria-hidden="true"
                        class="size-icon-sm text-status-done-ink"
                      />
                    {/if}
                  </span>
                  <span class="mark-text min-w-0"
                    ><MorphText text={words.meta.text} /></span
                  >
                  {#if words.meta.action}
                    <Button
                      data-box
                      label={words.meta.action.label}
                      onclick={words.meta.action.act}
                      size="xs"
                      variant="link"
                    />
                  {/if}
                </p>
              {/if}
            </div>
          {/key}
        </div>
        {#if form === "phone"}
          <TrayDetails
            bind:open={tray.details}
            facts={factsFor(tray)}
            raw={rawFor(tray)}
            {tray}
          />
        {/if}
        {#if words.primary}
          <div
            class={[
              form === "desk"
                ? "flex flex-wrap justify-end gap-space-2"
                : "grid gap-space-2",
              failed && form === "desk" && "justify-center",
            ]}
            data-slot="actions"
          >
            {#if words.secondary}
              <Button
                data-icon={words.secondary.away ? "inline-end" : undefined}
                onclick={words.secondary.act}
                size={form === "phone" ? "lg" : "default"}
                variant="outline"
              >
                <MorphText text={words.secondary.label} />
                {#if words.secondary.away}
                  <IconExternal aria-hidden="true" />
                {/if}
              </Button>
            {/if}
            <Button
              data-icon={words.primary.away ? "inline-end" : undefined}
              data-tray-primary
              disabled={words.primary.disabled}
              onclick={words.primary.act}
              size={form === "phone" ? "lg" : "default"}
            >
              <MorphText text={words.primary.label} />
              {#if words.primary.away}
                <IconExternal aria-hidden="true" />
              {/if}
            </Button>
          </div>
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
    </div>
  </div>
</section>
