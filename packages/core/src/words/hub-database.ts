/**
 * What the hub, the installer, `cawco service install` and `cawco status`
 * say about a hub database that holds a migration this build does not have
 * (core migration-state.ts): the hub does not open it.
 */
export const hubDatabaseWords = {
  /**
   * The database at `path` holds migrations this build does not have (core
   * migration-state.ts), each said by {@link hubDatabaseWords.migration}: the
   * hub does not open it. `out` is the way out for the case at hand
   * ({@link hubDatabaseWords.outOfCopy}, {@link hubDatabaseWords.outOfCheckout}
   * or {@link hubDatabaseWords.outOfBuild}).
   */
  unknown: (path: string, migrations: readonly string[], out: string) =>
    `${path} holds ${migrations.length === 1 ? "a migration" : `${migrations.length} migrations`} this build of CawCo doesn't have (${migrations.join("; ")}), so this hub doesn't open it. ${out}`,
  /** One such migration: when it was written (ISO) and its hash's first 12 characters. */
  migration: (time: string, hash: string) => `written ${time}, hash ${hash}`,
  /**
   * The hub applied this build's pending migrations to the database at
   * `path`, and a table or column the schema declares (`missing`) was not
   * there after: nothing was kept. `behind`: the pending ones applied behind
   * a later one the database held already, as `<tag> behind <tag>`.
   */
  missingAfterApply: (
    path: string,
    missing: string,
    applied: readonly string[],
    behind: readonly string[]
  ) =>
    `${path} wasn't opened: applying ${applied.join(", ")} left ${missing} missing, so none of them was kept and the database is as it was.${behind.length > 0 ? ` Applied out of order: ${behind.join(", ")}.` : ""}`,
  /** The way out where the hub runs from a checkout (`bun run dev`, a service installed from one, migrations:check). */
  outOfCheckout:
    "Rebase this checkout onto a branch that has that migration, or set CAWCO_DB_PATH to another database.",
  /**
   * The way out where the update helper's copy from before an update lies
   * beside the database (core update-copies.ts `copyBeforeUpdate`), in place
   * of the checkout's or the build's.
   */
  outOfCopy: (copy: string) =>
    `The copy from before the update is ${copy}: putting it in place of this database lets this hub start, and loses what the hub stored since the update.`,
  /** The way out where the hub is a build. */
  outOfBuild: "Install a build that has it.",
  /** `cawco status` on the hub's machine, when the hub does not answer and its last start stopped for this. */
  down: (why: string) => `the hub is down: ${why}`,
};
