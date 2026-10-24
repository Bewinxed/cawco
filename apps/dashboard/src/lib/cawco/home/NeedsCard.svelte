<script lang="ts">
  /**
   * One thing parked on the operator, as a row of Caw's panel (NeedsCaw):
   * a session's permission or question, a project past its spend cap, or a
   * project's task waiting on you (its review, or a failed attempt), which
   * opens the task with its deliverable and the way to act on it first. The
   * session's mark leads (a budget its glyph), then the title and its wait,
   * what it wants in the words it is asked, and the kind and where. The row
   * itself opens it (the session at the request, the project's spend) and the panel
   * closes (`onchoose`). In the wide layout (a desk, an iPad; not a phone)
   * a session's ask offers Peek at the title line's end, after its wait:
   * the session's tail, read before answering, and the panel closes as it
   * does when a row is chosen. A permission is answered here too, with Deny and
   * Approve as equal peers (DESIGN.md, The Peer Rule): same size, type and
   * fill strength, tinted fail and done, told apart by hue and glyph;
   * "Always allow" never appears.
   *
   * Nothing is optimistic: an answer is the same `permission.answer` command
   * the session's own card sends, and the row leaves when the hub has taken
   * it — the request card above that pane's composer leaves with it. A
   * browser ask's Take over is the card's own take-over (`takeOverBrowser`),
   * and leaves the same way.
   *
   * An approved action is the same row with the call laid out under its
   * reason: when it runs (in this browser's zone), the connection and the
   * account it signs in as, the tool, and the exact arguments in a well that
   * scrolls. Deny and Approve are the permission's peers; Approve names the
   * arguments' hash the hub gave with them, so the hub runs the call shown
   * and refuses any other. One that failed says why (the hub's or the
   * service's words), and one whose call may or may not have happened says
   * so; Remove puts either away once you have read it.
   *
   * An onboarding choice nobody answered (the fleet's upstream choice) is
   * the same row with its risk as its line and its two options as the
   * peers; it opens nothing, and leaves once the hub has the answer.
   *
   * The stream relay's journey is the journey's own card (RelayJourney,
   * `row`), drawn whole in the row's place.
   *
   * HTTPS on the tailnet is an onboarding row of the same kind: one line and
   * its meta, then every step on the path in order, each with its control (Tailscale's
   * DNS page to open, its command to copy, the docs) and its own tick as the
   * hub finds it taken; once HTTPS is on, the row's tick with the https
   * dashboard to open.
   *
   * This browser's presence is one more: its notice as its line (what
   * Chrome shares, and that what needs you shows here instead of on your
   * phone), then Skip and Allow as peers. Allow asks the browser for Idle
   * Detection and notifications on one press; a refusal says what the
   * browser blocked and where to change it; once allowed, the row's tick.
   *
   * An artifact waiting on you (core artifact-needs.ts) is a session's row:
   * its session's mark, its ask and its wait, then why it waits ("3 of 9
   * picked · 2 unsent · 1 new answer"), then its project, its kind (Page,
   * Canvas, Components) by its glyph, and its machine. The row opens its
   * session with the artifact in its panel at its first pending stop. Send
   * stands at the meta line's end while something is written and not sent,
   * except on a decision page, whose one Send is its own at its foot (the
   * owner's pick, "Only the page's own Send"),
   * and the first line's ✕ is Not now: it leaves Needs you, stays in Files
   * with its dot, and comes back when it is raised again.
   */
  import {
    type ArtifactKind,
    artifactWords,
    askWords,
    causeLine,
    configurePage,
    connectWords,
    contactWords,
    mcpWords,
    pairingWords,
    presenceWords,
    questionsOf,
    reasonLine,
    type TailnetHttps,
    type TailnetHttpsTodo,
    tailnetWords,
  } from "@cawco/core";
  import {
    UPSTREAM_POSTS,
    UPSTREAM_WORDS,
    type UpstreamPosts,
    upstreamPostsWords,
  } from "@cawco/core/upstream-guard";
  import type { Component } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import RelayJourney from "#lib/cawco/relay/RelayJourney.svelte";
  import {
    actOnRelayCard,
    proveOnStart,
    stepsHere,
  } from "#lib/cawco/relay/relay.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconCheck,
    IconClose,
    IconDollar,
    IconError,
    IconExternal,
    IconFolder,
    IconGlobe,
    IconInteract,
    IconKey,
    IconLock,
    IconMaximize,
    IconMonitor,
    IconNeedsYou,
    IconSend,
    IconServer,
    IconShield,
    IconSuccess,
    IconTailnetHttps,
    IconTick,
    IconWarningTriangle,
    IconWindow,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import CopyBox from "../CopyBox.svelte";
  import {
    answerFleetUpstream,
    answerFor,
    cawco,
    decideAction,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
    takeOverBrowser,
  } from "../client.svelte";
  import ErrorText from "../ErrorText.svelte";
  import { answerMachine, answerPairing } from "../hub-auth.svelte";
  import { conversationHref } from "../links";
  import { notices } from "../notices.svelte";
  import OriginText from "../OriginText.svelte";
  import OsMark from "../OsMark.svelte";
  import { allowHere, person, skipHere } from "../person.svelte";
  import { sendArtifact } from "../preview/artifact-doc";
  import RowFault from "../RowFault.svelte";
  import { artifactOpenKey, openArtifactIn } from "../reference-open.svelte";
  import { refusals } from "../refusals.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { cawOf } from "../session-status";
  import { capLine } from "../usage";
  import { choices } from "./choices.svelte";
  import { askView, clock, type NeedsItem, span } from "./home-state.svelte";
  import NeedsMeta from "./NeedsMeta.svelte";
  import NeedsRow from "./NeedsRow.svelte";
  import { openPeek, peekable, peekTipOff } from "./peek.svelte";

  let {
    item,
    stale,
    onchoose,
  }: {
    item: NeedsItem;
    stale: boolean;
    /** The row was chosen: it opens, and the panel closes. */
    onchoose: () => void;
  } = $props();

  // The relay's start ticked while its row stands: this screen proves it.
  $effect(() => {
    if (item.kind === "relay") {
      proveOnStart(item.journey);
    }
  });

  const href = $derived.by(() => {
    if (
      item.kind === "choice" ||
      item.kind === "tailnet" ||
      item.kind === "desk" ||
      item.kind === "relay" ||
      item.kind === "machine"
    ) {
      return;
    }
    if (item.kind !== "ask") {
      // An artifact's is its session's (or Caw's thread's) address; the
      // press opens the artifact there itself (`chosen`), so a press on the
      // address already in front opens it too.
      return item.kind === "artifact" ? item.href.split("?")[0] : item.href;
    }
    // An ask opens where it was made (`askView`).
    return conversationHref(askView(item), cawco.instanceIndex);
  });
  /** What it asks for, in the words it is asked: its second line. */
  const want = $derived.by(() => {
    switch (item.kind) {
      case "ask":
        return item.isQuestion
          ? (questionsOf(item.request.toolName, item.request.input)?.[0]
              ?.question ?? item.ask)
          : item.ask;
      case "watch":
        return item.notice.title;
      case "choice":
        return UPSTREAM_WORDS.risk;
      case "tailnet":
        return item.done
          ? tailnetWords.done(item.tailnet.dashboard ?? "")
          : tailnetWords.lead;
      case "desk":
        if (item.done) {
          return presenceWords.done(item.agent !== null || item.idle);
        }
        return item.unavailable
          ? presenceWords.unavailable(item.notify)
          : presenceWords.lead(item);
      case "relay":
        return "";
      case "artifact":
        return reasonLine(item.pending);
      case "pairing":
        return pairingWords.asks(item.request.userCode);
      case "admission":
        return "Waits to join your fleet. Admitted, it runs sessions like your other machines.";
      case "install":
        return causeLine(item.install);
      case "mcp":
        return mcpWords.signInEnded(configurePage("mcp"));
      case "machine":
        return contactWords.lostLine(item.name, item.minutes);
      case "task":
        return item.reason === "review"
          ? `Review the draft: it waits on you in ${item.stage}`
          : "Its session failed: read why, then try again";
      case "action":
        if (item.action.state === "unknown") {
          return `This may or may not have happened. Check ${item.action.service}.`;
        }
        return item.action.state === "failed"
          ? `It failed. ${item.action.error ?? `${item.action.service} did not take it.`}`
          : item.action.reason;
      case "cap":
        break;
    }
    return capLine(item.cap);
  });

  /**
   * What Deny and Approve answer, as their names say it: a held post by its
   * title and where it goes, any other ask by what it asks and whose it is.
   */
  const answered = $derived.by(() => {
    if (item.kind !== "ask") {
      return "";
    }
    return item.request.presentation.post
      ? `${item.title} to ${item.ask}`
      : `${item.ask} on ${item.title}`;
  });

  /** An action's call, laid out: when, through what, the tool, and its arguments as JSON. */
  const call = $derived.by(() => {
    if (item.kind !== "action") {
      return null;
    }
    const { action } = item;
    let { args } = action;
    try {
      args = JSON.stringify(JSON.parse(action.args), null, 2);
    } catch {
      // The hub stores what it serialised; shown as stored if it ever is not JSON.
    }
    return {
      when: whenOf(action.state, action.runAt, action.startedAt, clock.now),
      through: `${action.connection} · ${action.service} as ${action.account}`,
      tool: action.tool,
      args,
    };
  });

  /** "Tue 13 Oct, 09:00 BST", in this browser's zone: the operator's. */
  function stamp(at: number): string {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(at);
  }

  /** When the call runs, or (failed, unknown) when it was tried. */
  function whenOf(
    state: string,
    runAt: number | null,
    startedAt: number | null,
    now: number
  ): string {
    if (state === "unknown" || state === "failed") {
      return startedAt === null ? "Not tried" : `Tried ${stamp(startedAt)}`;
    }
    if (runAt === null) {
      return "As soon as you approve";
    }
    return runAt <= now
      ? `As soon as you approve (was due ${stamp(runAt)})`
      : stamp(runAt);
  }

  /** The hub's refusal of your last decision on an action, in its words. */
  let refusal = $state<string | null>(null);
  /** A decision on its way: both peers hold until the hub answers. */
  let deciding = $state(false);

  async function decide(decision: "approve" | "deny" | "checked") {
    if (item.kind !== "action" || held || deciding) {
      return;
    }
    deciding = true;
    refusal = null;
    try {
      await decideAction(item.action, decision);
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      deciding = false;
    }
  }
  /**
   * A watch notice's and a budget's last line: the kind, then where
   * it is. An ask's is drawn in the markup: its project, its kind, its
   * machine by its mark.
   */
  const meta = $derived.by(() => {
    switch (item.kind) {
      case "watch":
        return `Fleet watch · ${item.place}`;
      case "choice":
        return "Onboarding · each project can change it";
      case "tailnet":
        return tailnetWords.meta(item.tailnet.host);
      case "desk":
        return presenceWords.meta;
      case "relay":
        return "";
      case "pairing":
        return item.place ? `Pairing · ${item.place}` : "Pairing";
      case "admission":
        return ["Machine", item.machine.platform, item.place]
          .filter(Boolean)
          .join(" · ");
      case "mcp":
      case "machine":
        return item.place;
      case "install":
        return item.install.route === "ssh"
          ? connectWords.addMachineOver("over SSH")
          : connectWords.addMachineOver("by a command");
      case "action":
      case "artifact":
      case "ask":
      case "cap":
      case "task":
        break;
    }
    return "Budget";
  });

  /** Your answer to a pairing or a waiting machine, on its way, and the hub's refusal of it. */
  let admitting = $state<boolean | null>(null);
  async function admitOrDeny(approve: boolean) {
    if (
      !(item.kind === "pairing" || item.kind === "admission") ||
      held ||
      admitting !== null
    ) {
      return;
    }
    admitting = approve;
    refusal = null;
    try {
      await (item.kind === "pairing"
        ? answerPairing(item.request.userCode, approve)
        : answerMachine(item.machine.machineId, approve));
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      admitting = null;
    }
  }
  /**
   * The row stands but cannot be answered yet: the hub is not live, or its
   * session's machine is offline. It keeps its place, dimmed, and its
   * answer waits; nothing is sent until it can land.
   */
  const held = $derived(
    stale || ((item.kind === "ask" || item.kind === "artifact") && item.stale)
  );

  /** An artifact's kind, by its glyph (ArtifactMenu's). */
  const ARTIFACT_GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
    browser: IconGlobe,
  };

  /**
   * An artifact's Send on its way, and the hub's refusal of it: the row
   * leaves, or its unsent reason does, once the hub has it.
   */
  let sendingArtifact = $state(false);
  let sendRefused = $state<string | null>(null);
  async function sendItsMarks(): Promise<void> {
    if (item.kind !== "artifact" || held || sendingArtifact) {
      return;
    }
    sendingArtifact = true;
    sendRefused = null;
    try {
      await sendArtifact(item.instanceId, item.artifactId, "needs-you");
    } catch (error) {
      sendRefused = failureWords(error);
    } finally {
      sendingArtifact = false;
    }
  }

  /** Send stands on the row: something is written and unsent, on an artifact whose Send is not its page's own. */
  const sends = $derived(
    item.kind === "artifact" && item.unsent > 0 && !item.ownSend
  );

  /** The row was chosen: it opens, the panel closes; an artifact opens in its panel at its first pending stop. */
  function chosen(): void {
    onchoose();
    if (item.kind === "artifact") {
      // biome-ignore lint/complexity/noVoid: a refusal is kept where its row says it (artifactOpenKey)
      void openArtifactIn(item.instanceId, item.artifactId, item.stop);
    }
  }

  /** Not now: acknowledged for every device; it waits in Files until it is raised again. */
  function notNow(): void {
    if (item.kind !== "artifact") {
      return;
    }
    notices.acknowledge([item.notNow]).catch(() => undefined);
  }
  /**
   * A session's ask can be peeked, in the wide layout: a thread is opened,
   * not peeked (it is the conversation itself), and a run and a budget have
   * no tail.
   */
  const peeks = $derived(item.kind === "ask" && !item.thread && peekable());

  function peekAsk(): void {
    if (item.kind !== "ask") {
      return;
    }
    onchoose();
    openPeek({ viewId: item.instanceId, href: href ?? "", title: item.title });
  }

  /**
   * A permission answered on the row, under the `answer` choice. A question
   * and a connect ask are answered on their own card in the session (a
   * connect ask by signing in there), which the row opens.
   */
  const answerable = $derived(
    item.kind === "ask" &&
      !item.isQuestion &&
      !item.request.connectAsk &&
      choices.answer === "a"
  );

  /**
   * The last answer sent to this ask, from here or from its session's card:
   * its stage is the row's truth. In flight, both peers hold and the pressed
   * one spins; refused, the hub's words stand under them and either can be
   * pressed again. The row leaves when the hub has taken the answer.
   */
  const sent = $derived(
    item.kind === "ask" ? answerFor(item.request.requestId) : null
  );
  /**
   * A browser ask's Take over on its way, and the hub's refusal of it: the
   * take-over is the transcript card's own (`takeOverBrowser`), and the row
   * leaves once the hub has taken the ask off every screen.
   */
  let taking = $state(false);
  let takeRefused = $state<string | null>(null);
  const answering = $derived(
    taking ||
      (sent !== null && sent.stage !== "failed" && sent.stage !== "applied")
  );
  const answerRefused = $derived.by(() => {
    if (takeRefused !== null) {
      return takeRefused;
    }
    if (sent?.stage !== "failed") {
      return null;
    }
    return sent.reason
      ? `Couldn't send that answer. ${sent.reason}`
      : "Couldn't send that answer.";
  });
  /** What an ask is, as its meta line names it. */
  const askKind = (ask: {
    isQuestion: boolean;
    request: { browserAsk?: unknown; connectAsk?: unknown };
  }): string => {
    if (ask.request.browserAsk) {
      return askWords.browserAsk;
    }
    if (ask.request.connectAsk) {
      return askWords.connectAsk;
    }
    return ask.isQuestion ? "Question" : "Permission";
  };

  /** Which peer was pressed here, for its spinner. */
  let pressed = $state<PermissionAnswer | null>(null);

  async function answer(kind: PermissionAnswer): Promise<void> {
    if (item.kind !== "ask" || held || answering) {
      return;
    }
    pressed = kind;
    takeRefused = null;
    const { browserAsk, requestId } = item.request;
    if (browserAsk && kind === "allow") {
      taking = true;
      takeRefused = await takeOverBrowser(requestId, browserAsk);
      taking = takeRefused === null;
      return;
    }
    submitCommand(item.instanceId, item.machineId, "permission.answer", {
      requestId: item.request.requestId,
      result: permissionAnswer(item.request, kind),
    });
  }

  /** The upstream choice's answer on its way, by the option pressed; the hub's refusal in its words. */
  let choosing = $state<UpstreamPosts | null>(null);
  let choiceRefusal = $state<string | null>(null);
  async function choose(posts: UpstreamPosts): Promise<void> {
    if (item.kind !== "choice" || stale || choosing !== null) {
      return;
    }
    choosing = posts;
    choiceRefusal = null;
    try {
      await answerFleetUpstream(posts);
    } catch (error) {
      choiceRefusal = failureWords(error);
    } finally {
      choosing = null;
    }
  }

  /**
   * One step on the path to HTTPS, laid out: what to do, where or why, and
   * its control, a page to open or its command to copy.
   */
  function tailnetTodo(
    tailnet: TailnetHttps,
    todo: TailnetHttpsTodo
  ): {
    label: string;
    note: string;
    href?: string;
    link?: string;
    command?: string;
  } {
    switch (todo.step) {
      case "enable-magicdns":
      case "enable-https":
        return {
          label:
            todo.step === "enable-magicdns"
              ? tailnetWords.stepMagicDns
              : tailnetWords.stepHttps,
          note: tailnetWords.adminNote,
          href: tailnetWords.dnsPage,
          link: tailnetWords.openDnsPage,
        };
      case "operator":
        return {
          label: tailnetWords.stepOperator,
          note: tailnetWords.runOnce(tailnet.host),
          command: todo.command,
        };
      case "userspace":
        return {
          label: tailnetWords.stepUserspace,
          note: tailnetWords.userspaceNote(tailnet.host),
          href: tailnetWords.userspacePage,
          link: tailnetWords.openDocs,
        };
      case "port":
        break;
    }
    return {
      label: tailnetWords.stepPort(tailnet.port ?? 0),
      note: tailnetWords.portNote(tailnet.host),
      command: todo.command,
    };
  }

  /** Every step on the tailnet's path, while one stands; none once HTTPS is on. */
  const todos = $derived.by(() => {
    if (item.kind !== "tailnet" || item.done) {
      return [];
    }
    const { tailnet } = item;
    return (tailnet.steps ?? []).map((todo) => ({
      step: todo.step,
      done: todo.done,
      ...tailnetTodo(tailnet, todo),
    }));
  });
  /** An approved action waiting for your approval: Deny and Approve stand. */
  const approvable = $derived(
    item.kind === "action" && item.action.state === "proposed"
  );

  /** The permission's own keys (`y`/`a` approve, `n`/`d` deny) while a control here has focus. */
  function onkeydown(event: KeyboardEvent): void {
    if (
      !(answerable || approvable) ||
      isTyping() ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "y" || key === "a") {
      event.preventDefault();
      if (approvable) {
        decide("approve");
      } else {
        answer("allow");
      }
    } else if (key === "n" || key === "d") {
      event.preventDefault();
      if (approvable) {
        decide("deny");
      } else {
        answer("deny");
      }
    }
  }
</script>

{#if item.kind === "relay"}
  <!-- The stream relay's journey: its own card, drawn as Needs you's row
       (its title, the steps, the onboarding meta line), the same card
       Settings › Browsers draws from the same journey. It stands in the
       row's box: its padding and corner, so its title's mark stands in the
       panel's one leading column. -->
  <div
    data-slot="row"
    class="rounded-sm px-space-3 py-space-2 data-stale:opacity-55"
    data-kind="relay"
    data-share="pane:{item.key}"
    data-stale={stale || undefined}
  >
    <RelayJourney
      candidates={item.journey.candidates}
      domain={cawco.relayDomain}
      machine={item.journey.machine}
      onact={actOnRelayCard}
      row
      steps={stepsHere(item.journey.steps)}
      summary={item.journey.summary}
      view={item.done ? "done" : "journey"}
    />
  </div>
{:else}
  <!-- A shell ask's command, or a browser ask's origin, takes the line under
       its reason: its place and the peers move down one row. -->
  {@const lined = Boolean(
    item.kind === "ask" &&
    ((item.request.presentation.command && !item.request.presentation.post) ||
      item.request.browserAsk)
  )}
  <!-- lead, end and below are this card's; the row's box, cover, title, wait and want are NeedsRow's. -->
  <NeedsRow
    artifact={item.kind === "artifact" ? item.artifactId : undefined}
    {held}
    {href}
    kind={item.kind}
    onchoose={chosen}
    {onkeydown}
    peek={peeks || item.kind === "artifact"}
    share="pane:{item.kind === 'ask' ? item.instanceId : item.key}"
    title={item.title}
    {want}
    wait={item.raisedAt === undefined ? null : span(clock.now - item.raisedAt)}
  >
    {#snippet lead()}
      {#if item.kind === "ask" || item.kind === "watch" || item.kind === "artifact"}
        <SessionMark
          caw={cawOf(item.instanceId)}
          id={item.instanceId}
          place={item.cwd || item.machineId}
          status="attn"
        />
      {:else if item.kind === "choice"}
        <IconShield aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "desk"}
        {#if item.done}
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md text-status-done-ink"
          />
        {:else}
          <IconMonitor aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "tailnet"}
        {#if item.done}
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md text-status-done-ink"
          />
        {:else}
          <IconTailnetHttps aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "pairing"}
        <IconLock aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "admission"}
        <IconServer aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "install"}
        <IconError aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "mcp"}
        <IconKey aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "machine"}
        <IconServer aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "task"}
        {#if item.reason === "failed"}
          <IconError aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconNeedsYou aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "action"}
        {#if item.action.state === "unknown"}
          <IconWarningTriangle aria-hidden="true" class="size-icon-md" />
        {:else if item.action.state === "failed"}
          <IconError aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconSend aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else}
        <IconDollar aria-hidden="true" class="size-icon-md" />
      {/if}
    {/snippet}
    {#snippet end()}
      {#if peeks}
        <!-- Glance → peek → dive: read what led here before answering. A box
           round the 16px glyph, centred on the label line, hanging past the
           trailing edge by `--peek-ink` (the box's padding round the glyph
           plus the glyph's side bearing: Maximize's arrow ends at 22.75 of
           24), so its ink ends on the panel's one trailing edge, where a
           wait's figures and Approve's fill end. -->
        <span
          data-slot="end"
          class="absolute end-(--end-x) top-(--end-top) flex type-label"
          style:--end-top="calc(var(--space-2) + (1lh - var(--c-btn-h-xs)) / 2)"
          style:--end-x="calc(var(--space-3) - var(--peek-ink))"
        >
          <Tip disabled={peekTipOff()} label="Peek">
            {#snippet children(tip)}
              <!-- An iPad's finger gets the house's 44px area (`touch-hit`),
                 whole and centred where the box stood before it hung: moved
                 back inboard by `--peek-ink`, so the list never grows a
                 sideways scroll for it. -->
              <button
                data-needs-card-peek
                {...tip}
                aria-label="Peek {item.title}"
                class="select-none touch-hit pointer-hit focus-inset grid size-c-btn-h-xs place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted transition-tint-press hover:bg-surface-hover hover:text-ink-strong motion-safe:active:transform-(--peek-press) coarse:after:start-(--peek-hit-start) coarse:after:end-(--peek-hit-end)"
                onclick={peekAsk}
                {onkeydown}
                style:--peek-hit-end={"calc((var(--c-btn-h-xs) - var(--c-btn-h-lg)) / 2 + var(--peek-ink))"}
                style:--peek-hit-start={"calc((var(--c-btn-h-xs) - var(--c-btn-h-lg)) / 2 - var(--peek-ink))"}
                style:--peek-press="scale(var(--press-scale))"
                type="button"
              >
                <IconMaximize aria-hidden="true" class="size-(--peek-glyph)" />
              </button>
            {/snippet}
          </Tip>
        </span>
      {:else if item.kind === "artifact"}
        <!-- Not now: the first line's trailing cell, a notice's ✕ (NoticeRow),
           its ink on the panel's one trailing edge; always shown, to a mouse
           as to a finger, which gets the house's 44px area moved back
           inboard by `--peek-ink`. -->
        <span
          data-slot="end"
          class="absolute end-(--end-x) top-(--end-top) flex type-label"
          style:--end-top="calc(var(--space-2) + (1lh - var(--c-btn-h-xs)) / 2)"
          style:--end-x="calc(var(--space-3) - var(--peek-ink))"
        >
          <Tip disabled={peekTipOff()} label={artifactWords.notNow}>
            {#snippet children(tip)}
              <button
                data-needs-card-not-now
                {...tip}
                aria-label={artifactWords.notNowNamed(item.title)}
                class="select-none touch-hit pointer-hit focus-inset grid size-c-btn-h-xs place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted transition-tint-press hover:bg-surface-hover hover:text-ink-strong motion-safe:active:transform-(--x-press) coarse:after:start-(--x-hit-start) coarse:after:end-(--x-hit-end)"
                onclick={notNow}
                style:--x-hit-end={"calc((var(--c-btn-h-xs) - var(--c-btn-h-lg)) / 2 + var(--peek-ink))"}
                style:--x-hit-start={"calc((var(--c-btn-h-xs) - var(--c-btn-h-lg)) / 2 - var(--peek-ink))"}
                style:--x-press="scale(var(--press-scale))"
                type="button"
              >
                <IconClose aria-hidden="true" class="size-(--peek-glyph)" />
              </button>
            {/snippet}
          </Tip>
        </span>
      {/if}
    {/snippet}
    {#snippet below()}
      {#if item.kind === "ask" && item.request.presentation.command && !item.request.presentation.post}
        <!-- What runs, under why: its first line, so Approve here is made on
           the command as much as on the card. A held post's target line
           already says where it goes. A shell ask's command: one line under
           its reason, in the transcript's command rule, cut with an
           ellipsis. -->
        <code
          data-slot="needs-command"
          class="pointer-events-none relative col-start-2 col-end-4 row-3 mt-space-row mb-space-1 min-w-0 overflow-hidden border-s-2 border-s-border-hairline ps-space-2 font-mono text-size-meta text-ellipsis whitespace-pre text-ink-muted"
          >{item.request.presentation.command.trim().split("\n")[0]}</code
        >
      {/if}
      {#if item.kind === "ask" && item.request.browserAsk}
        <!-- Where the person will be typing, in the line a command stands in:
           the page's origin whole (never cut, as a command's line is: the
           domain is at its end), broken only after its dots. -->
        <code
          data-slot="needs-origin"
          class="pointer-events-none relative col-start-2 col-end-4 row-3 mt-space-row mb-space-1 min-w-0 overflow-hidden border-s-2 border-s-border-hairline ps-space-2 font-mono text-size-meta wrap-break-word whitespace-normal text-ink-muted"
          ><OriginText origin={item.request.browserAsk.origin} /></code
        >
      {/if}
      {#if item.kind === "ask"}
        <!-- Where it came from: the project first, in its mark and strong ink;
           then what it asks for; then the machine, by its OS mark. The meta
           line of an ask: the project leads, its name a name (label role,
           strong ink) beside its folder in the project's hue; the machine
           follows by its OS mark; a session's name and the machine's name give
           way first. Both marks stand at the house's 16px icon size
           (`icon-md`), the box OsMark is drawn on: at 14px its marks were
           scaled off their pixel grid and read as a smudge at 1x. -->
        <span
          data-where
          data-slot="meta"
          class={[
            "mark-line pointer-events-none relative col-start-2 col-end-4 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted",
            lined ? "row-4" : "row-3",
          ]}
        >
          {#if item.project}
            <span
              data-slot="project"
              class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
              data-box
            >
              <IconFolder
                data-needs-card-mark
                aria-hidden="true"
                class="size-icon-md flex-none"
                style="color: var(--mark-{item.project.hue})"
              />
              <span data-slot="project-name" class="type-label text-ink-strong"
                >{item.project.name}</span
              >
            </span>
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
          {/if}
          <!-- A held post names the session that asked; its title is the row's. -->
          {#if item.request.presentation.post && item.request.presentation.asker}
            <span
              data-slot="asker"
              class="min-w-0 flex-initial overflow-clip text-ellipsis"
              >{item.request.presentation.asker}</span
            >
          {:else}
            <span class="flex-none">{askKind(item)}</span>
          {/if}
          <span
            data-slot="dot"
            aria-hidden="true"
            class="flex-none text-ink-muted">·</span
          >
          <span
            data-slot="machine"
            class="mark-line inline-flex min-w-0 flex-initial items-center gap-space-1"
            data-box
          >
            <OsMark class="size-icon-md flex-none" os={item.machine.os} />
            <span class="min-w-0 overflow-clip text-ellipsis"
              >{item.machine.name}</span
            >
          </span>
          {#if item.stale}
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
            <span class="flex-none">machine offline</span>
          {/if}
        </span>
      {:else if item.kind === "artifact"}
        {@const Kind = ARTIFACT_GLYPHS[item.artifactKind]}
        <!-- Where it came from, as an ask's: its project first, then its kind
           by its glyph where an ask says "Question", then its machine. Send
           ends the line while something is written and not sent. -->
        <span
          data-where
          data-slot="meta"
          class={[
            "mark-line pointer-events-none relative col-start-2 row-3 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted",
            sends ? "col-end-3" : "col-end-4",
          ]}
        >
          {#if item.project}
            <span
              data-slot="project"
              class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
              data-box
            >
              <IconFolder
                data-needs-card-mark
                aria-hidden="true"
                class="size-icon-md flex-none"
                style="color: var(--mark-{item.project.hue})"
              />
              <span data-slot="project-name" class="type-label text-ink-strong"
                >{item.project.name}</span
              >
            </span>
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
          {/if}
          <span
            data-slot="artifact-kind"
            class="mark-line inline-flex flex-none items-center gap-space-1"
            data-box
          >
            <Kind aria-hidden="true" class="size-icon-md flex-none" data-box />
            <span>{artifactWords.kindWord[item.artifactKind]}</span>
          </span>
          <span
            data-slot="dot"
            aria-hidden="true"
            class="flex-none text-ink-muted">·</span
          >
          <span
            data-slot="machine"
            class="mark-line inline-flex min-w-0 flex-initial items-center gap-space-1"
            data-box
          >
            <OsMark class="size-icon-md flex-none" os={item.machine.os} />
            <span class="min-w-0 overflow-clip text-ellipsis"
              >{item.machine.name}</span
            >
          </span>
          {#if item.stale}
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
            <span class="flex-none">machine offline</span>
          {/if}
        </span>
        {#if sends}
          <!-- Send: the kit's sm ghost over the row's cover, its last figure's
             ink on the trailing edge: it hangs past by what stands between
             its box and that ink (the kit's 1px transparent border, its
             padding, `space-2` a side so it never hangs past the row's own
             `space-3`, and the figure's side bearing, 0.07em). -->
          <span
            data-slot="send"
            class="relative col-3 row-3 flex items-center self-center justify-self-end"
            style:--send-hang="calc(-1 * (1px + var(--space-2) + 0.07em))"
          >
            <Button
              data-needs-card-send
              class="me-(--send-hang)"
              pad="more"
              style="--more-px: var(--space-2);"
              aria-label={artifactWords.sendNamed(item.unsent, item.title)}
              disabled={held}
              failed={sendRefused !== null}
              icon={IconSend}
              label={artifactWords.sendCount(item.unsent)}
              onclick={sendItsMarks}
              pending={sendingArtifact}
              pendingLabel={artifactWords.sending}
              size="sm"
              variant="ghost"
            />
          </span>
        {/if}
        {#if sendRefused}
          <div
            data-slot="peers"
            class="relative col-start-2 col-end-4 row-4 mt-space-2 flex justify-end"
          >
            <ErrorText
              message={artifactWords.notSent(sendRefused)}
              title="The hub refused that Send"
            />
          </div>
        {/if}
        <!-- A press (or its address) the hub refused: said on the row, over
           its cover, with Try again, kept through a reload. -->
        <RowFault
          again={chosen}
          class="relative col-start-2 col-end-4 row-5 mt-space-2"
          data-needs-card-refused
          reason={refusals.reason(artifactOpenKey(item.artifactId))}
        />
      {:else if item.kind === "action" && call}
        <!-- The exact call: when, through which account, the tool, the arguments. -->
        <!-- An approved action: its reason, then the call (when, through, tool)
           as label and value pairs on the meta type, then the arguments in a
           content well that scrolls, then where it is from, then the peers.
           Everything the call says is read before the choice is made, in the
           order it is made: when, as whom, what, with what. -->
        <dl
          data-slot="call"
          class="pointer-events-none relative col-start-2 col-end-4 row-3 mx-0 mt-space-2 mb-0 grid grid-cols-(--call-cols) gap-x-space-3 type-meta"
          style:--call-cols="auto minmax(0, 1fr)"
        >
          <dt class="text-ink-muted">Runs</dt>
          <dd class="m-0 wrap-anywhere text-ink-strong">{call.when}</dd>
          <dt class="text-ink-muted">Through</dt>
          <dd class="m-0 wrap-anywhere text-ink-strong">{call.through}</dd>
          <dt class="text-ink-muted">Tool</dt>
          <dd
            data-slot="tool"
            class="m-0 font-(family-name:--font-mono) wrap-anywhere text-ink-strong"
          >
            {call.tool}
          </dd>
        </dl>
        <!-- A scroller with no focusable child is itself in the tab order
           (keyboard-focusable scrollers), so a keyboard scrolls it too. The
           arguments as the hub will send them, pretty-printed: a well the
           pointer and the keyboard can scroll, over the row's cover. -->
        <pre
          data-slot="args"
          class="focus-inset relative col-start-2 col-end-4 row-4 mx-0 my-space-2 max-h-48 overflow-auto overscroll-contain rounded-xs border border-border-well bg-surface-well px-space-3 py-space-2 type-code whitespace-pre text-ink-strong">{call.args}</pre>
        <span
          data-where
          data-slot="meta"
          class="mark-line pointer-events-none relative col-start-2 col-end-4 row-5 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
        >
          {#if item.project}
            <span
              data-slot="project"
              class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
              data-box
            >
              <IconFolder
                data-needs-card-mark
                aria-hidden="true"
                class="size-icon-md flex-none"
                style="color: var(--mark-{item.project.hue})"
              />
              <span data-slot="project-name" class="type-label text-ink-strong"
                >{item.project.name}</span
              >
            </span>
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
          {/if}
          <span class="flex-none">Approved action</span>
          {#if item.action.taskId}
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
            <span class="flex-none num">{item.action.taskId}</span>
          {/if}
        </span>
      {:else if item.kind === "tailnet"}
        <!-- Where it comes from, under what it wants, as every row's meta
           stands; its steps follow. -->
        <span
          data-slot="meta"
          class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
          >{meta}</span
        >
        {#if todos.length > 0}
          <!-- Every step on the path, in order: a step that stands says what to
             do, where or why, and its control; a step taken is its tick and
             its label. -->
          <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
          <ol
            data-slot="steps"
            class="relative col-start-2 col-end-4 row-4 mx-0 my-space-3 grid list-none gap-space-3 p-0"
            role="list"
          >
            <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
            {#each todos as one, index (one.step)}
              <li
                data-slot="step"
                class="group/step mark-line grid grid-cols-(--step-cols) items-box-start gap-x-space-2 gap-y-space-1 type-label"
                data-done={one.done || undefined}
                data-step={one.step}
                style:--step-cols="var(--icon-md) minmax(0, 1fr)"
              >
                <span class="mark-cell">
                  <span
                    data-slot="step-mark"
                    class="grid size-icon-md place-items-center text-ink-muted"
                  >
                    {#if one.done}
                      <IconSuccess
                        aria-hidden="true"
                        class="size-icon-md text-status-done-ink"
                      />
                    {:else}
                      <!-- The step's place in the list, drawn from its
                         attribute: the grid items are no list items, so the
                         list's own counter stays at 0. -->
                      <span
                        data-slot="step-number"
                        aria-hidden="true"
                        class="box-border grid size-full place-items-center rounded-pill border border-border-control type-meta leading-none num before:content-data-n"
                        data-n={index + 1}
                      ></span>
                    {/if}
                  </span>
                </span>
                <span
                  data-slot="step-label"
                  class="min-w-0 type-label wrap-anywhere text-ink-strong group-data-done/step:text-ink-muted"
                  >{#if one.done}<span class="sr-only"
                      >{tailnetWords.stepDone}{" "}</span
                    >{/if}{one.label}</span
                >
                {#if !one.done}
                  <span
                    data-slot="step-note"
                    class="col-start-2 min-w-0 type-meta wrap-anywhere text-ink-muted"
                    >{one.note}</span
                  >
                  {#if one.command}
                    <div
                      data-slot="step-command"
                      class="col-start-2 mt-space-1 flex min-w-0 *:min-w-0 *:flex-auto"
                      data-box
                    >
                      <CopyBox
                        label={tailnetWords.command}
                        text={one.command}
                        wrap
                      />
                    </div>
                  {:else if one.href}
                    <div
                      data-slot="step-link"
                      class="col-start-2 mt-space-1 flex min-w-0 *:min-w-0 *:flex-initial"
                      data-box
                    >
                      <Button
                        href={one.href}
                        icon={IconExternal}
                        label={one.link}
                        rel="noopener"
                        size="sm"
                        target="_blank"
                        variant="secondary"
                      />
                    </div>
                  {/if}
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      {:else if item.kind === "task"}
        <span
          data-where
          data-slot="meta"
          class="mark-line pointer-events-none relative col-start-2 col-end-4 row-3 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
        >
          {#if item.project}
            <span
              data-slot="project"
              class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
              data-box
            >
              <IconFolder
                data-needs-card-mark
                aria-hidden="true"
                class="size-icon-md flex-none"
                style="color: var(--mark-{item.project.hue})"
              />
              <span data-slot="project-name" class="type-label text-ink-strong"
                >{item.project.name}</span
              >
            </span>
            <span
              data-slot="dot"
              aria-hidden="true"
              class="flex-none text-ink-muted">·</span
            >
          {/if}
          <span class="flex-none">Task</span>
          <span
            data-slot="dot"
            aria-hidden="true"
            class="flex-none text-ink-muted">·</span
          >
          <span class="flex-none num">{item.taskId}</span>
        </span>
      {:else}
        <NeedsMeta text={meta} />
      {/if}
      {#if item.kind === "ask" && answerable}
        <!-- Deny then Approve together at the trailing edge, the same size, each
           tinted by what it does: Deny in the fail status's fill and ink,
           Approve in the done status's, the house's success pair (go, not
           "working"). Both pairs are their hue's 3-step mixed 24% toward its
           9-step, so they are equal in salience (The Peer Rule): the same fill
           strength, and neither changes under the pointer, as the grant
           variant holds still, so neither is made the more inviting. On a
           finger the gap opens (The 44 Touch Rule), the separation the rule's
           opposite ends gave a rushed thumb. -->
        <div
          data-slot="peers"
          class={[
            "relative col-start-2 col-end-4 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4",
            lined ? "row-5" : "row-4",
          ]}
        >
          {#if answerRefused}
            <ErrorText
              message={answerRefused}
              title="The hub refused that answer"
            />
          {/if}
          <Button
            data-deny
            aria-label="Deny {answered}"
            answer="deny"
            disabled={held || (answering && pressed !== "deny")}
            failed={answerRefused !== null && pressed === "deny"}
            icon={IconClose}
            label="Deny"
            onclick={() => answer("deny")}
            {onkeydown}
            pending={answering && pressed === "deny"}
            pendingLabel="Denying…"
            size="sm"
            variant="secondary"
          />
          <Button
            data-approve
            aria-label="{item.request.browserAsk
              ? 'Take over'
              : 'Approve'} {answered}"
            answer="approve"
            disabled={held || (answering && pressed !== "allow")}
            failed={answerRefused !== null && pressed === "allow"}
            icon={item.request.browserAsk ? IconInteract : IconTick}
            label={item.request.browserAsk ? askWords.takeOver : "Approve"}
            onclick={() => answer("allow")}
            {onkeydown}
            pending={answering && pressed === "allow"}
            pendingLabel={item.request.browserAsk
              ? askWords.takingOver
              : "Approving…"}
            size="sm"
            variant="secondary"
          />
        </div>
      {:else if item.kind === "choice"}
        <!-- Its three options as the peers: same size, type and fill (The Peer
           Rule); keeping agents off comes first, as the recommended one, then
           asking first, then letting them post. Its options are its words,
           longer than Deny and Approve, too long to stand side by side in the
           panel: they stack, each the text column's width, so the three stay
           peers in size. -->
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-4 mt-space-2 flex flex-col items-stretch justify-end gap-space-2 coarse:gap-space-4"
        >
          {#if choiceRefusal}
            <ErrorText
              message={choiceRefusal}
              title="The hub refused that answer"
            />
          {/if}
          {#each UPSTREAM_POSTS as answer (answer)}
            <Button
              edge="none"
              disabled={stale || (choosing !== null && choosing !== answer)}
              failed={answer === "off" && choiceRefusal !== null}
              label={upstreamPostsWords(answer)}
              onclick={() => choose(answer)}
              pending={choosing === answer}
              pendingLabel="Saving…"
              size="sm"
              variant="secondary"
            />
          {/each}
        </div>
      {:else if item.kind === "desk" && !item.done}
        <!-- Skip and Allow as peers (The Peer Rule): Skip puts the row away in
           this browser, the presence menu still offers it; Allow calls the
           browser's own prompts on the press. A refusal stands over them,
           naming each blocked setting and where to turn it on. A browser
           with no Idle Detection has nothing of it to allow: its row says
           so, with Skip alone unless notifications are still to ask. -->
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-4 mt-space-2 flex flex-wrap justify-end gap-space-2 coarse:gap-space-4"
        >
          {#if person.refusal}
            <!-- Wrapped, never cut to one line: the setting's name and where
               to turn it on are the whole point of it. -->
            <p
              data-slot="desk-refusal"
              class="type-meta m-0 w-full text-pretty wrap-anywhere text-status-fail-ink"
              role="alert"
            >
              {person.refusal.title}. {person.refusal.message}
            </p>
          {/if}
          <Button
            data-skip
            disabled={person.pending === "allow"}
            label={presenceWords.skip}
            onclick={skipHere}
            size="sm"
            variant="secondary"
          />
          {#if item.agent !== null || item.idle || item.notify}
            <Button
              data-allow
              disabled={person.pending === "allow"}
              label={presenceWords.allow}
              onclick={() => allowHere()}
              pending={person.pending === "allow"}
              pendingLabel={presenceWords.allowing}
              size="sm"
              variant="secondary"
            />
          {/if}
        </div>
      {:else if item.kind === "tailnet" && item.done}
        <!-- Ticked: the https dashboard to open. -->
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-5 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
        >
          <Button
            href={item.tailnet.dashboard}
            icon={IconExternal}
            label={tailnetWords.openDashboard}
            rel="noopener"
            size="sm"
            target="_blank"
            variant="secondary"
          />
        </div>
      {:else if item.kind === "pairing" || item.kind === "admission"}
        {@const who =
          item.kind === "pairing"
            ? `${item.title}, code ${item.request.userCode}`
            : item.title}
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-4 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
        >
          {#if refusal}
            <ErrorText message={refusal} title="The hub refused that answer" />
          {/if}
          <Button
            data-deny
            aria-label="Deny {who}"
            answer="deny"
            disabled={held || admitting === true}
            icon={IconClose}
            label="Deny"
            onclick={() => admitOrDeny(false)}
            pending={admitting === false}
            pendingLabel="Denying…"
            size="sm"
            variant="secondary"
          />
          <Button
            data-approve
            aria-label="{item.kind === 'pairing' ? 'Approve' : 'Admit'} {who}"
            answer="approve"
            disabled={held || admitting === false}
            icon={IconTick}
            label={item.kind === "pairing" ? "Approve" : "Admit"}
            onclick={() => admitOrDeny(true)}
            pending={admitting === true}
            pendingLabel={item.kind === "pairing" ? "Approving…" : "Admitting…"}
            size="sm"
            variant="secondary"
          />
        </div>
      {:else if item.kind === "action"}
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-6 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
        >
          {#if refusal}
            <ErrorText
              message={refusal}
              title="The hub refused that decision"
            />
          {/if}
          {#if approvable}
            <Button
              data-deny
              aria-label="Deny {item.action.tool} on {item.action.connection}"
              answer="deny"
              disabled={held || deciding}
              onclick={() => decide("deny")}
              {onkeydown}
              size="sm"
              variant="secondary"
            >
              <IconClose />
              <span>Deny</span>
            </Button>
            <Button
              data-approve
              aria-label="Approve {item.action.tool} on {item.action
                .connection}"
              answer="approve"
              disabled={held || deciding}
              onclick={() => decide("approve")}
              {onkeydown}
              size="sm"
              variant="secondary"
            >
              <IconTick />
              <span>Approve</span>
            </Button>
          {:else}
            <Button
              aria-label="Remove {item.action.tool} on {item.action
                .connection} from Needs you"
              disabled={held || deciding}
              onclick={() => decide("checked")}
              size="sm"
              variant="secondary"
            >
              <IconCheck />
              <span>Remove</span>
            </Button>
          {/if}
        </div>
      {:else if item.kind === "mcp" && item.why}
        <!-- Why the sign-in ended, the provider's own words under Show
           details, over the row's cover: its press still opens Configure. -->
        <RowFault
          class="relative col-start-2 col-end-4 row-4 mt-space-1"
          data-needs-card-mcp-why
          details={item.why}
          reason={mcpWords.signInEndedWhy}
        />
      {/if}
    {/snippet}
  </NeedsRow>
{/if}
