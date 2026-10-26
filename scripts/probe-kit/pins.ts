/**
 * An artifact's pins as a probe reads and writes them. A pin is written
 * across the doc's pin maps (core comments.ts `PIN_MAPS`: its head, place,
 * resolve, look, delivery and each thread entry under its own key), and
 * every reader assembles it with core's `readPins`. A page's doc
 * (`window.cawcoArtifact.doc`, the overlay's mirror) runs no Yjs and no
 * core, so a probe takes those maps out of the page as plain data and
 * assembles them here, and hands the page the parts a pin is written as.
 */
import type { Frame } from "playwright-core";
import { Doc } from "yjs";
import {
  PIN_MAPS,
  type Pin,
  readPins,
  writePin,
} from "../../packages/core/src/comments";

/** A doc's pin maps as plain data: each map's values by key. */
export type PinParts = Record<string, Record<string, unknown>>;

/** The pins `parts` hold, by id, as every reader assembles them. */
export const pinsOf = (parts: PinParts): Record<string, Pin> => {
  const doc = new Doc();
  for (const [name, values] of Object.entries(parts)) {
    const map = doc.getMap(name);
    for (const [key, value] of Object.entries(values)) {
      map.set(key, value);
    }
  }
  return Object.fromEntries(readPins(doc));
};

/** What writing `pins` puts in each pin map, as the overlay writes them. */
const partsOf = (...pins: Pin[]): PinParts => {
  const doc = new Doc();
  for (const pin of pins) {
    writePin(doc, pin);
  }
  return Object.fromEntries(
    PIN_MAPS.map((name) => [name, doc.getMap(name).toJSON()])
  );
};

interface PageDoc {
  getMap: (name: string) => {
    set: (key: string, value: unknown) => void;
    toJSON: () => Record<string, unknown>;
  };
  transact: (writes: () => void) => void;
}

/** The pin maps of the page's doc in `frame`, as plain data. */
const pagePinParts = (frame: Frame): Promise<PinParts> =>
  frame.evaluate(
    (names) => {
      const { doc } = (window as unknown as { cawcoArtifact: { doc: PageDoc } })
        .cawcoArtifact;
      return Object.fromEntries(
        names.map((name) => [name, doc.getMap(name).toJSON()])
      );
    },
    [...PIN_MAPS]
  );

/** The pins of the page's doc in `frame`, by id. */
export const pagePins = async (frame: Frame): Promise<Record<string, Pin>> =>
  pinsOf(await pagePinParts(frame));

/** Writes `pins` into the page's doc in `frame`, in one transaction, as the overlay writes a pin. */
export const writePagePins = (frame: Frame, ...pins: Pin[]): Promise<void> =>
  frame.evaluate(
    (parts) => {
      const { doc } = (window as unknown as { cawcoArtifact: { doc: PageDoc } })
        .cawcoArtifact;
      doc.transact(() => {
        for (const [name, values] of Object.entries(parts)) {
          for (const [key, value] of Object.entries(values)) {
            doc.getMap(name).set(key, value);
          }
        }
      });
    },
    partsOf(...pins)
  );
