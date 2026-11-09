import { reactFrom } from "@cawco/core/react-from";

/**
 * React in every bundle CawCo builds with Bun is the agent package's, which
 * declares react and react-dom (core react-from.ts): the hub's own hosts and
 * the binary's compile take this plugin.
 */
export const agentReact = reactFrom(
  new URL("../../agent/", import.meta.url).pathname
);
