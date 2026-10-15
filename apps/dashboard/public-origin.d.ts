import type { IncomingHttpHeaders } from "node:http";
export function publicOrigin(headers: IncomingHttpHeaders): {
  protocol: "http" | "https";
  host: string | undefined;
  origin: string;
};
