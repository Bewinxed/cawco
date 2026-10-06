// biome-ignore lint/performance/noBarrelFile: this is the package's public entrypoint, re-exported by consumers across the monorepo
export { probeAuth } from "./auth";
export { buildInfo } from "./build";
export { type CliConfig, CONFIG_PATH, readConfig, writeConfig } from "./config";
export {
  ConnectionLost,
  type RegisterPayload,
  runDaemon,
  startDaemon,
} from "./daemon";
export {
  browseMdns,
  firstToAnswer,
  MDNS_BROWSE_MS,
  PROBE_TIMEOUT_MS,
  probeHub,
  type RediscoverProbes,
  rediscoverHub,
  tailscaleCandidates,
  toHttpBase,
  toWsUrl,
} from "./discovery";
export { machineId } from "./machine-id";
export { type FrameSink, SessionSupervisor } from "./session";
