/**
 * What an attached file looks like wherever it is drawn: the sent turn's
 * tile (DocThumb) and the composer's chip (AttachmentChips) read the same
 * glyph, the same size line and the same kept tail of its name.
 */
import { humanSize } from "@cawco/core/attachments";
import type { Component } from "svelte";
import {
  IconDocument,
  IconFileCode,
  IconFileLog,
  IconFileMarkdown,
  IconFileTable,
} from "#lib/icons.js";
import { extensionOf } from "../lightbox/extension";

/** "12 lines · 2.3 KB": what a text says under its name. */
export function sizeLine(content: string): string {
  const lines = content.split("\n").length;
  const bytes = new TextEncoder().encode(content).length;
  return `${lines} ${lines === 1 ? "line" : "lines"} · ${humanSize(bytes)}`;
}

/** "12 lines": what a text's chip says after its name, where a tile says its size too. */
export function linesLine(content: string): string {
  const lines = content.split("\n").length;
  return `${lines} ${lines === 1 ? "line" : "lines"}`;
}

/** The tail of a name that always stays in view: its last characters and extension. */
export const TAIL = 8;

/** A name as a head that gives way inside and the tail that always shows. */
export function nameParts(name: string): { head: string; tail: string } {
  const cut = Math.max(0, name.length - TAIL);
  return { head: name.slice(0, cut), tail: name.slice(cut) };
}

/** The kind's glyph, by the file's extension; a document for any other. */
export function glyphOf(name: string): Component {
  return (
    (
      {
        md: IconFileMarkdown,
        markdown: IconFileMarkdown,
        json: IconFileCode,
        csv: IconFileTable,
        log: IconFileLog,
      } as Record<string, Component>
    )[extensionOf(name)] ?? IconDocument
  );
}
