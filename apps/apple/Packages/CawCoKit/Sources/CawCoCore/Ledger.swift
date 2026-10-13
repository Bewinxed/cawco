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
        /// What an applied `send.withdraw` found (`CommandAck.outcome`):
        /// `withdrawn` before the session read the send, `started` after.
        public internal(set) var outcome: String?
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
        var reading = false
        var seen = false
        var subscribed = false
        var resyncAfter: Double?
        var resyncFailures = 0
        var warned = false
    }

    /// One event on a session's stream, read by the protocol's own fields
    /// alone. Its frame is kept as the bytes the hub sent: an absent field and
    /// an explicit null differ in the transcript's partial tail/facts updates,
    /// and what the frame says is the transcript's to read (`applyFrame`).
    struct Event {
        let seq: Double
        let sessionId: String
        let frame: Data

        init?(_ raw: [String: Any]) {
            guard let seq = (raw["seq"] as? NSNumber)?.doubleValue, let sessionId = raw["sessionId"] as? String,
                  let frame = raw["frame"], let bytes = try? JSONSerialization.data(withJSONObject: frame) else { return nil }
            self.seq = seq
            self.sessionId = sessionId
            self.frame = bytes
        }
    }

    public private(set) var commands: [String: Command] = [:]
    @ObservationIgnored var cursors: [String: Cursor] = [:]
    @ObservationIgnored private var effects: [String: Effects] = [:]
    @ObservationIgnored private var sweep: Task<Void, Never>?

    /// Puts one client message on the socket; the reason it could not, or nil.
    @ObservationIgnored var send: (Data) -> String? = { _ in "Not connected to the hub." }
    /// Applies one sequenced frame (a transcript change or a preview's state) to its session.
    @ObservationIgnored var applyFrame: (String, Data) -> Void = { _, _ in }
    /// Re-reads a session's history through the path that already exists.
    @ObservationIgnored var rereadHistory: (String, SessionsStore.ReadCause) -> Void = { _, _ in }
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
        log.info("stream: subscribe \(sessionId.prefix(8), privacy: .public) after \(afterSeq ?? -1)")
        guard dispatch(message) == nil else {
            cursors[sessionId] = cursor
            return
        }
        cursor.subscribed = true
        cursor.resyncAfter = afterSeq
        cursors[sessionId] = cursor
    }

    /// Forgets what is no longer watched, cursor and all. A watched session
    /// is subscribed by the read that adopts its page (`adoptPage`), never
    /// resumed from a cursor across a connection: the hub numbers a session's
    /// stream in memory, from 1 again after it restarts, so a cursor from the
    /// connection before may name events of another hub process.
    func forget(except sessionIds: Set<String>) {
        for id in cursors.keys where !sessionIds.contains(id) {
            cursors[id] = nil
        }
    }

    func beginRead(_ id: String) {
        var cursor = cursors[id] ?? Cursor()
        cursor.reading = true
        cursors[id] = cursor
    }

    func adoptPage(_ id: String, seq: Double) {
        var cursor = cursors[id] ?? Cursor()
        cursor.reading = false
        cursor.seen = true
        cursor.lastSeq = seq
        cursor.resyncFailures = 0
        cursors[id] = cursor
        subscribe(id)
    }

    /// The socket dropped: every subscription and every unanswered command
    /// died with it. The next connection reads each watched transcript again
    /// (`SessionsStore.reconnected`), and that read subscribes it.
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
    ///
    /// ROUTED BY THE PROTOCOL'S OWN FIELDS: a message's `type`, and an
    /// event's `seq` and `sessionId`. What a frame says is never decoded
    /// here: decoded whole, one frame this app could not read (a send's
    /// record it does not draw, a field a newer hub added) failed the whole
    /// message, its seq was never applied, every event after it was a hole,
    /// and the one replay asked for carried the same frame and failed too.
    /// The stream then dropped everything after it, silently, for as long as
    /// the transcript stayed open. A message of a session's stream that still
    /// cannot be read is a read of that session again (`unreadable`), which
    /// the dock says.
    func handle(_ data: Data) {
        guard let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let type = raw["type"] as? String else {
            log.error("stream: unreadable message: \(String(decoding: data.prefix(300), as: UTF8.self), privacy: .public)")
            return
        }
        switch type {
        case "stream.event":
            let event = raw["event"] as? [String: Any]
            guard let read = event.flatMap(Event.init) else {
                unreadable(event?["sessionId"] as? String, type)
                return
            }
            apply(read)
        case "stream.backlog":
            let events = raw["events"] as? [[String: Any]]
            let read = events?.compactMap(Event.init)
            guard let sessionId = raw["sessionId"] as? String, let read, read.count == events?.count else {
                unreadable(raw["sessionId"] as? String, type)
                return
            }
            apply(backlog: read, of: sessionId)
        case "stream.reset":
            guard let sessionId = raw["sessionId"] as? String else {
                unreadable(nil, type)
                return
            }
            reset(sessionId, nextSeq: (raw["nextSeq"] as? NSNumber)?.doubleValue)
        case "command.ack":
            do {
                let ack = try Wire.decoder().decode(Components.Schemas.CommandAck.self, from: data)
                guard commands[ack.commandId] != nil else {
                    return
                }
                advance(ack.commandId, to: Stage(rawValue: ack.stage.rawValue) ?? .failed, reason: ack.reason,
                        outcome: ack.outcome?.rawValue)
            } catch {
                log.error("stream: unreadable command.ack: \(String(describing: error), privacy: .public)")
            }
        default:
            log.error("stream: unknown message type \(type, privacy: .public)")
        }
    }

    /// A message of a session's stream that cannot be read: the events it
    /// carried can never be applied, so the history is read again, as a
    /// broken replay is. One that names no session names nothing to read.
    private func unreadable(_ sessionId: String?, _ type: String) {
        guard let sessionId else {
            log.error("stream: unreadable \(type, privacy: .public) naming no session")
            return
        }
        log.error("stream: unreadable \(type, privacy: .public) for \(sessionId.prefix(8), privacy: .public): read again")
        var cursor = cursors[sessionId] ?? Cursor()
        cursor.reading = true
        cursor.resyncAfter = nil
        cursor.resyncFailures = 0
        cursors[sessionId] = cursor
        rereadHistory(sessionId, .streamUnreadable)
    }

    private func apply(_ event: Event) {
        var cursor = cursors[event.sessionId] ?? Cursor()
        let session = event.sessionId.prefix(8)
        guard !cursor.reading else {
            log.debug("stream: \(session, privacy: .public) seq \(event.seq) dropped while reading")
            return
        }
        // No origin yet: the hub's first word is the origin.
        if !cursor.seen {
            cursor.lastSeq = event.seq - 1
        }
        if event.seq <= cursor.lastSeq {
            log.debug("stream: \(session, privacy: .public) seq \(event.seq) duplicate, at \(cursor.lastSeq)")
            cursors[event.sessionId] = cursor
            return
        }
        if event.seq > cursor.lastSeq + 1 {
            log.info("stream: \(session, privacy: .public) seq \(event.seq) past a hole, at \(cursor.lastSeq)")
            cursors[event.sessionId] = cursor
            resync(event.sessionId)
            return
        }
        log.debug("stream: \(session, privacy: .public) seq \(event.seq) applied")
        applyEvent(event, to: &cursor)
        cursors[event.sessionId] = cursor
    }

    private func applyEvent(_ event: Event, to cursor: inout Cursor) {
        applyFrame(event.sessionId, event.frame)
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
        log.info("stream: resync \(sessionId.prefix(8), privacy: .public) after \(cursor.lastSeq)")
        guard dispatch(message) == nil else {
            return
        }
        cursor.subscribed = true
        cursor.resyncAfter = cursor.lastSeq
        cursors[sessionId] = cursor
    }

    private func apply(backlog events: [Event], of sessionId: String) {
        var cursor = cursors[sessionId] ?? Cursor()
        log.info("stream: backlog for \(sessionId.prefix(8), privacy: .public): \(events.count) events from \(events.first?.seq ?? -1), at \(cursor.lastSeq)\(cursor.reading ? ", dropped while reading" : "", privacy: .public)")
        guard !cursor.reading else { return }
        cursor.subscribed = true
        guard let first = events.first else {
            cursor.resyncAfter = nil
            cursor.resyncFailures = 0
            cursors[sessionId] = cursor
            return
        }
        if !cursor.seen {
            cursor.lastSeq = first.seq - 1
        }
        var broken = false
        for event in events where event.seq > cursor.lastSeq {
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
            cursors[sessionId] = cursor
            return
        }
        if !cursor.warned {
            cursor.warned = true
            log.error("stream: non-contiguous backlog for \(sessionId, privacy: .public) after \(cursor.lastSeq)")
        }
        cursor.resyncFailures += 1
        cursor.resyncAfter = nil
        if cursor.resyncFailures >= Self.maxResyncAttempts {
            // The ring cannot heal this: read the truth, as a reset would.
            cursor.resyncFailures = 0
            cursor.reading = true
            cursors[sessionId] = cursor
            rereadHistory(sessionId, .backlogBroken)
            return
        }
        cursors[sessionId] = cursor
        resync(sessionId)
    }

    private func reset(_ sessionId: String, nextSeq: Double?) {
        var cursor = cursors[sessionId] ?? Cursor()
        cursor.reading = true
        cursor.subscribed = true
        cursor.resyncAfter = nil
        cursor.resyncFailures = 0
        cursor.warned = false
        cursors[sessionId] = cursor
        log.info("stream: reset for \(sessionId.prefix(8), privacy: .public), next seq \(nextSeq ?? -1)")
        rereadHistory(sessionId, .streamReset)
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
        effects: Effects = Effects(),
        commandId: String = UUID().uuidString.lowercased()
    ) -> String {
        let id = commandId
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

    /// Waits for the protocol's terminal acknowledgement, preserving the observable command record.
    public func execute(kind: Components.Schemas.CommandKind, sessionId: String, machineId: String,
                        payload: (String) throws -> OpenAPIValueContainer) async throws -> Command {
        try Task.checkCancellation()
        let id = UUID().uuidString.lowercased()
        let body = try payload(id)
        return try await withCheckedThrowingContinuation { continuation in
            submit(kind: kind, sessionId: sessionId, machineId: machineId, payload: body,
                   settlesAt: kind == .send ? .accepted : .applied,
                   effects: Effects(settled: { [unowned self] stage, reason in
                       if stage == .failed {
                           continuation.resume(throwing: HubConnection.ControlError(message: reason ?? "The command failed."))
                       } else if let command = commands[id] {
                           continuation.resume(returning: command)
                       }
                   }), commandId: id)
        }
    }

    /// Which stage may follow which. Terminal is terminal.
    private static let next: [Stage: Set<Stage>] = [
        .submitted: [.accepted, .applied, .failed],
        .accepted: [.applied, .failed],
        .applied: [],
        .failed: [],
    ]

    private func advance(_ id: String, to stage: Stage, reason: String?, outcome: String? = nil) {
        guard var record = commands[id], Self.next[record.stage]?.contains(stage) == true else {
            return
        }
        record.stage = stage
        record.changedAt = clock.now
        if let reason {
            record.reason = reason
        }
        // Recorded before the settle runs, so it reads it (the web's `commandRecord(id)?.outcome`).
        if let outcome {
            record.outcome = outcome
        }
        commands[id] = record
        log.notice("command \(id, privacy: .public) \(record.kind.rawValue, privacy: .public) on \(record.sessionId, privacy: .public): \(stage.rawValue, privacy: .public)")
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
