/**
 * What a project does with an event from someone its outside service does
 * not vouch for (provider spec §2.5, the owner's decision on outsiders):
 * `hold` it on its task or item in Needs you until the person moves it on,
 * no session started (the default); or `start` a session as for anyone
 * else's, their words inside the untrusted-data block.
 */
export const OUTSIDER_RULES = ["hold", "start"] as const;
export type OutsiderRule = (typeof OUTSIDER_RULES)[number];
