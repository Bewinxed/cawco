/**
 * The proxy's own page for a hop that did not answer ({@link downPage}),
 * drawn as the dashboard draws every frame's down state (dashboard
 * FrameDown.svelte): the kit's empty state (DESIGN.md, Empty states; the
 * dashboard's empty-state.svelte) on the well's ground, a Solar duotone mark,
 * the title in the title role, the line in muted body, Try again, and the
 * machine's own words under Show details. It is served from a preview's own
 * origin, which holds none of the dashboard's CSS, so the values it needs
 * stand here as the dashboard's tokens hold them (apps/dashboard
 * src/lib/tokens/theme.css), each scheme by `light-dark()` under the
 * reader's `prefers-color-scheme` (`color-scheme: light dark`). A frame that
 * hears its `cawco:down` draws its own state over it; read in a tab of its
 * own, or in a frame that did not hear it yet, it is that state itself.
 */

import {
  PREVIEW_DOWN_META,
  PREVIEW_WHY_META,
  type PreviewDown,
} from "@cawco/core/preview/protocol";
import { commonWords } from "@cawco/core/words/common";
import { downState } from "@cawco/core/words/preview-down";
import { shellWords } from "@cawco/core/words/shell";

export const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (text: string): string =>
  text.replaceAll(/[&"<>]/gu, (char) => HTML_ESCAPES[char] ?? char);

/** Solar's duotone marks (@iconify-json/solar), as the dashboard's down state picks them: the archive for a version that can't come back, the exclamation mark for the rest. */
const MARKS = {
  gone: '<path fill="currentColor" d="M12 2c4.713 0 7.07 0 8.535 1.464c.757.758 1.123 1.754 1.3 3.192V10H2.164V6.656c.176-1.438.541-2.434 1.299-3.192C4.928 2 7.285 2 11.999 2" opacity=".5"/><path fill="currentColor" fill-rule="evenodd" d="M2 14c0-2.8 0-4.2.545-5.27A5 5 0 0 1 4.73 6.545C5.8 6 7.2 6 10 6h4c2.8 0 4.2 0 5.27.545a5 5 0 0 1 2.185 2.185C22 9.8 22 11.2 22 14s0 4.2-.545 5.27a5 5 0 0 1-2.185 2.185C18.2 22 16.8 22 14 22h-4c-2.8 0-4.2 0-5.27-.545a5 5 0 0 1-2.185-2.185C2 18.2 2 16.8 2 14m10.75-3a.75.75 0 0 0-1.5 0v4.19l-1.22-1.22a.75.75 0 1 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 1 0-1.06-1.06l-1.22 1.22z" clip-rule="evenodd"/>',
  alert:
    '<g fill="currentColor"><path d="M11.25 15.333V2C11.25 1.58579 11.5858 1.25 12 1.25C12.4142 1.25 12.75 1.58579 12.75 2V15.333C12.75 15.7472 12.4142 16.083 12 16.083C11.5858 16.083 11.25 15.7472 11.25 15.333Z" opacity=".5"/><path d="M12 21.25C12.4142 21.25 12.75 21.5858 12.75 22C12.75 22.4142 12.4142 22.75 12 22.75C11.5858 22.75 11.25 22.4142 11.25 22C11.25 21.5858 11.5858 21.25 12 21.25Z"/></g>',
} as const;

/**
 * The dashboard's values the page draws with (theme.css): the warm neutral
 * ramp's steps it reads, the well's ground, the inks, the outline button's
 * edge and hover, the focus ring, the type roles and the house spacing.
 */
const STYLE = `
:root{color-scheme:light dark;
--n1:light-dark(oklch(99.3% 0.004 85),oklch(18.4% 0.004 70));
--n3:light-dark(oklch(94.4% 0.01 84),oklch(24.8% 0.006 70));
--n4:light-dark(oklch(92% 0.011 83),oklch(28.2% 0.007 70));
--n8:light-dark(oklch(73.5% 0.017 78),oklch(48.8% 0.012 74));
--n9:oklch(52% 0.016 76);
--n11:light-dark(oklch(49.5% 0.014 74),oklch(77.8% 0.012 78));
--n12:light-dark(oklch(29.5% 0.01 70),oklch(93.4% 0.01 82));
--well:light-dark(oklch(96.7% 0.008 84),var(--n1));
--raised:light-dark(var(--n1),var(--n3));
--hover:var(--n4);
--edge:light-dark(color-mix(in oklab,var(--n8),var(--n9) 50%),color-mix(in oklab,var(--n9),var(--n11) 10%));
--focus:light-dark(oklch(55% 0.165 33),oklch(76% 0.12 34));
--sans:"Figtree Variable",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
--mono:"JetBrains Mono Variable",ui-monospace,"SF Mono",monospace;
--s1:4px;--s2:7px;--s3:11px;--s6:21px}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-block-size:100%}
body{background:var(--well);color:var(--n12);font:400 0.875rem/1.5 var(--sans);-webkit-font-smoothing:antialiased;padding-inline:var(--s6)}
[data-slot=empty]{display:flex;flex-direction:column;align-items:flex-start;gap:var(--s2);padding-block:var(--s6);max-inline-size:60ch;min-inline-size:0}
svg{inline-size:20px;block-size:20px;flex:none;color:var(--n11);margin-block-end:var(--s1)}
h1{margin:0;font:500 clamp(1.125rem,1.048rem + 0.3155vi,1.25rem)/1.25 var(--sans);letter-spacing:-0.01em;text-wrap:balance;overflow-wrap:anywhere}
p{margin:0;color:var(--n11);text-wrap:pretty;overflow-wrap:anywhere}
[data-box]{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s2);margin-block-start:var(--s2);inline-size:100%;min-inline-size:0}
button{display:inline-flex;align-items:center;block-size:30px;padding-inline:var(--s3);border-radius:10px;font:500 0.8125rem/1.4 var(--sans);letter-spacing:-0.01em;color:var(--n12);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;transition-property:background-color,scale;transition-duration:150ms;transition-timing-function:ease-out}
button{border:1px solid var(--edge);background:var(--raised)}
[data-details]{border-color:transparent;background:transparent;color:var(--n11)}
@media (hover:hover){button:hover{background:var(--hover)}}
@media (prefers-reduced-motion:no-preference){button:active{scale:0.96}}
button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
pre[hidden]{display:none}
pre{flex-basis:100%;margin:var(--s1) 0 0;max-block-size:12rem;overflow:auto;overscroll-behavior:contain;padding:var(--s1) var(--s3);border:1px solid light-dark(color-mix(in oklab,var(--n4) 34%,var(--n3)),oklch(35.4% 0.009 70));border-radius:7px;background:var(--raised);color:var(--n11);font:400 0.75rem/1.6 var(--mono);font-variant-ligatures:none;white-space:pre-wrap;overflow-wrap:anywhere}
`.replaceAll("\n", "");

/**
 * The page for hop `down`: its kind and the machine's words (`why`) in its
 * meta for a reader on no page (core `downOf`), its title from the shared
 * down state (core `downState`), `words` its sentence (the hop's
 * `DOWN_WORDS`, or its sender's own), `why` under Show details, Try again a
 * reload, and both posted to its parent as `cawco:down` for a frame that
 * draws its own state over it.
 */
export function downPage(
  down: PreviewDown,
  why: string | undefined,
  words: string
): string {
  const { title } = downState(down, why ?? null);
  const said = why
    ? `<meta name="${PREVIEW_WHY_META}" content="${escapeHtml(why)}">`
    : "";
  const details = why
    ? `<button type="button" data-details aria-expanded="false" aria-controls="details">${escapeHtml(shellWords.showDetails)}</button><pre id="details" hidden>${escapeHtml(why)}</pre>`
    : "";
  // `<` as its escape, so nothing in `why` can close the script.
  const message = JSON.stringify({
    type: "cawco:down",
    down,
    why: why ?? null,
  }).replaceAll("<", "\\u003c");
  const toggle = JSON.stringify([
    shellWords.showDetails,
    shellWords.hideDetails,
  ]).replaceAll("<", "\\u003c");
  // Try again loads the page afresh; Show details opens the machine's words under the actions, its label turning to Hide details.
  const script = `<script>document.querySelector("[data-again]").addEventListener("click",()=>location.reload());const d=document.querySelector("[data-details]");if(d){const w=${toggle},p=document.getElementById("details");d.addEventListener("click",()=>{const o=p.hidden;p.hidden=!o;d.setAttribute("aria-expanded",String(o));d.textContent=w[o?1:0]})}if(window.parent!==window)window.parent.postMessage(${message},"*")</script>`;
  const mark = down === "gone" ? MARKS.gone : MARKS.alert;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="${PREVIEW_DOWN_META}" content="${down}">${said}<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main data-slot="empty" data-down="${down}" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true">${mark}</svg><h1>${escapeHtml(title)}</h1><p>${escapeHtml(words)}</p><div data-box><button type="button" data-again>${escapeHtml(commonWords.tryAgain)}</button>${details}</div></main>${script}</body></html>`;
}
