import { getContext, setContext, untrack } from "svelte";

/** What a group is given by its root: its props, read live. */
export interface OptionGroupProps {
  disabled: () => boolean;
  /** How the options stand (option-group.svelte `optionGroupVariants`). */
  layout: () => "chips" | "list";
  multiple: () => boolean;
  /** Writes the chosen set back to the root's `value`. */
  setValue: (value: string[]) => void;
  value: () => string[];
}

/**
 * One option group's shared state: what is chosen, and which option holds
 * the group's one tab stop. Roles and keys follow Base UI's Radio Group and
 * Checkbox Group and WAI-ARIA APG's radio pattern; option-group.svelte
 * names them.
 */
export class OptionGroupState {
  readonly #props: OptionGroupProps;
  /** The option focus last stood on, which keeps the tab stop. */
  active = $state<string | null>(null);
  /** Every option's value, in the order the options were drawn. */
  options = $state<string[]>([]);
  readonly multiple = $derived.by(() => this.#props.multiple());
  readonly disabled = $derived.by(() => this.#props.disabled());
  readonly layout = $derived.by(() => this.#props.layout());
  readonly value = $derived.by(() => this.#props.value());
  /** The tab stop: the option focus last stood on, else the first chosen, else the first. */
  readonly stop = $derived.by(() => {
    if (this.active !== null && this.options.includes(this.active)) {
      return this.active;
    }
    return (
      this.options.find((option) => this.value.includes(option)) ??
      this.options[0] ??
      null
    );
  });

  constructor(props: OptionGroupProps) {
    this.#props = props;
  }

  chosen(option: string): boolean {
    return this.value.includes(option);
  }

  /**
   * A pick: one choice takes the option, and pressing the chosen one keeps
   * it (it never toggles off); several toggle the option in or out.
   */
  pick(option: string): void {
    if (this.disabled) {
      return;
    }
    if (!this.multiple) {
      if (!this.chosen(option)) {
        this.#props.setValue([option]);
      }
      return;
    }
    this.#props.setValue(
      this.chosen(option)
        ? this.value.filter((v) => v !== option)
        : [...this.value, option]
    );
  }

  /** An option drawn: it joins the group's order; the returned function takes it out. */
  register(option: string): () => void {
    untrack(() => {
      this.options = [...this.options, option];
    });
    return () => {
      untrack(() => {
        this.options = this.options.filter((v) => v !== option);
      });
    };
  }
}

const KEY = Symbol("option-group");

export function setOptionGroup(props: OptionGroupProps): OptionGroupState {
  return setContext(KEY, new OptionGroupState(props));
}

export function useOptionGroup(): OptionGroupState {
  const group = getContext<OptionGroupState | undefined>(KEY);
  if (!group) {
    throw new Error("an OptionGroup.Item stands outside an OptionGroup.Root");
  }
  return group;
}
