import type { Pin } from "@cawco/core/comments";

/** What a pin stands on, as its row and its card name it: the element's text, else its selector. */
export function pinName(pin: Pin): string {
  const { anchor } = pin;
  if (!("selector" in anchor)) {
    return `Element ${anchor.element}`;
  }
  return anchor.text?.trim() || anchor.selector;
}
