/**
 * The kit's Badge (Component Story Format 3, live components) in a frame of
 * its own (badge-frame): each variant the product sets a badge in. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import BadgeFrame from "./badge-frame.svelte";

export default {
  title: "Kit/Badge",
  component: BadgeFrame,
  args: { words: "main" },
};

/** A branch named on a row. */
export const Plain = {};

/** On a recessed ground. */
export const Raised = { args: { variant: "raised", words: "claude-opus-5-5" } };

/** Quieter meta. */
export const Secondary = {
  args: { variant: "secondary", words: "2 hours ago" },
};

/** A session at work. */
export const Live = { args: { variant: "live", words: "Working" } };

/** A session waiting on the person. */
export const NeedsYou = { args: { variant: "attn", words: "Needs you" } };

/** A task done. */
export const Done = { args: { variant: "done", words: "Landed" } };

/** A run that failed. */
export const Failed = { args: { variant: "fail", words: "Checks failed" } };

/** A release note's new section. */
export const New = { args: { variant: "note-new", words: "New" } };

/** A release note's improved section. */
export const Improved = {
  args: { variant: "note-improved", words: "Improved" },
};

/** A release note's fixed section. */
export const Fixed = { args: { variant: "note-fixed", words: "Fixed" } };

/** A filter's count in its control's hue. */
export const Brand = { args: { variant: "brand", words: "3" } };

/** Faults waiting on the person in a settings section. */
export const AttentionCount = { args: { variant: "attn-count", words: "2" } };
