<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Its callers' looks. `face`: its words' face. `title`: a pane head's
   * title, the name of what is on show (the artifact switcher), its glyph
   * and chevron on its words' line: the label role and the strong ink, as
   * the head's own title (SideSurface's `title`; DESIGN.md, The Role, Not
   * Size Rule, The Mark Line Rule), its padding the title's inset there.
   * `count`: a glyph and the count it holds on one line (a pane head's
   * More: menu-dots, then the counted control's own glyph and its count),
   * at `space-2` in so the three stand where Send keeps its room. `look`: the trigger by its role.
   * `attach`: the composer's Attach (DESIGN.md, Composer: "34px Attach
   * (raised, control edge) … at the concentric 4px radius. They scale to
   * 0.97 on press"); while the composer's controls are inert under an ask
   * (`group/ctrls`), its edge is the outline button's and it lifts.
   */
  const dropdownMenuTriggerVariants = tv({
    variants: {
      face: {
        title:
          "mark-line type-label min-w-0 gap-space-1 px-space-2 text-ink-strong",
        count: "mark-line px-space-2",
      },
      look: {
        attach:
          "hit-edge-hair grid size-c-composer-field place-items-center concentric-xs border border-border-control bg-surface-raised text-ink-muted transition-[background-color,color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:text-ink-strong group-inert/ctrls:not-aria-invalid:border-border-button-outline group-inert/ctrls:shadow-xs motion-safe:pressed:scale-(--press-scale) motion-safe:transition-[background-color,color,scale]",
      },
    },
  });

  type DropdownMenuTriggerLooks = VariantProps<
    typeof dropdownMenuTriggerVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { on } from "svelte/events";
  import {
    type ButtonSize,
    type ButtonVariant,
    buttonVariants,
  } from "#lib/components/ui/button/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    size,
    face,
    look,
    onpointerdown,
    ...restProps
  }: DropdownMenuPrimitive.TriggerProps &
    DropdownMenuTriggerLooks & {
      /** A trigger drawn as a kit Button of this variant and size. */
      variant?: ButtonVariant;
      size?: ButtonSize;
    } = $props();

  /**
   * Held from the press until the pointer lets go, drawn by the `pressed`
   * variant (lib/tokens/variants.css). The menu opens on the press, takes
   * the focus into itself and locks the body's pointer events, and Chromium
   * drops the Trigger's `:active` with that a frame in, so a press rule on
   * `:active` alone never painted. The release is heard on the window:
   * under the lock, the pointerup no longer lands on the Trigger.
   */
  let pressed = $state(false);

  $effect(() => {
    if (!pressed) {
      return;
    }
    const release = () => {
      pressed = false;
    };
    // The window's own blur, not captured: captured, it would hear the
    // Trigger's blur as the menu takes the focus, and let go mid-press.
    const offs = [
      on(window, "pointerup", release, { capture: true }),
      on(window, "pointercancel", release, { capture: true }),
      on(window, "blur", release),
    ];
    return () => {
      for (const off of offs) {
        off();
      }
    };
  });

  function press(
    event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
  ): void {
    onpointerdown?.(event);
    if (event.button === 0) {
      pressed = true;
    }
  }
</script>

<DropdownMenuPrimitive.Trigger
  class={cn(
    "touch-hit",
    (variant || size) && buttonVariants({ variant, size }),
    dropdownMenuTriggerVariants({ face, look }),
    className
  )}
  data-pressed={pressed || undefined}
  data-slot="dropdown-menu-trigger"
  onpointerdown={press}
  bind:ref
  {...restProps}
/>
