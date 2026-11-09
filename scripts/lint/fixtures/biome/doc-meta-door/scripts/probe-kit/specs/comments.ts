// A probe's page-side code, which loads no module.
declare const doc: { getMap: (name: string) => Map<string, unknown> };

export const changes = doc.getMap("meta").get("changes");
