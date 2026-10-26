import { z } from "zod";

/** A JSON-RPC message as an MCP server or client sends it: a request, a notification or an answer. */
export const JsonRpcMessageSchema = z.object({
  error: z.unknown().optional(),
  id: z.union([z.number(), z.string()]).nullable().optional(),
  jsonrpc: z.string().optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
