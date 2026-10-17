/**
 * `$app/state` on a harness page (harness/vite.config.ts aliases it here):
 * the one page there is, at the address it was loaded from, with no route
 * params, data or error.
 */
export const page = $state({
  url: new URL(location.href),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  data: {} as Record<string, unknown>,
  state: {} as Record<string, unknown>,
  form: null as unknown,
  status: 200,
  error: null as { message: string } | null,
});

export const navigating = { current: null };
export const updated = { current: false };
