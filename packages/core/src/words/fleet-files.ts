/**
 * What a skill's or a plugin's row says when the files the hub kept for it
 * do not read (hub migration 0423, db/fleet-files-unread.ts): no machine is
 * sent them. The app draws none of it, so it is not written into it
 * (scripts/words-swift.ts).
 */
export const fleetFilesWords = {
  /** A skill's or plugin's `error` in the listing while its kept files do not read (hub db fleet-catalog.ts). */
  unread:
    "Its kept files didn't read, so no machine is sent them. Fetch again to store them.",
  /** A restore of a kept version whose files do not read (POST /api/fleet/skills/restore). */
  versionUnread:
    "That version's kept files didn't read, so it can't be restored.",
} as const;
