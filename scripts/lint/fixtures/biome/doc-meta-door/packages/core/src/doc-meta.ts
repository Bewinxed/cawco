// The owner: the one place the meta map is named.
declare const doc: { getMap: (name: string) => Map<string, unknown> };

export const docMeta = () => doc.getMap("meta");
