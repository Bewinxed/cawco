/**
 * Each account provider's mark, as SVG source (unplugin-icons' `?raw`), and
 * the two ways Accounts draws it: the logo as it ships, and one silhouette
 * in a single ink (an account's tile tints it in the account's hue).
 *
 * The silhouette is a luminance mask built from the mark: every shape it
 * paints becomes white (shown), and a white shape over a coloured one (the
 * K cut out of Kimi's square, Groq's ring) becomes black, so it stays a
 * hole instead of filling in. A mark drawn in one dark or plain ink (OpenAI,
 * OpenRouter, Grok) has no colour of its own to keep, so its logo is that
 * silhouette in `--ink-strong`, and follows the theme.
 *
 * A provider nobody draws a mark for here has none: its tile carries the
 * accounts glyph.
 */
import cerebras from "~icons/logos/cerebras-icon?raw";
import claude from "~icons/logos/claude-icon?raw";
import huggingface from "~icons/logos/hugging-face-icon?raw";
import perplexity from "~icons/logos/perplexity-icon?raw";
import together from "~icons/logos/togetherai-icon?raw";
import baseten from "~icons/thesvg-color/baseten?raw";
import bedrock from "~icons/thesvg-color/bedrock-aws?raw";
import cloudflare from "~icons/thesvg-color/cloudflare?raw";
import deepseek from "~icons/thesvg-color/deepseek?raw";
import fireworks from "~icons/thesvg-color/fireworks?raw";
import copilot from "~icons/thesvg-color/github-copilot-light?raw";
import gemini from "~icons/thesvg-color/google-gemini?raw";
import grok from "~icons/thesvg-color/grok-light?raw";
import groq from "~icons/thesvg-color/groq?raw";
import kimi from "~icons/thesvg-color/kimi?raw";
import meta from "~icons/thesvg-color/metaai?raw";
import minimax from "~icons/thesvg-color/minimax?raw";
import mistral from "~icons/thesvg-color/mistral?raw";
import moonshot from "~icons/thesvg-color/moonshot?raw";
import nvidia from "~icons/thesvg-color/nvidia-light?raw";
import openai from "~icons/thesvg-color/openai-light?raw";
import opencode from "~icons/thesvg-color/opencode?raw";
import openrouter from "~icons/thesvg-color/openrouter-light?raw";
import qwen from "~icons/thesvg-color/qwen-light?raw";
import vercel from "~icons/thesvg-color/vercel-light?raw";
import xiaomi from "~icons/thesvg-color/xiaomi?raw";
import zhipu from "~icons/thesvg-color/zhipu?raw";

/** `?raw` answers the SVG's source; the icons' own module types name a component. */
const svg = (source: unknown): string => source as string;

/** Account provider id (pi-ai's, or OpenCode's own) → its mark's source. */
const SOURCES: Record<string, string> = {
  anthropic: svg(claude),
  "openai-codex": svg(openai),
  openai: svg(openai),
  "azure-openai-responses": svg(openai),
  "github-copilot": svg(copilot),
  openrouter: svg(openrouter),
  zai: svg(zhipu),
  "zai-coding-cn": svg(zhipu),
  "zai-coding-plan": svg(zhipu),
  xai: svg(grok),
  groq: svg(groq),
  cerebras: svg(cerebras),
  google: svg(gemini),
  "google-vertex": svg(gemini),
  "google-gemini-cli": svg(gemini),
  mistral: svg(mistral),
  deepseek: svg(deepseek),
  "kimi-coding": svg(kimi),
  moonshotai: svg(moonshot),
  "moonshotai-cn": svg(moonshot),
  minimax: svg(minimax),
  "minimax-cn": svg(minimax),
  fireworks: svg(fireworks),
  together: svg(together),
  "vercel-ai-gateway": svg(vercel),
  "amazon-bedrock": svg(bedrock),
  opencode: svg(opencode),
  "opencode-go": svg(opencode),
  huggingface: svg(huggingface),
  nvidia: svg(nvidia),
  "qwen-token-plan": svg(qwen),
  "qwen-token-plan-cn": svg(qwen),
  "qwen-token-plan-individual": svg(qwen),
  meta: svg(meta),
  perplexity: svg(perplexity),
  baseten: svg(baseten),
  "cloudflare-workers-ai": svg(cloudflare),
  "cloudflare-ai-gateway": svg(cloudflare),
  xiaomi: svg(xiaomi),
  "xiaomi-token-plan-cn": svg(xiaomi),
  "xiaomi-token-plan-ams": svg(xiaomi),
  "xiaomi-token-plan-sgp": svg(xiaomi),
};

/** A mark, read once: its box, what it paints, and how it is drawn. */
export interface Mark {
  /** The logo as it ships, sized to its box; null when it is drawn in one ink. */
  logo: string | null;
  /** The silhouette as a CSS mask image. */
  mask: string;
}

const PAINT = /(fill|stroke|stop-color)="([^"]+)"/g;
const HEX = /^[\da-f]{3}$|^[\da-f]{6}$/i;
const HEX6 = /^[\da-f]{6}$/i;
const SVG_PARTS = /<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/;
const BOX_SPLIT = /[\s,]+/;

/** A colour's lightness, 0 to 1, for the hex and named inks marks use. */
function lightness(colour: string): number | null {
  const named: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    gold: "#ffd700",
  };
  const hex = (named[colour.toLowerCase()] ?? colour).replace("#", "");
  if (!HEX.test(hex)) {
    return null;
  }
  const full =
    hex.length === 3
      ? [...hex].map((digit) => digit + digit).join("")
      : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(
    (at) => Number.parseInt(full.slice(at, at + 2), 16) / 255
  );
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Whether a colour is chromatic enough to be the mark's own (not ink, not paper). */
function chromatic(colour: string): boolean {
  const hex = colour.replace("#", "");
  if (!HEX6.test(hex)) {
    return colour.startsWith("url(") || colour.toLowerCase() === "gold";
  }
  const [r, g, b] = [0, 2, 4].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16)
  );
  return Math.max(r, g, b) - Math.min(r, g, b) > 40;
}

const marks = new Map<string, Mark | null>();

/** The provider's mark; null when nobody draws one for it here. */
export function markOf(provider: string): Mark | null {
  if (marks.has(provider)) {
    return marks.get(provider) ?? null;
  }
  const source = SOURCES[provider];
  const parts = source?.match(SVG_PARTS);
  if (!parts) {
    marks.set(provider, null);
    return null;
  }
  const [, box, body] = parts;
  const paints = [...body.matchAll(PAINT)]
    .map(([, , colour]) => colour)
    .filter((colour) => colour !== "none");
  const white = (colour: string) => (lightness(colour) ?? 0) > 0.92;
  /** White over something coloured is a cut-out; white alone is the ink. */
  const cuts = paints.some((colour) => !white(colour));
  const silhouette = body.replace(PAINT, (all, attr: string, colour: string) =>
    colour === "none" || attr === "stop-color"
      ? all
      : `${attr}="${cuts && white(colour) ? "#000" : "#fff"}"`
  );
  const [x, y, w, h] = box.split(BOX_SPLIT).map(Number);
  const masked = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><defs><mask id="m" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><g fill="#fff">${silhouette}</g></mask></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" mask="url(#m)"/></svg>`;
  const mark: Mark = {
    logo: paints.some(chromatic)
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="100%" height="100%">${body}</svg>`
      : null,
    mask: `url("data:image/svg+xml,${encodeURIComponent(masked)}")`,
  };
  marks.set(provider, mark);
  return mark;
}
