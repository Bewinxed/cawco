public import CawCoAPI
import Foundation
import OpenAPIRuntime

// Moving a project to a machine that has no checkout of it (core move.ts;
// the dashboard's move.svelte.ts). The hub owns each move as a job; this
// app reads what one would take, starts it, and asks the hub to stop or
// retry it. What a job is doing arrives on the `moves` frame (`fleet.moves`).

extension HubConnection {
    public typealias MoveRequest = Operations.PostApiProjectsByIdMoves.Input.Body.JsonPayload

    /// What moving `projectId` to `machineId` takes: whether it is needed,
    /// where it goes, what it fetches, why it can't, and what "Move it" does.
    public func moveEstimate(projectId: String, machineId: String, path: String? = nil) async throws -> Components.Schemas.MoveEstimate {
        let input = Operations.GetApiProjectsByIdMoveEstimate.Input(path: .init(id: projectId), query: .init(machine: machineId, path: path))
        switch try await api.moves.estimate(input) {
        case let .ok(ok):
            return try ok.body.json
        case let .notFound(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .conflict(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .unprocessableContent(refused):
            switch refused.body {
            case let .plainText(text): throw ControlError(message: try await Self.moveText(text))
            case let .applicationProblemJson(problem): throw ControlError(message: problem.detail ?? "The hub refused this move.")
            }
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.moveText(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    /// Move it: the hub records the job and answers it; it runs from there.
    public func startMove(projectId: String, request: MoveRequest) async throws -> Components.Schemas.MoveJob {
        switch try await api.moves.start(.init(path: .init(id: projectId), body: .json(request))) {
        case let .ok(ok):
            return try ok.body.json
        case let .notFound(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .conflict(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .unprocessableContent(refused):
            switch refused.body {
            case let .plainText(text): throw ControlError(message: try await Self.moveText(text))
            case let .applicationProblemJson(problem): throw ControlError(message: problem.detail ?? "The hub refused this move.")
            }
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.moveText(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    /// Cancel: the step in flight stops; the job says what it left on disk
    /// (`kept`). From any stage, failed included, every screen reads it
    /// stopped from the hub's answer on, not from its next frame.
    public func cancelMove(id: String) async throws -> Components.Schemas.MoveJob {
        switch try await api.moves.cancel(.init(path: .init(id: id))) {
        case let .ok(ok):
            let job = try ok.body.json
            fleet.heard(job)
            return job
        case let .notFound(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .conflict(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .unprocessableContent(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.moveText(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    /// Retry: a failed job runs the step it failed at again, and on from there.
    public func retryMove(id: String) async throws {
        switch try await api.moves.retry(.init(path: .init(id: id))) {
        case let .ok(ok):
            fleet.heard(try ok.body.json)
        case let .notFound(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .conflict(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .unprocessableContent(refused):
            throw ControlError(message: try await Self.moveText(try refused.body.plainText))
        case let .undocumented(statusCode, payload):
            throw ControlError(message: try await Self.moveText(payload.body, or: "The hub answered \(statusCode)."))
        }
    }

    private static func moveText(_ body: HTTPBody?, or fallback: String = "The hub refused this move.") async throws -> String {
        await Wire.words(body) ?? fallback
    }
}

extension Components.Schemas.MoveJob {
    /// Where the clone comes from, as a step says it: "the hub", "GitHub", or the host (core `moveSourceName`).
    public var sourceName: String {
        guard let host = from.value2?.host else { return "the hub" }
        return Self.knownHosts[host] ?? host
    }

    /// The clone comes from the hub, the project's own remote.
    public var fromHub: Bool { from.value2 == nil }

    /// When the move was asked for.
    public var created: Date? { Wire.parseDate(createdAt) }

    private static let knownHosts = ["github.com": "GitHub", "gitlab.com": "GitLab", "bitbucket.org": "Bitbucket", "codeberg.org": "Codeberg"]
}

/// Bytes as a move says a size: "640 KB", "340 MB", "2.1 GB" (core `moveSize`).
public func moveSize(_ bytes: Double) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        return (bytes / (1024 * 1024 * 1024)).formatted(.number.precision(.fractionLength(1))) + " GB"
    }
    if bytes >= 1024 * 1024 {
        return "\(Int((bytes / (1024 * 1024)).rounded())) MB"
    }
    return "\(max(1, Int((bytes / 1024).rounded()))) KB"
}
