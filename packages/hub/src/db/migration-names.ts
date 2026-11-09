import { FILE_HASH_SCHEME } from "@cawco/core/file-hash";

/**
 * The name each once-step keeps in `data_migrations`, spelled as live hubs
 * hold it: the steps db/migrate.ts runs, and those the hub runs itself as it
 * starts, once what they read exists. A leaf: feature code and the steps
 * import it without the database.
 */
/** server.ts `keepSendsAtStart`, through db `migrateSendsOnce`. */
export const TAG_MARKERS = "tag-markers";
/** server.ts `repairSplitContinuations`. */
export const SPLIT_CONTINUATIONS = "split_continuations:2026-11-05";
/** settled-names.ts `nameSettledOnce`. */
export const SETTLED_NAMES = "settled_member_names";
/** settling.ts `takeBackPickedOnce`. */
export const PICKED_TAKEN_BACK = "picked_cards_taken_back";
/** artifact-titles.ts `titleUntitledOnce`. */
export const ARTIFACT_TITLES = "artifact_titles";
/** db `versionStoredOnce`, at the hub's boot. */
export const SKILL_PLUGIN_VERSIONS = "skill_plugin_versions";
/** db `sshMachines.claim`. */
export const SSH_MACHINES_HUB = "ssh_machines_hub";
/** db/migrate.ts's `opened` step, rehash-stored-files.ts. */
export const FILE_HASHES = `file_hashes:${FILE_HASH_SCHEME}`;
