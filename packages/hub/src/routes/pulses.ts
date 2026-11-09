/**
 * Each session's live activity reading.
 */
import { Elysia } from "elysia";
import type { HubContext } from "../hub-context";

export const pulseRoutes = ({ pulses }: Pick<HubContext, "pulses">) =>
  new Elysia()
    // Every session's pulse, the daemon's now-state, as the socket's first
    // `instances` frame seeds it: the dashboard's server load reads it so a
    // page's first paint draws a working session working.
    .get("/api/pulses", () => Object.fromEntries(pulses));
