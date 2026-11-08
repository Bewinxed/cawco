/** The control verbs the hub calls on a machine's accounts. */

/**
 * Claude harness controls for one account's dir on a machine. Begin starts
 * Claude Code's own `claude auth login` in `~/.cawco/accounts/<id>/claude`
 * (args: account id, kind) and answers `{ url }`; complete types the pasted
 * code into it (args: code, account id, the identity the account already has
 * or null) and answers an {@link AccountSigninResult}; forget runs
 * `claude auth logout` there and deletes the dir (args: account id, and the
 * account it joins or null), each session that ran there carried first into
 * the joined account's dir, else into the dir of a session on no account.
 */
export const CONTROL_BEGIN_ACCOUNT_LOGIN = "beginAccountLogin";
export const CONTROL_COMPLETE_ACCOUNT_LOGIN = "completeAccountLogin";
export const CONTROL_FORGET_ACCOUNT = "forgetAccount";
/**
 * Claude harness control: read one account dir's initialize response with a
 * session that never takes a turn (arg: account id), answering an
 * {@link AccountProbe}.
 */
export const CONTROL_PROBE_ACCOUNT = "probeAccount";
/**
 * Claude harness control: one real turn as an account in its dir (arg:
 * account id), which the API answers or refuses: the hub's check of an
 * account Claude Code refused account-wide. Answers an {@link AccountCheck}.
 */
export const CONTROL_CHECK_ACCOUNT = "checkAccount";

/**
 * The one-time move of a machine's own Claude Code login into CawCo, run
 * once per machine when the operator asks (`POST /api/accounts/move-login`
 * with store `claude`). Read answers who the machine's `~/.claude` is signed
 * in as, a {@link HomeLogin} (no args). Move (args: account id, the identity
 * read) moves that login's credential and `oauthAccount` into the account's
 * dir, checks the dir answers as the identity, and only then deletes the
 * original; it answers a {@link HomeLoginMoved}.
 */
export const CONTROL_READ_HOME_LOGIN = "readHomeLogin";
export const CONTROL_MOVE_HOME_LOGIN = "moveHomeLogin";

/**
 * A sign-in that came out as an identity another account already is: its
 * login joins that account's store on the machine (args: the new account's
 * id, the existing account's id, the identity). When the existing account
 * already holds a login there, the new one is a second grant of the same
 * person and is signed out and dropped; else it moves into the existing
 * account's store (Claude: credential and `oauthAccount`, checked to answer
 * as the identity before the new dir is dropped). Answers an
 * {@link AccountJoinedOn}. Claude's is a Claude harness control; any other
 * provider's the agent's own.
 */
export const CONTROL_JOIN_ACCOUNT_LOGIN = "joinAccountLogin";
export const CONTROL_JOIN_PROVIDER_ACCOUNT = "joinProviderAccount";

/**
 * pi harness control (arg: the session's directory): the model pi starts a
 * new session on there when none is named, as pi picks it (its saved
 * default from the global settings and `<cwd>/.pi/settings.json` merged,
 * when that model's provider has auth configured, accounts counted), as
 * `provider/id`; null when pi would pick among the machine's own providers.
 */
export const CONTROL_PI_DEFAULT_MODEL = "piDefaultModel";

/**
 * One account, one grant: a machine whose own sign-in of an account's
 * identity has expired runs on the account's working sign-in, held and
 * refreshed only by the machine that holds it (the lender). The borrower's
 * store holds the lender's access token and its expiry, never a refresh
 * token ({@link BORROWED_REFRESH} where one would be), and asks the hub for
 * a fresh one near its expiry ({@link AccountBorrowFrame}); the hub asks the
 * lender ({@link CONTROL_LEND_ACCOUNT}) and answers the borrower
 * ({@link CONTROL_ACCOUNT_LENT}). Refresh tokens rotate, so a second
 * refresher would sign the first out; an access token used by two machines
 * signs nobody out.
 *
 * - Lend (args: account id) refreshes the account's own sign-in when it is
 *   near its expiry and answers a {@link LentAccess}; refused by a machine
 *   whose own copy is borrowed, or that holds no sign-in of the account.
 * - Borrow (args: account id, lender machine id, a {@link LentAccess}, the
 *   store and the provider in it whose own credential expired, the identity)
 *   writes the lent access into the account's store, checks it answers, and
 *   then removes the expired entry from that store, as a move does; it
 *   answers a {@link HomeLoginMoved}.
 * - Lent (args: the {@link AccountBorrowFrame}'s request id, a
 *   {@link LentAccess} or `{ error }`) answers a borrower's ask: the fresh
 *   access written into its store, or why there is none.
 */
export const CONTROL_LEND_ACCOUNT = "lendAccount";
export const CONTROL_BORROW_ACCOUNT = "borrowAccount";
export const CONTROL_ACCOUNT_LENT = "accountLent";

/**
 * Machine controls for every account of a provider other than Claude's, run
 * by the agent itself (no harness: the one credential serves them all).
 *
 * - Begin (args: account id, provider) starts pi-ai's own OAuth sign-in for
 *   the provider into the account's store and answers a
 *   {@link ProviderSigninChallenge}.
 * - Complete (args: code or null, account id, the identity the account
 *   already has or null) answers a {@link ProviderSigninResult}: a code
 *   pasted into a sign-in that asked for one; else it waits up to a minute
 *   for the person to enter the device code.
 * - Key (args: account id, provider, key) writes a key the person typed in
 *   the dashboard into the account's store, relayed by the hub and never
 *   kept there; it answers a {@link ProviderSigninResult}.
 * - Forget (args: account id) signs the store out and deletes it.
 * - Fresh (args: account id) refreshes an OAuth credential through pi-ai's
 *   own refresh when it is near its expiry; the only writer of the store.
 */
export const CONTROL_BEGIN_PROVIDER_LOGIN = "beginProviderLogin";
export const CONTROL_COMPLETE_PROVIDER_LOGIN = "completeProviderLogin";
export const CONTROL_SET_PROVIDER_KEY = "setProviderKey";
export const CONTROL_FORGET_PROVIDER_ACCOUNT = "forgetProviderAccount";

/**
 * The one-time move of the machine's own pi and OpenCode credentials into
 * accounts, which the hub starts for each one when the machine connects
 * (and `POST /api/accounts/move-login` for one). Read (no args) answers every entry in pi's own `auth.json` and
 * OpenCode's own `auth.json` a CawCo account can hold, a {@link
 * HomeCredential} each (a Claude subscription's OAuth there is never listed).
 * Move (args: account id, store, provider in that store, the identity read)
 * writes it into the account's store, checks the account answers, and only
 * then removes the entry from that store; it answers a {@link HomeLoginMoved}.
 */
export const CONTROL_READ_HOME_CREDENTIALS = "readHomeCredentials";
export const CONTROL_MOVE_HOME_CREDENTIAL = "moveHomeCredential";
