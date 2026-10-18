<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { on } from "svelte/events";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    onpointerdown,
    ...restProps
  }: DropdownMenuPrimitive.TriggerProps = $props();

  /**
   * Held from the press until the pointer lets go, drawn by the `pressed`
   * variant (app.css). The menu opens on the press, takes the focus into
   * itself and locks the body's pointer events, and Chromium drops the
   * Trigger's `:active` with that a frame in, so a press rule on `:active`
   * alone never painted. The release is heard on the window: under the
   * lock, the pointerup no longer lands on the Trigger.
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
  class={cn("touch-hit", className)}
  data-pressed={pressed || undefined}
  data-slot="dropdown-menu-trigger"
  onpointerdown={press}
  bind:ref
  {...restProps}
/>
