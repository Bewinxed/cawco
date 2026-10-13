/**
 * The person's ink on a session's artifact (Projects spec §5.10, D27), as
 * the composer carries it: the artifact's page says how much of it is
 * unsent (`cawco:ink`, preview-overlay ink.ts), the composer shows it as its
 * Ink chip, and the composer's Send asks the page for its pins as text and
 * its picture with the ink on it (`cawco:ink-export`), sends them through
 * the send's attachments and images, and tells the page they went
 * (`cawco:ink-sent`). Nothing goes until the person sends.
 */
import { SvelteMap } from "svelte/reactivity";
import type { SendExtras } from "../client.svelte";
import { exportCanvas } from "../client.svelte";

export interface InkWaiting {
  artifactId: string;
  /** The page that holds the ink, which Send asks for it. */
  frame: Window;
  /** Pins not yet sent. */
  pins: number;
  /** A small picture of the page with its ink, base64 PNG; null until drawn (and on a canvas). */
  thumb: string | null;
  /** Stroke groups not yet sent. */
  unsent: number;
}

/** Each session's unsent ink, by the session's id. */
export const inks = new SvelteMap<string, InkWaiting>();

/** A page's word on its ink: how much is unsent, and a picture once drawn. */
export function heardInk(
  instanceId: string,
  artifactId: string,
  frame: Window,
  data: { unsent?: unknown; pins?: unknown; thumb?: unknown }
): void {
  const unsent = typeof data.unsent === "number" ? data.unsent : 0;
  if (unsent === 0) {
    if (inks.get(instanceId)?.artifactId === artifactId) {
      inks.delete(instanceId);
    }
    return;
  }
  const was = inks.get(instanceId);
  // The picture comes a beat after the count: until a new one, the last one stands.
  const kept = was?.artifactId === artifactId ? was.thumb : null;
  inks.set(instanceId, {
    artifactId,
    frame,
    unsent,
    pins: typeof data.pins === "number" ? data.pins : 0,
    thumb: typeof data.thumb === "string" ? data.thumb : kept,
  });
}

/** How long the page has to draw its picture for a send, ms. */
const EXPORT_WAIT = 15_000;

const asked = new Map<
  Window,
  (answer: { md: string; png: string | null; canvas: boolean }) => void
>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (
      event.origin !== location.origin ||
      event.data?.type !== "cawco:ink-exported"
    ) {
      return;
    }
    const answer = asked.get(event.source as Window);
    asked.delete(event.source as Window);
    answer?.({
      md: typeof event.data.md === "string" ? event.data.md : "",
      png: typeof event.data.png === "string" ? event.data.png : null,
      canvas: event.data.canvas === true,
    });
  });
}

/**
 * What the send carries for the session's unsent ink: its pins as `pins.md`
 * and the page with its ink as one PNG (a canvas's own picture, which holds
 * its strokes). Null with no ink waiting; throws when the page or the hub
 * did not answer.
 */
export async function inkExtras(instanceId: string): Promise<{
  extras: Required<Pick<SendExtras, "attachments" | "images">>;
  sent: () => void;
} | null> {
  const waiting = inks.get(instanceId);
  if (!waiting) {
    return null;
  }
  const { frame, artifactId } = waiting;
  const answer = await new Promise<{
    md: string;
    png: string | null;
    canvas: boolean;
  }>((done, fail) => {
    const timer = setTimeout(() => {
      asked.delete(frame);
      fail(new Error("the page didn't draw its ink within 15 s"));
    }, EXPORT_WAIT);
    asked.set(frame, (got) => {
      clearTimeout(timer);
      done(got);
    });
    frame.postMessage({ type: "cawco:ink-export" }, location.origin);
  });
  const png = answer.canvas ? (await exportCanvas(artifactId)).png : answer.png;
  if (!png) {
    throw new Error("the picture of the ink wasn't drawn");
  }
  return {
    extras: {
      attachments: answer.md
        ? [{ kind: "text", name: "pins.md", content: answer.md }]
        : [],
      images: [{ mediaType: "image/png", data: png }],
    },
    sent: () => {
      frame.postMessage({ type: "cawco:ink-sent" }, location.origin);
      if (inks.get(instanceId)?.artifactId === artifactId) {
        inks.delete(instanceId);
      }
    },
  };
}
