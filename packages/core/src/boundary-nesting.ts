/**
 * A Linux workspace boundary started inside another bwrap sandbox, on a host
 * whose AppArmor loads Ubuntu's `bwrap-userns-restrict` profile (apparmor
 * 4.1+, gitlab.com/apparmor/apparmor profiles/extras/bwrap-userns-restrict):
 * "bwrap is allowed access to user namespaces and capabilities within the
 * user namespace, but its children do not have capabilities". Its
 * `unpriv_bwrap` stacks onto everything beneath (`audit deny capability`,
 * `allow pix /** -> &unpriv_bwrap`), so a bwrap started in there makes its
 * user namespace but is refused the CAP_SYS_ADMIN its mount, pid and net
 * namespaces need. A scratch fleet run from inside a workspace meets it the
 * moment Caw's place or a delegate's clone needs a boundary of its own.
 *
 * Nothing CawCo runs without root can change that: a deny beats any allow a
 * `local/unpriv_bwrap` adds, and the sandbox's no-new-privs keeps a
 * transition back to the `bwrap` profile from being taken. It is the host's
 * setting, so the words say so, and the hub names its commands once
 * ({@link sayNestedBoundaryFix}). Dependency-free: the boundary host
 * (`boundary-host.ts`) bundles it.
 */

/** The AppArmor profile that strips capabilities beneath bwrap. */
export const NESTED_BOUNDARY_PROFILE = "/etc/apparmor.d/bwrap-userns-restrict";

/** The AppArmor profile name a process beneath bwrap carries in its label. */
export const NESTED_BOUNDARY_LABEL = "unpriv_bwrap";

/**
 * The host change that lets a boundary start inside another, as root: the
 * profile disabled across reboots and upgrades, then unloaded now. On a host
 * with `kernel.apparmor_restrict_unprivileged_userns=0` bwrap then runs
 * unconfined like any other program, and each boundary inside another makes
 * its own namespaces. It lets code inside any bwrap sandbox make user
 * namespaces that hold capabilities within them, as any unconfined program
 * there already can; with that sysctl at 1, bwrap needs the profile to start
 * at all, so the two change together.
 */
export const NESTED_BOUNDARY_ROOT_COMMANDS = [
  `sudo ln -s ${NESTED_BOUNDARY_PROFILE} /etc/apparmor.d/disable/bwrap-userns-restrict`,
  `sudo apparmor_parser -R ${NESTED_BOUNDARY_PROFILE}`,
] as const;

/** What every refusal of this kind says, by which the hub knows it. */
const MARK = "is a host setting, not CawCo's";

/** The boundary host's words when it runs under `label` and its bwrap is refused. */
export const nestedBoundaryReason = (label: string): string =>
  `this machine's CawCo runs inside another bwrap sandbox (AppArmor ${label}), and the host's AppArmor profile ${NESTED_BOUNDARY_PROFILE} denies every capability to what runs beneath bwrap, so a boundary cannot start inside it. That ${MARK}: the hub's log names the two root commands that turn the profile off`;

/** Whether `reason` (a failed spawn or wake) is this refusal. */
export const isNestedBoundaryRefusal = (reason: string): boolean =>
  reason.includes(MARK) && reason.includes(NESTED_BOUNDARY_PROFILE);

let said = false;

/**
 * Logs the host change once per hub process, the first time a refusal of
 * this kind reaches it; every later one is said by its own error alone.
 */
export const sayNestedBoundaryFix = (reason: string): void => {
  if (said || !isNestedBoundaryRefusal(reason)) {
    return;
  }
  said = true;
  console.warn(
    `[boundary] a workspace boundary was refused inside another bwrap sandbox by ${NESTED_BOUNDARY_PROFILE} (a host setting). To let boundaries nest, run as root:\n  ${NESTED_BOUNDARY_ROOT_COMMANDS.join("\n  ")}\nThis lets code inside any bwrap sandbox on that machine make user namespaces holding capabilities within them, as every unconfined program can while kernel.apparmor_restrict_unprivileged_userns is 0; with it at 1, bwrap needs the profile to start at all.`
  );
};
