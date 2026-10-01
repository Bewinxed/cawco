// biome-ignore lint/performance/noBarrelFile: this is the package's public entrypoint; consumers import "@cawco/cli" and expect one surface
export {
  type CliConfig,
  CONFIG_PATH,
  readConfig,
  writeConfig,
} from "@cawco/agent";
export {
  type DiscoverOptions,
  discoverHub,
  type Hub,
  type HubSource,
} from "./discover";
