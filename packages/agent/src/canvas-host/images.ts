/// <reference lib="dom" />

/**
 * Images on the canvas (DESIGN.md, Artifact panel, canvas and ink): a PNG,
 * JPEG, WebP, SVG or GIF of at most 4 MB (Excalidraw's own ceiling), pasted
 * or dropped (Excalidraw places it at the pointer) or picked from the rail's
 * Image box (placed at the middle of the view, as Excalidraw's own picker
 * places it). The file goes into the doc's `files`, which y-excalidraw
 * syncs as the binding's assets (scene.ts), so every screen and the hub
 * hold it. Any other file is refused before Excalidraw sees it, with the
 * sentence the canvas shows over its grid.
 */
import { CANVAS_IMAGE_TYPES, CANVAS_LIMITS } from "@cawco/core/canvas";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const MB = 1024 * 1024;

/** What the picker offers: the types the canvas takes. */
export const IMAGE_ACCEPT = Object.keys(CANVAS_IMAGE_TYPES).join(",");

/** The names the type refusal lists, in order: "PNG, JPEG, WebP, SVG or GIF". */
const named = (() => {
  const names = Object.values(CANVAS_IMAGE_TYPES);
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
})();

/** The file's size, rounded up to a tenth of a MB, so a file over the limit never reads as at it. */
const sizeOf = (bytes: number) => `${Math.ceil((bytes / MB) * 10) / 10} MB`;

/** What a file not in the list is called in its refusal: its extension, else its type. */
const kindOf = (file: File) => {
  const ext = file.name.includes(".") ? file.name.split(".").at(-1) : "";
  if (ext) {
    return `A .${ext.toLowerCase()} file`;
  }
  return file.type ? `A ${file.type} file` : "That file";
};

/** Why the canvas won't take `file` (WORDS.md's error formula); null when it takes it. */
export const refusalOf = (file: File): string | null => {
  if (!(file.type in CANVAS_IMAGE_TYPES)) {
    return `${kindOf(file)} isn't an image the canvas takes (${named}), so it wasn't added.`;
  }
  if (file.size > CANVAS_LIMITS.imageBytes) {
    return `That image is ${sizeOf(file.size)}, and a canvas image can be ${CANVAS_LIMITS.imageBytes / MB} MB at most, so it wasn't added. Shrink it, then paste it again.`;
  }
  return null;
};

/**
 * A pasted or dropped file the canvas won't take is stopped before
 * Excalidraw's own listeners (the window's capture phase runs first) and
 * said through `refuse`; one it takes goes on to Excalidraw, which places it
 * at the pointer. Excalidraw takes the first file only, so that is the one
 * checked.
 */
export const guardImages = (refuse: (why: string) => void): (() => void) => {
  const check = (event: Event, files: FileList | undefined) => {
    const file = files?.[0];
    const why = file ? refusalOf(file) : null;
    if (why) {
      event.preventDefault();
      event.stopImmediatePropagation();
      refuse(why);
    }
  };
  const pasted = (event: ClipboardEvent) =>
    check(event, event.clipboardData?.files);
  const dropped = (event: DragEvent) => check(event, event.dataTransfer?.files);
  window.addEventListener("paste", pasted, true);
  window.addEventListener("drop", dropped, true);
  return () => {
    window.removeEventListener("paste", pasted, true);
    window.removeEventListener("drop", dropped, true);
  };
};

const readURL = (file: File) =>
  new Promise<DataURL>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result as DataURL);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(file);
  });

/** A file's id in the doc's `files`: 40 hex digits, as Excalidraw's own are. */
const newFileId = () =>
  [...crypto.getRandomValues(new Uint8Array(20))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("") as FileId;

/**
 * A picked image placed on the canvas, the image element and its file
 * together: centred in the view, as tall as it is up to half the view (and
 * never past the view less 120px), as Excalidraw sizes one it inserts
 * (`initializeImageDimensions`); then chosen, the selection tool picked.
 */
export const placeImage = async (
  api: ExcalidrawImperativeAPI,
  file: File
): Promise<void> => {
  const dataURL = await readURL(file);
  const image = new Image();
  image.src = dataURL;
  await image.decode();
  const state = api.getAppState();
  const zoom = state.zoom.value;
  const tallest = Math.min(
    Math.max(state.height - 120, 160),
    Math.floor(state.height * 0.5) / zoom
  );
  const height = Math.min(image.naturalHeight, tallest);
  const width = height * (image.naturalWidth / image.naturalHeight);
  const middle = {
    x: state.width / 2 / zoom - state.scrollX,
    y: state.height / 2 / zoom - state.scrollY,
  };
  const id = newFileId();
  api.addFiles([
    {
      id,
      dataURL,
      mimeType: file.type as BinaryFileData["mimeType"],
      created: Date.now(),
    },
  ]);
  const [element] = convertToExcalidrawElements([
    {
      type: "image",
      fileId: id,
      x: middle.x - width / 2,
      y: middle.y - height / 2,
      width,
      height,
    },
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
};
