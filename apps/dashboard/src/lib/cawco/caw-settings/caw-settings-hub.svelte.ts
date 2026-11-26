/**
 * Caw's settings and the fleet's trigger defaults on the hub's routes:
 *
 * - a project's kinds of trigger (CawSettingsHub):
 *   `GET /api/projects/:id/trigger-settings`, read as the panel opens and
 *   again after each change; a kind's change is
 *   `PATCH /api/projects/:id/trigger-settings/:kind`;
 * - what his chat runs as: harness, model and mode by
 *   `PATCH /api/projects/:id/caw` (stores `configureCaw`), its account the
 *   project's own by `PATCH /api/projects/:id` (`editProject`);
 * - whether his sessions may change these: `changesSettings` by
 *   `PATCH /api/projects/:id/caw`;
 * - the fleet's default per kind (FleetTriggersHub):
 *   `GET /api/fleet/trigger-settings`, a kind's change
 *   `PATCH /api/fleet/trigger-settings/:kind`.
 *
 * Every change shows at once: what it sets stands over what the hub last
 * said until the hub answers, and what each kind of a project inherits is
 * resolved as the hub resolves it (core `triggerSettingInEffect`) over the
 * layers the hub last sent. The hub's answer is then what shows; a refusal
 * takes the change back, reads the hub again and says why on the row it was
 * made in (the panel's `refused…` lines).
 */
import {
  byTriggerKind,
  type ProjectTriggerSettings,
  type TriggerKind,
  type TriggerSetting,
  triggerSettingInEffect,
} from "@cawco/core/triggers";
import {
  triggerKindWords,
  cawSettingsWords as words,
} from "@cawco/core/words/caw-settings";
import { failureClause } from "#lib/platform/hub-read.js";
import { connectionStore } from "../hub/socket.svelte";
import type { CawLead } from "../project/caw-lead.svelte";
import type { ProjectRow } from "../projects";
import {
  configureCaw,
  editProject,
  fleetTriggerSettings,
  projectTriggerSettings,
  setFleetTrigger,
  setProjectTrigger,
} from "../stores/projects.svelte";
import type { CawRunsAs, TriggerSettingsView } from "./caw-settings";

/** What the panel holds of his chat and his switch: the lead's view, which his answers replace. */
type SettingsLead = Pick<CawLead, "view">;

/**
 * The kinds' changes not answered yet, over what the hub last said, and the
 * last one it refused. Each kind's last change asked is the one that
 * stands: an earlier answer arriving after it is not where it stands.
 */
class KindChanges {
  /** The kind whose last change the hub refused, and its words. */
  refused = $state<{ kind: TriggerKind; words: string } | null>(null);
  #kinds = $state<Partial<Record<TriggerKind, Partial<TriggerSetting>>>>({});
  readonly #asked = new Map<TriggerKind, number>();

  /** `setting` with the change asked of `kind` over it. */
  over(kind: TriggerKind, setting: TriggerSetting): TriggerSetting {
    return { ...setting, ...this.#kinds[kind] };
  }

  /**
   * `patch` of `kind` shown at once and sent by `send`; its answer to
   * `took`. Refused, it is taken back, its row says why, and `reread`
   * reads where the hub stands.
   */
  async ask<T>(
    kind: TriggerKind,
    patch: Partial<TriggerSetting>,
    send: () => Promise<T>,
    took: (answer: T) => void,
    reread: () => Promise<void>
  ): Promise<void> {
    const turn = (this.#asked.get(kind) ?? 0) + 1;
    this.#asked.set(kind, turn);
    this.#kinds = {
      ...this.#kinds,
      [kind]: { ...this.#kinds[kind], ...patch },
    };
    if (this.refused?.kind === kind) {
      this.refused = null;
    }
    const latest = () => this.#asked.get(kind) === turn;
    try {
      const answer = await send();
      if (latest()) {
        took(answer);
        this.#drop(kind);
      }
    } catch (error) {
      if (latest()) {
        this.#drop(kind);
        this.refused = {
          kind,
          words: words.refused(
            words.kindUnchanged(triggerKindWords[kind].name),
            failureClause(error)
          ),
        };
        await reread();
      }
    }
  }

  #drop(kind: TriggerKind): void {
    const { [kind]: _, ...rest } = this.#kinds;
    this.#kinds = rest;
  }
}

/** One project's Caw settings, as his panel shows and changes them. */
export class CawSettingsHub {
  readonly #project: () => ProjectRow;
  readonly #lead: SettingsLead;

  /** Each kind's layers and what is in effect, as the hub last sent them; null until read. */
  read = $state<ProjectTriggerSettings | null>(null);
  /** Why the kinds could not be read, in the hub's words. */
  unread = $state<string | null>(null);
  /** His chat's last change, refused: the hub's words. */
  refusedChat = $state<string | null>(null);
  /** His changing switch's last change, refused: the hub's words. */
  refusedChanges = $state<string | null>(null);

  readonly #kinds = new KindChanges();
  /** His chat's change and his switch's, not answered yet. */
  #chat = $state<Partial<CawRunsAs>>({});
  #changes = $state<boolean | null>(null);
  /** His chat's and his switch's last change asked: an earlier answer arriving after it is not where it stands. */
  readonly #asked = new Map<"chat" | "changes", number>();

  constructor(project: () => ProjectRow, lead: SettingsLead) {
    this.#project = project;
    this.#lead = lead;
  }

  /** The kind whose last change the hub refused, and its words. */
  get refusedKind(): { kind: TriggerKind; words: string } | null {
    return this.#kinds.refused;
  }

  /** The hub is out of reach: what shows is what it said last. */
  readonly hubAway = $derived(connectionStore.hub === "unreachable");

  /** What his chat runs as: the project's, a change over it while it is asked. */
  readonly chat = $derived.by((): CawRunsAs => ({
    account: this.#project().account,
    harness: this.#project().cawHarness,
    model: this.#project().cawModel,
    mode: this.#lead.view?.mode ?? null,
    ...this.#chat,
  }));

  /** Whether his sessions may change these settings. */
  readonly changesSettings = $derived.by(
    () => this.#changes ?? this.#lead.view?.changesSettings ?? false
  );

  /** Each kind: its own layer with any change over it, and what that puts in effect. */
  readonly triggers = $derived.by((): TriggerSettingsView | null => {
    const { read, chat } = this;
    if (!read) {
      return null;
    }
    const caw = {
      harness: chat.harness,
      model: chat.model,
      // The account in effect may be its area's: the hub's, unless his
      // chat's own is being changed to one.
      account: this.#chat.account ?? read.caw.account,
    };
    return {
      kinds: byTriggerKind((kind) => {
        const own = this.#kinds.over(kind, read.kinds[kind].own);
        return {
          own,
          inEffect: triggerSettingInEffect(own, read.kinds[kind].fleet, caw),
        };
      }),
    };
  });

  /** Reads each kind from the hub. */
  async load(): Promise<void> {
    try {
      this.read = await projectTriggerSettings(this.#project().id);
      this.unread = null;
    } catch (error) {
      this.unread = failureClause(error);
    }
  }

  /** `row`'s change asked now: whether it is still the last one asked. */
  #ask(row: "chat" | "changes"): () => boolean {
    const turn = (this.#asked.get(row) ?? 0) + 1;
    this.#asked.set(row, turn);
    return () => this.#asked.get(row) === turn;
  }

  /** A change to one kind's own layer: only what it changes, null back to inherited. */
  setKind(kind: TriggerKind, patch: Partial<TriggerSetting>): Promise<void> {
    return this.#kinds.ask(
      kind,
      patch,
      () => setProjectTrigger(this.#project().id, kind, patch),
      (read) => {
        this.read = read;
      },
      () => this.load()
    );
  }

  /**
   * A change to what his chat runs as: its account is the project's own
   * (`editProject`), its harness, model and mode his (`configureCaw`). The
   * kinds that fall back to his chat are read again after it.
   */
  async setChat(patch: Partial<TriggerSetting>): Promise<void> {
    const { account, harness, model, mode } = patch;
    const moves = {
      ...(harness ? { harness } : {}),
      ...(model === undefined ? {} : { model }),
      ...(mode === undefined ? {} : { mode }),
    };
    const latest = this.#ask("chat");
    this.#chat = {
      ...this.#chat,
      ...moves,
      ...(account === undefined ? {} : { account }),
    };
    this.refusedChat = null;
    const projectId = this.#project().id;
    try {
      if (account !== undefined) {
        await editProject(projectId, { account });
      }
      if (Object.keys(moves).length > 0) {
        this.#lead.view = await configureCaw(projectId, moves);
      }
    } catch (error) {
      if (latest()) {
        this.refusedChat = words.refused(
          words.chatUnchanged,
          failureClause(error)
        );
      }
    }
    if (latest()) {
      this.#chat = {};
    }
    await this.load();
  }

  /** His changing switch flipped. */
  async setChanges(next: boolean): Promise<void> {
    const was = this.changesSettings;
    const latest = this.#ask("changes");
    this.#changes = next;
    this.refusedChanges = null;
    try {
      const view = await configureCaw(this.#project().id, {
        changesSettings: next,
      });
      if (latest()) {
        this.#lead.view = view;
      }
    } catch (error) {
      if (latest()) {
        this.refusedChanges = words.refused(
          words.changesUnchanged(was),
          failureClause(error)
        );
      }
    }
    if (latest()) {
      this.#changes = null;
    }
  }
}

/**
 * The fleet's default for each kind of trigger, as Configure › Caw's
 * triggers shows and changes it.
 */
export class FleetTriggersHub {
  /** Each kind's fleet default, as the hub last sent it; null until read. */
  read = $state<Record<TriggerKind, TriggerSetting> | null>(null);
  /** Why the kinds could not be read, in the hub's words. */
  unread = $state<string | null>(null);
  readonly #kinds = new KindChanges();

  /** The kind whose last change the hub refused, and its words. */
  get refusedKind(): { kind: TriggerKind; words: string } | null {
    return this.#kinds.refused;
  }

  /** Each kind's default, any change over it while it is asked. */
  readonly kinds = $derived.by(() => {
    const { read } = this;
    return read
      ? byTriggerKind((kind) => this.#kinds.over(kind, read[kind]))
      : null;
  });

  async load(): Promise<void> {
    try {
      this.read = (await fleetTriggerSettings()).kinds;
      this.unread = null;
    } catch (error) {
      this.unread = failureClause(error);
    }
  }

  /** A change to one kind's fleet default: only what it changes, null back to each project's Caw. */
  setKind(kind: TriggerKind, patch: Partial<TriggerSetting>): Promise<void> {
    return this.#kinds.ask(
      kind,
      patch,
      () => setFleetTrigger(kind, patch),
      ({ kinds }) => {
        this.read = kinds;
      },
      () => this.load()
    );
  }
}
