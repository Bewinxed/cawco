/**
 * Trees that hold installed packages and builds, by dir name, in each
 * ecosystem's layout (npm's `node_modules`, Python's `.venv` and
 * `site-packages`, the JS frameworks' and Rust's build output): nothing in
 * one is a repository's own source, its secrets or its components. A leaf.
 */
export const PACKAGE_TREES: ReadonlySet<string> = new Set([
  "node_modules",
  ".venv",
  "site-packages",
  ".next",
  ".svelte-kit",
  "dist",
  "build",
  "target",
]);
