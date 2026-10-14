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

/** The page's images a pasted HTML carries, as Excalidraw reads them (its `parseHTMLTree`): every `img` whose `src` is http(s). */
const imagesOf = (html: string | undefined): string[] => {
  if (!html) {
    return [];
  }
  const { body } = new DOMParser().parseFromString(html, "text/html");
  return [...body.querySelectorAll("img")]
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.startsWith("http"));
};

/** Pasted text that is one SVG, as Excalidraw reads it: `<svg`…`</svg>`, trimmed. */
const svgOf = (text: string | undefined): File | null => {
  const svg = text?.trim() ?? "";
  return svg.startsWith("<svg") && svg.endsWith("</svg>")
    ? new File([svg], "pasted.svg", { type: "image/svg+xml" })
    : null;
};

/** An image a pasted page names, fetched as Excalidraw fetches it (its `ImageURLToFile`). */
const fetchImage = async (url: string): Promise<File> => {
  const answer = await fetch(url);
  if (!answer.ok) {
    throw new Error(`${new URL(url).host} answered ${answer.status}`);
  }
  const blob = await answer.blob();
  return new File([blob], new URL(url).pathname.split("/").at(-1) ?? "", {
    type: blob.type,
  });
};

/** The gap between images a paste stacks, scene px (Excalidraw's own, `addElementsFromMixedContentPaste`). */
const STACK_GAP = 25;

/**
 * Every image a paste or a drop would make goes on the canvas here, before
 * Excalidraw's own listeners (the window's capture phase runs first):
 * a dropped or pasted file (Excalidraw takes the first only, so that is the
 * one checked); else, not a plain paste (⌘⇧V, as Excalidraw tells it), the
 * http(s) images of a pasted page, stacked down from the pointer as
 * Excalidraw stacks them, or pasted text that is one SVG. One the canvas
 * won't take is said through `refuse`. One it takes is placed by
 * `placeImage`, its file in the doc before its element, at the pointer: a
 * drop's own point, a paste's last pointer over the page. Excalidraw's own
 * paste inserts the element first and fills in its file once it has hashed,
 * resized and read it (its `insertImageElement`), so a screen or a send
 * could hold an image whose file was not there yet. A press, a key, a paste
 * or a drop first takes away the refusal standing from before.
 */
export const guardImages = (
  api: ExcalidrawImperativeAPI,
  refuse: (why: string) => void
): (() => void) => {
  let pointer: At | null = null;
  let plain = false;
  let plainTimer: ReturnType<typeof setTimeout> | undefined;
  const unread = (error: unknown) =>
    `That image couldn't be read (${error instanceof Error ? error.message : String(error)}), so it wasn't added. Paste it again.`;
  /** Each file checked, then placed in turn: the first on `at`, each next under the last. */
  const place = async (files: Promise<File>[], at: At | null) => {
    let below: { x: number; bottom: number } | null = null;
    for (const next of files) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each image stands under the one before
        const file = await next;
        const why = refusalOf(file);
        if (why) {
          refuse(why);
          continue;
        }
        below = await placeImage(
          api,
          file,
          at,
          below && { x: below.x, top: below.bottom + STACK_GAP }
        );
      } catch (error) {
        refuse(unread(error));
      }
    }
  };
  const take = (event: Event, files: Promise<File>[], at: At | null) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    place(files, at);
  };
  const pasted = (event: ClipboardEvent) => {
    dismiss();
    const data = event.clipboardData;
    if (typing(event.target)) {
      return;
    }
    const file = data?.files?.[0];
    if (file) {
      return take(event, [Promise.resolve(file)], pointer);
    }
    if (plain) {
      return;
    }
    const urls = imagesOf(data?.getData("text/html"));
    if (urls.length > 0) {
      return take(event, urls.map(fetchImage), pointer);
    }
    const svg = svgOf(data?.getData("text/plain"));
    if (svg) {
      take(event, [Promise.resolve(svg)], pointer);
    }
  };
  const dropped = (event: DragEvent) => {
    dismiss();
    const file = event.dataTransfer?.files?.[0];
    if (file && !typing(event.target)) {
      take(event, [Promise.resolve(file)], event);
    }
  };
  const moved = (event: PointerEvent) => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
  };
  // Excalidraw's plain paste: ⌘⇧V (Ctrl+Shift+V), told for the next 100 ms.
  const keyed = (event: KeyboardEvent) => {
    dismiss();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      plain = event.shiftKey;
      clearTimeout(plainTimer);
      plainTimer = setTimeout(() => {
        plain = false;
      }, 100);
    }
  };
  const listeners: [string, (event: never) => void][] = [
    ["paste", pasted],
    ["drop", dropped],
    ["pointermove", moved],
    ["pointerdown", dismiss],
    ["keydown", keyed],
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
 * the view, or, stacked under another, its top at `under.top` centred on
 * `under.x`; as tall as it is up to half the view (and never past the view
 * less 120px), as Excalidraw sizes one it inserts
 * (`initializeImageDimensions`); then chosen, the selection tool picked.
 * Answers its centre and its foot, scene px, for the next one under it.
 */
export const placeImage = async (
  api: ExcalidrawImperativeAPI,
  file: File,
  at: At | null = null,
  under: { x: number; top: number } | null = null
): Promise<{ x: number; bottom: number }> => {
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
  let middle = {
    x: state.width / 2 / zoom - state.scrollX,
    y: state.height / 2 / zoom - state.scrollY,
  };
  if (under) {
    middle = { x: under.x, y: under.top + height / 2 };
  } else if (at) {
    middle = viewportCoordsToSceneCoords(at, state);
  }
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
  return { x: middle.x, bottom: middle.y + height / 2 };
};
