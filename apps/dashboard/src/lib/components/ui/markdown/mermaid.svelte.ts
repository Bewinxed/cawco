/**
 * The markdown's Mermaid diagrams: Words' own plugin
 * (`@pierre/words/mermaid`, given through `options.plugins.mermaid`) drawing
 * with the Pele this app pins, as Diagram.svelte does. Pele stays out of the
 * main chunk: `pele/lazy` is loaded the first time a source holds a mermaid
 * fence, and each diagram type the first time one of it is drawn (its own
 * chunk). Until Pele is in, a mermaid fence is code (the host's code
 * snippet).
 *
 * Words calls the plugin synchronously, so a diagram whose type is still
 * loading draws empty, and once the type is in a new plugin takes the old
 * one's place: Words compares plugins by identity and draws every diagram
 * again. While a fence is open its diagram grows with each whole line, and a
 * line that does not parse keeps the last diagram that did; an open fence
 * with no diagram yet shows nothing. A closed one that does not parse is
 * code (svelte-words hands it to the code snippet).
 *
 * Drawn as Diagram.svelte draws one: links and images off, so a reply
 * reaches no network, the direction as written, and the labels measured in
 * the face and size they are drawn in, the label role's (`type-label`), once
 * the house fonts have loaded. Its colours are the house's (design.css,
 * `[data-markdown="mermaid"]` beside `[data-slot="diagram"]`).
 */
import { fencedBlocks } from "@cawco/core/markdown-code";
import { createMermaidPlugin } from "@pierre/words/mermaid";
import type { MermaidPlugin } from "svelte-words";

type Pele = typeof import("pele/lazy");

const MERMAID = "mermaid";

/** Whether `source` holds a fence whose language is mermaid (core markdown-code.ts). */
const holdsMermaid = (source: string): boolean =>
  source.includes(MERMAID) &&
  fencedBlocks(source).some((block) => block.lang === MERMAID);

let loading: Promise<void> | undefined;
let plugin = $state<MermaidPlugin>();
/** The diagram types asked of Pele, each loaded once. */
const asked = new Set<string>();

/** The face and size of the label role, read off an unseen element that takes it. */
function labelFont(): { fontFamily: string; fontSize: number } {
  const probe = document.createElement("span");
  probe.className = "type-label";
  probe.hidden = true;
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const font = {
    fontFamily: style.fontFamily,
    fontSize: Number.parseFloat(style.fontSize),
  };
  probe.remove();
  return font;
}

function pluginOf(
  pele: Pele,
  font: { fontFamily: string; fontSize: number }
): MermaidPlugin {
  return createMermaidPlugin(
    {
      render(code, options) {
        let type: ReturnType<Pele["detectType"]>;
        try {
          type = pele.detectType(code);
        } catch {
          // Front matter Pele cannot read: its render throws the same, and
          // Words' plugin takes it as a diagram that does not parse.
          return pele.render(code, options);
        }
        if (type !== null && !pele.registered(type)) {
          if (!asked.has(type)) {
            asked.add(type);
            pele.load(type).finally(() => {
              plugin = pluginOf(pele, font);
            });
          }
          return { svg: "" };
        }
        return pele.render(code, options);
      },
    },
    { links: false, images: false, autoDirection: false, ...font }
  );
}

/**
 * The Mermaid plugin for markdown `source`: none until a source holds a
 * mermaid fence and Pele has loaded. Read reactively, so the markdown draws
 * its diagrams once it is in.
 */
export function mermaidFor(source: string): MermaidPlugin | undefined {
  if (loading === undefined && holdsMermaid(source)) {
    loading = Promise.all([import("pele/lazy"), document.fonts.ready]).then(
      ([pele]) => {
        plugin = pluginOf(pele, labelFont());
      }
    );
  }
  return plugin;
}
