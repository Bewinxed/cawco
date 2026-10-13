import Foundation
import Observation
import OSLog

/// What the operator asked of a session from where it is listed (its row's
/// menu, a swipe, Peek's menu), from the press to the hub's word on it
/// (DESIGN.md, The Stay In Context Rule). Every row that shows the session
/// reads the same record, so the answer lands where it was asked:
///
/// - in flight from the press until the hub answers: the row says what is
///   happening to it ("Stopping…") and nothing claims it done;
/// - answered: the record goes, and the row is what the hub's frames say;
/// - refused: the hub's reason stays on the row, for as long as the session
///   still stands as it did when it was asked, or until it is acted on again.
@MainActor
@Observable
public final class SessionActs {
    public enum Verb: String, Sendable {
        case stop, archive, keep, discard, fork, rename, deleteTranscript, continueOn
    }

    public enum Stage: Equatable, Sendable {
        case inFlight
        case refused(String)
        /// Carried to its end away from the row it was asked on: what it came to,
        /// and the session it made, which the row's menu opens.
        case done(String, opens: String?)
    }

    public struct Act: Equatable, Sendable {
        public let verb: Verb
        public fileprivate(set) var stage: Stage
        /// What the session was when the hub refused (`InstanceRow.status`):
        /// a refusal stands only while it still is, so it never outlives its
        /// news. Read at the refusal, not the ask: the hub files a Stop as
        /// stopped at once, then may answer that the machine is offline.
        fileprivate(set) var status: String?
    }

    public private(set) var acts: [String: Act] = [:]
    private let log = Logger(subsystem: "dev.cawco.app", category: "Acts")

    init() {}

    /// The record a row reads, while it still speaks to the session as it is now.
    public func act(_ id: String, status: String?) -> Act? {
        guard let act = acts[id] else { return nil }
        if case .refused = act.stage, act.status != status { return nil }
        return act
    }

    /// The words a row shows in place of its own second line, and whether they are a fault.
    public func words(_ id: String, status: String?) -> (text: String, failed: Bool)? {
        guard let act = act(id, status: status) else { return nil }
        return switch act.stage {
        case .inFlight: (Self.pending(act.verb), false)
        case let .refused(reason): (Self.refusal(act.verb, reason), true)
        case let .done(text, _): (text, false)
        }
    }

    public func inFlight(_ id: String) -> Bool { acts[id]?.stage == .inFlight }

    /// The session a finished act made, which its row's menu opens.
    public func opens(_ id: String) -> String? {
        if case let .done(_, opens) = acts[id]?.stage { return opens }
        return nil
    }

    /// Marks each session in flight; a fault it carried goes with the new ask.
    public func begin(_ verb: Verb, _ ids: [String]) {
        for id in ids {
            acts[id] = Act(verb: verb, stage: .inFlight, status: nil)
            log.notice("act \(verb.rawValue, privacy: .public) \(id, privacy: .public): in flight")
        }
    }

    /// The hub answered: the row reads its frames again.
    public func settle(_ ids: [String]) {
        for id in ids where acts[id] != nil {
            log.notice("act \(self.acts[id]?.verb.rawValue ?? "", privacy: .public) \(id, privacy: .public): confirmed")
            acts[id] = nil
        }
    }

    /// The hub refused: its reason, on the session it concerns, as it stands now (`status`).
    public func refuse(_ id: String, _ reason: String, status: String?) {
        guard var act = acts[id] else { return }
        act.stage = .refused(reason)
        act.status = status
        acts[id] = act
        log.notice("act \(act.verb.rawValue, privacy: .public) \(id, privacy: .public): refused: \(reason, privacy: .public)")
    }

    /// Carried to its end: `text` on the row, and the session it made.
    public func finish(_ id: String, _ text: String, opens: String?) {
        guard var act = acts[id] else { return }
        act.stage = .done(text, opens: opens)
        acts[id] = act
        log.notice("act \(act.verb.rawValue, privacy: .public) \(id, privacy: .public): done: \(text, privacy: .public)")
    }

    /// Put away by the operator: a fault read, a finished act followed.
    public func clear(_ id: String) {
        acts[id] = nil
    }

    /// One ask on one session, start to answer. True when the hub took it.
    /// `status` reads the session as it stands once the hub has answered.
    @discardableResult
    public func run(_ verb: Verb, on id: String, status: () -> String?, _ work: () async throws -> Void) async -> Bool {
        begin(verb, [id])
        do {
            try await work()
            settle([id])
            return true
        } catch {
            refuse(id, error.localizedDescription, status: status())
            return false
        }
    }

    private static func pending(_ verb: Verb) -> String {
        switch verb {
        case .stop: "Stopping…"
        case .archive: "Archiving…"
        case .keep: "Keeping…"
        case .discard: "Discarding…"
        case .fork: "Forking…"
        case .rename: "Renaming…"
        case .deleteTranscript: "Deleting the transcript…"
        case .continueOn: "Continuing in a new session…"
        }
    }

    private static func refusal(_ verb: Verb, _ reason: String) -> String {
        // A reason that already says what failed ("Could not keep this session — …") is said once.
        if reason.hasPrefix("Could") { return reason }
        let head = switch verb {
        case .stop: "Not stopped"
        case .archive: "Not archived"
        case .keep: "Not kept"
        case .discard: "Not discarded"
        case .fork: "Not forked"
        case .rename: "Not renamed"
        case .deleteTranscript: "Not deleted"
        case .continueOn: "Couldn't continue"
        }
        return reason.isEmpty ? "\(head)." : "\(head): \(reason)"
    }
}
