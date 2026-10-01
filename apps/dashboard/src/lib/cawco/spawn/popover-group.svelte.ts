/**
 * Sibling popovers that share one surface. Each NsPopover inside an
 * NsPopoverGroup registers its trigger and content here instead of owning a
 * popover; the group renders the single open one, so moving from one trigger
 * to the next retargets that surface rather than closing it and opening another.
 */
import { getContext, type Snippet, setContext, untrack } from "svelte";

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
  readonly width: number;
}

export class PopoverGroup {
  members = $state.raw<PopoverMember[]>([]);

  /** Called from an effect; reading the list must not make it a dependency. */
  add(member: PopoverMember) {
    this.members = [...untrack(() => this.members), member];
    return () => {
      this.members = this.members.filter((item) => item !== member);
    };
  }
}

const KEY = Symbol("ns-popover-group");

export const providePopoverGroup = () => setContext(KEY, new PopoverGroup());

export const popoverGroup = () => getContext<PopoverGroup | undefined>(KEY);
