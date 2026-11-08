/**
 * `$app/env` for the decision host (hub decision-host.ts `appEnv`): the
 * host draws a decision page in a browser, never on a server, so the kit's
 * parts that ask (a menu's surface, a popover's) read `browser` as true.
 */
export const browser = true;
