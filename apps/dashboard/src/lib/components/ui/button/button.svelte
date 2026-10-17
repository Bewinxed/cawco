<script lang="ts" module>
  import type { Component, Snippet } from "svelte";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
    SVGAttributes,
  } from "svelte/elements";
  import type { VariantProps } from "tailwind-variants";
  import { cn, tv, type WithElementRef } from "#lib/utils.js";

  export const buttonVariants = tv({
    base: "group/button mark-line touch-hit inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-button-outline)] bg-[var(--surface-raised)] bg-clip-padding font-medium text-[var(--ink-strong)] text-body leading-none tracking-[-0.01em] [--hit-edge:1px] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error-9 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      /* The press, by size (app.css, press feedback): a compact button
         scales; one stretched full width, as a list row or a card's body,
         tints instead. `pressable` is the house's own compact press
         (app.css .pressable): it scales, and eases only its transform and
         shadow, so its colours change at once. */
      press: {
        scale:
          "[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)] motion-safe:active:not-disabled:not-aria-busy:[transform:scale(var(--press-scale))]",
        tint: "press-tint [transition:var(--transition-control)]",
        pressable: "pressable",
      },
      variant: {
        default:
          "border-transparent bg-[image:var(--action-surface)] bg-[var(--action-solid)] text-[var(--on-action)] hover:bg-[image:var(--action-surface-hover)] hover:bg-[var(--action-hover)]",
        outline: "aria-expanded:bg-[var(--surface-hover)]",
        secondary:
          "border-[var(--border-hairline)] bg-[var(--surface-recess)] hover:bg-[var(--surface-hover)]",
        ghost:
          "border-transparent bg-transparent aria-expanded:bg-[var(--surface-hover)]",
        destructive:
          "border-[var(--error-9)] bg-transparent text-[var(--error-11)] hover:bg-[var(--error-3)]",
        /* A grant wider than what was asked (DESIGN.md, The Consequential
           Grant Rule): warning tint, warning ink and a real edge, the same at
           rest and under the pointer, so it is never made more inviting. */
        grant:
          "border-[var(--status-attn-ink)] bg-[var(--status-attn-bg)] text-[color:var(--status-attn-ink)] hover:bg-[var(--status-attn-bg)]",
        link: "border-transparent bg-transparent text-link-ink underline-offset-4 hover:bg-transparent hover:underline",
      },
      size: {
        default:
          "h-9 gap-(--btn-gap) px-space-4 [--btn-gap:8px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-(--btn-gap) px-2 text-label [--btn-gap:4px] [--btn-icon:12px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-icon-sm",
        sm: "h-[30px] gap-(--btn-gap) px-[11px] text-label [--btn-gap:7px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-(--btn-gap) px-4 [--btn-gap:8px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-icon-sm",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-11",
      },
      /* The looks its callers draw over a variant, each as they drew it. */
      /** The ink: muted, or muted until the pointer is on it. */
      tone: {
        muted: "text-ink-muted",
        quiet: "text-ink-muted hover:text-ink-strong",
      },
      /** An answer to an ask: filled in the status tint, edged on the recess,
          or edged with its strong ink held (a prompt's answers). Its hover
          holds over an open or invalid state, as the callers' own rules
          did: the halves keep the states apart for the variant sort. The
          tinted answers keep no edge, invalid too, and their tint fills
          under it (the callers' `background` shorthand put the clip back
          at the border box). */
      answer: {
        deny: "border-transparent bg-status-fail-bg bg-clip-border text-status-fail-ink not-aria-expanded:hover:bg-status-fail-bg hover:text-status-fail-ink aria-expanded:hover:bg-status-fail-bg aria-invalid:border-transparent",
        approve:
          "border-transparent bg-status-done-bg bg-clip-border text-status-done-ink not-aria-expanded:hover:bg-status-done-bg hover:text-status-done-ink aria-expanded:hover:bg-status-done-bg aria-invalid:border-transparent",
        "deny-edge":
          "border-status-fail-ink bg-surface-recess text-ink-strong not-aria-invalid:hover:border-status-fail-ink not-aria-expanded:hover:bg-surface-recess hover:text-ink-strong aria-expanded:hover:bg-surface-recess aria-invalid:border-status-fail-ink aria-invalid:hover:border-status-fail-ink",
        "approve-edge":
          "border-status-done-ink bg-surface-recess text-ink-strong not-aria-invalid:hover:border-status-done-ink not-aria-expanded:hover:bg-surface-recess hover:text-ink-strong aria-expanded:hover:bg-surface-recess aria-invalid:border-status-done-ink aria-invalid:hover:border-status-done-ink",
        "deny-strong":
          "border-status-fail-ink bg-surface-recess text-ink-strong! not-aria-expanded:hover:bg-surface-recess aria-expanded:hover:bg-surface-recess aria-invalid:border-status-fail-ink",
        "approve-strong":
          "border-status-done-ink bg-surface-recess text-ink-strong! not-aria-expanded:hover:bg-surface-recess aria-expanded:hover:bg-surface-recess aria-invalid:border-status-done-ink",
      },
      /** No edge of its own. */
      edge: { none: "border-transparent" },
      /** Its box: a prompt's answer (the label size at medium weight, the
          small corner), or 24px square. */
      fit: {
        prompt: "gap-(--btn-gap) rounded-sm px-space-3 font-medium text-label",
        "prompt-wide":
          "gap-(--btn-gap) rounded-sm px-space-4 font-medium text-label",
        "square-24": "h-6 w-6",
      },
      /** A control inset in a field takes the field's tighter corner. */
      shape: { inset: "rounded-xs" },
      /** It may shrink below its words, or up to a field's cap. */
      width: { shrink: "min-w-0", capped: "min-w-0 max-w-112" },
      /** Pulled into what stands beside it, or set off from it. */
      margin: {
        "hairline-overlap": "-me-px",
        "ghost-end": "-mr-1.5",
        "start-gap": "ml-2",
        "beside-num": "peer-data-num/place:ms-0",
      },
      /** Its words and mark spread apart. */
      gap: { loose: "gap-2" },
      /** Its inline padding: none (a link reading as text), or the caller's `--more-px`. */
      pad: { none: "px-0", more: "px-(--more-px)" },
      /** Shown only when its row is in reach: under the pointer, focused, or
          under a finger. Disabled too, as the callers' own rules drew it
          over the kit's dimming: the halves keep the states apart. */
      reveal: {
        "value-hover":
          "coarse:opacity-100 opacity-0 not-disabled:focus-visible:opacity-100 coarse:disabled:opacity-100 disabled:opacity-0 disabled:focus-visible:opacity-100 group-hover/value:not-disabled:opacity-100 group-hover/value:disabled:opacity-100",
        "row-hover":
          "can-hover:dur-control can-hover:opacity-0 can-hover:transition-[opacity] can-hover:ease-out can-hover:not-disabled:focus-visible:opacity-100 can-hover:disabled:opacity-0 can-hover:disabled:focus-visible:opacity-100 can-hover:group-hover:not-disabled:opacity-100 can-hover:group-hover:disabled:opacity-100",
      },
      /** Open, it draws no fill while the pointer is off it (its words and
          chevron say it is open). */
      expanded: { unfilled: "aria-expanded:unhovered:bg-transparent" },
      /** A path, in the mono face at the label size. */
      face: { path: "font-mono font-normal text-label" },
      /** The last of a row of actions: its end padding moved to its start
          (`--toggle-start`, `--end`), over the size's icon-side pads. */
      toggle: {
        last: "last:not-has-data-[icon=inline-start]:ps-(--toggle-start) last:not-has-data-[icon=inline-end]:pe-(--end) last:has-data-[icon=inline-start]:ps-(--toggle-start) last:has-data-[icon=inline-end]:pe-(--end)",
      },
      /** Its figures in tabular widths. */
      figures: { tabular: "tabular-nums" },
      /** While its page is open (`aria-current="page"`), the selected tint
          (filling under the edge) and ink over every state, as its caller's
          own rule held them, crossing over --dur-control; its press scales
          at once. */
      current: {
        selected:
          "[transition:background-color_var(--dur-control)_var(--ease-out),color_var(--dur-control)_var(--ease-out)] aria-current-page:bg-selected-bg! aria-current-page:bg-clip-border aria-current-page:text-selected-ink!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      press: "scale",
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
  export type ButtonPress = VariantProps<typeof buttonVariants>["press"];
  /** The looks a caller draws over its variant and size. */
  export type ButtonLooks = Omit<
    VariantProps<typeof buttonVariants>,
    "variant" | "size" | "press"
  >;

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> &
    ButtonLooks & {
      variant?: ButtonVariant;
      size?: ButtonSize;
      press?: ButtonPress;
      /**
       * The button's words, for a button that runs something: with `label`
       * the button draws its own icon slot and label, and `pending` can
       * change both. Without it, the children are drawn as given.
       */
      label?: string;
      /**
       * The icon in the slot at rest. Given without `label`, it is an
       * icon-only button: the slot alone, named by its `aria-label`.
       */
      icon?: Component<SVGAttributes<SVGSVGElement>>;
      /**
       * The work this button started is running. The icon slot spins, the
       * label cross-fades to `pendingLabel` (the button is as wide as the
       * wider of the two from the start), and the button holds its place and its focus but takes no press. When it
       * ends without `failed`, a check stands in the slot for --dur-hold.
       */
      pending?: boolean;
      /** What the label says while pending ("Saving…"); unchanged if unset. */
      pendingLabel?: string;
      /** The work that just ended failed: no check. */
      failed?: boolean;
      /**
       * The share of the work done (0 to 1), for work that counts: above 0
       * the slot draws a ring filled to it instead of the spinner.
       */
      progress?: number;
      /** Drawn in the icon slot over its icon: what lands there. */
      arrivals?: Snippet;
    };
</script>

<script lang="ts">
  import PendingContent, { whileIdle } from "./pending-content.svelte";

  let {
    class: className,
    variant = "default",
    size = "default",
    press: pressKind = "scale",
    tone,
    answer,
    edge,
    fit,
    shape,
    width,
    margin,
    gap,
    pad,
    reveal,
    expanded,
    face,
    toggle,
    figures,
    current,
    ref = $bindable(null),
    href,
    type = "button",
    disabled,
    label,
    icon,
    pending = false,
    pendingLabel,
    failed = false,
    progress,
    arrivals,
    onclick,
    children,
    ...restProps
  }: ButtonProps = $props();

  const classes = $derived(
    cn(
      buttonVariants({
        variant,
        size,
        press: pressKind,
        tone,
        answer,
        edge,
        fit,
        shape,
        width,
        margin,
        gap,
        pad,
        reveal,
        expanded,
        face,
        toggle,
        figures,
        current,
      }),
      className
    )
  );

  const press = whileIdle(
    () => pending,
    (event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) =>
      onclick?.(event)
  );
</script>

{#snippet content()}
  <!-- Its own slot when it is given an icon or a label (an icon-only
       button passes `icon` and its `aria-label`); its children otherwise. -->
  {#if label === undefined && icon === undefined}
    {@render children?.()}
  {:else}
    <PendingContent
      {arrivals}
      {failed}
      {icon}
      {label}
      {pending}
      {pendingLabel}
      {progress}
    />
  {/if}
{/snippet}

{#if href}
  <a
    aria-disabled={disabled}
    class={classes}
    data-slot="button"
    href={disabled ? undefined : href}
    {onclick}
    role={disabled ? "link" : undefined}
    tabindex={disabled ? -1 : undefined}
    bind:this={ref}
    {...restProps}
  >
    {@render content()}
  </a>
{:else}
  <button
    aria-busy={pending || undefined}
    aria-disabled={pending || undefined}
    class={classes}
    data-slot="button"
    {disabled}
    onclick={press}
    {type}
    bind:this={ref}
    {...restProps}
  >
    {@render content()}
  </button>
{/if}
