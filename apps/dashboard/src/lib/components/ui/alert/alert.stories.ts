/**
 * The kit's Alert (Component Story Format 3, live components) in a frame of
 * its own (alert-frame): each tint a notice takes, its glyph, its title, its
 * line and its action. The meta's args are every story's; a story's own
 * args are what it changes.
 */
import {
  IconError,
  IconInfo,
  IconSuccess,
  IconWarningTriangle,
} from "#lib/icons.js";
import AlertFrame from "./alert-frame.svelte";

export default {
  title: "Kit/Alert",
  component: AlertFrame,
  args: {
    icon: IconInfo,
    title: "Sessions on obelisk pause while it updates",
    line: "The daemon restarts in about a minute; nothing running is lost.",
  },
};

/** A note about the fleet, on the recessed ground. */
export const Note = {};

/** The hub can't be reached, with a way to try again. */
export const Failed = {
  args: {
    variant: "destructive",
    icon: IconError,
    title: "The hub stopped answering",
    line: "Sessions keep running on their machines; the board catches up once it's back.",
    action: "Try again",
  },
};

/** A machine needs attention before work can go on. */
export const Warning = {
  args: {
    variant: "warning",
    icon: IconWarningTriangle,
    title: "studio-mac is two releases behind",
    line: "Update it so new sessions start with the same tools as the rest of the fleet.",
    action: "Update",
  },
};

/** The work finished. */
export const Done = {
  args: {
    variant: "success",
    icon: IconSuccess,
    title: "All 14 checks passed on cockpit",
    line: undefined,
  },
};

/** A notice about what is running now. */
export const Live = {
  args: {
    variant: "info",
    title: "3 sessions are working on the release branch",
    line: undefined,
  },
};

/** A notice standing on a card, one line beside its action. */
export const OnACard = {
  args: {
    surface: "card",
    layout: "row",
    title: "Push notifications are off on this phone",
    line: undefined,
    action: "Turn on",
  },
};
