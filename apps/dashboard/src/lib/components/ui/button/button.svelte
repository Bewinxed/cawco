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
    base: "group/button touch-hit inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] bg-clip-padding font-medium text-[var(--ink-strong)] text-body leading-none tracking-[-0.01em] [--hit-edge:1px] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      /* The press, by size (app.css, press feedback): a compact button
         scales; one stretched full width, as a list row or a card's body,
         tints instead. */
      press: {
        scale:
          "[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)] motion-safe:active:not-disabled:not-aria-busy:[transform:scale(var(--press-scale))]",
        tint: "press-tint [transition:var(--transition-control)]",
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
        link: "border-transparent bg-transparent text-link underline-offset-4 hover:bg-transparent hover:underline",
      },
      size: {
        default:
          "h-9 gap-(--btn-gap) px-3.5 [--btn-gap:8px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-(--btn-gap) px-2 text-label [--btn-gap:4px] [--btn-icon:12px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-(--btn-gap) px-[11px] text-label [--btn-gap:7px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-(--btn-gap) px-4 [--btn-gap:8px] [--btn-icon:16px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-11",
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

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
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
       * label says `pendingLabel`, the width follows over --dur-morph, and the
       * button holds its place and its focus but takes no press. When it
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
    class={cn(buttonVariants({ variant, size, press: pressKind }), className)}
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
    class={cn(buttonVariants({ variant, size, press: pressKind }), className)}
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
