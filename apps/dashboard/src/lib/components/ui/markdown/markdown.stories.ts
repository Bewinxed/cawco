/**
 * The kit's Markdown (Component Story Format 3, live components), mounted as
 * itself: an agent's reply with a heading, a list, inline code and a block
 * of code. The meta's args are every story's; a story's own args are what
 * it changes.
 */
import Markdown from "./markdown.svelte";

export default {
  title: "Kit/Markdown",
  component: Markdown,
  args: {
    source: [
      "### The pairing flow is in",
      "",
      "The phone now scans the hub's code and **approves** the session from the lock screen.",
      "",
      "- `PairingScreen` draws the code at 390 and 1440",
      "- the hub keeps one token per phone",
      "- [the brief](https://example.com/brief) is updated",
      "",
      "```ts",
      'await hub.pair({ phone: "iphone-of-sam", ttl: 300 });',
      "```",
    ].join("\n"),
  },
};

/** A finished reply. */
export const Reply = {};

/** A short note of one line. */
export const OneLine = {
  args: {
    source: "Checks passed on `main`; the release is tagged **0.42.0**.",
  },
};
