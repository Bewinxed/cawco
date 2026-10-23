/**
 * A machine's fleet config as items, each with its own id and content hash:
 * what the hub's deltas carry and what a machine acknowledges holding
 * (core fleet.ts `FleetDelta`). The hub builds the machine's config whole
 * (`MachineFleetConfig`), splits it here, and sends only the items whose
 * hash moved since the machine last acknowledged; the machine joins the
 * items it holds back into the config its harnesses converge. Server-only:
 * hashing runs on Bun.
 *
 * An item's hash leaves out `force`: a person's Overwrite rides on an item
 * the machine already holds (hub fleet-sync.ts `force`), and the same
 * content forced is not a change of content.
 */
import type {
  FleetMarketplace,
  FleetMcpServer,
  FleetMemory,
  FleetMemoryDoc,
  FleetPlacedMemoryDoc,
  FleetPlugin,
  FleetPluginPayload,
  FleetSkillPayload,
  MachineFleetConfig,
} from "./fleet";
import type { FleetHarnessConfig } from "./harness-config";
import type { FleetHook } from "./hooks";

/** What a machine's harnesses converge an item into, one converge pass each. */
export type FleetItemKind =
  | "policy"
  | "mcp"
  | "placedMcp"
  | "skill"
  | "placedSkill"
  | "marketplace"
  | "plugin"
  | "pluginPayload"
  | "hubOnly"
  | "memory"
  | "memoryDoc"
  | "placedMemory"
  | "hook"
  | "harnessConfig";

/** One item: its id (`<kind>:<key>`, or the kind alone for a singular one) and its value. */
export type FleetItems = Map<string, unknown>;

const placed = (name: string, placeId: string | undefined): string =>
  `${name}@${placeId ?? ""}`;

/** The item ids and values of a machine's config, in a stable order. */
export const fleetItemsOf = (config: MachineFleetConfig): FleetItems => {
  const items: FleetItems = new Map();
  items.set("policy", { deniedTools: config.deniedTools });
  items.set("hubOnly", config.hubOnlyMarketplaces);
  for (const row of config.mcp) {
    items.set(`mcp:${row.name}`, row);
  }
  for (const row of config.placedMcp) {
    items.set(`placedMcp:${placed(row.name, row.placeId)}`, row);
  }
  for (const skill of config.skills) {
    items.set(`skill:${skill.name}`, skill);
  }
  for (const skill of config.placedSkills) {
    items.set(`placedSkill:${placed(skill.name, skill.placeId)}`, skill);
  }
  for (const market of config.marketplaces) {
    items.set(`marketplace:${market.name}`, market);
  }
  for (const plugin of config.plugins) {
    items.set(`plugin:${plugin.id}`, plugin);
  }
  for (const payload of config.pluginPayloads) {
    items.set(`pluginPayload:${payload.name}@${payload.marketplace}`, payload);
  }
  if (config.memory) {
    const { docs, ...main } = config.memory;
    items.set("memory", main);
    for (const doc of docs) {
      items.set(`memoryDoc:${doc.path}`, doc);
    }
  }
  for (const doc of config.placedMemory) {
    items.set(`placedMemory:${placed(doc.path, doc.placeId)}`, doc);
  }
  for (const hook of config.hooks) {
    items.set(`hook:${hook.id}@${hook.cwd ?? ""}`, hook);
  }
  for (const row of config.harnessConfig) {
    items.set(`harnessConfig:${harnessConfigKey(row)}`, row);
  }
  return items;
};

/**
 * A harness config row's report key: `<kind>:<name>`, and a placed copy's
 * `@<place id>` after it (core harness-config.ts).
 */
export const harnessConfigKey = (
  row: Pick<FleetHarnessConfig, "kind" | "name" | "placeId">
): string => `${row.kind}:${row.name}${row.placeId ? `@${row.placeId}` : ""}`;

/** The kind an item id names. */
export const itemKind = (id: string): FleetItemKind => {
  const colon = id.indexOf(":");
  return (colon < 0 ? id : id.slice(0, colon)) as FleetItemKind;
};

/** The key a machine's report names an item under (its server, skill, plugin or document), or none for one no report names. */
export const reportKeyOf = (id: string): string | undefined => {
  const kind = itemKind(id);
  const key = id.slice(id.indexOf(":") + 1);
  switch (kind) {
    case "mcp":
    case "skill":
    case "marketplace":
    case "plugin":
    case "memoryDoc":
      return key;
    case "placedMcp":
    case "placedSkill":
    case "placedMemory":
      return key;
    case "hook":
      return key.slice(0, key.lastIndexOf("@"));
    case "harnessConfig":
      return key;
    case "memory":
      return "";
    case "policy":
    case "hubOnly":
    case "pluginPayload":
      return;
    default: {
      const unhandled: never = kind;
      throw new Error(`unhandled kind: ${String(unhandled)}`);
    }
  }
};

/** The config whole again, from the items a machine holds. */
export const fleetConfigOf = (items: FleetItems): MachineFleetConfig => {
  const config: MachineFleetConfig = {
    deniedTools: [],
    harnessConfig: [],
    hooks: [],
    marketplaces: [],
    mcp: [],
    memory: null,
    placedMemory: [],
    pluginPayloads: [],
    plugins: [],
    skills: [],
    hubOnlyMarketplaces: [],
    placedMcp: [],
    placedSkills: [],
  };
  const docs: FleetMemoryDoc[] = [];
  let main: Omit<FleetMemory, "docs"> | undefined;
  for (const [id, value] of items) {
    const kind = itemKind(id);
    switch (kind) {
      case "policy":
        config.deniedTools = (value as { deniedTools: string[] }).deniedTools;
        break;
      case "hubOnly":
        config.hubOnlyMarketplaces = value as string[];
        break;
      case "mcp":
        config.mcp.push(value as FleetMcpServer);
        break;
      case "placedMcp":
        config.placedMcp.push(value as FleetMcpServer);
        break;
      case "skill":
        config.skills.push(value as FleetSkillPayload);
        break;
      case "placedSkill":
        config.placedSkills.push(value as FleetSkillPayload);
        break;
      case "marketplace":
        config.marketplaces.push(value as FleetMarketplace);
        break;
      case "plugin":
        config.plugins.push(value as FleetPlugin);
        break;
      case "pluginPayload":
        config.pluginPayloads.push(value as FleetPluginPayload);
        break;
      case "memory":
        main = value as Omit<FleetMemory, "docs">;
        break;
      case "memoryDoc":
        docs.push(value as FleetMemoryDoc);
        break;
      case "placedMemory":
        config.placedMemory.push(value as FleetPlacedMemoryDoc);
        break;
      case "hook":
        config.hooks.push(value as FleetHook);
        break;
      case "harnessConfig":
        config.harnessConfig.push(value as FleetHarnessConfig);
        break;
      default: {
        const unhandled: never = kind;
        throw new Error(`unhandled kind: ${String(unhandled)}`);
      }
    }
  }
  config.memory = main ? { ...main, docs } : null;
  return config;
};

/** JSON with every object's keys sorted: the same value hashes the same however it was built. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>)
            .filter(([key]) => key !== "force")
            .sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : inner
  );

/** An item's content hash: sha256 of its value, `force` left out. */
export const itemHash = (value: unknown): string =>
  new Bun.CryptoHasher("sha256").update(stable(value)).digest("hex");

/** Every item's hash, by id. */
export const itemHashes = (items: FleetItems): Record<string, string> =>
  Object.fromEntries([...items].map(([id, value]) => [id, itemHash(value)]));
