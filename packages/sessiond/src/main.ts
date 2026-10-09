/**
 * The sessiond entry point: endpoint, signals, exit. Everything else is in
 * `server.ts` — deliberately, so the process wrapper stays the only part a
 * future Windows port has to touch (design §11, §12).
 */

import { detach } from "@cawco/core/detach";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { placeChildren } from "./cgroup";
import { SessiondServer } from "./server";

const main = async (): Promise<void> => {
  // Read directly: `CAWCO_ENV` has no key for sessiond's own override.
  const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();
  // Linux only: macOS has no cgroups, and limits threads per process, so the
  // children there cannot take the keeper's.
  const placement =
    process.platform === "linux" ? await placeChildren() : undefined;
  if (placement) {
    console.log(`[sessiond] ${placement.said}`);
  }
  const server = new SessiondServer({
    ...(placement?.children ? { children: placement.children.procs } : {}),
  });
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
  process.on("SIGTERM", () => detach(shutdown("SIGTERM"), "sessiond drain"));
  process.on("SIGINT", () => detach(shutdown("SIGINT"), "sessiond drain"));
};

await main();
