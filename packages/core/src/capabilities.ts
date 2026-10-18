/** Optional machine tools. Reporting never installs or impersonates a tool. */
export interface MachineCapability {
  /** `public-address` only: the machine's global unicast addresses, outside private, link-local and CGNAT ranges. */
  addresses?: string[];
  available: boolean;
  id:
    | "git"
    | "claude"
    | "opencode"
    | "pi"
    | "node"
    | "browser"
    | "container-runtime"
    | "public-address"
    | "service-manager";
  /**
   * What installs it here. Empty when nothing may: a copy came some way
   * CawCo has no method for, and another would be a second copy (`reason`
   * says so).
   */
  installCommand: string;
  path?: string;
  reason?: string;
  /** `container-runtime` only: the runtime forwards UDP to the browser's media port. False, `reason` says how to get it back. */
  udp?: boolean;
  version?: string;
}
export interface MachineCapabilities {
  at: number;
  items: MachineCapability[];
  platform: string;
}
