<script lang="ts">
  /**
   * The word address's one tray (design e791c712, §4): Family's tray,
   * one thing per state, transformed in place. Caw stands on its centre
   * axis at the top of the body, 64px, the middle of a head row whose
   * sides are equal (‹ before him on a step reopened from Done, × after
   * him on every state), so his centre is the tray's whatever else stands
   * there; in a failure his box is 80, under ×. Every word stands at the
   * tray's one leading edge (text-align: start), at desk and phone alike:
   * only Caw, the illustration, is centred.
   *
   * Motion (§4.9): the box's height tweens over --dur-pop on the drawer
   * curve (morph); the title, the live line and the buttons' words morph in
   * their held box (MorphText); the state's words and object arrive and the
   * old ones depart (motion.ts); a tick pops in (reflow, data-flip "pop").
   *
   * Desk: the dialog's recess tray (18px, 6px) holding its raised body
   * (12px, 18px), concentric. Phone: the drawer's bottom sheet, full-bleed,
   * its grabber, Show details above the actions, the actions full width at
   * 44px with the primary last.
   */
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
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
  import Confetti from "../Confetti.svelte";
  import { arrive, depart } from "../motion";
  import Words from "../Words.svelte";
  import CawStill from "./CawStill.svelte";
  import FlowDetails from "./FlowDetails.svelte";
  import FlowObject from "./FlowObject.svelte";
  import type { AddressFlow } from "./flow.svelte";
  import { type Form, stateWords } from "./flow-words";

  let {
    flow,
    form,
    onpark,
    ref = $bindable(null),
  }: {
    flow: AddressFlow;
    form: Form;
    /** ×, Esc, a press outside, Done: the tray goes back to its row; the work goes on. */
    onpark: () => void;
    ref?: HTMLElement | null;
  } = $props();

  const words = $derived(stateWords(flow, form));
  const failed = $derived(flow.step === "failed");
  /** What crosses the state's words and object: the state and what it is about. */
  const body = $derived(
    `${flow.step}:${flow.network}:${flow.cause}:${flow.step === "https" && flow.certs}`
  );
  const primary = $derived(
    flow.step === "done" && words.primary
      ? { ...words.primary, act: onpark }
      : words.primary
  );
  /** A phone's actions stand 44px; a failure's quiet way out is small on a desk. */
  const primarySize = $derived.by(() => {
    if (form === "phone") {
      return "lg";
    }
    return primary?.quiet ? "sm" : "default";
  });
  const titleId = $props.id();
  /** Show details stands open: its link in the actions' row, its fold under it. */
  let details = $state(false);
  const detailsId = `${titleId}-details`;
</script>

<section
  bind:this={ref}
  aria-labelledby={titleId}
  class="relative grid min-w-0"
  data-form={form}
  data-moment={flow.moment}
  data-step={flow.step}
  data-tray="address"
  {@attach (node) => morph({ ms: dur("--dur-pop"), followUnfolds: true })(node)}
>
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
      <div class="grid min-w-0 gap-space-3" data-tray-content>
        <div class="grid min-w-0 gap-space-2" data-slot="lead">
          <!-- Caw on the axis: the head row's sides are equal, so his centre
             is the tray's, with ‹ or nothing before him and × after. -->
          <div
            class="grid grid-cols-(--head-cols) items-start"
            data-slot="head"
            style:--head-cols="minmax(0, 1fr) auto minmax(0, 1fr)"
          >
            <span class="col-1 row-1 flex justify-start">
              {#if flow.back}
                <Button
                  aria-label="Back"
                  class="-ms-space-2"
                  icon={IconChevronLeft}
                  onclick={() => flow.goBack()}
                  size="icon-sm"
                  variant="ghost"
                />
              {/if}
            </span>
            <!-- A failure grows him to 80 on the same top: no band opens under ×. -->
            <span class="col-2 row-1 flex justify-center">
              <CawStill big={failed} pose={flow.pose} />
            </span>
            <span class="col-3 row-1 flex justify-end">
              <Button
                aria-label="Close"
                class="-me-space-2"
                icon={IconClose}
                onclick={onpark}
                size="icon-sm"
                variant="ghost"
              />
            </span>
          </div>
          <h2
            id={titleId}
            class="m-0 min-w-0 text-start type-title tracking-title text-balance text-ink-strong"
            data-slot="title"
          >
            <MorphText text={words.title} wrap />
          </h2>
        </div>
        <div class="relative grid min-w-0">
          {#key body}
            <div
              class="grid min-w-0 gap-space-3 text-start"
              data-slot="state"
              in:arrive
              out:depart
            >
              {#each words.lines as line (line)}
                <p class="m-0 type-body text-pretty text-ink-muted">
                  <Words text={line} />
                </p>
              {/each}
              <FlowObject {flow} {form} />
              {#if words.meta}
                <p
                  class="mark-line m-0 flex min-w-0 items-start gap-x-space-2 type-meta text-ink-muted"
                  data-slot="meta"
                  {@attach reflow()}
                >
                  <span class="mark-cell">
                    {#if words.meta.live}
                      <LiveDot />
                    {:else}
                      <span class="grid" data-flip="pop">
                        <IconSuccess
                          aria-hidden="true"
                          class="size-icon-sm text-status-done-ink"
                        />
                      </span>
                    {/if}
                  </span>
                  <!-- The words wrap beside their mark, never off it: the mark stands on their first line. -->
                  <span class="mark-text min-w-0 flex-1"
                    ><MorphText text={words.meta.text} wrap /></span
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
          <FlowDetails bind:open={details} {flow} foldId={detailsId} />
        {/if}
        <!-- The tray's foot: its actions and, on a desk, the details fold
             under them, in one box with no gap of the column's, so the fold
             carries its own room and folds all of it away. -->
        <div class="grid min-w-0" data-slot="foot">
          {#if primary || (form === "desk" && !failed)}
            <div
              class={[
                form === "desk"
                  ? "flex flex-wrap items-center gap-space-2"
                  : "grid gap-space-2",
                form === "desk" && "justify-end",
              ]}
              data-slot="actions"
            >
              {#if form === "desk" && !failed}
                <span class="me-auto flex">
                  <FlowDetails
                    bind:open={details}
                    {flow}
                    foldId={detailsId}
                    part="link"
                  />
                </span>
              {/if}
              <!-- The buttons as one group: they wrap together, never apart. -->
              <span
                class={form === "desk"
                  ? "ms-auto flex flex-wrap justify-end gap-space-2"
                  : "contents"}
                data-slot="buttons"
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
                {#if primary}
                  <!-- A failure's way out is quiet: one small outline button, no coral (§4.5). -->
                  <Button
                    data-icon={primary.away ? "inline-end" : undefined}
                    data-tray-primary
                    disabled={primary.disabled}
                    onclick={primary.act}
                    size={primarySize}
                    variant={primary.quiet ? "outline" : "default"}
                  >
                    <MorphText text={primary.label} />
                    {#if primary.away}
                      <IconExternal aria-hidden="true" />
                    {/if}
                  </Button>
                {/if}
              </span>
            </div>
          {/if}
          <!-- On a desk, Show details stands in the actions' row, its fold under
               it; a failure's stands on its own row under its way out (§4.5). -->
          {#if form === "desk" && failed}
            <div class="grid min-w-0 pt-space-3">
              <FlowDetails
                bind:open={details}
                {flow}
                foldId={detailsId}
                part="both"
              />
            </div>
          {:else if form === "desk"}
            <FlowDetails
              bind:open={details}
              {flow}
              foldId={detailsId}
              part="fold"
            />
          {/if}
        </div>
      </div>
      {#if flow.firstLive && flow.step === "done"}
        <Confetti />
      {/if}
    </div>
  </div>
</section>
