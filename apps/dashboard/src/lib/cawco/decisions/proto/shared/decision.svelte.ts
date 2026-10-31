/**
 * The request's answers as the three prototypes keep them: his picks, notes
 * and remarks by question, the settled answers he overruled, his Send and
 * the agent's next round. One state behind three structures, so what
 * differs between them is only how they draw it. In the product the hub
 * keeps these; here they are kept in the page.
 */
import {
  type Answer,
  type ListLook,
  type Question,
  REPLY,
  REQUEST,
  roundTwo,
  type Size,
  TODAY_LOOK,
  takenOff,
} from "./request";

/** A remark that is not a pick. */
export type Remark = "decided" | "same" | "drop";

export const REMARKS: { id: Remark; word: string }[] = [
  { id: "decided", word: "Already decided" },
  { id: "same", word: "Same thing" },
  { id: "drop", word: "Drop this" },
];

/** Where a request starts, for a story. */
export interface Seed {
  notes?: Record<string, string>;
  picks?: Record<string, string[]>;
  /** The agent's next round has come back. */
  round?: 1 | 2;
  /** Sent, at this time of day. */
  sentAt?: string;
}

/** How long the hub takes to keep a Send, and the agent to answer it. Ours: enough to see each. */
const SEND_MS = 600;
const ROUND_MS = 2400;

const clock = () =>
  new Date().toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export class DecisionState {
  readonly request = REQUEST;
  picks = $state<Record<string, string[]>>({});
  notes = $state<Record<string, string>>({});
  remarks = $state<Record<string, Remark | null>>({});
  overruled = $state<Record<string, boolean>>({});
  sentAt = $state<string | null>(null);
  sending = $state(false);
  round = $state<1 | 2>(1);
  /** What went at the last Send: picks, notes and remarks, to tell a change since. */
  sent = $state<{
    picks: Record<string, string[]>;
    notes: Record<string, string>;
  } | null>(null);
  /** The size each question's demonstrations stand at, where he chose one. */
  sizes = $state<Record<string, Size | "all">>({});
  /** The questions the agent took off in the last round. */
  removed = $state<string[]>([]);

  constructor(seed: Seed = {}) {
    this.picks = { ...seed.picks };
    this.notes = { ...seed.notes };
    if (seed.sentAt) {
      this.sentAt = seed.sentAt;
      this.sent = { picks: { ...seed.picks }, notes: { ...seed.notes } };
    }
    if (seed.round === 2) {
      this.nextRound();
    }
  }

  /** Every question of this round, the unlocked ones included. */
  readonly all = $derived(
    this.round === 2 ? roundTwo(this.sent?.picks ?? {}) : REQUEST.questions
  );

  /** The questions in front of him: a dependent one only once its pick is made. */
  readonly questions = $derived(this.all.filter((q) => this.open(q)));

  /** Whether `q` is open: no earlier pick it rests on, or that pick made. */
  open(q: Question): boolean {
    return !q.after || this.chose(q.after.question, q.after.answer);
  }

  /** The size `q`'s demonstrations stand at: his choice, else the one the agent named. */
  sizeOf(q: Question): Size {
    const size = this.sizes[q.id];
    return size && size !== "all" ? size : q.size;
  }

  setSize(q: Question, size: Size | "all") {
    this.sizes = { ...this.sizes, [q.id]: size };
  }

  /** The questions a pick of `answer` on `q` opens. */
  follows(q: Question, answer: Answer): Question[] {
    return this.all.filter(
      (one) => one.after?.question === q.id && one.after.answer === answer.id
    );
  }

  chose(question: string, answer: string): boolean {
    return this.picks[question]?.includes(answer) ?? false;
  }

  /** One press picks, the same press clears. */
  pick(question: string, answer: string) {
    const now = this.picks[question] ?? [];
    this.picks = {
      ...this.picks,
      [question]: now.includes(answer) ? [] : [answer],
    };
    const q = this.all.find((one) => one.id === question);
    if (q?.settled && answer !== q.settled.answer) {
      this.overruled = { ...this.overruled, [question]: true };
    }
  }

  note(question: string, words: string) {
    this.notes = { ...this.notes, [question]: words };
  }

  /** A remark: one press marks the question with it, the same press takes it back. */
  remark(question: string, remark: Remark) {
    this.remarks = {
      ...this.remarks,
      [question]: this.remarks[question] === remark ? null : remark,
    };
  }

  /** The answer that stands on `q`: his pick, else a settlement. */
  standing(q: Question): string | null {
    return this.picks[q.id]?.[0] ?? q.settled?.answer ?? null;
  }

  /** Who decided `q`, in words, when it wasn't him. */
  settledBy(q: Question): string | null {
    return !this.picks[q.id]?.length && q.settled ? q.settled.by : null;
  }

  /** Each question's state, as every structure's progress draws it. */
  stateOf(q: Question): "picked" | "settled" | "remark" | "open" {
    if (this.picks[q.id]?.length) {
      return "picked";
    }
    if (this.remarks[q.id]) {
      return "remark";
    }
    if (q.settled) {
      return "settled";
    }
    return "open";
  }

  /** The list's look with every standing answer applied, and the recommendation where none stands. */
  look(recommended = true): ListLook {
    const look: ListLook = { ...TODAY_LOOK };
    for (const q of this.questions) {
      const id =
        this.standing(q) ??
        (recommended ? q.answers.find((a) => a.recommended)?.id : null);
      const answer = q.answers.find((a) => a.id === id);
      if (answer) {
        (look as unknown as Record<string, string>)[q.sets] = answer.value;
      }
    }
    return look;
  }

  /** The list's look with one answer of one question put in. */
  lookWith(q: Question, answer: Answer): ListLook {
    return { ...this.look(), [q.sets]: answer.value };
  }

  readonly pickCount = $derived(
    this.questions.filter((q) => this.picks[q.id]?.length).length
  );

  readonly noteCount = $derived(
    this.questions.filter((q) => this.notes[q.id]?.trim()).length
  );

  /** What changed since the last Send: picks and notes. */
  readonly changes = $derived.by(() => {
    if (!this.sent) {
      return 0;
    }
    const { sent } = this;
    return this.questions.filter(
      (q) =>
        (this.picks[q.id]?.[0] ?? "") !== (sent.picks[q.id]?.[0] ?? "") ||
        (this.notes[q.id] ?? "").trim() !== (sent.notes[q.id] ?? "").trim()
    ).length;
  });

  /** The bar's Send, in words. */
  readonly sendWord = $derived.by(() => {
    if (this.sent) {
      return this.changes === 0
        ? null
        : `Send ${this.changes} ${this.changes === 1 ? "change" : "changes"}`;
    }
    if (this.pickCount > 0) {
      return `Send ${this.pickCount} ${this.pickCount === 1 ? "pick" : "picks"}`;
    }
    return this.noteCount > 0 ? "Send note" : "Send";
  });

  readonly canSend = $derived(
    !this.sending &&
      (this.sent ? this.changes > 0 : this.pickCount + this.noteCount > 0)
  );

  /** The sign-off: what goes at Send. */
  readonly signOff = $derived.by(() => {
    const picks = `${this.pickCount} ${this.pickCount === 1 ? "pick" : "picks"}`;
    const notes = `${this.noteCount} ${this.noteCount === 1 ? "note" : "notes"}`;
    return `${picks} and ${notes} go to ${REQUEST.asker.name} when you send.`;
  });

  /** Send: the hub keeps it, then the agent answers with its next round. */
  send() {
    if (!this.canSend) {
      return;
    }
    this.sending = true;
    setTimeout(() => {
      this.sending = false;
      this.sentAt = clock();
      this.sent = { picks: { ...this.picks }, notes: { ...this.notes } };
      if (this.round === 1) {
        setTimeout(() => this.nextRound(), ROUND_MS);
      }
    }, SEND_MS);
  }

  /** The agent's next round: questions changed, one added, one built and taken off. */
  nextRound() {
    this.removed = takenOff(this.sent?.picks ?? {});
    this.round = 2;
  }

  /** In round two, the questions new or changed since he sent. */
  readonly since = $derived(
    this.round === 2
      ? this.questions.filter((q) => q.fresh || q.changed).map((q) => q.id)
      : []
  );

  /** The agent's reply under a note he sent, once its round is back. */
  replyTo(q: Question): string | null {
    return this.round === 2 && this.sent?.notes[q.id]?.trim() ? REPLY : null;
  }

  /** "Since you sent" in words; null before a round comes back. */
  readonly sinceWords = $derived.by(() => {
    if (this.round !== 2) {
      return null;
    }
    const fresh = this.questions.filter((q) => q.fresh).length;
    const changed = this.questions.filter((q) => q.changed).length;
    const parts = [
      changed ? `${changed} changed` : null,
      fresh ? `${fresh} new` : null,
      this.removed.length ? `${this.removed.length} built and taken off` : null,
    ].filter(Boolean);
    return `Since you sent: ${parts.join(", ")}.`;
  });

  /** Keys: 1 to 5 pick the nth answer of `q`; Command or Control with Enter sends. */
  keys(event: KeyboardEvent, q: Question | null) {
    const target = event.target as HTMLElement | null;
    if (event.defaultPrevented || target?.closest("textarea, input")) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      this.send();
      return;
    }
    if (!q || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const n = Number(event.key);
    const answer = q.answers[n - 1];
    if (answer) {
      event.preventDefault();
      this.pick(q.id, answer.id);
    }
  }
}
