/** Only linked by the explicitly requested proof build, never a release build. */
const registry = new Map();
for (const kind of ["claude", "opencode", "pi"]) {
  registry.set(kind, {
    kind,
    auth: "unauthenticated",
    capabilities: {},
    detect: async () => ({
      harness: kind,
      installed: false,
      auth: "unauthenticated",
      capabilities: {},
    }),
    listSessions: async () => [],
    getSessionMessages: async () => [],
    getSessionInfo: async () => undefined,
    machine: (method: string) =>
      method === "inspectConfig"
        ? Promise.resolve({
            at: Date.now(),
            marketplaces: [],
            mcp: [],
            plugins: [],
            skills: [],
            memory: null,
          })
        : undefined,
    spawn: () =>
      Promise.reject(new Error("Proof harness cannot run model turns")),
    deleteSession: () => Promise.resolve(),
    renameSession: () => Promise.resolve(),
    tagSession: () => Promise.resolve(),
  });
}
export const harnesses = () => [...registry.values()];
export const harness = (kind: string) => registry.get(kind);
export const registerHarness = (adapter: { kind: string }) =>
  registry.set(adapter.kind, adapter);
