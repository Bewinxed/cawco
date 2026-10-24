/*
 * Every card of the project's decision pages, read from their sources in the project's folder
 * (decisions/<name>/page.oui, or index.html for the older pages): each question, its options'
 * labels, and the option its writer recommended. Generated once for this preview.
 */
export const CARDS = {
 "three-designs": [
  {
   "q": "How should your own message in a conversation offer Copy, Edit and Fork?",
   "options": [
    "A · Actions on the speaker line",
    "B · A box that hugs its words, actions beside it",
    "C · No buttons: select it, and the message box answers"
   ],
   "rec": 2
  },
  {
   "q": "After an agent answers your comments on a page, how should CawCo show you what changed?",
   "options": [
    "A · A review strip on the page's bar",
    "B · Change lines in each thread, the comments rail as an inbox",
    "C · An update card on the agent's turn, plus a toast"
   ],
   "rec": 0
  },
  {
   "q": "When an agent needs you to sign in to a service, how should it ask?",
   "options": [
    "A · A sign-in ask on the message box, with a choice of access",
    "B · Pick an account you've already connected",
    "C · A card in the conversation that becomes the record"
   ],
   "rec": 0
  },
  {
   "q": "Today a comment's thread card can open over the very thing it's about, and a comment pinned mid-line stands over the line above it. Fix both?",
   "options": [
    "Fix both",
    "Keep as today"
   ],
   "rec": 1
  }
 ],
 "owner-presence": [
  {
   "q": "How long without touching any of your devices before you count as away?",
   "options": [
    "5 minutes",
    "10 minutes"
   ],
   "rec": 0
  },
  {
   "q": "If something waits for you while you're at the desk and you then walk away, does it follow you to your phone?",
   "options": [
    "Only if it landed in the last 10 minutes",
    "Anything still open"
   ],
   "rec": 0
  },
  {
   "q": "What should Appear away do?",
   "options": [
    "Agents go quiet, and the phone gets pushes",
    "Silence everything"
   ],
   "rec": 0
  },
  {
   "q": "When you come back, when does the agent give you the catch-up?",
   "options": [
    "As soon as you open the chat",
    "When you next send a message"
   ],
   "rec": 0
  },
  {
   "q": "Should a Chrome tab report whether you're at the computer?",
   "options": [
    "Yes, offer it",
    "No, leave it to my machines"
   ],
   "rec": 0
  },
  {
   "q": "Where should the away notes sit?",
   "options": [
    "A dated section at the top of the plan's notes",
    "Its own area in the plan panel"
   ],
   "rec": 0
  },
  {
   "q": "Should the plan ring show a mark while there are away notes you haven't seen?",
   "options": [
    "Yes, a small mark on the ring",
    "No mark"
   ],
   "rec": 0
  }
 ],
 "mac-delegate-folder": [
  {
   "q": "On the Mac, how should a delegate get its private copy of a folder?",
   "options": [
    "An APFS clone of the folder",
    "A live layer on the Mac too (AgentFS)"
   ],
   "rec": 0
  }
 ],
 "product-md-refresh": [
  {
   "q": "Which platform does PRODUCT.md name for the iPhone, iPad and Mac app?",
   "options": [
    "Web for the dashboard, iOS for the app",
    "One product that adapts per platform",
    "Web only, as today"
   ],
   "rec": 2
  },
  {
   "q": "From your note, the do-it-all, do-it-anywhere, any-harness agentic canvas: which line opens PRODUCT.md?",
   "options": [
    "The agent canvas for any work, anywhere, in any harness",
    "One canvas, with what each claim means said in the line",
    "Three short beats, then the canvas",
    "Your claims without the word canvas"
   ],
   "rec": 0
  },
  {
   "q": "PRODUCT.md promises that no data leaves your network. The phone's push goes through CawCo's relay on Cloudflare. How should the promise read?",
   "options": [
    "Name the one outside hop",
    "Promise only the hub and the work",
    "Keep 'no data leaves your network'"
   ],
   "rec": 2
  }
 ],
 "delegates-any-folder": [
  {
   "q": "How should a delegate work in a folder that isn't a git repository, like /root on a VPS?",
   "options": [
    "Live folder, private writes",
    "Frozen copy, private writes"
   ],
   "rec": 0
  },
  {
   "q": "At what path does the delegate see the folder?",
   "options": [
    "Real path on Linux, workspace path on Mac",
    "Workspace path everywhere"
   ],
   "rec": 0
  },
  {
   "q": "A repository delegate would start from your checkout, including untracked files like .env. Keep them?",
   "options": [
    "Keep them",
    "Clean them in the view"
   ],
   "rec": 0
  },
  {
   "q": "A delegate that fixes a service's config can't restart the service from inside its walls. What happens after it lands?",
   "options": [
    "The session that sent it restarts",
    "The delegate declares a post-land command"
   ],
   "rec": 0
  }
 ],
 "devtools-speed": [
  {
   "q": "How should Golar check the code: one project at a time with a cache, or everything in one pass?",
   "options": [
    "Per project, cached",
    "One pass, no cache"
   ],
   "rec": 0
  },
  {
   "q": "Yes, we can fix it ourselves. Do that, or wait for Golar's author?",
   "options": [
    "Fix it ourselves",
    "Wait for a Golar release"
   ],
   "rec": 0
  },
  {
   "q": "The TypeScript Golar runs on rejects five lines of ours that today's TypeScript accepts. Fix them now?",
   "options": [
    "Fix the five lines now",
    "Stay on TypeScript 7.0.2"
   ],
   "rec": 0
  },
  {
   "q": "Golar reports eight errors in our Svelte code that today's checker hides. Where should they be handled?",
   "options": [
    "Teach our Golar fork the same filters",
    "Change our eight lines"
   ],
   "rec": 0
  },
  {
   "q": "The five checks Biome can't run: who runs them?",
   "options": [
    "Golar runs them",
    "A checker of our own",
    "Keep a small ESLint for these five",
    "Drop them"
   ],
   "rec": 0
  },
  {
   "q": "When work lands, how should the landing gate avoid redoing the checks the agent just ran?",
   "options": [
    "Check where the agent worked, warm",
    "Trust the agent's pass"
   ],
   "rec": 0
  },
  {
   "q": "Should the nightly check a commit that already passed its landing gate?",
   "options": [
    "Once, in a kept warm tree",
    "No: the gate's pass counts"
   ],
   "rec": 0
  },
  {
   "q": "Golar's author doesn't know about these bugs yet. File the drafted issues?",
   "options": [
    "File them now",
    "Later"
   ],
   "rec": 0
  }
 ],
 "today-questions": [
  {
   "q": "Until you approve a design, what stops?",
   "options": [
    "Only work that rests on a design",
    "Everything"
   ],
   "rec": 0
  },
  {
   "q": "Which products can a design take as references?",
   "options": [
    "Only the ones you called well designed",
    "Those, plus modern dev tools"
   ],
   "rec": 1
  },
  {
   "q": "Is this what you want for workflows?",
   "options": [
    "Yes",
    "Not quite"
   ],
   "rec": 0
  },
  {
   "q": "Should your devices tell CawCo you're using them when CawCo isn't the tab in front?",
   "options": [
    "Everything off until you turn it on",
    "Like Slack: CawCo's own agent reports by default; a browser asks once"
   ],
   "rec": 1
  }
 ],
 "calls-to-overrule": [
  {
   "q": "When an account hits a plan limit but could keep going on paid usage credits, what should CawCo do?",
   "options": [
    "Use another account",
    "Spend the credits"
   ],
   "rec": 0
  },
  {
   "q": "If a routine runs in a new project before you've written to Caw, should your first words still open Setup?",
   "options": [
    "Yes, open Setup",
    "No, a plain thread"
   ],
   "rec": 0
  },
  {
   "q": "How should the skeleton loaders move while the data loads?",
   "options": [
    "Pulse until it lands",
    "transitions.dev exactly"
   ],
   "rec": 0
  },
  {
   "q": "The stream relay's router library reads its own package file while it runs, which CawCo's packaged app can't do. How should we handle it?",
   "options": [
    "Fill it in at build time",
    "Use a different library"
   ],
   "rec": 0
  },
  {
   "q": "When an agent starts a container inside its workspace, should it keep running after that agent's session ends?",
   "options": [
    "It stops with the session",
    "It keeps running"
   ],
   "rec": 0
  }
 ],
 "address-cawco": [
  {
   "q": "Which onboarding step sets up cawco?",
   "options": [
    "One row that walks the steps",
    "One status card, extra rows later"
   ],
   "rec": 0
  },
  {
   "q": "What happens to the old HTTPS on your tailnet row?",
   "options": [
    "cawco replaces it",
    "Keep both"
   ],
   "rec": 0
  },
  {
   "q": "Before HTTPS is on, how should Copy work on the plain cawco address?",
   "options": [
    "Copy works there too",
    "Copy selects the text"
   ],
   "rec": 0
  },
  {
   "q": "Once cawco answers, the recommended row names the address three times. Trim one?",
   "options": [
    "The ticked step says It answers",
    "Keep all three"
   ],
   "rec": 0
  }
 ],
 "workflows-future": [
  {
   "q": "What should a workflow be in CawCo?",
   "options": [
    "The delegation tree is the run",
    "A routine with steps",
    "A durable program whose steps are CawCo's own"
   ],
   "rec": 0
  }
 ],
 "project-screens": [
  {
   "q": "What is the Pipeline tab for?",
   "options": [
    "Show what runs next",
    "Remove the tab"
   ],
   "rec": 0
  }
 ],
 "graph-chat-and-links": [
  {
   "q": "Should the Decisions tab keep the graph, or show your decision pages as a list?",
   "options": [
    "Keep the graph",
    "A list, links as words on the cards"
   ],
   "rec": 1
  }
 ],
 "comment-card-sizing": [
  {
   "q": "How big should a comment be when it opens, on each screen?",
   "options": [
    "Beside the comment",
    "Small card, long ones in Comments",
    "A panel on the right"
   ],
   "rec": 0
  },
  {
   "q": "With the Comments list open on a tablet, where does a comment open?",
   "options": [
    "A drawer at the bottom",
    "Close the list while it is open"
   ],
   "rec": 0
  },
  {
   "q": "When a comment with a long reply opens, where should it start?",
   "options": [
    "At the reply's first line",
    "At its end, as today"
   ],
   "rec": 0
  }
 ],
 "app-comment-mode": [
  {
   "q": "The new commenting is on main. When it ships, a tap in the iPhone or Mac app's Comment mode opens nothing, because the app still uses the old way (the page writes a pin on a tap; the app opens its card). How should the app keep working?",
   "options": [
    "Build the new commenting in the app now",
    "Keep the old way for the app until the hold lifts"
   ],
   "rec": 0
  }
 ],
 "github-connect": [
  {
   "q": "What should Sign in to GitHub do first?",
   "options": [
    "Use the gh login on one of your machines",
    "Sign in with a code at github.com/login/device",
    "Make the hub its own GitHub App in one press"
   ],
   "rec": 0
  },
  {
   "q": "The App ID, Installation ID and private key fields: keep or replace?",
   "options": [
    "Replace with the one-press app",
    "Keep the manual fields"
   ],
   "rec": 1
  }
 ],
 "quick-calls-1023": [
  {
   "q": "With the delegation tree picked, today's Workflows engine and its API go. Delete the app's Workflows screens in the same change?",
   "options": [
    "Delete them with the engine",
    "Keep the engine's API until the hold lifts",
    "Hold the rework until the hold lifts"
   ],
   "rec": 0
  },
  {
   "q": "When an agent needs you to sign in to something, is this the feature you want?",
   "options": [
    "An inline Connect card",
    "The same card, plus claude.ai's own connectors"
   ],
   "rec": 0
  },
  {
   "q": "Before an agent's work goes into main, CawCo checks it, and builds the iPhone and Mac app on your Mac when the work touches the app's folder. Should that build cover only the parts of the app the work touches?",
   "options": [
    "Build only what the work reaches",
    "Skip it when only generated files changed",
    "As now"
   ],
   "rec": 0
  },
  {
   "q": "The app still shows its own Send picks button on decision pages. Hide it now?",
   "options": [
    "Now",
    "After the hold"
   ],
   "rec": 0
  },
  {
   "q": "New wording for what agents are told when you take over the browser?",
   "options": [
    "Your browser tool is paused while the person uses this browser. It works again when they hand it back.",
    "Keep: The person is using this browser privately"
   ],
   "rec": 0
  },
  {
   "q": "When an agent replies to one of your pins, should it reach you?",
   "options": [
    "Only when the reply asks you something",
    "Every reply, as a notice you can clear",
    "Never; open the page to see replies"
   ],
   "rec": 0
  },
  {
   "q": "Refuse fleet-wide hooks that call an MCP tool before a tool runs?",
   "options": [
    "Refuse them, saying why",
    "Allow them"
   ],
   "rec": 0
  },
  {
   "q": "Two triage sessions started today are still running. Keep them?",
   "options": [
    "Keep them",
    "Stop them"
   ],
   "rec": 0
  },
  {
   "q": "Delete the old address-cawco page? address-setup replaced it.",
   "options": [
    "Delete it",
    "Keep it"
   ],
   "rec": 0
  }
 ],
 "commenting": [
  {
   "q": "Pick 1: everything around the other six picks is settled. Does it read right?",
   "options": [
    "Reads right",
    "Change something"
   ],
   "rec": 0
  },
  {
   "q": "Where does a comment's thread open?",
   "options": [
    "In the rail",
    "Beside its pin"
   ],
   "rec": 0
  },
  {
   "q": "What shape is a comment's marker on the page?",
   "options": [
    "Tail-corner pill",
    "Round pill on a stem"
   ],
   "rec": 0
  },
  {
   "q": "When does the agent hear a comment?",
   "options": [
    "When you press Send",
    "As you write, after a pause"
   ],
   "rec": 0
  },
  {
   "q": "Where do you type a new comment?",
   "options": [
    "At the element",
    "In the rail's foot"
   ],
   "rec": 0
  },
  {
   "q": "Can a comment be just a picture?",
   "options": [
    "Words required",
    "Attachments alone send"
   ],
   "rec": 1
  },
  {
   "q": "How does a row show attachments?",
   "options": [
    "A count beside the age",
    "A thumb strip"
   ],
   "rec": 0
  }
 ],
 "find-secrets": [
  {
   "q": "Should your own Find hide secrets until you click one?",
   "options": [
    "Shown as typed",
    "Hidden until clicked"
   ],
   "rec": 1
  },
  {
   "q": "Should an agent's Find search what tools returned in other sessions?",
   "options": [
    "Everything",
    "Only what was said"
   ],
   "rec": 0
  }
 ],
 "pairing-behaviour": [
  {
   "q": "What does Caw swallow?",
   "options": [
    "The device, at Approve",
    "The code, at the scan"
   ],
   "rec": 0
  },
  {
   "q": "When a scan doesn't match the code on screen, what does the card say?",
   "options": [
    "That scan didn't match",
    "Wrong code"
   ],
   "rec": 0
  },
  {
   "q": "Fixed from your pins: does the pairing screen look right now?",
   "options": [
    "Looks right",
    "Not yet"
   ],
   "rec": 0
  }
 ],
 "resize-handle-pick": [
  {
   "q": "Which resize handle?",
   "options": [
    "Corner arc",
    "Light under the pointer",
    "Dot that becomes a knob"
   ],
   "rec": 0
  }
 ],
 "owner-2026-10-18": [
  {
   "q": "Which Bun installs CawCo's workspaces?",
   "options": [
    "Move your own Bun to the canary",
    "A CawCo setting pins the workspaces' Bun",
    "Wait for Bun 1.5"
   ],
   "rec": 1
  },
  {
   "q": "Git LFS for projects that don't live on the hub",
   "options": [
    "Keep it as it is today",
    "Also pin every LFS run to the repo's own host",
    "Also send LFS through the workspace's network proxy"
   ],
   "rec": 1
  },
  {
   "q": "Sessions working in your own checkout: how do they keep to their own files?",
   "options": [
    "The hub checks each commit",
    "A line in the session's brief",
    "Not wanted any more"
   ],
   "rec": null
  },
  {
   "q": "Big files when a plain folder becomes a project",
   "options": [
    "Track big files with LFS on the first commit",
    "Keep leaving them out",
    "Offer them to LFS as a question"
   ],
   "rec": null
  },
  {
   "q": "Facts in a project's knowledge that go out of date",
   "options": [
    "A date on the fact; it leaves briefs once past",
    "A date on the fact; Caw asks you once it's past",
    "No expiry"
   ],
   "rec": null
  },
  {
   "q": "Calendar, canvas and the decisions graph on iPhone and iPad",
   "options": [
    "Native in the app",
    "The dashboard's page in a web view"
   ],
   "rec": null
  },
  {
   "q": "Which outside tracker comes first?",
   "options": [
    "GitHub Issues first",
    "Linear first"
   ],
   "rec": null
  },
  {
   "q": "Whose key does a project's tracker sign in with?",
   "options": [
    "A connection's key",
    "A key set on the project"
   ],
   "rec": null
  },
  {
   "q": "Give a project's files their own link?",
   "options": [
    "Yes, any surface can link to a file",
    "No, keep it to Caw's replies"
   ],
   "rec": null
  },
  {
   "q": "When a project's Vite config won't load for a sheet",
   "options": [
    "Yes, allow that one retry",
    "No, the stage fails with the error"
   ],
   "rec": null
  }
 ],
 "caw-pairing-picks": [
  {
   "q": "While the code waits, what does Caw do?",
   "options": [
    "Today (dozing)",
    "Asking for you",
    "Holding up a phone",
    "Wing held out"
   ],
   "rec": 2
  },
  {
   "q": "When it's approved, what does Caw do?",
   "options": [
    "Done",
    "Victory pump",
    "Puffs up proud",
    "Phone held high"
   ],
   "rec": 0
  },
  {
   "q": "When it's denied or runs out, what does Caw do?",
   "options": [
    "Asking for you",
    "Standing ready",
    "Pushing into wind",
    "Phone lowered"
   ],
   "rec": 0
  },
  {
   "q": "Denied: what face does the head in the QR make?",
   "options": [
    "Today (eyes open)",
    "Squeezed shut",
    "Wince"
   ],
   "rec": 1
  },
  {
   "q": "Squeezed shut: where do the two marks sit?",
   "options": [
    "On each eye (today)",
    "Level"
   ],
   "rec": null
  },
  {
   "q": "Wince: where do the two marks sit?",
   "options": [
    "On each eye (today)",
    "Level"
   ],
   "rec": null
  }
 ],
 "address-setup": [
  {
   "q": "Pick one of the four",
   "options": [
    "One row in Settings",
    "Caw walks you through it",
    "Your phone proves it",
    "Caw's steps, then your phone"
   ],
   "rec": null
  }
 ],
 "tabcard-headfade": [
  {
   "q": "The session card grows out of its tab",
   "options": [
    "Ship it",
    "Change something first"
   ],
   "rec": 0
  }
 ]
};
