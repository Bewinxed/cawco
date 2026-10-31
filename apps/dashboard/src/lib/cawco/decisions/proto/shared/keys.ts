import type { Attachment } from "svelte/attachments";

/**
 * A surface's own keys, heard on its root while focus is anywhere inside
 * it (the digits, Command-Enter, the deck's arrows), so two prototypes on
 * one canvas never hear each other's.
 */
export const keysOn =
  (handler: (event: KeyboardEvent) => void): Attachment<HTMLElement> =>
  (node) => {
    node.addEventListener("keydown", handler);
    return () => node.removeEventListener("keydown", handler);
  };
