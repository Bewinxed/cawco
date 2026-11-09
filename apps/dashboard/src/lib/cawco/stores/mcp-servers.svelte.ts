/** The fleet's MCP servers, as each `fleet_mcp` frame carries them whole. */
import type { FrameOf } from "../hub/frames";
import { equal } from "./same";

const fleetMcpState = $state({
  fleetMcp: null as import("@cawco/core/fleet").FleetMcpServer[] | null,
});

export function takeFleetMcp(frame: FrameOf<"fleet_mcp">): void {
  if (!equal(fleetMcpState.fleetMcp, frame.servers)) {
    fleetMcpState.fleetMcp = frame.servers;
  }
}

/** The fleet's MCP servers as the hub last sent them. */
export const mcpServersStore = {
  get fleetMcp() {
    return fleetMcpState.fleetMcp;
  },
};
