/**
 * React in every bundle CawCo builds with Bun is the agent package's,
 * whoever imports it: the canvas host (canvas-host.ts), the decision host
 * (decision-host.ts) and the standalone binary's compile
 * (scripts/build-binary.ts) each take this plugin, so a page or the binary
 * runs one React. Excalidraw's `tunnel-rat` imports `react` without
 * declaring it (pmndrs/tunnel-rat#24, open; 0.1.2 is its latest), and the
 * isolated install leaves it no shared fallback to reach one through
 * (bunfig.toml `hoist = false`), so unpinned a bundle fails ("Could not
 * resolve: \"react\""). Bun has no `packageExtensions` to declare it
 * (oven-sh/bun#40053), and a root package.json declaration never reaches a
 * package in bun's global store, which a workspace installs from, so the
 * root declares none. This is the Bun.build twin of the dashboard's
 * vite.config.ts `resolve.dedupe` (bits-ui for vaul-svelte): one copy,
 * resolved from the package that declares it.
 */

/** The agent package, which declares react and react-dom. */
const AGENT_DIR = new URL("../../agent/", import.meta.url).pathname;

const REACT = /^react(?:-dom)?(?:\/.*)?$/;

export const agentReact: Bun.BunPlugin = {
  name: "agent-react",
  setup(build) {
    build.onResolve({ filter: REACT }, ({ path }) => ({
      path: Bun.resolveSync(path, AGENT_DIR),
    }));
  },
};
