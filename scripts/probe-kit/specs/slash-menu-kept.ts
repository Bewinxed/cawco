/**
 * A session's `/` menu outlives the hub's built transcript: read on a
 * scratch fleet with the real Claude Code against the mock model.
 *
 * The hub builds each transcript from the session's frames, and its `/` menu
 * (the names behind `/`, and which are skills) from the newest `init`. A
 * transcript the hub let go (transcripts.ts `sweep`, ten idle minutes) or
 * never built since it restarted is read back from the machine's stored
 * file, which for a Claude session holds no `init`: its menu came back
 * empty, so a sleeping session offered no skill behind `/` and its composer
 * suggested none (the r170 recording's suggesting/chip). The session's row
 * keeps the menu its newest `init` listed (instances.commands), and a
 * transcript built from the stored file starts from it.
 *
 * One session is given a turn and its transcript's menu read; the hub is
 * restarted, so the next page is built from the stored file; asserted: that
 * page's menu is the one before, names and skills alike.
 *
 *   bun scripts/probe-kit/run.ts slash-menu-kept
 */
import type { TranscriptPage } from "../../../packages/core/src/transcript-types";
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

type Menu = TranscriptPage["facts"]["commands"];

/** The menu as a line: its names and skills, in order. */
const said = (menu: Menu | undefined): string =>
  menu
    ? `${menu.names.length} names (${menu.names.slice(0, 6).join(", ")}…), skills [${menu.skills.join(", ")}]`
    : "no facts";

const spec: Spec = {
  name: "slash-menu-kept",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const instanceId = await fleet.spawn("claude", "slash menu", fleet.workdir);
    await fleet.send(instanceId, `Slash menu ${crypto.randomUUID()}`);
    await until(
      "the session's turn done",
      () => fleet.instance(instanceId),
      (row) => row?.status === "running" && row.turn_open_at === null,
      120_000
    );
    const menuOf = async () =>
      (await fleet.api<TranscriptPage>(`/api/instances/${instanceId}/transcript`))
        .facts?.commands;
    const before = await until(
      "the transcript's menu, from the session's init",
      menuOf,
      (menu) => (menu?.names.length ?? 0) > 0,
      60_000
    );
    kit.note(`before the restart: ${said(before)}`);

    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    await fleet.agentUp();
    const after = await menuOf();
    kit.note(`after the restart: ${said(after)}`);
    check(
      "the transcript built again from the stored file offers the menu the session's init listed",
      JSON.stringify(after?.names) === JSON.stringify(before.names) &&
        JSON.stringify(after?.skills) === JSON.stringify(before.skills),
      `before: ${said(before)}; after: ${said(after)}`
    );
    await fleet.stopSession(instanceId);
  },
};

export default spec;
