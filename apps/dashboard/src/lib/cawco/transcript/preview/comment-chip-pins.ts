/**
 * His real comments, for the comment chip's states files: pins 1 and 2 on
 * the comment-sizing preview (756bc8c4, comment_read of 10-25 06:36Z, as
 * design-previews/tablet-comments/pins.json keeps them) and pin 1 on
 * shipped-without-approval (2bede487, comment_read of 10-26 18:07Z). Their
 * words, times and threads are his and the agents' as written; pin 1's
 * thread is its first six entries. The resolve on the last one is the only
 * stamp of ours: none of his comments the preview could read stands
 * resolved.
 */
import type { Pin } from "@cawco/core/comments";

/** The comment-sizing preview, as a chip names its artifact. */
export const SIZING = {
  id: "756bc8c4-c87e-4e9d-9c78-2a38ce171815",
  kind: "preview",
  name: "comment-sizing",
} as const;

/** The keep-or-roll-back page, as a chip names its artifact. */
export const SHIPPED = {
  id: "2bede487-a0ce-458f-a447-934f702e5915",
  kind: "page",
  name: "shipped-without-approval",
} as const;

/** Who answers in these threads, as the transcript names the session. */
export const AGENT = "Orchestrate cockpit fleet work";

/** Pin 1 on comment-sizing, "Play the opening again": his comment and five entries after it. */
export const opening: Pin = {
  id: "d59c176e-88b1-49d4-bf77-2eb5f44000d1",
  number: 1,
  kind: "comment",
  at: "2026-10-25T04:10:16.313Z",
  by: "person",
  sentAt: "2026-10-25T04:10:19.466Z",
  seenAt: "2026-10-25T05:58:23.558Z",
  anchor: {
    selector:
      "body > header:nth-of-type(1) > fieldset:nth-of-type(3) > button:nth-of-type(1)",
    source: null,
    text: "Play the opening again",
    box: {
      x: 407,
      y: 208,
      w: 140,
      h: 30,
    },
  },
  elements: [],
  thread: [
    {
      id: "ff26f863-e1cd-406b-a12f-5015e085740c",
      by: "person",
      text: 'why is the panel animation from bottom left when it should be "growing" from the comment just how we do the hover menu? it should show besides the comment but should have handling to grow taller when appropriate',
      at: "2026-10-25T04:10:16.313Z",
      sentAt: "2026-10-25T04:10:19.466Z",
    },
    {
      id: "a708bf2b-d805-4dcf-b6fa-f6a9abb92678",
      by: "agent",
      text: "Here's what I understand. The thread card should open from its comment the way the hover menu opens from its trigger, growing out of the comment's spot instead of sliding up from the bottom left. It sits beside the comment, and it grows taller when the thread needs the room, up to what fits on screen beside the comment, rather than staying a small box stuck at the foot of the page.\n\nThat's today's card (option A is what ships, copied line for line), so it's a fix to the product, not only to the preview. It's being built on the hover menu's own grow-from-the-trigger motion. The preview's A gets redrawn from the fixed card, so you can play the opening again and see it, and A's line on the decision card changes to match.",
      at: "2026-10-25T04:10:46.234Z",
    },
    {
      id: "9f05e474-6406-4f85-ab49-0cac53c7107c",
      by: "agent",
      text: "Built, and it ships in the next release. The thread card now grows out of its pin with the hover menu's own pop motion, from the edge facing the pin and at the pin's height, never a corner. It stands as tall as the thread needs, moves up to stay whole near the bottom of the page, and scrolls only when even the full pane can't hold it. In your window, your long thread now opens 702 px tall beside its pin, whole on screen. This preview's A is redrawn from the fixed card, so play the opening again to see it. A's line on the decision card is updated too: the width question is still yours to pick.",
      at: "2026-10-25T04:50:29.485Z",
    },
    {
      id: "1dfb519e-70f7-47c7-8fbe-00aca00dc2dd",
      by: "person",
      text: 'you are cheating again, this is just a "fly in" animation, not a gooey animation that morphs out of the comment just how the caw/search/machine bar on the top right does it, DO NOT CHEAT',
      at: "2026-10-25T04:55:50.845Z",
      sentAt: "2026-10-25T04:55:55.250Z",
    },
    {
      id: "3c2a574c-6148-42d3-9beb-75814d2659ac",
      by: "agent",
      text: "Here's what I understand: what opens now is a pop-in, the card scaling up from near its pin and fading in. What you asked for is a morph: the comment's own pill stretches and grows into the card, one shape the whole way, the way Caw's search/machine bar at the top right morphs open. No separate card appears beside it.\n\nYou're right, and it's mine. I briefed it as \"the hover menu's grow\", and the builder used the popover's pop. That's a fly-in with a better origin, not the morph you described. The builder now has your words verbatim and the top bar as the reference. The pill becomes the card using the same morph code the top bar uses, one continuous shape (position, size, corner radius and fill all travel together), with the content fading in only once the shape has room. Closing reverses it back into the pill.\n\nThe check will step the motion through its frames and read that there is one element throughout, the pill's box at 0 and the card's at 1, with no separate card ever appearing. Then you'll see it here before anything else is called done.",
      at: "2026-10-25T04:56:15.038Z",
    },
    {
      id: "bd6d6286-d0fb-456b-84ea-f5df6a8bc8e1",
      by: "person",
      text: 'looks like all failures lead to your "brief" :/',
      at: "2026-10-25T05:02:30.022Z",
      sentAt: "2026-10-25T05:02:33.098Z",
    },
  ],
};

/** Pin 2 on comment-sizing, the away-notes card: his comment and four entries after it. */
export const awayNotes: Pin = {
  id: "6d9c4242-6996-4a0c-b69f-39cc1717d78f",
  number: 2,
  kind: "comment",
  at: "2026-10-25T04:54:41.347Z",
  by: "person",
  sentAt: "2026-10-25T04:54:44.460Z",
  seenAt: "2026-10-25T05:52:54.474Z",
  anchor: {
    selector:
      '[data-option="a"] > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1)',
    source: null,
    text: "on Where should the away notes sit? Recommended: In the rail In the rail. The notes collect in the Comments rail, its tab counting the new ones. You 42m",
    box: {
      x: 627,
      y: 542,
      w: 408,
      h: 300,
    },
  },
  elements: [],
  thread: [
    {
      id: "113233f9-31ef-47f1-8842-65e779eb5904",
      by: "person",
      text: "when scrolling the page why does this jump up and down instead of animating its position? why do you seem to dismiss our motion rules recently?",
      at: "2026-10-25T04:54:41.347Z",
      sentAt: "2026-10-25T04:54:44.460Z",
    },
    {
      id: "ec2624fd-070a-485f-bbe3-245c0c04065d",
      by: "agent",
      text: "Here's what I understand: when you scroll the page with a thread open, the card jumps to new positions instead of moving with its pin. That breaks our first motion rule, never teleport. Your screenshot shows a second fault too: the card scrolls sideways. The quote line is cut at \"new on\", and there are two horizontal scrollbars, one under the thread and one under the reply box.\n\nWhy it slipped: my brief for the fix covered how the card opens and how tall it gets, and nothing in it scrolled the page. So no check ever saw the card move during a scroll, or saw it overflow sideways. That's on me, not the rules.\n\nIt's back with the same builder, who now has both:\n- While the page scrolls, the card moves with its pin in the same frame, as if it were part of the page. Where it has to stop at an edge, it eases there and never snaps.\n- Nothing in the card scrolls sideways: long lines wrap and the reply box fits.\n\nThe checks will now scroll the page and read the card's position on every frame, and sweep for anything sideways at all three widths.",
      at: "2026-10-25T04:55:35.433Z",
    },
    {
      id: "59d7c834-36e4-47fa-9069-2c3ef5608414",
      by: "agent",
      text: "Fixed in this refreshed preview and on main (7018d984b). The card no longer re-picks its side as you scroll, which is what made it jump. It moves with its pin, eases to an edge where it has to stop, and stays where it last stood if the pin scrolls out of view. Nothing in it scrolls sideways any more: long lines wrap and the reply box fits. The check scrolled by wheel steps and read every frame: the card kept its offset from the pin within 1 px and never changed side, on both engines. The overflow sweep at 1440, your 1037×760 and 390 totals 0.\n\nOne thing is still being worked. On a real page inside the preview pane (another site), the card can trail the page by about one frame while you scroll, because the page tells the dashboard where the pin is a frame late. The same builder is measuring it now and building a fix that moves card and page in the same frame.",
      at: "2026-10-25T05:51:25.256Z",
    },
    {
      id: "cd485766-f9cb-4aec-a4bf-5c33b74fe7cd",
      by: "person",
      text: "WRONG, u keep animating it as i scroll down, instead of only letting it move when it reaches the spot where it will move from one spot to the next, it should animate THEN, not animate WHILE i'm scrolling",
      at: "2026-10-25T05:58:12.811Z",
      sentAt: "2026-10-25T05:58:15.886Z",
    },
    {
      id: "79e141c8-33a5-4257-83eb-a90e225b7153",
      by: "agent",
      text: "Here's what I understand: while you scroll, the card shouldn't move at all. It stays where it stands. Only when it reaches the point where it has to move from one spot to the next (its pin leaving the room it stands beside, an edge it can't stand past) does it animate, once, to the new spot. Today it follows the pin the whole way, moving while you scroll, which is wrong.\n\nThat goes word for word to the builder now rebuilding this card as the top bar's hanging card, in the same change. The check then scrolls the page and reads that the card stays still on every frame between spots, and plays one move only at the point where it changes spot.",
      at: "2026-10-25T05:58:34.917Z",
    },
  ],
};

/** Pin 1 on shipped-without-approval, the whole page: resolved here by the agent after its last reply. */
export const askedFor: Pin = {
  ...{
    id: "311f2ea2-84a5-4d02-a53f-2c3e10acb09c",
    number: 1,
    kind: "comment",
    at: "2026-10-26T17:53:07.224Z",
    by: "person",
    anchor: {
      selector: "body",
      source: null,
      box: {
        x: 0,
        y: 0,
        w: 424,
        h: 518,
      },
    },
    elements: [],
    seenAt: "2026-10-26T17:53:48.942Z",
    sentAt: "2026-10-26T17:53:10.296Z",
    thread: [
      {
        id: "6bc7d626-c708-4f32-86ae-96bb1614cbb9",
        by: "person",
        text: "Why are you asking for things that 8 explicitly asked for that you already done and closed? I'm confused",
        at: "2026-10-26T17:53:07.224Z",
        sentAt: "2026-10-26T17:53:10.296Z",
      },
      {
        id: "4fa2933b-bfb0-4016-a076-52bcf80e9bd5",
        by: "agent",
        text: "You're right to be confused. These cards came from an audit on 10-25 that marked every change you hadn't seen as a design before it shipped. It didn't check whether you had asked for the change itself, so some cards ask you to approve things you requested. I'm checking each card against your own messages now. Any card for something you asked for, built the way you asked, comes off the page, and any closed task it belongs to stays closed. I'll update this page in place and reply here with what's left and why.",
        at: "2026-10-26T17:53:20.061Z",
      },
      {
        id: "13947830-a26b-4d1e-8a85-43b7f90260e2",
        by: "agent",
        text: "I checked every card against your own messages. You asked for four of these and they were built the way you asked: comments going by themselves, the change guide (your 10-24 pick, B plus C's chip), dropping Pipeline, and the inline connect card. They're coming off the page. You've already kept sending, tabs and starters.\n\nWhat happens to the rest:\n- **Replies:** your note settles it. A comment exchange becomes a chip like a tool call, and opening it shows the thread with a reply box in a popover. A preview for you to see first is being built.\n- **Offered** is queued as its own design task: [Design how offered subtasks appear on a task](cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-147).\n- **The change guide:** you called it a terrible way to show it, so that's a new design task: [Redesign how a page shows what changed after an agent answers a comment](cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-148).\n- **Motion** gets before and after video.\n- **Still open:** the Decisions list and the hold gate, reworded to what differs from what you asked for; the routine form and the compaction-marker fallback, which you never asked for.",
        at: "2026-10-26T18:05:26.693Z",
      },
    ],
  },
  resolvedAt: "2026-10-26T18:06:02.000Z",
  resolvedBy: "agent",
};
