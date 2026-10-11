<script lang="ts">
  /**
   * The kit tooltip (Root, Trigger, Content) put on one control: a plain
   * label and, where there is one, the keys that do the same thing. The
   * control is passed as a snippet and spreads the trigger's props, so it
   * stays the element it was (button or link) and keeps its own aria-label,
   * which says the same as the label here. A label of several lines breaks
   * at its newlines.
   *
   * With `tap`, a touch press opens it too (and a second one closes it),
   * where a tooltip otherwise answers only a resting pointer or focus. A
   * tooltip on a container gives way to the controls inside it: over one of
   * them, or pressed through one, it stays shut.
   */
  import type { Snippet } from "svelte";
  import Root from "./tooltip.svelte";
  import Content from "./tooltip-content.svelte";
  import Trigger from "./tooltip-trigger.svelte";

  let {
    label,
    keys,
    side = "bottom",
    disabled = false,
    tap = false,
    children,
  }: {
    label: string;
    /** The shortcut, as it is drawn: "⇧⌘N". */
    keys?: string;
    side?: "top" | "right" | "bottom" | "left";
    /** It never opens (the control's aria-label still says it). */
    disabled?: boolean;
    /** A touch press opens it, as a resting pointer does. */
    tap?: boolean;
    children: Snippet<[Record<string, unknown>]>;
  } = $props();

  let open = $state(false);
  /** The pointer rests on a control inside the trigger, which speaks for itself. */
  let inside = $state(false);
  let touched = false;
  let wasOpen = false;

  const CONTROL = 'button, a[href], [data-slot="tooltip-trigger"]';
  /** Whether an event landed on a control nested in this trigger. */
  const nested = (event: Event): boolean => {
    const own = (event.target as Element | null)?.closest(CONTROL);
    return Boolean(own && own !== event.currentTarget);
  };

  type Handler = ((event: Event) => void) | undefined;
  const withTap = (props: Record<string, unknown>) => ({
    ...props,
    onpointerover: (event: PointerEvent) => {
      inside = nested(event);
    },
    onpointerdown: (event: PointerEvent) => {
      touched = event.pointerType === "touch" && !nested(event);
      wasOpen = open;
      (props.onpointerdown as Handler)?.(event);
    },
    onclick: (event: MouseEvent) => {
      (props.onclick as Handler)?.(event);
      if (tap && touched) {
        open = !wasOpen;
      }
    },
  });
</script>

<Root disabled={disabled || inside} bind:open>
  <Trigger>
    {#snippet child({
      props,
    })}
      {@render children(withTap(props))}
    {/snippet}
  </Trigger>
  <Content {side}>
    <span class="whitespace-pre-line">{label}</span>
    {#if keys}
      <kbd class="font-sans opacity-70">{keys}</kbd>
    {/if}
  </Content>
</Root>
