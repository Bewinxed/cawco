public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime
import OSLog

public typealias InstanceRow = Components.Schemas.InstanceRow
public typealias MachineRow = Components.Schemas.AgentRow
public typealias StoredSession = Components.Schemas.NeutralSessionInfo
public typealias SessionPulse = Components.Schemas.SessionPulse
public typealias BuildInfo = Components.Schemas.BuildInfo

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

/// A workflow run as the board lists it (workflow-runs.ts): read off the
/// runs list's `PublicRun` or a `workflow` frame's `WorkflowRun`.
public struct BoardRun: Sendable {
    public let id: String
    public let workflowId: String
    public let status: Components.Schemas.WorkflowRunStatus
    public let machineId: String
    public let workspace: String
    /// ms epoch.
    public let startedAt: Double
    public let endedAt: Double?
    public let failure: String?
    public let parentRunId: String?
    public let supervisorInstanceId: String?
    public let seenAt: Double

    /// A run's row id: `run:<id>`, the tab id the web gives it.
    public static let prefix = "run:"
    public var rowId: String { Self.prefix + id }

    public static func runId(of rowId: String) -> String? {
        rowId.hasPrefix(prefix) ? String(rowId.dropFirst(prefix.count)) : nil
    }

    init(_ run: Components.Schemas.WorkflowRun) {
        id = run.id
        workflowId = run.workflowId
        status = run.status
        machineId = run.machineId
        workspace = run.workspace
        startedAt = epochMs(run.startedAt.value1, run.startedAt.value2)
        let ended = epochMs(run.endedAt?.value1, run.endedAt?.value2)
        endedAt = ended > 0 ? ended : nil
        failure = run.failure
        parentRunId = run.parentRunId
        supervisorInstanceId = run.supervisorInstanceId
        seenAt = epochMs(run.seenAt?.value1, run.seenAt?.value2)
    }

    init(_ run: Components.Schemas.PublicRun) {
        let base = run.value1
        id = base.id
        workflowId = base.workflowId
        status = base.status
        machineId = base.machineId
        workspace = base.workspace
        startedAt = base.startedAt.timeIntervalSince1970 * 1000
        endedAt = base.endedAt.map { $0.timeIntervalSince1970 * 1000 }
        failure = base.failure
        parentRunId = base.parentRunId
        supervisorInstanceId = base.supervisorInstanceId
        seenAt = base.seenAt.map { $0.timeIntervalSince1970 * 1000 } ?? 0
    }

    /// Where its status stands among a session's: still going is running, a
    /// failure is a failure, and a run that ended any other way has stopped.
    var rowStatus: Components.Schemas.InstanceStatus {
        switch status {
        case .running, .waiting: .running
        case .failed: .error
        case .done, .cancelled: .stopped
        }
    }

    /// What it is doing now (core `runDoing`).
    public var activity: Activity {
        switch status {
        case .waiting: .blocked
        case .running: .working
        case .failed, .done, .cancelled: .idle
        }
    }

    /// When it last moved: its end, else its start.
    var movedAt: Double { endedAt ?? startedAt }

    /// When a run that is still going began; nil once it has ended.
    var since: Double? { status == .running || status == .waiting ? startedAt : nil }
}

/// The hub's word on the fleet: machines, sessions, projects, each session's
/// pulse, and every online machine's stored sessions. Only frames and reads
/// from the hub write it.
@MainActor
@Observable
public final class FleetStore {
    public internal(set) var machines: [MachineRow] = []
    /// The hub's build, carried by its board snapshots and deltas.
    public internal(set) var hubBuild: BuildInfo?
    /// The hub's session rows as it sent them.
    private var hubRows: [InstanceRow] = []
    /// The sessions, each workflow step hung under its run (`stepUnderRun`).
    public private(set) var rows: [InstanceRow] = []
    /// Every workflow run as a session row (`runRowOf`).
    public private(set) var runRows: [InstanceRow] = []
    public internal(set) var runs: [String: BoardRun] = [:] {
        didSet { reindex() }
    }
    public internal(set) var workflowNames: [String: String] = [:] {
        didSet { reindex() }
    }
    /// When the hub parked each waiting run's question, ms epoch.
    public internal(set) var runAskRaisedAt: [String: Double] = [:]
    /// The first read of every workflow and its runs came back, or failed.
    public internal(set) var runsRead = false
    public internal(set) var projects: [Components.Schemas.GetApiProjects200Payload] = []
    public internal(set) var pulses: [String: SessionPulse] = [:]
    /// When each session's current turn began, ms epoch; absent while idle.
    public internal(set) var turnSince: [String: Double] = [:]
    public internal(set) var catalogs: [String: [StoredSession]] = [:]
    /// Every machine's latest Claude and opencode Go limit readings, by machine.
    /// The fleet's spend as the hub reckons it (`/api/usage/spend`, and every
    /// `usage` frame): the one "today" every screen reads. Nil until read.
    public internal(set) var spend: Components.Schemas.UsageSpend?
    /// The last read of it failed: said, never estimated.
    public internal(set) var spendFailed = false

    func adopt(spend: Components.Schemas.UsageSpend) {
        self.spend = spend
        spendFailed = false
    }

    public internal(set) var claudeLimits: [String: Components.Schemas.ClaudeLimits] = [:]
    public internal(set) var openCodeGoLimits: [String: Components.Schemas.OpenCodeGoLimits] = [:]

    /// Replaces both limits maps with the hub's word: a full snapshot, not a patch.
    func adopt(limits readings: [(machineId: String, claude: Components.Schemas.ClaudeLimits, go: Components.Schemas.OpenCodeGoLimits?)]) {
        var claude: [String: Components.Schemas.ClaudeLimits] = [:]
        var go: [String: Components.Schemas.OpenCodeGoLimits] = [:]
        for reading in readings {
            claude[reading.machineId] = reading.claude
            go[reading.machineId] = reading.go
        }
        claudeLimits = claude
        openCodeGoLimits = go
    }
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
        hubRows = next
        reindex()
    }

    /// What moved since the last publish: each changed row replaced where it stands, each gone id dropped.
    func patch(upserts: [InstanceRow], removed: [String]) {
        let gone = Set(removed)
        var next = hubRows.filter { !gone.contains($0.id) }
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
        hubRows = next
        reindex()
    }

    private func reindex() {
        rows = hubRows.map(stepUnderRun)
        runRows = runs.values.sorted { $0.startedAt > $1.startedAt }.map(runRow)
        var index: [String: InstanceRow] = [:]
        for row in rows + runRows {
            index[row.id] = row
        }
        byId = index
    }

    /// A step's session hangs under its run, called by its step alone: the hub
    /// titles it `<workflow> · <step>` (workflow-runs.ts `stepUnderRun`).
    private func stepUnderRun(_ row: InstanceRow) -> InstanceRow {
        guard let runId = row.workflowRunId else {
            return row
        }
        var row = row
        row.parentInstanceId = BoardRun.prefix + runId
        if let name = runs[runId].flatMap({ workflowNames[$0.workflowId] }), let title = row.title, title.hasPrefix("\(name) · ") {
            row.title = String(title.dropFirst(name.count + 3))
        }
        return row
    }

    /// A run as a session row: its parent the run it is a child of, else the
    /// session that supervises it; its folder the workspace it runs in.
    private func runRow(_ run: BoardRun) -> InstanceRow {
        InstanceRow(
            cwd: run.workspace,
            id: run.rowId,
            lastError: run.failure,
            machineId: run.machineId,
            parentInstanceId: run.parentRunId.map { BoardRun.prefix + $0 } ?? run.supervisorInstanceId,
            seenAt: run.seenAt > 0 ? .init(value1: Date(timeIntervalSince1970: run.seenAt / 1000)) : nil,
            status: run.rowStatus,
            title: workflowNames[run.workflowId] ?? "Workflow",
            updatedAt: .init(value1: Date(timeIntervalSince1970: run.movedAt / 1000))
        )
    }

    /// The run a row is, when it is one.
    public func run(_ rowId: String) -> BoardRun? {
        BoardRun.runId(of: rowId).flatMap { runs[$0] }
    }

    /// A board frame's pulses (frames.ts `mergePulses`): each kept unless the
    /// one already held is newer; then every session's turn clock follows.
    func merge(pulses incoming: [String: SessionPulse]) {
        guard !incoming.isEmpty else {
            return
        }
        for (id, pulse) in incoming where pulses[id].map({ pulse.at >= $0.at }) ?? true {
            pulses[id] = pulse
        }
        for pulse in pulses.values {
            adopt(pulse: pulse)
        }
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

    /// links.ts `conversationHref`: a known instance's id, otherwise the
    /// stored transcript's bare session key. There is no machine-prefixed id.
    public func conversationId(sessionKey: String, machineId: String, cwd: String?) -> String {
        let candidates = rows.filter { $0.sessionId == sessionKey }
        let located = candidates.filter { $0.machineId == machineId && $0.cwd == (cwd ?? "") }
        let eligible = located.isEmpty ? candidates : located
        return eligible.sorted { $0.updatedMs != $1.updatedMs ? $0.updatedMs > $1.updatedMs : $0.id < $1.id }.first?.id ?? sessionKey
    }

    public func storedTitle(sessionKey: String, machineId: String) -> String? {
        guard let info = catalogs[machineId]?.first(where: { $0.sessionId == sessionKey }) else { return nil }
        return Naming.sessionTitle(title: info.customTitle ?? info.summary, firstMessage: info.firstPrompt, cwd: info.cwd, id: info.sessionId)
    }

    /// When a session last moved: its pulse, else the hub's own update time. A run's is when it last moved.
    public func lastAt(_ row: InstanceRow) -> Double {
        if let run = run(row.id) {
            return run.movedAt
        }
        return pulses[row.id]?.at ?? row.updatedMs
    }

    /// When a session last pulsed, ms epoch; a run's is when it last moved.
    public func pulseAt(_ id: String) -> Double? {
        run(id)?.movedAt ?? pulses[id]?.at
    }

    /// When a session's current turn began; a run's turn is the run.
    public func turn(_ id: String) -> Double? {
        if let run = run(id) {
            return run.since
        }
        return turnSince[id]
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
    public var questions: [Components.Schemas.UserQuestion] { Naming.questions(toolName, input.value) ?? [] }
    public var summary: String { Naming.permissionSummary(toolName, input.value) }
    /// The shell command a permission is about, said whole (Prompt.svelte `.cmd`).
    public var command: String? { input.value["command"] as? String }
    /// Every field of the tool input, for "What this touches": strings as
    /// they are, anything else as indented JSON.
    public var fields: [(key: String, value: String)] {
        input.value.keys.sorted().map { key in
            let raw = input.value[key] ?? nil
            if let text = raw as? String { return (key, text) }
            guard let raw, JSONSerialization.isValidJSONObject(raw) || raw is NSNumber,
                  let data = try? JSONSerialization.data(withJSONObject: raw, options: [.prettyPrinted, .fragmentsAllowed, .sortedKeys]),
                  let text = String(data: data, encoding: .utf8)
            else { return (key, raw.map { "\($0)" } ?? "null") }
            return (key, text)
        }
    }
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

    func park(_ frame: AskFrame, routedTo: String?) {
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

    /// The hub's word that an ask is over, whoever settled it, on whichever device.
    func settle(_ instanceId: String, _ requestId: String) {
        guard parked[instanceId]?.contains(where: { $0.requestId == requestId }) == true else {
            return
        }
        parked[instanceId]?.removeAll { $0.requestId == requestId }
        if parked[instanceId]?.isEmpty == true {
            parked[instanceId] = nil
        }
        answers["\(instanceId):\(requestId)"] = nil
    }

    /// The hub's whole list (`/api/pending`): what it no longer holds is not parked.
    func replace(with asks: [(AskFrame, String?)]) {
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
    @discardableResult
    public func answer(_ ask: ParkedAsk, machineId: String, _ answer: Answer) -> Bool {
        let result: [String: (any Sendable)?] = switch answer {
        case .allow: ["behavior": "allow", "updatedInput": ask.input.value]
        case .deny: ["behavior": "deny", "message": ask.isQuestion ? "The user dismissed the question without answering it." : "User denied permission"]
        }
        return submit(ask, machineId: machineId, result: result)
    }

    /// question.ts `questionAnswer`: the whole parked input survives, and
    /// multi-select answers stay arrays even when just one option was picked.
    /// Returns false when nothing could be sent, so the card stops pending.
    @discardableResult
    public func answerQuestion(_ ask: ParkedAsk, machineId: String, answers: [String: [String]]) -> Bool {
        guard !ask.questions.isEmpty, ask.questions.allSatisfy({ !(answers[$0.question] ?? []).isEmpty }) else { return false }
        var shaped: [String: (any Sendable)?] = [:]
        for question in ask.questions {
            let labels = answers[question.question] ?? []
            // Typed apart: a ternary would box `String?` as a non-optional
            // `any Sendable`, which the value container refuses.
            if question.multiSelect {
                shaped[question.question] = labels.map { $0 as (any Sendable)? }
            } else {
                shaped[question.question] = labels[0]
            }
        }
        var updated = ask.input.value
        updated["answers"] = shaped
        return submit(ask, machineId: machineId, result: ["behavior": "allow", "updatedInput": updated])
    }

    @discardableResult
    private func submit(_ ask: ParkedAsk, machineId: String, result: [String: (any Sendable)?]) -> Bool {
        let key = "\(ask.instanceId):\(ask.requestId)"
        let payload: OpenAPIValueContainer
        do {
            payload = try OpenAPIValueContainer(unvalidatedValue: [
                "instanceId": ask.instanceId,
                "requestId": ask.requestId,
                "method": "resolvePermission",
                "args": [ask.requestId, result] as [(any Sendable)?],
            ] as [String: (any Sendable)?])
        } catch {
            Logger(subsystem: "dev.cawco.app", category: "Permission").fault("request \(ask.requestId, privacy: .public) answer not encodable: \(String(describing: error), privacy: .public)")
            return false
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
                guard stage == .applied else {
                    return
                }
                self?.settle(instanceId, requestId)
            })
        )
        Logger(subsystem: "dev.cawco.app", category: "Permission").notice("request \(requestId, privacy: .public) answered by Apple app command \(self.answers[key] ?? "", privacy: .public)")
        return true
    }

    /// The answer this device sent for an ask, with the hub's word on it.
    public func answerSent(for ask: ParkedAsk) -> Ledger.Command? {
        answers["\(ask.instanceId):\(ask.requestId)"].flatMap { ledger.commands[$0] }
    }
}
