/**
 * The file viewer's script (core file-viewer.ts), loaded by the viewer page
 * of a PDF: PDF.js (pdfjs-dist, as published, from the hub's own copy at
 * its version, `__CAWCO_PDFJS__`) reads the file from its own address, then
 * every page stands as a box of its size at once, each the viewer's spot for
 * the marks on that page (core file-spot.ts: `#page-3`), and is drawn, its
 * canvas and its text layer (its words selectable), as it nears the view.
 * A page drawn at one width is drawn again when its width changes.
 *
 * The root's loading mark (`FILE_LOADING_ATTR`) stands until every page's
 * box stands, or the file could not be read: until then a mark on a page is
 * waiting, not gone (overlay page.ts `waiting`).
 */
import {
  FILE_LOADING_ATTR,
  SPOT_ATTR,
  SPOT_PAGE_ATTR,
} from "@cawco/core/file-spot-marks";
import { fileViewerWords as words } from "@cawco/core/words/file-viewer";
import type * as PdfJs from "pdfjs-dist";

declare const __CAWCO_PDFJS__: string;

/** PDF.js's published files on this origin, at its version. */
const PDFJS = new URL(__CAWCO_PDFJS__, location.href).href;
/** A PDF's unit, the point, in CSS px: a page stands at most its printed size. */
const CSS_PX_PER_POINT = 96 / 72;
/** How far past the view a page is drawn before it scrolls in, as an IntersectionObserver margin. Our call: about a screen. */
const NEAR = "100% 0px";
/** The most device pixels per CSS px a page's canvas takes: past 2 its memory grows and no eye sees it. Our call. */
const DENSITY_MOST = 2;

const root = document.documentElement;
const holder = document.getElementById("cawco-pages");

/** Each page's box, by its PDF.js page. */
const pageOf = new WeakMap<Element, PdfJs.PDFPageProxy>();
/** The width, CSS px, each page was last drawn at. */
const drawnAt = new WeakMap<Element, number>();
/** Each page's drawing under way, so a second asks wait on it. */
const drawing = new WeakMap<Element, Promise<void>>();

/** PDF.js's own sheet, its text layer's rules among them, first in the head: the viewer's sheet comes after it and wins. */
function pdfSheet(): void {
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = `${PDFJS}web/pdf_viewer.css`;
  document.head.prepend(sheet);
}

/** Page `box` drawn at its width now: its canvas, then its text layer over it. */
async function draw(pdfjs: typeof PdfJs, box: HTMLElement): Promise<void> {
  const page = pageOf.get(box);
  const width = box.clientWidth;
  if (!page || width === 0 || drawnAt.get(box) === width) {
    return;
  }
  drawnAt.set(box, width);
  const scale = width / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const density = Math.min(window.devicePixelRatio || 1, DENSITY_MOST);
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * density);
  canvas.height = Math.floor(viewport.height * density);
  canvas.className = "page-canvas";
  await page.render({
    canvas,
    viewport,
    ...(density === 1 ? {} : { transform: [density, 0, 0, density, 0, 0] }),
  }).promise;
  const text = document.createElement("div");
  text.className = "textLayer";
  box.style.setProperty("--scale-factor", String(scale));
  box.replaceChildren(canvas, text);
  await new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container: text,
    viewport,
  }).render();
}

/** {@link draw}, once at a time per page: an ask while one runs waits for it, then draws at the width then. */
function drawPage(pdfjs: typeof PdfJs, box: HTMLElement): void {
  const before = drawing.get(box) ?? Promise.resolve();
  const next = before
    .then(() => draw(pdfjs, box))
    .catch((error: unknown) => {
      // A page that failed is drawn again at its next ask.
      drawnAt.delete(box);
      console.warn("A PDF page wasn't drawn:", error);
    });
  drawing.set(box, next);
}

/** What the viewer says in place of the pages: that it is reading the PDF, or why it couldn't. */
function say(text: string): void {
  if (!holder) {
    return;
  }
  const line = document.createElement("p");
  line.className = "file-note";
  line.textContent = text;
  holder.replaceChildren(line);
}

/** The PDF at the pages' `data-src`, read and laid out page by page; each drawn as it nears the view. */
async function show(pages: HTMLElement): Promise<void> {
  const { src } = pages.dataset;
  if (!src) {
    return;
  }
  pdfSheet();
  say(words.pdfReading);
  const pdfjs: typeof PdfJs = await import(
    /* The hub's copy, at an address only known here. */ new URL(
      "build/pdf.min.mjs",
      PDFJS
    ).href
  );
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "build/pdf.worker.min.mjs",
    PDFJS
  ).href;
  const pdf = await pdfjs.getDocument({
    url: src,
    cMapUrl: `${PDFJS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS}standard_fonts/`,
    wasmUrl: `${PDFJS}wasm/`,
    iccUrl: `${PDFJS}iccs/`,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  }).promise;
  const near = new IntersectionObserver(
    (seen) => {
      for (const one of seen) {
        if (one.isIntersecting) {
          drawPage(pdfjs, one.target as HTMLElement);
        }
      }
    },
    { rootMargin: NEAR }
  );
  // A page drawn at another width is drawn again once it is near the view.
  const resized = new ResizeObserver((changed) => {
    for (const { target } of changed) {
      if (drawnAt.has(target)) {
        near.unobserve(target);
        near.observe(target);
      }
    }
  });
  const boxes: HTMLElement[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const box = document.createElement("section");
    box.id = `page-${n}`;
    box.className = "page";
    box.setAttribute(SPOT_ATTR, "pdf");
    box.setAttribute(SPOT_PAGE_ATTR, String(n));
    box.setAttribute("aria-label", words.pageLabel(n, pdf.numPages));
    box.style.aspectRatio = `${width} / ${height}`;
    box.style.maxInlineSize = `${Math.round(width * CSS_PX_PER_POINT)}px`;
    pageOf.set(box, page);
    boxes.push(box);
  }
  pages.replaceChildren(...boxes);
  const meta = document.querySelector(".file-meta");
  if (meta) {
    const count = document.createElement("span");
    count.textContent = words.pages(pdf.numPages);
    meta.firstElementChild?.after(count);
  }
  for (const box of boxes) {
    near.observe(box);
    resized.observe(box);
  }
}

if (holder) {
  show(holder)
    .catch((error: unknown) => {
      say(
        words.pdfUnread(error instanceof Error ? error.message : String(error))
      );
    })
    .finally(() => root.removeAttribute(FILE_LOADING_ATTR));
}
