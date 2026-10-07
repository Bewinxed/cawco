import type { PreviewElement, SendPayload } from "@cawco/core";

export const NOTE_MAX = 500;

export interface CapturedSelection {
  /**
   * The overlay's pick id while the element's screenshot is still being
   * drawn; null once it has arrived or failed.
   */
  capturing: string | null;
  element: PreviewElement;
  note: string;
  png: string | null;
  scale: number;
}

export interface PendingSelection extends CapturedSelection {
  id: string;
}

/**
 * The key a picked element travels under (motion/share.svelte.ts): from its
 * box in the preview to its chip in the composer.
 */
export function selectionShare(element: PreviewElement): string {
  return `selection:${element.url}:${element.selector}`;
}

export function selectionLabel(element: PreviewElement): string {
  return `${element.tag}${element.id ? `#${element.id}` : ""}${element.classes.length ? `.${element.classes[0]}` : ""}`;
}

export function selectionExtras({
  selections,
  ...extras
}: Pick<SendPayload, "attachments" | "images"> & {
  selections?: PendingSelection[];
} = {}): Pick<SendPayload, "attachments" | "images"> {
  if (!selections?.length) {
    return extras;
  }
  const sections = selections.map(({ element: el, note }, index) => {
    const boundedNote = note.slice(0, NOTE_MAX);
    const metadata = el.source;
    const location = metadata?.file
      ? `${metadata.file}:${metadata.line ?? "?"}:${metadata.column ?? "?"} (${metadata.framework}, ${metadata.of})`
      : `unknown (the app exposes no dev source metadata)${metadata?.component ? `; component: ${metadata.component} (${metadata.framework}, ${metadata.of})` : ""}`;
    const style = el.styles;
    // A longer fence keeps captured page HTML inside its code block.
    const fence = "`".repeat(
      Math.max(
        3,
        ...Array.from(el.html.matchAll(/`+/g), ([match]) => match.length + 1)
      )
    );
    return `## ${index + 1}. ${el.selector}\n${boundedNote ? `- note: ${JSON.stringify(boundedNote)}\n` : ""}- source: ${location}\n- url: ${el.url}\n- size: ${el.rect.width}x${el.rect.height} at (${el.page.x},${el.page.y}) in the page\n- text: ${JSON.stringify(el.text)}\n- styles: color ${style.color}; background ${style.backgroundColor}; font ${style.fontFamily} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}\n\n${fence}html\n${el.html}\n${fence}`;
  });
  return {
    attachments: [
      ...(extras.attachments ?? []),
      {
        kind: "text",
        name: "selection.md",
        content: `# Selected in the preview (${selections[0].element.url})\n\n${sections.join("\n\n")}`,
      },
    ],
    images: [
      ...(extras.images ?? []),
      ...selections.flatMap(({ png }) =>
        png ? [{ mediaType: "image/png", data: png }] : []
      ),
    ],
  };
}
