/**
 * Writes made on this machine with its own sign-in (docs/forge-adapters.md,
 * provider spec §2.8 D4): the hub's write door sends one
 * (`CONTROL_FORGE_POST`: a session's `forge_post`, a landing's pull or
 * merge request, usability feedback), and {@link forgePost} finds the forge
 * the repository's host is on and the host's sign-in there ({@link forgeOn},
 * each forge's CLI asked), makes that forge's provider's client from the
 * sign-in (GitHub's Octokit, GitLab's @gitbeaker/rest, Gitea's gitea-mcp)
 * and runs its provider's `writes.run`: the same writes the hub makes with
 * a connection. It answers what the write made, which the door records.
 *
 * The credential is read on the host, used here, and never sent anywhere but
 * its forge.
 */
import type { ForgeAsk, ForgeVerdict } from "@cawco/core/forge-post";
import { externalItemWords } from "@cawco/core/words/external-items";
import { giteaWrites } from "@cawco/providers/gitea/writes";
import { githubTokenClient } from "@cawco/providers/github/client";
import { githubWrites } from "@cawco/providers/github/writes";
import { gitlabClient } from "@cawco/providers/gitlab/client";
import { gitlabWrites } from "@cawco/providers/gitlab/writes";
import type { ForgeId, WriteMade } from "@cawco/providers/provider";
import {
  failureWords,
  type ProviderFailure,
  ProviderUnanswered,
} from "@cawco/providers/read-stop";
import { repoAt } from "@cawco/providers/registry";
import { Effect, Result } from "effect";
import type { ForgeLogin, ForgeSignIn } from "./forge-adapter";
import { giteaCaller, giteaLogin } from "./gitea-sign-in";
import { githubLogin } from "./github-sign-in";
import { gitlabLogin } from "./gitlab-sign-in";

/** Every forge's login. A host is the forge whose CLI alone signs in to it ({@link forgeOn}). */
const FORGE_LOGINS: readonly ForgeLogin[] = [
  githubLogin,
  gitlabLogin,
  giteaLogin,
];

/** How long one write may take here, all its requests together. Our choice. */
const CALL_MS = 60_000;

/** Each forge's CLI, as the person signs it in. */
const CLI_OF: Record<ForgeId, string> = {
  github: "gh",
  gitlab: "glab",
  gitea: "tea",
};

/**
 * The forge `host` is on, with the host's sign-in there; or why there is
 * none, in words. Every forge's CLI is asked: the host is a forge's when
 * that CLI alone keeps a login that could be it (a usable sign-in, or one
 * it names but cannot use). When more than one could be, which forge the
 * repository is on is not CawCo's to guess, and the session is asked for
 * the repository's URL, its port and all, which names one login.
 */
const forgeOn = async (
  host: string
): Promise<{ forge: ForgeId; signIn: ForgeSignIn } | string> => {
  const found = await Promise.all(
    FORGE_LOGINS.map(async (login) => ({
      forge: login.forge,
      signIn: await login.signIn(host),
    }))
  );
  const logins = found.filter(
    (each): each is { forge: ForgeId; signIn: ForgeSignIn | string } =>
      each.signIn !== undefined
  );
  const [only] = logins;
  if (logins.length > 1) {
    const named = logins
      .map(({ forge, signIn }) =>
        typeof signIn === "object"
          ? `${externalItemWords.source[forge]} through ${CLI_OF[forge]} at ${signIn.host}`
          : `${externalItemWords.source[forge]} through ${CLI_OF[forge]}`
      )
      .join(", ");
    const example =
      logins
        .map(({ signIn }) => (typeof signIn === "object" ? signIn.host : host))
        .find((each) => each !== host) ?? host;
    return `this machine signs in to ${host} as more than one forge (${named}), so which one the repository is on is not CawCo's to guess. Name the repository by its URL, its port included when its forge has one, with repo (for example repo: "https://${example}/owner/name"), and post again.`;
  }
  if (!only) {
    return `this machine has no sign-in on ${host}: neither gh, glab nor tea is signed in there (gh auth login --hostname ${host}, glab auth login --hostname ${host}, or tea login add --url https://${host}).`;
  }
  return typeof only.signIn === "object"
    ? { forge: only.forge, signIn: only.signIn }
    : only.signIn;
};

/** One write through the forge's provider, its client made from the host's sign-in. */
const written = (
  forge: ForgeId,
  signIn: ForgeSignIn,
  path: string,
  op: ForgeAsk["op"]
): Effect.Effect<WriteMade, ProviderFailure> => {
  switch (forge) {
    case "github":
      return githubWrites.run(
        githubTokenClient({
          api: signIn.api,
          token: signIn.token,
          userAgent: "CawCo",
          ...(signIn.socket ? { socket: signIn.socket } : {}),
        }),
        path,
        op
      );
    case "gitlab":
      return gitlabWrites.run(
        gitlabClient({ api: signIn.api, token: signIn.token }),
        path,
        op
      );
    case "gitea":
      return giteaWrites.run({ call: giteaCaller(signIn) }, path, op);
  }
};

/** What a made write hands back: what it made and the events it caused, no revision, which the hub reads off the item itself. */
const madeOf = (made: WriteMade): WriteMade => ({
  item: made.item,
  ...(made.comment ? { comment: made.comment } : {}),
  ...(made.existing === undefined ? {} : { existing: made.existing }),
  ...(made.events ? { events: made.events } : {}),
});

/**
 * A write the hub's write door sent: the repository's forge and the host's
 * sign-in there found by its host, then made once with that sign-in,
 * within {@link CALL_MS}.
 */
export const forgePost = async (ask: ForgeAsk): Promise<ForgeVerdict> => {
  const at = repoAt(ask.repo);
  if (!at) {
    return {
      kind: "refused",
      why: `cawco: ${ask.repo} names no repository on a forge: give its URL or host/owner/repo.`,
    };
  }
  const found = await forgeOn(at.host);
  if (typeof found === "string") {
    return { kind: "refused", why: `cawco: nothing was posted: ${found}` };
  }
  const { forge, signIn } = found;
  const what = `${externalItemWords.source[forge]} on ${signIn.host}`;
  const outcome = await Effect.runPromise(
    Effect.result(
      written(forge, signIn, at.path, ask.op).pipe(
        Effect.timeoutOrElse({
          duration: CALL_MS,
          orElse: () =>
            Effect.fail(
              new ProviderUnanswered({ service: what, after: CALL_MS })
            ),
        })
      )
    )
  );
  if (Result.isFailure(outcome)) {
    return {
      kind: "refused",
      why: `${what} failed: ${failureWords(outcome.failure)}`,
    };
  }
  return {
    kind: "written",
    provider: forge,
    host: signIn.host,
    container: at.path.toLowerCase(),
    made: madeOf(outcome.success),
  };
};
