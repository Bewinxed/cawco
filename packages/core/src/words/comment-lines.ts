/** What a delivery says of a person's marks: where a mark stands and what was written. */

import type { PageAnchor } from "../comments/anchor";
import type { ChangedItem } from "../doc-meta";

/** A chain as a delivery says it: `IconAgent (Who.svelte:82:11) › story Agent (Who.stories.ts:5:14)`. */
export const chainWords = (anchor: PageAnchor): string | null => {
  const { chain, sheet } = anchor;
  if (!chain?.length) {
    return null;
  }
  return chain
    .map((link, i) => {
      const story = sheet && i === chain.length - 1 ? "story " : "";
      return `${story}${link.component} (${link.file}:${link.line}:${link.column})`;
    })
    .join(" › ");
};

/** A comment, reply or answer turned away because the artifact's comments hold `held` of `most` bytes. */
export const commentsFull = (
  held: number,
  most: number,
  what: "reply" | "answer" | "page"
): string =>
  `This page's comments hold ${held.toLocaleString("en-US")} of ${most.toLocaleString("en-US")} bytes, so ${what === "page" ? "they hold no more" : `the ${what} wasn't kept`}. Resolve or delete a comment, then try again.`;

/** A delivery's line for the person's note with the comments they held and sent together. */
export const notedLine = (text: string): string =>
  `- My note with these comments: ${JSON.stringify(text)}`;

/** A delivery's line for the marks whose picture the message had no room for: its crops stop at `room`. */
export const noCropLine = (room: number, marks: string[]): string =>
  `- A message carries ${room} pictures of marks, so these marks have none: ${marks.join(", ")}.`;

/** A delivery's line for what an update changed under a comment the agent didn't answer: its element, before and after. */
export const askedAgainLine = (item: ChangedItem): string =>
  `- Your update changed ${item.element ?? "it"}${item.before === undefined ? "" : ` from ${JSON.stringify(item.before)}`} to ${JSON.stringify(item.after ?? item.label)}${item.moved ? ", and moved it" : ""}.`;

/** A delivery's line for the person's words in a pin's thread: what a probe reads them by. */
export const wroteLine = (text: string): string =>
  `- I wrote: ${JSON.stringify(text)}`;
