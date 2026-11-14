/**
 * What an agent's block reads its pictures, clips, sounds and pages
 * through (tsk-330), set by where the block is drawn:
 * - in a reply (TranscriptBlock), a file from the session's machine or its
 *   project's folder as the hub serves it (transcript/block-sources.ts),
 *   pictures opening in the dashboard's Lightbox, and a Preview framing a
 *   page artifact of the conversation;
 * - once kept as a page (decisions/host/Host.svelte), each file the hub
 *   copied beside the page, pictures opening in the house's PhotoSwipe.
 *
 * InlineBlock lays `still` over what the reply gives: a replaced block's
 * clips, sounds and pages stand as stills, so a transcript of replaced
 * blocks holds no live player or frame.
 */
import type { ArtifactSummary } from "@cawco/core/protocol";
import { getContext, setContext } from "svelte";
import type { ServedFile } from "#lib/platform/hub-file.js";
import { answerOf } from "#lib/platform/hub-read.js";

/** A drawn picture, as it opens full size: out of and back into its box. */
interface BlockShot {
  alt: string;
  caption?: string;
  element: HTMLElement;
  height: number;
  src: string;
  width: number;
}

/** A conversation's page artifacts, as a reply's Preview finds one by its name and frames it. */
interface BlockPages {
  /** Where `page` is loaded from, with the origin its frame's words are heard from; or why it can't be. */
  frame: (
    page: ArtifactSummary
  ) => Promise<{ origin: string; src: string } | { problem: string }>;
  /** Its artifacts as read; undefined while they are read. */
  list: () => readonly ArtifactSummary[] | undefined;
  /** The page's last picture, its still once its block is replaced; null when none was taken. */
  still: (page: ArtifactSummary) => string | null;
}

/** Where a block's media come from where it is drawn. */
export interface BlockSources {
  /** Opens `shots` full size, at `index`. */
  open: (shots: BlockShot[], index: number) => void;
  /** A reply's pages: none where a Preview is the host's own (a kept block). */
  pages?: BlockPages;
  /** Where `file` is served, and its read; null when it names none a block may show. */
  src: (file: string) => ServedFile | null;
}

/** A block's media sources, with whether the block was replaced. */
export interface BlockMedia extends BlockSources {
  /** Replaced: clips, sounds and pages stand as stills, nothing live. */
  readonly still: boolean;
}

const SOURCES = Symbol("block-sources");
const MEDIA = Symbol("block-media");

/** The sources the blocks drawn under this component read (a transcript, a fixture). */
export const provideBlockSources = (sources: BlockSources): void => {
  setContext(SOURCES, sources);
};

export const blockSourcesHere = (): BlockSources | undefined =>
  getContext<BlockSources | undefined>(SOURCES);

/** The media a block's components read: InlineBlock's, the host page's. */
export const provideBlockMedia = (media: BlockMedia): void => {
  setContext(MEDIA, media);
};

/** Where nothing provides any: no file is shown, each says so where it would stand. */
const NONE: BlockMedia = {
  src: () => null,
  open: () => undefined,
  still: false,
};

export const blockMediaHere = (): BlockMedia =>
  getContext<BlockMedia | undefined>(MEDIA) ?? NONE;

/**
 * A file served at an address the page was handed rather than built from a
 * hub route (a kept page's file beside it, a story's stage), read as Eden's
 * client would hand its answer back (hub-read `answerOf`).
 */
export const fileAt = (href: string): ServedFile => ({
  href,
  ask: async () => await answerOf(await fetch(href)),
});

/** A file a block's piece names, as it draws it: its name, its caption, and where it is served (null: none it may show). */
export const namedFile = (
  media: BlockMedia,
  file: unknown,
  caption: unknown
): {
  caption: string;
  file: string;
  name: string;
  source: ServedFile | null;
} => {
  const named = String(file ?? "");
  return {
    file: named,
    name: named.split("/").at(-1) ?? named,
    caption: caption ? String(caption) : "",
    source: media.src(named),
  };
};

/**
 * The frame each clip last showed, as a picture, by its address: taken
 * while its block was live, it stands as the clip's still once the block
 * is replaced (BlockVideo).
 */
export const clipStills = new Map<string, string>();
