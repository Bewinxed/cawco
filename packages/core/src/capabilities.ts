/** Optional machine tools. Reporting never installs or impersonates a tool. */
export interface MachineCapability {
  available: boolean;
  id: "git" | "opencode" | "pi" | "node" | "browser" | "service-manager";
  installCommand: string;
  path?: string;
  reason?: string;
}
export interface MachineCapabilities {
  at: number;
  items: MachineCapability[];
  platform: string;
}
