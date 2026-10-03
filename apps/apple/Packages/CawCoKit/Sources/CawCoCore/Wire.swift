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
}

/// A date the generated types carry as `Date`-or-string: as ms epoch, 0 when absent.
func epochMs(_ date: Date?, _ text: String?) -> Double {
    if let date {
        return date.timeIntervalSince1970 * 1000
    }
    if let text, let date = Wire.parseDate(text) {
        return date.timeIntervalSince1970 * 1000
    }
    return 0
}

extension Components.Schemas.InstanceRow {
    /// When the hub last moved the row, ms epoch (0 when it never said).
    var updatedMs: Double { epochMs(updatedAt?.value1, updatedAt?.value2) }
    /// When the owner last looked at it or archived it, on any device, ms epoch.
    var seenMs: Double { epochMs(seenAt?.value1, seenAt?.value2) }
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
        return .frame(Frame(payload, peek))
    }

    /// A frame payload on its own (a `/api/pending` envelope's payload).
    static func frame(_ data: Data) throws -> Frame {
        let decoder = Wire.decoder()
        let peek = try decoder.decode(PayloadRoute.self, from: data)
        return Frame(try decoder.decode(Components.Schemas.FramePayload.self, from: data), peek)
    }
}

/// A session's parked ask as the hub sends it (`permission_request`).
typealias AskFrame = Components.Schemas.FramePayload.Value8Payload

/// A `FramePayload` by what it is. The generated `anyOf` holds one non-nil
/// variant; each case checks its own variant's `kind`, so a reordered
/// document fails to compile rather than routing a frame to the wrong case.
enum Frame {
    case instances(Components.Schemas.FramePayload.Value6Payload, hubBuild: Components.Schemas.BuildInfo?)
    case instancesDelta(Components.Schemas.FramePayload.Value7Payload, hubBuild: Components.Schemas.BuildInfo?)
    /// A session's ask, and where the hub routed it (`parent`: its delegate's parent answers).
    case permissionRequest(AskFrame, routedTo: String?)
    /// An ask is over, whoever settled it.
    case permissionSettled(Components.Schemas.FramePayload.Value9Payload)
    /// A workflow run's question: answered in its run, never parked as a session's ask.
    case runQuestion(runId: String, raisedAt: Double?)
    case usage(Components.Schemas.FramePayload.Value10Payload)
    case controlResult(Components.Schemas.FramePayload.Value13Payload)
    case error(requestId: String?, message: String)
    case pulse(Components.Schemas.FramePayload.Value16Payload)
    case workflow(Components.Schemas.WorkflowFrame)
    case ignored

    fileprivate init(_ payload: Components.Schemas.FramePayload, _ peek: Inbound.PayloadRoute) {
        if let frame = payload.value6, frame.kind == .instances {
            self = .instances(frame, hubBuild: peek.hubBuild)
        } else if let frame = payload.value7, frame.kind == .instancesDelta {
            self = .instancesDelta(frame, hubBuild: peek.hubBuild)
        } else if let frame = payload.value8, frame.kind == .permissionRequest {
            if let runId = peek.workflowRunId {
                self = .runQuestion(runId: runId, raisedAt: frame.raisedAt)
            } else {
                self = .permissionRequest(frame, routedTo: peek.routedTo)
            }
        } else if let frame = payload.value9, frame.kind == .permissionSettled {
            self = .permissionSettled(frame)
        } else if let frame = payload.value10, frame.kind == .usage {
            self = .usage(frame)
        } else if let frame = payload.value13, frame.kind == .controlResult {
            self = .controlResult(frame)
        } else if let frame = payload.value14, frame.kind == .error {
            self = .error(requestId: frame.requestId, message: frame.message)
        } else if let frame = payload.value16, frame.kind == .pulse {
            self = .pulse(frame)
        } else if let frame = payload.value21 {
            self = .workflow(frame)
        } else {
            self = .ignored
        }
    }
}
