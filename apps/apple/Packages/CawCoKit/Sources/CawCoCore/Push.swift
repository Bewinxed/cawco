public import CawCoAPI
import CawCoPush
public import Foundation
import Observation
import OpenAPIRuntime
import OSLog
public import UIKit
public import UserNotifications

// The app's half of the hub's APNs pushes (PRD 2026-10-06-projects.md §5.5,
// "iOS app"; the hub's half is packages/hub/src/push.ts). A push carries no
// tool input, path or prompt: the app reads those from the hub. Its real
// title and body travel sealed with this device's push key (CawCoPush), and
// the NotificationService extension opens them on the device.

/// Where a push opens.
public enum PushRoute: Sendable, Equatable {
    /// A session's conversation, or a workflow run's (`run:<id>`), its parked ask in view.
    case session(String)
    /// A project's page.
    case project(String)
    /// A task's sheet over its project's page; `attempt` scrolls it to that attempt.
    case task(projectId: String, taskId: String, attempt: String?)
    /// The board.
    case board
    /// The free week's day-6 reminder: the paywall in its Get Pro form.
    case keepPro
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

    /// By `cawco.kind`. A task opens its sheet over its project's page; an
    /// attempt opens the same sheet at that attempt.
    public var route: PushRoute {
        switch kind {
        case "ask":
            if let runId = fields["workflowRunId"], !runId.isEmpty { return .session(BoardRun.prefix + runId) }
            if let instanceId, !instanceId.isEmpty { return .session(instanceId) }
            return .board
        case "task", "attempt":
            guard let projectId = fields["projectId"], !projectId.isEmpty else { return .board }
            guard let taskId = fields["taskId"], !taskId.isEmpty else { return .project(projectId) }
            return .task(projectId: projectId, taskId: taskId, attempt: kind == "attempt" ? fields["workItemId"] : nil)
        case TrialReminder.kind:
            return .keepPro
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

/// This device's pushes: iOS's word on notifications, the APNs token, the
/// pairing Cawrier enrols on the purchase, and its registration with the hub.
///
/// A pairing is an id and a secret this device makes once and keeps in the
/// Keychain. Cawrier holds the device token under it (on proof of Pro or a
/// live free week); the hub holds the id and secret and pushes through
/// Cawrier with them. The pairing enrols again on every launch and on every
/// new token; Cawrier skips the write when nothing changed. The hub also holds
/// the pairing's push key, made at the first registration and deleted by every
/// unregister, and seals each push's alert with it.
@MainActor
@Observable
public final class PushRegistry {
    public static let shared = PushRegistry()

    public enum Environment: String, Sendable {
        case sandbox, production
    }

    /// One step of the setup: enrolling with Cawrier, then registering with the hub.
    public enum Step: Equatable, Sendable {
        case idle
        case working
        case done
        /// Cawrier's or the hub's own reason sentence.
        case failed(String)
    }

    /// Which APNs the build's `aps-environment` names; the app sets it at launch.
    @ObservationIgnored public var environment: Environment = .production
    public private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// The token, hex in lowercase, once APNs gave one on this launch.
    public private(set) var token: String?
    /// When this launch last asked APNs for a token.
    public private(set) var tokenAsked: Date?
    /// APNs refused this launch's registration (`didFailToRegister`).
    public private(set) var tokenFailed = false
    /// Cawrier's enrolment, then the hub's registration, of this device's pairing.
    public private(set) var relay: Step = .idle
    /// Quiet as the hub's last answer had it; nil until the hub answered.
    public private(set) var quiet: Bool?
    /// A Quiet change is on its way to the hub.
    public private(set) var quietSending = false
    /// The last test asked of the hub: when it went, and when it showed here.
    public private(set) var testSent: Date?
    public private(set) var testArrived: Date?
    /// The hub's or Cawrier's word on the last test, when it didn't go.
    public private(set) var testProblem: String?
    public private(set) var testSending = false
    /// H5: the free week's day-6 reminder may be scheduled. On until the operator turns it off.
    public private(set) var trialReminder: Bool {
        didSet { UserDefaults.standard.set(trialReminder, forKey: Self.reminderKey) }
    }

    /// H7 ran: this device left the relay and stays out of it until the
    /// operator turns notifications on again. Kept across launches.
    public private(set) var removed: Bool {
        didSet { UserDefaults.standard.set(removed, forKey: Self.removedKey) }
    }

    /// H7 is on its way to the hub.
    public private(set) var removing = false
    /// The hub's reason H7 didn't go; the pairing is kept until it does.
    public private(set) var removeProblem: String?

    @ObservationIgnored private var registeredWith: URL?
    @ObservationIgnored private var enrolling: Task<Void, Never>?
    @ObservationIgnored private var enrolAgain = false
    private let log = Logger(subsystem: "dev.cawco.app", category: "Push")
    private static let reminderKey = "push-trial-reminder"
    private static let removedKey = "push-relay-removed"

    private init() {
        trialReminder = UserDefaults.standard.object(forKey: Self.reminderKey) as? Bool ?? true
        removed = UserDefaults.standard.bool(forKey: Self.removedKey)
    }

    public var allowed: Bool {
        authorization == .authorized || authorization == .provisional || authorization == .ephemeral
    }

    /// Every step is done: the hub can push to this device.
    public var ready: Bool { relay == .done }

    /// At launch: the categories, and a fresh token when the app may notify.
    /// The token comes back through `adopt(deviceToken:)`, which enrols it.
    public func launch(environment: Environment) {
        self.environment = environment
        PushCategories.register()
        Task {
            await readAuthorization()
            if allowed { requestToken() }
        }
    }

    /// S1's "Turn on notifications": iOS asks once; allowed, the device
    /// registers, enrols and registers with the hub. Denied, nothing more
    /// happens, and the sheet says so.
    public func turnOn() async {
        removed = false
        removeProblem = nil
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
        if token == nil { requestToken() } else { enrol() }
    }

    /// Asks APNs for this launch's token again (S6's and H3b's Try again).
    public func requestToken() {
        tokenAsked = .now
        tokenFailed = false
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// The next step again after a failure: the token, else the enrolment.
    public func retry() {
        if token == nil || tokenFailed { requestToken() } else { enrol() }
    }

    /// APNs' token for this launch, enrolled at once. Tokens change, and Cawrier upserts.
    public func adopt(deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        tokenFailed = false
        log.notice("registered for remote notifications, token …\(String(self.token?.suffix(6) ?? ""), privacy: .public)")
        enrol()
    }

    public func failedToRegister(_ error: any Error) {
        tokenFailed = true
        log.error("remote notification registration failed: \(String(describing: error), privacy: .public)")
    }

    /// The purchase changed: a device that has its token enrols on it now.
    func entitlementChanged() {
        if token != nil, Pro.shared.enrolmentProof != nil { enrol() }
    }

    /// A hub answered: a device already set up registers with it.
    func connected(to hub: URL) {
        Task {
            await readAuthorization()
            log.notice("hub answered; notifications \(self.authorization.rawValue, privacy: .public)")
            guard allowed, token != nil, registeredWith != hub else { return }
            enrol()
        }
    }

    /// Enrols the pairing with Cawrier on the purchase's signed transaction,
    /// then registers it with the kept hub. One run at a time; a call during a
    /// run runs it once more after.
    public func enrol() {
        guard enrolling == nil else {
            enrolAgain = true
            return
        }
        enrolling = Task {
            repeat {
                enrolAgain = false
                await enrolOnce()
            } while enrolAgain
            enrolling = nil
        }
    }

    private func enrolOnce() async {
        guard !removed, let token, let proof = Pro.shared.enrolmentProof else {
            relay = .idle
            return
        }
        relay = .working
        let pairing: Pairing
        do {
            pairing = try Pairing.kept()
        } catch {
            log.error("pairing keychain failed: \(String(describing: error), privacy: .public)")
            relay = .failed("This device couldn't keep its pairing key.")
            return
        }
        let enrolment = Enrolment(pairingId: pairing.id, secret: pairing.secret, deviceToken: token,
                                  apnsEnvironment: environment.rawValue, proof: .init(proof))
        do {
            let _: Enrolled = try await Self.post(Cawrier.origin.appending(path: "v1/enroll"), enrolment, refused: "The relay")
            log.notice("enrolled with Cawrier (\(self.environment.rawValue, privacy: .public))")
        } catch {
            relay = .failed(Self.reason(error, from: "The relay"))
            log.error("Cawrier enrolment failed: \(String(describing: error), privacy: .public)")
            // Cawrier seats a TestFlight install on its appTransactionID, which Apple gives from iOS 18.4.
            if case .appTransaction = proof, #unavailable(iOS 18.4) {
                log.error("Cawrier enrolment: TestFlight push needs iOS 18.4 or later, where the AppTransaction carries an appTransactionID")
            }
            return
        }
        guard let hub = HubConnection.keptAddress else {
            relay = .failed("No hub is kept on this device. Connect to your hub first.")
            return
        }
        if let problem = await register(hub: hub, pairing: pairing, quiet: nil) {
            relay = .failed(problem)
            return
        }
        relay = .done
    }

    /// Quiet: registered, and sent nothing. The hub's answer is what shows.
    public func setQuiet(_ next: Bool) {
        guard let hub = HubConnection.keptAddress, relay == .done, !quietSending, let pairing = try? Pairing.kept() else { return }
        quietSending = true
        Task {
            if let problem = await register(hub: hub, pairing: pairing, quiet: next) {
                relay = .failed(problem)
            }
            quietSending = false
        }
    }

    /// A real push to this device, sent by the hub through Cawrier.
    public func sendTest() async {
        guard let hub = HubConnection.keptAddress, let pairing = try? Pairing.kept() else { return }
        testSending = true
        testProblem = nil
        testArrived = nil
        testSent = .now
        defer { testSending = false }
        do {
            let answer: Tested = try await Self.post(hub.appending(path: "api/push/test"), TestRequest(pairingId: pairing.id), refused: "The hub")
            if let outcome = answer.outcomes.first(where: { $0.status != 200 }) {
                testProblem = outcome.reason ?? (outcome.status == 0 ? "The hub couldn't reach the relay." : "The relay answered \(outcome.status).")
            }
            log.notice("test sent: \(answer.outcomes.map { "\($0.status)" }.joined(separator: ","), privacy: .public)")
        } catch {
            testProblem = Self.reason(error, from: "The hub")
            log.error("test failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// H5's switch. Off, the reminder already scheduled is taken down now.
    public func setTrialReminder(_ on: Bool) {
        trialReminder = on
        if !on { TrialReminder.cancel() }
    }

    /// H7: the hub unenrols this device from Cawrier (`/api/push/unregister`),
    /// then the pairing and its push key leave the Keychain. Nothing is enrolled again until
    /// the operator turns notifications on, which makes a new pairing.
    public func removeFromRelay() async {
        guard !removing, let hub = HubConnection.keptAddress else { return }
        removing = true
        removeProblem = nil
        defer { removing = false }
        do {
            if let pairing = try? Pairing.kept(existing: true) {
                let answer: Unregistered = try await Self.post(hub.appending(path: "api/push/unregister"), Unregistration(pairingId: pairing.id), refused: "The hub")
                log.notice("removed from the relay through \(hub.absoluteString, privacy: .public): \(answer.removed)")
            }
            try Pairing.forget()
        } catch {
            removeProblem = Self.reason(error, from: "The hub")
            log.error("remove from the relay failed: \(String(describing: error), privacy: .public)")
            return
        }
        removed = true
        registeredWith = nil
        quiet = nil
        relay = .idle
    }

    /// The notification centre showed the hub's test while the app was in front.
    public func heardTest() {
        testArrived = .now
    }

    /// The app forgets `hub`: it stops pushing to this device.
    func leave(_ hub: URL) {
        registeredWith = nil
        quiet = nil
        if relay == .done { relay = .idle }
        guard let pairing = try? Pairing.kept(existing: true) else { return }
        // Now, before the next registration can read it: that one makes a new key.
        do {
            try PushKey.forget(pairingId: pairing.id)
        } catch {
            log.error("push key not deleted: \(String(describing: error), privacy: .public)")
        }
        Task {
            do {
                let answer: Unregistered = try await Self.post(hub.appending(path: "api/push/unregister"), Unregistration(pairingId: pairing.id), refused: "The hub")
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
            await Self.takeDown(delivered: gone)
            log.notice("removed \(gone.count) delivered asks that are over")
        }
    }

    /// Off the main actor, as `TrialReminder`'s changes: the removal is a
    /// synchronous message to the notifications daemon, which a slow daemon
    /// holds the calling thread on.
    @concurrent
    private nonisolated static func takeDown(delivered: [String]) async {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: delivered)
    }

    /// iOS's word on notifications, read again.
    public func readAuthorization() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Registers the pairing with `hub`; `quiet` is sent only from the toggle,
    /// so a launch's registration keeps what the operator set. Nil, or the hub's reason.
    private func register(hub: URL, pairing: Pairing, quiet next: Bool?) async -> String? {
        let key: String
        do {
            key = try PushKey.kept(pairingId: pairing.id).base64
        } catch {
            log.error("push key keychain failed: \(String(describing: error), privacy: .public)")
            return "This device couldn't keep its notification key."
        }
        let body = Registration(pairingId: pairing.id, secret: pairing.secret, key: key, name: UIDevice.current.name, platform: Self.platform, quiet: next)
        do {
            let answer: Registered = try await Self.post(hub.appending(path: "api/push/register"), body, refused: "The hub")
            registeredWith = hub
            quiet = answer.quiet
            log.notice("registered with \(hub.absoluteString, privacy: .public) (\(body.platform, privacy: .public)), quiet \(answer.quiet)")
            return nil
        } catch {
            log.error("register with \(hub.absoluteString, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return Self.reason(error, from: "The hub")
        }
    }

    /// This app's notification settings: iOS's Settings app, or on the Mac
    /// System Settings › Notifications at CawCo's entry.
    public static var settingsURL: URL {
        #if targetEnvironment(macCatalyst)
        URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=dev.cawco.app")!
        #else
        URL(string: UIApplication.openNotificationSettingsURLString)!
        #endif
    }

    static var platform: String {
        #if targetEnvironment(macCatalyst)
        "macos"
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? "ipados" : "ios"
        #endif
    }

    // The hub's routes are hidden from openapi.json, and Cawrier has none, so they are called with URLSession.
    private struct Enrolment: Encodable, Sendable {
        /// `{ kind: "appStore", transaction }`, or `{ kind: "appTransaction", jws }`.
        struct Proof: Encodable, Sendable {
            let kind: String
            let transaction: String?
            let jws: String?

            init(_ proof: EnrolmentProof) {
                switch proof {
                case let .transaction(signed):
                    kind = "appStore"
                    transaction = signed
                    jws = nil
                case let .appTransaction(signed):
                    kind = "appTransaction"
                    transaction = nil
                    jws = signed
                }
            }
        }

        let pairingId: String
        let secret: String
        let deviceToken: String
        let apnsEnvironment: String
        let proof: Proof
    }

    private struct Enrolled: Decodable, Sendable {
        let ok: Bool
    }

    private struct Registration: Encodable, Sendable {
        let pairingId: String
        let secret: String
        /// The push key's 32 bytes, base64 standard and padded.
        let key: String
        let name: String
        let platform: String
        let quiet: Bool?
    }

    private struct Registered: Decodable, Sendable {
        let quiet: Bool
    }

    private struct Unregistration: Encodable, Sendable {
        let pairingId: String
    }

    private struct Unregistered: Decodable, Sendable {
        let removed: Bool
    }

    private struct TestRequest: Encodable, Sendable {
        let pairingId: String
    }

    private struct Tested: Decodable, Sendable {
        struct Outcome: Decodable, Sendable {
            let status: Int
            let reason: String?
        }

        let outcomes: [Outcome]
    }

    /// A refusal, said as the server said it.
    struct Refusal: Error {
        let message: String
    }

    /// The sentence to show for `error`: the server's own, else that `who` couldn't be reached.
    private static func reason(_ error: any Error, from who: String) -> String {
        (error as? Refusal)?.message ?? "\(who) couldn't be reached. Check this device's connection, then try again."
    }

    /// POSTs `body` as JSON. A refusal carries the server's own words, read
    /// the one way (Wire `sentence`): the hub's plain text or problem
    /// `detail`, Cawrier's `{ error }`.
    private static func post<Body: Encodable & Sendable, Answer: Decodable & Sendable>(_ url: URL, _ body: Body, refused who: String) async throws -> Answer {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw Refusal(message: Wire.sentence(data, status: status, from: who)) }
        return try JSONDecoder().decode(Answer.self, from: data)
    }
}

/// The free week's one reminder (DESIGN.md T6, ruling 9, App Review R14): a
/// local notification at 10:00 local time on the day before it ends, scheduled
/// only while the week is live, notifications are allowed and H5 is on.
@MainActor
public enum TrialReminder {
    nonisolated static let kind = "trial-ending"
    private nonisolated static let identifier = "cawco-trial-ending"

    /// One change asked of the notification centre.
    private enum Change: Sendable {
        case add(title: String, body: String, at: DateComponents)
        case remove
    }

    /// The changes, applied off the main actor one at a time in the order they
    /// were asked, so a cancel after a schedule still wins. The centre answers
    /// over XPC, and a slow notifications daemon kept the main thread waiting
    /// on `removePendingNotificationRequests` for minutes: the UI never waits on it.
    private static let changes: AsyncStream<Change>.Continuation = {
        let (stream, continuation) = AsyncStream.makeStream(of: Change.self)
        Task.detached(priority: .utility) {
            for await change in stream {
                await apply(change)
            }
        }
        return continuation
    }()

    /// Schedules the reminder for a live week, or takes it down for anything else.
    /// One identifier, so scheduling again replaces it; a time already past schedules nothing.
    public static func schedule(endsAt: Date?, title: String, body: String) async {
        let push = PushRegistry.shared
        guard let endsAt, push.allowed, push.trialReminder, let fire = fireDate(endsAt: endsAt), fire > .now else {
            cancel()
            return
        }
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        changes.yield(.add(title: title, body: body, at: parts))
    }

    /// Takes the scheduled reminder down: H5 off, Pro bought or restored, the week over.
    public static func cancel() {
        changes.yield(.remove)
    }

    /// The notification centre's own calls, on the concurrent pool.
    @concurrent
    private nonisolated static func apply(_ change: Change) async {
        let center = UNUserNotificationCenter.current()
        switch change {
        case .remove:
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
        case let .add(title, body, parts):
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.userInfo = ["cawco": ["kind": kind]]
            let request = UNNotificationRequest(identifier: identifier, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
            do {
                try await center.add(request)
            } catch {
                Logger(subsystem: "dev.cawco.app", category: "Push").error("trial reminder not scheduled: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// The first 10:00 local at or after 48 h before the end: inside the week's
    /// second-to-last day, so "tomorrow" is the last.
    static func fireDate(endsAt: Date) -> Date? {
        let from = endsAt.addingTimeInterval(-2 * 24 * 60 * 60)
        let calendar = Calendar.current
        guard let ten = calendar.date(bySettingHour: 10, minute: 0, second: 0, of: from) else { return nil }
        return ten >= from ? ten : calendar.date(byAdding: .day, value: 1, to: ten)
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
                ask = ParkedAsk(frame, routedTo: routedTo)
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
