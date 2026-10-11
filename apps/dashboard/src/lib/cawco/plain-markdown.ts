/**
 * Markdown as the flat text it reads as: what a peek shows of an agent's
 * reply. Lexed by the same lexer the transcript renders with (svelte-streamdown),
 * then written back out with every piece of syntax gone — emphasis as its
 * words, a heading as its text, a list item as "• text" on its own line, a
 * link as its text, inline code without its backticks, a fence as its code,
 * an image as its alt text, a table row as its cells joined by two spaces.
 * Blocks stay a blank line apart, as they were written.
 */
import { lex, parseIncompleteMarkdown } from "svelte-streamdown";

/** The token fields this reads; svelte-streamdown's union carries more. */
interface Token {
  raw?: string;
  text?: string;
  tokens?: Token[];
  type: string;
}

function inline(tokens: Token[]): string {
  let out = "";
  for (const token of tokens) {
    if (token.type === "br") {
      out += "\n";
    } else if (token.type === "math") {
      // As the transcript draws it (markdown.svelte's `math` snippet).
      out += token.raw ?? "";
    } else if (token.tokens?.length && token.type !== "image") {
      out += inline(token.tokens);
    } else {
      out += token.text ?? "";
    }
  }
  return out;
}

function blocks(tokens: Token[], depth: number): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "space":
      case "hr":
        break;
      case "code":
        out.push(token.text ?? "");
        break;
      case "list":
        out.push(items(token.tokens ?? [], depth).join("\n"));
        break;
      case "table":
        out.push(rows(token.tokens ?? []).join("\n"));
        break;
      case "paragraph":
      case "heading":
      case "text":
        out.push(token.tokens ? inline(token.tokens) : (token.text ?? ""));
        break;
      default:
        // Blockquotes, alerts and the like: their contents, flat.
        if (token.tokens) {
          out.push(...blocks(token.tokens, depth));
        } else if (token.text) {
          out.push(token.text);
        }
    }
  }
  return out;
}

/** One line per item, its nested list indented under it. */
function items(tokens: Token[], depth: number): string[] {
  const indent = "  ".repeat(depth);
  return tokens.map((item) => {
    const [head = "", ...rest] = blocks(item.tokens ?? [], depth + 1);
    return [`${indent}• ${head}`, ...rest].join("\n");
  });
}

/** A table's rows, header first: each row's cells joined by two spaces. */
function rows(tokens: Token[]): string[] {
  return tokens.flatMap((section) =>
    (section.tokens ?? []).map((row) =>
      (row.tokens ?? []).map((cell) => inline(cell.tokens ?? [])).join("  ")
    )
  );
}

/** The word a stream is still writing: whatever follows its last whitespace. */
const LAST_WORD = /\S*$/;

/** A finished reply, flat. */
export function plainMarkdown(source: string): string {
  return blocks(lex(source) as Token[], 0).join("\n\n");
}

/**
 * A reply still streaming, flat. Drawn up to its last whole word, so a marker
 * or a link still arriving ("**bo", "[lin") is held back with the word it is
 * part of; the completer closes what the drawn words leave open ("**bold
 * text" reads as "bold text" until its closer lands).
 */
export function plainStreaming(source: string): string {
  const drawn = source.slice(0, source.search(LAST_WORD));
  return plainMarkdown(parseIncompleteMarkdown(drawn.trim(), { live: true }));
}
