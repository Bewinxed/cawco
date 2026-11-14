/**
 * The root package.json's `postinstall`: records what this install read, so
 * `bun run check` can tell when `node_modules` is out of step with the
 * checkout's lockfile and patches (lib/installed.ts).
 */
import { recordInstall } from "./lib/installed";

await recordInstall();
