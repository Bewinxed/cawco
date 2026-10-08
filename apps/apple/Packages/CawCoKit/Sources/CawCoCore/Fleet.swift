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
    /// On the board until the operator discards it: live work, a real failure
    /// to look at, a nap to wake from, one the operator stopped, or a row the
    /// hub cannot ask about right now. A stopped session has ended, so it is
    /// listed as ended sessions are (Finished until seen, Recent, its
    /// project's tree); left out, it stood in no list at all, its menu and
    /// its transcript out of reach. Only a discarded one is off the board.
    public var isListed: Bool { isLive || status == .error || status == .sleeping || status == .stopped || status == .unknown }
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

/// One session's pulse, each part observed on its own.
@MainActor
@Observable
final class PulseCell {
    /// The latest pulse: the tool in flight, when it last moved.
    var pulse: SessionPulse?
    /// The pulse at which its activity last changed.
    var settled: SessionPulse?
    /// When its current turn began, ms epoch; nil while idle.
    var turnSince: Double?
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
        didSet { if indexing { reindex() } }
    }
    public internal(set) var workflowNames: [String: String] = [:] {
        didSet { if indexing { reindex() } }
    }
    @ObservationIgnored private var indexing = true

    /// The first read of the workflows and their runs: both land, and the rows are indexed once.
    func adopt(workflowNames names: [String: String], runs next: [String: BoardRun]) {
        indexing = false
        workflowNames = names
        runs = next
        indexing = true
        reindex()
    }
    /// When the hub parked each waiting run's question, ms epoch.
    public internal(set) var runAskRaisedAt: [String: Double] = [:]
    /// The first read of every workflow and its runs came back, or failed.
    public internal(set) var runsRead = false
    public internal(set) var projects: [Components.Schemas.GetApiProjects200Payload] = []
    /// The continuations the hub is carrying, settled ones for a few minutes after.
    public internal(set) var continuations: [Components.Schemas.ContinuationJob] = []
    /// Each session's pulse, observed on its own (`PulseCell`): pulses arrive
    /// more than once a second across the fleet, and a screen must not be
    /// redrawn by sessions it does not show. A cell is made the first time
    /// its session is read or pulses, so a reader that found none hears the first.
    @ObservationIgnored private var pulseCells: [String: PulseCell] = [:]
    public internal(set) var catalogs: [String: [StoredSession]] = [:]
    /// REST seeds and live pushes share one recorder: newest ids first, at most 200.
    public internal(set) var supervisorEvents: [Components.Schemas.SupervisorEvent] = []

    @discardableResult
    public func recordSupervisorEvent(_ event: Components.Schemas.SupervisorEvent) -> Bool {
        guard !supervisorEvents.contains(where: { $0.id == event.id }) else { return false }
        let at = supervisorEvents.firstIndex(where: { $0.id < event.id }) ?? supervisorEvents.endIndex
        supervisorEvents.insert(event, at: at)
        if supervisorEvents.count > 200 {
            supervisorEvents.removeLast(supervisorEvents.count - 200)
        }
        return true
    }

    public func supervisorEvents(of instanceId: String) -> [Components.Schemas.SupervisorEvent] {
        supervisorEvents.filter { $0.instanceId == instanceId }
    }

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
        limitsRead = true
    }

    /// The hub's limits have been read once (client.svelte.ts `usageLimitsRead`):
    /// before that, no provider is claimed absent.
    public internal(set) var limitsRead = false
    var catalogsTried: Set<String> = []
    /// The connect-time read of machines, sessions and projects landed.
    public internal(set) var fleetRead = false
    /// The socket's own snapshot of the board (`instances`) arrived.
    public internal(set) var liveRead = false

    public internal(set) var byId: [String: InstanceRow] = [:]
    /// The session rows by the harness session each runs, in `rows` order.
    /// A stored transcript is matched to its rows here: the lists that walk
    /// every catalog entry would otherwise scan every row for each one.
    public private(set) var bySession: [String: [InstanceRow]] = [:]

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
        var sessions: [String: [InstanceRow]] = [:]
        for row in rows {
            if let key = row.sessionId {
                sessions[key, default: []].append(row)
            }
        }
        bySession = sessions
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
        for (id, pulse) in incoming where pulseCell(id).pulse.map({ pulse.at >= $0.at }) ?? true {
            adopt(pulse: pulse)
        }
    }

    /// Takes a session's pulse. Its activity and its turn clock are written
    /// only when they change, so what reads them (which list a session stands
    /// in) is not woken by a pulse that only moved its tool or its time.
    func adopt(pulse: SessionPulse) {
        let cell = pulseCell(pulse.instanceId)
        if cell.pulse != pulse {
            cell.pulse = pulse
        }
        if cell.settled?.activity != pulse.activity {
            cell.settled = pulse
        }
        if pulse.activity == .idle {
            if cell.turnSince != nil {
                cell.turnSince = nil
            }
        } else if cell.turnSince == nil {
            cell.turnSince = pulse.at
        }
    }

    /// Forgets every pulse (a new hub, a reconnect's fresh read).
    func resetPulses() {
        for cell in pulseCells.values {
            cell.pulse = nil
            cell.settled = nil
            cell.turnSince = nil
        }
    }

    private func pulseCell(_ id: String) -> PulseCell {
        if let cell = pulseCells[id] {
            return cell
        }
        let cell = PulseCell()
        pulseCells[id] = cell
        return cell
    }

    /// A session's latest pulse: its tool in flight and when it last moved.
    /// Read where one session is drawn; it moves with every pulse of that session.
    public func pulse(_ id: String) -> SessionPulse? {
        pulseCell(id).pulse
    }

    /// The pulse at which a session's activity last changed: working, blocked
    /// or idle. Read where sessions are sorted into lists; it moves only when
    /// a session changes what it is doing.
    public func activityPulse(_ id: String) -> SessionPulse? {
        pulseCell(id).settled
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
        if !folder.isEmpty, let project = ProjectPlaces.projectsFor(projects, machineId: machineId, cwd: folder, projectId: nil).first {
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
        let candidates = bySession[sessionKey] ?? []
        let located = candidates.filter { $0.machineId == machineId && $0.cwd == (cwd ?? "") }
        let eligible = located.isEmpty ? candidates : located
        return eligible.sorted { $0.updatedMs != $1.updatedMs ? $0.updatedMs > $1.updatedMs : $0.id < $1.id }.first?.id ?? sessionKey
    }

    public func storedTitle(sessionKey: String, machineId: String) -> String? {
        catalogs[machineId]?.first(where: { $0.sessionId == sessionKey }).map { storedTitle($0, machineId: machineId) }
    }

    /// links.ts `catalogTitle`: a stored transcript is called what its hub row
    /// is titled, when a row for it carries a title of its own (`titleSource`);
    /// else its own custom title or summary, then its first message. The row
    /// is `instanceForSession`'s: the newest at that machine and folder, else
    /// the newest that holds the session at all.
    public func storedTitle(_ info: StoredSession, machineId: String? = nil) -> String {
        let candidates = bySession[info.sessionId] ?? []
        let located = machineId.map { machine in candidates.filter { $0.machineId == machine && $0.cwd == (info.cwd ?? "") } } ?? []
        let row = (located.isEmpty ? candidates : located)
            .sorted { $0.updatedMs != $1.updatedMs ? $0.updatedMs > $1.updatedMs : $0.id < $1.id }.first
        let named = (row?.titleSource != nil ? row?.title : nil) ?? info.customTitle ?? info.summary
        return Naming.sessionTitle(title: named, firstMessage: info.firstPrompt, cwd: info.cwd, id: info.sessionId)
    }

    /// When a session last moved: its pulse, else the hub's own update time. A run's is when it last moved.
    public func lastAt(_ row: InstanceRow) -> Double {
        if let run = run(row.id) {
            return run.movedAt
        }
        return pulse(row.id)?.at ?? row.updatedMs
    }

    /// When a session last pulsed, ms epoch; a run's is when it last moved.
    public func pulseAt(_ id: String) -> Double? {
        run(id)?.movedAt ?? pulse(id)?.at
    }

    /// When a session's current turn began; a run's turn is the run.
    public func turn(_ id: String) -> Double? {
        if let run = run(id) {
            return run.since
        }
        return pulseCell(id).turnSince
    }

    /// The stored sessions a machine lists, spin-offs left out.
    public func catalog(_ machineId: String) -> [StoredSession] {
        (catalogs[machineId] ?? []).filter { $0.tag != "cawco-scratch" }
    }
}

/// One change a permission makes, both sides, as the hub read it parking the ask.
public typealias PermissionChange = Components.Schemas.PermissionChange

/// One permission or question parked on the operator.
public struct ParkedAsk: Sendable {
    public let instanceId: String
    public let requestId: String
    public let toolName: String
    let input: OpenAPIObjectContainer
    /// What the ask says, as the hub read it parking it (core
    /// permission-presentation.ts): the same words the web card and Telegram use.
    public let presentation: Components.Schemas.PermissionPresentation
    /// When the hub first parked it, ms epoch: one clock for every device.
    public let raisedAt: Double?
    /// Set when the hub routed it to the delegate's parent rather than to the operator.
    public let routedTo: String?

    init(_ frame: AskFrame, routedTo: String?) {
        instanceId = frame.instanceId
        requestId = frame.requestId
        toolName = frame.toolName
        input = frame.input
        presentation = frame.presentation
        raisedAt = frame.raisedAt
        self.routedTo = routedTo
    }

    public var isQuestion: Bool { Naming.questions(toolName, input.value) != nil }
    public var questions: [Components.Schemas.UserQuestion] { Naming.questions(toolName, input.value) ?? [] }
    /// What will happen and to what, in one line.
    public var summary: String { presentation.summary }
    /// The shell command a permission is about, said whole (Prompt.svelte `.cmd`).
    public var command: String? { input.value["command"] as? String }
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
    /// The order this device hears the hub's word on asks in: each ask parked
    /// and each ask settled takes the next number. A read of `/api/pending`
    /// is asked for at ``heardMark``, and what was heard after it is newer.
    @ObservationIgnored private var heard = 0
    /// When each parked ask was last heard parked, by request id.
    @ObservationIgnored private var parkedHeard: [String: Int] = [:]
    /// When each ask was heard settled, by request id; the oldest go past a few hundred.
    @ObservationIgnored private var settledHeard: [String: Int] = [:]
    private static let settledHeardKept = 512

    init(ledger: Ledger) {
        self.ledger = ledger
    }

    /// Where a read of `/api/pending` asked for now stands among what the socket says.
    var heardMark: Int { heard }

    private func hear() -> Int {
        heard += 1
        return heard
    }

    func park(_ frame: AskFrame, routedTo: String?) {
        parkedHeard[frame.requestId] = hear()
        var list = parked[frame.instanceId] ?? []
        if let at = list.firstIndex(where: { $0.requestId == frame.requestId }) {
            // A re-broadcast follows the hub's latest word on it.
            list[at] = ParkedAsk(frame, routedTo: routedTo)
        } else {
            list.append(ParkedAsk(frame, routedTo: routedTo))
        }
        parked[frame.instanceId] = list
    }

    /// The hub's word that an ask is over, whoever settled it, on whichever device.
    func settle(_ instanceId: String, _ requestId: String) {
        // A read already on its way cannot bring it back.
        settledHeard[requestId] = hear()
        if settledHeard.count > Self.settledHeardKept {
            settledHeard = settledHeard.filter { $0.value > heard - Self.settledHeardKept / 2 }
        }
        parkedHeard[requestId] = nil
        guard parked[instanceId]?.contains(where: { $0.requestId == requestId }) == true else {
            return
        }
        parked[instanceId]?.removeAll { $0.requestId == requestId }
        if parked[instanceId]?.isEmpty == true {
            parked[instanceId] = nil
        }
        answers["\(instanceId):\(requestId)"] = nil
    }

    /// The hub's whole list (`/api/pending`), as of `mark`: what it no longer
    /// holds is not parked. What the socket said since is newer than the read:
    /// an ask parked meanwhile (a restarted hub hearing its agents replay
    /// theirs) stays, and one settled meanwhile is not put back.
    func replace(with asks: [(AskFrame, String?)], asOf mark: Int) {
        var kept: [String: [ParkedAsk]] = [:]
        for (instanceId, list) in parked {
            let newer = list.filter { (parkedHeard[$0.requestId] ?? 0) > mark }
            if !newer.isEmpty { kept[instanceId] = newer }
        }
        let keptIds = Set(kept.values.flatMap { $0.map(\.requestId) })
        parkedHeard = parkedHeard.filter { keptIds.contains($0.key) }
        parked = kept
        for (frame, routedTo) in asks where (settledHeard[frame.requestId] ?? 0) <= mark {
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
