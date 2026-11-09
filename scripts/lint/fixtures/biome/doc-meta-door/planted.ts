// Planted: each hand-named meta map doc-meta-door refuses, then the ones it leaves alone.
declare const doc: { getMap: (name: string) => Map<string, unknown> };

export const sentAt = doc.getMap("meta").get("sentAt");
export const meta = doc.getMap("meta");

export const state = doc.getMap("state");
