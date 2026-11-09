/**
 * Reading and linking plugin marketplaces.
 */

import { detach } from "@cawco/core/detach";
import type { MarketplaceLink, MarketplaceRead } from "@cawco/core/fleet";
import { Elysia, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";

export const fleetMarketplaceRoutes = ({
  db,
  dropMarketplaceLink,
  fleetChanged,
  linkMarketplace,
  readMarketplaceSource,
}: Pick<
  HubContext,
  | "db"
  | "dropMarketplaceLink"
  | "fleetChanged"
  | "linkMarketplace"
  | "readMarketplaceSource"
>) =>
  new Elysia()
    // A marketplace source read: what it calls itself, for the link form to
    // show before anything is linked, and what it offers, which is what
    // Browse lists for a linked one — read by the hub from the source, the
    // same fetch its installs resolve from, so no machine's copy is asked (a
    // directory on the hub is a copy no other machine has). Answers at once,
    // `fetching`; the read is a `fleet.fetch` frame (`readMarketplaceSource`).
    .get(
      "/api/fleet/marketplace-read",
      { query: t.Object({ source: t.String({ minLength: 1 }) }) },
      ({ query }): MarketplaceRead => {
        const source = query.source.trim();
        detach(readMarketplaceSource(source), "marketplace read");
        return { source, fetching: true };
      }
    )
    // Linked under the name its own manifest gives, the one name Claude
    // Code knows it by (plugins.ts `readMarketplace`), never a typed one.
    // Answers at once, `fetching`; the link's outcome — the row, or why
    // not — is a `fleet.fetch` frame (`linkMarketplace`).
    .post(
      "/api/fleet/marketplace-links",
      { body: t.Object({ source: t.String({ minLength: 1 }) }) },
      ({ body }): MarketplaceLink => linkMarketplace(body.source.trim())
    )
    // A refused link let go, by the person who read why: it leaves the
    // list. One under way is not dropped: it lands or is refused first.
    .delete(
      "/api/fleet/marketplace-links",
      { query: t.Object({ source: t.String({ minLength: 1 }) }) },
      ({ query, status }) =>
        dropMarketplaceLink(query.source.trim())
          ? { ok: true }
          : status(
              404,
              `No refused link of ${query.source.trim()} is waiting to be let go.`
            )
    )
    .delete("/api/fleet/marketplaces/:name", ({ params, status }) => {
      const trashed = db.trash.put(
        { kind: "marketplace", key: params.name },
        Date.now()
      );
      if (trashed === undefined) {
        return status(404, `the fleet links no marketplace ${params.name}`);
      }
      fleetChanged();
      return undoable(trashed);
    });
