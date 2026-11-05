/**
 * The artifact panel bench's records: real ones, read off the hub with
 * comment_read and artifact_list on 2026-11-05, cut to the fields the panel
 * draws. The pins are the owner's five on the decision page title-bars-close,
 * each thread as it stands (long replies cut at
 * a sentence). The artifacts are the session's, newest first, each titled by
 * its ask: the title its agent will write is being added to the tools, and
 * the ask is what the agent wrote in words until it is.
 */

import type { Pin, ThreadEntry } from "@cawco/core/comments";
import type { ArtifactSummary } from "@cawco/core/protocol";

const said = (
  id: string,
  by: ThreadEntry["by"],
  at: string,
  text: string
): ThreadEntry => ({ id, by, at, text });

const pin = (
  id: string,
  number: number,
  at: string,
  title: string,
  thread: ThreadEntry[],
  seenAt?: string
): Pin => ({
  id,
  number,
  kind: "comment",
  by: "person",
  at,
  sentAt: at,
  ...(seenAt ? { seenAt } : {}),
  title,
  anchor: { selector: `#pin-${number}`, source: null, text: title },
  elements: [],
  thread,
});

export const PINS: Pin[] = [
  pin(
    "2d664dcd-8ace-480f-9dc0-c5ad76417fe4",
    1,
    "2026-11-03T16:15:49.810Z",
    "Input · Search comments",
    [
      said(
        "29c65622",
        "person",
        "2026-11-03T16:15:49.810Z",
        'see how much wasted space on the top left there is? u should just push everything up, this "choose comment, then click something" is again, useless copy, search can be a glass search button on the top bar, floating, and everything below, it\'s that simple'
      ),
      said(
        "6f161869",
        "agent",
        "2026-11-03T16:16:21.703Z",
        "Read in the code (`CommentRail.svelte`). Today the rail stacks three bands. The glass group floats on the right with an empty strip to its left."
      ),
      said(
        "82e770a1",
        "person",
        "2026-11-03T16:19:00.205Z",
        'actually this whole preview card should also follow, and get the same treatment, see theres" comments at the top, then "comments" at the title below, many buttons, check grouping and redo this section too'
      ),
      said(
        "ea9b7309",
        "agent",
        "2026-11-03T19:20:55.280Z",
        "It's in, on the branch, for the rail, the thread card and the panel together."
      ),
    ],
    "2026-11-04T04:56:07.972Z"
  ),
  pin(
    "3010a590-dd84-4be9-8742-6d879f2a172e",
    2,
    "2026-11-05T09:26:30.436Z",
    "Tooltip primitive provider · Open Resolved No open comments",
    [
      said(
        "c7c3cf13",
        "person",
        "2026-11-05T09:26:30.436Z",
        "so a full row with these controls, and another full row with just teh tabs is an ok thing for you? you're missing the whole point, check HIG and stop fixing things in isolation"
      ),
      said(
        "4723bb66",
        "agent",
        "2026-11-05T09:36:19.031Z",
        "You're right. That question treated Close on its own, and both options kept a whole row of controls with a second row just for Open | Resolved."
      ),
    ]
  ),
  pin(
    "a947fc7d-d7c6-4e07-a918-0323b31ac509",
    3,
    "2026-11-05T09:36:20.625Z",
    "On a phone, does the Comments sheet's Close share a group with Search, Sort and Comment on the whole page?",
    [
      said(
        "eb52e9b8",
        "person",
        "2026-11-05T09:36:20.625Z",
        "please stop designing things in isolation, now you have a glass-like thing at the top that takes up a full row, and then a tab on teh 2nd row that's taking a full row and wastes space on the right, left on the fifrst row.\n\nyou're missing the whole point of these title rows redesign, did you read apples' HIG?"
      ),
      said(
        "0bea971d",
        "agent",
        "2026-11-05T09:36:57.304Z",
        "Agreed. Both options kept a full glass row of controls with a second full row just for the tabs."
      ),
    ],
    "2026-11-05T09:38:16.637Z"
  ),
  pin(
    "c3524a18-6519-48db-a76a-41ca30432311",
    4,
    "2026-11-05T09:36:45.412Z",
    "What names the artifact at the head of its panel?",
    [
      said(
        "2c8e1e00",
        "person",
        "2026-11-05T09:36:45.412Z",
        "its name, and each preview must be titled by the agent, slugs are for slugs, not humans!"
      ),
      said(
        "ced39c67",
        "person",
        "2026-11-05T09:37:06.213Z",
        "check how HIG shows card/titles etc..."
      ),
      said(
        "931a5b95",
        "person",
        "2026-11-05T09:37:36.337Z",
        "also the popover should open same as the caw icon on the top right of the web app, connected, why do we keep repeating this mistake"
      ),
      said(
        "8b4ed04a",
        "agent",
        "2026-11-05T09:41:06.520Z",
        "Agreed on the popover. The artifacts menu, and any menu opened from a bar, opens connected to its trigger, the way Caw's card grows out of his head."
      ),
    ],
    "2026-11-05T09:43:36.100Z"
  ),
  pin(
    "b1932ca8-a423-4914-bd73-03441aec746f",
    5,
    "2026-11-05T09:38:10.489Z",
    "Floating layer anchor · Title bars close",
    [
      said(
        "d3d79a29",
        "person",
        "2026-11-05T09:38:10.489Z",
        "this isn't even sized apporpriate to the group of buttonss on teh right, check HIG"
      ),
      said(
        "6076d285",
        "person",
        "2026-11-05T09:43:16.276Z",
        "i didn't say that, i say ask what HIG does"
      ),
      said(
        "5d785a84",
        "person",
        "2026-11-05T09:43:27.139Z",
        "are you sizing the buttons too big, or the title too small, or wrong design"
      ),
      said(
        "7f4706ac",
        "agent",
        "2026-11-05T09:44:46.795Z",
        "Read from the drawing's code against the HIG: the title is too small, and it's the wrong design. The buttons aren't too big."
      ),
    ],
    "2026-11-05T09:43:31.611Z"
  ),
];

const artifact = (
  id: string,
  name: string,
  ask: string,
  createdAt: string,
  waiting = false
): ArtifactSummary & { title: string } => ({
  id,
  name,
  title: ask,
  ask,
  kind: "page",
  does: "pick",
  createdAt,
  updatedAt: createdAt,
  shownAt: createdAt,
  pending: null,
  promoted: null,
  sent: false,
  thumbnail: null,
  waiting,
});

/** The session's artifacts, newest first: the one shown first. */
export const ARTIFACTS = [
  artifact(
    "109f7c53-44db-47c7-bc7f-7805647dd14a",
    "title-bars-close",
    "Pick where Close stands where Apple's guidelines and DESIGN.md disagree",
    "2026-11-03T11:48:16.691Z",
    true
  ),
  artifact(
    "11ac93d3-eadf-4258-b030-796990595807",
    "graph-cutover-questions",
    "Answer three questions before the design graph replaces the component canvas",
    "2026-11-04T19:15:26.372Z",
    true
  ),
  artifact(
    "669f4274-b781-4432-87fb-118b1fc00830",
    "filing-nudge",
    "Pick how a session files and compacts when its context fills",
    "2026-11-04T08:10:00.000Z"
  ),
  artifact(
    "422bef6c-0670-46f4-a38d-dcc088d5708f",
    "preview-lifetime",
    "Pick what a handed-up preview shows and what happens when its workspace is gone",
    "2026-11-04T07:30:00.000Z"
  ),
];
