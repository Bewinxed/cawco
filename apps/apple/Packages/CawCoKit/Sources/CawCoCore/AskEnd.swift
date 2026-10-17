import CawCoAPI

/// The quiet line an ask leaves when it ends with no answer from this device
/// (transcript/local.ts `withdrawnNote`, `answeredNote`): withdrawn before it
/// was answered, or answered somewhere else, saying what won and where
/// (JOURNEY.md Flow 2: "the answer row resolves to the answer that won,
/// naming where it came from").
enum AskEnd {
    /// Withdrawn before it was answered; `reason` is the hub's, for an ask it could not show anyone.
    static func withdrawn(question: Bool, reason: String?) -> String {
        let line = question ? "Question withdrawn" : "Permission request withdrawn"
        return reason.map { "\(line): it couldn't be shown (\($0))" } ?? line
    }

    /// Answered somewhere else: "Already answered — Denied from the app."
    /// `harness` names the session's harness, for an ask it took itself.
    static func answered(_ ask: ParkedAsk, _ answer: Components.Schemas.AskAnswer, harness: String) -> String {
        let word: String? = switch answer.behavior {
        case .allow: ask.isQuestion ? "Answered" : "Approved"
        case .deny: ask.isQuestion ? "Dismissed" : "Denied"
        case .unrecognized, nil: nil
        }
        let name = answer.name
        // A place a newer hub names and this app does not know is not guessed at.
        let place: String? = switch answer.via {
        case .page: name.map { "from \($0)" } ?? "from another tab"
        case .app: name.map { "from \($0)" } ?? "from the app"
        case .session: name.map { "by \($0)" } ?? "by another session"
        case .harness: "in \(harness)"
        case .unrecognized: nil
        }
        let said = [word, place].compactMap(\.self).joined(separator: " ")
        guard !said.isEmpty else { return "Already answered" }
        return word == nil ? "Already answered \(said)" : "Already answered — \(said)"
    }

    /// A session's harness as a transcript names it (speaker.ts `speakerName`).
    static func harnessName(_ harness: String?) -> String {
        ["claude": "Claude Code", "opencode": "opencode", "code": "opencode", "pi": "pi"][harness ?? ""] ?? harness ?? "Agent"
    }
}
