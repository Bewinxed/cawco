/**
 * Images on the canvas (DESIGN.md, Artifact panel, canvas and ink): a PNG,
 * JPEG, WebP, SVG or GIF of at most 4 MB (Excalidraw's own ceiling), pasted
 * or dropped (placed at the pointer) or picked from the rail's Image box
 * (placed at the middle of the view, as Excalidraw's own picker places it),
 * by one path (`placeImage`): its file goes into the doc's `files`, which
 * y-excalidraw syncs as the binding's assets (scene.ts), before its element,
 * so every screen and the hub hold the file whenever they hold the image.
 * Any other file is refused before Excalidraw sees it, with the
 * sentence the canvas shows over its grid until the person next acts on it.
 */
import { CANVAS_IMAGE_TYPES, CANVAS_LIMITS } from "@cawco/core/canvas";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
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

/** The refusal over the grid, as the host page draws it (host.tsx `Refusal`). */
const REFUSAL = ".canvas-refusal";

/**
 * The refusal standing over the grid goes when the person next acts on the
 * canvas: it is marked leaving and fades out (canvas.css), and the host
 * drops it once that fade ends. No timer takes it away.
 */
const dismiss = () => {
  const standing = document.querySelector(`${REFUSAL}:not([data-leaving])`);
  standing?.setAttribute("data-leaving", "");
};

/** A point in the page's viewport: where a pasted or dropped image lands. */
interface At {
  clientX: number;
  clientY: number;
}

/** A field the person types into: a paste there is theirs, never the canvas's. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement);

/**
 * Every pasted or dropped file is taken before Excalidraw's own listeners
 * (the window's capture phase runs first); Excalidraw takes the first file
 * only, so that is the one checked. One the canvas won't take is said
 * through `refuse`. One it takes is placed here (`placeImage`), its file in
 * the doc before its element, at the pointer: a drop's own point, a paste's
 * last pointer over the page. Excalidraw's own paste inserts the element
 * first and fills in its file once it has hashed, resized and read it (its
 * `insertImageElement`), so a screen or a send could hold an image whose
 * file was not there yet. A press, a key, a paste or a drop first takes
 * away the refusal standing from before.
 */
export const guardImages = (
  api: ExcalidrawImperativeAPI,
  refuse: (why: string) => void
): (() => void) => {
  let pointer: At | null = null;
  const take = (event: Event, files: FileList | undefined, at: At | null) => {
    dismiss();
    const file = files?.[0];
    if (!file || typing(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const why = refusalOf(file);
    if (why) {
      refuse(why);
      return;
    }
    placeImage(api, file, at).catch((error: unknown) =>
      refuse(
        `That image couldn't be read (${error instanceof Error ? error.message : String(error)}), so it wasn't added. Paste it again.`
      )
    );
  };
  const pasted = (event: ClipboardEvent) =>
    take(event, event.clipboardData?.files, pointer);
  const dropped = (event: DragEvent) =>
    take(event, event.dataTransfer?.files, event);
  const moved = (event: PointerEvent) => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
  };
  const listeners: [string, (event: never) => void][] = [
    ["paste", pasted],
    ["drop", dropped],
    ["pointermove", moved],
    ["pointerdown", dismiss],
    ["keydown", dismiss],
  ];
  for (const [type, listener] of listeners) {
    window.addEventListener(type, listener as EventListener, true);
  }
  return () => {
    for (const [type, listener] of listeners) {
      window.removeEventListener(type, listener as EventListener, true);
    }
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
 * An image placed on the canvas, its file in the doc before its element:
 * centred on `at` (a paste's or a drop's point) or, picked, on the middle of
 * the view; as tall as it is up to half the view (and never past the view
 * less 120px), as Excalidraw sizes one it inserts
 * (`initializeImageDimensions`); then chosen, the selection tool picked.
 */
export const placeImage = async (
  api: ExcalidrawImperativeAPI,
  file: File,
  at: At | null = null
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
  const middle = at
    ? viewportCoordsToSceneCoords(at, state)
    : {
        x: state.width / 2 / zoom - state.scrollX,
        y: state.height / 2 / zoom - state.scrollY,
      };
  const id = newFileId();
  // The file is in the doc before the element that shows it: the binding
  // (y-excalidraw) writes a change's elements before its files, each in a
  // transaction of its own, so the two go in two changes. Excalidraw's
  // render after `addFiles` emits the change whose files hold this one, and
  // the binding, subscribed first, writes it there; the element follows.
  const filed = new Promise<void>((done) => {
    const stop = api.onChange((_elements, _state, files) => {
      if (files[id]) {
        stop();
        done();
      }
    });
  });
  api.addFiles([
    {
      id,
      dataURL,
      mimeType: file.type as BinaryFileData["mimeType"],
      created: Date.now(),
    },
  ]);
  await filed;
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
