/**
 * The sessiond entry point: endpoint, signals, exit. Everything else is in
 * `server.ts` — deliberately, so the process wrapper stays the only part a
 * future Windows port has to touch (design §11, §12).
 */

import { sessiondEndpoint } from "@cawco/core/sessiond";
import { SessiondServer } from "./server";

const main = async (): Promise<void> => {
  // Read directly: `CAWCO_ENV` has no key for sessiond's own override.
  const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();
  const server = new SessiondServer();
  await server.listen(endpoint);
  console.log(`[sessiond] listening on ${endpoint} epoch=${server.epoch}`);

  let draining = false;
  // §11: the handlers do nothing but call the plain drain function. The
  // Windows port wires console ctrl events to the same call.
  const shutdown = async (signal: string): Promise<void> => {
    if (draining) {
      return;
    }
    draining = true;
    console.log(`[sessiond] ${signal} — draining children`);
    await server.drain();
    await server.close();
    process.exit(0);
  };
  // biome-ignore lint/complexity/noVoid: signal handlers are sync callbacks; shutdown() is fire-and-forget by design
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // biome-ignore lint/complexity/noVoid: signal handlers are sync callbacks; shutdown() is fire-and-forget by design
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

await main();
