import "../../packages/core/src/no-huge-pages";
import { publishRuntime, runtimeTree } from "../../packages/core/src/runtime";

if (Bun.argv[2] === "search-host") {
  // The agent's search process, as the shipped binary starts it (entry.ts).
  await import("../../packages/agent/src/search/host");
} else if (Bun.argv[2]?.startsWith("smoke-")) {
  await publishRuntime();
  process.env.PI_PACKAGE_DIR = runtimeTree("pi");
  await import("./smoke-runtime");
} else {
  await publishRuntime();
  process.env.PI_PACKAGE_DIR = runtimeTree("pi");
  const home = process.env.HOME;
  if (
    !home?.includes("binary") ||
    process.env.HOST !== "127.0.0.1" ||
    process.env.CAWCO_HUB_PORT !== "43456" ||
    process.env.CAWCO_HUB_URL !== "http://127.0.0.1:43456"
  ) {
    throw new Error(
      "The test runtime requires scratch HOME and explicit isolated loopback hub"
    );
  }
  for (const key of Object.keys(process.env)) {
    if (/TOKEN|SECRET|API_KEY/u.test(key)) {
      throw new Error("The test may not receive credentials");
    }
  }
  process.env.CAWCO_NO_MDNS = "1";
  await import("../../packages/cli/src/cli");
}
