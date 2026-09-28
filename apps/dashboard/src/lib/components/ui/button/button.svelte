<script lang="ts" module>
  import type { Component } from "svelte";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
    SVGAttributes,
  } from "svelte/elements";
  import type { VariantProps } from "tailwind-variants";
  import { cn, tv, type WithElementRef } from "$lib/utils.js";

  export const buttonVariants = tv({
    base: "group/button focus-ring touch-hit inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] bg-clip-padding font-medium text-[var(--ink-strong)] text-body leading-none tracking-[-0.01em] outline-none [transition:var(--transition-control),transform_160ms_var(--ease-out)] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-invalid:border-destructive active:not-disabled:[transform:scale(var(--press-scale))] [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--brand-solid)] text-[var(--on-brand)] hover:bg-[var(--ink-hover)]",
        outline: "aria-expanded:bg-[var(--surface-hover)]",
        secondary:
          "border-[var(--border-hairline)] bg-[var(--surface-recess)] hover:bg-[var(--surface-hover)]",
        ghost:
          "border-transparent bg-transparent aria-expanded:bg-[var(--surface-hover)]",
        destructive:
          "border-[var(--error-9)] bg-transparent text-[var(--error-11)] hover:bg-[var(--error-3)]",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:bg-transparent hover:underline",
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
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
      /**
       * The button's words, for a button that runs something: with `label`
       * the button draws its own icon slot and label, and `pending` can
       * change both. Without it, the children are drawn as given.
       */
      label?: string;
      /** The icon in the slot at rest. */
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
    };
</script>

<script lang="ts">
  import { TextMorph } from "torph/svelte";
  import { Spinner } from "$lib/components/ui/spinner";
  import { IconTick } from "$lib/icons";
  import { CURVE, dur } from "$lib/whiffle/motion/curves.svelte";

  let {
    class: className,
    variant = "default",
    size = "default",
    ref = $bindable(null),
    href,
    type = "button",
    disabled,
    label,
    icon: Icon,
    pending = false,
    pendingLabel,
    failed = false,
    onclick,
    children,
    ...restProps
  }: ButtonProps = $props();

  /** The work ended well a moment ago: the check is up. */
  let done = $state(false);
  let running = false;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const now = pending;
    if (now) {
      clearTimeout(doneTimer);
      done = false;
    } else if (running && !failed) {
      done = true;
      doneTimer = setTimeout(() => {
        done = false;
      }, dur("--dur-hold"));
    }
    running = now;
  });
  $effect(() => () => clearTimeout(doneTimer));

  const phase = $derived.by(() => {
    if (pending) {
      return "pending";
    }
    return done ? "done" : "idle";
  });
  const text = $derived(pending && pendingLabel ? pendingLabel : label);

  /**
   * The label is plain text as the server draws it, and TextMorph once the
   * page is live (it draws its text only in the browser, so a server-drawn
   * TextMorph would be empty and grow on hydration); from then on each
   * change morphs, the width following over --dur-morph.
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });

  /** While pending the button keeps its focus, so it is not disabled: it
      swallows the press instead, including a form's implicit submit. */
  function press(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (pending) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

{#snippet content()}
  {#if label === undefined}
    {@render children?.()}
  {:else}
    <span
      class="icon-swap kit-slot"
      data-shown={Icon !== undefined || phase !== 'idle'}
    >
      {#if Icon}
        <span data-active={phase === 'idle'}><Icon /></span>
      {/if}
      <span data-active={phase === 'pending'}
        ><Spinner
          aria-hidden="true"
          class="size-(--btn-icon)"
          role="presentation"
        /></span
      >
      <span data-active={phase === 'done'}
        ><IconTick class="kit-tick" data-on={phase === 'done'} /></span
      >
    </span>
    {#if morphMs}
      <!-- TextMorph draws the words as one box per letter once it has
           morphed, which a screen reader spells out; the button's name comes
           from the plain copy beside it. -->
      <span aria-hidden="true" class="kit-label"
        ><TextMorph
          as="span"
          duration={morphMs}
          ease={CURVE.out}
          text={text ?? ''}
        /></span
      >
      <span class="sr-only">{text}</span>
    {:else}
      <span class="kit-label">{text}</span>
    {/if}
  {/if}
{/snippet}

{#if href}
  <a
    aria-disabled={disabled}
    class={cn(buttonVariants({ variant, size }), className)}
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
    class={cn(buttonVariants({ variant, size }), className)}
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
