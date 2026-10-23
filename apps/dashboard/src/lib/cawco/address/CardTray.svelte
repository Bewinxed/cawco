<script lang="ts">
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  /**
   * Direction B: one status card that changes its mood (design 6ddc57c4,
   * Option B), in PairingScreen's own shape: Caw at 64px over a title and
   * one line, then the slot (a recessed well holding the state's one
   * object, closed when the state has none), a meta line with the live dot,
   * one button, and Show details under it. The card never rearranges: only
   * its words (MorphText), its object and its button change, and only the
   * slot changes height, which morph carries over --dur-pop on the drawer
   * curve. A second way on (Skip, Open Setup Keys) is a text action in its
   * own place under the button, so the card keeps its one button and the
   * meta line only ever says what it waits on. Caw never moves; a failure
   * keeps him at the top in his needs-you pose. × only, never ‹.
   */
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconClose, IconExternal, IconSuccess } from "#lib/icons.js";
  import Confetti from "./Confetti.svelte";
  import { arrive, depart } from "./motion";
  import StateObject, { hasObject } from "./StateObject.svelte";
  import TrayCaw from "./TrayCaw.svelte";
  import TrayDetails from "./TrayDetails.svelte";
  import type { AddressTray } from "./tray.svelte";
  import Words from "./Words.svelte";
  import { type Form, factsFor, rawFor, stateWords } from "./words";

  let {
    tray,
    form,
    ref = $bindable(null),
  }: { tray: AddressTray; form: Form; ref?: HTMLElement | null } = $props();

  const CAW = 64;

  const words = $derived(stateWords(tray, form));
  const slot = $derived(hasObject(tray, form));
  const body = $derived(`${tray.view}:${tray.network}:${tray.cause}`);
  const titleId = $props.id();
</script>

<section
  bind:this={ref}
  aria-labelledby={titleId}
  style:--tray-pad="calc(var(--radius-modal) - var(--radius-lg))"
  class={[
    "relative min-w-0",
    form === "desk"
      ? "rounded-modal bg-surface-recess p-(--tray-pad) shadow-overlay"
      : "rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer",
  ]}
  data-form={form}
  data-step={tray.step}
  data-tray="card"
  {@attach (node) => morph({ ms: dur("--dur-pop") })(node)}
>
  <div
    class={[
      "relative grid min-w-0 justify-items-center gap-space-4 bg-surface-raised text-center",
      form === "desk"
        ? "rounded-lg p-space-5"
        : "max-h-(--sheet-room) overflow-y-auto overscroll-contain rounded-t-lg px-space-4 pb-safe-space-4",
    ]}
    data-slot="body"
  >
    {#if form === "phone"}
      <div aria-hidden="true" class={grabberVariants()}></div>
    {/if}
    <Button
      aria-label="Close"
      class={[
        "absolute end-space-3",
        form === "desk" ? "top-space-3" : "top-space-7",
      ]}
      icon={IconClose}
      onclick={() => tray.park()}
      size="icon-sm"
      variant="ghost"
    />
    <div
      class="grid w-full min-w-0 justify-items-center gap-space-4"
      data-tray-content
    >
      <TrayCaw pose={tray.pose.pose} size={CAW} />
      <h2
        id={titleId}
        class="m-0 min-w-0 px-space-7 type-title tracking-title text-balance text-ink-strong"
        data-slot="title"
      >
        <MorphText text={words.title} wrap />
      </h2>
      <div class="relative grid w-full min-w-0">
        {#key body}
          <div
            class="grid w-full min-w-0 justify-items-center gap-space-3"
            in:arrive
            out:depart
          >
            {#each words.lines as line (line)}
              <p
                class="m-0 max-w-c-page-line type-body text-pretty text-ink-muted"
              >
                <Words text={line} />
              </p>
            {/each}
          </div>
        {/key}
      </div>
      {#if slot}
        <div
          class="w-full min-w-0 rounded-well border border-border-well bg-surface-recess p-space-3 text-start"
          data-slot="slot"
          transition:unfold
        >
          <div class="relative grid min-w-0">
            {#key body}
              <div class="grid min-w-0" in:arrive out:depart>
                <StateObject {form} {tray} />
              </div>
            {/key}
          </div>
        </div>
      {/if}
      {#if words.meta}
        <!-- What it waits on, alone on its line: a status, never an action. -->
        <p
          class="mark-line m-0 flex min-w-0 flex-wrap items-start justify-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
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
      {#if words.primary}
        <span
          class={["flex justify-center", form === "phone" && "w-full *:w-full"]}
        >
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
        </span>
      {/if}
      {#if words.secondary}
        <!-- The second way on, a text action in its own place under the
             card's one button, so the card keeps one button. -->
        <span class="flex justify-center" data-slot="secondary">
          <Button
            data-icon={words.secondary.away ? "inline-end" : undefined}
            onclick={words.secondary.act}
            size="xs"
            variant="link"
          >
            <MorphText text={words.secondary.label} />
            {#if words.secondary.away}
              <IconExternal aria-hidden="true" class="size-icon-sm" />
            {/if}
          </Button>
        </span>
      {/if}
      <div class="w-full min-w-0 text-start">
        <TrayDetails
          bind:open={tray.details}
          facts={factsFor(tray)}
          look="link"
          raw={rawFor(tray)}
          {tray}
        />
      </div>
    </div>
    {#if tray.firstLive && tray.step === "live"}
      <Confetti />
    {/if}
  </div>
</section>
