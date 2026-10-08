public import CawCoAPI
public import Foundation
import OpenAPIRuntime

/// The hub's JSON, read and written the one way every hub client does: dates
/// as `Date.toISOString()` writes them, milliseconds included.
enum Wire {
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
    static func transcode<Out: Decodable>(_ value: some Encodable, as _: Out.Type = Out.self) throws -> Out {
        try decoder().decode(Out.self, from: encoder().encode(value))
    }

    /// The bytes of an untyped payload (a frame inside an envelope or a stream event).
    static func data(_ container: OpenAPIValueContainer) throws -> Data {
        try encoder().encode(container)
    }

    /// A refusal's own sentence, or "The hub answered <status>." when it
    /// wrote none (workflows.ts `request`: `text || The hub answered …`).
    static func sentence(_ body: HTTPBody, status: Int) async throws -> String {
        let text = try await String(collecting: body, upTo: 64_000)
        return text.isEmpty ? "The hub answered \(status)." : text
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
}

/// One socket message, as the hub's two dialects put it on `/ws/dashboard`: a
/// Ledger Protocol message (`type`), or an envelope (`verb`) whose `frames`
/// payload is a `FramePayload`.
enum Inbound {
    case stream(Data)
    case frame(Frame)
    case other

    /// What every message is routed on: the protocol's discriminators.
    private struct Route: Decodable {
        let type: String?
        let verb: String?
        /// The request an envelope answers. A failure the hub writes itself (a
        /// refused spawn, a machine that is not connected) names its request
        /// here and nowhere in its payload (server.ts `failure`).
        let requestId: String?
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
        let decoder = Wire.decoder()
        let read = enveloped
            ? (try? decoder.decode(Envelope<Pulses>.self, from: data))?.payload
            : try? decoder.decode(Pulses.self, from: data)
        return read?.pulses ?? [:]
    }

    private static let streamTypes: Set<String> = ["stream.event", "stream.backlog", "stream.reset", "command.ack"]

    static func read(_ data: Data) throws -> Inbound {
        let decoder = Wire.decoder()
        let route = try decoder.decode(Route.self, from: data)
        if let type = route.type, streamTypes.contains(type) {
            return .stream(data)
        }
        guard route.verb == "frames" else {
            return .other
        }
        let peek = try decoder.decode(Envelope<PayloadRoute>.self, from: data).payload
        let payload = try decoder.decode(Envelope<Components.Schemas.FramePayload>.self, from: data).payload
        return .frame(Frame(payload, peek, answering: route.requestId))
    }

    /// A frame payload on its own (a `/api/pending` envelope's payload).
    static func frame(_ data: Data) throws -> Frame {
        let decoder = Wire.decoder()
        let peek = try decoder.decode(PayloadRoute.self, from: data)
        return Frame(try decoder.decode(Components.Schemas.FramePayload.self, from: data), peek, answering: nil)
    }
}

/// A session's parked ask as the hub sends it (`permission_request`).
typealias AskFrame = Components.Schemas.PermissionRequestFrame

/// A `FramePayload` by its named kind. Generated cases use the existing `kind`
/// discriminator, so inserting or reordering another frame cannot rename one.
enum Frame {
    case instances(Components.Schemas.InstancesFrame, hubBuild: Components.Schemas.BuildInfo?)
    case instancesDelta(Components.Schemas.InstancesDeltaFrame, hubBuild: Components.Schemas.BuildInfo?)
    /// A session's ask, and where the hub routed it (`parent`: its delegate's parent answers).
    case permissionRequest(AskFrame, routedTo: String?)
    /// An ask is over, whoever settled it.
    case permissionSettled(Components.Schemas.PermissionSettledFrame)
    /// A workflow run's question: answered in its run, never parked as a session's ask.
    case runQuestion(runId: String, raisedAt: Double?)
    case usage(Components.Schemas.UsageFrame)
    case controlResult(Components.Schemas.ControlResultFrame)
    case error(requestId: String?, message: String)
    case pulse(Components.Schemas.PulseFrame)
    case supervisorEvent(Components.Schemas.SupervisorEvent)
    case workflow(Components.Schemas.WorkflowFrame)
    /// A delegate's work item changed: its parent's tray reads it.
    case workItem(Components.Schemas.WorkItemSummary)
    /// A Caw thread's row or message (wire protocol 6): read by the thread
    /// screen, which this app does not have yet.
    case thread
    /// A session's preview opened, changed or closed.
    case preview(Components.Schemas.PreviewFrame)
    case ignored

    /// `answering`: the envelope's own `requestId`, which an error frame takes
    /// when its payload names none (client.svelte.ts reads it the same way).
    fileprivate init(_ payload: Components.Schemas.FramePayload, _ peek: Inbound.PayloadRoute, answering: String?) {
        switch payload {
        case .instances(let frame):
            self = .instances(frame, hubBuild: peek.hubBuild)
        case .instancesDelta(let frame):
            self = .instancesDelta(frame, hubBuild: peek.hubBuild)
        case .permissionRequest(let frame):
            if let runId = peek.workflowRunId {
                self = .runQuestion(runId: runId, raisedAt: frame.raisedAt)
            } else {
                self = .permissionRequest(frame, routedTo: peek.routedTo)
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
        case .supervisorEvent(let frame):
            self = .supervisorEvent(frame.event)
        case .workflow(let frame):
            self = .workflow(frame)
        case .workItem(let frame):
            self = .workItem(frame.item)
        case .thread_upsert, .thread_message:
            self = .thread
        case .preview(let frame):
            self = .preview(frame)
        default:
            self = .ignored
        }
    }
}
