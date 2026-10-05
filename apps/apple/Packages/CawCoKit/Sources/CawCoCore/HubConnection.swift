public import CawCoAPI
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog

/// The one connection to the hub: its address, entered once and kept; the
/// `/ws/dashboard` socket and its reconnects; the connect-time reads; and the
/// stores every frame lands in. As the web's client does it
/// (apps/dashboard/src/lib/cawco/client.svelte.ts), state is only ever the
/// hub's word: nothing here is inferred or echoed ahead of it.
@MainActor
@Observable
public final class HubConnection {
    /// What to tell a reader about the hub. `connecting` is the transient
    /// every connect and every first seconds of a drop pass through;
    /// `unreachable` holds from `outageGrace` after the socket went until it is back.
    public enum State: Sendable {
        case connected, connecting, unreachable
    }

    /// The socket's own state.
    public enum Socket: Sendable {
        case connecting, connected, closed
    }

    /// How long the hub is gone before it is called unreachable.
    static let outageGrace: Duration = .seconds(4)
    static let reconnectBase = 1.0
    static let reconnectMaxAttempts = 10
    static let reconnectMax = 30.0
    static let controlTimeout: Duration = .seconds(15)
    private static let addressKey = "cawco-hub-url"

    /// The hub's address, as the operator entered it; nil until then.
    public private(set) var address: URL?
    public private(set) var socket: Socket = .closed
    /// When the next attempt starts, while one is waited for.
    public private(set) var retryAt: Date?
    private var outage = false

    public var state: State {
        socket == .connected ? .connected : (outage ? .unreachable : .connecting)
    }

    public let ledger = Ledger()
    public let fleet = FleetStore()
    /// What the new-session form was last set to: every start without a form runs on it.
    public let spawnPrefs = SpawnPrefs()
    public let needs: NeedsYouStore
    public private(set) var sessions: SessionsStore!
    public private(set) var tasks: TasksStore!
    /// The delegates' work items their parents' trays read.
    public private(set) var workItems: WorkItemsStore!
    public private(set) var workflowRuns: WorkflowRunsStore!
    /// Every workflow, as the Workflows page lists and launches them.
    public private(set) var workflows: WorkflowsStore!

    @ObservationIgnored private var run: Task<Void, Never>?
    @ObservationIgnored private var outageTimer: Task<Void, Never>?
    @ObservationIgnored private var fleetRead: Task<Void, Never>?
    @ObservationIgnored private var live: HubSocket?
    @ObservationIgnored private var attempts = 0
    @ObservationIgnored private var waiters: [String: CheckedContinuation<OpenAPIValueContainer?, any Error>] = [:]
    private let log = Logger(subsystem: "dev.cawco.app", category: "Hub")

    public init() {
        needs = NeedsYouStore(ledger: ledger)
        address = UserDefaults.standard.string(forKey: Self.addressKey).flatMap(Self.address(from:))
        ledger.send = { [weak self] data in
            guard let self, socket == .connected, let live else {
                return "Not connected to the hub. Check that it is running, then try again."
            }
            live.post(data)
            return nil
        }
        sessions = SessionsStore(hub: self)
        tasks = TasksStore(hub: self)
        workItems = WorkItemsStore(hub: self)
        workflowRuns = WorkflowRunsStore(hub: self)
        workflows = WorkflowsStore(hub: self)
        ledger.applyFrame = { [weak self] id, data in self?.sessions.apply(id, data: data) }
        ledger.rereadHistory = { [weak self] id in self?.sessions.read(id) }
        if address != nil {
            start()
        }
    }

    /// Normalises what the operator typed into the hub's http address.
    public static func address(from text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        if !trimmed.contains("://") {
            trimmed = "http://\(trimmed)"
        }
        guard var parts = URLComponents(string: trimmed), let scheme = parts.scheme?.lowercased(),
              scheme == "http" || scheme == "https", parts.host?.isEmpty == false
        else {
            return nil
        }
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }

    /// Keeps `address` as the hub and connects to it.
    public func connect(to address: URL) {
        self.address = address
        UserDefaults.standard.set(address.absoluteString, forKey: Self.addressKey)
        resetFleet()
        attempts = 0
        start()
    }

    /// Reconnects now instead of waiting out the backoff.
    public func reconnectNow() {
        guard socket == .closed else {
            return
        }
        attempts = 0
        start()
    }

    /// A window was disconnected, not merely backgrounded. Its stream and
    /// reads have the same lifetime as that scene, including pending RPCs.
    public func disconnect() {
        run?.cancel(); run = nil
        fleetRead?.cancel(); fleetRead = nil
        outageTimer?.cancel(); outageTimer = nil
        sessions.reset()
        tasks.reset()
        workItems.reset()
        workflowRuns.reset()
        live = nil
        for waiter in waiters.values { waiter.resume(throwing: URLError(.cancelled)) }
        waiters = [:]
    }

    private func resetFleet() {
        fleet.machines = []
        fleet.hubBuild = nil
        fleet.adopt(rows: [])
        fleet.projects = []
        fleet.resetPulses()
        fleet.catalogs = [:]
        fleet.supervisorEvents = []
        fleet.catalogsTried = []
        fleet.fleetRead = false
        fleet.liveRead = false
        fleet.spend = nil
        fleet.spendFailed = false
        fleet.limitsRead = false
        needs.parked = [:]
        sessions.reset()
        tasks.reset()
        workItems.reset()
        workflowRuns.reset()
        workflows.reset()
    }

    private func start() {
        run?.cancel()
        run = Task { [weak self] in
            await self?.loop()
        }
    }

    /// Backs off but never gives up: the delay is capped, not the attempts.
    private func loop() async {
        while !Task.isCancelled, let address {
            retryAt = nil
            socket = .connecting
            let hubSocket = HubSocket(hub: address)
            live = hubSocket
            do {
                for try await event in hubSocket.events {
                    switch event {
                    case .opened:
                        opened()
                    case let .message(message):
                        receive(message)
                    }
                }
            } catch {
                log.info("hub socket closed: \(String(describing: error), privacy: .public)")
            }
            live = nil
            closed()
            guard !Task.isCancelled else {
                return
            }
            let delay = min(Self.reconnectBase * pow(2, Double(min(attempts, Self.reconnectMaxAttempts))), Self.reconnectMax)
            retryAt = Date.now.addingTimeInterval(delay)
            try? await Task.sleep(for: .seconds(delay))
            attempts += 1
        }
    }

    private func opened() {
        socket = .connected
        retryAt = nil
        attempts = 0
        outageTimer?.cancel()
        outageTimer = nil
        outage = false
        sessions.reconnected()
        readFleet(after: .seconds(1))
    }

    private func closed() {
        socket = .closed
        fleetRead?.cancel()
        if !outage, outageTimer == nil {
            outageTimer = Task { [weak self] in
                try? await Task.sleep(for: Self.outageGrace)
                guard !Task.isCancelled, let self else {
                    return
                }
                outage = true
                outageTimer = nil
            }
        }
        for waiter in waiters.values {
            waiter.resume(throwing: URLError(.networkConnectionLost))
        }
        waiters = [:]
        ledger.noteDisconnect()
    }

    // MARK: Reads

    /// The connect-time read, again 1 s, 2 s, 4 s, 8 s, then every 10 s
    /// while the socket stays open, until the board's reads land.
    private func readFleet(after first: Duration) {
        fleetRead?.cancel()
        fleetRead = Task { [weak self] in
            var delay = first
            while !Task.isCancelled, let self {
                if await refresh() {
                    readCatalogs()
                    return
                }
                guard socket == .connected else {
                    return
                }
                try? await Task.sleep(for: delay)
                delay = min(delay * 2, .seconds(10))
            }
        }
    }

    var client: Client? {
        address.map { Client(hub: $0) }
    }

    /// Typed REST operations, grouped by the feature that owns them.
    public var api: HubAPI {
        get throws {
            guard let client else { throw URLError(.notConnectedToInternet) }
            return HubAPI(client: client)
        }
    }

    /// The mutation and its list refresh finish together: every rail reads
    /// the hub's project list before the caller dismisses its form or menu.
    public func createProject(name: String, cwd: String, machineId: String) async throws -> Components.Schemas.PostApiProjects200 {
        let api = try self.api
        let response = try await api.projects.create(.init(body: .json(.init(name: name, cwd: cwd, machineId: machineId))))
        let created: Components.Schemas.PostApiProjects200
        switch response {
        case let .ok(ok):
            created = try ok.body.json
        case .unprocessableContent:
            throw ControlError(message: "Could not save this project — the hub answered 422. Try again.")
        case let .undocumented(statusCode, _):
            throw ControlError(message: "Could not save this project — the hub answered \(statusCode). Try again.")
        }
        fleet.projects = try await api.projects.list().ok.body.json
        return created
    }

    public func deleteProject(id: String) async throws {
        let api = try self.api
        let response = try await api.projects.delete(.init(path: .init(id: id)))
        switch response {
        case .ok:
            break
        case let .undocumented(statusCode, _):
            throw ControlError(message: "Could not forget this project — the hub answered \(statusCode). Try again.")
        }
        fleet.projects = try await api.projects.list().ok.body.json
    }

    public func removeMachine(id: String) async throws {
        let api = try self.api
        let response = try await api.machines.remove(.init(path: .init(machineId: id)))
        let statusCode: Int
        let body: HTTPBody?
        switch response {
        case .ok:
            fleet.machines = try await api.machines.list().ok.body.json
            return
        case let .notFound(notFound):
            statusCode = 404
            body = try notFound.body.plainText
        case let .conflict(conflict):
            statusCode = 409
            body = try conflict.body.plainText
        case let .undocumented(code, payload):
            statusCode = code
            body = payload.body
        }
        let message: String
        if let body {
            message = try await String(collecting: body, upTo: 64_000)
        } else {
            message = ""
        }
        throw ControlError(message: message.isEmpty
            ? "The hub answered \(statusCode), so the machine was not removed. Try again."
            : message)
    }

    /// Marks sessions and runs (`run:<id>`) seen on the hub: `look`, the owner
    /// had it in front after it ended; `archive`, taken off Finished without
    /// opening it, which the hub refuses for anything still doing something.
    func markSeen(_ ids: [String], kind: Operations.PostApiSeen.Input.Body.JsonPayload.KindPayload) async throws {
        guard let client else {
            throw URLError(.notConnectedToInternet)
        }
        _ = try await client.postApiSeen(body: .json(.init(ids: ids, kind: kind))).ok
    }

    /// Registry reads; true once machines, sessions and projects all landed.
    func refresh() async -> Bool {
        guard let client else {
            return false
        }
        // The reads and their decoding run off the main actor; only what they
        // found is adopted here, so the first frames keep drawing while the
        // fleet is read.
        let adopt = await Self.readFleet(client)
        guard adopt(self) else { return false }
        await workflows.refresh()
        return true
    }

    /// What a read found, put on the connection once the read is over.
    private typealias Adoption<Result> = @MainActor @Sendable (HubConnection) -> Result

    /// The registry reads, each decoded where it was read: the hub's answers,
    /// the instance rows in the board's own shape, and the parked asks out of
    /// their envelopes. Nothing here touches the main actor.
    @concurrent
    private nonisolated static func readFleet(_ client: Client) async -> Adoption<Bool> {
        async let machines = try? await client.getApiAgents().ok.body.json
        async let rows = try? await client.getApiInstances().ok.body.json
        async let projects = try? await client.getApiProjects().ok.body.json
        async let pending = try? await client.getApiPending().ok.body.json
        // A continuation that moved while this device was away.
        async let carried = try? await client.getApiContinuations().ok.body.json
        // Read on connect, not only pushed on change: a device that connects
        // between reports has missed every `usage` frame.
        async let limits = try? await client.getApiUsageLimits().ok.body.json
        async let spend = try? await client.getApiUsageSpend().ok.body.json
        let (readMachines, readRows, readProjects, readPending, readLimits, readSpend, readCarried) =
            await (machines, rows, projects, pending, limits, spend, carried)
        let cancelled = Task.isCancelled
        let boardRows = readRows.map { read in Result { try Wire.transcode(read, as: [InstanceRow].self) } }
        // The hub's whole list of asks: one settled while this device was away
        // sent its `permission_settled` to nobody listening.
        var asks: [(AskFrame, String?)] = []
        var runAsks: [(String, Double?)] = []
        for envelope in readPending ?? [] where envelope.verb == .frames {
            guard let data = try? Wire.data(envelope.payload), let frame = try? Inbound.frame(data) else {
                continue
            }
            switch frame {
            case let .permissionRequest(ask, routedTo): asks.append((ask, routedTo))
            case let .runQuestion(runId, raisedAt): runAsks.append((runId, raisedAt))
            default: break
            }
        }
        let limitRows = readLimits.map { read in read.machines.map { ($0.machineId, $0.limits, $0.openCodeGo) } }
        let hasPending = readPending != nil
        return { [asks, runAsks] hub in
            if let limitRows {
                hub.fleet.adopt(limits: limitRows)
            }
            if let readSpend {
                hub.fleet.adopt(spend: readSpend)
            } else {
                hub.fleet.spend = nil
                hub.fleet.spendFailed = true
            }
            guard !cancelled else {
                return false
            }
            if let readMachines {
                hub.adopt(machines: readMachines)
            }
            if let readProjects {
                hub.fleet.projects = readProjects
            }
            switch boardRows {
            case let .success(rows):
                hub.fleet.adopt(rows: rows)
                hub.tasks.sweepLiveLedgers()
            case let .failure(error):
                hub.log.error("instances unreadable: \(String(describing: error), privacy: .public)")
            case nil:
                break
            }
            if hasPending {
                for (runId, raisedAt) in runAsks { hub.fleet.runAskRaisedAt[runId] = raisedAt }
                hub.needs.replace(with: asks)
            }
            if let readCarried {
                hub.fleet.continuations = readCarried
            }
            if readMachines == nil || readRows == nil || readProjects == nil {
                hub.log.error("fleet read incomplete: machines \(readMachines != nil) rows \(readRows != nil) projects \(readProjects != nil)")
                return false
            }
            hub.fleet.fleetRead = true
            return true
        }
    }

    /// A machine that came online after the connect-time read has its stored sessions read now.
    private func adopt(machines next: [MachineRow]) {
        let wasOnline = Set(fleet.machines.filter { $0.status == "online" }.map(\.machineId))
        fleet.machines = next
        guard fleet.fleetRead else {
            return
        }
        for machine in next where machine.status == "online" && !wasOnline.contains(machine.machineId) {
            readCatalog(machine.machineId)
        }
    }

    private func readCatalogs() {
        for machine in fleet.machines where machine.status == "online" {
            readCatalog(machine.machineId)
        }
    }

    /// Replaces a machine's stored-session catalog with its current answer.
    /// Failure remains an error for pending menu actions to show.
    public func reloadCatalog(_ machineId: String) async throws {
        defer { fleet.catalogsTried.insert(machineId) }
        fleet.catalogs[machineId] = try await listSessions(machineId: machineId)
    }

    /// The background path reports a failed read without throwing out of its task.
    private func readCatalog(_ machineId: String) {
        Task { [weak self] in
            guard let self else {
                return
            }
            do {
                try await reloadCatalog(machineId)
            } catch {
                log.error("listSessions on \(machineId, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// A machine-scoped control call, answered by its `control_result`.
    func control(_ machineId: String, instanceId: String? = nil, harness: Components.Schemas.ControlPayload.HarnessPayload? = nil,
                 method: String, args: [(any Sendable)?], timeout: Duration = controlTimeout) async throws -> OpenAPIValueContainer? {
        let requestId = UUID().uuidString.lowercased()
        let payload = Components.Schemas.ControlPayload(
            args: try args.map { value in
                if let value = value as? OpenAPIValueContainer { return value }
                return try OpenAPIValueContainer(unvalidatedValue: value)
            },
            harness: harness, instanceId: instanceId, method: method, requestId: requestId)
        return try await request(machineId: machineId, instanceId: instanceId, verb: .control,
                                 requestId: requestId, payload: payload, timeout: timeout)
    }

    /// Puts one envelope on the socket and waits for nothing: a verb whose
    /// answer, if any, comes back as a frame about its session.
    func post(machineId: String, instanceId: String? = nil, verb: Components.Schemas.Verb, payload: some Encodable) throws {
        guard socket == .connected, let live else {
            throw URLError(.notConnectedToInternet)
        }
        let envelope = Components.Schemas.Envelope(instanceId: instanceId, machineId: machineId,
            payload: try Wire.transcode(payload, as: OpenAPIObjectContainer.self), verb: verb)
        live.post(try Wire.encoder().encode(envelope))
    }

    /// All correlated socket verbs share the same reply, disconnect and cancellation paths.
    func request(machineId: String, instanceId: String? = nil, verb: Components.Schemas.Verb,
                 requestId: String, payload: some Encodable, timeout: Duration = controlTimeout) async throws -> OpenAPIValueContainer? {
        guard socket == .connected, let live else {
            throw URLError(.notConnectedToInternet)
        }
        let envelope = Components.Schemas.Envelope(instanceId: instanceId, machineId: machineId,
            payload: try Wire.transcode(payload, as: OpenAPIObjectContainer.self), requestId: requestId, verb: verb)
        let data = try Wire.encoder().encode(envelope)
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                waiters[requestId] = continuation
                live.post(data)
                Task { [weak self] in
                    try? await Task.sleep(for: timeout)
                    self?.waiters.removeValue(forKey: requestId)?.resume(throwing: URLError(.timedOut))
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.waiters.removeValue(forKey: requestId)?.resume(throwing: CancellationError())
            }
        }
    }

    // MARK: Frames

    private func receive(_ message: HubSocket.Message) {
        do {
            switch try message.read.get() {
            case let .stream(message):
                ledger.handle(message)
            case let .frame(frame):
                switch frame {
                case .instances, .instancesDelta:
                    fleet.merge(pulses: message.pulses)
                    fleet.continuations = message.continuations
                default:
                    break
                }
                apply(frame)
            case .other:
                break
            }
        } catch {
            log.error("unreadable hub message: \(String(describing: error), privacy: .public)")
        }
    }

    private func apply(_ frame: Frame) {
        switch frame {
        case let .instances(board, hubBuild):
            if let hubBuild { fleet.hubBuild = hubBuild }
            adopt(machines: board.agents)
            fleet.adopt(rows: board.instances)
            tasks.sweepLiveLedgers()
            fleet.liveRead = true
        case let .instancesDelta(delta, hubBuild):
            if let hubBuild { fleet.hubBuild = hubBuild }
            adopt(machines: delta.agents)
            fleet.patch(upserts: delta.upserts, removed: delta.removed)
            tasks.sweepLiveLedgers()
        case let .permissionRequest(ask, routedTo):
            needs.park(ask, routedTo: routedTo)
        case let .permissionSettled(settled):
            needs.settle(settled.instanceId, settled.requestId)
        case let .runQuestion(runId, raisedAt):
            // Represented once, by its waiting run; only the moment it was parked is kept.
            if let raisedAt {
                fleet.runAskRaisedAt[runId] = raisedAt
            }
        case let .workItem(item):
            workItems.adopt(item)
        case let .workflow(frame):
            fleet.runs[frame.runId] = BoardRun(frame.run)
            workflowRuns.read(frame.runId)
        case let .pulse(pulse):
            fleet.adopt(pulse: pulse.pulse)
        case let .supervisorEvent(event):
            fleet.recordSupervisorEvent(event)
        case let .controlResult(result):
            guard let waiter = waiters.removeValue(forKey: result.requestId) else {
                // Fire-and-forget controls still report failure: nobody waits, so the
                // session it was asked of says so (client.svelte.ts `control_result`).
                if !result.ok, let id = result.instanceId {
                    sessions.noteError(id, result.error ?? "The machine could not carry out that request.")
                }
                return
            }
            if result.ok {
                waiter.resume(returning: result.result)
            } else {
                waiter.resume(throwing: ControlError(message: result.error ?? "The machine could not carry out that request."))
            }
        case let .error(requestId, instanceId, message):
            // The request that asked hears it; with none waiting, the session it
            // is about says it in its transcript (client.svelte.ts `kind === "error"`).
            if let waiter = requestId.flatMap({ waiters.removeValue(forKey: $0) }) {
                waiter.resume(throwing: ControlError(message: message))
            } else if let instanceId {
                sessions.noteError(instanceId, message)
            } else {
                log.error("hub error: \(message, privacy: .public)")
            }
        case let .usage(frame):
            // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
            fleet.adopt(limits: frame.limits.map { ($0.machineId, $0.payload, $0.openCodeGo) })
            fleet.adopt(spend: frame.spend)
        case .ignored:
            break
        }
    }

    struct ControlError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
}
