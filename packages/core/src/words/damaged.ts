/** What the hub says of a record it read and found damaged. */

import type {
  DamagedHubRecord,
  DamagedRow,
  HubRecordFeature,
} from "../protocol";

/** What a {@link DamagedRow} says to the person: what happened, and the way out (DESIGN.md's error formula). */
export const damagedWords = (damaged: DamagedRow): string =>
  damaged.remedy === "archive"
    ? `This workspace's record is damaged: ${damaged.file} (${damaged.reason}). Archive workspace ${damaged.workspaceId ?? ""} to remove it. Every other workspace runs as before.`
    : `This session's record is damaged: ${damaged.file} (${damaged.reason}). Its wake-ups are not known until its next turn ends, which writes the record whole again. Stop the session to remove it.`;

/** What a damaged hub record says to the person, and its way out (DESIGN.md's error formula). */
export const damagedHubRecordWords = (
  feature: HubRecordFeature,
  damaged: DamagedHubRecord
): string =>
  `This hub's ${feature} record is damaged: ${damaged.file} (${damaged.reason}). ${feature === "notices" ? "Notices are off" : "Updates are off"} until you reset it; Reset writes a fresh record.`;
