/**
 * Each artifact kind's Solar glyph: a page's document, a canvas's pen, a
 * preview's window, a component canvas's widgets, the browser's globe. What
 * a system line's responses row and a written link's chip mark an artifact
 * by.
 */
import type { ArtifactKind } from "@cawco/core";
import type { Component } from "svelte";
import {
  IconArtifactCanvas,
  IconArtifactPage,
  IconArtifactSheet,
  IconGlobe,
  IconWindow,
} from "#lib/icons.js";

export const ARTIFACT_GLYPHS: Record<
  ArtifactKind,
  Component<{ class?: string }>
> = {
  page: IconArtifactPage,
  canvas: IconArtifactCanvas,
  preview: IconWindow,
  component: IconArtifactSheet,
  browser: IconGlobe,
};
