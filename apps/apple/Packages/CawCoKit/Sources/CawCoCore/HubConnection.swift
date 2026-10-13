public import CawCoAPI
import CawCoPush
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog

/// Whether the update notice was closed this launch: one for the app, read by
/// every window's Caw panel, so closing it in one closes it in all.
@MainActor
@Observable
final class HubNewerNotice {
    static let shared = HubNewerNotice()
    private(set) var dismissed = false
    /// Its first drawing was logged ("update notice shown"), once a launch.
    @ObservationIgnored var logged = false

    func dismiss() {
        dismissed = true
    }
}

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
    /// How often the hub is asked whether the socket is alive, and how long
    /// after asking anything at all must arrive (core stream.ts
    /// `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_DEADLINE_MS`).
    static let heartbeatInterval: Duration = .seconds(20)
    static let heartbeatDeadline: Duration = .seconds(10)
    private static let addressKey = "cawco-hub-url"

    /// The hub's address, as the operator entered it; nil until then.
    public private(set) var address: URL?
    public private(set) var socket: Socket = .closed
    /// When the next attempt starts, while one is waited for.
    public private(set) var retryAt: Date?
    private var outage = false
    /// The socket's last attempt failed because this app is not allowed on
    /// the local network the hub is on (`LocalNetwork.denied`), not because
    /// the hub is away. Cleared when the socket opens. The status line says
    /// it, with Open Settings (StatusLineView); nothing else does.
    public private(set) var localNetworkDenied = false

    /// Connected means the socket is open and the board was read again on it:
    /// a socket that just opened still holds the board as it was before the
    /// app went away (an ask answered meanwhile, a session that finished), and
    /// that is never shown as the hub's word. Until the read lands the board
    /// reads `connecting`.
    public var state: State {
        socket == .connected && synced ? .connected : (outage ? .unreachable : .connecting)
    }

    /// This connection's first full read (machines, sessions, projects and the
    /// asks) has landed.
    private var synced = false

    /// The hub answered in a shape this app cannot read: it is older (or
    /// newer) than the app. Set by the connect-time read, cleared on the next
    /// connection; the screens say so instead of waiting.
    public private(set) var incompatible: Incompatible?

    public struct Incompatible: Sendable, Equatable {
        /// The hub's own version, from `/health`; nil when that did not answer.
        public let hubVersion: String?
        /// What could not be read, for the log and the details line.
        public let read: String

        /// What every screen says of it. Answers fail to decode whichever
        /// side is behind, and nothing here can tell which, so neither is
        /// named: both fixes are.
        public static let title = "This app and your hub don't match"

        /// The fix, with the hub's own version when `/health` said it.
        public func message(host: String) -> String {
            let runs = hubVersion.map { "Your hub runs CawCo \($0)." } ?? "This app can't read your hub's answers."
            return "\(runs) Update the app from TestFlight, or update CawCo on \(host), then reconnect."
        }

        /// CawCo's TestFlight listing (App Store Connect app 6819139448).
        public static let testFlight = URL(string: "itms-beta://beta.itunes.apple.com/v1/app/6819139448")!
    }

    /// The hub sent a value this app does not know (`HubNewer`): it is newer
    /// than the app. Everything else still reads; the app says once to update.
    public private(set) var hubNewer = false

    /// The update notice stands in Caw's panel: the hub is newer and nobody
    /// has closed it this launch, in any window.
    public var showsHubNewer: Bool { hubNewer && !HubNewerNotice.shared.dismissed }

    /// Caw's panel lists it: logged the first time in a launch.
    public func hubNewerShown() {
        guard !HubNewerNotice.shared.logged else { return }
        HubNewerNotice.shared.logged = true
        log.notice("update notice shown: hub newer than this app, in Caw's panel")
    }

    /// Its ✕ (or Open TestFlight): gone for the rest of the launch, every window.
    public func dismissHubNewer() {
        HubNewerNotice.shared.dismiss()
        log.notice("update notice dismissed")
    }
    @ObservationIgnored private var hubNewerWatch: (any NSObjectProtocol)?

    public let ledger = Ledger()
    public let fleet = FleetStore()
    /// What the operator asked of each session from where it is listed, until the hub answers.
    public let acts = SessionActs()
    /// Each session's preview, as the hub says it.
    public let previews = PreviewStore()
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
    /// The fleet's setup as Configure reads it.
    public private(set) var configuration: FleetConfig!

    @ObservationIgnored private var run: Task<Void, Never>?
    @ObservationIgnored private var outageTimer: Task<Void, Never>?
    @ObservationIgnored private var fleetRead: Task<Void, Never>?
    @ObservationIgnored private var live: HubSocket?
    /// The open socket's heartbeat (`keepAlive`), and when anything last arrived on it.
    @ObservationIgnored private var heartbeat: Task<Void, Never>?
    @ObservationIgnored private var lastHeard = ContinuousClock.now
    @ObservationIgnored private var attempts = 0
    /// The socket was closed because the app went to the background.
    @ObservationIgnored private var suspended = false
    /// Counts `start`s, so a replaced loop knows it was replaced.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var waiters: [String: CheckedContinuation<OpenAPIValueContainer?, any Error>] = [:]
    private let log = Logger(subsystem: "dev.cawco.app", category: "Hub")

    /// The hub this app keeps, the one every window connects to.
    public static var keptAddress: URL? {
        UserDefaults.standard.string(forKey: addressKey).flatMap(address(from:))
    }

    public init() {
        needs = NeedsYouStore(ledger: ledger)
        address = Self.keptAddress
        ledger.send = { [weak self] data in
            guard let self, socket == .connected, let live else {
                return "Not connected to the hub. Check that it is running, then try again."
            }
            live.post(data)
            return nil
        }
        sessions = SessionsStore(hub: self)
        tasks = TasksStore(hub: self)
        configuration = FleetConfig(hub: self)
        workItems = WorkItemsStore(hub: self)
        workflowRuns = WorkflowRunsStore(hub: self)
        workflows = WorkflowsStore(hub: self)
        ledger.applyFrame = { [weak self] id, data in self?.sessions.apply(id, data: data) }
        ledger.rereadHistory = { [weak self] id, cause in self?.sessions.read(id, because: cause) }
        hubNewer = HubNewer.met
        hubNewerWatch = NotificationCenter.default.addObserver(forName: HubNewer.noticed, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.hubNewer = true }
        }
        if address != nil {
            start()
        }
    }

    /// Its window went to the background: the socket is closed here, on
    /// purpose. A suspended app answers no pings, so the hub drops the socket,
    /// but the app hears nothing until it runs again: kept, that dead socket
    /// would still read `connected` on return, and every row would show the
    /// status it had before the app went away as if it were the hub's word
    /// now. The window's root calls this for its own scene.
    public func enterBackground() {
        guard address != nil, !suspended else {
            return
        }
        suspended = true
        log.info("app in the background: hub socket closed")
        generation += 1
        run?.cancel()
        run = nil
        live = nil
        retryAt = nil
        closed()
    }

    /// Back in front: connect at once, past any backoff. Until the hub's
    /// first frame lands the board reads `connecting` (StatusLine's
    /// "Connecting…", rows greyed), never the pre-background state as current;
    /// that frame and the pending read bring it to the hub's word.
    public func enterForeground() {
        guard suspended else {
            return
        }
        suspended = false
        log.info("app in front: reconnecting to the hub")
        attempts = 0
        outageTimer?.cancel()
        outageTimer = nil
        outage = false
        start()
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
        if let old = self.address, old != address {
            // The hub this device leaves stops pushing to it.
            PushRegistry.shared.leave(old)
        }
        self.address = address
        UserDefaults.standard.set(address.absoluteString, forKey: Self.addressKey)
        // The extension tells this hub what the person cleared.
        NotificationClearing.keepHub(address)
        resetFleet()
        attempts = 0
        start()
    }

    /// A new connection now, whatever the socket's state: the reader updated
    /// the hub and wants it read again.
    public func reconnect() {
        attempts = 0
        start()
    }

    /// The app is active again: a phone's scene in front, a Mac's window
    /// active (back from System Settings, which never sends the app to the
    /// background). Local Network access has no status to read (Local
    /// Network Privacy FAQ-9), so the socket and the reads it refused are
    /// tried again at once, the backoff skipped: a person who allowed it in
    /// Settings comes back to a connecting app, not a retry clock.
    public func becameActive() {
        guard address != nil, !suspended else { return }
        if socket == .closed {
            log.info("app active: reconnecting now\(self.localNetworkDenied ? ", Local Network access was refused" : "", privacy: .public)")
            reconnectNow()
        }
        sessions.becameActive()
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
        heartbeat?.cancel(); heartbeat = nil
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
        previews.reset()
        needs.parked = [:]
        sessions.reset()
        tasks.reset()
        workItems.reset()
        workflowRuns.reset()
        workflows.reset()
    }

    private func start() {
        run?.cancel()
        generation += 1
        let mine = generation
        run = Task { [weak self] in
            await self?.loop(mine)
        }
    }

    /// Backs off but never gives up: the delay is capped, not the attempts.
    /// A loop that a newer `start` replaced ends without touching the state
    /// its successor now owns.
    private func loop(_ mine: Int) async {
        while !Task.isCancelled, let address {
            retryAt = nil
            socket = .connecting
            let hubSocket = HubSocket(hub: address)
            live = hubSocket
            do {
                #if DEBUG
                // The simulator cannot enforce Local Network privacy: the socket fails as a refused path fails it.
                if LocalNetwork.debugDenied { throw URLError(.notConnectedToInternet, userInfo: [NSURLErrorFailingURLErrorKey: address]) }
                #endif
                for try await event in hubSocket.events {
                    switch event {
                    case .opened:
                        opened()
                        keepAlive(hubSocket)
                    case let .message(message):
                        lastHeard = .now
                        receive(message)
                    }
                }
            } catch {
                log.info("hub socket closed: \(String(describing: error), privacy: .public)")
                // An "offline" or unreached hub on a LAN address may be Local Network privacy.
                var denied = false
                if let url = error as? URLError, LocalNetwork.mayBeDenied(url) { denied = await LocalNetwork.denied(address) }
                guard mine == generation else {
                    return
                }
                if denied != localNetworkDenied {
                    log.notice("hub socket: Local Network access \(denied ? "refused" : "no longer the cause", privacy: .public)")
                    localNetworkDenied = denied
                }
            }
            guard mine == generation else {
                return
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
        log.info("hub socket open")
        retryAt = nil
        attempts = 0
        localNetworkDenied = false
        outageTimer?.cancel()
        outageTimer = nil
        outage = false
        // A new connection may be to an updated hub: its answers are read again, once.
        incompatible = nil
        sessions.reconnected()
        workItems.reconnected()
        readFleet(after: .seconds(1))
        if let address { PushRegistry.shared.connected(to: address) }
    }

    /// A socket can be dead while it reads open: a frozen hub, a route that
    /// dropped without a FIN. Nothing arrives, and the transcript on screen
    /// silently stops. So every `heartbeatInterval` the hub is asked
    /// (`heartbeat`, answered at once), and when nothing at all has arrived
    /// `heartbeatDeadline` after asking, the socket is ended as dead: the
    /// loop reconnects, the board reads `connecting` meanwhile, and the new
    /// connection reads every watched transcript again
    /// (`SessionsStore.reconnected`). Any message is proof of life, so a
    /// large board still arriving in parts is never taken for silence.
    /// Application messages, not WebSocket pings: URLSession rejects the pong
    /// Bun sends on this permessage-deflate socket (NSPOSIXErrorDomain 100).
    private func keepAlive(_ hubSocket: HubSocket) {
        heartbeat?.cancel()
        lastHeard = .now
        let ask: Data
        do {
            ask = try Wire.encoder().encode(Components.Schemas.StreamHeartbeat(_type: .heartbeat))
        } catch {
            log.fault("hub socket: heartbeat cannot be encoded: \(String(describing: error), privacy: .public)")
            return
        }
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.heartbeatInterval)
                guard !Task.isCancelled else { return }
                let asked = ContinuousClock.now
                hubSocket.post(ask)
                self?.log.debug("hub socket: heartbeat asked")
                try? await Task.sleep(for: Self.heartbeatDeadline)
                guard !Task.isCancelled, let heard = self?.lastHeard else { return }
                if heard < asked {
                    self?.log.notice("hub socket: nothing heard 10 s after a heartbeat; reconnecting")
                    hubSocket.dead()
                    return
                }
                self?.log.debug("hub socket: heard \(String(describing: heard - asked), privacy: .public) after the heartbeat")
            }
        }
    }

    private func closed() {
        heartbeat?.cancel()
        heartbeat = nil
        socket = .closed
        synced = false
        fleetRead?.cancel()
        // A socket closed for the background is no outage: nothing failed.
        if !outage, outageTimer == nil, !suspended {
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
    /// while the socket stays open, until the board's reads land. A hub whose
    /// answers this app cannot read is not asked again on this connection:
    /// nothing changes until it is updated, and a reconnect reads once more.
    private func readFleet(after first: Duration) {
        fleetRead?.cancel()
        fleetRead = Task { [weak self] in
            var delay = first
            while !Task.isCancelled, let self {
                if await refresh() {
                    readCatalogs()
                    return
                }
                guard socket == .connected, incompatible == nil else {
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
        let response = try await api.projects.create(.init(body: .json(.init(name: name, machineId: machineId, cwd: cwd))))
        let created: Components.Schemas.PostApiProjects200
        switch response {
        case let .ok(ok):
            created = try ok.body.json
        case let .badRequest(answer):
            // The hub's own reason the project can't be made there (a folder it can't use, a name taken).
            throw ControlError(message: try await String(collecting: answer.body.plainText, upTo: 64_000))
        case let .unprocessableContent(refused):
            let said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
            throw ControlError(message: said.map { "Could not save this project — \($0)" } ?? "Could not save this project — the hub answered 422. Try again.")
        case let .undocumented(statusCode, payload):
            let said = await Wire.words(payload.body)
            throw ControlError(message: said.map { "Could not save this project — \($0)" } ?? "Could not save this project — the hub answered \(statusCode). Try again.")
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
        case let .conflict(conflict):
            // Its sessions still run: the hub says how many ("2 sessions
            // still run in cockpit; stop them first.").
            let body = try conflict.body.plainText
            throw ControlError(message: try await String(collecting: body, upTo: 64_000))
        case let .undocumented(statusCode, payload):
            let said = await Wire.words(payload.body)
            throw ControlError(message: said.map { "Could not forget this project — \($0)" } ?? "Could not forget this project — the hub answered \(statusCode). Try again.")
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
        throw ControlError(message: await Wire.words(body)
            ?? "The hub answered \(statusCode), so the machine was not removed. Try again.")
    }

    /// Marks sessions and runs (`run:<id>`) seen on the hub: `look`, the owner
    /// had it in front after it ended; `archive`, taken off Finished without
    /// opening it, which the hub refuses for anything still doing something.
    /// Marks rows seen on the hub; the hub's stamp of the mark, ms epoch (the
    /// `seenAt` its echo carries), nil for an unarchive.
    func markSeen(_ ids: [String], kind: Operations.PostApiSeen.Input.Body.JsonPayload.KindPayload) async throws -> Double? {
        let response = try await api.instances.markSeen(.init(body: .json(.init(ids: ids, kind: kind))))
        let statusCode: Int
        let said: String?
        switch response {
        case let .ok(answer):
            return try answer.body.json.at
        case let .conflict(refused):
            // "Not archived, still doing something. <id>: <why> <id>: <why>"
            let text = await Wire.words(try refused.body.plainText) ?? ""
            throw ArchiveRefusal(reasons: ArchiveRefusal.reasons(text, ids: ids), whole: text)
        case let .unprocessableContent(refused):
            statusCode = 422
            said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
        case let .undocumented(code, payload):
            statusCode = code
            said = await Wire.words(payload.body)
        }
        throw ControlError(message: said ?? "The hub answered \(statusCode). Try again.")
    }

    /// The hub's refusal to archive (`/api/seen` 409): nothing of the ask was
    /// marked, and each row it refused is named with why (`archiveRefusal`).
    public struct ArchiveRefusal: LocalizedError {
        public let reasons: [String: String]
        let whole: String
        public var errorDescription: String? { whole }

        /// Each id's reason, from its "<id>: " to the next id's.
        static func reasons(_ text: String, ids: [String]) -> [String: String] {
            let marks = ids.compactMap { id in text.range(of: "\(id): ").map { (id, $0) } }.sorted { $0.1.lowerBound < $1.1.lowerBound }
            var out: [String: String] = [:]
            for (index, (id, range)) in marks.enumerated() {
                let end = index + 1 < marks.count ? marks[index + 1].1.lowerBound : text.endIndex
                out[id] = text[range.upperBound ..< end].trimmingCharacters(in: .whitespaces)
            }
            return out
        }
    }

    /// Reads the hub's accounts, their sign-ins and catalogs, the providers
    /// the fleet's machines know (client.svelte.ts `readAccounts`) and
    /// Claude's forecast (forecast.svelte.ts `readForecast`, which the web
    /// reads on the same signal); a failed read keeps what was there.
    func readAccounts() {
        guard let client else { return }
        Task { [weak self] in
            async let view = try? client.getApiAccounts().ok.body.json
            async let providers = try? client.getApiAccountsProviders().ok.body.json
            async let forecast = try? client.getApiAccountsForecast(query: .init(provider: "anthropic")).ok.body.json
            let (read, known, ahead) = await (view, providers, forecast)
            if let read { self?.fleet.accounts = read }
            if let known { self?.fleet.accountProviders = known }
            if let ahead { self?.fleet.forecast = ahead }
        }
    }

    /// The person acknowledged notices (notices.svelte.ts `acknowledge`): gone
    /// here at once, and everywhere once the hub has them. A hub that did not
    /// take them leaves them standing here too.
    public func acknowledge(notices ids: [String]) {
        let fresh = ids.filter { !fleet.noticesSeen.contains($0) }
        guard !fresh.isEmpty else { return }
        fleet.noticesSeen.formUnion(fresh)
        guard let client else {
            fleet.noticesSeen.subtract(fresh)
            return
        }
        Task { [weak self] in
            do {
                _ = try await client.postApiNoticesSeen(body: .json(.init(ids: fresh))).ok
            } catch {
                self?.log.error("notices not acknowledged: \(String(describing: error), privacy: .public)")
                self?.fleet.noticesSeen.subtract(fresh)
            }
        }
    }

    /// Reads the fleet's update policy (updates.svelte.ts `loadPolicy`); a
    /// failed read keeps what was there and says why.
    func readUpdatePolicy() {
        guard let client else { return }
        Task { [weak self] in
            do {
                self?.fleet.updatePolicy = try await client.getApiBinaryUpdatesSettings().ok.body.json
                self?.fleet.updatePolicyProblem = nil
            } catch {
                self?.fleet.updatePolicyProblem = "Could not read the update settings — \(error.localizedDescription)."
            }
        }
    }

    /// The fleet's channel and auto-update, as one choice for every machine
    /// (updates.svelte.ts `savePolicy`); the channels are read again after.
    /// False when the hub did not take it, and nothing changed.
    public func saveUpdatePolicy(channel: Components.Schemas.BinaryUpdatePolicyChannel, autoUpdate: Bool) async -> Bool {
        guard let client else { return false }
        let wire: Operations.PutApiBinaryUpdatesSettings.Input.Body.JsonPayload.ChannelPayload = channel == .nightly ? .nightly : .stable
        guard let saved = try? await client.putApiBinaryUpdatesSettings(body: .json(.init(channel: wire, autoUpdate: autoUpdate))).ok.body.json else {
            return false
        }
        fleet.updatePolicy = saved
        await readUpdateChannels()
        return true
    }

    /// Each channel's newest release as the hub last heard it (updates.svelte.ts `loadChannels`).
    public func readUpdateChannels() async {
        guard let client, let channels = try? await client.getApiBinaryUpdatesChannels().ok.body.json else { return }
        fleet.updateChannels = channels
    }

    /// Asks the release host again (updates.svelte.ts `refreshChannels`). False when it could not be reached.
    public func checkUpdateChannels() async -> Bool {
        guard let client, let channels = try? await client.postApiBinaryUpdatesChannels().ok.body.json else { return false }
        fleet.updateChannels = channels
        return true
    }

    /// Takes back a queued install (updates.svelte.ts `cancel`).
    public func cancelUpdate(machineId: String) {
        fleet.commanded.remove(machineId)
        guard let client else { return }
        Task { _ = try? await client.postApiBinaryUpdatesMachinesByMachineIdCancel(path: .init(machineId: machineId)) }
    }

    /// Install now on one machine (updates.svelte.ts `installNow`): one
    /// command, acted on once, for the build it offers. A machine that is not
    /// connected or could not start it is no longer counted as asked, and
    /// `refused` is told why in the web's words.
    public func installUpdate(machineId: String, refused: (@MainActor (String) -> Void)? = nil) {
        guard let client else { return }
        let machine = fleet.machines.first { $0.machineId == machineId }
        let version = machine?.binaryUpdate?.availableVersion
        let name = machine?.name ?? machineId
        fleet.commanded.insert(machineId)
        Task { [weak self] in
            let answer = try? await client.postApiAgentsByMachineIdUpdate(
                path: .init(machineId: machineId),
                body: .json(.init(commandId: UUID().uuidString.lowercased(), version: version))
            )
            switch answer {
            case .notFound:
                self?.log.error("install on \(machineId, privacy: .public) refused: not connected")
                self?.fleet.commanded.remove(machineId)
                refused?("\(name) is not connected, so nothing was installed. Try again when it is back.")
            case let .internalServerError(failed):
                let said = await Wire.words(try? failed.body.plainText)
                self?.log.error("install on \(machineId, privacy: .public) refused: \(said ?? "", privacy: .public)")
                self?.fleet.commanded.remove(machineId)
                refused?("\(name) could not start the update. \(said ?? "")")
            default:
                break
            }
        }
    }

    /// The update notice's ✕ on "running on N machines": this device's installs are forgotten.
    public func forgetCommanded() { fleet.commanded.removeAll() }

    /// Which account a session would start on, and why (client.svelte.ts
    /// `placementFor`): the account whose models the picker offers.
    public func placement(harness: String, machineId: String, model: String?, projectId: String?) async -> String? {
        guard let client else { return nil }
        let answer = try? await client.getApiAccountsPlacement(query: .init(
            harness: harness, machineId: machineId, model: model?.isEmpty == false ? model : nil, projectId: projectId
        )).ok.body.json
        return answer?.accountId
    }

    /// Registry reads; true once machines, sessions and projects all landed.
    public func refresh() async -> Bool {
        guard let client else {
            return false
        }
        readAccounts()
        readUpdatePolicy()
        // The reads and their decoding run off the main actor; only what they
        // found is adopted here, so the first frames keep drawing while the
        // fleet is read.
        // What the socket says about asks from here on is newer than the read.
        let adopt = await Self.readFleet(client, asksFrom: needs.heardMark)
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
    private nonisolated static func readFleet(_ client: Client, asksFrom mark: Int) async -> Adoption<Bool> {
        async let machinesRead = attempt { try await client.getApiAgents().ok.body.json }
        async let rowsRead = attempt { try await client.getApiInstances().ok.body.json }
        async let projectsRead = attempt { try await client.getApiProjects().ok.body.json }
        async let pending = try? await client.getApiPending().ok.body.json
        // A continuation that moved while this device was away.
        async let carried = try? await client.getApiContinuations().ok.body.json
        // Likewise a project move.
        async let moving = try? await client.getApiMoves().ok.body.json
        // Read on connect, not only pushed on change: a device that connects
        // between reports has missed every `usage` frame.
        async let limits = try? await client.getApiUsageLimits().ok.body.json
        async let spend = try? await client.getApiUsageSpend().ok.body.json
        let (machines, rows, projects, readPending, readLimits, readSpend, readCarried) =
            await (machinesRead, rowsRead, projectsRead, pending, limits, spend, carried)
        let readMoves = await moving
        let readMachines = try? machines.get()
        let readRows = try? rows.get()
        let readProjects = try? projects.get()
        let cancelled = Task.isCancelled
        let boardRows = readRows.map { read in Result { try Wire.transcode(read, as: [InstanceRow].self) } }
        // An answer that arrived and did not decode is a hub on another version
        // than this app: asking again changes nothing until one of them updates.
        var unreadable: [String] = []
        for (name, failure) in [("machines", machines.failure), ("instances", rows.failure ?? boardRows?.failure), ("projects", projects.failure)] {
            if let failure, undecodable(failure) { unreadable.append("\(name): \(String(describing: failure).prefix(300))") }
        }
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
                hub.needs.replace(with: asks, asOf: mark)
            }
            if let readCarried {
                hub.fleet.continuations = readCarried
            }
            if let readMoves {
                hub.fleet.moves = readMoves
            }
            if !unreadable.isEmpty {
                hub.cannotRead(unreadable)
                return false
            }
            // The asks are the read's point on a reconnect: one answered while
            // this device was away is still on the board until they land.
            if readMachines == nil || readRows == nil || readProjects == nil || !hasPending {
                hub.log.error("fleet read incomplete: machines \(readMachines != nil) rows \(readRows != nil) projects \(readProjects != nil) pending \(hasPending)")
                return false
            }
            hub.fleet.fleetRead = true
            if hub.socket == .connected { hub.synced = true }
            hub.log.notice("fleet read: \(hub.fleet.rows.count) rows, \(hub.fleet.machines.count) machines, hub newer than this app: \(hub.hubNewer)")
            return true
        }
    }

    /// A read's result, its error kept: a failure to decode is told apart from a failure to reach.
    private nonisolated static func attempt<T: Sendable>(_ body: @Sendable () async throws -> T) async -> Result<T, any Error> {
        do { return .success(try await body()) } catch { return .failure(error) }
    }

    /// The answer came and was not in this app's shape (the generated client
    /// wraps the decoder's error in its own).
    private nonisolated static func undecodable(_ error: any Error) -> Bool {
        if error is DecodingError { return true }
        if let client = error as? ClientError { return client.underlyingError is DecodingError }
        return false
    }

    /// Said once per connection: the hub's answers do not decode. The reads
    /// stop, and the hub's own version is asked of `/health` for the screen.
    private func cannotRead(_ unreadable: [String]) {
        guard incompatible == nil else { return }
        let read = unreadable.joined(separator: "; ")
        log.error("hub answers this app cannot read, reads stopped until a reconnect: \(read, privacy: .public)")
        incompatible = Incompatible(hubVersion: nil, read: read)
        guard let address else { return }
        Task { [weak self] in
            let version = await Self.hubVersion(address)
            guard let self, incompatible?.read == read else { return }
            incompatible = Incompatible(hubVersion: version, read: read)
        }
    }

    /// Where the web dashboard is reached, as the hub says (`/health`
    /// `dashboard`, the address its Telegram links open): for what this app
    /// has no screen of its own for yet.
    public func dashboardAddress() async throws -> URL {
        guard let address else { throw URLError(.notConnectedToInternet) }
        let (data, _) = try await URLSession.shared.data(from: address.appending(path: "health"))
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let said = body["dashboard"] as? String, let url = URL(string: said) else {
            throw ControlError(message: "The hub did not say where its dashboard is. Update the hub, then try again.")
        }
        return url
    }

    /// The hub's version, as its `/health` says it.
    @concurrent
    private nonisolated static func hubVersion(_ address: URL) async -> String? {
        guard let (data, _) = try? await URLSession.shared.data(from: address.appending(path: "health")),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return body["version"] as? String
    }

    /// A machine that came online after the connect-time read has its stored sessions read now.
    private func adopt(machines next: [MachineRow]) {
        guard next != fleet.machines else { return }
        let wasOnline = Set(fleet.machines.filter { $0.status == "online" }.map(\.machineId))
        fleet.machines = next
        // A transcript whose read found its machine offline is read again once
        // the hub says it is online: across a hub restart the app may never
        // have seen it go, so it is every online machine, not a change of one.
        for machine in next where machine.status == "online" { sessions.machineOnline(machine.machineId) }
        guard fleet.fleetRead else {
            return
        }
        for machine in next where machine.status == "online" && !wasOnline.contains(machine.machineId) {
            readCatalog(machine.machineId)
        }
    }

    /// A board delta names only changed machines and ids that left. Keep the
    /// others at their places, append new ids, then run the snapshot's adoption
    /// side effects (client.svelte.ts `patchRows` followed by `adoptMachines`).
    private func patchMachines(_ changed: [MachineRow], removed: [String]) {
        let gone = Set(removed)
        var next = fleet.machines.filter { !gone.contains($0.machineId) }
        var at = Dictionary(uniqueKeysWithValues: next.enumerated().map { ($0.element.machineId, $0.offset) })
        for machine in changed {
            if let index = at[machine.machineId] {
                next[index] = machine
            } else {
                at[machine.machineId] = next.count
                next.append(machine)
            }
        }
        adopt(machines: next)
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
                case .instances:
                    fleet.merge(pulses: message.pulses)
                default:
                    break
                }
                apply(frame)
            case let .notificationsCleared(ids):
                NotificationSync.socketCleared(ids)
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
            fleet.continuations = board.continuations
            fleet.moves = board.moves
            fleet.adopt(noticesSeen: board.noticesSeen)
            adopt(machines: board.agents)
            fleet.adopt(rows: board.instances)
            previews.reconcile(board.previews)
            tasks.sweepLiveLedgers()
            fleet.liveRead = true
        case let .instancesDelta(delta, hubBuild):
            if let hubBuild { fleet.hubBuild = hubBuild }
            if let continuations = delta.continuations { fleet.continuations = continuations }
            if let seen = delta.noticesSeen { fleet.adopt(noticesSeen: seen) }
            if delta.agents != nil || delta.removedAgents != nil {
                patchMachines(delta.agents ?? [], removed: delta.removedAgents ?? [])
            }
            fleet.patch(upserts: delta.upserts, removed: delta.removed)
            previews.reconcile(delta.previews)
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
                return
            }
            if result.ok {
                waiter.resume(returning: result.result)
            } else {
                waiter.resume(throwing: ControlError(message: result.error ?? "The machine could not carry out that request."))
            }
        case let .error(requestId, message):
            if let requestId { waiters.removeValue(forKey: requestId)?.resume(throwing: ControlError(message: message)) }
        case let .usage(frame):
            // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
            fleet.adopt(limits: frame.limits.map { ($0.machineId, $0.payload, $0.openCodeGo) })
            fleet.adopt(spend: frame.spend)
            // The hub says this when an account's reading, sign-in or catalog moved.
            readAccounts()
        case .thread:
            // Said once per connection object, never per frame: threads arrive for every Caw thread.
            if !threadsNoted {
                threadsNoted = true
                log.info("hub sends Caw thread frames; this app has no thread screen yet, so they are ignored")
            }
        case let .preview(frame):
            previews.adopt(frame)
        case let .moves(jobs):
            fleet.moves = jobs
        case .ignored:
            break
        }
    }

    /// The first thread frame has been logged.
    @ObservationIgnored private var threadsNoted = false

    struct ControlError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
}

private extension Result {
    var failure: Failure? {
        if case let .failure(error) = self { return error }
        return nil
    }
}
