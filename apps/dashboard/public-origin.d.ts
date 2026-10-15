/** A request's headers by lowercase name: node's `IncomingHttpHeaders`, or a fetch `Headers` as an object. */
export function publicOrigin(
  headers: Record<string, string | string[] | undefined>
): {
  protocol: "http" | "https";
  host: string | undefined;
  origin: string;
};
