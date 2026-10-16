import { publishRuntime, runtimeTree } from "../../packages/core/src/runtime";

await publishRuntime();
// Set resource paths before pi's module graph evaluates its package metadata.
process.env.PI_PACKAGE_DIR = runtimeTree("pi");
await import("cawco:pi-runtime");
await import("../../packages/cli/src/cli");
