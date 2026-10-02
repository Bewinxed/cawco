/**
 * The hook of a route only agents and the hub's own tools call. The OpenAPI
 * document (`bun run openapi`) covers exactly what the dashboard calls, and
 * leaves these out.
 */
export const hidden = { detail: { hide: true } } as const;
