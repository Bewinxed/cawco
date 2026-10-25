/**
 * `$app/state` as the preview has it: SvelteKit's `page`, of which the
 * components on show read the address (TodoList's `?todo=`, a to-do's
 * chip). The page is not a SvelteKit app, so build.ts names this module
 * for it.
 */
export const page = {
  get url() {
    return new URL(location.href);
  },
  params: {},
  route: { id: null },
  state: {},
  data: {},
  status: 200,
  error: null,
};
export const navigating = { from: null, to: null, type: null };
export const updated = { current: false, check: () => Promise.resolve(false) };
