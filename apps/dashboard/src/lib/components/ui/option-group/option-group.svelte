<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { chipsVariants } from "#lib/components/ui/chip/index.js";
  import { tv } from "#lib/utils.js";

  /**
   * How the options stand: `chips`, a row of option chips wrapping whole
   * chips (ui/chip `chipsVariants`); `list`, one full-width row per option,
   * for options that carry a description under their label.
   */
  export const optionGroupVariants = tv({
    base: chipsVariants(),
    variants: {
      layout: { chips: "", list: "grid grid-cols-1" },
    },
    defaultVariants: { layout: "chips" },
  });

  export type OptionGroupLayout = VariantProps<
    typeof optionGroupVariants
  >["layout"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { setOptionGroup } from "./state.svelte.js";

  /**
   * A set of options answered by one pick, or by several: the roles of Base
   * UI's Radio Group and Checkbox Group (https://base-ui.com/react/components/radio-group,
   * https://base-ui.com/react/components/checkbox-group) and WAI-ARIA APG's
   * radio pattern (https://www.w3.org/WAI/ARIA/apg/patterns/radio/):
   * `radiogroup` of `radio`s for one pick, `group` of `checkbox`es for
   * several, one tab stop for the group. Its keys are APG's radio group in a
   * toolbar, where an arrow moves focus without checking: the arrows and
   * Home/End move focus, a click, a tap, Space or the option's digit picks,
   * and Enter never picks; the group hands Enter to its host (`onenter`),
   * whose own act it is. A digit is heard only while focus is in the group
   * (WCAG 2.1.4).
   *
   * `value` is the chosen set: one value at most for a single pick.
   */
  let {
    ref = $bindable(null),
    value = $bindable([]),
    multiple = false,
    disabled = false,
    layout,
    onenter,
    onkeydown,
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
    value?: string[];
    /** Several options may be chosen at once. */
    multiple?: boolean;
    disabled?: boolean;
    layout?: OptionGroupLayout;
    /** Enter on an option: the host's own act (continue, send, answer). */
    onenter?: (event: KeyboardEvent) => void;
  } = $props();

  setOptionGroup({
    value: () => value,
    multiple: () => multiple,
    disabled: () => disabled,
    layout: () => layout ?? "chips",
    setValue: (next) => {
      value = next;
    },
  });

  /** Focus's steps by arrow: the options wrap, so either axis means the next one. */
  const STEPS: Record<string, number | undefined> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };

  /** This group's own options that can take focus, in the order they stand. */
  function ownOptions(root: HTMLElement): HTMLButtonElement[] {
    return [
      ...root.querySelectorAll<HTMLButtonElement>('[data-slot="option"]'),
    ].filter(
      (option) =>
        option.closest('[data-slot="option-group"]') === root &&
        !option.disabled
    );
  }

  /** Where an arrow, Home or End takes focus from option `at` of `count`; null for any other key. */
  function stepTo(
    key: string,
    at: number,
    count: number,
    root: HTMLElement
  ): number | null {
    if (key === "Home") {
      return 0;
    }
    if (key === "End") {
      return count - 1;
    }
    const step = STEPS[key];
    if (!step) {
      return null;
    }
    const across = key === "ArrowLeft" || key === "ArrowRight";
    const flip = across && getComputedStyle(root).direction === "rtl";
    return (at + (flip ? -step : step) + count) % count;
  }

  /** A key the group never takes: a chord, or a key still being composed. */
  const passes = (event: KeyboardEvent): boolean =>
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing;

  /** A digit: the option wearing it, pressed as a click presses it (its own handler first). */
  function pressDigit(event: KeyboardEvent, options: HTMLButtonElement[]) {
    const option = options.find((o) => o.dataset.digit === event.key);
    if (!option) {
      return;
    }
    event.preventDefault();
    option.focus();
    option.click();
  }

  function keydown(event: KeyboardEvent & { currentTarget: HTMLDivElement }) {
    onkeydown?.(event);
    if (passes(event)) {
      return;
    }
    const root = event.currentTarget;
    const options = ownOptions(root);
    const at = options.findIndex(
      (option) => event.target instanceof Node && option.contains(event.target)
    );
    if (at === -1) {
      return;
    }
    if (event.key === "Enter") {
      // The button's own Enter would press the option: Enter never picks.
      event.preventDefault();
      if (!event.shiftKey) {
        onenter?.(event);
      }
      return;
    }
    if (event.key >= "1" && event.key <= "9") {
      pressDigit(event, options);
      return;
    }
    const next = stepTo(event.key, at, options.length, root);
    if (next !== null) {
      event.preventDefault();
      options[next]?.focus();
    }
  }
</script>

<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a radiogroup is a composite widget; its keys are the group's own (WAI-ARIA APG radio pattern). -->
<!-- biome-ignore lint/a11y/noStaticElementInteractions: its role is radiogroup or group, set from `multiple`. -->
<div
  class={cn(optionGroupVariants({ layout }), className)}
  aria-disabled={disabled || undefined}
  data-layout={layout ?? "chips"}
  data-slot="option-group"
  onkeydown={keydown}
  role={multiple ? "group" : "radiogroup"}
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
