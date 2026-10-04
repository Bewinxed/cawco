// biome-ignore lint/performance/noBarrelFile: this is the package's public entrypoint, re-exported by consumers across the monorepo
export { probeAuth } from "./auth";
export { buildInfo } from "./build";
export { type CliConfig, CONFIG_PATH, readConfig, writeConfig } from "./config";
export {
  ConnectionLost,
  currentBusy,
  currentRestartReadiness,
  type RegisterPayload,
  runDaemon,
  startDaemon,
} from "./daemon";
export {
  checkDeploy,
  DEPLOY_BRANCH,
  DEPLOY_MARKER,
  DEPLOY_POLL_MS,
  type DeployMarker,
  type DeployState,
  deployInfo,
  deployRoot,
  describeDeploy,
  forgetLatestDeploy,
  isDeployClone,
  latestDeploy,
  readDeployMarker,
} from "./deploy";
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
export {
  checkVersion,
  isNewer,
  latestVersion,
  PACKAGE_NAME,
  registryUpdate,
  registryUrl,
  type VersionCheck,
} from "./registry";
export { type FrameSink, SessionSupervisor } from "./session";
export {
  type DeployWatchOptions,
  deploymentState,
  type UpdateOptions,
  updateCheckout,
  watchDeployment,
} from "./update";
