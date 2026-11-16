import { join } from "node:path";

export const bridgeDir = (): string | undefined => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  return runtime ? join(runtime, "cawco", "previews") : undefined;
};
