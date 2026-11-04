---
version: 1
slug: "apps-dashboard-src-lib-cawco-home-cawpanel-svelte"
primary_target: "apps/dashboard/src/lib/cawco/home/CawPanel.svelte"
related_targets: ["apps/dashboard/src/lib/cawco/home/UpdateCard.svelte","apps/dashboard/src/lib/cawco/home/MovedLogins.svelte"]
---

# Caw's panel: needs you, notices and the update notice

The owner's picks for Caw's notifications panel (`home/CawPanel.svelte`, its update row `home/UpdateCard.svelte`, moved logins `home/MovedLogins.svelte`). What it holds and in what order is the PRD's (§5.2).

- Each notice says what it is and what to do, on one grid shared by every row.
- A notice's ✕ is always shown, in its first line's trailing cell, never on its tile's corner.
- Logins moved into CawCo are one group with one ✕, its entries rows under it.
- The update notes fold open inside the update row; there is no Home card for an update.
- Needs you rows offer Peek on desktop and iPad, never on a phone.
- Approve and Deny in a row are The Peer Rule's pair.
