public import CawCoAPI
import Foundation
import Observation
import OpenAPIRuntime
import OSLog

/// The Ledger Protocol, client side: the rules of packages/core/src/stream.ts
/// as the dashboard's apps/dashboard/src/lib/cawco/stream.ts enforces them.
///
/// - A session's events apply exactly once, in order, with no holes. A delta
///   one past the cursor applies; one at or behind it is a duplicate and is
///   dropped; one beyond it is a hole: nothing is buffered or applied, and the
///   session is re-subscribed with `afterSeq` = what it actually has.
/// - A backlog is checked, not trusted: contiguous from the cursor, or the
///   contiguous prefix is kept and the rest asked for again; after
///   `maxResyncAttempts` the history is re-read instead.
/// - `stream.reset` is the hub saying the gap is older than its ring: the
///   cursor moves to `nextSeq - 1` and the history is re-read.
/// - A command is a transaction whose stage only moves forward, from
///   `submitted` to the hub's `accepted`/`applied`/`failed`, and is called off
///   when nothing answers it in `commandAckTimeout`.
@MainActor
@Observable
public final class Ledger {
    public static let commandAckTimeout: Duration = .seconds(15)
    static let settledLimit = 50
    static let settledTTL: Duration = .seconds(5 * 60)
    static let maxResyncAttempts = 3

    public enum Stage: String, Sendable {
        case submitted, accepted, applied, failed
    }

    /// Where a kind's protocol stops talking: `accepted` for `send`, `applied`
    /// for the control kinds (`packages/hub/src/stream.ts`, `command()`).
    public enum SettleStage: Sendable {
        case accepted, applied
    }

    /// One operator action, from the press to the hub's last word on it.
    public struct Command: Identifiable, Sendable {
        public let id: String
        public let kind: Components.Schemas.CommandKind
        public let sessionId: String
        public let settlesAt: SettleStage
        public internal(set) var stage: Stage = .submitted
        public internal(set) var reason: String?
        /// Known never to have left this device: safe to offer again.
        public internal(set) var undelivered = false
        let at: ContinuousClock.Instant
        var changedAt: ContinuousClock.Instant

        var isSettled: Bool {
            stage == .failed || stage == .applied || (stage == .accepted && settlesAt == .accepted)
        }
    }

    /// The local half of a command: run once when it goes out, once when it settles.
    public struct Effects {
        public var submitted: (() -> Void)?
        public var settled: ((Stage, String?) -> Void)?

        public init(submitted: (() -> Void)? = nil, settled: ((Stage, String?) -> Void)? = nil) {
            self.submitted = submitted
            self.settled = settled
        }
    }

    struct Cursor {
        var lastSeq = 0.0
        var seen = false
        var subscribed = false
        var resyncAfter: Double?
        var resyncFailures = 0
        var warned = false
    }

    public private(set) var commands: [String: Command] = [:]
    @ObservationIgnored var cursors: [String: Cursor] = [:]
    @ObservationIgnored private var effects: [String: Effects] = [:]
    @ObservationIgnored private var sweep: Task<Void, Never>?

    /// Puts one client message on the socket; the reason it could not, or nil.
    @ObservationIgnored var send: (Data) -> String? = { _ in "Not connected to the hub." }
    /// Applies one sequenced frame (its JSON) to the session it belongs to.
    @ObservationIgnored var applyFrame: (String, Data) -> Void = { _, _ in }
    /// Re-reads a session's history through the path that already exists.
    @ObservationIgnored var rereadHistory: (String) -> Void = { _ in }
    /// Heard exactly once for every command that reaches `failed`.
    @ObservationIgnored var noteFailure: (Command) -> Void = { _ in }

    private let log = Logger(subsystem: "dev.cawco.app", category: "Ledger")
    private let clock = ContinuousClock()

    init() {}

    // MARK: Subscriptions

    private func dispatch(_ message: some Encodable) -> String? {
        do {
            return send(try Wire.encoder().encode(message))
        } catch {
            return String(describing: error)
        }
    }

    /// A resume when this device has a cursor, a fresh join when it does not.
    func subscribe(_ sessionId: String) {
        var cursor = cursors[sessionId] ?? Cursor()
        let afterSeq = cursor.seen ? cursor.lastSeq : nil
        let message = Components.Schemas.StreamSubscribe(afterSeq: afterSeq, sessionId: sessionId, _type: .stream_subscribe)
        guard dispatch(message) == nil else {
            cursors[sessionId] = cursor
            return
        }
        cursor.subscribed = true
        cursor.resyncAfter = afterSeq
        cursors[sessionId] = cursor
    }

    /// Subscribes what is new and forgets what is no longer watched, cursor and all.
    func sync(_ sessionIds: Set<String>) {
        for id in cursors.keys where !sessionIds.contains(id) {
            cursors[id] = nil
        }
        for id in sessionIds where cursors[id]?.subscribed != true {
            subscribe(id)
        }
    }

    /// The socket dropped: cursors keep `lastSeq`, every subscription and
    /// every unanswered command died with it.
    func noteDisconnect() {
        for id in cursors.keys {
            cursors[id]?.subscribed = false
            cursors[id]?.resyncAfter = nil
        }
        for id in commands.keys where commands[id]?.isSettled == false {
            advance(id, to: .failed, reason: "The connection to the hub dropped before that finished.")
        }
        arm()
    }

    // MARK: Ingestion

    /// Takes one Ledger Protocol message off the socket.
    func handle(_ data: Data) {
        let decoder = Wire.decoder()
        do {
            if let delta = try? decoder.decode(Components.Schemas.StreamDelta.self, from: data) {
                apply(delta.event)
            } else if let backlog = try? decoder.decode(Components.Schemas.StreamBacklog.self, from: data) {
                apply(backlog)
            } else if let reset = try? decoder.decode(Components.Schemas.StreamReset.self, from: data) {
                apply(reset)
            } else {
                let ack = try decoder.decode(Components.Schemas.CommandAck.self, from: data)
                guard commands[ack.commandId] != nil else {
                    return
                }
                advance(ack.commandId, to: Stage(rawValue: ack.stage.rawValue) ?? .failed, reason: ack.reason)
            }
        } catch {
            log.error("stream: unreadable message: \(String(describing: error), privacy: .public)")
        }
    }

    private func apply(_ event: Components.Schemas.SessionStreamEvent) {
        var cursor = cursors[event.sessionId] ?? Cursor()
        // No origin yet: the hub's first word is the origin.
        if !cursor.seen {
            cursor.lastSeq = event.seq - 1
        }
        if event.seq <= cursor.lastSeq {
            cursors[event.sessionId] = cursor
            return
        }
        if event.seq > cursor.lastSeq + 1 {
            cursors[event.sessionId] = cursor
            resync(event.sessionId)
            return
        }
        applyEvent(event, to: &cursor)
        cursors[event.sessionId] = cursor
    }

    private func applyEvent(_ event: Components.Schemas.SessionStreamEvent, to cursor: inout Cursor) {
        if let data = try? Wire.data(event.frame) {
            applyFrame(event.sessionId, data)
        } else if !cursor.warned {
            cursor.warned = true
            log.error("stream: an event arrived with no frame for \(event.sessionId, privacy: .public) at \(event.seq)")
        }
        cursor.lastSeq = event.seq
        cursor.seen = true
        cursor.subscribed = true
    }

    /// Asks for the replay, once per hole.
    private func resync(_ sessionId: String) {
        guard var cursor = cursors[sessionId], cursor.resyncAfter != cursor.lastSeq else {
            return
        }
        let message = Components.Schemas.StreamSubscribe(afterSeq: cursor.lastSeq, sessionId: sessionId, _type: .stream_subscribe)
        guard dispatch(message) == nil else {
            return
        }
        cursor.subscribed = true
        cursor.resyncAfter = cursor.lastSeq
        cursors[sessionId] = cursor
    }

    private func apply(_ backlog: Components.Schemas.StreamBacklog) {
        var cursor = cursors[backlog.sessionId] ?? Cursor()
        cursor.subscribed = true
        guard let first = backlog.events.first else {
            cursor.resyncAfter = nil
            cursor.resyncFailures = 0
            cursors[backlog.sessionId] = cursor
            return
        }
        if !cursor.seen {
            cursor.lastSeq = first.seq - 1
        }
        var broken = false
        for event in backlog.events where event.seq > cursor.lastSeq {
            guard event.seq == cursor.lastSeq + 1 else {
                broken = true
                break
            }
            applyEvent(event, to: &cursor)
        }
        guard broken else {
            cursor.resyncAfter = nil
            cursor.resyncFailures = 0
            cursor.warned = false
            cursors[backlog.sessionId] = cursor
            return
        }
        if !cursor.warned {
            cursor.warned = true
            log.error("stream: non-contiguous backlog for \(backlog.sessionId, privacy: .public) after \(cursor.lastSeq)")
        }
        cursor.resyncFailures += 1
        cursor.resyncAfter = nil
        if cursor.resyncFailures >= Self.maxResyncAttempts {
            // The ring cannot heal this: read the truth, as a reset would.
            cursor.resyncFailures = 0
            cursor.seen = false
            cursors[backlog.sessionId] = cursor
            rereadHistory(backlog.sessionId)
            subscribe(backlog.sessionId)
            return
        }
        cursors[backlog.sessionId] = cursor
        resync(backlog.sessionId)
    }

    private func apply(_ reset: Components.Schemas.StreamReset) {
        var cursor = cursors[reset.sessionId] ?? Cursor()
        cursor.lastSeq = reset.nextSeq - 1
        cursor.seen = true
        cursor.subscribed = true
        cursor.resyncAfter = nil
        cursor.resyncFailures = 0
        cursor.warned = false
        cursors[reset.sessionId] = cursor
        rereadHistory(reset.sessionId)
    }

    // MARK: Commands

    /// Submits one operator action as a tracked transaction and returns its
    /// id. Never throws: the stage is the report.
    @discardableResult
    public func submit(
        kind: Components.Schemas.CommandKind,
        sessionId: String,
        machineId: String,
        payload: OpenAPIValueContainer,
        settlesAt: SettleStage,
        effects: Effects = Effects()
    ) -> String {
        let id = UUID().uuidString.lowercased()
        let now = clock.now
        commands[id] = Command(id: id, kind: kind, sessionId: sessionId, settlesAt: settlesAt, at: now, changedAt: now)
        self.effects[id] = effects
        effects.submitted?()
        let envelope = Components.Schemas.CommandEnvelope(
            commandId: id, kind: kind, machineId: machineId, payload: payload, sessionId: sessionId, _type: .command
        )
        if let refusal = dispatch(envelope) {
            commands[id]?.undelivered = true
            advance(id, to: .failed, reason: refusal)
        }
        sweepCommands()
        return id
    }

    /// Which stage may follow which. Terminal is terminal.
    private static let next: [Stage: Set<Stage>] = [
        .submitted: [.accepted, .applied, .failed],
        .accepted: [.applied, .failed],
        .applied: [],
        .failed: [],
    ]

    private func advance(_ id: String, to stage: Stage, reason: String?) {
        guard var record = commands[id], Self.next[record.stage]?.contains(stage) == true else {
            return
        }
        record.stage = stage
        record.changedAt = clock.now
        if let reason {
            record.reason = reason
        }
        commands[id] = record
        if record.isSettled, let settled = effects.removeValue(forKey: id)?.settled {
            settled(stage, record.reason)
        }
        if stage == .failed {
            noteFailure(record)
        }
    }

    /// Calls off commands nothing answered and keeps the settled ones bounded.
    private func sweepCommands() {
        let now = clock.now
        var settled: [Command] = []
        for (id, record) in commands {
            if !record.isSettled {
                if now - record.at >= Self.commandAckTimeout {
                    advance(id, to: .failed, reason: "The hub never acknowledged that.")
                    if let failed = commands[id] {
                        settled.append(failed)
                    }
                }
                continue
            }
            if now - record.changedAt >= Self.settledTTL {
                commands[id] = nil
                effects[id] = nil
                continue
            }
            settled.append(record)
        }
        if settled.count > Self.settledLimit {
            for record in settled.sorted(by: { $0.changedAt < $1.changedAt }).prefix(settled.count - Self.settledLimit) {
                commands[record.id] = nil
            }
        }
        arm()
    }

    /// One timer, aimed at the nearest deadline of a command still out.
    private func arm() {
        sweep?.cancel()
        let due = commands.values.filter { !$0.isSettled }.map { $0.at + Self.commandAckTimeout }.min()
        guard let due else {
            sweep = nil
            return
        }
        sweep = Task { [weak self] in
            try? await Task.sleep(until: due, clock: .continuous)
            guard !Task.isCancelled else {
                return
            }
            self?.sweepCommands()
        }
    }

    /// The newest command of one kind on one session.
    public func latest(_ kind: Components.Schemas.CommandKind, on sessionId: String) -> Command? {
        commands.values.filter { $0.sessionId == sessionId && $0.kind == kind }.max { $0.at < $1.at }
    }
}
