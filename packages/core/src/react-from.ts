/**
 * The plugin that resolves `react` and `react-dom` in a bundle from one
 * package's install, the package that declares them. Every bundle CawCo
 * builds with Bun passes the agent package's folder here: the canvas host
 * (hub canvas-host.ts), the decision host (hub decision-host.ts) and the
 * standalone binary's compile (scripts/build-binary.ts), so a page or the
 * binary runs one React. Excalidraw's `tunnel-rat` imports `react` without
 * declaring it (pmndrs/tunnel-rat#24, open; 0.1.2 is its latest), and from
 * bun's global store, which a workspace installs from, nothing of ours lies
 * above it to reach one through, so unpinned a bundle fails ("Could not
 * resolve: \"react\""). Bun has no `packageExtensions` to declare it
 * (oven-sh/bun#40053), and a root package.json declaration never reaches a
 * package in bun's global store, which a workspace installs from, so the
 * root declares none. This is the Bun.build twin of the dashboard's
 * vite.config.ts `resolve.dedupe` (bits-ui for vaul-svelte): one copy,
 * resolved from the package that declares it.
 */

const REACT = /^react(?:-dom)?(?:\/.*)?$/u;

export const reactFrom = (packageDir: string): Bun.BunPlugin => ({
  name: "react-from",
  setup(build) {
    build.onResolve({ filter: REACT }, ({ path }) => ({
      path: Bun.resolveSync(path, packageDir),
    }));
  },
});
