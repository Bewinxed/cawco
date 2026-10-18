/**
 * What the host page knows beside its program: the person's picks as the
 * overlay's bridge hears them (`window.cawco`), the files its Images show and
 * the artifacts its Canvas and Preview pieces show, as the hub served them
 * (hub decision-program.ts `programHost`, preview.ts `servePage`).
 */
import type { ChoiceEntry } from "@cawco/core/choices";

/** The picks by decision id, as the hub keeps them now. */
export const picks = $state<{ now: Record<string, ChoiceEntry> }>({ now: {} });

/** An artifact a Canvas or Preview names, as the hub has it; null when it is gone. */
export type MediaArtifact = {
  /** A dev server's preview or a sheet: the address of the origin the hub opened for it. */
  embed?: string;
  kind: string;
  name: string;
} | null;

export const served = $state<{
  /** Each Image's file as written, to its address beside the page. */
  files: Record<string, string>;
  media: Record<string, MediaArtifact>;
}>({ files: {}, media: {} });

/** The JSON in one of the page's script tags; `fallback` when it is missing or not JSON. */
export const jsonIn = <T>(doc: Document, id: string, fallback: T): T => {
  try {
    return JSON.parse(doc.getElementById(id)?.textContent ?? "") as T;
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
  served.files = jsonIn(doc, "cawco-files", {});
  served.media = jsonIn(doc, "cawco-media", {});
};

/** The bridge, once the overlay put it on the window; null where CawCo does not show the page. */
export interface Bridge {
  choose: (choice: string, option: string | string[] | null) => Promise<void>;
  note: (choice: string, text: string) => Promise<void>;
  on: (
    event: "picks",
    listener: (picks: Record<string, ChoiceEntry>) => void
  ) => () => void;
  send: (text?: string) => Promise<void>;
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
