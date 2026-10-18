/**
 * The page's fleet, for the bar's own items: MachinesButton reads the
 * machines from `./client.svelte` and their troubles from
 * `./home/home-state.svelte`, NeedsCaw what needs you from the same and his
 * notices from `./home/caw-notices.svelte`. The page has no hub, so those
 * three imports, from those two files alone, are these (vite.config.ts
 * `standIns`): two machines online and nothing wrong with them, three asks
 * waiting (the live bar's, the day this page was drawn), the hub read and connected, no notice. The components
 * themselves are the dashboard's, untouched.
 */

const machines = [
  { machineId: "m-mini", hostname: "mini", status: "online", os: "darwin" },
  { machineId: "m-studio", hostname: "studio", status: "online", os: "linux" },
];

/** `./client.svelte`'s `cawco`, as far as the bar reads it. */
export const cawco = { machines };

/** `./home/home-state.svelte`'s `home`, as far as the bar reads it. */
export const home = {
  ready: true,
  status: "connected",
  exceptions: [] as { machineId: string; text: string }[],
  needs: [
    { key: "ask:auth-rework" },
    { key: "ask:pricing-copy" },
    { key: "ask:deploy-window" },
  ],
};

/** `./home/caw-notices.svelte`'s `cawNotices`, as far as the bar reads it. */
export const cawNotices = { count: 0, keys: [] as string[] };
