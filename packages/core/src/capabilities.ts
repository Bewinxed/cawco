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
  /** `container-runtime` only: what the runtime forwards to the browser's media port. Short of `udp+tcp`, `reason` says how to get both. */
  media?: MediaPath;
  path?: string;
  reason?: string;
  version?: string;
}
/**
 * What a container runtime forwards from the host to a browser's media
 * port: UDP and TCP, TCP alone, or nothing (a screen then reaches the
 * browser only through a stream relay).
 */
export type MediaPath = "udp+tcp" | "tcp" | "none";
export interface MachineCapabilities {
  at: number;
  items: MachineCapability[];
  platform: string;
}
