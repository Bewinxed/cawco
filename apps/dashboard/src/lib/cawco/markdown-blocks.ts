/**
 * What markdown draws an agent's block with (tsk-330), provided by its host:
 * a transcript hands in its block component, which reads the conversation's
 * versions itself (transcript/inline-blocks.svelte.ts). Markdown drawn with
 * none (a comment's thread, a decision page, a toast) draws every fence as
 * code, and loads nothing of the transcript's.
 */
import type { Component } from "svelte";
import { getContext, setContext } from "svelte";

/** What a block's component is given: its reply, its name, its program, and whether its fence is still open. */
export interface MarkdownBlockProps {
  /** Its reply: the message's id, or `live` while it is written. */
  at: string;
  name: string;
  source: string;
  streaming: boolean;
}

/** The reply being written, as a block's reply names it. */
export const LIVE_REPLY = "live";

const KEY = Symbol("markdown-blocks");

/** The component the markdown under this component draws a named `openui` fence with. */
export function provideMarkdownBlocks(
  Block: Component<MarkdownBlockProps>
): void {
  setContext(KEY, Block);
}

/** The block component a host above provides, or none: fences stay code. */
export const markdownBlocksHere = ():
  Component<MarkdownBlockProps> | undefined =>
  getContext<Component<MarkdownBlockProps> | undefined>(KEY);
