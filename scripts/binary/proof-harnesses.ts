/** Only linked by an explicitly requested proof build, never a release build. */
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
    // A session that exists and runs no model turns: enough for the hub and the
    // agent to carry it as a running session, with no credentials.
    spawn: (
      _payload: unknown,
      ctx: { closed?: () => void; instanceId: string }
    ) =>
      Promise.resolve({
        harness: kind,
        sessionId: `stub-${ctx.instanceId}`,
        control: () => Promise.resolve(undefined),
        dispose: () => Promise.resolve(),
        interrupt: () => Promise.resolve(),
        resolvePermission: () => undefined,
        send: () => undefined,
        stop: () => {
          ctx.closed?.();
          return Promise.resolve();
        },
      }),
    deleteSession: () => Promise.resolve(),
    renameSession: () => Promise.resolve(),
    tagSession: () => Promise.resolve(),
  });
}
export const harnesses = () => [...registry.values()];
export const harness = (kind: string) => registry.get(kind);
export const registerHarness = (adapter: { kind: string }) =>
  registry.set(adapter.kind, adapter);
