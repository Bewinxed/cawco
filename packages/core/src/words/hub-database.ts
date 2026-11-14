/**
 * What the hub, the installer, `cawco service install` and `cawco status`
 * say about a hub database a newer build of CawCo migrated (core
 * migrations-ahead.ts): the hub does not open it.
 */
export const hubDatabaseWords = {
  /**
   * The database at `path` holds `count` migrations newer than this build's
   * newest, the newest written at `time` (ISO, its journal `when`): the hub does not open it. `out`
   * is the way out for the case at hand ({@link hubDatabaseWords.outOfCopy},
   * {@link hubDatabaseWords.outOfCheckout} or {@link hubDatabaseWords.outOfBuild}).
   */
  newer: (path: string, count: number, time: string, out: string) =>
    `${path} was migrated by a newer build of CawCo: it holds ${count === 1 ? "1 migration" : `${count} migrations`} newer than this build's, the newest written ${time}, so this hub doesn't open it. ${out}`,
  /** The way out where the hub runs from a checkout (`bun run dev`, a service installed from one, migrations:check). */
  outOfCheckout:
    "Rebase this checkout onto a branch that has that migration, or set CAWCO_DB_PATH to another database.",
  /**
   * The way out where the update helper's copy from before an update lies
   * beside the database (core update-copies.ts `copyBeforeUpdate`), in place
   * of the checkout's or the build's.
   */
  outOfCopy: (copy: string) =>
    `The copy from before the update is ${copy}: putting it in place of this database restores the hub as it was before the update, without what it stored since.`,
  /** The way out where the hub is a build. */
  outOfBuild: "Install the build that migrated it, or a newer one.",
  /** `cawco status` on the hub's machine, when the hub does not answer and its last start stopped for this. */
  down: (why: string) => `the hub is down: ${why}`,
};
