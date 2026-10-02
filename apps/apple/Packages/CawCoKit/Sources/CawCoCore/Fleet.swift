public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime

public typealias InstanceRow = Components.Schemas.InstanceRow
public typealias MachineRow = Components.Schemas.AgentRow
public typealias StoredSession = Components.Schemas.NeutralSessionInfo
public typealias SessionPulse = Components.Schemas.SessionPulse

extension Components.Schemas.InstanceRow: TreeRow {}

extension Components.Schemas.InstanceRow {
    /// Only a session the hub can still reach is live; the rest is history.
    public var isLive: Bool { status == .running || status == .starting }
    /// On the board until the operator discards it: live, failed, asleep, or not askable right now.
    public var isListed: Bool { isLive || status == .error || status == .sleeping || status == .unknown }
    /// Its machine cannot be reached, so the hub does not know what it is doing.
    public var isStale: Bool { status == .unknown }
    public var isFailed: Bool { status == .error }
    public var isResumable: Bool { status == .sleeping || (status == .stopped && sessionId != nil) }
}

/// What a session is doing now, in the fleet view's three words.
public enum Activity: String, Sendable {
    case working, blocked, idle
}

/// The hub's word on the fleet: machines, sessions, projects, each session's
/// pulse, and every online machine's stored sessions. Only frames and reads
/// from the hub write it.
@MainActor
@Observable
public final class FleetStore {
    public internal(set) var machines: [MachineRow] = []
    public internal(set) var rows: [InstanceRow] = []
    public internal(set) var projects: [Components.Schemas.GetApiProjects200Payload] = []
    public internal(set) var pulses: [String: SessionPulse] = [:]
    /// When each session's current turn began, ms epoch; absent while idle.
    public internal(set) var turnSince: [String: Double] = [:]
    public internal(set) var catalogs: [String: [StoredSession]] = [:]
    var catalogsTried: Set<String> = []
    /// The connect-time read of machines, sessions and projects landed.
    public internal(set) var fleetRead = false
    /// The socket's own snapshot of the board (`instances`) arrived.
    public internal(set) var liveRead = false

    public internal(set) var byId: [String: InstanceRow] = [:]

    init() {}

    public var catalogsRead: Bool {
        fleetRead && machines.filter { $0.status == "online" }.allSatisfy { catalogsTried.contains($0.machineId) }
    }

    func adopt(rows next: [InstanceRow]) {
        rows = next
        reindex()
    }

    /// What moved since the last publish: each changed row replaced where it stands, each gone id dropped.
    func patch(upserts: [InstanceRow], removed: [String]) {
        let gone = Set(removed)
        var next = rows.filter { !gone.contains($0.id) }
        var at: [String: Int] = [:]
        for (index, row) in next.enumerated() {
            at[row.id] = index
        }
        for row in upserts {
            if let index = at[row.id] {
                next[index] = row
            } else {
                at[row.id] = next.count
                next.append(row)
            }
        }
        rows = next
        reindex()
    }

    private func reindex() {
        var index: [String: InstanceRow] = [:]
        for row in rows {
            index[row.id] = row
        }
        byId = index
    }

    func adopt(pulse: SessionPulse) {
        pulses[pulse.instanceId] = pulse
        if pulse.activity == .idle {
            turnSince[pulse.instanceId] = nil
        } else if turnSince[pulse.instanceId] == nil {
            turnSince[pulse.instanceId] = pulse.at
        }
    }

    public func machineName(_ machineId: String) -> String {
        machines.first { $0.machineId == machineId }.map { Naming.machineLabel($0.hostname) } ?? machineId
    }

    /// One machine order for every list: the fleet's.
    public func machineOrder(_ machineId: String) -> Int {
        machines.firstIndex { $0.machineId == machineId } ?? .max
    }

    /// The project that holds the folder, else its leaf without a workspace id.
    public func projectOf(_ machineId: String, _ cwd: String?) -> String {
        let folder = cwd ?? ""
        if let project = projects.first(where: { $0.machineId == machineId && (folder == $0.cwd || folder.hasPrefix($0.cwd + "/")) }) {
            return project.name
        }
        return (Naming.leaf(folder) ?? "").replacing(/-[0-9a-f]{8}$/, with: "")
    }

    /// "machine · project".
    public func placeOf(_ machineId: String, _ cwd: String?) -> String {
        let project = projectOf(machineId, cwd)
        return project.isEmpty ? machineName(machineId) : "\(machineName(machineId)) · \(project)"
    }

    public func title(_ row: InstanceRow) -> String {
        Naming.sessionTitle(title: row.title, cwd: row.cwd, id: row.id)
    }

    /// When a session last moved: its pulse, else the hub's own update time.
    public func lastAt(_ row: InstanceRow) -> Double {
        pulses[row.id]?.at ?? row.updatedMs
    }

    /// The stored sessions a machine lists, side quests left out.
    public func catalog(_ machineId: String) -> [StoredSession] {
        (catalogs[machineId] ?? []).filter { $0.tag != "cawco-scratch" }
    }
}

/// One permission or question parked on the operator.
public struct ParkedAsk: Sendable {
    public let instanceId: String
    public let requestId: String
    public let toolName: String
    let input: OpenAPIObjectContainer
    /// When the hub first parked it, ms epoch: one clock for every device.
    public let raisedAt: Double?
    /// Set when the hub routed it to the delegate's parent rather than to the operator.
    let routedTo: String?

    public var isQuestion: Bool { Naming.questions(toolName, input.value) != nil }
    public var summary: String { Naming.permissionSummary(toolName, input.value) }
}

/// Every ask parked on the operator, across every machine, and the answers
/// sent from this device with the hub's word on each.
@MainActor
@Observable
public final class NeedsYouStore {
    /// By session, in arrival order.
    public internal(set) var parked: [String: [ParkedAsk]] = [:]
    /// The answer command each ask carries, by `instanceId:requestId`.
    public internal(set) var answers: [String: String] = [:]
    private let ledger: Ledger

    init(ledger: Ledger) {
        self.ledger = ledger
    }

    func park(_ frame: Components.Schemas.FramePayload.Value7Payload, routedTo: String?) {
        var list = parked[frame.instanceId] ?? []
        if let at = list.firstIndex(where: { $0.requestId == frame.requestId }) {
            // A re-broadcast follows the hub's latest word on it.
            let old = list[at]
            list[at] = ParkedAsk(instanceId: old.instanceId, requestId: old.requestId, toolName: old.toolName, input: old.input, raisedAt: frame.raisedAt, routedTo: routedTo)
        } else {
            list.append(ParkedAsk(instanceId: frame.instanceId, requestId: frame.requestId, toolName: frame.toolName, input: frame.input, raisedAt: frame.raisedAt, routedTo: routedTo))
        }
        parked[frame.instanceId] = list
    }

    /// A session's process started again: anything it had parked belongs to one that is gone.
    func clear(_ instanceId: String) {
        parked[instanceId] = nil
    }

    /// The hub's whole list (`/api/pending`): what it no longer holds is not parked.
    func replace(with asks: [(Components.Schemas.FramePayload.Value7Payload, String?)]) {
        parked = [:]
        for (frame, routedTo) in asks {
            park(frame, routedTo: routedTo)
        }
    }

    public func blocked(_ instanceId: String) -> Bool {
        !(parked[instanceId] ?? []).isEmpty
    }

    public enum Answer: Sendable {
        case allow, deny
    }

    /// Sends `answer` as the `permission.answer` command the session's own
    /// card sends. The ask stays parked, its card showing the command's
    /// stage, until the daemon confirms (`applied`); a refusal leaves it
    /// parked to answer again.
    public func answer(_ ask: ParkedAsk, machineId: String, _ answer: Answer) {
        let result: [String: (any Sendable)?] = switch answer {
        case .allow: ["behavior": "allow", "updatedInput": ask.input.value]
        case .deny: ["behavior": "deny", "message": "User denied permission"]
        }
        let key = "\(ask.instanceId):\(ask.requestId)"
        guard let payload = try? OpenAPIValueContainer(unvalidatedValue: [
            "instanceId": ask.instanceId,
            "requestId": ask.requestId,
            "method": "resolvePermission",
            "args": [ask.requestId, result] as [(any Sendable)?],
        ] as [String: (any Sendable)?]) else {
            return
        }
        let instanceId = ask.instanceId
        let requestId = ask.requestId
        answers[key] = ledger.submit(
            kind: .permission_answer,
            sessionId: instanceId,
            machineId: machineId,
            payload: payload,
            settlesAt: .applied,
            effects: Ledger.Effects(settled: { [weak self] stage, _ in
                guard stage == .applied, let self else {
                    return
                }
                self.parked[instanceId]?.removeAll { $0.requestId == requestId }
                if self.parked[instanceId]?.isEmpty == true {
                    self.parked[instanceId] = nil
                }
                self.answers[key] = nil
            })
        )
    }

    /// The answer this device sent for an ask, with the hub's word on it.
    public func answerSent(for ask: ParkedAsk) -> Ledger.Command? {
        answers["\(ask.instanceId):\(ask.requestId)"].flatMap { ledger.commands[$0] }
    }
}
