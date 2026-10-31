/**
 * What the host page knows beside its program: the person's picks and the
 * time of their last Send as the overlay's bridge hears them
 * (`window.cawco`), the files its Images show with their sizes, and the
 * artifacts its Canvas and Preview pieces show, as the hub served them
 * (hub decision-program.ts `programHost`, preview.ts `servePage`).
 */
import type { ChoiceEntry } from "@cawco/core/choices";
import { PICTURES_TAG, type PictureSize } from "@cawco/core/decisions-library";
import type { CanvasShapes } from "@cawco/core/stage";
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { MediaArtifactSchema } from "#lib/cawco/stored-shapes.js";

/**
 * Who hears a media well's real width (Well.svelte `picture`: its piece's
 * own width at 1 CSS px per px, null once it has none or is gone), by the
 * well's own key: the card it stands in and the page.
 */
export type MediaWidths = (key: object, width: number | null) => void;
/** The context a well finds its hearer under (Decisions, Decision and Option set it). */
export const MEDIA_WIDTHS = "decision-media-widths";

/** Who hears a picture's width over its height (Image.svelte), by the picture's own key, null once it is gone: the Row it stands in. */
export type PictureRatios = (key: object, ratio: number | null) => void;
/** The context a picture finds its Row's ear under (Row sets it; Column clears it). */
export const PICTURE_RATIOS = "decision-picture-ratios";

/** Wells' real widths heard, each passed on to `on` (the page, from a card); the widest of them, 0 with none. */
export function hearWidths(on?: MediaWidths): {
  hear: MediaWidths;
  widest: () => number;
} {
  const heard = new SvelteMap<object, number>();
  return {
    hear: (key, width) => {
      if (width === null) {
        heard.delete(key);
      } else {
        heard.set(key, width);
      }
      on?.(key, width);
    },
    widest: () => Math.max(0, ...heard.values()),
  };
}

/** The picks by decision id, as the hub keeps them now. */
export const picks = $state<{ now: Record<string, ChoiceEntry> }>({ now: {} });

/** When the person last pressed Send, ISO, as the hub keeps it (its doc's `meta.sentAt`); null before. */
export const sent = $state<{ at: string | null }>({ at: null });

/** An artifact a Canvas or Preview names, as the hub has it; null when it is gone. */
export type MediaArtifact = {
  /** A dev server's preview or a sheet: the address of the origin the hub opened for it. */
  embed?: string;
  /** The version the page draws: the artifact's newest, a next version its owner's panel has not opened yet included (hub artifacts service `newestVersion`). */
  id: string;
  kind: string;
  name: string;
  /** A component canvas's shapes as embeds said them and as its stage drew its stories: a Preview's skeleton stands at them. */
  shapes?: CanvasShapes;
} | null;

export const served = $state<{
  /** Each Image's file as written, to its address beside the page. */
  files: Record<string, string>;
  media: Record<string, MediaArtifact>;
  /** Each picture's size by its address (hub page-pictures.ts): an address with none is a file no reader knew. */
  pictures: Record<string, PictureSize>;
}>({ files: {}, media: {}, pictures: {} });

const PictureSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  scale: z.number().positive(),
}) satisfies z.ZodType<PictureSize>;

/** The JSON in one of the page's script tags, as `schema`'s shape; `fallback` when it is missing, not JSON, or not that shape. */
const jsonIn = <S extends z.ZodType>(
  doc: Document,
  id: string,
  schema: S,
  fallback: z.output<S>
): z.output<S> => {
  try {
    const read = schema.safeParse(
      JSON.parse(doc.getElementById(id)?.textContent ?? "")
    );
    return read.success ? read.data : fallback;
  } catch {
    return fallback;
  }
};

/** The program in a page the hub served, its script tag's escape undone. */
export const programIn = (doc: Document): string =>
  (doc.getElementById("cawco-program")?.textContent ?? "").replaceAll(
    "<\\/",
    "</"
  );

/** What the page carries beside its program, taken in. */
export const takeServed = (doc: Document): void => {
  served.files = jsonIn(
    doc,
    "cawco-files",
    z.record(z.string(), z.string()),
    {}
  );
  served.media = jsonIn(
    doc,
    "cawco-media",
    z.record(z.string(), MediaArtifactSchema),
    {}
  );
  served.pictures = jsonIn(
    doc,
    PICTURES_TAG,
    z.record(z.string(), PictureSizeSchema),
    {}
  );
};

/** The bridge, once the overlay put it on the window; null where CawCo does not show the page. */
export interface Bridge {
  choose: (choice: string, option: string | string[] | null) => Promise<void>;
  note: (choice: string, text: string) => Promise<void>;
  on: {
    (
      event: "picks",
      listener: (picks: Record<string, ChoiceEntry>) => void
    ): () => void;
    (event: "sent", listener: (sentAt: string | null) => void): () => void;
  };
  /** `control` names what the person pressed: the hub's journal says it. */
  send: (text?: string, control?: "page-send" | "page-key") => Promise<void>;
  set: (key: string, value: unknown) => Promise<void>;
}

export const bridge = (): Bridge | null =>
  (window as unknown as { cawco?: Bridge }).cawco ?? null;

/** This page's artifact id and the overlay's served hash, from the overlay's tag. */
export const overlayTag = (): { artifact: string | null; hash: string } => {
  const tag = document.querySelector<HTMLScriptElement>(
    'script[src^="/__cawco/overlay.js"]'
  );
  return {
    artifact: tag?.dataset.artifact ?? null,
    hash: tag?.dataset.pageHash ?? "",
  };
};
