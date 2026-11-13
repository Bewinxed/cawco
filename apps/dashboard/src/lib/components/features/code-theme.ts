/**
 * The one syntax theme every code surface paints with: a transcript's code
 * well (tool-cards/agent-code.ts) and a diff (@pierre/diffs, DiffView and
 * DiffModal). It is a Zed-format theme in Highlights' CSS-palette form, so a
 * token's colour is a reference (`var(--code-syntax-token-keyword)`), never a
 * value; design.css points each of those variables at a house code token
 * (DESIGN.md: "Syntax colours code blocks and diffs"), and those carry both
 * appearances through light-dark(). Changing theme therefore repaints without
 * tokenizing a line again, and a diff's shadow root reads the same variables,
 * since custom properties inherit into it. Light and dark are one theme.
 */
import type { Theme } from "@pierre/highlights";

export const CODE_THEME = "cawco-code";

const CODE_VARIABLE_PREFIX = "--code-syntax-";

/**
 * Which variable each Zed syntax scope reads, by the suffix after the prefix.
 * The scopes and their roles are @pierre/diffs' own CSS-variables mapping
 * (createCSSVariablesTheme), so the diff and the transcript colour a token
 * alike.
 */
export const codeTheme: Theme = {
  name: CODE_THEME,
  appearance: "dark",
  cssVariables: { prefix: CODE_VARIABLE_PREFIX },
  style: {
    "editor.foreground": "foreground",
    "editor.background": "background",
    syntax: {
      comment: "token-comment",
      string: "token-string-expression",
      "string.escape": "token-constant",
      "text.literal": "token-string",
      keyword: "token-keyword",
      operator: "token-keyword",
      preproc: "token-keyword",
      boolean: "token-constant",
      number: "token-constant",
      constant: "token-constant",
      property: "token-constant",
      "property.json_key": "token-keyword",
      "variable.special": "token-constant",
      "variable.parameter": "token-parameter",
      function: "token-function",
      constructor: "token-function",
      type: "token-function",
      attribute: "token-function",
      tag: "token-string-expression",
      punctuation: "token-punctuation",
      link_text: "token-link",
      link_uri: "token-link",
    },
  },
};
