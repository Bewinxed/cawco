/**
 * React in every bundle CawCo builds with Bun is the agent package's, which
 * declares react and react-dom: the hub's own hosts (canvas-host.ts,
 * decision-host.ts) and the standalone binary's compile (scripts/build-binary.ts)
 * take this plugin, so a page or the binary runs one React. Excalidraw's
 * `tunnel-rat` imports `react` without declaring it (pmndrs/tunnel-rat#24,
 * open; 0.1.2 is its latest), and from bun's global store, which a workspace
 * installs from, nothing of ours lies above it to reach one through, so
 * unpinned a bundle fails ("Could not resolve: \"react\""). Bun has no
 * `packageExtensions` to declare it (oven-sh/bun#40053), so the root declares
 * none. This is the Bun.build twin of the dashboard's vite.config.ts
 * `resolve.dedupe` (bits-ui for vaul-svelte): one copy, resolved from the
 * package that declares it.
 */
const AGENT_DIR = new URL("../../agent/", import.meta.url).pathname;
const REACT = /^react(?:-dom)?(?:\/.*)?$/u;

export const agentReact: Bun.BunPlugin = {
  name: "agent-react",
  setup(build) {
    build.onResolve({ filter: REACT }, ({ path }) => ({
      path: Bun.resolveSync(path, AGENT_DIR),
    }));
  },
};
