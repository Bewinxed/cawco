public import CawCoAPI
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog
public import UIKit
public import UserNotifications

// The app's half of the hub's APNs pushes (PRD 2026-10-06-projects.md §5.5,
// "iOS app"; the hub's half is packages/hub/src/push.ts). A push carries no
// tool input, path or prompt: the app reads those from the hub.

/// Where a push opens.
public enum PushRoute: Sendable, Equatable {
    /// A session's conversation, or a workflow run's (`run:<id>`), its parked ask in view.
    case session(String)
    /// A project's page.
    case project(String)
    /// The board.
    case board
}

/// What a push said, read off its notification: the alert's title and the
/// `cawco` object (`kind`, and the ids that kind carries).
public struct PushNote: Sendable {
    /// The notification's identifier, which is the push's `apns-collapse-id`.
    public let id: String
    public let delivered: Date
    public let title: String
    public let thread: String
    /// The action the operator chose (`OPEN`, `APPROVE`, or the system's default and dismiss).
    public let action: String
    /// The `cawco` object's string fields; a JSON null is absent.
    let fields: [String: String]

    public init(_ response: UNNotificationResponse) {
        self.init(response.notification, action: response.actionIdentifier)
    }

    public init(_ notification: UNNotification, action: String) {
        let content = notification.request.content
        id = notification.request.identifier
        delivered = notification.date
        title = content.title
        thread = content.threadIdentifier
        self.action = action
        fields = Self.fields(content.userInfo)
    }

    static func fields(_ userInfo: [AnyHashable: Any]) -> [String: String] {
        ((userInfo["cawco"] as? [String: Any]) ?? [:]).compactMapValues { $0 as? String }
    }

    public var kind: String? { fields["kind"] }
    var requestId: String? { fields["requestId"] }
    var instanceId: String? { fields["instanceId"] }

    /// One delivery: a tap reaches the app both as a scene's connection
    /// option and through the notification centre's delegate, and is routed once.
    public var key: String { "\(id)@\(delivered.timeIntervalSince1970)" }

    /// By `cawco.kind`. A task or an attempt opens its project: the app has no task sheet yet.
    public var route: PushRoute {
        switch kind {
        case "ask":
            if let runId = fields["workflowRunId"], !runId.isEmpty { return .session(BoardRun.prefix + runId) }
            if let instanceId, !instanceId.isEmpty { return .session(instanceId) }
            return .board
        case "task", "attempt":
            if let projectId = fields["projectId"], !projectId.isEmpty { return .project(projectId) }
            return .board
        default:
            return .board
        }
    }
}

/// The notification categories the hub's pushes name (push.ts `PUSH_CATEGORIES`).
public enum PushCategories {
    public static let open = "OPEN"
    public static let approve = "APPROVE"
    static let permissionOpenOnly = "CAWCO_PERMISSION_OPEN"

    /// "Approve" is the only label for the grant (WORDS.md); there is no Deny.
    public static func register() {
        let openAction = UNNotificationAction(identifier: Self.open, title: "Open", options: [.foreground])
        let approveAction = UNNotificationAction(identifier: Self.approve, title: "Approve", options: [.authenticationRequired])
        func openOnly(_ id: String) -> UNNotificationCategory {
            UNNotificationCategory(identifier: id, actions: [openAction], intentIdentifiers: [])
        }
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: "CAWCO_PERMISSION", actions: [openAction, approveAction], intentIdentifiers: []),
            openOnly(permissionOpenOnly),
            openOnly("CAWCO_QUESTION"),
            openOnly("CAWCO_TASK"),
            openOnly("CAWCO_ATTEMPT"),
            UNNotificationCategory(identifier: "CAWCO_TEST", actions: [], intentIdentifiers: []),
        ])
    }
}

/// This device's registration with the hub: the APNs token, whether iOS
/// lets the app notify, and Quiet as the hub last answered it.
@MainActor
@Observable
public final class PushRegistry {
    public static let shared = PushRegistry()

    public enum Environment: String, Sendable {
        case sandbox, production
    }

    /// Which APNs the build's `aps-environment` names; the app sets it at launch.
    @ObservationIgnored public var environment: Environment = .production
    public private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// The token, hex in lowercase, once APNs gave one on this launch.
    public private(set) var token: String?
    /// Quiet as the hub's last answer had it; nil until the hub answered.
    public private(set) var quiet: Bool?
    /// A Quiet change is on its way to the hub.
    public private(set) var quietSending = false
    /// Why the last call to the hub failed, said as the hub said it.
    public private(set) var problem: String?
    @ObservationIgnored private var registeredWith: URL?
    private let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    private init() {}

    public var allowed: Bool {
        authorization == .authorized || authorization == .provisional || authorization == .ephemeral
    }

    /// At launch: the categories, and a fresh token when the app may notify.
    /// The token comes back through `adopt(deviceToken:)`, which registers it.
    public func launch(environment: Environment) {
        self.environment = environment
        PushCategories.register()
        Task {
            await readAuthorization()
            if allowed { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// A hub answered: the first time, iOS asks the operator; granted, the
    /// device registers. Denied, nothing happens, and the hub sheet says so.
    func connected(to hub: URL) {
        Task {
            await readAuthorization()
            if authorization == .notDetermined {
                do {
                    _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
                } catch {
                    log.error("authorization request failed: \(String(describing: error), privacy: .public)")
                }
                await readAuthorization()
            }
            guard allowed else { return }
            if token == nil {
                UIApplication.shared.registerForRemoteNotifications()
            } else if registeredWith != hub {
                await register(hub: hub, quiet: nil)
            }
        }
    }

    /// APNs' token for this launch, posted to the hub. Tokens change, and the hub upserts.
    public func adopt(deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        log.notice("registered for remote notifications, token …\(String(self.token?.suffix(6) ?? ""), privacy: .public)")
        guard let hub = HubConnection.keptAddress else { return }
        Task { await register(hub: hub, quiet: nil) }
    }

    public func failedToRegister(_ error: any Error) {
        log.error("remote notification registration failed: \(String(describing: error), privacy: .public)")
    }

    /// Quiet: registered, and sent nothing. The hub's answer is what shows.
    public func setQuiet(_ next: Bool) {
        guard let hub = HubConnection.keptAddress, token != nil, !quietSending else { return }
        quietSending = true
        Task {
            await register(hub: hub, quiet: next)
            quietSending = false
        }
    }

    /// The app forgets `hub`: it stops pushing to this device.
    func leave(_ hub: URL) {
        registeredWith = nil
        quiet = nil
        guard let token else { return }
        Task {
            do {
                let answer: Unregistered = try await Self.post("api/push/unregister", Unregistration(token: token), to: hub)
                log.notice("unregistered from \(hub.absoluteString, privacy: .public): removed \(answer.removed)")
            } catch {
                log.error("unregister from \(hub.absoluteString, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// The app came to the front: iOS's word on notifications again (the
    /// operator may have changed it in Settings), the badge kept at 0, and the
    /// delivered pushes whose ask is over taken down.
    public func becameActive() async {
        await readAuthorization()
        let center = UNUserNotificationCenter.current()
        try? await center.setBadgeCount(0)
        guard let hub = HubConnection.keptAddress, let parked = await PushPending.read(hub) else { return }
        let waiting = Set(parked.map(\.requestId))
        let gone: [String] = await withCheckedContinuation { done in
            center.getDeliveredNotifications { notes in
                done.resume(returning: notes.compactMap { note in
                    let fields = PushNote.fields(note.request.content.userInfo)
                    guard fields["kind"] == "ask", let requestId = fields["requestId"], !waiting.contains(requestId) else { return nil }
                    return note.request.identifier
                })
            }
        }
        if !gone.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: gone)
            log.notice("removed \(gone.count) delivered asks that are over")
        }
    }

    private func readAuthorization() async {
        authorization = await withCheckedContinuation { done in
            UNUserNotificationCenter.current().getNotificationSettings { done.resume(returning: $0.authorizationStatus) }
        }
    }

    /// `quiet` is sent only from the toggle; a launch's registration keeps what the operator set.
    private func register(hub: URL, quiet next: Bool?) async {
        guard let token else { return }
        let body = Registration(token: token, environment: environment.rawValue, name: UIDevice.current.name, platform: Self.platform, quiet: next)
        do {
            let answer: Registered = try await Self.post("api/push/register", body, to: hub)
            registeredWith = hub
            quiet = answer.quiet
            problem = nil
            log.notice("registered with \(hub.absoluteString, privacy: .public) (\(body.environment, privacy: .public), \(body.platform, privacy: .public)), quiet \(answer.quiet)")
        } catch {
            problem = (error as? HubRefusal)?.message ?? "The hub could not be reached. Try again."
            log.error("register with \(hub.absoluteString, privacy: .public) failed: \(String(describing: error), privacy: .public)")
        }
    }

    static var platform: String {
        #if targetEnvironment(macCatalyst)
        "macos"
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? "ipados" : "ios"
        #endif
    }

    // The routes are hidden from openapi.json, so they are called with URLSession.
    private struct Registration: Encodable, Sendable {
        let token: String
        let environment: String
        let name: String
        let platform: String
        let quiet: Bool?
    }

    private struct Registered: Decodable, Sendable {
        let quiet: Bool
    }

    private struct Unregistration: Encodable, Sendable {
        let token: String
    }

    private struct Unregistered: Decodable, Sendable {
        let removed: Bool
    }

    struct HubRefusal: Error {
        let message: String
    }

    private static func post<Body: Encodable & Sendable, Answer: Decodable & Sendable>(_ path: String, _ body: Body, to hub: URL) async throws -> Answer {
        var request = URLRequest(url: hub.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw HubRefusal(message: text.isEmpty || text.hasPrefix("{") ? "The hub answered \(status)." : text)
        }
        return try JSONDecoder().decode(Answer.self, from: data)
    }
}

/// The hub's parked asks (`/api/pending`), as the push code reads them.
enum PushPending {
    struct Parked: Sendable {
        let requestId: String
        let instanceId: String?
        let machineId: String
        /// Set for a session's permission request; nil for a run's question and anything else.
        let ask: ParkedAsk?
    }

    /// Nil when the hub could not be read.
    static func read(_ hub: URL) async -> [Parked]? {
        guard let envelopes = try? await Client(hub: hub).getApiPending().ok.body.json else { return nil }
        return envelopes.compactMap { envelope in
            guard envelope.verb == .frames, let data = try? Wire.data(envelope.payload) else { return nil }
            let payloadRequestId = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["requestId"] as? String
            var ask: ParkedAsk?
            if case let .permissionRequest(frame, routedTo) = try? Inbound.frame(data) {
                ask = ParkedAsk(instanceId: frame.instanceId, requestId: frame.requestId, toolName: frame.toolName,
                                input: frame.input, raisedAt: frame.raisedAt, routedTo: routedTo)
            }
            // push.ts `onAsk`: the envelope's id, else the payload's.
            guard let requestId = envelope.requestId ?? payloadRequestId else { return nil }
            return Parked(requestId: requestId, instanceId: envelope.instanceId ?? ask?.instanceId, machineId: envelope.machineId, ask: ask)
        }
    }
}

/// Approve from the lock screen, in the time iOS gives a background action:
/// exactly the one request the push named, through the same `permission.answer`
/// command the app's own Approve sends.
@MainActor
public enum PushApproval {
    /// How long the hub has to say the answer was applied.
    static let window: Duration = .seconds(20)
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    public static func approve(_ note: PushNote) async {
        guard note.kind == "ask", let requestId = note.requestId, let instanceId = note.instanceId,
              let hub = HubConnection.keptAddress else { return }
        let deadline = ContinuousClock.now + window
        guard let parked = await PushPending.read(hub) else {
            log.error("approve \(requestId, privacy: .public): /api/pending unreadable")
            await notApproved(note)
            return
        }
        guard let match = parked.first(where: { $0.requestId == requestId && $0.instanceId == instanceId }), let ask = match.ask else {
            log.notice("approve \(requestId, privacy: .public): no longer parked")
            await post(note, title: note.title, body: "Already answered.", category: nil)
            return
        }
        let connection = HubConnection()
        defer { connection.disconnect() }
        guard await until(deadline, { connection.socket == .connected }) else {
            log.error("approve \(requestId, privacy: .public): the hub socket did not open")
            await notApproved(note)
            return
        }
        connection.needs.answer(ask, machineId: match.machineId, .allow)
        guard let commandId = connection.needs.answers["\(ask.instanceId):\(ask.requestId)"] else {
            await notApproved(note)
            return
        }
        _ = await until(deadline) {
            let stage = connection.ledger.commands[commandId]?.stage
            return stage == .applied || stage == .failed
        }
        let stage = connection.ledger.commands[commandId]?.stage
        log.notice("approve \(requestId, privacy: .public): command \(commandId, privacy: .public) \(stage?.rawValue ?? "unanswered", privacy: .public)")
        if stage != .applied { await notApproved(note) }
    }

    private static func notApproved(_ note: PushNote) async {
        await post(note, title: nil, body: "\(note.title): not approved. Open to answer.", category: PushCategories.permissionOpenOnly)
    }

    /// A local notification in the push's place (same identifier, same `cawco` data).
    private static func post(_ note: PushNote, title: String?, body: String, category: String?) async {
        let content = UNMutableNotificationContent()
        if let title { content.title = title }
        content.body = body
        content.categoryIdentifier = category ?? ""
        content.threadIdentifier = note.thread
        content.userInfo = ["cawco": note.fields]
        do {
            try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: note.id, content: content, trigger: nil))
        } catch {
            log.error("local notification failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// Waits until `met` holds or `deadline` passes, woken by what `met` reads changing.
    private static func until(_ deadline: ContinuousClock.Instant, _ met: @escaping @MainActor () -> Bool) async -> Bool {
        while !met() {
            guard ContinuousClock.now < deadline else { return false }
            let wake = Wake()
            await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                wake.continuation = done
                withObservationTracking { _ = met() } onChange: { Task { @MainActor in wake.fire() } }
                wake.timer = Task { @MainActor in
                    try? await Task.sleep(until: deadline, clock: .continuous)
                    wake.fire()
                }
            }
        }
        return true
    }

    @MainActor
    private final class Wake {
        var continuation: CheckedContinuation<Void, Never>?
        var timer: Task<Void, Never>?

        func fire() {
            timer?.cancel()
            continuation?.resume()
            continuation = nil
        }
    }
}
