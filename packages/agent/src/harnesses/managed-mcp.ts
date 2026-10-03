import { isDeepStrictEqual } from "node:util";

/**
 * OpenCode 1.18.34 adds no MCP entry defaults to GET /config: Local/Remote
 * fields use Schema.optional, and ConfigHttpApi.get returns configSvc.get().
 * No keys are stripped; object key order is immaterial, array order is not.
 * https://github.com/anomalyco/opencode/blob/v1.18.34/packages/core/src/v1/config/mcp.ts
 */
export const managedMcpMismatches = (
  managed: Iterable<string>,
  desired: Record<string, unknown> | undefined,
  live: Record<string, unknown> | undefined
): string[] =>
  [...managed].filter(
    (name) =>
      desired?.[name] === undefined ||
      !isDeepStrictEqual(desired[name], live?.[name])
  );
