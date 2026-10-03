import type { WithChildren, WithoutChildren } from "bits-ui";
import type { Snippet } from "svelte";
import type { ButtonProps } from "#lib/components/ui/button/index.js";
import type { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";

export type CopyButtonPropsWithoutHTML = WithChildren<
  Pick<ButtonProps, "size" | "variant"> & {
    text: string;
    icon?: Snippet<[]>;
    onCopy?: (status: UseClipboard["status"]) => void;
  }
>;

// The HTML half comes from `Button` itself: anything narrower is a second, subtly
// different props type that TypeScript then has to reconcile at the spread.
export type CopyButtonProps = CopyButtonPropsWithoutHTML &
  WithoutChildren<ButtonProps>;
