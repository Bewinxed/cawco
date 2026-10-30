/**
 * Suggestions as a project's hub writes them, for the states file
 * (Suggestions.stories.ts) and the suggestions preview's capture
 * (design-previews/suggestions): a club's website two tasks from going live,
 * the project the project page's preview opens a project's first conversation on.
 */
import type { Suggestion } from "./Suggestions.svelte";

/** a project's first conversation on the club's site: the project page preview's three, with the hub's reasons. */
export const THREE: readonly Suggestion[] = [
  {
    glyph: "rocket",
    text: "What’s left before the site goes live?",
    reason: "Three tasks are open and the domain landed four days ago.",
  },
  {
    glyph: "search",
    text: "Review what landed this week",
    reason: "Two tasks landed on main since Monday.",
  },
  {
    glyph: "tasks",
    text: "Plan the next three tasks",
    reason: "Nothing on the board is ready after the contact form.",
  },
];

/** One starter: the hub had one thing worth saying. */
export const ONE: readonly Suggestion[] = [THREE[0] as Suggestion];

/** Seven: more than the hub writes today, so the look is seen holding more. */
export const MANY: readonly Suggestion[] = [
  ...THREE,
  {
    glyph: "draft",
    text: "Draft the club’s about page",
    reason: "The about page task has no words yet.",
  },
  {
    glyph: "bug",
    text: "Find what slows the booking page",
    reason: "Its last check took 4.2 s to show the calendar.",
  },
  {
    glyph: "mail",
    text: "Write the launch email to members",
    reason: "The members list was added last week.",
  },
  {
    glyph: "routine",
    text: "Check the site every morning",
    reason: "Nothing watches the live site yet.",
  },
];

/**
 * The longest the hub writes (90 characters of sentence, 120 of reason),
 * one of them an unbroken name, beside a short one.
 */
export const LONG: readonly Suggestion[] = [
  {
    glyph: "bug",
    text: "Find why booking-confirmation-reminder-email-template-v2 never reaches parents",
    reason:
      "Four parents wrote that no reminder came, and the template changed in the commit that landed on Tuesday afternoon.",
  },
  {
    glyph: "calendar",
    text: "Move the summer course dates on the booking page to the dates the instructors agreed on",
    reason:
      "The rota page lists different dates for the July course than the booking page shows to parents right now.",
  },
  THREE[1] as Suggestion,
];

/** The empty Decisions tab's starters: choices Caw would lay out as a decision page. */
export const DECISIONS: readonly Suggestion[] = [
  {
    glyph: "site",
    text: "Lay out where the site should be hosted",
    reason: "The domain landed, and no host is picked yet.",
  },
  {
    glyph: "palette",
    text: "Lay out three looks for the club’s pages",
    reason: "The about page task asks for the club’s colours.",
  },
  {
    glyph: "grill",
    text: "Lay out how parents pay the course deposit",
    reason: "The booking task names Stripe and bank transfer.",
  },
];
