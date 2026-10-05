import { materializeTree } from "../../packages/core/src/runtime";

// Set resource paths before pi's module graph evaluates its package metadata.
process.env.PI_PACKAGE_DIR = materializeTree("pi");
await import("cawco:pi-runtime");
await import("../../packages/cli/src/cli");
