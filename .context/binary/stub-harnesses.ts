// All harness actions are credential-free and refuse sessions in this proof.
const registry = new Map();
for (const kind of ["claude", "opencode", "pi"]) {
  registry.set(kind, {
    kind, auth: "unauthenticated", capabilities: {},
    detect: async () => ({ harness: kind, installed: false, auth: "unauthenticated", capabilities: {} }),
    listSessions: async () => [], getSessionMessages: async () => [],
    getSessionInfo: async () => undefined,
    spawn: async () => { throw new Error("Credential-free binary proof: harnesses are stubbed"); },
    deleteSession: async () => {}, renameSession: async () => {}, tagSession: async () => {},
  });
}
export const harnesses = () => [...registry.values()];
export const harness = (kind: string) => registry.get(kind);
export const registerHarness = (adapter: {kind: string}) => registry.set(adapter.kind, adapter);
