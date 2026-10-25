import "../../packages/core/src/no-huge-pages";
import { publishRuntime, runtimeTree } from "../../packages/core/src/runtime";

// The agent's search process (agent search/process.ts): the transcript
// index alone, none of the runtime the rest of the binary unpacks.
if (Bun.argv[2] === "search-host") {
  await import("../../packages/agent/src/search/host");
} else {
  await publishRuntime();
  // Set resource paths before pi's module graph evaluates its package metadata.
  process.env.PI_PACKAGE_DIR = runtimeTree("pi");
  await import("cawco:pi-runtime");
  await import("../../packages/cli/src/cli");
}
