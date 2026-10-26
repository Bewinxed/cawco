/** Each artifact kind's glyph, as Files, Go to and an artifact's chips draw it. */
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import type { Component } from "svelte";
import {
  IconArtifactCanvas,
  IconArtifactPage,
  IconArtifactSheet,
  IconGlobe,
  IconWindow,
} from "#lib/icons.js";

export const ARTIFACT_GLYPH: Record<ArtifactKind, Component> = {
  page: IconArtifactPage,
  canvas: IconArtifactCanvas,
  preview: IconWindow,
  component: IconArtifactSheet,
  browser: IconGlobe,
};
