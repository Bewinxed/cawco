/**
 * What `cawco service status` says on a terminal while it asks a service
 * whether it answers (cli service.ts): the hub, the dashboard or the
 * agent's own hub, waited on while bytes arrive, so a slow one shows the
 * wait instead of a still terminal.
 */
export const serviceStatusWords = {
  /** The line shown while a service's own answer is awaited; the answer replaces it. */
  asking: "live     asking…",
};
