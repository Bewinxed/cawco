/**
 * Fixture for the design graph: where a story's blocks read their media
 * (views/openui/block-media.ts), in place of a session's machine, folder
 * and artifacts: each file the story names by the address the stage serves
 * it from, and its page artifacts by name, each framed from its own
 * address. A picture opens in the Lightbox, which a story doesn't mount.
 */
import type { ArtifactSummary } from "@cawco/core/protocol";
import { lightbox } from "../lightbox/lightbox-state.svelte";
import type { BlockSources } from "../views/openui/block-media";

/** A page artifact a story's conversation made: its name, its title, and where its HTML is served. */
export interface FixturePage {
  name: string;
  src: string;
  /** Its last picture, for its still. */
  still?: string;
  title: string;
}

export const fixtureSources = (
  files: () => Record<string, string>,
  pages: () => readonly FixturePage[]
): BlockSources => {
  const summary = (page: FixturePage): ArtifactSummary =>
    ({
      id: `artifact-${page.name}`,
      kind: "page",
      name: page.name,
      title: page.title,
      thumbnail: null,
    }) as unknown as ArtifactSummary;
  const named = (page: ArtifactSummary) =>
    pages().find((one) => one.name === page.name);
  return {
    src: (file) => files()[file] ?? null,
    open: (shots, index) => {
      lightbox.open({ kind: "image", shots, index });
    },
    pages: {
      list: () => pages().map(summary),
      frame: (page) => {
        const found = named(page);
        return Promise.resolve(
          found
            ? { origin: location.origin, src: found.src }
            : { problem: `${page.name} has no address in this story.` }
        );
      },
      still: (page) => named(page)?.still ?? null,
    },
  };
};
