/** A request's session credential (`Authorization: Bearer …`), or null: never the person's `Owner` token. */
export const bearerOf = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization : null;
};
