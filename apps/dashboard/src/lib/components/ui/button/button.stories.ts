/**
 * The kit's Button (Component Story Format 3, live components), mounted as
 * itself in each look the product draws it: its variants, its sizes, an
 * icon beside or in place of its words, and its wait, its failure and its
 * disabled dimming. The meta's args are every story's; a story's own args
 * are what it changes.
 */
import {
  IconMore,
  IconPin,
  IconPlus,
  IconSend,
  IconTrash,
} from "#lib/icons.js";
import Button from "./button.svelte";
import ButtonFixture from "./button-fixture.svelte";

export default {
  title: "Kit/Button",
  component: Button,
  args: { label: "Start a session" },
};

/** The one primary action on the screen: start a session. */
export const Primary = {};

/** A second action beside the primary, edged. */
export const Outline = {
  args: { variant: "outline", label: "Open in a new tab" },
};

/** A quieter action on a recessed ground. */
export const Secondary = {
  args: { variant: "secondary", label: "Copy the session's link" },
};

/** An action that stands as its words alone until the pointer reaches it. */
export const Ghost = { args: { variant: "ghost", label: "Show older runs" } };

/** An action that deletes something for good. */
export const Destructive = {
  args: {
    variant: "destructive",
    label: "Delete the project",
    icon: IconTrash,
  },
};

/** A grant wider than what the agent asked for. */
export const Grant = {
  args: { variant: "grant", label: "Allow every command in cockpit" },
};

/** A link that reads as words in a sentence. */
export const Link = {
  args: { variant: "link", label: "Read the release notes" },
};

/** The action with its glyph before its words. */
export const WithIcon = { args: { icon: IconPlus, label: "New task" } };

/** A glyph alone, named for the screen reader. */
export const IconOnly = {
  args: {
    variant: "ghost",
    size: "icon-sm",
    label: undefined,
    icon: IconMore,
    "aria-label": "More for this session",
  },
};

/** A small action in a row's trailing edge. */
export const Small = {
  args: { variant: "outline", size: "sm", label: "Retry" },
};

/** The smallest action, beside meta text. */
export const ExtraSmall = {
  args: { variant: "outline", size: "xs", label: "Undo" },
};

/** The large action that opens a phone sheet's foot. */
export const Large = { args: { size: "lg", label: "Pair this phone" } };

/** The send action waiting on the hub's answer. */
export const Sending = {
  args: {
    icon: IconSend,
    label: "Send",
    pending: true,
    pendingLabel: "Sending",
  },
};

/** The action's last try failed, its words back with no check. */
export const Failed = {
  args: { variant: "outline", label: "Push the branch", failed: true },
};

/** An action that can't be taken yet. */
export const Disabled = { args: { label: "Merge the change", disabled: true } };

/** Press it: the work runs, the slot spins, then draws a check. */
export const PressSucceeds = {
  component: ButtonFixture,
  args: {
    flow: "succeeds",
    icon: IconSend,
    label: "Send",
    pendingLabel: "Sending",
    doneLabel: "Sent",
  },
};

/** Press it: the work runs and fails, and the slot draws a cross. */
export const PressFails = {
  component: ButtonFixture,
  args: {
    flow: "fails",
    variant: "outline",
    label: "Push the branch",
    pendingLabel: "Pushing",
    failedLabel: "Push failed",
  },
};

/** Press it once to arm it, again before its rim runs out to delete. */
export const PressConfirms = {
  component: ButtonFixture,
  args: {
    flow: "confirms",
    variant: "destructive",
    icon: IconTrash,
    label: "Delete the project",
    pendingLabel: "Deleting",
    doneLabel: "Deleted",
    confirm: "Press again to delete",
  },
};

/** A toggle whose pin shows it is on: press it to pin, again to unpin. */
export const PressToPin = {
  component: ButtonFixture,
  args: {
    flow: "icon",
    variant: "outline",
    icon: IconPin,
    label: "Pin to the rail",
  },
};
