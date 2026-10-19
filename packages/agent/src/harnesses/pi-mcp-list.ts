/**
 * `pi mcp list --json`, run by pi's own CLI entry in a process of its own
 * (pi-mcp.ts `piMcpList`): it prints the JSON and sets the exit code, which
 * the agent's own process must not.
 */
import { main } from "@earendil-works/pi-coding-agent";

await main(["mcp", "list", "--json"]);
