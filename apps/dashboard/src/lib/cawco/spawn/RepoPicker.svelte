<script lang="ts" module>
  import type { GhRepo } from "@cawco/core/connections";
  import { isGitUrl, repoIdentity, repoPath } from "@cawco/core/protocol";
  import { unhandled } from "@cawco/core/unhandled";
  import { spawnWords } from "@cawco/core/words/spawn";
  import type { MachineRepo, MachineRepos } from "../stores/machines";

  /**
   * Each machine's last answer, so a popover opened again shows its list at
   * once while it is read again. The page's own: a reload reads it afresh.
   */
  const lastRead = new Map<string, MachineRepos>();

  /**
   * What each machine said of a URL's repository, by `<machine> <identity>`
   * ({@link lookKey}): a popover opened again on a pasted URL draws its row
   * whole at once. The page's own, as {@link lastRead} is.
   */
  const lastLooked = new Map<string, MachineRepo>();

  /** How long a URL in the search holds still before it is looked up: a paste is one change, a URL typed is one per key. */
  const LOOKUP_SETTLE_MS = 250;

  /** The key {@link lastLooked} holds machine `machineId`'s answer for `url` by. */
  const lookKey = (machineId: string, url: string) =>
    `${machineId} ${repoIdentity(url)}`;

  /** GitHub's host, whose repositories the machine's gh reads. */
  const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

  /** The list as the picker holds it: being read, the machine's answer, or why it has none. */
  type Listing =
    | { kind: "reading" }
    | { kind: "read"; answer: MachineRepos }
    | { kind: "unread"; words: string };

  /** One owner of the listed repositories. */
  interface Owner {
    count: number;
    /** When its latest repository was last updated, ms: owners stand latest first. */
    latest: number;
    owner: GhRepo["owner"];
  }

  /**
   * The strip's line as its chips stand in it, px, read off the chips
   * themselves at their own widths: "All", "+N", each owner's by login,
   * the gap between chips, and the line's room.
   */
  interface Line {
    all: number;
    gap: number;
    more: number;
    owners: ReadonlyMap<string, number>;
    room: number;
  }

  /** The owners whose chips stand on the strip's line, and the rest, each in the strip's order. */
  interface Strip {
    hidden: Owner[];
    shown: Owner[];
  }

  /**
   * The owners whose chips fit the line after "All", with "+N" after them
   * while any is left out, latest active first. `keep` (the owner picked)
   * always stands: where it would not fit in its own place, it takes the
   * line's last place that fits. Before the line is read, every chip stands
   * in it, to be read.
   */
  function fitOwners(
    order: readonly Owner[],
    keep: string,
    line: Line | undefined
  ): Strip {
    if (!line) {
      return { shown: [...order], hidden: [] };
    }
    const widthOf = (one: Owner) =>
      line.owners.get(one.owner.login) ?? Number.POSITIVE_INFINITY;
    const fits = (chips: readonly Owner[]) => {
      let total =
        line.all + (chips.length < order.length ? line.gap + line.more : 0);
      for (const one of chips) {
        total += line.gap + widthOf(one);
      }
      return total <= line.room;
    };
    /** The most of `from`'s first chips that fit, with `last` after them. */
    const most = (from: readonly Owner[], last: Owner[]) => {
      for (let count = from.length; count > 0; count -= 1) {
        const chips = [...from.slice(0, count), ...last];
        if (fits(chips)) {
          return chips;
        }
      }
      return last;
    };
    const natural = most(order, []);
    const kept = order.find((one) => one.owner.login === keep);
    const shown =
      !kept || natural.includes(kept)
        ? natural
        : most(
            order.filter((one) => one !== kept),
            [kept]
          );
    return { shown, hidden: order.filter((one) => !shown.includes(one)) };
  }

  /** The line's chips at their own widths, off the chips themselves (each against the line's own scale, so a popover scaling in measures true). */
  function lineOf(node: HTMLElement): Line | undefined {
    const drawn = node.getBoundingClientRect().width;
    if (drawn <= 0) {
      return;
    }
    const scale = node.offsetWidth / drawn;
    const widthOf = (element: Element) =>
      element.getBoundingClientRect().width * scale;
    const owners = new Map<string, number>();
    let all = 0;
    for (const chip of node.querySelectorAll<HTMLElement>("[data-login]")) {
      if (chip.dataset.login === ALL) {
        all = widthOf(chip);
      } else {
        owners.set(chip.dataset.login ?? "", widthOf(chip));
      }
    }
    const more = node.querySelector("[data-more]");
    return {
      all,
      // Before "+N" first stands, as wide as "All": no narrower than it.
      more: more ? widthOf(more) : all,
      gap: Number.parseFloat(getComputedStyle(node).columnGap) || 0,
      owners,
      room: node.clientWidth,
    };
  }

  /** A row of the list: a listed repository, or a git URL taken as it is written. */
  type Row = { key: string; repo: GhRepo } | { key: string; url: string };

  /** The owner group's value for every owner's repositories: no GitHub login holds a `*`. */
  const ALL = "*";

  /**
   * The skeleton rows while the list is read: as many as the list's resting
   * height holds, each its name's bar and its description's at a share of
   * their column as a list's names and descriptions vary, so they read as
   * rows, not as one block repeated.
   */
  const SKELETON_ROWS = [
    { name: "40%", description: "80%" },
    { name: "60%", description: "60%" },
    { name: "33%", description: "66%" },
    { name: "50%", description: "75%" },
    { name: "40%", description: "50%" },
  ] as const;

  /** A row's height before it is drawn and measured: a repository with its description, two lines. */
  const ROW_GUESS = 56;

  /** Rows drawn past each end of the list's view, so a quick scroll meets rows already there. */
  const OVERSCAN = 2;

  /**
   * The age column's widest words (`formatAgeShort`, its digits tabular):
   * the column is sized by them, never by the rows that happen to be drawn.
   */
  const AGE_WIDEST = ["now", "00m", "00h", "00w"] as const;

  /**
   * The URL row's key: there is one at most, and it stays the same row as
   * the URL is typed and as what the machine says of it fills it in.
   */
  const URL_KEY = "url:";

  /** The URL row as drawn: what its URL holds, filled in by what the machine says of it. */
  interface UrlFace {
    description: string;
    /** On GitHub: its mark until gh's row stands. */
    github: boolean;
    /** The host on any other: it leads the name. */
    host: string;
    /** Its social image's address, "" for none. */
    image: string;
    name: string;
    /** Why nothing more is shown: gh sees no repository there. */
    note: string;
    /** Read off the URL: the repository's `owner/` (its group's path on another host), as the row draws it apart. */
    owner: string;
    /** gh's own row for it, as a listed repository's. */
    repo: GhRepo | null;
  }

  /** The row for `url`, as `answer` fills it in (none while it is asked, or when no answer came). */
  function urlFace(
    url: string,
    answer: MachineRepo | undefined,
    machineName: string
  ): UrlFace {
    const [host = ""] = repoIdentity(url).split("/");
    const github = GITHUB_HOSTS.has(host);
    const path = repoPath(url) || url;
    const at = path.lastIndexOf("/") + 1;
    const read: UrlFace = {
      owner: path.slice(0, at),
      name: path.slice(at),
      github,
      host: github ? "" : host,
      repo: null,
      description: "",
      note: "",
      image: "",
    };
    switch (answer?.kind) {
      case "found": {
        const slash = answer.repo.nameWithOwner.indexOf("/") + 1;
        return {
          ...read,
          owner: answer.repo.nameWithOwner.slice(0, slash),
          name: answer.repo.nameWithOwner.slice(slash),
          repo: answer.repo,
          description: answer.repo.description ?? "",
          image: answer.socialImageUrl ?? "",
        };
      }
      case "other-host":
        return {
          ...read,
          description: answer.description ?? "",
          image: answer.socialImageUrl ?? "",
        };
      case "not-found":
        return { ...read, note: spawnWords.location.notOnGithub(machineName) };
      // No gh to ask, or none signed in: the row is what the URL holds.
      case "no-gh":
      case "signed-out":
      case "old-daemon":
      case undefined:
        return read;
      default:
        return unhandled("answer", answer);
    }
  }
</script>

<script lang="ts">
  /**
   * The repository picker in the location popover (§1.5): a search field
   * over the selected machine's GitHub repositories as its gh sees them
   * (stores/machines `machineRepos`), latest updated first, and a combobox
   * over them (WAI-ARIA APG, Combobox with listbox popup): the field keeps
   * focus, ↑ and ↓ move the active row, Enter picks it and sets the
   * location, Escape empties the search. A pasted git URL on any host is
   * one row of its own in place of the list: a listed repository's own row
   * where the list holds it, under any of its URLs; else a row of what the
   * URL holds, filled in by what the machine says of it (`machineRepo`):
   * on GitHub gh's row for it and its social image, or a line saying gh
   * sees none there; on another host its page's description and image.
   * Owner chips filter the list to one owner, and each row's avatar and
   * `owner/` fold away while one is chosen. Only the rows near the list's
   * view are drawn (`virtual`). The strip runs the content column's
   * width and never scrolls: "All", then the owners latest active first, as
   * many as its one line holds, sharing the line's room, and a "+N" chip
   * opening a combobox over those that wrapped past it (searched by login,
   * ↑ ↓ Enter, Escape closing it alone; `lineOf`). The owner picked always
   * stands in the strip: one picked from the list takes the line's last
   * place, and keeps it until another owner is picked. While the list is read, skeleton rows
   * stand in its rows' places on the rows' own columns.
   *
   * Motion: one list, its rows keyed by the repository (motion/rows
   * `reflow`), on the rows in its view alone. As the search or the owner
   * changes, the rows in both lists stay and slide to their places, their
   * avatar and `owner/` folding in place; those only the old list held
   * close where they stood;
   * those only the new one holds are uncovered; the list's height travels
   * once (`morph`). An owner picked whose list shares no row with the one
   * shown (one owner for another) swaps the lists (motion/list-swap): the
   * rows in view leave together, held where they were drawn, and the new ones
   * come in after them; the list keeps the old rows' room while they leave
   * and its height travels as the new ones arrive. Through `reflow` those
   * rows left and arrived in the same slots in the same frames, each the
   * other's crossfade, under an edge shrinking over the ones leaving. The
   * skeleton rows hand their places to the list as it arrives, in the
   * skeleton's reveal (motion/rows `data-flip-skeleton`). The owner group's
   * thumb travels to the owner picked (the kit's segmented group), and
   * chips coming into the strip or leaving it pop in and out while the
   * rest slide, those its line lets go or takes back sliding off it or on
   * (`reflow`, `data-flip="pop"`); the rows' hover ghost and picked wash travel between rows (`highlight`); the lock's tooltip is the list's one tooltip, portalled
   * out of the scroller. The URL row fills in where it stands as the
   * machine answers: the avatar takes the host's mark's place (`icon-swap`),
   * the age morphs in (MorphText), and the description, the line saying gh
   * sees nothing there and the social image unfold under the name, the
   * image's place held by a skeleton until it loads and gone quietly if it
   * fails.
   */
  import {
    createVirtualizer,
    observeElementRect,
  } from "@tanstack/svelte-virtual";
  import { untrack } from "svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import * as Command from "#lib/components/ui/command/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconGitRepo as GitRepo,
    IconLock as Lock,
    IconSearch as Search,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { motionOk, reveal } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { handOver, reflow } from "#lib/platform/motion/rows.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { didntAnswer } from "../hub/control";
  import Marked from "../Marked.svelte";
  import { machineRepo, machineRepos } from "../stores/machines";
  import { TRY_AGAIN } from "../unanswered";

  let {
    machineId,
    machineName,
    repo,
    onrepo,
    oncommit,
    focus = false,
    shown = true,
  }: {
    machineId: string;
    machineName: string;
    /** The git URL picked, or "" while none is. */
    repo: string;
    /** A repository was picked, or a pasted URL taken, by its git URL ("" for none). */
    onrepo: (url: string) => void;
    /** Enter picked the active row: the location is set. */
    oncommit?: () => void;
    /** The search takes focus as the picker opens: it is what the popover opened for. */
    focus?: boolean;
    /**
     * It stands shown. Kept built while it is put away (its popover closed,
     * or the surface turned to another chip: NsPopoverGroup), shown again it
     * starts as a fresh one would: its search empty, every owner's list, the
     * picked row in view.
     */
    shown?: boolean;
  } = $props();

  /**
   * Focus in the search a frame after it mounts: the popover's focus scope
   * moves focus to its first stop as it opens, and this lands after it.
   */
  function searchFirst(node: HTMLInputElement) {
    if (!untrack(() => focus)) {
      return;
    }
    const frame = requestAnimationFrame(() => node.focus());
    return () => cancelAnimationFrame(frame);
  }

  const uid = $props.id();
  const tips = provideGlide();

  let query = $state("");
  /** The owner whose repositories alone are shown; "" for every owner's. */
  let ownerPick = $state("");
  /** The row ↑ and ↓ and the pointer stand on, by its key. */
  let activeKey = $state("");
  let listing = $state<Listing>({ kind: "reading" });
  let listbox = $state<HTMLElement>();
  /** The rows' `reflow` container: handed over as one owner's list is swapped for another's. */
  let rowsBox = $state<HTMLElement>();
  /** One owner's list swapped for another's (motion/list-swap). */
  const swap = new ListSwap<Row>();
  /** The swap's incoming rows, each at its place in the list it brought: the order they come in. */
  let incoming = $state<ReadonlyMap<string, number>>(new Map());
  /**
   * Where a row still coming in was drawn as the next swap took it away:
   * its ink and its offset, which its leave starts from (the leave's
   * keyframes name only where it ends).
   */
  let drawnAt = $state<ReadonlyMap<string, { ink: string; at: string }>>(
    new Map()
  );
  /** Where the first of the swap's leaving rows stood in the list, px: the rows in view leave, from there. */
  let leftFrom = $state(0);

  $effect(() => {
    const id = machineId;
    const held = lastRead.get(id);
    listing = held ? { kind: "read", answer: held } : { kind: "reading" };
    if (!id) {
      return;
    }
    let stale = false;
    machineRepos(id)
      .then((read) => {
        if (stale) {
          return;
        }
        switch (read.kind) {
          case "answered":
            lastRead.set(id, read.value);
            listing = { kind: "read", answer: read.value };
            return;
          case "unanswered":
            // A list read before stands; this says why it did not move.
            if (!held) {
              listing = {
                kind: "unread",
                words: didntAnswer(id, read, {
                  missed: spawnWords.location.reposMissed,
                  again: TRY_AGAIN,
                }),
              };
            }
            return;
          default:
            unhandled("read", read);
        }
      })
      .catch((cause: unknown) => {
        if (!(stale || held)) {
          listing = { kind: "unread", words: failureWords(cause) };
        }
      });
    return () => {
      stale = true;
    };
  });

  const repos = $derived(
    listing.kind === "read" && listing.answer.kind === "listed"
      ? listing.answer.repos
      : []
  );
  /** Why there is no list to show, in a sentence; "" while there is one, or while it is read. */
  const why = $derived.by(() => {
    if (listing.kind === "unread") {
      return listing.words;
    }
    if (listing.kind === "reading") {
      return "";
    }
    switch (listing.answer.kind) {
      case "listed":
        return listing.answer.repos.length ? "" : spawnWords.location.noRepos;
      case "no-gh":
        return spawnWords.location.noGh(machineName);
      case "signed-out":
        return spawnWords.location.signedOut(machineName);
      case "old-daemon":
        return spawnWords.location.oldDaemon(machineName);
      default:
        return unhandled("answer", listing.answer);
    }
  });
  /** The owners, latest active first (the newest update among their repositories), the most repositories first among equals. */
  const owners = $derived.by(() => {
    const byLogin = new Map<string, Owner>();
    for (const one of repos) {
      const at = Date.parse(one.updatedAt) || 0;
      const known = byLogin.get(one.owner.login);
      if (known) {
        known.count += 1;
        known.latest = Math.max(known.latest, at);
      } else {
        byLogin.set(one.owner.login, {
          owner: one.owner,
          count: 1,
          latest: at,
        });
      }
    }
    return [...byLogin.values()].sort(
      (a, b) => b.latest - a.latest || b.count - a.count
    );
  });
  /** The chosen owner, while it still owns something listed. */
  const owner = $derived(
    owners.some((one) => one.owner.login === ownerPick) ? ownerPick : ""
  );
  /** The last owner picked: it keeps its place in the strip, "All" picked after it included, until another owner is picked. */
  let pinned = $state("");
  /** The strip's line as last read (`lineOf`). */
  let line = $state<Line>();
  const strip = $derived(fitOwners(owners, owner || pinned, line));
  /** The combobox over the owners the strip has no room for stands open. */
  let moreOpen = $state(false);
  /** Its search, by login (the kit's Command filters its rows by it). */
  let ownerQuery = $state("");
  /** An owner was picked in it: focus goes to that owner's chip as it closes. */
  let pickedFromList = false;
  /** The strip, whose picked chip takes the focus from the list. */
  let stripBox = $state<HTMLElement>();
  const typed = $derived(query.trim());
  /** The search is a git URL: it is the one row, cloned as it is written. */
  const pasted = $derived(isGitUrl(typed));
  /** The list is being read: its rows' places stand as skeletons (a pasted URL is its one row meanwhile). */
  const reading = $derived(listing.kind === "reading" && !pasted);
  const q = $derived(pasted ? "" : typed.toLowerCase());
  const pickedId = $derived(repo ? repoIdentity(repo) : "");
  const listed = $derived(
    repos.find((one) => repoIdentity(one.url) === pickedId)
  );
  /** The listed repository the pasted URL names, under any of its URLs: its own row stands alone. */
  const pastedListed = $derived.by(() => {
    if (!pasted) {
      return;
    }
    const id = repoIdentity(typed);
    return repos.find((one) => repoIdentity(one.url) === id);
  });
  /**
   * The URL row: the pasted one the list does not hold, or a URL picked
   * before that it does not hold (a popover opened again on it), heading
   * the list.
   */
  const urlRow = $derived.by(() => {
    if (pasted) {
      return pastedListed ? "" : typed;
    }
    return repo && listing.kind === "read" && !listed ? repo : "";
  });
  /** What the machine said of the URL row's repository, by {@link lookKey}. */
  let looked = $state<{ at: string; answer: MachineRepo }>();
  const lookAt = $derived(
    urlRow && machineId ? lookKey(machineId, urlRow) : ""
  );
  // The URL row's repository is looked up once the search holds still; an
  // answer for a URL the row no longer holds is kept for when it does.
  $effect(() => {
    const at = lookAt;
    if (!at || lastLooked.has(at)) {
      return;
    }
    const id = machineId;
    const url = untrack(() => urlRow);
    let stale = false;
    const settle = setTimeout(() => {
      machineRepo(id, url).then(
        (read) => {
          if (read.kind !== "answered") {
            return;
          }
          lastLooked.set(at, read.value);
          if (!stale) {
            looked = { at, answer: read.value };
          }
        },
        // A lookup that fails leaves the row as its URL says.
        () => undefined
      );
    }, LOOKUP_SETTLE_MS);
    return () => {
      stale = true;
      clearTimeout(settle);
    };
  });
  const urlLook = $derived(
    urlRow
      ? urlFace(
          urlRow,
          looked?.at === lookAt ? looked.answer : lastLooked.get(lookAt),
          machineName
        )
      : undefined
  );
  /** The social image that loaded, and the one that failed: the one that failed is gone quietly. */
  let imageLoaded = $state("");
  let imageBroken = $state("");
  // The social image is loaded apart from the row; the row draws it once
  // it has loaded, its skeleton holding its place until then.
  $effect(() => {
    const src = urlLook?.image;
    if (!src || untrack(() => imageLoaded === src || imageBroken === src)) {
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      imageLoaded = src;
    };
    probe.onerror = () => {
      imageBroken = src;
    };
    probe.src = src;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  });
  /** The rows shown while `login`'s repositories alone are ("" for every owner's). */
  function rowsFor(login: string): Row[] {
    if (pastedListed) {
      return [{ key: pastedListed.nameWithOwner, repo: pastedListed }];
    }
    return [
      ...(urlRow ? [{ key: URL_KEY, url: urlRow }] : []),
      ...(pasted
        ? []
        : repos
            .filter(
              (one) =>
                (!login || one.owner.login === login) &&
                (!q ||
                  one.nameWithOwner.toLowerCase().includes(q) ||
                  (one.description ?? "").toLowerCase().includes(q))
            )
            .map((one) => ({ key: one.nameWithOwner, repo: one }))),
    ];
  }
  const rows = $derived(rowsFor(owner));
  /**
   * The rows' lead folds away while one owner is chosen: every avatar would
   * repeat that owner's chip. A URL row is no owner's pick, and keeps it.
   */
  const leadFolded = $derived(Boolean(owner) && !urlRow && !pastedListed);
  /** `owner/` and the name, as the row draws them apart. */
  function ownerAndName(one: GhRepo): [string, string] {
    const at = one.nameWithOwner.indexOf("/");
    return [one.nameWithOwner.slice(0, at), one.nameWithOwner.slice(at + 1)];
  }
  function identityOf(row: Row): string {
    return repoIdentity("url" in row ? row.url : row.repo.url);
  }
  /** The active row: the one stood on, else the picked one, else the first. */
  const active = $derived(
    rows.find((row) => row.key === activeKey) ??
      rows.find((row) => identityOf(row) === pickedId) ??
      rows[0]
  );
  /** The option's id of the row at `index` in the list. */
  const optionId = (index: number) => `${uid}-${index}`;

  /** Where the picked row stands in the list; -1 while it holds none. */
  const pickedAt = $derived(
    rows.findIndex((row) => identityOf(row) === pickedId)
  );
  /** The list's cap, px (its `max-h-72`), read off it once. */
  let cap = 0;
  /**
   * The list's scrollbar gutter, px, as its size is reported: as wide as
   * the platform's scrollbar (none where scrollbars overlay the content),
   * and the same whether the list scrolls or not (`scrollbar-gutter`).
   */
  let gutter = $state(0);
  /**
   * Only the rows near the list's view are drawn (TanStack Virtual): those
   * the view shows and `OVERSCAN` past each end, in the list's own flow
   * between a spacer for the rows above and one for the rows below, so they
   * stand on the list's columns as every row does. Each is measured as it
   * is drawn; the rest stand at their measured or guessed height. Drawn
   * whole, 290 rows (a machine of the owner's lists 152 to 288) held the
   * press that opened the popover 165–215ms before its glide's first frame,
   * and an owner switch 47–99ms, every row placed and measured by `reflow`.
   *
   * The view is read as tall as the list's cap at least: the list is as tall
   * as its rows up to that cap, and read at the height it stood at with
   * fewer rows, the next rows would come a frame late. Rows drawn and taken
   * down as the list scrolls are no change to animate (motion/rows
   * `handOver`): only a change to the list moves rows, those in its view.
   */
  const virtual = createVirtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => listbox ?? null,
    estimateSize: () => ROW_GUESS,
    overscan: OVERSCAN,
    getItemKey: (index) => rows[index]?.key ?? index,
    observeElementRect: (instance, report) =>
      observeElementRect(instance, (rect) => {
        const element = instance.scrollElement;
        if (element && !cap) {
          cap = Number.parseFloat(getComputedStyle(element).maxHeight) || 0;
        }
        if (element) {
          gutter = element.offsetWidth - element.clientWidth;
        }
        report({ width: rect.width, height: Math.max(rect.height, cap) });
      }),
    onChange: (instance) => {
      if (instance.isScrolling && rowsBox) {
        handOver(rowsBox);
      }
    },
  });
  // The list's length, before the rows are drawn from it.
  $effect.pre(() => {
    const count = rows.length;
    untrack(() => $virtual).setOptions({ count });
  });
  // Its scroller, once the list is drawn.
  $effect(() => {
    if (listbox) {
      untrack(() => $virtual).setOptions({});
    }
  });
  /** The rows drawn, each with its place in the list. */
  const drawn = $derived($virtual.getVirtualItems());
  /** The room the rows after the last one drawn take, px. */
  const below = $derived(
    Math.max(0, $virtual.getTotalSize() - (drawn.at(-1)?.end ?? 0))
  );
  /** Measures a row as it is drawn, and again as it resizes. */
  const measured = (node: HTMLElement) => {
    untrack(() => $virtual).measureElement(node);
  };
  /** The rows in the list's view, and where the first of them stands in the list, px. */
  function inView(): { rows: Row[]; from: number } {
    const top = listbox?.scrollTop ?? 0;
    const bottom = top + (listbox?.clientHeight ?? 0);
    const seen = drawn.filter((item) => item.end > top && item.start < bottom);
    return {
      rows: seen.flatMap((item) => rows[item.index] ?? []),
      from: seen[0]?.start ?? 0,
    };
  }

  /** The picked row is brought into the list's view once, as the list first holds it: a popover opened again opens on it. */
  let shownPicked = $state(false);
  /** It stood shown at the last look: shown again, it starts afresh. */
  let wasShown = untrack(() => shown);
  $effect.pre(() => {
    const now = shown;
    if (now && !wasShown) {
      untrack(() => {
        query = "";
        ownerPick = "";
        pinned = "";
        activeKey = "";
        shownPicked = false;
        if (listbox) {
          listbox.scrollTop = 0;
        }
      });
    }
    wasShown = now;
  });
  $effect(() => {
    const at = pickedAt;
    if (shownPicked || at < 0 || !listbox) {
      return;
    }
    shownPicked = true;
    untrack(() => $virtual).scrollToIndex(at, { align: "auto" });
  });

  function take(row: Row): void {
    activeKey = row.key;
    if ("url" in row) {
      onrepo(row.url);
    } else {
      // A listed repository pasted under one of its URLs clones by the one pasted.
      onrepo(row.repo === pastedListed ? typed : row.repo.url);
    }
  }

  function search(value: string): void {
    query = value;
    activeKey = "";
    const url = value.trim();
    if (isGitUrl(url)) {
      onrepo(url);
    } else if (repo && !listed) {
      // The URL pasted before is no longer what the field says.
      onrepo("");
    }
  }

  /**
   * Where an owner stands in the strip, All first: the side a swap moves
   * toward. One the strip has no room for comes to its last place.
   */
  const ownerAt = (login: string) => {
    if (!login) {
      return 0;
    }
    const at = strip.shown.findIndex((one) => one.owner.login === login);
    return at < 0 ? strip.shown.length : at + 1;
  };

  function chooseOwner(login: string): void {
    const next = rowsFor(login);
    const showing = new Set(rows.map((row) => row.key));
    // Lists that share no row are swapped: in `reflow`, every row shown
    // would close in the slot a new one is uncovered in. Lists that share
    // one move as one list, their shared rows sliding (One Object). With
    // reduced motion the new list is simply there.
    if (
      rowsBox &&
      showing.size > 0 &&
      next.length > 0 &&
      !next.some((row) => showing.has(row.key))
    ) {
      handOver(rowsBox);
      if (motionOk.current) {
        const was = comingIn(rowsBox);
        const { leaving } = swap;
        const view = inView();
        swap.swap(view.rows, ownerAt(login) - ownerAt(owner), {
          scroller: listbox,
        });
        if (swap.leaving !== leaving) {
          drawnAt = was;
          leftFrom = view.from;
        }
        incoming = new Map(next.map((row, i) => [row.key, i]));
      }
    }
    ownerPick = login;
    if (login) {
      pinned = login;
    }
    activeKey = "";
  }

  /** An owner picked in the combobox: it closes, and the owner is picked in the strip. */
  function pickFromList(login: string): void {
    pickedFromList = true;
    moreOpen = false;
    ownerQuery = "";
    chooseOwner(login);
  }

  /** Where each row the last swap brought is drawn while it still comes in, by its key. */
  function comingIn(
    box: HTMLElement
  ): Map<string, { ink: string; at: string }> {
    const coming = new Map<string, { ink: string; at: string }>();
    if (swap.phase !== "in" || incoming.size === 0) {
      return coming;
    }
    for (const element of box.querySelectorAll<HTMLElement>(
      ":scope > [data-index]"
    )) {
      const row = rows[Number(element.dataset.index)];
      if (row && incoming.has(row.key)) {
        const { opacity, transform } = getComputedStyle(element);
        coming.set(row.key, { ink: opacity, at: transform });
      }
    }
    return coming;
  }

  /** A row's entrance: the swap's, for a row it brought, while it comes in. */
  function entrance(row: Row): string {
    const at = incoming.get(row.key);
    return at === undefined ? "none" : swap.rowAnim(at);
  }

  function step(by: number): void {
    if (!(active && listbox)) {
      return;
    }
    const at = Math.min(
      rows.length - 1,
      Math.max(0, rows.indexOf(active) + by)
    );
    const next = rows[at];
    if (!next) {
      return;
    }
    activeKey = next.key;
    untrack(() => $virtual).scrollToIndex(at, { align: "auto" });
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        return;
      case "Enter":
        event.preventDefault();
        if (active) {
          take(active);
        }
        oncommit?.();
        return;
      case "Escape":
        if (query) {
          // The search empties; the popover stays.
          event.stopPropagation();
          search("");
        }
        return;
      default:
    }
  }

  const PRIVATE = spawnWords.location.private;
  /**
   * The list's columns: the lead, the name and its description, the lock,
   * the time. The space between them is the tracks' own (the lead's after
   * its mark, the lock's before it, the time's start padding), so the lead
   * folds to nothing whole, its space with it.
   */
  const REPO_COLS =
    "calc((var(--spacing-c-row-lead) + var(--spacing-space-3)) * var(--lead-share)) minmax(0, 1fr) calc(var(--spacing-icon-md) + var(--spacing-space-3)) max-content";
  /** A row's lead cell: its mark on the lead's own width, clipped as the lead folds, fading with it. */
  const LEAD =
    "col-start-1 mark-cell min-w-0 justify-start overflow-clip opacity-(--lead-share) motion-safe:transition-opacity motion-safe:duration-(--duration-panel) motion-safe:ease-in-out";
  /**
   * Where a row's trailing ink ends: the path field's edge and Browse's
   * (1px each), the field's inset and Browse's own, less the scrollbar's
   * gutter the row already stands inside (`--gutter`).
   */
  const REPO_END =
    "calc(var(--spacing-space-2) + var(--spacing-space-3) + 2px - var(--gutter))";
  /** A row: its lead, name and description, lock and time on the list's columns (a subgrid). */
  const ROW =
    "group mark-line col-span-full grid grid-cols-subgrid items-center gap-y-space-1 rounded-sm border-none bg-transparent py-space-2 pe-(--repo-end) ps-0 text-start select-none";
</script>

<div data-slot="repo-picker" class="grid min-w-0 gap-space-2">
  <label
    data-slot="location-section-field"
    class="field-edge flex h-c-row-h min-w-0 items-center gap-space-3 rounded-md border bg-surface-raised pe-space-3 shadow-xs transition-control"
  >
    <span class="grid w-c-row-lead flex-none place-items-center self-stretch"
      ><Search class="size-icon-md text-ink-subtle" /></span
    >
    <input
      aria-activedescendant={active
        ? optionId(rows.indexOf(active))
        : undefined}
      aria-autocomplete="list"
      aria-controls={`${uid}-list`}
      aria-expanded="true"
      aria-label={spawnWords.location.search}
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      class="h-full min-w-0 flex-1 border-none border-current bg-transparent p-0 type-body text-ink-strong placeholder:text-ink-muted"
      data-autofocus={focus || undefined}
      oninput={(event) => search(event.currentTarget.value)}
      {onkeydown}
      placeholder={spawnWords.location.search}
      role="combobox"
      spellcheck="false"
      value={query}
      {@attach searchFirst}
    />
  </label>

  {#if owners.length > 1 && !pasted}
    <!-- One pick among the owners, its thumb travelling to the one picked
         (the kit's segmented group), across the content column's width. It
         never scrolls: the chips that fit its one line stand on it, "+N"
         right after them, and past a break the rest, on lines it clips:
         what the line is fitted from (`lineOf`), out of the arrow keys' way. -->
    <div data-slot="owners" class="relative grid min-w-0" in:unfold out:unfold>
      <div bind:this={stripBox} class="min-w-0" {@attach reflow()}>
        <ToggleGroup.Root
          aria-label={spawnWords.location.owners}
          fill
          bind:value={
            () => owner || ALL,
            (next) => {
              // A press on the picked owner keeps it picked.
              if (next) {
                chooseOwner(next === ALL ? "" : next);
              }
            }
          }
          type="single"
        >
          <div
            class="flex h-(--item) min-w-0 flex-1 flex-wrap gap-x-space-row overflow-clip"
            {@attach frameSize(lineOf, (read) => {
              line = read;
            })}
          >
            <ToggleGroup.Item compact data-login={ALL} value={ALL}>
              {@render allChip()}
            </ToggleGroup.Item>
            {#each strip.shown as one (one.owner.login)}
              <ToggleGroup.Item
                compact
                data-flip="pop"
                data-login={one.owner.login}
                value={one.owner.login}
              >
                {@render ownerChip(one)}
              </ToggleGroup.Item>
            {/each}
            {#if strip.hidden.length}
              <Popover.Root
                bind:open={moreOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    ownerQuery = "";
                  }
                }}
              >
                <Popover.Trigger
                  aria-label={spawnWords.location.moreOwnersLabel(
                    strip.hidden.length
                  )}
                  data-flip="pop"
                  data-more
                  look="segment-compact"
                >
                  <span
                    >{spawnWords.location.moreOwners(strip.hidden.length)}</span
                  >
                </Popover.Trigger>
                <Popover.Content
                  align="end"
                  onCloseAutoFocus={(event) => {
                    const chip = stripBox?.querySelector<HTMLElement>(
                      '[data-slot="toggle-group-item"][data-state="on"]'
                    );
                    if (pickedFromList && chip) {
                      event.preventDefault();
                      chip.focus();
                    }
                    pickedFromList = false;
                  }}
                  pad="none"
                  width="narrow"
                >
                  <Command.Root
                    filter={(value, search) =>
                      value.toLowerCase().includes(search.trim().toLowerCase())
                        ? 1
                        : 0}
                    label={spawnWords.location.owners}
                  >
                    <Command.Input
                      aria-label={spawnWords.location.searchOwners}
                      placeholder={spawnWords.location.searchOwners}
                      bind:value={ownerQuery}
                    />
                    <Command.List>
                      <Command.Empty
                        >{spawnWords.location.noOwnerMatch(
                          ownerQuery.trim()
                        )}</Command.Empty
                      >
                      <Command.Group>
                        {#each strip.hidden as one (one.owner.login)}
                          <Command.Item
                            onSelect={() => pickFromList(one.owner.login)}
                            value={one.owner.login}
                          >
                            {@render avatar(one.owner, "size-icon-lg")}
                            <span
                              class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
                              >{one.owner.login}</span
                            >
                            <span class="num type-meta text-ink-muted"
                              >{one.count}</span
                            >
                          </Command.Item>
                        {/each}
                      </Command.Group>
                    </Command.List>
                  </Command.Root>
                </Popover.Content>
              </Popover.Root>
              <span aria-hidden="true" class="basis-full"></span>
              {#each strip.hidden as one (one.owner.login)}
                <ToggleGroup.Item
                  compact
                  data-login={one.owner.login}
                  disabled
                  inert
                  value={one.owner.login}
                >
                  {@render ownerChip(one)}
                </ToggleGroup.Item>
              {/each}
            {/if}
          </div>
        </ToggleGroup.Root>
      </div>
    </div>
  {/if}

  <!-- The rows share the list's columns (a subgrid each): the avatar's
       lead, the name and its description, the lock, the time. In a narrow
       list the lock and the time go to the description's line, so the
       name has the row's width. A row's trailing ink ends where Browse's
       does under it: the path field's edge and the button's (1px each),
       the field's inset and the button's, the scrollbar's gutter given back
       from the row's end padding. The gutter stands whether the list
       scrolls or not: kept only while
       it scrolled, it came and went as one owner's list replaced every
       owner's (the height's morph clips the list as it travels, the closing
       rows overflow it after), and every row's columns jumped its width
       three times in one switch. -->
  <div
    bind:this={listbox}
    data-slot="repo-list"
    aria-busy={reading || undefined}
    aria-label={spawnWords.location.repositories}
    class="fai-scroll @container/repos relative grid max-h-72 scrollbar-gutter-stable auto-rows-max grid-cols-(--repo-cols) content-start overflow-y-auto overscroll-contain motion-safe:transition-[grid-template-columns] motion-safe:duration-(--duration-panel) motion-safe:ease-in-out"
    id={`${uid}-list`}
    role="listbox"
    style:--repo-cols={REPO_COLS}
    style:--repo-end={REPO_END}
    style:--gutter={`${gutter}px`}
    style:--owner-track={owner ? "0fr" : "1fr"}
    style:--owner-ink={owner ? 0 : 1}
    style:--lead-share={leadFolded ? 0 : 1}
    {@attach highlight({
      rows: "[data-repo-row]",
      hovered: "data-active",
      selected: '[data-repo-row][aria-selected="true"]',
    })}
    {@attach morph()}
  >
    <!-- A swap's leaving rows, in the rows' own cell (their room held while
         they leave, the list's height travelling once they have gone), where
         they were drawn: the list is scrolled to its top for the new rows. -->
    {#if swap.leaving.length}
      <div
        aria-hidden="true"
        class="pointer-events-none col-span-full row-start-1 grid translate-y-(--left-at) auto-rows-max grid-cols-subgrid content-start"
        data-leaving
        inert
        style:--left-at={`${leftFrom - swap.leftAt}px`}
      >
        {#each swap.leaving as row (row.key)}
          <div
            class="col-span-full grid grid-cols-subgrid opacity-(--leave-ink) transform-(--leave-at) animate-(--leave)"
            style:--leave={swap.leaveAnim()}
            style:--leave-ink={drawnAt.get(row.key)?.ink}
            style:--leave-at={drawnAt.get(row.key)?.at}
          >
            {@render face(row, false, -1)}
          </div>
        {/each}
      </div>
    {/if}
    <div
      bind:this={rowsBox}
      class="col-span-full row-start-1 grid auto-rows-max grid-cols-subgrid"
      {@attach reflow()}
    >
      <div
        aria-hidden="true"
        class="col-span-full h-(--above)"
        style:--above={`${drawn[0]?.start ?? 0}px`}
      ></div>
      {#each drawn as item (item.key)}
        {@const row = rows[item.index]}
        {#if row}
          <div
            class="col-span-full grid grid-cols-subgrid animate-(--enter)"
            data-flip
            data-index={item.index}
            style:--enter={entrance(row)}
            {@attach measured}
          >
            {@render face(row, true, item.index)}
          </div>
        {/if}
      {/each}
      <div
        aria-hidden="true"
        class="col-span-full h-(--below)"
        style:--below={`${below}px`}
      ></div>
      <!-- While the list is read, the rows' places on the rows' own
           columns; they hand them to the rows in the skeleton's reveal
           (reflow's `data-flip-skeleton`). -->
      {#if reading}
        {#each SKELETON_ROWS as bars, at (at)}
          <div
            aria-hidden="true"
            class={ROW}
            data-flip
            data-flip-skeleton
            data-slot="repo-row-skeleton"
          >
            <span class={LEAD}
              ><span class="mark-cell w-c-row-lead"
                ><Skeleton cell="avatar" radius="pill" /></span
              ></span
            >
            <span
              class="col-start-2 flex h-lh items-center type-label @max-repo-narrow/repos:col-span-3"
              data-box
              style:--bar={bars.name}
              ><Skeleton
                class="w-(--bar)"
                height="x-height"
                radius="line"
                type="label"
              /></span
            >
            <span
              class="col-start-4 flex h-lh items-center justify-end ps-space-3 type-meta @max-repo-narrow/repos:row-start-2"
              data-box
              ><Skeleton
                height="x-height"
                radius="line"
                type="meta"
                width="age"
              /></span
            >
            <span
              class="col-start-2 row-start-2 flex h-lh items-center type-meta"
              data-box
              style:--bar={bars.description}
              ><Skeleton
                class="w-(--bar)"
                height="x-height"
                radius="line"
                type="meta"
              /></span
            >
          </div>
        {/each}
      {/if}
    </div>
    <!-- The age column's widest words, out of sight, at a row's padding
         either side of them: the column is as wide as they are, whichever
         rows are drawn. -->
    <span
      aria-hidden="true"
      class="invisible col-start-4 row-start-1 grid h-0 overflow-hidden ps-space-3 pe-(--repo-end) num type-meta whitespace-nowrap"
      >{#each AGE_WIDEST as words (words)}<span class="col-start-1 row-start-1"
          >{words}</span
        >{/each}</span
    >
    {#if !(rows.length || reading)}
      <p
        data-slot="repo-list-empty"
        class="col-span-full m-0 py-space-5 type-meta text-pretty text-ink-muted"
        role="status"
      >
        {#if why}
          {why}
        {:else}
          {spawnWords.location.noMatch(typed)}
        {/if}
      </p>
    {/if}
  </div>
  <span class="sr-only" role="status"
    >{reading ? spawnWords.location.loadingRepos : ""}</span
  >
</div>
<GlideTip tether={tips} />

<!-- A row: the option the combobox walks; `live` false, a picture of one
     leaving in a swap, named nothing and answering nothing. -->
{#snippet face(row: Row, live: boolean, index: number)}
  <button
    data-repo-row={live || undefined}
    aria-selected={identityOf(row) === pickedId}
    class={ROW}
    data-active={(live && active?.key === row.key) || undefined}
    id={live ? optionId(index) : undefined}
    onclick={() => {
      if (live) {
        take(row);
      }
    }}
    onpointermove={() => {
      if (live) {
        activeKey = row.key;
      }
    }}
    role="option"
    tabindex="-1"
    type="button"
  >
    {#if "url" in row && urlLook}
      {@render urlFields(urlLook)}
    {:else if !("url" in row)}
      {@const one = row.repo}
      {@const [login, repoName] = ownerAndName(one)}
      <!-- Its avatar folds away with its `owner/` while one owner is
           chosen: the chip above names that owner (the lead's track and its
           ink, on the prefix's clock). -->
      <span class={LEAD} data-box
        ><span class="mark-cell w-c-row-lead"
          >{@render avatar(one.owner, "size-icon-lg")}</span
        ></span
      >
      <!-- Its `owner/` folds to nothing while one owner is chosen: its
           width (a grid track going 1fr to 0fr) and its ink together. -->
      <span
        data-slot="name"
        data-box
        class="col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label font-medium text-ink-row group-aria-selected:text-selected-ink @max-repo-narrow/repos:col-span-3"
        ><span
          data-slot="owner"
          aria-hidden={Boolean(owner) || undefined}
          class="inline-grid grid-cols-(--owner-track) align-top font-normal text-ink-muted opacity-(--owner-ink) motion-safe:transition-[grid-template-columns,opacity] motion-safe:duration-(--duration-panel) motion-safe:ease-in-out"
          data-box
          ><span class="min-w-0 overflow-hidden"
            ><Marked query={q} text={`${login}/`} /></span
          ></span
        ><Marked query={q} text={repoName} /></span
      >
      {#if one.isPrivate}
        {@render privateMark()}
      {/if}
      <span
        data-slot="updated"
        class="col-start-4 ps-space-3 num type-meta text-end whitespace-nowrap text-ink-muted @max-repo-narrow/repos:row-start-2"
        >{formatAgeShort(Date.parse(one.updatedAt))}</span
      >
      {#if one.description}
        <span
          data-slot="description"
          data-box
          class="col-start-2 row-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
          ><Marked query={q} text={one.description} /></span
        >
      {/if}
    {/if}
  </button>
{/snippet}

<!-- The URL row's fields on the list's columns, as a listed row's: its
     host's mark until gh's avatar takes its place, `host · owner/name`, and
     what the machine said of it under the name. -->
{#snippet urlFields(look: UrlFace)}
  <span class={LEAD} data-box
    ><span class="mark-cell w-c-row-lead"
      ><span class="icon-swap"
        ><span data-active={!look.repo}
          >{#if look.github}<ProviderLogo
              provider="github"
              size="nav"
            />{:else}<GitRepo
              aria-hidden="true"
              class="size-icon-lg text-ink-muted"
            />{/if}</span
        ><span data-active={Boolean(look.repo)}
          >{#if look.repo}{@render avatar(
              look.repo.owner,
              "size-icon-lg"
            )}{/if}</span
        ></span
      ></span
    ></span
  >
  <span
    data-slot="name"
    data-box
    class="col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label font-medium text-ink-row group-aria-selected:text-selected-ink @max-repo-narrow/repos:col-span-3"
    ><span class="font-normal text-ink-muted"
      >{look.host
        ? spawnWords.location.onHost(look.host)
        : ""}{look.owner}</span
    >{look.name}</span
  >
  {#if look.repo?.isPrivate}
    {@render privateMark()}
  {/if}
  <span
    data-slot="updated"
    class="col-start-4 ps-space-3 num type-meta text-end whitespace-nowrap text-ink-muted @max-repo-narrow/repos:row-start-2"
    ><MorphText
      text={look.repo ? formatAgeShort(Date.parse(look.repo.updatedAt)) : ""}
    /></span
  >
  {#if look.description}
    <span
      data-slot="description"
      data-box
      class="col-start-2 row-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
      in:unfold
      out:unfold>{look.description}</span
    >
  {:else if look.note}
    <span
      data-slot="not-on-github"
      class="col-start-2 row-start-2 min-w-0 type-meta text-pretty text-ink-muted"
      in:unfold
      out:unfold>{look.note}</span
    >
  {/if}
  {#if look.image && imageBroken !== look.image}
    <!-- Its 2:1 card (GitHub's 1280 by 640), the whole picture in it; a
         picture of another shape stands in its middle. -->
    <span
      data-slot="social-image"
      data-box
      class="relative col-span-3 col-start-2 row-start-3 aspect-2/1 w-full max-w-64 overflow-clip rounded-xs bg-surface-well outline-1 -outline-offset-1 outline-image-outline"
      in:unfold
      out:unfold
    >
      {#if imageLoaded === look.image}
        <img
          alt=""
          class="absolute inset-0 size-full object-contain"
          decoding="async"
          in:reveal
          src={look.image}
        />
      {:else}
        <span aria-hidden="true" class="absolute inset-0" out:reveal
          ><Skeleton fill="frame" radius="text" /></span
        >
      {/if}
    </span>
  {/if}
{/snippet}

<!-- A private repository's lock, in the lock's column; its tooltip the list's one. -->
{#snippet privateMark()}
  <Tip glide={tips} label={PRIVATE} side="top">
    {#snippet children(tip)}
      <span
        {...tip}
        aria-label={PRIVATE}
        class="col-start-3 mark-cell justify-self-end text-ink-muted @max-repo-narrow/repos:row-start-2"
        data-box
        data-slot="private"
        role="img"
        tabindex="-1"><Lock class="size-icon-md" /></span
      >
    {/snippet}
  </Tip>
{/snippet}

<!-- The owner strip's chips' insides. -->
{#snippet allChip()}
  <span>{spawnWords.location.allOwners}</span>
  <span class="num text-ink-muted">{repos.length}</span>
{/snippet}

{#snippet ownerChip(one: Owner)}
  {@render avatar(one.owner, "size-icon-md")}
  <span class="max-w-40 overflow-clip text-ellipsis" title={one.owner.login}
    >{one.owner.login}</span
  >
  <span class="num text-ink-muted">{one.count}</span>
{/snippet}

{#snippet avatar(who: GhRepo["owner"], size: string)}
  <img
    alt=""
    class="{size} flex-none bg-surface-hover object-cover data-[kind=org]:rounded-xs data-[kind=user]:rounded-pill"
    data-kind={who.kind}
    src={who.avatarUrl}
  />
{/snippet}
