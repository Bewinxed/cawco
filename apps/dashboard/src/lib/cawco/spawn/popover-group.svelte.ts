/**
 * Sibling popovers that share one surface. Each NsPopover inside an
 * NsPopoverGroup registers its trigger and content here instead of owning a
 * popover; the group renders the single open one, so moving from one trigger
 * to the next retargets that surface rather than closing it and opening another.
 */
import { getContext, type Snippet, setContext, untrack } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import { browser } from "$app/env";

const phone = new MediaQuery("(width < 640px)");

/**
 * A popover's inset from the screen's edge, the kit popover's rule: the
 * screen's margin on a phone, the pages' gutter past it. Read in the
 * browser, where it opens.
 */
export const screenInset = (): number =>
  browser ? numberOf(phone.current ? "--c-screen-margin" : "--space-5") : 0;

export interface PopoverMember {
  readonly align: "start" | "end" | "center";
  readonly children: Snippet;
  readonly gap: number;
  readonly id: string;
  readonly label?: string;
  readonly onchange: (open: boolean) => void;
  /**
   * Where focus goes as the surface closes, when not back to the trigger:
   * true when it placed focus itself.
   */
  readonly onclosefocus?: () => boolean;
  readonly open: boolean;
  /** The rows the surface's hover ghost glides between (components/ui/highlight). */
  readonly rows?: string;
  readonly trapFocus: boolean;
  readonly trigger: HTMLElement | null;
  readonly width: PopoverWidth;
}

/** A surface's width: pixels, or a CSS length such as a token's `var(--c-…)`. */
export type PopoverWidth = number | string;

/** `width` as the surface's `--ns-pop-width` value. */
export const popoverWidth = (width: PopoverWidth): string =>
  typeof width === "number" ? `${width}px` : width;

export class PopoverGroup {
  members = $state.raw<PopoverMember[]>([]);

  /** Called from an effect; reading the list must not make it a dependency. */
  add(member: PopoverMember) {
    this.members = [...untrack(() => this.members), member];
    return () => {
      this.members = this.members.filter((item) => item !== member);
    };
  }

  /**
   * `member` is opening: every other open member closes first. Members can
   * keep their open state in different places (the dialog's chips in one,
   * the model row's tool chips in another), and the surface shows only one.
   */
  opening(member: PopoverMember) {
    for (const other of this.members) {
      if (other !== member && other.open) {
        other.onchange(false);
      }
    }
  }
}

const KEY = Symbol("ns-popover-group");

export const providePopoverGroup = () => setContext(KEY, new PopoverGroup());

/** The group around this component, when there is one. */

export const popoverGroup = () => getContext<PopoverGroup | undefined>(KEY);
