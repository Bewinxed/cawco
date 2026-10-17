public import CawCoAPI
public import Foundation
public import OpenAPIRuntime

/// The hub's JSON, read and written the one way every hub client does: dates
/// as `Date.toISOString()` writes them, milliseconds included.
public enum Wire {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = parseDate(text) {
                return date
            }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "not an ISO 8601 date: \(text)"))
        }
        return decoder
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true)))
        }
        return encoder
    }

    static func parseDate(_ text: String) -> Date? {
        if let date = try? Date(text, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
            return date
        }
        return try? Date(text, strategy: .iso8601)
    }

    /// One generated wire type read as another of the same JSON: the REST
    /// routes and the socket name the same row with two generated types.
    /// Read as every hub message is (`lossy`): a row the other type refuses is left out.
    static func transcode<Out: Decodable>(_ value: some Encodable, as _: Out.Type = Out.self) throws -> Out {
        try lossy(Out.self, from: encoder().encode(value))
    }

    /// The bytes of an untyped payload (a frame inside an envelope or a stream event).
    static func data(_ container: OpenAPIValueContainer) throws -> Data {
        try encoder().encode(container)
    }

    /// A refusal's own words, read as the dashboard reads them (hub-read.ts
    /// `hubFailure`): a problem's `detail` (a schema refusal is
    /// application/problem+json, `{ detail: "must have required properties
    /// pairingId, secret" }`), an `error` (the api proxy's, Cawrier's), the
    /// problem's `title`, else the text; "<who> answered <status>." when it
    /// wrote none.
    static func sentence(_ data: Data, status: Int, from who: String = "The hub") -> String {
        words(data) ?? "\(who) answered \(status)."
    }

    static func sentence(_ body: HTTPBody, status: Int) async throws -> String {
        sentence(try await Data(collecting: body, upTo: 64_000), status: status)
    }

    /// A refusal's own words (`sentence`'s reading), nil when it wrote none.
    static func words(_ data: Data) -> String? {
        let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("{"), let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["detail", "error", "title"] {
                if let said = body[key] as? String, !said.isEmpty { return said }
            }
        }
        return text.isEmpty ? nil : text
    }

    /// Why the hub refused, as one sentence a person reads, without its
    /// closing stop (hub-read.ts `failureReason`): the refusal's own words
    /// (`words`: a JSON error's `detail`, `error` or `title`, else the text)
    /// when their first line is a short sentence of prose, else what the
    /// status says ("The hub answered 502"). Never more than one sentence,
    /// never a body as it came: a stack, a dump or a page of markup is not a
    /// reason. Longer than 160 characters, two lines of a toast, it is not one.
    /// A thrown error's label ("Error:", "TypeError:") is the runtime's name
    /// for the throw, not a word of the reason: it is taken off, so the
    /// sentence says what happened (WORDS.md, "Error formula": "A technical
    /// code alone is banned … the plain-language what-happened").
    static func reason(_ data: Data, status: Int) -> String {
        let line = (words(data) ?? "").split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        var sentence = line.trimmingCharacters(in: .whitespaces)
            .replacing(/^[A-Za-z]*(?:[Ee]rror|[Ee]xception):\s*/, with: "", maxReplacements: 1)
        if let end = sentence.firstMatch(of: /[.!?](?=\s|$)/) { sentence = String(sentence[..<end.range.upperBound]) }
        if sentence.hasSuffix(".") { sentence.removeLast() }
        guard !sentence.isEmpty, sentence.count <= 160, let first = sentence.first, !"<{[".contains(first) else {
            return "The hub answered \(status)"
        }
        return first.uppercased() + sentence.dropFirst()
    }

    /// The words of an answer the generated client did not expect, when it has a body.
    public static func words(_ body: HTTPBody?) async -> String? {
        guard let body, let data = try? await Data(collecting: body, upTo: 64_000) else { return nil }
        return words(data)
    }

    /// A problem the generated client decoded (a schema refusal), read for its words.
    public static func words(problem: some Encodable) -> String? {
        (try? encoder().encode(problem)).flatMap(words)
    }
}

/// A date the generated types carry as `Date`, string or a number of
/// milliseconds: as ms epoch, 0 when absent.
func epochMs(_ date: Date?, _ text: String?, _ number: Double? = nil) -> Double {
    if let date {
        return date.timeIntervalSince1970 * 1000
    }
    if let text, let date = Wire.parseDate(text) {
        return date.timeIntervalSince1970 * 1000
    }
    return number ?? 0
}

extension Components.Schemas.InstanceRow {
    /// When the hub last moved the row, ms epoch (0 when it never said).
    var updatedMs: Double { epochMs(updatedAt?.value1, updatedAt?.value2, updatedAt?.value3) }
    /// When the owner last looked at it or archived it, on any device, ms epoch.
    var seenMs: Double { epochMs(seenAt?.value1, seenAt?.value2, seenAt?.value3) }
    /// When its latest turn ended, on the hub's clock as `seenMs` is, ms epoch (0 when it never did).
    var turnEndedMs: Double { epochMs(turnEndedAt?.value1, turnEndedAt?.value2, turnEndedAt?.value3) }
}

/// One socket message, as the hub's two dialects put it on `/ws/dashboard`: a
/// Ledger Protocol message (`type`), or an envelope (`verb`) whose `frames`
/// payload is a `FramePayload`.
enum Inbound {
    case stream(Data)
    case frame(Frame)
    /// `{ type: "notificationsCleared", collapseIds }`: notifications cleared
    /// on another device, which this one removes (`NotificationSync`).
    case notificationsCleared([String])
    /// A followed session's plan, whole or changed (`plan.snapshot`, `plan.delta`).
    case plan(Data)
    case other

    private struct Cleared: Decodable {
        let collapseIds: [String]
    }

    /// What every message is routed on: the protocol's discriminators.
    private struct Route: Decodable {
        let type: String?
        let verb: String?
        /// The request an envelope answers. A failure the hub writes itself (a
        /// refused spawn, a machine that is not connected) names its request
        /// here and nowhere in its payload (server.ts `failure`).
        let requestId: String?
        /// The machine the envelope is from: an ask's is where the hub parked
        /// it, which its answer names (a memory proposal's is "hub").
        let machineId: String?
    }

    /// A frame's own discriminators, and the structural fields the hub adds
    /// outside the frame types (client.svelte.ts reads them the same way).
    /// Content is read only through the generated types.
    fileprivate struct PayloadRoute: Decodable {
        /// A delegate's ask the hub sent to its parent.
        let routedTo: String?
        /// A workflow run's question, answered in its run.
        let workflowRunId: String?
        /// Board metadata uses the generated build type, just as each agent row does.
        let hubBuild: Components.Schemas.BuildInfo?
    }

    private struct Envelope<Payload: Decodable>: Decodable {
        let payload: Payload
    }

    /// The hub's now-state for every session it lists, riding each board frame.
    private struct Pulses: Decodable {
        let pulses: [String: Components.Schemas.SessionPulse]?
    }

    /// The pulses a board frame carries, when it carries any.
    static func pulses(_ data: Data, enveloped: Bool) -> [String: Components.Schemas.SessionPulse] {
        let read = enveloped
            ? (try? Wire.lossy(Envelope<Pulses>.self, from: data))?.payload
            : try? Wire.lossy(Pulses.self, from: data)
        return read?.pulses ?? [:]
    }

    private static let streamTypes: Set<String> = ["stream.event", "stream.backlog", "stream.reset", "command.ack"]

    /// Every typed read here is `Wire.lossy`: what this app cannot read in a
    /// frame (one preview, one row) is left out of it, and the frame is read.
    static func read(_ data: Data) throws -> Inbound {
        let route = try Wire.lossy(Route.self, from: data)
        if let type = route.type, streamTypes.contains(type) {
            return .stream(data)
        }
        if route.type == "notificationsCleared" {
            return .notificationsCleared(try Wire.lossy(Cleared.self, from: data).collapseIds)
        }
        if route.type == "plan.snapshot" || route.type == "plan.delta" {
            return .plan(data)
        }
        guard route.verb == "frames" else {
            return .other
        }
        let peek = try Wire.lossy(Envelope<PayloadRoute>.self, from: data).payload
        let payload = try Wire.lossy(Envelope<Components.Schemas.FramePayload>.self, from: data).payload
        return .frame(Frame(payload, peek, answering: route.requestId, machineId: route.machineId ?? ""))
    }

    /// A frame payload on its own (a `/api/pending` envelope's payload), from
    /// the envelope's `machineId`.
    static func frame(_ data: Data, machineId: String) throws -> Frame {
        let peek = try Wire.lossy(PayloadRoute.self, from: data)
        return Frame(try Wire.lossy(Components.Schemas.FramePayload.self, from: data), peek, answering: nil, machineId: machineId)
    }
}

/// A session's parked ask as the hub sends it (`permission_request`).
typealias AskFrame = Components.Schemas.PermissionRequestFrame

/// A `FramePayload` by its named kind. Generated cases use the existing `kind`
/// discriminator, so inserting or reordering another frame cannot rename one.
enum Frame {
    case instances(Components.Schemas.InstancesFrame, hubBuild: Components.Schemas.BuildInfo?)
    case instancesDelta(Components.Schemas.InstancesDeltaFrame, hubBuild: Components.Schemas.BuildInfo?)
    /// An ask, where the hub routed it (`parent`: its delegate's parent
    /// answers), and the machine its envelope names, which its answer names.
    case permissionRequest(AskFrame, routedTo: String?, machineId: String)
    /// An ask is over, whoever settled it.
    case permissionSettled(Components.Schemas.PermissionSettledFrame)
    /// A workflow run's question: answered in its run, never parked as a session's ask.
    case runQuestion(runId: String, raisedAt: Double?)
    case usage(Components.Schemas.UsageFrame)
    case controlResult(Components.Schemas.ControlResultFrame)
    case error(requestId: String?, message: String)
    case pulse(Components.Schemas.PulseFrame)
    case workflow(Components.Schemas.WorkflowFrame)
    /// A delegate's work item changed: its parent's tray reads it.
    case workItem(Components.Schemas.WorkItemSummary)
    /// A Caw thread started, or its last message or status changed.
    case threadUpsert(ThreadSummary)
    /// A message added to a Caw thread; nil when it does not read as one.
    case threadMessage(ThreadNote?)
    /// A session's preview opened, changed or closed.
    case preview(Components.Schemas.PreviewFrame)
    /// Every project move the hub is carrying, whole, on each change.
    case moves([Components.Schemas.MoveJob])
    /// A project's tasks changed, by anyone: whatever shows them reads them again.
    case tasksChanged(projectId: String)
    /// The projects changed (one made, renamed or forgotten, a place come or gone): read them again.
    case projectsChanged
    /// One session a forget asked to stop: stopped as its machine confirmed, refused, or owed to its machine's return.
    case projectStop(Components.Schemas.ProjectStopFrame)
    /// Every open fleet-watch notice, whole, on each change: a session fleet watch tells you about.
    case watchNotices([Components.Schemas.FleetWatchNotice])
    /// Every approved action waiting on you, whole, on each change.
    case actions([Components.Schemas.ApprovedActionView])
    /// Every system law the hub caught broken since it started, whole, on each break (core invariant.ts).
    case lawsBroken([Components.Schemas.LawBroken])
    /// The fleet's upstream answer was given or changed, anywhere: Needs you stops asking.
    case fleetUpstream(Components.Schemas.FleetChoicesUpstream)
    case ignored

    /// `answering`: the envelope's own `requestId`, which an error frame takes
    /// when its payload names none (client.svelte.ts reads it the same way).
    /// `machineId`: the envelope's.
    fileprivate init(_ payload: Components.Schemas.FramePayload, _ peek: Inbound.PayloadRoute, answering: String?, machineId: String) {
        switch payload {
        case .instances(let frame):
            self = .instances(frame, hubBuild: peek.hubBuild)
        case .instancesDelta(let frame):
            self = .instancesDelta(frame, hubBuild: peek.hubBuild)
        case .permissionRequest(let frame):
            if let runId = peek.workflowRunId {
                self = .runQuestion(runId: runId, raisedAt: frame.raisedAt)
            } else {
                self = .permissionRequest(frame, routedTo: peek.routedTo, machineId: machineId)
            }
        case .permissionSettled(let frame):
            self = .permissionSettled(frame)
        case .usage(let frame):
            self = .usage(frame)
        case .controlResult(let frame):
            self = .controlResult(frame)
        case .error(let frame):
            self = .error(requestId: frame.requestId ?? answering, message: frame.message)
        case .pulse(let frame):
            self = .pulse(frame)
        case .workflow(let frame):
            self = .workflow(frame)
        case .workItem(let frame):
            self = .workItem(frame.item)
        case .thread_upsert(let frame):
            self = .threadUpsert(frame.thread)
        case .thread_message(let frame):
            self = .threadMessage(ThreadNote.read(frame.message))
        case .preview(let frame):
            self = .preview(frame)
        case .moves(let frame):
            self = .moves(frame.moves)
        case .tasks_changed(let frame):
            self = .tasksChanged(projectId: frame.projectId)
        case .projects_changed:
            self = .projectsChanged
        case .project_stop(let frame):
            self = .projectStop(frame)
        case .fleetWatch_notices(let frame):
            self = .watchNotices(frame.notices)
        case .actions(let frame):
            self = .actions(frame.actions)
        case .laws_broken(let frame):
            self = .lawsBroken(frame.broken)
        case .fleet_upstream(let frame):
            self = .fleetUpstream(frame.upstream)
        default:
            self = .ignored
        }
    }
}
