// What house/eden-answers-read must refuse (expected.txt): an Eden request
// whose answer a caller holds itself, awaited, chained or handed on.
declare const hub: {
  api: {
    fleet: {
      get: () => Promise<unknown>;
      memory: { put: (body: object) => Promise<unknown> };
    };
    projects: (path: { id: string }) => { delete: () => Promise<unknown> };
  };
};
declare const hubData: (call: Promise<unknown>) => Promise<unknown>;
declare const hubAsk: (call: Promise<unknown>) => Promise<unknown>;
declare const keep: (call: Promise<unknown>) => void;
declare const pick: boolean;

export const held = async () => await hub.api.fleet.get();
export const chained = () => hub.api.fleet.get().then(() => null);
export const handedOn = () => keep(hub.api.projects({ id: "p" }).delete());

// Read where it is made: each stands.
export const read = () => hubData(hub.api.fleet.get());
export const asked = () =>
  hubAsk(pick ? hub.api.fleet.get() : hub.api.fleet.memory.put({}));
export const bracketed = () => hubData(hub.api.fleet.get());
// Not Eden's: a map's delete.
export const other = (seen: Map<string, number>) => seen.delete("x");
