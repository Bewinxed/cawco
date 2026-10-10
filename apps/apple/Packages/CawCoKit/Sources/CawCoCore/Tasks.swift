public import Foundation
import Observation

/// The web's SessionTask: the ledger's order and dependency ids are preserved.
public struct SessionTask: Codable, Sendable, Identifiable, Equatable {
    public enum Status: String, Codable, Sendable {
        case pending, in_progress, completed
    }

    public let id: String
    public let subject: String
    public let status: Status
    public let activeForm: String?
    public let blockedBy: [String]
    public let blocks: [String]
    public let description: String?
    public let owner: String?

    public init(id: String, subject: String, status: Status, activeForm: String? = nil,
        blockedBy: [String] = [], blocks: [String] = [], description: String? = nil, owner: String? = nil) {
        self.id = id
        self.subject = subject
        self.status = status
        self.activeForm = activeForm
        self.blockedBy = blockedBy
        self.blocks = blocks
        self.description = description
        self.owner = owner
    }
}

public struct TaskSnapshot: Sendable, Equatable {
    public let tasks: [SessionTask]
    public let loading: Bool
    /// Only a machine whose home could not be resolved fails; no ledger is an empty plan.
    public let failed: Bool?
    /// Milliseconds since the epoch, as in tasks.svelte.ts.
    public let fetchedAt: Double

    public init(tasks: [SessionTask], loading: Bool, failed: Bool? = nil, fetchedAt: Double) {
        self.tasks = tasks
        self.loading = loading
        self.failed = failed
        self.fetchedAt = fetchedAt
    }
}

/// One answer per session for the board, header and peek. Tool calls only
/// invalidate it: Claude's files and OpenCode's native todo control supply it.
@MainActor @Observable
public final class TasksStore {
    private var snapshots: [String: TaskSnapshot] = [:]
    @ObservationIgnored private unowned let hub: HubConnection
    @ObservationIgnored private var scheduled: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var running: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var stale: Set<String> = []
    @ObservationIgnored private var swept: [String: String] = [:]
    @ObservationIgnored private var probes: [String: Task<String?, Never>] = [:]
    @ObservationIgnored private var homes: [String: String]
    @ObservationIgnored private var generation = 0
    private static let homeKey = "cawco-machine-home"
    private static let ledgerTools: Set<String> = ["TaskCreate", "TaskUpdate"]

    init(hub: HubConnection) {
        self.hub = hub
        homes = Self.readHomeCache()
    }

    public func snapshot(_ instanceId: String) -> TaskSnapshot? { snapshots[instanceId] }

    /// A burst of writes reads the directory once, after 300 ms.
    public func refresh(_ instanceId: String) {
        guard scheduled[instanceId] == nil else { return }
        scheduled[instanceId] = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
            guard let self else { return }
            scheduled[instanceId] = nil
            await read(instanceId)
        }
    }

    /// The next read skips the five-second freshness guard.
    public func invalidate(_ instanceId: String) {
        stale.insert(instanceId)
        refresh(instanceId)
    }

    func ingest(_ instanceId: String, toolName: String?) {
        if let toolName, Self.ledgerTools.contains(toolName) { invalidate(instanceId) }
    }

    /// Each live ledger is read on its first board arrival, including a row
    /// that acquires its harness key after the initial snapshot.
    func sweepLiveLedgers() {
        for row in hub.fleet.rows where row.isLive {
            guard let key = row.sessionId, !key.isEmpty else { continue }
            let ledger = row.machineId + "/" + key
            if swept[row.id] != ledger {
                swept[row.id] = ledger
                refresh(row.id)
            }
        }
    }

    func reset() {
        generation += 1
        scheduled.values.forEach { $0.cancel() }
        running.values.forEach { $0.cancel() }
        probes.values.forEach { $0.cancel() }
        scheduled = [:]
        running = [:]
        probes = [:]
        stale = []
        swept = [:]
        snapshots = [:]
    }

    private func read(_ instanceId: String) async {
        if let inflight = running[instanceId] { await inflight.value; return }
        let session = hub.sessions.transcripts[instanceId]
        let row = hub.fleet.byId[instanceId]
        let machineId = nonempty(session?.location?.machineId) ?? nonempty(row?.machineId)
        let sessionId = nonempty(session?.facts?.sessionId) ?? nonempty(session?.location?.sessionKey) ?? nonempty(row?.sessionId)
        let harness = session?.facts?.harness ?? session?.location?.harness ?? row?.harness ?? "claude"
        let cwd = nonempty(session?.location?.cwd) ?? nonempty(row?.cwd)
        guard let machineId, let sessionId else { return }
        let invalidated = stale.remove(instanceId) != nil
        if !invalidated, let current = snapshots[instanceId], Self.now - current.fetchedAt < 5000 { return }
        let revision = generation
        let work = Task { [weak self] in
            guard let self else { return }
            await fetchLedger(instanceId, machineId: machineId, sessionId: sessionId, harness: harness, cwd: cwd)
            guard generation == revision else { return }
            running[instanceId] = nil
            // A listing begun before a mid-read edit is already one revision behind.
            if stale.contains(instanceId) { refresh(instanceId) }
        }
        running[instanceId] = work
        await work.value
    }

    private func fetchLedger(_ instanceId: String, machineId: String, sessionId: String, harness: String, cwd: String?) async {
        snapshots[instanceId] = TaskSnapshot(tasks: snapshots[instanceId]?.tasks ?? [], loading: true, fetchedAt: 0)
        if harness == "opencode" {
            do {
                let tasks = try await hub.todos(machineId: machineId, sessionKey: sessionId, dir: cwd, harness: .opencode)
                publish(instanceId, tasks: tasks.map {
                    // A status a newer hub added reads as pending: not started, not done.
                    SessionTask(id: $0.id, subject: $0.subject, status: .init(rawValue: $0.status.rawValue) ?? .pending,
                        blockedBy: $0.blockedBy, blocks: $0.blocks, description: $0.description, owner: $0.owner)
                })
            } catch { publish(instanceId, tasks: []) }
            return
        }
        if harness == "pi" { publish(instanceId, tasks: []); return }
        guard let home = await homeOf(machineId) else { publish(instanceId, tasks: [], failed: true); return }
        let dir = home + "/.claude/tasks/" + sessionId
        let files: [String]
        do {
            files = try await hub.listFiles(machineId: machineId, path: dir)
                .filter { $0.kind == .file && $0.name.hasSuffix(".json") }.map(\.name)
        } catch { publish(instanceId, tasks: []); return }
        let parsed = await withTaskGroup(of: (Int, SessionTask?).self) { group in
            for (index, file) in files.enumerated() {
                group.addTask { [hub] in
                    do {
                        return (index, try Self.parseTask(await hub.readFile(machineId: machineId, path: dir + "/" + file)))
                    } catch { return (index, nil) }
                }
            }
            var tasks: [SessionTask?] = Array(repeating: nil, count: files.count)
            for await (index, task) in group { tasks[index] = task }
            return tasks.compactMap { $0 }
        }
        publish(instanceId, tasks: parsed.sorted { (Double($0.id) ?? .nan) < (Double($1.id) ?? .nan) })
    }

    private func publish(_ instanceId: String, tasks: [SessionTask], failed: Bool? = nil) {
        guard !Task.isCancelled else { return }
        snapshots[instanceId] = TaskSnapshot(tasks: tasks, loading: false, failed: failed, fetchedAt: Self.now)
    }

    private static var now: Double { Date.now.timeIntervalSince1970 * 1000 }
    private func nonempty(_ value: String?) -> String? { value.flatMap { $0.isEmpty ? nil : $0 } }

    private nonisolated static func parseTask(_ text: String) throws -> SessionTask? {
        guard let raw = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              let id = raw["id"] as? String, let subject = raw["subject"] as? String else { return nil }
        let status: SessionTask.Status = switch raw["status"] as? String {
        case "in_progress": .in_progress
        case "completed": .completed
        default: .pending
        }
        return SessionTask(id: id, subject: subject, status: status, activeForm: raw["activeForm"] as? String,
            blockedBy: raw["blockedBy"] as? [String] ?? [], blocks: raw["blocks"] as? [String] ?? [],
            description: raw["description"] as? String, owner: raw["owner"] as? String)
    }

    private static func readHomeCache() -> [String: String] {
        guard let text = UserDefaults.standard.string(forKey: homeKey),
              let stored = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: String] else { return [:] }
        return stored
    }

    private func remember(_ machineId: String, home: String) -> String {
        homes[machineId] = home
        if let data = try? JSONSerialization.data(withJSONObject: homes), let text = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(text, forKey: Self.homeKey)
        }
        return home
    }

    /// Cached home, then the machine's own working directories, then a single
    /// unambiguous account under /Users or /home: the web's homeOf lookup.
    public func homeOf(_ machineId: String) async -> String? {
        if let known = homes[machineId], !known.isEmpty { return known }
        let cwds = hub.fleet.rows.filter { $0.machineId == machineId }.map(\.cwd)
            + hub.fleet.catalog(machineId).map { $0.cwd ?? "" }
        for cwd in cwds {
            if let match = cwd.firstMatch(of: /^(\/(?:home|Users)\/[^\/]+)/) {
                return remember(machineId, home: String(match.1))
            }
        }
        if let probing = probes[machineId] { return await probing.value }
        let probe = Task { [weak self] in
            guard let self else { return nil as String? }
            let home = await probeHome(machineId)
            probes[machineId] = nil
            return home
        }
        probes[machineId] = probe
        return await probe.value
    }

    private func probeHome(_ machineId: String) async -> String? {
        let os = hub.fleet.machines.first { $0.machineId == machineId }?.os ?? ""
        let root = os.hasPrefix("darwin") ? "/Users" : "/home"
        do {
            let candidates = try await hub.listFiles(machineId: machineId, path: root).filter {
                $0.kind == .dir && !$0.name.hasPrefix(".") && $0.name != "Shared" && $0.name != "lost+found"
            }
            guard candidates.count == 1 else { return nil }
            return remember(machineId, home: root + "/" + candidates[0].name)
        } catch { return nil }
    }

    public func progress(_ snapshot: TaskSnapshot) -> (done: Int, total: Int, current: SessionTask?) {
        (snapshot.tasks.filter { $0.status == .completed }.count, snapshot.tasks.count,
            snapshot.tasks.first { $0.status == .in_progress })
    }

    public func blocker(of task: SessionTask, in tasks: [SessionTask]) -> String? {
        guard task.status != .completed else { return nil }
        return task.blockedBy.first { id in tasks.contains { $0.id == id && $0.status != .completed } }
    }
}
