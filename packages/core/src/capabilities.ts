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
    | "service-manager"
    | "workspace";
  /**
   * What installs it here. Empty when nothing may: a copy came some way
   * CawCo has no method for, and another would be a second copy (`reason`
   * says so).
   */
  installCommand: string;
  /** `container-runtime` only: what the runtime forwards to the browser's media port. Short of `udp+tcp`, `reason` says how to get both. */
  media?: MediaPath;
  /**
   * `workspace` only: each tool a delegate's workspace needs that the
   * machine lacks (agent workspace-needs.ts). While it is not empty the
   * machine refuses every delegate before anything starts, in `reason`'s
   * words, and `installCommand` installs them all.
   */
  missing?: WorkspaceTool[];
  /**
   * `public-address` only, on a machine with none of its own: the public
   * address its router maps it to, as a STUN binding answered it, and its
   * address on the router's network (core stream-relay.ts `STUN_SERVER`).
   */
  nat?: { address: string; lan: string };
  path?: string;
  reason?: string;
  version?: string;
}
/** A tool a delegate's workspace needs, as a machine that lacks it reports it. */
export interface WorkspaceTool {
  /** The command it is looked for by. */
  command: string;
  /** Where it was looked for: the dirs, `:`-joined. */
  lookedIn: string;
  /** What needs it: the walls every workspace runs in, or the git checkout a workspace is. */
  need: "walls" | "checkout";
  /** The package that ships it, as the install command names it. */
  package: string;
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
