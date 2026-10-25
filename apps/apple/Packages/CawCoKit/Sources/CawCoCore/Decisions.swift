public import CawCoAPI
public import Foundation
import Observation

// A project's decision pages as the hub serves them under
// `/api/projects/:id/decisions` (hub decisions.ts; the dashboard's
// decisions-api.ts). Each refusal is thrown in the hub's own words.

public typealias DecisionsList = Components.Schemas.DecisionsList
public typealias DecisionPageSummary = Components.Schemas.DecisionPageSummary
public typealias DecisionPageRead = Components.Schemas.DecisionPageRead
public typealias DecisionRecordCard = Components.Schemas.RecordCard

public extension ProjectTasks {
    /// The project's pages, newest first (`listDecisions`).
    func decisions() async throws -> DecisionsList {
        let output = try await client.getApiProjectsByIdDecisions(path: .init(id: projectId))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// I'm done picking (no words), or a note: its session hears it, or Caw
    /// (`sendDecision`); the hub answers who heard it.
    @discardableResult
    func sendDecision(_ name: String, text: String? = nil) async throws -> Components.Schemas.DecisionSent {
        let output = try await client.postApiProjectsByIdDecisionsByNameSend(path: .init(id: projectId, name: name),
                                                                              body: .json(.init(text: text)))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }

    /// Make tasks: the record written, and its session (or Caw) asked to file them (`makeDecisionTasks`).
    func makeDecisionTasks(_ name: String) async throws -> DecisionPageRead {
        let output = try await client.postApiProjectsByIdDecisionsByNameTasks(path: .init(id: projectId, name: name))
        if case let .ok(ok) = output { return try ok.body.json }
        throw await TaskRefusal.reading(output)
    }
}

/// A project's decision pages as its page holds them (decisions.svelte.ts):
/// the list the Decisions tab draws and its strip's count reads, read on
/// arrival and again whenever the hub says the pages or the tasks moved
/// (`decisions.changed`, `tasks.changed`), on a reconnect and when the app
/// comes back. Only the newest read's answer is kept.
@MainActor
@Observable
public final class ProjectDecisions {
    public let projectId: String
    @ObservationIgnored private let hub: HubConnection

    /// The pages; nil until first read.
    public private(set) var list: DecisionsList?
    /// Why the last read failed, in the hub's words; nil when it read.
    public private(set) var problem: String?

    @ObservationIgnored private var reads = 0
    @ObservationIgnored private var seen: Int
    @ObservationIgnored private var wasConnected: Bool

    public init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        seen = (hub.decisionsChanged[projectId] ?? 0) + (hub.tasksChanged[projectId] ?? 0)
        wasConnected = hub.state == .connected
        watch()
    }

    /// Pages still waiting for picks: the tab's trail.
    public var waiting: Int {
        list?.pages.count { $0.state == .picking } ?? 0
    }

    public func read() async {
        reads += 1
        let ticket = reads
        do {
            let next = try await ProjectTasks(hub: hub, projectId: projectId).decisions()
            guard ticket == reads else { return }
            list = next
            problem = nil
        } catch {
            guard ticket == reads else { return }
            problem = error.localizedDescription
        }
    }

    /// Reads again when the hub says the pages or the tasks moved, and on every reconnect.
    private func watch() {
        withObservationTracking {
            _ = hub.decisionsChanged[projectId]
            _ = hub.tasksChanged[projectId]
            _ = hub.state
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let changes = (hub.decisionsChanged[projectId] ?? 0) + (hub.tasksChanged[projectId] ?? 0)
                let connected = hub.state == .connected
                let reread = changes != seen || (connected && !wasConnected)
                seen = changes
                wasConnected = connected
                if connected, reread { Task { await self.read() } }
                watch()
            }
        }
    }
}

/// What the Decisions tab says of a page, from core's words (decisions/words.ts).
public enum DecisionWords {
    /// Make tasks wrote its record.
    public static func isDecided(_ state: Components.Schemas.DecisionState) -> Bool {
        state == .decided || state == .making
    }

    /// `12 of 20 picked`; once decided, `12 decided · 14 tasks` (`progressWords`).
    public static func progress(picked: Double, cards: Double, decided: Double, tasks: Double,
                                state: Components.Schemas.DecisionState) -> String {
        guard isDecided(state) else { return Words.Decisions.picked(picked: Int(picked), cards: Int(cards)) }
        let figure = Words.Decisions.decided(decided: Int(decided), cards: Int(cards))
        return tasks > 0 ? Words.Decisions.decidedTasks(figure: figure, tasks: Int(tasks)) : figure
    }

    /// A page's state pill (`pillOf`): none while picked on; Sent and who has
    /// it (its session's name working, or Caw once it ended); Decided.
    public struct Pill: Equatable, Sendable {
        public enum Tone: Sendable { case live, done }
        public let tone: Tone
        public let word: String
        public let who: String?
        public let title: String
    }

    public static func pill(state: Components.Schemas.DecisionState, writer: Components.Schemas.DecisionWriter?,
                            working: Bool, short: Bool) -> Pill? {
        switch state {
        case .picking: return nil
        case .decided: return Pill(tone: .done, word: Words.Decisions.decidedPill, who: nil, title: Words.Decisions.decidedPill)
        default: break
        }
        let sent = Words.Decisions.sent
        guard let writer, !writer.ended else {
            return Pill(tone: .live, word: sent, who: Words.Decisions.caw, title: Words.Decisions.pillTitle(word: sent, who: Words.Decisions.caw))
        }
        let whole = Words.Decisions.workingWhole(title: writer.title)
        guard working else { return Pill(tone: .live, word: sent, who: nil, title: sent) }
        return Pill(tone: .live, word: sent, who: short ? Words.Decisions.working : whole,
                    title: Words.Decisions.pillTitle(word: sent, who: whole))
    }
}
