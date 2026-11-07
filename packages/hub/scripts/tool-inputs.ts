/**
 * Every CawCo tool a session is listed, by its name, and the JSON Schema of
 * the arguments it takes: what the tool door (`POST
 * /api/delegation/call/:instanceId`) and `cawco tool` call. Read off the
 * role budgets' stand-in listing (role-budgets.ts `listRoleTools`, every
 * role's), and `ask` (asks.ts), which the server lists every session and
 * that stand-in leaves out: each definition read, never called.
 *
 * Each as a door caller sends it: without the `patternProperties` that
 * admits CawCo's OpenCode plugin's stamp (mcp-tool.ts `STAMPED_KEY`), which
 * no caller of the door sends, so each tool's arguments stay a closed type.
 *
 * It loads the hub's modules: call it after hub-in-process.ts built the hub,
 * which must be the first to load them.
 */
export const toolInputs = async (): Promise<Map<string, unknown>> => {
  const { listRoleTools } = await import("../src/role-budgets");
  const { createAsks } = await import("../src/asks");
  const tools = new Map<string, unknown>();
  const unstamped = ({
    patternProperties: _stamp,
    ...door
  }: Record<string, unknown>) => door;
  for (const { tools: listed } of listRoleTools()) {
    for (const one of listed) {
      tools.set(
        one.name,
        unstamped(one.inputSchema as Record<string, unknown>)
      );
    }
  }
  for (const one of createAsks({} as never).tools(undefined)) {
    tools.set(one.name, unstamped(one.inputSchema));
  }
  return tools;
};
