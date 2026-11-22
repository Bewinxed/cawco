/**
 * Colour for every code surface in the console, ported from beui.dev's
 * agent-code, on @pierre/highlights. The module is one WebAssembly file that
 * loads with the first block that needs it, never with the page; once loaded,
 * tokenizing is synchronous, so a block paints on the frame it has its text
 * and a growing block is tokenized again whole (a stream tokenizer would hold
 * back the last, unfinished line, which is the line a stream is writing). The
 * house code theme (core code-theme.ts) paints tokens as references to the house
 * syntax tokens, so changing theme repaints without tokenizing again.
 */

import { codeTheme } from "@cawco/core/code-theme";
import type { codeToTokens as CodeToTokens, Lang } from "@pierre/highlights";

interface AgentCodeToken {
  /** A `var(--code-syntax-*)` reference (core code-theme.ts), resolved by CSS. */
  color?: string;
  content: string;
  offset: number;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

/** The module, once loaded; code is plain until then. */
let loaded: {
  codeToTokens: typeof CodeToTokens;
  isSupportedLanguage: (lang: string) => lang is Lang;
} | null = null;
let loading: Promise<void> | null = null;

/** Highlights arrives with the first block that needs it, never with the page. */
export function loadHighlights(): Promise<void> {
  loading ??= import("@pierre/highlights").then((module) => {
    loaded = module;
  });
  return loading;
}

export const highlightsLoaded = (): boolean => loaded !== null;

/** Words a fence uses for a grammar that Highlights names otherwise. */
const ALIASES: Record<string, string> = {
  console: "bash",
  terminal: "bash",
};

/**
 * The language a fence's tag or a caller's word names, or null: a tag
 * Highlights has no lexer for stays plain text. Null too until it has loaded.
 */
export function agentCodeLanguage(tag: string | undefined | null): Lang | null {
  const word = tag?.trim().toLowerCase();
  if (!(word && loaded)) {
    return null;
  }
  const name = ALIASES[word] ?? word;
  return loaded.isSupportedLanguage(name) ? name : null;
}

/** The lines of tokens for code in a language `agentCodeLanguage` returned. */
export function tokenize(code: string, language: Lang): AgentCodeTokenLines {
  if (!loaded) {
    throw new Error("tokenize() ran before loadHighlights() resolved");
  }
  return loaded.codeToTokens(code, { lang: language, theme: codeTheme }).tokens;
}
