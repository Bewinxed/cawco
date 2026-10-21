/** SvelteKit's `$app/state` for a page that is one still drawing: it is where it is, and never moves. */
export const page = {
  url: new URL(location.href),
  params: {},
  route: { id: null },
  data: {},
  state: {},
  status: 200,
  error: null,
  form: null,
};
