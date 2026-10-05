import { materializeTree } from "../../packages/core/src/runtime";

process.env.PI_PACKAGE_DIR = materializeTree("pi");
if (Bun.argv[2]?.startsWith("proof-")) {
  await import("./proof-runtime");
} else {
  const home = process.env.HOME;
  if (
    !home?.includes("binary") ||
    process.env.HOST !== "127.0.0.1" ||
    process.env.CAWCO_HUB_PORT !== "43456" ||
    process.env.CAWCO_HUB_URL !== "http://127.0.0.1:43456"
  ) {
    throw new Error(
      "Proof runtime requires scratch HOME and explicit isolated loopback hub"
    );
  }
  if (process.env.CAWCO_DEPLOY_POLL === "1") {
    throw new Error("Proof may not start a deployment poller");
  }
  for (const key of Object.keys(process.env)) {
    if (/TOKEN|SECRET|API_KEY/.test(key)) {
      throw new Error("Proof may not receive credentials");
    }
  }
  process.env.CAWCO_NO_MDNS = "1";
  if (
    Bun.argv[2] === "dashboard" &&
    process.env.CAWCO_PROOF_ACTIVATED_FD === "3"
  ) {
    process.env.LISTEN_PID = String(process.pid);
  }
  await import("../../packages/cli/src/cli");
}
