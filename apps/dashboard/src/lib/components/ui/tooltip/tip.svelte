<script lang="ts">
  /**
   * The kit tooltip (Root, Trigger, Content) put on one control: a plain
   * label and, where there is one, the keys that do the same thing. The
   * control is passed as a snippet and spreads the trigger's props, so it
   * stays the element it was (button or link) and keeps its own aria-label,
   * which says the same as the label here. A label of several lines breaks
   * at its newlines; a `title` stands over it, strong, saying whose it is.
   *
   * With `tap`, a touch press opens it too (and a second one closes it),
   * where a tooltip otherwise answers only a resting pointer or focus. A
   * tooltip on a container gives way to the controls inside it: over one of
   * them, or pressed through one, it stays shut.
   */
  import type { Snippet } from "svelte";
  import type { Glide } from "./glide";
  import Root from "./tooltip.svelte";
  import Content from "./tooltip-content.svelte";
  import Trigger from "./tooltip-trigger.svelte";

  let {
    label,
    title,
    keys,
    side = "bottom",
    disabled = false,
    tap = false,
    anchor,
    ontoggle,
    glide,
    children,
  }: {
    label: string;
    /** A strong first line over the label: whose it is. */
    title?: string;
    /** The shortcut, as it is drawn: "⇧⌘N". */
    keys?: string;
    side?: "top" | "right" | "bottom" | "left";
    /** It never opens (the control's aria-label still says it). */
    disabled?: boolean;
    /** A touch press opens it, as a resting pointer does. */
    tap?: boolean;
    /** What it stands beside, where that is more than its trigger. */
    anchor?: { getBoundingClientRect: () => DOMRect };
    /** It opened or closed. */
    ontoggle?: (open: boolean) => void;
    /** Its glass's one tooltip (glide.ts): this tip is a trigger of it, its words its payload, and the tooltip glides here from a neighbour. Not with `anchor`, `tap` or `ontoggle`, which need a tooltip of their own. */
    glide?: Glide | null;
    children: Snippet<[Record<string, unknown>]>;
  } = $props();

  let open = $state(false);
  $effect(() => {
    ontoggle?.(open);
  });
  // Disabled while it stands open (what it names opened over it): it goes, not only stops reopening.
  $effect(() => {
    if (disabled) {
      open = false;
    }
  });
  /** The pointer rests on a control inside the trigger, which speaks for itself. */
  let inside = $state(false);
  let touched = false;
  let wasOpen = false;

  // A trigger is known by the primitive's own mark (bits-ui
  // `data-tooltip-trigger`), never by a slot: the control keeps its own.
  const CONTROL = "button, a[href], [data-tooltip-trigger]";
  /** Whether an event landed on a control nested in this trigger. */
  const nested = (event: Event): boolean => {
    const own =
      event.target instanceof Element ? event.target.closest(CONTROL) : null;
    return Boolean(own && own !== event.currentTarget);
  };

  /**
   * The trigger's props for the control, less the kit trigger's slot
   * (`data-slot="tooltip-trigger"`): spread after the control's own slot
   * (a kit Tabs trigger's `tabs-trigger`, a fluid tab's `hit`, a Button's
   * `button`), it took that slot's place, and what is keyed on it was lost
   * (the segmented thumb found no chosen trigger and stood unpainted).
   */
  const withTap = ({
    "data-slot": _slot,
    ...props
  }: Record<string, unknown>) => ({
    ...props,
    onpointerover: (event: PointerEvent) => {
      inside = nested(event);
    },
    onpointerdown: (event: PointerEvent) => {
      touched = event.pointerType === "touch" && !nested(event);
      wasOpen = open;
      if (typeof props.onpointerdown === "function") {
        props.onpointerdown(event);
      }
    },
    onclick: (event: MouseEvent) => {
      if (typeof props.onclick === "function") {
        props.onclick(event);
      }
      if (tap && touched) {
        open = !wasOpen;
      }
    },
  });
</script>

{#if glide && !anchor && !tap && !ontoggle}
  <Trigger
    disabled={disabled || inside}
    payload={{ label, title, keys, side }}
    tether={glide}
  >
    {#snippet child({ props })}
      {@render children(withTap(props))}
    {/snippet}
  </Trigger>
{:else}
  <Root disabled={disabled || inside} bind:open>
    <Trigger>
      {#snippet child({ props })}
        {@render children(withTap(props))}
      {/snippet}
    </Trigger>
    <!-- 8px clear of the viewport's edges: it never touches one. -->
    <Content collisionPadding={8} customAnchor={anchor ?? null} {side}>
      <span class="whitespace-pre-line"
        >{#if title}
          <strong data-slot="block" class="block font-medium">{title}</strong>
        {/if}
        {label}</span
      >
      {#if keys}
        <kbd class="font-sans opacity-70">{keys}</kbd>
      {/if}
    </Content>
  </Root>
{/if}
